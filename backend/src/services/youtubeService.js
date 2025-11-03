const axios = require('axios');

class YouTubeService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://www.googleapis.com/youtube/v3';
  }

  async searchVideos(query, maxResults = 10) {
    try {
      if (!this.apiKey) {
        throw new Error('YouTube API 키가 설정되지 않았습니다.');
      }

      if (!query) {
        throw new Error('검색어를 입력해주세요.');
      }

      console.log('YouTube API 서버에 요청을 보냅니다...');

      const response = await axios.get(`${this.baseUrl}/search`, {
        params: {
          part: 'snippet',
          q: query,
          type: 'video',
          maxResults,
          key: this.apiKey,
        },
      });

      console.log('YouTube API로부터 응답을 성공적으로 받았습니다!');

      return response.data.items.map(item => ({
        videoId: item.id.videoId,
        title: item.snippet.title,
        thumbnailUrl: item.snippet.thumbnails.default.url,
      }));
    } catch (error) {
      console.error('YouTube 검색 중 오류 발생:', error.message);
      throw error;
    }
  }
}

module.exports = YouTubeService;
