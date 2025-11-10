const express = require('express');
const YouTubeService = require('../services/youtubeService');
const SpotifyService = require('../services/spotifyService');

const router = express.Router();

// 통합 검색 API (platform: youtube | spotify)
router.get('/', async (req, res) => {
  const { query: searchQuery, platform = 'youtube' } = req.query;
  console.log(`[search] platform=${platform} query="${searchQuery}"`);

  try {
    if (!searchQuery) {
      return res.status(400).json({ message: '검색어를 입력해주세요.' });
    }

    if (platform === 'spotify') {
      const clientId = process.env.SPOTIFY_CLIENT_ID;
      const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        return res.status(500).json({ message: 'Spotify Client ID/Secret이 설정되지 않았습니다.' });
      }
      const spotifyService = new SpotifyService(clientId, clientSecret);
      const items = await spotifyService.searchTracks(searchQuery);
      return res.status(200).json(items);
    }

    // default: youtube
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: 'YouTube API 키가 설정되지 않았습니다.' });
    }
    const youtubeService = new YouTubeService(apiKey);
    const items = await youtubeService.searchVideos(searchQuery);
    return res.status(200).json(items);
  } catch (error) {
    console.error('검색 중 오류 발생:', error.message);
    return res.status(500).json({ message: '서버에서 오류가 발생했습니다.' });
  }
});

module.exports = router;
