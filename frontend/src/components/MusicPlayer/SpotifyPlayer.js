import React, { useEffect, useRef, useState, useCallback } from 'react';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

export default function SpotifyPlayer({ currentTrack, isPlaying, onPlayPause, onNext, onEnded, isHost }) {
  const [player, setPlayer] = useState(null);
  // --- [핵심 수정 1] --- deviceId를 ref가 아닌 state로 관리하여 변경을 감지
  const [deviceId, setDeviceId] = useState(null);
  const lastTrackIdRef = useRef(null);
  
  // SDK가 직접 알려주는 실시간 상태
  const [isActive, setActive] = useState(false);
  const [sdkCurrentTrack, setSdkCurrentTrack] = useState(null);
  const [isPaused, setIsPaused] = useState(true);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);

  const [volume, setVolume] = useState(80);
  const [sdkReady, setSdkReady] = useState(false);

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
    return () => { player?.disconnect(); document.body.removeChild(script); try { delete window.onSpotifyWebPlaybackSDKReady; } catch {} };
  }, [player]);

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
      // --- [핵심 수정 2] --- state를 업데이트하여 리렌더링 및 useEffect 트리거
      setDeviceId(device_id); 
    });

    spotifyPlayer.addListener('player_state_changed', (state) => {
      if (!state) { setActive(false); return; }
      setSdkCurrentTrack(state.track_window.current_track);
      setIsPaused(state.paused);
      setPositionMs(state.position);
      setDurationMs(state.duration);
      setActive(true);
    });
    
    spotifyPlayer.addListener('not_ready', () => setDeviceId(null));

    spotifyPlayer.connect().then(success => {
      if (success) setPlayer(spotifyPlayer);
    });

    return () => spotifyPlayer.disconnect();
  }, [sdkReady, isHost, player, fetchPlaybackToken, getStoredSpotifyUser, volume]);

  // 'deviceId'가 준비되면, 장치를 활성화
  useEffect(() => {
    if (!isHost || !deviceId) return;
    const user = getStoredSpotifyUser();
    if (!user?.userId) return;

    console.log(`[명령] deviceId (${deviceId}) 준비 완료, 장치 활성화 요청`);
    fetch(`${API_BASE_URL}/api/spotify/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.userId, deviceId: deviceId }),
    });
  }, [deviceId, isHost, getStoredSpotifyUser]);
  
  // 백엔드에 제어 명령을 보내는 통합 함수
  const sendControlCommand = useCallback((action) => {
    if (!isHost || !deviceId) return;
    const user = getStoredSpotifyUser();
    if (!user?.userId) return;
    fetch(`${API_BASE_URL}/api/spotify/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.userId, deviceId: deviceId, action: action }),
    });
  }, [isHost, deviceId, getStoredSpotifyUser]);

  // 부모의 상태(props)와 'deviceId'가 모두 준비되었을 때 명령을 보냄
  useEffect(() => {
    // --- [핵심 수정 3] --- deviceId가 없으면 절대 명령을 보내지 않음
    if (!isHost || !player || !deviceId || currentTrack?.platform !== 'spotify') return;
    const user = getStoredSpotifyUser();
    if (!user?.userId) return;

    if (currentTrack.id && lastTrackIdRef.current !== currentTrack.id) {
      lastTrackIdRef.current = currentTrack.id;
      if (isPlaying) {
        console.log(`[명령] 새 트랙 재생: ${currentTrack.title} on device ${deviceId}`);
        fetch(`${API_BASE_URL}/api/spotify/play`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.userId,
            deviceId: deviceId,
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
  // --- [핵심 수정 4] --- deviceId를 의존성 배열에 추가
  }, [currentTrack, isPlaying, isHost, player, deviceId, isActive, isPaused, sendControlCommand, getStoredSpotifyUser, deviceId]);

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
                type="range" min={0} max={durationMs || 1} value={positionMs} 
                onMouseUp={handleSeek} onChange={(e) => setPositionMs(Number(e.target.value))}
                className="spotify-progress-bar" disabled={!isHost || !isActive} 
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
            <input type="range" min={0} max={100} value={volume} onChange={handleVolume} disabled={!isHost || !isActive} />
          </div>
        </div>
      </div>
    </div>
  );
}