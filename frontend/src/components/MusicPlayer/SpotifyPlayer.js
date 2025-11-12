import React, { useEffect, useRef, useState, useCallback } from 'react';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

export default function SpotifyPlayer({ currentTrack, isPlaying, onPlayPause, onNext, onEnded, isHost }) {
  // 상태 관리: player 객체, deviceId 등
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
  const [audioActivated, setAudioActivated] = useState(false);

  // 헬퍼 함수: 로컬 스토리지, 토큰 가져오기
  const getStoredSpotifyUser = useCallback(() => {
    try { return JSON.parse(localStorage.getItem('spotifyUser')); } catch { return null; }
  }, []);

  const fetchPlaybackToken = useCallback(async (userId) => {
    const resp = await fetch(`${API_BASE_URL}/api/spotify/playback/${userId}`);
    if (!resp.ok) throw new Error('토큰을 가져오지 못했습니다');
    return (await resp.json()).accessToken;
  }, []);

  // SDK 스크립트 로드
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

  // SDK 초기화, 연결, 이벤트 리스너 설정
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
      console.log('[SDK] 상태 변경 감지', state);
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
  
  // 백엔드에 제어 명령을 보내는 통합 함수
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


  // 부모 컴포넌트의 상태(props)가 변경될 때 '명령'을 보냄
  useEffect(() => {
    if (!isHost || !player || !deviceIdRef.current || currentTrack?.platform !== 'spotify') return;
    const user = getStoredSpotifyUser();
    if (!user?.userId) return;

    // 새 트랙 재생 명령
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

    // 재생/일시정지 상태 동기화 명령
    if (isActive) {
      if (isPlaying && isPaused) sendControlCommand('resume');
      else if (!isPlaying && !isPaused) sendControlCommand('pause');
    }
  }, [currentTrack, isPlaying, isHost, player, getStoredSpotifyUser, isActive, isPaused, sendControlCommand]);

  const activateAudio = async () => {
    // Web Playback SDK는 사용자 제스처가 필요할 수 있음
    if (!player) return;
    try {
      await player.activateElement();
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
    // SDK seek는 Premium 사용자에게만 작동하며, API 호출이 더 안정적일 수 있음
    // 여기서는 player.seek()를 우선 사용
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

  // UI 렌더링 시 SDK 상태(sdkCurrentTrack)를 우선적으로 사용
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
                onMouseUp={handleSeek} // 드래그 끝날 때만 seek
                onChange={(e) => setPositionMs(Number(e.target.value))} // 드래그 중에는 UI만 업데이트
                className="spotify-progress-bar" 
                disabled={!isHost || !isActive} 
              />
              <span>{fmt(durationMs)}</span>
            </div>
          </div>
          <div className="spotify-controls">
            <button className="spotify-control-btn" onClick={() => sendControlCommand('previous')} disabled={!isHost || !isActive}>⏮️</button>
            <button className="spotify-control-btn spotify-play-pause-btn" onClick={onPlayPause} disabled={!isHost || !isActive}>
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