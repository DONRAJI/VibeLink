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
  const scope = [
    'user-read-email',
    'user-read-private'
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
  res.json({ authenticated: true, product: info.profile.product });
});

// Export both router and the token map so other routes can validate premium
module.exports = router;
module.exports.userTokens = userTokens;
