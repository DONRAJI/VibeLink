const express = require('express');
const YouTubeService = require('../services/youtubeService');
const SpotifyService = require('../services/spotifyService');

const router = express.Router();

// 통합 검색 API (platform: youtube | spotify)
router.get('/', async (req, res) => {
  const { query: searchQuery, platform = 'youtube', limit, page, pageToken } = req.query;
  console.log(`[search] platform=${platform} query="${searchQuery}" limit=${limit || 10} page=${page || ''} token=${pageToken || ''}`);

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
      const pageNum = Math.max(parseInt(page || '1', 10), 1);
      const lim = Math.min(Math.max(parseInt(limit || '10', 10), 1), 50);
      const offset = (pageNum - 1) * lim;
      const result = await spotifyService.searchTracks(searchQuery, lim, offset);
      const total = result.page?.total || 0;
      const hasNext = offset + lim < total;
      const hasPrev = offset > 0;
      return res.status(200).json({
        items: result.items,
        paging: {
          platform: 'spotify',
          limit: lim,
          page: pageNum,
          total,
          hasNext,
          hasPrev
        }
      });
    }

    // default: youtube
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: 'YouTube API 키가 설정되지 않았습니다.' });
    }
    const youtubeService = new YouTubeService(apiKey);
    const lim = Math.min(Math.max(parseInt(limit || '10', 10), 1), 50);
    const result = await youtubeService.searchVideos(searchQuery, lim, pageToken);
    return res.status(200).json({
      items: result.items,
      paging: {
        platform: 'youtube',
        limit: lim,
        // YouTube는 page 기반이 아니라 token 기반
        pageToken: {
          next: result.nextPageToken || null,
          prev: result.prevPageToken || null,
        },
        hasNext: !!result.nextPageToken,
        hasPrev: !!result.prevPageToken
      }
    });
  } catch (error) {
    console.error('검색 중 오류 발생:', error.message);
    return res.status(500).json({ message: '서버에서 오류가 발생했습니다.' });
  }
});

module.exports = router;
