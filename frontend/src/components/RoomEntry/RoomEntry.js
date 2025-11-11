import React, { useState } from 'react';
import axios from 'axios';
import './RoomEntry.css';

// 백엔드 URL 환경변수
const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

const RoomEntry = ({ onRoomJoined, onRoomCreated }) => {
  const [roomCode, setRoomCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');

  const [roomPlatform, setRoomPlatform] = useState('youtube'); // 'youtube' | 'spotify'
  const [spotifyUser, setSpotifyUser] = useState(null); // { userId, product }

  // Spotify OAuth 팝업 열기
  const startSpotifyAuth = async () => {
    try {
      const resp = await axios.get(`${API_BASE_URL}/api/spotify/login`);
      const { authUrl } = resp.data;
      const w = window.open(authUrl, 'spotify_oauth', 'width=500,height=700');
      const handler = (e) => {
        if (e.data?.type === 'SPOTIFY_AUTH') {
          setSpotifyUser({ userId: e.data.userId, product: e.data.product });
          window.removeEventListener('message', handler);
          w && w.close();
        }
      };
      window.addEventListener('message', handler);
    } catch (e) {
      console.error('Spotify 인증 시작 오류:', e);
      setError('Spotify 인증을 시작할 수 없습니다.');
    }
  };

  const handleCreateRoom = async () => {
    const trimmedNickname = nickname.trim();
    
    // 입력 검증 강화
    if (!trimmedNickname) {
      setError('닉네임을 입력해주세요.');
      return;
    }
    
    if (trimmedNickname.length < 2) {
      setError('닉네임은 2글자 이상이어야 합니다.');
      return;
    }
    
    if (trimmedNickname.length > 20) {
      setError('닉네임은 20글자 이하여야 합니다.');
      return;
    }

    setIsCreating(true);
    setError('');

    try {
      const payload = {
        host: trimmedNickname,
        platform: roomPlatform,
        userId: spotifyUser?.userId
      };
      const response = await axios.post(`${API_BASE_URL}/api/rooms`, payload, {
        timeout: 10000 // 10초 타임아웃
      });
      
      onRoomCreated(response.data.roomCode, trimmedNickname);
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        setError('서버 응답 시간이 초과되었습니다. 다시 시도해주세요.');
      } else if (error.response?.status === 500) {
        setError('서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      } else {
        setError(error.response?.data?.message || '방 생성 중 오류가 발생했습니다. 네트워크를 확인해주세요.');
      }
      console.error('방 생성 오류:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async () => {
    const trimmedRoomCode = roomCode.trim().toUpperCase();
    const trimmedNickname = nickname.trim();
    
    // 입력 검증 강화
    if (!trimmedRoomCode || !trimmedNickname) {
      setError('방 코드와 닉네임을 모두 입력해주세요.');
      return;
    }
    
    if (trimmedRoomCode.length !== 6) {
      setError('방 코드는 6자리여야 합니다.');
      return;
    }
    
    if (trimmedNickname.length < 2 || trimmedNickname.length > 20) {
      setError('닉네임은 2-20글자 사이여야 합니다.');
      return;
    }

    setIsJoining(true);
    setError('');

    try {
      await axios.get(`${API_BASE_URL}/api/rooms/${trimmedRoomCode}`, {
        timeout: 10000, // 10초 타임아웃
        params: { userId: spotifyUser?.userId }
      });
      onRoomJoined(trimmedRoomCode, trimmedNickname);
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        setError('서버 응답 시간이 초과되었습니다. 다시 시도해주세요.');
      } else if (error.response?.status === 404) {
        setError('존재하지 않는 방 코드입니다. 코드를 다시 확인해주세요.');
      } else if (error.response?.status === 403) {
        setError(error.response?.data?.message || '접근 권한이 없습니다.');
      } else if (error.response?.status === 500) {
        setError('서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      } else {
        setError('방 참가 중 오류가 발생했습니다. 네트워크를 확인해주세요.');
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

        <div className="platform-select-group">
          <label>플랫폼 선택</label>
          <div style={{ display:'flex', gap:'12px', flexWrap:'wrap' }}>
            <button type="button" className={`btn ${roomPlatform==='youtube'?'btn-primary':'btn-secondary'}`} onClick={() => setRoomPlatform('youtube')}>YouTube 방</button>
            <button type="button" className={`btn ${roomPlatform==='spotify'?'btn-primary':'btn-secondary'}`} onClick={() => setRoomPlatform('spotify')} disabled={!spotifyUser || spotifyUser.product!=='premium'}>
              Spotify 프리미엄 방
            </button>
            {roomPlatform==='spotify' && (!spotifyUser || spotifyUser.product!=='premium') && (
              <div style={{ fontSize:'0.75rem', color:'#c33' }}>Spotify 프리미엄 인증이 필요합니다.</div>
            )}
          </div>
          {(!spotifyUser || spotifyUser.product!=='premium') && (
            <button type="button" className="btn btn-secondary" onClick={startSpotifyAuth} style={{ marginTop:'8px' }}>Spotify 인증하기</button>
          )}
        </div>

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
