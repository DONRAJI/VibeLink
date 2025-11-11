const express = require('express');
const axios = require('axios');
const SpotifyService = require('../services/spotifyService');

const router = express.Router();

// In-memory store (simple prototype; replace with DB in production)
const userTokens = new Map(); // key: Spotify user id, value: { accessToken, refreshToken, expiresAt, profile }
const pendingStates = new Map(); // key: state, value: expiresAt (ms)

function pruneStates() {
  const now = Date.now();
  for (const [state, exp] of pendingStates) {
    if (exp <= now) pendingStates.delete(state);
  }
}

function getBackendBase(req) {
  // Trim and strip surrounding quotes if accidentally included
  let envBase = (process.env.BACKEND_URL || '').trim();
  if (envBase.startsWith('"') && envBase.endsWith('"')) {
    envBase = envBase.slice(1, -1);
  }
  if (envBase) {
    return envBase.replace(/\/$/, '');
  }
  const host = req.get('host');
  // Behind proxies req.protocol may be 'http'; enforce https for common managed hosts
  const forceHttps = /onrender\.com$/.test(host) || /vercel\.app$/.test(host);
  const proto = forceHttps ? 'https' : req.protocol;
  return `${proto}://${host}`;
}

function getRedirectUri(req) {
  // Prefer explicit env; otherwise default to backend callback URL
  return process.env.SPOTIFY_REDIRECT_URI || `${getBackendBase(req)}/api/spotify/callback`;
}

router.get('/login', (req, res) => {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) return res.status(500).send('Spotify Client ID 미설정');
  const state = Math.random().toString(36).slice(2);
  // 추가: 스트리밍 및 플레이백 제어 스코프 포함 (웹 플레이백 SDK 및 재생 제어)
  const scope = [
    'user-read-email',
    'user-read-private',
    'streaming',
    'user-read-playback-state',
    'user-modify-playback-state'
  ].join(' ');
  const redirectUri = getRedirectUri(req);
  console.log('[spotify-oauth] computed redirectUri (login):', redirectUri);
  // store state (5 minutes TTL)
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
  console.log('[spotify-oauth] computed redirectUri (callback):', redirectUri);

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

    const userId = profile.id; // Spotify user id
    userTokens.set(userId, {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: Date.now() + (expires_in * 1000),
      profile
    });

    // Tiny HTML page to pass data back to opener
    res.send(`<!DOCTYPE html><html><body><script>
      window.opener && window.opener.postMessage({ type: 'SPOTIFY_AUTH', userId: '${userId}', product: '${profile.product}' }, '*');
      document.write('인증 성공. 이 창은 닫아도 됩니다.');
    </script></body></html>`);
  } catch (e) {
    console.error('[spotify-oauth] callback error', e.response?.status, e.response?.data || e.message);
    res.status(500).send('Spotify OAuth 처리 중 오류');
  }
});

router.get('/status/:userId', (req, res) => {
  const info = userTokens.get(req.params.userId);
  if (!info) return res.status(404).json({ authenticated: false });
  res.json({ authenticated: true, product: info.profile.product, expiresAt: info.expiresAt });
});

// 토큰 갱신 함수
async function refreshUserToken(userId) {
  const info = userTokens.get(userId);
  if (!info || !info.refreshToken) return null;
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
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
    console.error('[spotify-oauth] refresh error', e.response?.status, e.response?.data || e.message);
    return null;
  }
}

// 웹 플레이백 SDK용 액세스 토큰 제공 (만료 시 자동 갱신 시도)
router.get('/playback/:userId', async (req, res) => {
  const { userId } = req.params;
  const info = userTokens.get(userId);
  if (!info) return res.status(404).json({ message: '인증되지 않은 사용자입니다.' });
  if (Date.now() > info.expiresAt - 15_000) {
    // 만료 15초 전이면 갱신 시도
    const refreshed = await refreshUserToken(userId);
    if (!refreshed) return res.status(401).json({ message: '토큰 갱신 실패. 재인증 필요.' });
    return res.json({ accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt });
  }
  return res.json({ accessToken: info.accessToken, expiresAt: info.expiresAt });
});

// Export both router and the token map so other routes can validate premium
module.exports = router;
module.exports.userTokens = userTokens;
