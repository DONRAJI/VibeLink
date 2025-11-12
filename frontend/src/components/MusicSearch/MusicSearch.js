// MusicSearch.js (전체 교체)

import React, { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import './MusicSearch.css';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

// --- [수정] --- forcedPlatform prop 받기
const MusicSearch = ({ onAddTrack, currentRoom, nickname, forcedPlatform }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  // --- [수정] --- 내부 platform 상태의 초기값을 forcedPlatform으로 설정
  const [platform, setPlatform] = useState(forcedPlatform || 'youtube');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastSearchTime, setLastSearchTime] = useState(0);

  // --- [핵심 추가] --- 방의 플랫폼이 변경되면 내부 상태도 동기화
  useEffect(() => {
    if (forcedPlatform) {
      setPlatform(forcedPlatform);
    }
  }, [forcedPlatform]);


  const handleSearch = useCallback(async () => {
    // ... (내부 검색 로직은 변경 없음)
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery || trimmedQuery.length < 2) {
      setError('검색어는 2글자 이상이어야 합니다.');
      return;
    }
    if (!currentRoom) {
      setError('먼저 방에 참가해야 합니다.');
      return;
    }
    const now = Date.now();
    if (now - lastSearchTime < 1000) {
      return; // 너무 빠른 검색은 조용히 무시
    }

    setIsLoading(true);
    setError('');
    setLastSearchTime(now);

    try {
      // 이제 platform 상태는 forcedPlatform에 의해 올바르게 설정되어 있음
      const response = await axios.get(`${API_BASE_URL}/api/search?query=${encodeURIComponent(trimmedQuery)}&platform=${platform}`);
      setSearchResults(response.data);
      if (response.data.length === 0) {
        setError('검색 결과가 없습니다.');
      }
    } catch (err) {
      setError(err.response?.data?.message || '검색 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, currentRoom, lastSearchTime, platform]);

  const handleAddTrack = useCallback((track) => {
    // --- [수정] --- 이제 platform 상태가 항상 정확하므로 로직 단순화 가능
    const trackToAdd = {
      ...track,
      platform: platform, // 현재 플랫폼 명시
      addedBy: nickname,
    };
    onAddTrack(trackToAdd);
    setSearchResults([]);
    setSearchQuery('');
  }, [onAddTrack, platform, nickname]);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="music-search">
      <div className="search-header">
        <h3>🎵 음악 검색</h3>
        {/* --- [수정] --- 방 플랫폼에 따라 안내 문구 변경 */}
        <p>
          현재 방은 <strong>{platform === 'youtube' ? 'YouTube' : 'Spotify'}</strong> 전용입니다.<br/>
          플레이리스트에 추가할 음악을 검색하세요.
        </p>
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
            {isLoading ? '⏳' : '🔍 검색'}
          </button>
          
          {/* --- [핵심 수정] --- forcedPlatform이 있을 경우, 플랫폼 선택 UI를 렌더링하지 않음! */}
          {!forcedPlatform && (
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="platform-select"
              disabled={!currentRoom || isLoading}
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

      {error && <div className="error-message">{error}</div>}

      {searchResults.length > 0 && (
        <div className="search-results">
          <h4>검색 결과 ({searchResults.length})</h4>
          <div className="results-list">
            {searchResults.map((track) => (
              <div key={track.videoId || track.id} className="result-item">
                <div className="result-thumbnail">
                  <img src={track.thumbnailUrl} alt={track.title} />
                </div>
                <div className="result-info">
                  <h5 className="result-title">{track.title}</h5>
                  <div className="result-meta">
                    <span className="result-source">{platform === 'youtube' ? 'YouTube' : 'Spotify'}</span>
                    {platform === 'spotify' && track.artists && <span className="result-artists">👤 {track.artists}</span>}
                  </div>
                </div>
                <button className="add-btn" onClick={() => handleAddTrack(track)} disabled={!currentRoom}>
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