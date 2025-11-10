const axios = require('axios');

/**
 * Lightweight Spotify Web API client for app-level search using Client Credentials.
 * NOTE: This does NOT access user data or playback. It is suitable for catalog search only.
 */
class SpotifyService {
  constructor(clientId, clientSecret) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  /**
   * Retrieve and cache an app access token using Client Credentials flow.
   */
  async getAppToken() {
    const now = Date.now();
    if (this.token && now < this.tokenExpiresAt - 30_000) {
      return this.token;
    }

    if (!this.clientId || !this.clientSecret) {
      throw new Error('Spotify Client ID/Secret가 설정되지 않았습니다.');
    }

    const authHeader = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');

    const resp = await axios.post('https://accounts.spotify.com/api/token', params, {
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    this.token = resp.data.access_token;
    // expires_in is seconds
    this.tokenExpiresAt = Date.now() + (resp.data.expires_in || 3600) * 1000;
    return this.token;
  }

  /**
   * Search Spotify tracks by text query. Returns minimal normalized data.
   * @param {string} query 
   * @param {number} limit 
   */
  async searchTracks(query, limit = 10) {
    if (!query) throw new Error('검색어를 입력해주세요.');
    const token = await this.getAppToken();

    const resp = await axios.get('https://api.spotify.com/v1/search', {
      headers: { Authorization: `Bearer ${token}` },
      params: { q: query, type: 'track', limit }
    });

    const items = (resp.data?.tracks?.items || []).map(track => ({
      id: track.id,
      title: track.name,
      artists: (track.artists || []).map(a => a.name).join(', '),
      album: track.album?.name || '',
      thumbnailUrl: track.album?.images?.[2]?.url || track.album?.images?.[1]?.url || track.album?.images?.[0]?.url || '',
      durationMs: track.duration_ms,
      explicit: track.explicit,
      externalUrl: track.external_urls?.spotify,
      platform: 'spotify'
    }));

    return items;
  }
}

module.exports = SpotifyService;
