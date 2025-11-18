// RoomEntry.js (전체 교체)

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './RoomEntry.css';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

const RoomEntry = ({ onRoomJoined, onRoomCreated }) => {
  const [roomCode, setRoomCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [title, setTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');

  const [roomPlatform, setRoomPlatform] = useState('youtube');
  const [visibility, setVisibility] = useState('public');
  const [playlistMode, setPlaylistMode] = useState('ephemeral');
  
  const [spotifyUser, setSpotifyUser] = useState(null);
  // --- [추가] --- 인증 상태를 더 상세하게 관리 (loading, success, error, none)
  const [authStatus, setAuthStatus] = useState('loading'); 

  // --- [핵심 수정] --- 페이지 로드 시 Spotify 인증 상태를 서버에 확인
  const verifySpotifyAuth = useCallback(async () => {
    setAuthStatus('loading');
    try {
      const storedUser = JSON.parse(localStorage.getItem('spotifyUser'));
      if (!storedUser?.userId) {
        setAuthStatus('none'); // 로컬에 정보 없음
        return;
      }
      
      // 서버에 상태 확인 요청
      const response = await axios.get(`${API_BASE_URL}/api/spotify/status/${storedUser.userId}`);
      const { authenticated, product, userId } = response.data;

      if (authenticated) {
        const userInfo = { userId, product };
        setSpotifyUser(userInfo);
        localStorage.setItem('spotifyUser', JSON.stringify(userInfo)); // 최신 정보로 갱신
        setAuthStatus(product === 'premium' ? 'premium' : 'free');
      } else {
        localStorage.removeItem('spotifyUser');
        setSpotifyUser(null);
        setAuthStatus('none');
      }
    } catch (err) {
      console.error("Spotify 인증 확인 실패:", err);
      localStorage.removeItem('spotifyUser');
      setSpotifyUser(null);
      setAuthStatus('error'); // 확인 중 에러 발생
    }
  }, []);

  useEffect(() => {
    verifySpotifyAuth();
  }, [verifySpotifyAuth]);

  const startSpotifyAuth = async () => {
    try {
      const resp = await axios.get(`${API_BASE_URL}/api/spotify/login`);
      const { authUrl } = resp.data;
      const w = window.open(authUrl, 'spotify_oauth', 'width=500,height=700');
      const handler = (e) => {
        if (e.data?.type === 'SPOTIFY_AUTH') {
          window.removeEventListener('message', handler);
          w?.close();
          // 즉시 로컬 상태 갱신 후 서버 검증 재요청
          const { userId, product } = e.data;
          if (userId) {
            const userInfo = { userId, product };
            localStorage.setItem('spotifyUser', JSON.stringify(userInfo));
            setSpotifyUser(userInfo);
            setAuthStatus(product === 'premium' ? 'premium' : (product ? 'free' : 'none'));
          }
          verifySpotifyAuth();
        }
      };
      window.addEventListener('message', handler);
    } catch (e) {
      setError('Spotify 인증을 시작할 수 없습니다.');
    }
  };

  const handleCreateRoom = async () => {
    // ... (유효성 검사 로직은 동일)
    const trimmedNickname = nickname.trim();
    const trimmedTitle = title.trim();
    if (!trimmedNickname || trimmedNickname.length < 2 || trimmedNickname.length > 20) {
      setError('닉네임은 2-20자 사이여야 합니다.');
      return;
    }
    if (!trimmedTitle || trimmedTitle.length < 2 || trimmedTitle.length > 30) {
      setError('방 제목은 2-30자 사이여야 합니다.');
      return;
    }
    // Spotify 방 생성 시, 한 번 더 프리미엄 상태 확인
    if (roomPlatform === 'spotify' && authStatus !== 'premium') {
      setError('Spotify 프리미엄 방을 만들려면 유효한 프리미엄 계정 인증이 필요합니다.');
      return;
    }

    setIsCreating(true);
    setError('');
    try {
      const payload = { host: trimmedNickname, title: trimmedTitle, platform: roomPlatform, visibility: visibility, userId: spotifyUser?.userId, playlistMode };
      const response = await axios.post(`${API_BASE_URL}/api/rooms`, payload);
      onRoomCreated(response.data.roomCode, trimmedNickname);
    } catch (error) {
      setError(error.response?.data?.message || '방 생성 중 오류가 발생했습니다.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async () => {
    // ... (handleJoinRoom 로직은 변경 없음)
    const trimmedRoomCode = roomCode.trim().toUpperCase();
    const trimmedNickname = nickname.trim();
    if (!trimmedRoomCode || !trimmedNickname || trimmedRoomCode.length !== 6 || trimmedNickname.length < 2 || trimmedNickname.length > 20) {
      setError('6자리 방 코드와 2-20자 닉네임을 모두 입력해주세요.');
      return;
    }
    setIsJoining(true);
    setError('');
    try {
      await axios.get(`${API_BASE_URL}/api/rooms/${trimmedRoomCode}`, { params: { userId: spotifyUser?.userId } });
      onRoomJoined(trimmedRoomCode, trimmedNickname);
    } catch (error) {
      setError(error.response?.data?.message || '방 참가 중 오류가 발생했습니다.');
    } finally {
      setIsJoining(false);
    }
  };
  
  // --- [추가] --- 인증 상태에 따른 UI 컴포넌트 렌더링 함수
  const renderSpotifyAuthStatus = () => {
    switch (authStatus) {
      case 'loading':
        return <p className="auth-status loading">Spotify 인증 상태 확인 중...</p>;
      case 'premium':
        return <p className="auth-status success">✓ Spotify 프리미엄 인증 완료</p>;
      case 'free':
        return <div className="auth-section">
          <p className="auth-status error">Spotify 계정이 확인되었으나, 프리미엄 구독이 필요합니다.</p>
          <button type="button" className="btn btn-secondary" onClick={startSpotifyAuth}>계정 다시 인증</button>
        </div>;
      case 'none':
      case 'error':
      default:
        return <div className="auth-section">
          {roomPlatform === 'spotify' && <p className="auth-notice">Spotify 프리미엄 인증이 필요합니다.</p>}
          <button type="button" className="btn btn-secondary" onClick={startSpotifyAuth}>Spotify 인증하기</button>
        </div>;
    }
  };

  return (
    <div className="room-entry">
      <div className="room-entry-container">
        <h2 className="room-entry-title">VibeLink</h2>
        <p className="room-entry-subtitle">음악과 함께하는 우리만의 공간</p>

        <div className="input-group">
          <label htmlFor="nickname">닉네임</label>
          <input id="nickname" type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="사용할 닉네임을 입력하세요" maxLength={20} />
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="create-options">
          <h3 className="section-title">새 방 만들기</h3>
          <div className="input-group">
            <label htmlFor="room-title">방 제목</label>
            <input id="room-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="친구들과 공유할 방 제목" maxLength={30} />
          </div>
          <div className="input-group">
            <label>플랫폼 선택</label>
            <div className="button-group">
              <button type="button" className={`btn ${roomPlatform === 'youtube' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setRoomPlatform('youtube')}>YouTube 방</button>
              <button type="button" className={`btn ${roomPlatform === 'spotify' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setRoomPlatform('spotify')} disabled={authStatus !== 'premium'}>
                Spotify 프리미엄 방
              </button>
            </div>
            {renderSpotifyAuthStatus()}
          </div>
          <div className="input-group">
            <label>플레이리스트 모드</label>
            <div className="button-group">
              <button type="button" className={`btn ${playlistMode === 'ephemeral' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPlaylistMode('ephemeral')}>Ephemeral</button>
              <button type="button" className={`btn ${playlistMode === 'persistent' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPlaylistMode('persistent')}>Persistent</button>
            </div>
          </div>
          <div className="input-group">
            <label>공개 여부</label>
            <div className="button-group">
              <button type="button" className={`btn ${visibility === 'public' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setVisibility('public')}>🌐 공개 방</button>
              <button type="button" className={`btn ${visibility === 'private' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setVisibility('private')}>🔒 비공개 방</button>
            </div>
          </div>
          <button className="btn btn-primary full-width" onClick={handleCreateRoom} disabled={isCreating || !nickname.trim() || !title.trim()}>
            {isCreating ? '생성 중...' : '이 설정으로 방 만들기'}
          </button>
        </div>

        <div className="divider"><span>또는</span></div>
        
        <div className="join-section">
          <h3 className="section-title">기존 방 참가하기</h3>
          <div className="input-group">
            <label htmlFor="roomCode">방 코드</label>
            <input id="roomCode" type="text" value={roomCode} onChange={(e) => setRoomCode(e.target.value.toUpperCase())} placeholder="6자리 초대 코드" maxLength={6} />
          </div>
          <button className="btn btn-secondary full-width" onClick={handleJoinRoom} disabled={isJoining || !nickname.trim() || !roomCode.trim()}>
            {isJoining ? '참가 중...' : '방 참가하기'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RoomEntry;