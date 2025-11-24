const axios = require('axios');
const { userTokens, refreshUserToken } = require('../api/spotifyAuthRoutes'); // We might need to refactor token storage too, but for now import it if possible. 
// Actually, spotifyAuthRoutes exports router. We need to move token management to a shared place or export it.
// Let's assume we can move userTokens to a shared module or pass it in.
// For now, I will create a service that accepts the token or handles retrieval if I can access the map.

// Better approach: Move userTokens and refresh logic to a dedicated module 'tokenManager.js' or similar, 
// but to minimize disruption, I'll try to access them or replicate the logic safely.

// Wait, spotifyAuthRoutes.js is an Express router. It's hard to import variables from it if they are not exported.
// I should check spotifyAuthRoutes.js exports first.

module.exports = {
  playTrack: async (accessToken, deviceId, trackUri) => {
    try {
      await axios.put(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
        { uris: [trackUri] },
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      return true;
    } catch (error) {
      console.error('[SpotifyService] Play error:', error.response?.data || error.message);
      throw error;
    }
  },

  pauseTrack: async (accessToken, deviceId) => {
    try {
      await axios.put(`https://api.spotify.com/v1/me/player/pause?device_id=${deviceId}`,
        {},
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      return true;
    } catch (error) {
      console.error('[SpotifyService] Pause error:', error.response?.data || error.message);
      throw error;
    }
  }
};
