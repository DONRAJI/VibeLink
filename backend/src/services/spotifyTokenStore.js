const axios = require('axios');

// In-memory token store
const userTokens = new Map();

async function refreshUserToken(userId) {
    const tokenInfo = userTokens.get(userId);
    if (!tokenInfo || !tokenInfo.refreshToken) return null;

    try {
        const params = new URLSearchParams();
        params.append('grant_type', 'refresh_token');
        params.append('refresh_token', tokenInfo.refreshToken);
        params.append('client_id', process.env.SPOTIFY_CLIENT_ID);
        params.append('client_secret', process.env.SPOTIFY_CLIENT_SECRET);

        const response = await axios.post('https://accounts.spotify.com/api/token', params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const { access_token, expires_in, refresh_token } = response.data;
        const newInfo = {
            ...tokenInfo,
            accessToken: access_token,
            expiresAt: Date.now() + expires_in * 1000,
            refreshToken: refresh_token || tokenInfo.refreshToken
        };
        userTokens.set(userId, newInfo);
        console.log(`[TokenStore] Token refreshed for user: ${userId}`);
        return newInfo;
    } catch (error) {
        console.error('[TokenStore] Refresh failed:', error.response?.data || error.message);
        return null;
    }
}

module.exports = {
    userTokens,
    refreshUserToken
};