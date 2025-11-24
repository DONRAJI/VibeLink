const express = require('express');
const axios = require('axios');
const SpotifyService = require('../services/spotifyService');
const { userTokens, refreshUserToken } = require('../services/spotifyTokenStore');

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
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/callback?error=invalid_state`);
  }
  pendingStates.delete(state);
  try {
    const redirectUri = getRedirectUri(req);
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', redirectUri);
    params.append('client_id', process.env.SPOTIFY_CLIENT_ID);
    params.append('client_secret', process.env.SPOTIFY_CLIENT_SECRET);
    const tokenRes = await axios.post('https://accounts.spotify.com/api/token', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    const { access_token, refresh_token, expires_in } = tokenRes.data;
    const userRes = await axios.get('https://api.spotify.com/v1/me', {
      headers: { 'Authorization': `Bearer ${access_token}` }
    });
    const userId = userRes.data.id;
    const email = userRes.data.email;
    const product = userRes.data.product;
    userTokens.set(userId, {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: Date.now() + expires_in * 1000,
      email,
      product
    });
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/callback?success=true&userId=${userId}&email=${email}&product=${product}`);
  } catch (error) {
    console.error('Spotify Callback Error:', error.response?.data || error.message);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/callback?error=auth_failed`);
  }
});

router.get('/status/:userId', (req, res) => {
  const info = userTokens.get(req.params.userId);
  if (!info) return res.json({ authenticated: false });
  res.json({ authenticated: true, product: info.profile?.product || info.product, userId: req.params.userId });
});

router.get('/playback/:userId', async (req, res) => {
  const { userId } = req.params;
  let tokenInfo = userTokens.get(userId);
  if (!tokenInfo) return res.status(404).json({ message: '토큰 정보 없음' });
  if (Date.now() > tokenInfo.expiresAt - 60000) {
    tokenInfo = await refreshUserToken(userId);
    if (!tokenInfo) return res.status(401).json({ message: '토큰 갱신 실패' });
  }
  res.json({ accessToken: tokenInfo.accessToken });
});

router.post('/play', async (req, res) => {
  const { userId, deviceId, trackUri } = req.body;
  console.log(`[DEBUG] POST /play - userId: ${userId}, deviceId: ${deviceId}, trackUri: ${trackUri}`);

  if (!userId || !deviceId || !trackUri) {
    return res.status(400).json({ message: '필수 정보 누락' });
  }
  try {
    let tokenInfo = userTokens.get(userId);
    if (!tokenInfo) return res.status(404).json({ message: '인증 정보 없음' });

    if (Date.now() > tokenInfo.expiresAt - 15_000) {
      tokenInfo = await refreshUserToken(userId);
      if (!tokenInfo) return res.status(401).json({ message: '토큰 갱신 실패' });
    }

    await SpotifyService.playTrack(tokenInfo.accessToken, deviceId, trackUri);
    console.log('[DEBUG] /play - Spotify API request successful (204)');
    res.status(204).send();
  } catch (error) {
    res.status(error.response?.status || 500).json({ message: '재생 요청 실패', detail: error.response?.data });
  }
});

router.post('/control', async (req, res) => {
  const { userId, deviceId, action } = req.body;
  console.log(`[DEBUG] POST /control - action: ${action}`);

  try {
    let tokenInfo = userTokens.get(userId);
    if (!tokenInfo) return res.status(404).json({ message: '인증 정보 없음' });

    if (Date.now() > tokenInfo.expiresAt - 15_000) {
      tokenInfo = await refreshUserToken(userId);
    }

    if (action === 'pause') {
      await SpotifyService.pauseTrack(tokenInfo.accessToken, deviceId);
    } else if (action === 'resume') {
      await axios.put(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
        {},
        { headers: { 'Authorization': `Bearer ${tokenInfo.accessToken}` } }
      );
    } else if (action === 'previous') {
      await axios.post(`https://api.spotify.com/v1/me/player/previous?device_id=${deviceId}`,
        {},
        { headers: { 'Authorization': `Bearer ${tokenInfo.accessToken}` } }
      );
    }
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Control failed' });
  }
});

router.post('/transfer', async (req, res) => {
  // Transfer logic remains similar but using shared token store
  // For brevity, keeping it simple or using axios directly as before
  // ... (omitted for now to focus on play/control, but should be kept if needed)
  // Re-implementing basic transfer for completeness
  const { userId, deviceId } = req.body;
  if (!userId || !deviceId) return res.status(400).json({ message: 'Missing fields' });

  let tokenInfo = userTokens.get(userId);
  if (!tokenInfo) return res.status(404).json({ message: 'No auth info' });

  try {
    await axios.put('https://api.spotify.com/v1/me/player',
      { device_ids: [deviceId], play: false },
      { headers: { 'Authorization': `Bearer ${tokenInfo.accessToken}` } }
    );
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ message: 'Transfer failed' });
  }
});

module.exports = router;