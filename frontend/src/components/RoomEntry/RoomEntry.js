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

  const [roomPlatform, setRoomPlatform] = useState('youtube');
  const [spotifyUser, setSpotifyUser] = useState(() => {
    try {
      const stored = localStorage.getItem('spotifyUser');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  // --- [추가] --- 방 공개 여부 상태
  const [visibility, setVisibility] = useState('public'); // 'public' | 'private'

  const startSpotifyAuth = async () => {
    try {
      const resp = await axios.get(`${API_BASE_URL}/api/spotify/login`);
      const { authUrl } = resp.data;
      const w = window.open(authUrl, 'spotify_oauth', 'width=500,height=700');
      const handler = (e) => {
        if (e.data?.type === 'SPOTIFY_AUTH') {
          const info = { userId: e.data.userId, product: e.data.product };
          setSpotifyUser(info);
          try { localStorage.setItem('spotifyUser', JSON.stringify(info)); } catch {}
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
    if (!trimmedNickname || trimmedNickname.length < 2 || trimmedNickname.length > 20) {
      setError('닉네임은 2-20자 사이여야 합니다.');
      return;
    }

    setIsCreating(true);
    setError('');

    try {
      // --- [수정] --- payload에 visibility 추가
      const payload = {
        host: trimmedNickname,
        platform: roomPlatform,
        visibility: visibility, // 선택한 공개 여부 전달
        userId: spotifyUser?.userId
      };
      const response = await axios.post(`${API_BASE_URL}/api/rooms`, payload, {
        timeout: 10000
      });
      
      onRoomCreated(response.data.roomCode, trimmedNickname);
    } catch (error) {
      setError(error.response?.data?.message || '방 생성 중 오류가 발생했습니다.');
      console.error('방 생성 오류:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async () => {
    const trimmedRoomCode = roomCode.trim().toUpperCase();
    const trimmedNickname = nickname.trim();
    
    if (!trimmedRoomCode || !trimmedNickname || trimmedRoomCode.length !== 6 || trimmedNickname.length < 2 || trimmedNickname.length > 20) {
      setError('6자리 방 코드와 2-20자 닉네임을 모두 입력해주세요.');
      return;
    }

    setIsJoining(true);
    setError('');

    try {
      await axios.get(`${API_BASE_URL}/api/rooms/${trimmedRoomCode}`, {
        timeout: 10000,
        params: { userId: spotifyUser?.userId }
      });
      onRoomJoined(trimmedRoomCode, trimmedNickname);
    } catch (error) {
      setError(error.response?.data?.message || '방 참가 중 오류가 발생했습니다.');
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
              id="nickname" type="text" value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="닉네임을 입력하세요 (2-20자)"
              maxLength={20}
            />
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}
        
        {/* --- [수정/추가] --- 방 생성 옵션 섹션으로 묶기 */}
        <div className="create-options">
          <div className="input-group">
            <label>플랫폼 선택</label>
            <div className="button-group">
              <button type="button" className={`btn ${roomPlatform==='youtube'?'btn-primary':'btn-secondary'}`} onClick={() => setRoomPlatform('youtube')}>YouTube 방</button>
              <button type="button" className={`btn ${roomPlatform==='spotify'?'btn-primary':'btn-secondary'}`} onClick={() => setRoomPlatform('spotify')} disabled={!spotifyUser || spotifyUser.product!=='premium'}>
                Spotify 프리미엄 방
              </button>
            </div>
            {(!spotifyUser || spotifyUser.product !== 'premium') && (
              <div className="auth-section">
                {roomPlatform === 'spotify' && <p className="auth-notice">Spotify 프리미엄 인증이 필요합니다.</p>}
                <button type="button" className="btn btn-secondary" onClick={startSpotifyAuth}>Spotify 인증하기</button>
              </div>
            )}
          </div>

          {/* --- [추가] --- 공개 여부 선택 UI */}
          <div className="input-group">
            <label>공개 여부</label>
            <div className="button-group">
              <button type="button" className={`btn ${visibility==='public'?'btn-primary':'btn-secondary'}`} onClick={() => setVisibility('public')}>🌐 공개 방</button>
              <button type="button" className={`btn ${visibility==='private'?'btn-primary':'btn-secondary'}`} onClick={() => setVisibility('private')}>🔒 비공개 방</button>
            </div>
            <p className="description">공개 방은 로비에 노출되어 누구나 들어올 수 있습니다.</p>
          </div>
        </div>


        <div className="action-buttons">
          <button
            className="btn btn-primary"
            onClick={handleCreateRoom}
            disabled={isCreating || !nickname.trim()}
          >
            {isCreating ? '방 생성 중...' : '새 방 만들기'}
          </button>
          
          <div className="divider"><span>또는</span></div>
          
          <div className="join-section">
            <div className="input-group">
              <label htmlFor="roomCode">방 코드</label>
              <input
                id="roomCode" type="text" value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="6자리 방 코드" maxLength={6}
                style={{ textTransform: 'uppercase' }}
              />
            </div>
            <button
              className="btn btn-secondary"
              onClick={handleJoinRoom}
              disabled={isJoining || !nickname.trim() || !roomCode.trim()}
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