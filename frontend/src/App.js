// 원래 App 컴포넌트 (채팅 추가 전 버전) 복원
import io from 'socket.io-client';
import SplashScreen from './components/SplashScreen/SplashScreen';
import RoomEntry from './components/RoomEntry/RoomEntry';
import RoomHeader from './components/RoomHeader/RoomHeader';
import MusicPlayer from './components/MusicPlayer/MusicPlayer';
import PlaylistQueue from './components/PlaylistQueue/PlaylistQueue';
import MusicSearch from './components/MusicSearch/MusicSearch';
import './App.css';

const socket = io(process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000', {
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  timeout: 20000,
  forceNew: true
});

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [currentView, setCurrentView] = useState('entry');
  const [roomCode, setRoomCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState([]);

  useEffect(() => {
    socket.on('connect', () => console.log('✅ 서버 연결:', socket.id));
    socket.on('disconnect', (r) => console.log('❌ 연결 종료:', r));
    socket.on('connect_error', (e) => console.error('🔌 연결 오류:', e));

    socket.on('roomJoined', (room) => {
      setCurrentTrack(room.currentTrack && room.currentTrack.videoId ? room.currentTrack : null);
      setIsPlaying(room.isPlaying);
      setQueue(room.queue || []);
      setParticipants(room.participants || []);
      setIsHost(room.host === nickname);
    });

    socket.on('roomError', (err) => alert(err.message));
    socket.on('trackAdded', (track) => setQueue(prev => [...prev, track]));
    socket.on('queueUpdated', (newQueue) => setQueue(newQueue));
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
    socket.on('participantsUpdated', (p) => setParticipants(p));

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
    };
  }, [nickname]);

  const handleSplashComplete = () => setShowSplash(false);
  const handleRoomCreated = (code, hostNickname) => {
    setRoomCode(code); setNickname(hostNickname); setIsHost(true); setCurrentView('room');
    socket.emit('joinRoom', { roomCode: code, nickname: hostNickname });
  };
  const handleRoomJoined = (code, userNickname) => {
    setRoomCode(code); setNickname(userNickname); setIsHost(false); setCurrentView('room');
    socket.emit('joinRoom', { roomCode: code, nickname: userNickname });
  };
  const handleLeaveRoom = () => {
    socket.emit('disconnect');
    setCurrentView('entry');
    setRoomCode(''); setNickname(''); setIsHost(false); setCurrentTrack(null); setIsPlaying(false); setQueue([]); setParticipants([]);
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

  if (showSplash) return <SplashScreen onComplete={handleSplashComplete} />;
  if (currentView === 'entry') return <RoomEntry onRoomCreated={handleRoomCreated} onRoomJoined={handleRoomJoined} />;

  return (
    <div className="app">
      <div className="app-container">
        <RoomHeader roomCode={roomCode} nickname={nickname} participants={participants} isHost={isHost} onLeaveRoom={handleLeaveRoom} />
        <MusicPlayer currentTrack={currentTrack} isPlaying={isPlaying} onPlayPause={handlePlayPause} onNext={handleNextTrack} onEnded={handleTrackEnded} isHost={isHost} />
        <PlaylistQueue queue={queue} currentTrack={currentTrack} onPlayTrack={handlePlayTrack} onVoteTrack={handleVoteTrack} isHost={isHost} />
        <MusicSearch onAddTrack={handleAddTrack} currentRoom={roomCode} nickname={nickname} />
      </div>
    </div>
  );
}

export default App;