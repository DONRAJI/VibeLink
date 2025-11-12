import React, { useEffect, useRef, useState, useCallback } from 'react';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

export default function SpotifyPlayer({ currentTrack, isPlaying, onPlayPause, onNext, onEnded, isHost }) {
  // 상태 관리
  const [player, setPlayer] = useState(null);
  const deviceIdRef = useRef(null);
  const lastTrackIdRef = useRef(null);
  
  // SDK가 직접 알려주는 실시간 상태
  const [isActive, setActive] = useState(false);
  const [sdkCurrentTrack, setSdkCurrentTrack] = useState(null);
  const [isPaused, setIsPaused] = useState(true);
  
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [volume, setVolume] = useState(80);
  const [sdkReady, setSdkReady] = useState(false);
  
  // --- [수정] --- audioActivated 상태와 setter 함수를 다시 사용합니다.
  const [audioActivated, setAudioActivated] = useState(false);

  const getStoredSpotifyUser = useCallback(() => {
    try { return JSON.parse(localStorage.getItem('spotifyUser')); } catch { return null; }
  }, []);

  const fetchPlaybackToken = useCallback(async (userId) => {
    const resp = await fetch(`${API_BASE_URL}/api/spotify/playback/${userId}`);
    if (!resp.ok) throw new Error('토큰을 가져오지 못했습니다');
    return (await resp.json()).accessToken;
  }, []);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    document.body.appendChild(script);
    window.onSpotifyWebPlaybackSDKReady = () => setSdkReady(true);
    return () => {
      document.body.removeChild(script);
      try { delete window.onSpotifyWebPlaybackSDKReady; } catch {}
    };
  }, []);

  const endedRef = useRef(onEnded);
  useEffect(() => { endedRef.current = onEnded; }, [onEnded]);

  useEffect(() => {
    if (!sdkReady || !isHost || player) return;
    const user = getStoredSpotifyUser();
    if (!user?.userId) return;

    const spotifyPlayer = new window.Spotify.Player({
      name: 'VibeLink Web Player',
      getOAuthToken: cb => fetchPlaybackToken(user.userId).then(cb),
      volume: volume / 100,
    });

    spotifyPlayer.addListener('ready', ({ device_id }) => {
      console.log('[SDK] 기기 준비 완료, ID:', device_id);
      deviceIdRef.current = device_id;
      fetch(`${API_BASE_URL}/api/spotify/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.userId, deviceId: device_id }),
      });
    });

    spotifyPlayer.addListener('player_state_changed', (state) => {
      if (!state) {
        setActive(false);
        return;
      }
      setSdkCurrentTrack(state.track_window.current_track);
      setIsPaused(state.paused);
      setPositionMs(state.position);
      setDurationMs(state.duration);
      setActive(true);
      
      const prev = state.track_window?.previous_tracks?.[0];
      if (state.paused && prev && lastTrackIdRef.current && prev.id === lastTrackIdRef.current && state.position === 0) {
        endedRef.current?.();
      }
    });
    
    spotifyPlayer.addListener('not_ready', ({ device_id }) => console.warn(`기기 ${device_id} 오프라인`));
    spotifyPlayer.addListener('initialization_error', ({ message }) => console.error('초기화 오류:', message));
    spotifyPlayer.addListener('authentication_error', ({ message }) => console.error('인증 오류:', message));
    spotifyPlayer.addListener('account_error', ({ message }) => console.error('계정 오류:', message));

    spotifyPlayer.connect().then(success => {
      if (success) {
        console.log('[SDK] 성공적으로 연결됨');
        setPlayer(spotifyPlayer);
      }
    });

    return () => {
      console.log('[SDK] 연결 해제');
      player?.disconnect();
    };
  }, [sdkReady, isHost, player, fetchPlaybackToken, getStoredSpotifyUser, volume]);
  
  const sendControlCommand = useCallback((action) => {
    if (!isHost || !deviceIdRef.current) return;
    const user = getStoredSpotifyUser();
    if (!user?.userId) return;

    console.log(`[명령] 백엔드에 '${action}' 요청`);
    fetch(`${API_BASE_URL}/api/spotify/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.userId,
        deviceId: deviceIdRef.current,
        action: action,
      }),
    }).catch(e => console.error(`'${action}' 명령 전송 실패:`, e));
  }, [isHost, getStoredSpotifyUser]);


  useEffect(() => {
    if (!isHost || !player || !deviceIdRef.current || currentTrack?.platform !== 'spotify') return;
    const user = getStoredSpotifyUser();
    if (!user?.userId) return;

    if (currentTrack.id && lastTrackIdRef.current !== currentTrack.id) {
      lastTrackIdRef.current = currentTrack.id;
      if (isPlaying) {
        console.log(`[명령] 새 트랙 재생: ${currentTrack.title}`);
        fetch(`${API_BASE_URL}/api/spotify/play`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.userId,
            deviceId: deviceIdRef.current,
            trackUri: currentTrack.uri || `spotify:track:${currentTrack.id}`,
          }),
        });
      }
      return;
    }

    if (isActive) {
      if (isPlaying && isPaused) sendControlCommand('resume');
      else if (!isPlaying && !isPaused) sendControlCommand('pause');
    }
  }, [currentTrack, isPlaying, isHost, player, getStoredSpotifyUser, isActive, isPaused, sendControlCommand]);

  // --- [수정] --- activateAudio 함수를 다시 정의하고 사용합니다.
  const activateAudio = async () => {
    if (audioActivated || !player) return; // 이미 활성화되었거나 player가 없으면 실행 안 함
    try {
      await player.activateElement();
      setAudioActivated(true); // 한 번만 실행되도록 상태 변경
      console.log('[SDK] 오디오 컨텍스트 활성화 성공');
    } catch (e) {
      console.warn('오디오 활성화 실패:', e);
    }
  };

  const handleVolume = async (e) => {
    const v = Number(e.target.value);
    setVolume(v);
    if (player) {
      await player.setVolume(v / 100).catch(err => console.error('볼륨 설정 실패:', err));
    }
  };

  const handleSeek = (e) => {
    const newPos = Number(e.target.value);
    if (player) {
      player.seek(newPos).then(() => {
        setPositionMs(newPos);
      });
    }
  };

  const fmt = (ms) => {
    if (isNaN(ms) || ms < 0) return '0:00';
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const displayTrack = sdkCurrentTrack || currentTrack;
  const art = displayTrack?.album?.images[0]?.url || displayTrack?.thumbnailUrl || 'https://via.placeholder.com/160';
  const title = displayTrack?.name || displayTrack?.title || '재생 준비';

  return (
    <div className="player-container" style={{ position: 'relative' }}>
      <div className="spotify-player-skinned">
        <div className="spotify-card">
          <img src={art} alt="Album Art" className="spotify-art" />
          <div className="spotify-track-info">
            <h3 className="spotify-title">{title}</h3>
            <div className="spotify-progress-container">
              <span>{fmt(positionMs)}</span>
              <input 
                type="range" 
                min={0} 
                max={durationMs || 1} 
                value={positionMs} 
                onMouseUp={handleSeek}
                onChange={(e) => setPositionMs(Number(e.target.value))}
                className="spotify-progress-bar" 
                disabled={!isHost || !isActive} 
              />
              <span>{fmt(durationMs)}</span>
            </div>
          </div>
          <div className="spotify-controls">
            <button className="spotify-control-btn" onClick={() => sendControlCommand('previous')} disabled={!isHost || !isActive}>⏮️</button>
            {/* --- [수정] --- onClick 핸들러에서 activateAudio를 호출하도록 변경 */}
            <button 
              className="spotify-control-btn spotify-play-pause-btn" 
              onClick={() => {
                activateAudio(); // 오디오 활성화 시도
                onPlayPause();   // 부모의 재생/일시정지 로직 실행
              }} 
              disabled={!isHost || !isActive}
            >
              {isPaused ? '▶️' : '⏸️'}
            </button>
            <button className="spotify-control-btn" onClick={() => sendControlCommand('next')} disabled={!isHost || !isActive}>⏭️</button>
          </div>
          <div className="spotify-volume-container">
            <span>🔊</span>
            <input 
              type="range" 
              min={0} 
              max={100} 
              value={volume} 
              onChange={handleVolume} 
              disabled={!isHost || !isActive} 
            />
          </div>
        </div>
      </div>
    </div>
  );
}