// MusicSearch.js (전체 교체)

import React, { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import './MusicSearch.css';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

// --- [수정] --- forcedPlatform prop 받기
const MusicSearch = ({ onAddTrack, currentRoom, nickname, forcedPlatform }) => {
  const restoredQuery = (() => {
    try { return sessionStorage.getItem('searchQuery') || ''; } catch { return ''; }
  })();
  const initialPlatform = forcedPlatform || 'youtube';
  const initialResults = (() => {
  const initialPlatform = forcedPlatform || 'youtube';
  const initialResults = (() => {
    try {
      const key = `searchResults:${currentRoom || 'no-room'}:${initialPlatform}:${(restoredQuery || '').trim()}:1`;
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  })();
  // --- [수정] --- 내부 platform 상태의 초기값을 forcedPlatform으로 설정
  const [platform, setPlatform] = useState(initialPlatform);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastSearchTime, setLastSearchTime] = useState(0);

  const [pageIndex, setPageIndex] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const pageCacheRef = useRef({ 1: initialResults }); // {page: items}
  const ytTokensRef = useRef({ 1: { next: null, prev: null } }); // {page: {next, prev}}
  // --- [핵심 추가] --- 방의 플랫폼이 변경되면 내부 상태도 동기화
  useEffect(() => {
    if (forcedPlatform) {
      setPlatform(forcedPlatform);
      // 플랫폼 변경 시 동일 쿼리에 대한 캐시된 결과가 있으면 복원
      try {
        const key = `searchResults:${currentRoom || 'no-room'}:${forcedPlatform}:${(searchQuery || '').trim()}:1`;
        const raw = sessionStorage.getItem(key);
        if (raw) setSearchResults(JSON.parse(raw));
      } catch {}
    }
  }, [forcedPlatform]);

  // 방이 바뀌면 검색 결과(목록, 페이지 캐시, 토큰) 초기화
  useEffect(() => {
    pageCacheRef.current = { 1: [] };
    ytTokensRef.current = { 1: { next: null, prev: null } };
    setSearchResults([]);
    setPageIndex(1);
    setHasNext(false);
    setHasPrev(false);
  }, [currentRoom]);


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
    setPageIndex(1);
    pageCacheRef.current = { 1: [] };
    ytTokensRef.current = { 1: { next: null, prev: null } };
    setError('');
    setLastSearchTime(now);

      const response = await axios.get(`${API_BASE_URL}/api/search`, {
        params: {
          query: trimmedQuery,
          platform,
          page: platform === 'spotify' ? 1 : undefined,
          pageToken: platform === 'youtube' ? undefined : undefined,
          limit: 10
        }
      });
      const items = response.data?.items || [];
      const paging = response.data?.paging || {};
      setSearchResults(items);
      pageCacheRef.current[1] = items;
      setHasNext(!!paging.hasNext);
      setHasPrev(!!paging.hasPrev);
      if (platform === 'youtube') {
        ytTokensRef.current[1] = { next: paging.pageToken?.next || null, prev: paging.pageToken?.prev || null };
      }
      setSearchResults(response.data);
      // 결과를 세션에 캐시하여 리마운트/화면 전환 후에도 유지
        const key = `searchResults:${currentRoom || 'no-room'}:${platform}:${trimmedQuery}:1`;
        sessionStorage.setItem(key, JSON.stringify(items));
        sessionStorage.setItem(key, JSON.stringify(response.data));
      if (items.length === 0) {
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
    // 검색어와 결과는 유지하여 동일 검색으로 여러 곡 추가 가능
      const key = `searchResults:${currentRoom || 'no-room'}:${platform}:${(searchQuery || '').trim()}:${pageIndex}`;
      sessionStorage.setItem(key, JSON.stringify(searchResults || []));
      const key = `searchResults:${platform}:${(searchQuery || '').trim()}`;
      sessionStorage.setItem(key, JSON.stringify(searchResults || []));

  const goToPage = async (targetPage) => {
    if (!currentRoom) return;
    if (targetPage < 1) return;
    if (platform === 'spotify') {
      setIsLoading(true);
      setError('');
      try {
        const resp = await axios.get(`${API_BASE_URL}/api/search`, {
          params: { query: (searchQuery || '').trim(), platform, page: targetPage, limit: 10 }
        });
        const items = resp.data?.items || [];
        const paging = resp.data?.paging || {};
        pageCacheRef.current[targetPage] = items;
        setSearchResults(items);
        setPageIndex(targetPage);
        setHasNext(!!paging.hasNext);
        setHasPrev(!!paging.hasPrev);
        try {
          const key = `searchResults:${currentRoom || 'no-room'}:${platform}:${(searchQuery || '').trim()}:${targetPage}`;
          sessionStorage.setItem(key, JSON.stringify(items));
        } catch {}
      } catch (err) {
        setError(err.response?.data?.message || '검색 중 오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // YouTube: token 기반 Next/Prev 네비게이션
    const cached = pageCacheRef.current[targetPage];
    if (cached && Array.isArray(cached)) {
      setSearchResults(cached);
      setPageIndex(targetPage);
      const t = ytTokensRef.current[targetPage] || { next: null, prev: null };
      setHasNext(!!t.next);
      setHasPrev(!!t.prev);
      return;
    }

    // 앞으로/뒤로 한 페이지 이동만 허용 (이미 받아온 토큰 체인 기반)
    const movingForward = targetPage === pageIndex + 1;
    const movingBackward = targetPage === pageIndex - 1;
    const tokenSourcePage = pageIndex; // 현재 페이지 기준 토큰 사용
    const token = movingForward
      ? (ytTokensRef.current[tokenSourcePage]?.next || null)
      : (movingBackward ? (ytTokensRef.current[tokenSourcePage]?.prev || null) : null);
    if (!token) return; // 더 이상 페이지 없음

    setIsLoading(true);
    setError('');
    try {
      const resp = await axios.get(`${API_BASE_URL}/api/search`, {
        params: { query: (searchQuery || '').trim(), platform, pageToken: token, limit: 10 }
      });
      const items = resp.data?.items || [];
      const paging = resp.data?.paging || {};
      pageCacheRef.current[targetPage] = items;
      ytTokensRef.current[targetPage] = { next: paging.pageToken?.next || null, prev: paging.pageToken?.prev || null };
      setSearchResults(items);
      setPageIndex(targetPage);
      setHasNext(!!paging.hasNext);
      setHasPrev(!!paging.hasPrev);
      try {
        const key = `searchResults:${currentRoom || 'no-room'}:${platform}:${(searchQuery || '').trim()}:${targetPage}`;
        sessionStorage.setItem(key, JSON.stringify(items));
      } catch {}
    } catch (err) {
      setError(err.response?.data?.message || '검색 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };
    } catch {}
  }, [onAddTrack, platform, nickname]);

  // 검색어 변경 시 세션 저장
  useEffect(() => {
    try { sessionStorage.setItem('searchQuery', searchQuery); } catch {}
  }, [searchQuery]);

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
          {/* 페이지네이션 컨트롤 */}
          <div className="search-pagination" style={{ display:'flex', gap:8, marginTop:12, alignItems:'center', flexWrap:'wrap' }}>
            <button
              className="page-btn"
              onClick={() => goToPage(pageIndex - 1)}
              disabled={!hasPrev || isLoading}
            >
              ◀ Prev
            </button>
            {(() => {
              const pages = Object.keys(pageCacheRef.current).map(n => parseInt(n, 10)).filter(n => !isNaN(n)).sort((a,b)=>a-b);
              const maxPage = pages.length ? pages[pages.length - 1] : 1;
              const btns = [];
              for (let p = 1; p <= maxPage; p++) {
                btns.push(
                  <button
                    key={p}
                    className="page-btn"
                    onClick={() => goToPage(p)}
                    disabled={isLoading || p === pageIndex}
                    style={{ fontWeight: p === pageIndex ? 700 : 400 }}
                  >
                    {p}P
                  </button>
                );
              }
              // 다음 페이지가 더 있는 경우, 다음 페이지 프롬프트 버튼 표시
              if (hasNext) {
                btns.push(
                  <button
                    key={maxPage + 1}
                    className="page-btn"
                    onClick={() => goToPage(pageIndex + 1)}
                    disabled={isLoading}
                  >
                    {maxPage + 1}P ▶
                  </button>
                );
              }
              return btns;
            })()}
            <button
              className="page-btn"
              onClick={() => goToPage(pageIndex + 1)}
              disabled={!hasNext || isLoading}
            >
              Next ▶
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MusicSearch;