import React, { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import './MusicSearch.css';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

// 검색 컴포넌트 (방별 캐시 + 페이지네이션)
const MusicSearch = ({ onAddTrack, currentRoom, nickname, forcedPlatform }) => {
  // 검색어 복원
  const restoredQuery = (() => { try { return sessionStorage.getItem('searchQuery') || ''; } catch { return ''; } })();
  const initialPlatform = forcedPlatform || 'youtube';
  // 1페이지 캐시 복원 (방/플랫폼/쿼리 기준)
  const initialResults = (() => {
    try {
      const key = `searchResults:${currentRoom || 'no-room'}:${initialPlatform}:${(restoredQuery || '').trim()}:1`;
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  })();

  const [searchQuery, setSearchQuery] = useState(restoredQuery);
  const [platform, setPlatform] = useState(initialPlatform);
  const [searchResults, setSearchResults] = useState(initialResults);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastSearchTime, setLastSearchTime] = useState(0);
  const [pageIndex, setPageIndex] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);

  const pageCacheRef = useRef({ 1: initialResults }); // { page: items[] }
  const ytTokensRef = useRef({ 1: { next: null, prev: null } }); // YouTube page tokens

  // 플랫폼 강제 변경 시 캐시 복원 시도
  useEffect(() => {
    if (!forcedPlatform) return;
    setPlatform(forcedPlatform);
    try {
      const key = `searchResults:${currentRoom || 'no-room'}:${forcedPlatform}:${(searchQuery || '').trim()}:1`;
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        setSearchResults(parsed);
        pageCacheRef.current = { 1: parsed };
      }
    } catch {}
    setPageIndex(1);
  }, [forcedPlatform, currentRoom, searchQuery]);

  // 방 변경 시 초기화
  useEffect(() => {
    pageCacheRef.current = { 1: [] };
    ytTokensRef.current = { 1: { next: null, prev: null } };
    setSearchResults([]);
    setPageIndex(1);
    setHasNext(false);
    setHasPrev(false);
    // 검색어는 유지 (사용자 편의) 필요 시 제거 가능
  }, [currentRoom]);

  // 검색 실행
  const handleSearch = useCallback(async () => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) { setError('검색어는 2글자 이상이어야 합니다.'); return; }
    if (!currentRoom) { setError('먼저 방에 참가해야 합니다.'); return; }
    const now = Date.now();
    if (now - lastSearchTime < 800) return; // 간단한 디바운스

    setIsLoading(true);
    setError('');
    setLastSearchTime(now);
    setPageIndex(1);
    pageCacheRef.current = { 1: [] };
    ytTokensRef.current = { 1: { next: null, prev: null } };

    try {
      const resp = await axios.get(`${API_BASE_URL}/api/search`, {
        params: {
          query: trimmed,
          platform,
          page: platform === 'spotify' ? 1 : undefined,
          limit: 10
        }
      });
      const items = resp.data?.items || [];
      const paging = resp.data?.paging || {};
      setSearchResults(items);
      pageCacheRef.current[1] = items;
      setHasNext(!!paging.hasNext);
      setHasPrev(!!paging.hasPrev);
      if (platform === 'youtube') {
        ytTokensRef.current[1] = { next: paging.pageToken?.next || null, prev: paging.pageToken?.prev || null };
      }
      try {
        const key = `searchResults:${currentRoom || 'no-room'}:${platform}:${trimmed}:1`;
        sessionStorage.setItem(key, JSON.stringify(items));
        sessionStorage.setItem('searchQuery', searchQuery);
      } catch {}
      if (items.length === 0) setError('검색 결과가 없습니다.');
    } catch (err) {
      setError(err.response?.data?.message || '검색 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, platform, currentRoom, lastSearchTime]);

  // 페이지 이동
  const goToPage = async (target) => {
    if (!currentRoom || target < 1 || target === pageIndex) return;
    if (platform === 'spotify') {
      setIsLoading(true); setError('');
      try {
        const resp = await axios.get(`${API_BASE_URL}/api/search`, {
          params: { query: (searchQuery || '').trim(), platform, page: target, limit: 10 }
        });
        const items = resp.data?.items || [];
        const paging = resp.data?.paging || {};
        pageCacheRef.current[target] = items;
        setSearchResults(items);
        setPageIndex(target);
        setHasNext(!!paging.hasNext);
        setHasPrev(!!paging.hasPrev);
        try {
          const key = `searchResults:${currentRoom || 'no-room'}:${platform}:${(searchQuery || '').trim()}:${target}`;
          sessionStorage.setItem(key, JSON.stringify(items));
        } catch {}
      } catch (err) {
        setError(err.response?.data?.message || '검색 중 오류 발생');
      } finally { setIsLoading(false); }
      return;
    }
    // YouTube (token 기반 앞/뒤 이동)
    const movingForward = target === pageIndex + 1;
    const movingBackward = target === pageIndex - 1;
    const token = movingForward ? ytTokensRef.current[pageIndex]?.next : (movingBackward ? ytTokensRef.current[pageIndex]?.prev : null);
    if (!token) return;
    setIsLoading(true); setError('');
    try {
      const resp = await axios.get(`${API_BASE_URL}/api/search`, {
        params: { query: (searchQuery || '').trim(), platform, pageToken: token, limit: 10 }
      });
      const items = resp.data?.items || [];
      const paging = resp.data?.paging || {};
      pageCacheRef.current[target] = items;
      ytTokensRef.current[target] = { next: paging.pageToken?.next || null, prev: paging.pageToken?.prev || null };
      setSearchResults(items);
      setPageIndex(target);
      setHasNext(!!paging.hasNext);
      setHasPrev(!!paging.hasPrev);
      try {
        const key = `searchResults:${currentRoom || 'no-room'}:${platform}:${(searchQuery || '').trim()}:${target}`;
        sessionStorage.setItem(key, JSON.stringify(items));
      } catch {}
    } catch (err) {
      setError(err.response?.data?.message || '검색 중 오류 발생');
    } finally { setIsLoading(false); }
  };

  // 곡 추가
  const handleAddTrack = useCallback((track) => {
    const trackToAdd = { ...track, platform, addedBy: nickname };
    onAddTrack(trackToAdd);
    try {
      const key = `searchResults:${currentRoom || 'no-room'}:${platform}:${(searchQuery || '').trim()}:${pageIndex}`;
      sessionStorage.setItem(key, JSON.stringify(searchResults || []));
    } catch {}
  }, [onAddTrack, platform, nickname, currentRoom, searchQuery, pageIndex, searchResults]);

  const handleKeyPress = (e) => { if (e.key === 'Enter') handleSearch(); };

  return (
    <div className="music-search">
      <div className="search-header">
        <h3>🎵 음악 검색</h3>
        <p>현재 방은 <strong>{platform === 'youtube' ? 'YouTube' : 'Spotify'}</strong> 전용입니다.<br/>플레이리스트에 추가할 음악을 검색하세요.</p>
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
          <button onClick={handleSearch} disabled={!currentRoom || isLoading || !searchQuery.trim()} className="search-btn">
            {isLoading ? '⏳' : '🔍 검색'}
          </button>
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
        {!currentRoom && <div className="room-warning">⚠️ 음악을 검색하려면 먼저 방에 참가해야 합니다.</div>}
      </div>
      {error && <div className="error-message">{error}</div>}
      {searchResults.length > 0 && (
        <div className="search-results">
          <h4>검색 결과 ({searchResults.length})</h4>
          <div className="results-list">
            {searchResults.map(track => (
              <div key={track.videoId || track.id} className="result-item">
                <div className="result-thumbnail"><img src={track.thumbnailUrl} alt={track.title} /></div>
                <div className="result-info">
                  <h5 className="result-title">{track.title}</h5>
                  <div className="result-meta">
                    <span className="result-source">{platform === 'youtube' ? 'YouTube' : 'Spotify'}</span>
                    {platform === 'spotify' && track.artists && <span className="result-artists">👤 {track.artists}</span>}
                  </div>
                </div>
                <button className="add-btn" onClick={() => handleAddTrack(track)} disabled={!currentRoom}>➕ 추가</button>
              </div>
            ))}
          </div>
          <div className="search-pagination" style={{ display:'flex', gap:8, marginTop:12, alignItems:'center', flexWrap:'wrap' }}>
            <button className="page-btn" onClick={() => goToPage(pageIndex - 1)} disabled={!hasPrev || isLoading}>◀ Prev</button>
            {(() => {
              const pages = Object.keys(pageCacheRef.current).map(n => parseInt(n, 10)).filter(n => !isNaN(n)).sort((a,b)=>a-b);
              const maxPage = pages.length ? pages[pages.length - 1] : 1;
              const btns = [];
              for (let p = 1; p <= maxPage; p++) {
                btns.push(
                  <button key={p} className="page-btn" onClick={() => goToPage(p)} disabled={isLoading || p === pageIndex} style={{ fontWeight: p === pageIndex ? 700 : 400 }}>{p}P</button>
                );
              }
              if (hasNext) {
                btns.push(<button key={maxPage + 1} className="page-btn" onClick={() => goToPage(pageIndex + 1)} disabled={isLoading}>{maxPage + 1}P ▶</button>);
              }
              return btns;
            })()}
            <button className="page-btn" onClick={() => goToPage(pageIndex + 1)} disabled={!hasNext || isLoading}>Next ▶</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MusicSearch;