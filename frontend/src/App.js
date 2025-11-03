// /frontend/src/App.js

import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import SplashScreen from './components/SplashScreen/SplashScreen';
import RoomEntry from './components/RoomEntry/RoomEntry';
import RoomHeader from './components/RoomHeader/RoomHeader';
import MusicPlayer from './components/MusicPlayer/MusicPlayer';
import PlaylistQueue from './components/PlaylistQueue/PlaylistQueue';
import MusicSearch from './components/MusicSearch/MusicSearch';
import './App.css';

// Socket.IO 연결 - 환경변수 사용
const socket = io(process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000');

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

  // Socket.IO 이벤트 리스너 설정
  useEffect(() => {
    // 방 참가 성공
    socket.on('roomJoined', (room) => {
      setCurrentTrack(room.currentTrack);
      setIsPlaying(room.isPlaying);
      setQueue(room.queue || []);
      setParticipants(room.participants || []);
      setIsHost(room.host === nickname);
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
      setIsPlaying(newIsPlaying);
    });

    // 참가자 목록 업데이트
    socket.on('participantsUpdated', (newParticipants) => {
      setParticipants(newParticipants);
    });

    return () => {
      socket.off('roomJoined');
      socket.off('roomError');
      socket.off('trackAdded');
      socket.off('queueUpdated');
      socket.off('playbackControlled');
      socket.off('participantsUpdated');
    };
  }, [nickname]);

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
    socket.emit('joinRoom', code);
  };

  // 방 참가
  const handleRoomJoined = (code, userNickname) => {
    setRoomCode(code);
    setNickname(userNickname);
    setIsHost(false);
    setCurrentView('room');
    
    // 방에 참가
    socket.emit('joinRoom', code);
  };

  // 방 나가기
  const handleLeaveRoom = () => {
    socket.emit('disconnect');
    setCurrentView('entry');
    setRoomCode('');
    setNickname('');
    setIsHost(false);
    setCurrentTrack(null);
    setIsPlaying(false);
    setQueue([]);
    setParticipants([]);
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

  // 투표
  const handleVoteTrack = (videoId, voteType) => {
    socket.emit('voteTrack', {
      roomCode,
      videoId,
      voteType
    });
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
      </div>
    </div>
  );
}

export default App;
