import React, { useEffect, useRef, useState, useCallback } from 'react';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

export default function SpotifyPlayer({ currentTrack, isPlaying, onPlayPause, onNext, onEnded, isHost }) {
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

  const getStoredSpotifyUser = useCallback(() => {
    try { return JSON.parse(localStorage.getItem('spotifyUser')); } catch { return null; }
  }, []);

  const fetchPlaybackToken = useCallback(async (userId) => {
    const resp = await fetch(`${API_BASE_URL}/api/spotify/playback/${userId}`);
    if (!resp.ok) throw new Error('토큰을 가져오지 못했습니다');
    return (await resp.json()).accessToken;
  }, []);

  // SDK 스크립트 로드 및 플레이어 초기화/연결
  useEffect(() => {
    if (!sdkReady || !isHost || player) return;
    const user = getStoredSpotifyUser();
    if (!user?.userId) return;

    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    document.body.appendChild(script);

    window.onSpotifyWebPlaybackSDKReady = () => {
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
        if (!state) { setActive(false); return; }
        console.log('[SDK] 상태 변경 감지', state);
        setSdkCurrentTrack(state.track_window.current_track);
        setIsPaused(state.paused);
        setPositionMs(state.position);
        setDurationMs(state.duration);
        setActive(true);
      });

      spotifyPlayer.connect().then(success => {
        if (success) {
          console.log('[SDK] 성공적으로 연결됨');
          setPlayer(spotifyPlayer);
        }
      });
    };

    return () => { player?.disconnect(); try { delete window.onSpotifyWebPlaybackSDKReady; } catch {} };
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

  // UI 렌더링 (SDK 상태를 기준으로 표시)
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
                max={durationMs || 0} 
                value={Math.min(positionMs, durationMs || 0)} 
                onChange={handleSeek} 
                className="spotify-progress-bar" 
                disabled={!isHost || !durationMs} 
              />
              <span>{fmt(durationMs)}</span>
            </div>
          </div>
          <div className="spotify-controls">
            <button className="spotify-control-btn" onClick={() => handleSeek({ target: { value: 0 } })} disabled={!isHost}>⏮️</button>
            <button className="spotify-control-btn spotify-play-pause-btn" onClick={() => { activateAudio(); onPlayPause(); }} disabled={!isHost || !isActive}>
              {/* --- [핵심 수정 4] --- 버튼 아이콘도 SDK의 isPaused 상태를 기준으로 표시 */}
              {isPaused ? '▶️' : '⏸️'}
            </button>
            <button className="spotify-control-btn" onClick={onNext} disabled={!isHost}>⏭️</button>
          </div>
          <div className="spotify-volume-container">
            <span>🔊</span>
            <input 
              type="range" 
              min={0} 
              max={100} 
              value={volume} 
              onChange={handleVolume} 
              disabled={!isHost} 
            />
          </div>
        </div>
      </div>
      {!audioActivated && isHost && (
        <button 
          onClick={activateAudio} 
          style={{ position: 'absolute', inset: 0, background: 'transparent', border: 'none', cursor: 'pointer', zIndex: 10 }} 
          title="오디오 활성화" 
        />
      )}
    </div>
  );
}