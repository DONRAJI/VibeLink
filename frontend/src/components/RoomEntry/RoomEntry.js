import React, { useState } from 'react';
import axios from 'axios';
import './RoomEntry.css';

const RoomEntry = ({ onRoomJoined, onRoomCreated }) => {
  const [roomCode, setRoomCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');

  const handleCreateRoom = async () => {
    if (!nickname.trim()) {
      setError('닉네임을 입력해주세요.');
      return;
    }

    setIsCreating(true);
    setError('');

    try {
      const response = await axios.post('http://localhost:4000/api/rooms', {
        host: nickname
      });
      
      onRoomCreated(response.data.roomCode, nickname);
    } catch (error) {
      setError('방 생성 중 오류가 발생했습니다.');
      console.error('방 생성 오류:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!roomCode.trim() || !nickname.trim()) {
      setError('방 코드와 닉네임을 모두 입력해주세요.');
      return;
    }

    setIsJoining(true);
    setError('');

    try {
      const response = await axios.get(`http://localhost:4000/api/rooms/${roomCode}`);
      onRoomJoined(roomCode, nickname);
    } catch (error) {
      if (error.response?.status === 404) {
        setError('존재하지 않는 방 코드입니다.');
      } else {
        setError('방 참가 중 오류가 발생했습니다.');
      }
      console.error('방 참가 오류:', error);
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="room-entry">
      <div className="room-entry-container">
        <h2 className="room-entry-title">VibeLink에 오신 것을 환영합니다!</h2>
        <p className="room-entry-subtitle">
          새로운 방을 만들거나 기존 방에 참가하여 음악을 함께 즐겨보세요.
        </p>

        <div className="input-section">
          <div className="input-group">
            <label htmlFor="nickname">닉네임</label>
            <input
              id="nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="닉네임을 입력하세요"
              maxLength={20}
            />
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="action-buttons">
          <button
            className="btn btn-primary"
            onClick={handleCreateRoom}
            disabled={isCreating}
          >
            {isCreating ? '방 생성 중...' : '새 방 만들기'}
          </button>
          
          <div className="divider">
            <span>또는</span>
          </div>
          
          <div className="join-section">
            <div className="input-group">
              <label htmlFor="roomCode">방 코드</label>
              <input
                id="roomCode"
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="6자리 방 코드"
                maxLength={6}
                style={{ textTransform: 'uppercase' }}
              />
            </div>
            <button
              className="btn btn-secondary"
              onClick={handleJoinRoom}
              disabled={isJoining}
            >
              {isJoining ? '참가 중...' : '방 참가하기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoomEntry;
