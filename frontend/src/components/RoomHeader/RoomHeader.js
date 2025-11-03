import React from 'react';
import './RoomHeader.css';

const RoomHeader = ({ roomCode, nickname, participants, isHost, onLeaveRoom }) => {
  const handleLeaveRoom = () => {
    if (window.confirm('정말로 방을 나가시겠습니까?')) {
      onLeaveRoom();
    }
  };

  const handleCopyRoomCode = () => {
    navigator.clipboard.writeText(roomCode).then(() => {
      alert('방 코드가 클립보드에 복사되었습니다!');
    }).catch(() => {
      // 클립보드 API를 지원하지 않는 경우
      const textArea = document.createElement('textarea');
      textArea.value = roomCode;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      alert('방 코드가 클립보드에 복사되었습니다!');
    });
  };

  return (
    <div className="room-header">
      <div className="header-content">
        <div className="room-info">
          <div className="room-code-section">
            <h2 className="room-title">
              🎵 VibeLink
              <span className="room-subtitle">실시간 공유 플레이리스트</span>
            </h2>
            <div className="room-code-display">
              <span className="room-code-label">방 코드:</span>
              <span className="room-code">{roomCode}</span>
              <button 
                className="copy-btn"
                onClick={handleCopyRoomCode}
                title="방 코드 복사"
              >
                📋
              </button>
            </div>
          </div>
          
          <div className="user-info">
            <div className="nickname">
              <span className="user-icon">👤</span>
              {nickname}
              {isHost && <span className="host-badge">방장</span>}
            </div>
            <div className="participants-count">
              참가자: {participants.length}명
            </div>
          </div>
        </div>
        
        <div className="header-actions">
          <button 
            className="leave-btn"
            onClick={handleLeaveRoom}
          >
            🚪 방 나가기
          </button>
        </div>
      </div>
      
      <div className="participants-list">
        <h4>참가자 목록</h4>
        <div className="participants-grid">
          {participants.map((participant, index) => (
            <div key={index} className="participant-item">
              <span className="participant-icon">👤</span>
              <span className="participant-name">
                {participant === nickname ? '나' : participant}
              </span>
              {participant === nickname && isHost && (
                <span className="host-indicator">방장</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RoomHeader;
