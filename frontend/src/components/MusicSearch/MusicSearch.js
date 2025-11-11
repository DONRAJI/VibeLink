import React, { useState, useCallback } from 'react';
import axios from 'axios';
import './MusicSearch.css';

// 백엔드 URL 환경변수
const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

const MusicSearch = ({ onAddTrack, currentRoom, nickname, forcedPlatform }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [platform, setPlatform] = useState(forcedPlatform || 'youtube'); // 'youtube' | 'spotify'
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastSearchTime, setLastSearchTime] = useState(0);

  const handleSearch = useCallback(async () => {
    const trimmedQuery = searchQuery.trim();
    
    // 입력 검증
    if (!trimmedQuery) {
      setError('검색어를 입력해주세요.');
      return;
    }

    if (trimmedQuery.length < 2) {
      setError('검색어는 2글자 이상이어야 합니다.');
      return;
    }

    if (!currentRoom) {
      setError('먼저 방에 참가해야 합니다.');
      return;
    }

    // 연속 검색 방지 (1초 간격)
    const now = Date.now();
    if (now - lastSearchTime < 1000) {
      setError('너무 빠른 검색입니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    setIsLoading(true);
    setError('');
    setLastSearchTime(now);

    try {
      const response = await axios.get(`${API_BASE_URL}/api/search?query=${encodeURIComponent(trimmedQuery)}&platform=${platform}`, {
        timeout: 15000 // 15초 타임아웃
      });
      
      setSearchResults(response.data);
      
      if (response.data.length === 0) {
        setError('검색 결과가 없습니다. 다른 검색어를 시도해보세요.');
      }
    } catch (error) {
      console.error('검색 중 오류 발생:', error);
      
      if (error.code === 'ECONNABORTED') {
        setError('검색 시간이 초과되었습니다. 다시 시도해주세요.');
      } else if (error.response?.status === 500) {
        setError('서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      } else {
        setError('검색 중 오류가 발생했습니다. 네트워크를 확인해주세요.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, currentRoom, lastSearchTime, platform]);

  // YouTube 결과는 그대로 추가, Spotify 결과는 유사한 YouTube 영상으로 변환 후 추가
  const handleAddTrack = useCallback(async (track) => {
    try {
      if (platform === 'youtube') {
        onAddTrack(track);
      } else {
        // Spotify 트랙을 그대로 큐에 추가 (네이티브 재생)
        const enriched = {
          ...track,
          uri: track.uri || (track.id ? `spotify:track:${track.id}` : undefined),
          platform: 'spotify'
        };
        onAddTrack(enriched);
      }

      // 성공적인 추가 후 검색 결과 정리
      setSearchResults([]);
      setSearchQuery('');
      setError('');
    } catch (e) {
      setError('트랙 추가 중 오류가 발생했습니다.');
    }
  }, [onAddTrack, platform]);

  // forcedPlatform 변경 시 내부 state 동기화
  React.useEffect(() => {
    if (forcedPlatform && forcedPlatform !== platform) {
      setPlatform(forcedPlatform);
    }
  }, [forcedPlatform, platform]);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="music-search">
      <div className="search-header">
        <h3>🎵 음악 검색</h3>
        <p>{platform === 'youtube' ? 'YouTube에서 원하는 음악을 검색하고 플레이리스트에 추가하세요.' : 'Spotify 트랙을 검색해 플레이리스트에 추가하세요.'}</p>
      </div>

      <div className="search-form">
        <div className="search-input-group">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="듣고 싶은 노래를 검색하세요..."
            className="search-input"
            disabled={!currentRoom}
          />
          <button
            onClick={handleSearch}
            disabled={!currentRoom || isLoading || !searchQuery.trim()}
            className="search-btn"
          >
            {isLoading ? (
              <span className="loading-spinner">⏳</span>
            ) : (
              '🔍 검색'
            )}
          </button>
          {!forcedPlatform && (
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="platform-select"
              disabled={!currentRoom || isLoading}
              title="검색 플랫폼 선택"
            >
              <option value="youtube">YouTube</option>
              <option value="spotify">Spotify</option>
            </select>
          )}
        </div>
        
        {!currentRoom && (
          <div className="room-warning">
            ⚠️ 음악을 검색하려면 먼저 방에 참가해야 합니다.
          </div>
        )}
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {searchResults.length > 0 && (
        <div className="search-results">
          <h4>검색 결과 ({searchResults.length})</h4>
          <div className="results-list">
            {searchResults.map((track) => (
              <div key={track.videoId || track.id} className="result-item">
                <div className="result-thumbnail">
                  <img 
                    src={track.thumbnailUrl} 
                    alt={track.title}
                    onError={(e) => {
                      e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA4MCA2MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjYwIiBmaWxsPSIjRjVGNUY1Ii8+CjxwYXRoIGQ9Ik0yOCAyMEw1MiAzMEwyOCA0MFYyMFoiIGZpbGw9IiM5OTk5OTkiLz4KPC9zdmc+';
                    }}
                  />
                </div>
                
                <div className="result-info">
                  <h5 className="result-title">{track.title}</h5>
                  <div className="result-meta">
                    {platform === 'youtube' ? (
                      <>
                        <span className="result-source">YouTube</span>
                        <span className="result-id">ID: {track.videoId}</span>
                      </>
                    ) : (
                      <>
                        <span className="result-source">Spotify</span>
                        <span className="result-id">ID: {track.id}</span>
                        {track.artists && <span className="result-artists">👤 {track.artists}</span>}
                      </>
                    )}
                  </div>
                </div>
                
                <button
                  className="add-btn"
                  onClick={() => handleAddTrack(track)}
                  disabled={!currentRoom}
                >
                  ➕ 추가
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MusicSearch;
