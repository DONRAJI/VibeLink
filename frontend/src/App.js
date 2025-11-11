import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import SplashScreen from './components/SplashScreen/SplashScreen';
import RoomEntry from './components/RoomEntry/RoomEntry';
import RoomHeader from './components/RoomHeader/RoomHeader';
import MusicPlayer from './components/MusicPlayer/MusicPlayer';
import PlaylistQueue from './components/PlaylistQueue/PlaylistQueue';
import MusicSearch from './components/MusicSearch/MusicSearch';
import ChatWindow from './components/ChatWindow/ChatWindow';
import './App.css';
import Lobby from './components/Lobby/Lobby';

const socket = io(process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000', {
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  timeout: 20000,
  forceNew: true
});

// 라우팅 내부에서 소켓/상태를 공유하기 위해 App을 루트로 유지
function App() {
  const [roomCode, setRoomCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [roomPlatform, setRoomPlatform] = useState('youtube');

  useEffect(() => {
    socket.on('connect', () => console.log('✅ 서버 연결:', socket.id));
    socket.on('disconnect', (r) => console.log('❌ 연결 종료:', r));
    socket.on('connect_error', (e) => console.error('🔌 연결 오류:', e));

    socket.on('roomJoined', (room) => {
      // 현재 트랙 설정: YouTube(videoId) 또는 Spotify(id/platform)
      const ct = room.currentTrack;
      const normalized = ct && (ct.videoId || ct.id || ct.platform === 'spotify') ? ct : null;
      setCurrentTrack(normalized);
      setIsPlaying(room.isPlaying);
      setQueue(room.queue || []);
      setParticipants(room.participants || []);
      setIsHost(room.host === nickname);
      setChatMessages([]);
      if (room.platform) setRoomPlatform(room.platform);
    });

    socket.on('roomError', (err) => alert(err.message));
    socket.on('trackAdded', (track) => setQueue(prev => [...prev, track]));
    socket.on('queueUpdated', (newQueue) => setQueue(newQueue));
    socket.on('playbackControlled', ({ action, track, isPlaying: newIsPlaying }) => {
      // 콘솔 진단
      console.log('🎧 playbackControlled:', action, track?.platform, track?.videoId || track?.id);
      if (action === 'play' && track) {
        setCurrentTrack(track);
        setIsPlaying(true);
      } else if (action === 'pause') {
        setIsPlaying(false);
      } else if (action === 'next') {
        if (track) {
          setCurrentTrack(track);
          setIsPlaying(true);
        } else {
          setCurrentTrack(null);
          setIsPlaying(false);
        }
      }
      if (typeof newIsPlaying === 'boolean') setIsPlaying(newIsPlaying);
    });
    socket.on('participantsUpdated', (p) => setParticipants(p));

  // 채팅 기록/메시지
  socket.on('chatHistory', (history) => setChatMessages(history || []));
  socket.on('newChatMessage', (entry) => setChatMessages(prev => [...prev, entry]));

    return () => {
      socket.off('connect');
      socket.off('disconnect'); 
      socket.off('connect_error');
      socket.off('roomJoined');
      socket.off('roomError');
      socket.off('trackAdded');
      socket.off('queueUpdated');
      socket.off('playbackControlled');
      socket.off('participantsUpdated');
      socket.off('chatHistory');
      socket.off('newChatMessage');
    };
  }, [nickname]);

  const navigate = useNavigate();
  const handleSplashComplete = () => {
    navigate('/lobby');
  };
  const handleRoomCreated = (code, hostNickname) => {
    setRoomCode(code);
    setNickname(hostNickname);
    setIsHost(true);
    socket.emit('joinRoom', { roomCode: code, nickname: hostNickname });
    navigate(`/room/${code}`);
  };
  const handleRoomJoined = (code, userNickname) => {
    setRoomCode(code);
    setNickname(userNickname);
    setIsHost(false);
    socket.emit('joinRoom', { roomCode: code, nickname: userNickname });
    navigate(`/room/${code}`);
  };
  const handleLeaveRoom = () => {
    socket.emit('disconnect');
    setRoomCode('');
    setNickname('');
    setIsHost(false);
    setCurrentTrack(null);
    setIsPlaying(false);
    setQueue([]);
    setParticipants([]);
    setChatMessages([]);
    navigate('/lobby');
  };
  const handleAddTrack = (track) => socket.emit('addTrack', { roomCode, track, addedBy: nickname });
  const handlePlayPause = () => {
    const newIsPlaying = !isPlaying; setIsPlaying(newIsPlaying);
    socket.emit('controlPlayback', { roomCode, action: newIsPlaying ? 'play' : 'pause', track: currentTrack });
  };
  const handleNextTrack = () => socket.emit('controlPlayback', { roomCode, action: 'next' });
  const handlePlayTrack = (track) => socket.emit('controlPlayback', { roomCode, action: 'play', track });
  const handleTrackEnded = () => handleNextTrack();
  const handleVoteTrack = (videoId, voteType) => socket.emit('voteTrack', { roomCode, videoId, voteType });

  // 채팅 전송
  const handleSendMessage = (text) => {
    if (!text || !roomCode) return;
    socket.emit('chatMessage', { roomCode, user: nickname, message: text });
  };

  return (
    <Routes>
      <Route path="/" element={<SplashScreen onComplete={handleSplashComplete} />} />
  <Route path="/lobby" element={<Lobby />} />
      <Route path="/entry" element={<RoomEntry onRoomCreated={handleRoomCreated} onRoomJoined={handleRoomJoined} />} />
      <Route path="/room/:code" element={
        <div className="app">
          <div className="app-container">
            <RoomHeader roomCode={roomCode} nickname={nickname} participants={participants} isHost={isHost} onLeaveRoom={handleLeaveRoom} />
            <MusicPlayer currentTrack={currentTrack} isPlaying={isPlaying} onPlayPause={handlePlayPause} onNext={handleNextTrack} onEnded={handleTrackEnded} isHost={isHost} />
            <PlaylistQueue queue={queue} currentTrack={currentTrack} onPlayTrack={handlePlayTrack} onVoteTrack={handleVoteTrack} isHost={isHost} />
            <MusicSearch onAddTrack={handleAddTrack} currentRoom={roomCode} nickname={nickname} forcedPlatform={roomPlatform} />
            <ChatWindow roomCode={roomCode} nickname={nickname} messages={chatMessages} onSendMessage={handleSendMessage} />
          </div>
        </div>
      } />
      <Route path="*" element={<Navigate to="/lobby" replace />} />
    </Routes>
  );
}

// BrowserRouter 래핑 컴포넌트 (index.js에서 App만 사용 중이므로 내부에서 감쌈)
export default function RoutedApp() {
  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}