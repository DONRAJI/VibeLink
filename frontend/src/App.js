import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate, useParams, useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import './App.css';

import MusicSearch from './components/MusicSearch/MusicSearch';
import PlaylistQueue from './components/PlaylistQueue/PlaylistQueue';
import MusicPlayer from './components/MusicPlayer/MusicPlayer';
import ChatWindow from './components/ChatWindow/ChatWindow';
import RoomHeader from './components/RoomHeader/RoomHeader';
import LandingPage from './components/LandingPage/LandingPage';
import CallbackPage from './components/CallbackPage/CallbackPage';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';
const socket = io(BACKEND_URL, {
  autoConnect: false,
  reconnection: true,
});

function App() {
  const [roomCode, setRoomCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [queue, setQueue] = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [roomPlatform, setRoomPlatform] = useState('all');
  const [playlistMode, setPlaylistMode] = useState('queue');
  const [playlistCursor, setPlaylistCursor] = useState(0);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // 소켓 이벤트 리스너 설정
    socket.on('roomJoined', (room) => {
      console.log('Room Joined:', room);
      setRoomCode(room.code);
      setQueue(room.queue || []);
      setCurrentTrack(room.currentTrack || null);
      setIsPlaying(room.isPlaying || false);
      setParticipants(room.participants || []);
      setChatMessages(room.chatMessages || []);
      setRoomPlatform(room.platform || 'all');
      setPlaylistMode(room.playlistMode || 'queue');
      setPlaylistCursor(room.playlistCursor || 0);

      const myId = socket.id;
      const hostId = room.participants[0];
      // 닉네임이 있으면 닉네임으로 비교할 수도 있지만, 여기서는 간단히 첫 번째 참가자를 호스트로 간주
      // 실제로는 서버에서 isHost 플래그를 주거나, socket.id와 비교
      // 여기서는 간단히: 내가 방을 만들었거나(handleRoomCreated), 참가자 목록 첫번째면 호스트
      // 하지만 handleRoomCreated에서 이미 isHost=true로 설정함.
      // 참가자의 경우 첫번째인지 확인
      if (participants.length > 0 && participants[0] === nickname) {
        // 닉네임 기반 비교 (불완전할 수 있음)
      }
    });

    socket.on('trackAdded', (track) => {
      console.log('Track Added:', track);
      // queueUpdated에서 처리되므로 여기서는 알림만 띄우거나 생략 가능
    });

    socket.on('queueUpdated', (newQueue) => {
      console.log('Queue Updated:', newQueue);
      setQueue(newQueue);
    });

    socket.on('playbackControlled', ({ action, track, isPlaying }) => {
      console.log('Playback Controlled:', action, track, isPlaying);
      setCurrentTrack(track);
      setIsPlaying(isPlaying);
    });

    socket.on('participantsUpdated', (users) => {
      console.log('Participants Updated:', users);
      setParticipants(users);
    });

    socket.on('newChatMessage', (msg) => {
      setChatMessages(prev => [...prev, msg]);
    });

    socket.on('chatHistory', (history) => {
      setChatMessages(history);
    });

    socket.on('roomError', (err) => {
      alert(err.message);
      navigate('/');
    });

    socket.on('playlistCursor', ({ cursor, mode }) => {
      setPlaylistCursor(cursor);
      setPlaylistMode(mode);
    });

    return () => {
      socket.off('roomJoined');
      socket.off('trackAdded');
      socket.off('queueUpdated');
      socket.off('playbackControlled');
      socket.off('participantsUpdated');
      socket.off('newChatMessage');
      socket.off('chatHistory');
      socket.off('roomError');
      socket.off('playlistCursor');
    };
  }, [navigate, nickname, participants]);

  const handleRoomCreated = (code, hostNickname) => {
    setRoomCode(code);
    setNickname(hostNickname);
    try { localStorage.setItem('nickname', hostNickname); } catch { }
    setIsHost(true);

    if (!socket.connected) {
      socket.connect();
      socket.emit('joinRoom', { roomCode: code, nickname: hostNickname });
    } else {
      socket.emit('joinRoom', { roomCode: code, nickname: hostNickname });
    }
    navigate(`/room/${code}`);
  };

  const handleRoomJoined = (code, userNickname) => {
    setRoomCode(code);
    setNickname(userNickname);
    try { localStorage.setItem('nickname', userNickname); } catch { }
    setIsHost(false);

    if (!socket.connected) {
      socket.connect();
      socket.emit('joinRoom', { roomCode: code, nickname: userNickname });
    } else {
      socket.emit('joinRoom', { roomCode: code, nickname: userNickname });
    }
    navigate(`/room/${code}`);
  };

  const handleLeaveRoom = () => {
    socket.disconnect();
    setRoomCode('');
    setQueue([]);
    setCurrentTrack(null);
    setIsPlaying(false);
    navigate('/');
  };

  const handleAddTrack = (track) => {
    socket.emit('addTrack', { roomCode, track, addedBy: nickname });
  };

  const handlePlayTrack = (track) => {
    socket.emit('controlPlayback', { roomCode, action: 'play', track });
  };

  const handlePlayPause = () => {
    const action = isPlaying ? 'pause' : 'resume';
    socket.emit('controlPlayback', { roomCode, action, track: currentTrack });
  };

  const handleNextTrack = () => {
    socket.emit('controlPlayback', { roomCode, action: 'next' });
  };

  const handleTrackEnded = () => {
    if (isHost) {
      console.log('[App] Track ended, requesting next...');
      socket.emit('controlPlayback', { roomCode, action: 'next' });
    }
  };

  const handleVoteTrack = (trackId, voteType) => {
    socket.emit('voteTrack', { roomCode, trackId, voteType });
  };

  const handleSendMessage = (message) => {
    socket.emit('chatMessage', { roomCode, user: nickname, message });
  };

  const handleDeviceReady = (deviceId, userId) => {
    if (roomCode && deviceId && userId) {
      console.log(`[App] Spotify Device Ready: ${deviceId} (User: ${userId})`);
      socket.emit('updateDeviceId', { roomCode, userId, deviceId });
    }
  };

  function RoomPage() {
    const { code } = useParams();
    const lastJoinRef = useRef(null);

    useEffect(() => {
      const savedName = localStorage.getItem('nickname') || '익명';
      if (lastJoinRef.current !== code) {
        // 방이 바뀌었으면 기존 소켓 정리
        if (socket.connected) {
          try { socket.disconnect(); } catch { }
          setCurrentTrack(null);
          setIsPlaying(false);
          setQueue([]);
          setParticipants([]);
        }
        if (!socket.connected) socket.connect();
        setRoomCode(code);
        setNickname(savedName);
        // isHost 값은 roomJoined 이벤트에서 결정되므로 여기서 강제로 false로 덮어쓰지 않음
        socket.emit('joinRoom', { roomCode: code, nickname: savedName });
        lastJoinRef.current = code;
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [code]);

    if (!roomCode) {
      return <div style={{ padding: 24 }}>방에 연결 중...</div>;
    }
    return (
      <div className="app">
        <div className="app-container">
          <RoomHeader roomCode={roomCode} nickname={nickname} participants={participants} isHost={isHost} onLeaveRoom={handleLeaveRoom} />
          <MusicPlayer
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            onPlayPause={handlePlayPause}
            onNext={handleNextTrack}
            onEnded={handleTrackEnded}
            isHost={isHost}
            onDeviceReady={handleDeviceReady}
          />
          <PlaylistQueue queue={queue} currentTrack={currentTrack} onPlayTrack={handlePlayTrack} onVoteTrack={handleVoteTrack} isHost={isHost} playlistMode={playlistMode} playlistCursor={playlistCursor} />
          <MusicSearch onAddTrack={handleAddTrack} currentRoom={roomCode} nickname={nickname} forcedPlatform={roomPlatform} />
          <ChatWindow roomCode={roomCode} nickname={nickname} messages={chatMessages} onSendMessage={handleSendMessage} />
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage onCreateRoom={handleRoomCreated} onJoinRoom={handleRoomJoined} />} />
      <Route path="/room/:code" element={<RoomPage />} />
      <Route path="/callback" element={<CallbackPage />} />
    </Routes>
  );
}

export default App;