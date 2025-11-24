const axios = require('axios');

module.exports = {
    playTrack: async (accessToken, deviceId, trackUri) => {
        try {
            console.log(`[SpotifyService] Playing ${trackUri} on ${deviceId}`);
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
            console.log(`[SpotifyService] Pausing on ${deviceId}`);
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
