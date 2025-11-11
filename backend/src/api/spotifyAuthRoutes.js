const express = require('express');
const axios = require('axios');
const SpotifyService = require('../services/spotifyService');

const router = express.Router();

// In-memory store (simple prototype; replace with DB in production)
const userTokens = new Map(); // key: Spotify user id, value: { accessToken, refreshToken, expiresAt, profile }

function getRedirectUri() {
  return process.env.SPOTIFY_REDIRECT_URI || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/spotify/callback`; // fallback
}

router.get('/login', (req, res) => {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) return res.status(500).send('Spotify Client ID 미설정');
  const state = Math.random().toString(36).slice(2);
  const scope = [
    'user-read-email',
    'user-read-private'
  ].join(' ');
  const redirectUri = getRedirectUri();
  const authUrl = 'https://accounts.spotify.com/authorize' +
    `?response_type=code&client_id=${encodeURIComponent(clientId)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}`;
  res.json({ authUrl, state });
});

router.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('code가 없습니다.');
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return res.status(500).send('Spotify Client ID/Secret 미설정');
  const redirectUri = getRedirectUri();

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
