const axios = require('axios');

class YouTubeService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://www.googleapis.com/youtube/v3';
  }

  async searchVideos(query, maxResults = 10, pageToken) {
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
          pageToken,
          key: this.apiKey,
        },
      });

      console.log('YouTube API로부터 응답을 성공적으로 받았습니다!');
      const items = response.data.items.map(item => ({
        videoId: item.id.videoId,
        title: item.snippet.title,
        thumbnailUrl: item.snippet.thumbnails.default.url,
        description: item.snippet.description,
        channelTitle: item.snippet.channelTitle,
        publishedAt: item.snippet.publishedAt,
      }));

      return {
        items,
        nextPageToken: response.data.nextPageToken || null,
        prevPageToken: response.data.prevPageToken || null,
      };
    } catch (error) {
      console.error('YouTube 검색 중 오류 발생:', error.message);
      throw error;
    }
  }

  async checkVideoEmbeddable(videoId) {
    try {
      if (!this.apiKey) {
        throw new Error('YouTube API 키가 설정되지 않았습니다.');
      }

      console.log('비디오 재생 가능성 확인:', videoId);

      const response = await axios.get(`${this.baseUrl}/videos`, {
        params: {
          part: 'status',
          id: videoId,
          key: this.apiKey,
        },
      });

      if (response.data.items.length === 0) {
        return { embeddable: false, reason: '비디오를 찾을 수 없습니다.' };
      }

      const video = response.data.items[0];
      const isEmbeddable = video.status.embeddable;

      return {
        embeddable: isEmbeddable,
        reason: isEmbeddable ? '재생 가능' : '외부 사이트 재생 제한',
        uploadStatus: video.status.uploadStatus,
        privacyStatus: video.status.privacyStatus
      };
    } catch (error) {
      console.error('비디오 확인 중 오류 발생:', error.message);
      return { embeddable: false, reason: error.message };
    }
  }

  // 관련 동영상 추천 (relatedToVideoId 기반)
  async getRelatedVideos(videoId, maxResults = 10) {
    try {
      if (!this.apiKey) {
        throw new Error('YouTube API 키가 설정되지 않았습니다.');
      }
      if (!videoId) {
        throw new Error('videoId가 필요합니다.');
      }

      const response = await axios.get(`${this.baseUrl}/search`, {
        params: {
          part: 'snippet',
          relatedToVideoId: videoId,
          type: 'video',
          maxResults,
          key: this.apiKey,
        },
      });

      return (response.data.items || [])
        .filter(item => item?.id?.videoId)
        .map(item => ({
          videoId: item.id.videoId,
          title: item.snippet.title,
          thumbnailUrl: item.snippet.thumbnails?.default?.url || '',
          description: item.snippet.description,
          channelTitle: item.snippet.channelTitle,
          publishedAt: item.snippet.publishedAt,
        }));
    } catch (error) {
      console.error('YouTube 관련 영상 조회 중 오류 발생:', error.message);
      throw error;
    }
  }
}

module.exports = YouTubeService;
