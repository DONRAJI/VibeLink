import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import RoomCard from './RoomCard';
import './Lobby.css';

const API_BASE = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

export default function Lobby() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [platform, setPlatform] = useState('all');
  const [sort, setSort] = useState('active');
  const [totalPages, setTotalPages] = useState(1);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', page);
    params.set('pageSize', 24);
    params.set('sort', sort);
    params.set('visibility', 'public');
    if (q) params.set('q', q);
    if (platform !== 'all') params.set('platform', platform);
    return params.toString();
  }, [page, sort, q, platform]);

  useEffect(() => {
    let cancelled = false;
    async function fetchRooms() {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/rooms?${queryString}`);
        const data = await res.json();
        if (cancelled) return;
        // 새로운 응답 형태: { items, page, pageSize, total, totalPages }
        const list = Array.isArray(data.items) ? data.items : [];
        if (page === 1) setRooms(list);
        else setRooms(prev => [...prev, ...list]);
        setTotalPages(data.totalPages || 1);
        setHasMore(page < (data.totalPages || 1) && list.length > 0);
      } catch (e) {
        console.error('Failed to fetch rooms', e);
        if (page === 1) setRooms([]);
        setHasMore(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchRooms();
    return () => { cancelled = true; };
  }, [queryString, page]);

  const onSearch = (e) => {
    e.preventDefault();
    setPage(1);
  };

  const onEnterRoom = (code) => {
    // 공개방 카드 클릭 시 해당 방으로 직접 이동
    navigate(`/room/${code}`);
  };

  return (
    <div className="lobby">
      <div className="lobby-header">
        <h2>공개 로비</h2>
        <div className="actions">
          <button className="primary" onClick={() => navigate('/entry')}>방 만들기 / 참가하기</button>
        </div>
      </div>

      <form className="filters" onSubmit={onSearch}>
        <input
          type="text"
          placeholder="방 이름/태그 검색..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="platform-toggles" role="group" aria-label="플랫폼 필터">
          {[
            { val: 'all', label: '전체' },
            { val: 'youtube', label: 'YouTube' },
            { val: 'spotify', label: 'Spotify' }
          ].map(p => (
            <button
              key={p.val}
              type="button"
              className={p.val === platform ? 'active' : ''}
              onClick={() => { setPlatform(p.val); setPage(1); }}
            >{p.label}</button>
          ))}
        </div>
        <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
          <option value="active">최근 활동순</option>
          <option value="created">최신 생성순</option>
          <option value="popularity">인기순</option>
        </select>
        <button type="submit">검색</button>
      </form>

      <div className="summary-bar">
        <span>총 {rooms.length}개 표시 (페이지 {page}/{totalPages})</span>
      </div>
      <div className="grid">
        {rooms.map(room => (
          <RoomCard key={room.code} room={room} onEnter={onEnterRoom} />
        ))}
      </div>

      <div className="footer">
        {loading && <span>불러오는 중...</span>}
        {!loading && hasMore && (
          <button onClick={() => setPage(p => p + 1)}>더 보기</button>
        )}
        {!loading && !hasMore && rooms.length > 0 && <span>마지막 페이지입니다</span>}
        {!loading && rooms.length === 0 && <span>표시할 공개 방이 없습니다</span>}
      </div>
    </div>
  );
}
