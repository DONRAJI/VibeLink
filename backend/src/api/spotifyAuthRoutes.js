const express = require('express');
const axios = require('axios');
const SpotifyService = require('../services/spotifyService');
const userTokens = require('../services/spotifyTokenStore');

const router = express.Router();

// In-memory store (simple prototype; replace with DB in production)
const pendingStates = new Map(); // key: state, value: expiresAt (ms)

// --- [핵심 수정] --- 자기 자신을 require 하던 코드를 완전히 제거했습니다. ---

function pruneStates() {
  const now = Date.now();
  for (const [state, exp] of pendingStates) {
    if (exp <= now) pendingStates.delete(state);
  }
}

function getBackendBase(req) {
  let envBase = (process.env.BACKEND_URL || '').trim();
  if (envBase.startsWith('"') && envBase.endsWith('"')) {
    envBase = envBase.slice(1, -1);
  }
  if (envBase) {
    return envBase.replace(/\/$/, '');
  }
  const host = req.get('host');
  const forceHttps = /onrender\.com$/.test(host) || /vercel\.app$/.test(host);
  const proto = forceHttps ? 'https' : req.protocol;
  return `${proto}://${host}`;
}

function getRedirectUri(req) {
  return process.env.SPOTIFY_REDIRECT_URI || `${getBackendBase(req)}/api/spotify/callback`;
}

router.get('/login', (req, res) => {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) return res.status(500).send('Spotify Client ID 미설정');
  const state = Math.random().toString(36).slice(2);
  const scope = [
    'user-read-email',
    'user-read-private',
    'streaming',
    'user-read-playback-state',
    'user-modify-playback-state'
  ].join(' ');
  const redirectUri = getRedirectUri(req);
  pruneStates();
  pendingStates.set(state, Date.now() + 5 * 60 * 1000);
  const authUrl = 'https://accounts.spotify.com/authorize' +
    `?response_type=code&client_id=${encodeURIComponent(clientId)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}`;
  res.json({ authUrl, state });
});

router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send('code가 없습니다.');
  pruneStates();
  if (!state || !pendingStates.has(state)) {
    return res.status(400).send('invalid state');
  }
  pendingStates.delete(state);
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return res.status(500).send('Spotify Client ID/Secret 미설정');
  const redirectUri = getRedirectUri(req);

  const params = new URLSearchParams();
  params.append('grant_type', 'authorization_code');
  params.append('code', code);
  params.append('redirect_uri', redirectUri);

  try {
    const tokenResp = await axios.post('https://accounts.spotify.com/api/token', params, {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    const { access_token, refresh_token, expires_in } = tokenResp.data;

    const service = new SpotifyService(clientId, clientSecret);
    const profile = await service.getUserProfile(access_token);

    const userId = profile.id;
    userTokens.set(userId, {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: Date.now() + (expires_in * 1000),
      profile
    });

    res.send(`<!DOCTYPE html><html><body><script>
      window.opener && window.opener.postMessage({ type: 'SPOTIFY_AUTH', userId: '${userId}', product: '${profile.product}' }, '*');
      document.write('인증 성공. 이 창은 닫아도 됩니다.');
    </script></body></html>`);
  } catch (e) {
    res.status(500).send('Spotify OAuth 처리 중 오류');
  }
});

router.get('/status/:userId', (req, res) => {
  const { userId } = req.params;
  const info = userTokens.get(userId);
  if (!info) {
    return res.status(200).json({ authenticated: false, message: '인증 정보 없음' });
  }
  res.status(200).json({
    authenticated: true,
    product: info.profile.product,
    userId: info.profile.id,
  });
});

async function refreshUserToken(userId) {
  const info = userTokens.get(userId);
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!info || !info.refreshToken || !clientId || !clientSecret) {
    return null;
  }
  const params = new URLSearchParams();
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', info.refreshToken);
  try {
    const resp = await axios.post('https://accounts.spotify.com/api/token', params, {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    const { access_token, expires_in } = resp.data;
    info.accessToken = access_token;
    info.expiresAt = Date.now() + (expires_in * 1000);
    userTokens.set(userId, info);
    return info;
  } catch (e) {
    return null;
  }
}

router.get('/playback/:userId', async (req, res) => {
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    return res.status(500).json({ message: '서버에 Spotify 환경 변수가 설정되지 않았습니다.' });
  }
  const { userId } = req.params;
  const info = userTokens.get(userId);
  if (!info) return res.status(404).json({ message: '인증되지 않은 사용자입니다.' });
  if (Date.now() > info.expiresAt - 15_000) {
    const refreshed = await refreshUserToken(userId);
    if (!refreshed) return res.status(401).json({ message: '토큰 갱신에 실패했습니다.' });
    return res.json({ accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt });
  }
  return res.json({ accessToken: info.accessToken, expiresAt: info.expiresAt });
});

router.post('/transfer', async (req, res) => {
  const { userId, deviceId } = req.body;
  if (!userId || !deviceId) return res.status(400).json({ message: '필수 정보 누락' });
  try {
    let tokenInfo = userTokens.get(userId);
    if (!tokenInfo) return res.status(404).json({ message: '인증 정보 없음' });
    if (Date.now() > tokenInfo.expiresAt - 15_000) {
      tokenInfo = await refreshUserToken(userId);
      if (!tokenInfo) return res.status(401).json({ message: '토큰 갱신 실패' });
    }
    await axios.put('https://api.spotify.com/v1/me/player',
      { device_ids: [deviceId], play: false },
      { headers: { 'Authorization': `Bearer ${tokenInfo.accessToken}` } }
    );
    res.status(204).send();
  } catch (error) {
    res.status(error.response?.status || 500).json({ message: '장치 활성화 실패' });
  }
});

router.post('/play', async (req, res) => {
  const { userId, deviceId, trackUri } = req.body;
  if (!userId || !deviceId || !trackUri) return res.status(400).json({ message: '필수 정보 누락' });
  try {
    let tokenInfo = userTokens.get(userId);
    if (!tokenInfo) return res.status(404).json({ message: '인증 정보 없음' });
    if (Date.now() > tokenInfo.expiresAt - 15_000) {
      tokenInfo = await refreshUserToken(userId);
      if (!tokenInfo) return res.status(401).json({ message: '토큰 갱신 실패' });
    }
    await axios.put(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
      { uris: [trackUri] },
      { headers: { 'Authorization': `Bearer ${tokenInfo.accessToken}` } }
    );
    res.status(204).send();
  } catch (error) {
    res.status(error.response?.status || 500).json({ message: '재생 요청 실패' });
  }
});

router.post('/control', async (req, res) => {
  const { userId, deviceId, action } = req.body;
  if (!userId || !action) {
    return res.status(400).json({ message: '필수 정보 누락' });
  }
  try {
    let tokenInfo = userTokens.get(userId);
    if (!tokenInfo) return res.status(404).json({ message: '인증 정보 없음' });
    if (Date.now() > tokenInfo.expiresAt - 15_000) {
      tokenInfo = await refreshUserToken(userId);
      if (!tokenInfo) return res.status(401).json({ message: '토큰 갱신 실패' });
    }
    const { accessToken } = tokenInfo;
    let endpoint = '';
    let method = 'PUT';
    switch (action) {
      case 'pause': endpoint = 'pause'; break;
      case 'resume': endpoint = 'play'; break;
      case 'next': endpoint = 'next'; method = 'POST'; break;
      case 'previous': endpoint = 'previous'; method = 'POST'; break;
      default: return res.status(400).json({ message: '유효하지 않은 action' });
    }
    const url = `https://api.spotify.com/v1/me/player/${endpoint}?device_id=${deviceId || ''}`;
    await axios({
      method: method,
      url: url,
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    res.status(204).send();
  } catch (error) {
    res.status(error.response?.status || 500).json({ message: `Spotify '${action}' 요청 실패` });
  }
});

module.exports = router;