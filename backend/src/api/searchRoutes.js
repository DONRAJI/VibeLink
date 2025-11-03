const express = require('express');
const YouTubeService = require('../services/youtubeService');

const router = express.Router();

// YouTube 검색 API
router.get('/', async (req, res) => {
  console.log('1. 프론트엔드로부터 검색 요청을 받았습니다. 검색어:', req.query.query);

  try {
    const searchQuery = req.query.query;
    if (!searchQuery) {
      return res.status(400).send({ message: '검색어를 입력해주세요.' });
    }

    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      return res.status(500).send({ message: 'YouTube API 키가 설정되지 않았습니다.' });
    }

    const youtubeService = new YouTubeService(apiKey);
    const items = await youtubeService.searchVideos(searchQuery);

    res.status(200).json(items);
  } catch (error) {
    console.error('검색 중 오류 발생:', error.message);
    res.status(500).send({ message: '서버에서 오류가 발생했습니다.' });
  }
});

module.exports = router;
