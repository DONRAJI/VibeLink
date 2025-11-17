// api/spotifyAuthRoutes.js (전체 코드)

const express = require('express');
const axios = require('axios');
const SpotifyService = require('../services/spotifyService');
// 공유 저장소에서 userTokens를 가져옵니다.
const userTokens = require('../services/spotifyTokenStore');

const router = express.Router();

const pendingStates = new Map();

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
  const scope = 'user-read-email user-read-private streaming user-read-playback-state user-modify-playback-state';
  const redirectUri = getRedirectUri(req);
  pruneStates();
  pendingStates.set(state, Date.now() + 5 * 60 * 1000);
  const authUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
  res.json({ authUrl, state });
});

router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state || !pendingStates.has(state)) {
    return res.status(400).send('유효하지 않은 요청입니다.');
  }
  pendingStates.delete(state);

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = getRedirectUri(req);
  const params = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });

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
    userTokens.set(profile.id, { accessToken: access_token, refreshToken: refresh_token, expiresAt: Date.now() + expires_in * 1000, profile });
    res.send(`<script>window.opener && window.opener.postMessage({ type: 'SPOTIFY_AUTH', userId: '${profile.id}', product: '${profile.product}' }, '*'); window.close();</script>`);
  } catch (e) {
    console.error('Spotify OAuth 콜백 처리 중 오류:', e.response?.data || e.message);
    res.status(500).send('Spotify OAuth 처리 중 오류');
  }
});

router.get('/status/:userId', (req, res) => {
  const info = userTokens.get(req.params.userId);
  if (!info) return res.json({ authenticated: false });
  res.json({ authenticated: true, product: info.profile.product, userId: info.profile.id });
});

async function refreshUserToken(userId) {
  const info = userTokens.get(userId);
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!info || !info.refreshToken || !clientId || !clientSecret) {
    console.error('[spotify-oauth] 토큰 갱신 실패: 필수 정보 부족');
    return null;
  }
  const params = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: info.refreshToken });
  try {
    const resp = await axios.post('https://accounts.spotify.com/api/token', params, {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    const { access_token, expires_in } = resp.data;
    info.accessToken = access_token;
    info.expiresAt = Date.now() + expires_in * 1000;
    userTokens.set(userId, info);
    return info;
  } catch (e) {
    console.error('Spotify 토큰 갱신 실패:', e.response?.data || e.message);
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
  console.log('--- [API-IN] POST /api/spotify/transfer ---');
  try {
    const { userId, deviceId } = req.body;
    console.log(`[DEBUG] /transfer - Received userId: ${userId}, deviceId: ${deviceId}`);

    if (!userId || !deviceId) {
      console.error('[DEBUG] /transfer - Bad Request: Missing userId or deviceId.');
      return res.status(400).json({ message: '필수 정보 누락' });
    }

    let tokenInfo = userTokens.get(userId);
    console.log(`[DEBUG] /transfer - Found token info in store: ${tokenInfo ? 'Yes' : 'No'}`);
    if (!tokenInfo) {
      return res.status(404).json({ message: '인증 정보 없음' });
    }

    if (Date.now() > tokenInfo.expiresAt - 15_000) {
      console.log('[DEBUG] /transfer - Token expired or expiring soon. Refreshing...');
      tokenInfo = await refreshUserToken(userId);
      if (!tokenInfo) {
        console.error('[DEBUG] /transfer - Token refresh failed.');
        return res.status(401).json({ message: '토큰 갱신 실패' });
      }
    }

    // 기기 목록 조회 후 대상 기기 존재 여부 확인
    let devicesResp;
    try {
      devicesResp = await axios.get('https://api.spotify.com/v1/me/player/devices', {
        headers: { 'Authorization': `Bearer ${tokenInfo.accessToken}` }
      });
    } catch (devErr) {
      console.error('[DEBUG] /transfer - devices fetch failed', devErr.response?.status, devErr.response?.data || devErr.message);
      return res.status(devErr.response?.status || 500).json({ message: '디바이스 목록 조회 실패', detail: devErr.response?.data || devErr.message });
    }
    const devices = devicesResp.data.devices || [];
    const targetDevice = devices.find(d => d.id === deviceId);
    if (!targetDevice) {
      console.warn('[DEBUG] /transfer - target device id not found in devices list');
      return res.status(404).json({ code: 'DEVICE_NOT_FOUND', message: '제공된 deviceId를 가진 디바이스를 찾을 수 없습니다.' });
    }
    console.log(`[DEBUG] /transfer - targetDevice active=${targetDevice.is_active}`);

    console.log('[DEBUG] /transfer - Calling Spotify API to transfer playback...');
    try {
      await axios.put('https://api.spotify.com/v1/me/player',
        { device_ids: [deviceId], play: false },
        { headers: { 'Authorization': `Bearer ${tokenInfo.accessToken}` } }
      );
      console.log('[DEBUG] /transfer - Spotify API call successful.');
      return res.status(204).send();
    } catch (spotifyErr) {
      const status = spotifyErr.response?.status;
      const data = spotifyErr.response?.data;
      console.error('[DEBUG] /transfer - Spotify transfer error', status, data || spotifyErr.message);
      if (status === 404) {
        return res.status(404).json({ code: 'NO_ACTIVE_DEVICE', message: '활성화된 Spotify 플레이어 컨텍스트가 없습니다. 먼저 재생을 시작하거나 다른 기기에서 곡을 재생하세요.' });
      }
      return res.status(status || 500).json({ message: 'Spotify 전송 실패', detail: data || spotifyErr.message });
    }
  } catch (error) {
    console.error('--- ❌ [API-ERROR] /api/spotify/transfer (unhandled) ---');
    if (error.response) {
      console.error('Data:', error.response.data);
      console.error('Status:', error.response.status);
      console.error('Headers:', error.response.headers);
      return res.status(error.response.status).json(error.response.data);
    } else if (error.request) {
      console.error('Request:', error.request);
    } else {
      console.error('Error Message:', error.message);
    }
    console.error('Full Error Object:', error);
    res.status(500).json({ message: '장치 활성화 중 서버 내부 오류 발생' });
  }
});

// 디바이스 목록 조회 (진단용)
router.get('/devices/:userId', async (req, res) => {
  const { userId } = req.params;
  const info = userTokens.get(userId);
  if (!info) return res.status(404).json({ message: '인증 정보 없음' });
  try {
    // 기기 목록 가져오기
    const devResp = await axios.get('https://api.spotify.com/v1/me/player/devices', {
      headers: { 'Authorization': `Bearer ${info.accessToken}` }
    });
    res.json({ devices: devResp.data.devices || [] });
  } catch (e) {
    console.error('[spotify-oauth] devices fetch error', e.response?.status, e.response?.data || e.message);
    res.status(e.response?.status || 500).json({ message: '디바이스 목록 조회 실패', detail: e.response?.data || e.message });
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
    console.error('Spotify 재생 요청 실패:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ message: '재생 요청 실패' });
  }
});

// 재생 상태 조회 (진단용): 현재 디바이스/곡/재생 여부 확인
router.get('/playback-state/:userId', async (req, res) => {
  const { userId } = req.params;
  let info = userTokens.get(userId);
  if (!info) return res.status(404).json({ message: '인증 정보 없음' });
  if (Date.now() > info.expiresAt - 15_000) {
    info = await refreshUserToken(userId);
    if (!info) return res.status(401).json({ message: '토큰 갱신 실패' });
  }
  try {
    const resp = await axios.get('https://api.spotify.com/v1/me/player', {
      headers: { 'Authorization': `Bearer ${info.accessToken}` }
    });
    res.json(resp.data || {});
  } catch (e) {
    console.error('[spotify-oauth] playback-state fetch error', e.response?.status, e.response?.data || e.message);
    res.status(e.response?.status || 500).json({ message: '재생 상태 조회 실패', detail: e.response?.data || e.message });
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
    console.error(`Spotify '${action}' 제어 실패:`, error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ message: `Spotify '${action}' 요청 실패` });
  }
});

module.exports = router;