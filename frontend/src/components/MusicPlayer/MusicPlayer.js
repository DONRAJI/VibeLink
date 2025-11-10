// /frontend/src/App.js

import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import SplashScreen from './components/SplashScreen/SplashScreen';
import RoomEntry from './components/RoomEntry/RoomEntry';
import RoomHeader from './components/RoomHeader/RoomHeader';
import ChatWindow from './components/ChatWindow/ChatWindow';
import MusicPlayer from './components/MusicPlayer/MusicPlayer';
import PlaylistQueue from './components/PlaylistQueue/PlaylistQueue';
import MusicSearch from './components/MusicSearch/MusicSearch';
import './App.css';

// Socket.IO 연결 - 환경변수 사용 및 연결 안정성 개선
const socket = io(process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000', {
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  timeout: 20000,
  forceNew: true
});

function App() {
  // 앱 상태
  const [showSplash, setShowSplash] = useState(true);
  const [currentView, setCurrentView] = useState('entry'); // 'entry', 'room'
  
  // 방 관련 상태
  const [roomCode, setRoomCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [participants, setParticipants] = useState([]);
  
  // 음악 관련 상태
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Socket.IO 이벤트 리스너 설정
  useEffect(() => {
    // 연결 상태 로깅
    socket.on('connect', () => {
      console.log('✅ 서버에 연결되었습니다:', socket.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('❌ 서버 연결이 끊어졌습니다:', reason);
    });

    socket.on('connect_error', (error) => {
      console.error('🔌 연결 오류:', error);
    });

    // 방 참가 성공
    socket.on('roomJoined', (room) => {
      console.log('✅ 방에 성공적으로 참가했습니다:', room.code);
      // currentTrack 정합성 보정: videoId 없으면 null로 처리
      setCurrentTrack(room.currentTrack && room.currentTrack.videoId ? room.currentTrack : null);
      setIsPlaying(room.isPlaying);
      setQueue(room.queue || []);
      setParticipants(room.participants || []);
      setIsHost(room.host === nickname);
      setChatMessages([]); // 초기화, 이후 history 이벤트로 수신
      setUnreadCount(0); // 방에 새로 들어오면 0으로 초기화
    });

    // 방 참가 실패
    socket.on('roomError', (error) => {
      alert(error.message);
    });

    // 트랙 추가됨
    socket.on('trackAdded', (track) => {
      setQueue(prevQueue => [...prevQueue, track]);
    });

    // 큐 업데이트
    socket.on('queueUpdated', (newQueue) => {
      setQueue(newQueue);
    });

    // 재생 제어
    socket.on('playbackControlled', ({ action, track, isPlaying: newIsPlaying }) => {
      if (action === 'play' && track) {
        setCurrentTrack(track && track.videoId ? track : null);
        setIsPlaying(true);
      } else if (action === 'pause') {
        setIsPlaying(false);
      } else if (action === 'next') {
        if (track) {
          setCurrentTrack(track && track.videoId ? track : null);
          setIsPlaying(true);
        } else {
          setCurrentTrack(null);
          setIsPlaying(false);
        }
      }
      setIsPlaying(newIsPlaying);
    });

    // 참가자 목록 업데이트
    socket.on('participantsUpdated', (newParticipants) => {
      setParticipants(newParticipants);
    });

    // 채팅 기록 수신
    socket.on('chatHistory', (history) => {
      setChatMessages(history || []);
    });

    // 새 채팅 메시지 수신
    socket.on('newChatMessage', (entry) => {
      setChatMessages(prev => [...prev, entry]);
      
      // === 📍 1. 수정된 부분 ===
      // 내가 보낸 메시지가 아닐 때 unreadCount 증가
      if (currentView === 'room' && entry.user !== nickname) {
        setUnreadCount(c => c + 1);
      }
    });


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
  }, [nickname, currentView]); // 의존성 배열에 nickname, currentView 포함

  // 스플래시 화면 완료
  const handleSplashComplete = () => {
    setShowSplash(false);
  };

  // 방 생성
  const handleRoomCreated = (code, hostNickname) => {
    setRoomCode(code);
    setNickname(hostNickname);
    setIsHost(true);
    setCurrentView('room');
    
    // 방에 참가
    socket.emit('joinRoom', { roomCode: code, nickname: hostNickname });
  };

  // 방 참가
  const handleRoomJoined = (code, userNickname) => {
    setRoomCode(code);
    setNickname(userNickname);
    setIsHost(false);
    setCurrentView('room');
    
    // 방에 참가
    socket.emit('joinRoom', { roomCode: code, nickname: userNickname });
  };

  // 방 나가기
  const handleLeaveRoom = () => {
    socket.emit('disconnect'); // 소켓 연결 해제 (또는 'leaveRoom' 이벤트)
    setCurrentView('entry');
    setRoomCode('');
    setNickname('');
    setIsHost(false);
    setCurrentTrack(null);
    setIsPlaying(false);
    setQueue([]);
    setParticipants([]);
    setChatMessages([]);
    setUnreadCount(0); // 방을 나갈 때 0으로 초기화
  };

  // 트랙 추가
  const handleAddTrack = (track) => {
    socket.emit('addTrack', {
      roomCode,
      track,
      addedBy: nickname
    });
  };

  // 재생/일시정지
  const handlePlayPause = () => {
    const newIsPlaying = !isPlaying;
    setIsPlaying(newIsPlaying);
    
    socket.emit('controlPlayback', {
      roomCode,
      action: newIsPlaying ? 'play' : 'pause',
      track: currentTrack
    });
  };

  // 다음 곡 재생
  const handleNextTrack = () => {
    socket.emit('controlPlayback', {
      roomCode,
      action: 'next'
    });
  };

  // 특정 곡 재생
  const handlePlayTrack = (track) => {
    socket.emit('controlPlayback', {
      roomCode,
      action: 'play',
      track
    });
  };

  // 곡이 끝남
  const handleTrackEnded = () => {
    handleNextTrack();
  };

  // (Auto-DJ 토글 제거)

  // 투표
  const handleVoteTrack = (videoId, voteType) => {
    socket.emit('voteTrack', {
      roomCode,
      videoId,
      voteType
    });
  };

  // 채팅 전송
  const handleSendMessage = (text) => {
    if (!text || !roomCode) return;
    socket.emit('chatMessage', {
      roomCode,
      user: nickname,
      message: text
    });
    // === 📍 2. 수정된 부분 ===
    setUnreadCount(0); // 메시지를 보냈다는 것은 채팅방을 확인했다는 의미
  };

  if (showSplash) {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  if (currentView === 'entry') {
    return (
      <RoomEntry 
        onRoomCreated={handleRoomCreated}
        onRoomJoined={handleRoomJoined}
      />
    );
  }

  return (
    <div className="app">
      <div className="app-container">
        <RoomHeader
          roomCode={roomCode}
          nickname={nickname}
          participants={participants}
          isHost={isHost}
          onLeaveRoom={handleLeaveRoom}
        />
        
        <MusicPlayer
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          onPlayPause={handlePlayPause}
          onNext={handleNextTrack}
          onEnded={handleTrackEnded}
          isHost={isHost}
        />
        
        <PlaylistQueue
          queue={queue}
          currentTrack={currentTrack}
          onPlayTrack={handlePlayTrack}
          onVoteTrack={handleVoteTrack}
          isHost={isHost}
        />
        
        <MusicSearch
          onAddTrack={handleAddTrack}
          currentRoom={roomCode}
          nickname={nickname}
        />

        { /* === 📍 3. 수정된 부분 === */ }
        <ChatWindow
          roomCode={roomCode}
          nickname={nickname}
          messages={chatMessages}
          onSendMessage={handleSendMessage}
          unreadCount={unreadCount} 
          onReadMessages={() => setUnreadCount(0)}
        />
      </div>
    </div>
  );
}

export default App;