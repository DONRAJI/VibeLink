import React from 'react';
import { useNavigate } from 'react-router-dom';

const Lobby = () => {
  const navigate = useNavigate();
  return (
    <div style={{ padding: 16 }}>
      <h2>🎧 공개 방 로비</h2>
      <p>취향에 맞는 방을 찾아 입장하거나 새 방을 만들어보세요.</p>
      <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/entry')}>방 만들기 / 참가하기</button>
        {/* 향후: 방 목록/검색 추가 예정 */}
      </div>
    </div>
  );
};

export default Lobby;
