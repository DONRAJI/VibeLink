// SpotifyPlayer.js (전체 교체)

import React, { useEffect, useRef, useState, useCallback } from 'react';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

export default function SpotifyPlayer({ currentTrack, isPlaying, onPlayPause, onNext, onEnded, isHost }) {
  const [player, setPlayer] = useState(null);
  const deviceIdRef = useRef(null);
  const lastTrackIdRef = useRef(null);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [volume, setVolume] = useState(80);
  const [sdkReady, setSdkReady] = useState(false);
  const [audioActivated, setAudioActivated] = useState(false);

  const getStoredSpotifyUser = useCallback(() => {
    try {
      return JSON.parse(localStorage.getItem('spotifyUser'));
    } catch { return null; }
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

  // --- [핵심 수정 1] --- '장치 준비'와 '활성화'를 담당하는 useEffect
  useEffect(() => {
    if (!sdkReady || !isHost || player) return;

    const user = getStoredSpotifyUser();
    if (!user?.userId) return;

    const spotifyPlayer = new window.Spotify.Player({
      name: 'VibeLink Web Player',
      getOAuthToken: cb => fetchPlaybackToken(user.userId).then(cb),
      volume: volume / 100,
    });

    // 이벤트 리스너 연결
    spotifyPlayer.addListener('ready', async ({ device_id }) => {
      console.log('[SpotifyPlayer] 기기 준비 완료, ID:', device_id);
      deviceIdRef.current = device_id;
      
      // '준비'되면 즉시 '활성화' 요청을 보냄 (장치 깨우기)
      try {
        console.log('[프론트엔드->백엔드] 기기 준비 완료, 장치 활성화 요청');
        await fetch(`${API_BASE_URL}/api/spotify/transfer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.userId, deviceId: device_id }),
        });
        console.log('[SpotifyPlayer] 장치 활성화 성공');
      } catch (e) {
        console.error('[SpotifyPlayer] 장치 활성화 실패:', e);
      }
    });

    spotifyPlayer.addListener('player_state_changed', (state) => {
      if (!state) return;
      setPositionMs(state.position || 0);
      setDurationMs(state.duration || state.track_window?.current_track?.duration_ms || 0);
      const prev = state.track_window?.previous_tracks?.[0];
      if (state.paused && prev && lastTrackIdRef.current && prev.id === lastTrackIdRef.current && state.position === 0) {
        endedRef.current?.();
      }
    });
    
    // 기타 리스너
    spotifyPlayer.addListener('not_ready', ({ device_id }) => console.warn(`기기 ${device_id} 오프라인`));
    spotifyPlayer.addListener('initialization_error', ({ message }) => console.error('초기화 오류:', message));
    spotifyPlayer.addListener('authentication_error', ({ message }) => console.error('인증 오류:', message));
    spotifyPlayer.addListener('account_error', ({ message }) => console.error('계정 오류:', message));

    spotifyPlayer.connect().then(success => {
      if (success) {
        console.log('[SpotifyPlayer] SDK 성공적으로 연결됨');
        setPlayer(spotifyPlayer);
      }
    });

    return () => {
      console.log('[SpotifyPlayer] 연결 해제 중');
      spotifyPlayer.disconnect();
    };
  }, [sdkReady, isHost, player, fetchPlaybackToken, getStoredSpotifyUser, volume]);

  // --- [핵심 수정 2] --- '재생 제어'만 담당하는 useEffect
  useEffect(() => {
    if (!isHost || !player || !deviceIdRef.current || currentTrack?.platform !== 'spotify') return;
    
    const user = getStoredSpotifyUser();
    if (!user?.userId) return;

    // 새 트랙 재생
    if (currentTrack.id && lastTrackIdRef.current !== currentTrack.id) {
      lastTrackIdRef.current = currentTrack.id;
      if (isPlaying) {
        console.log(`[프론트엔드->백엔드] 새 트랙 재생 요청: ${currentTrack.title}`);
        fetch(`${API_BASE_URL}/api/spotify/play`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.userId,
            deviceId: deviceIdRef.current,
            trackUri: currentTrack.uri || `spotify:track:${currentTrack.id}`,
          }),
        }).catch(e => console.error('백엔드 재생 API 호출 실패:', e));
      }
      return;
    }

    // 같은 트랙에서 재생/일시정지 토글
    player.getCurrentState().then(state => {
      if (!state) return;
      if (isPlaying && state.paused) player.resume();
      else if (!isPlaying && !state.paused) player.pause();
    });

  }, [currentTrack, isPlaying, isHost, player, getStoredSpotifyUser]);

  // ... (나머지 JSX 및 핸들러 함수들은 변경 없음)
  
  const activateAudio = async () => { /* ... */ };
  const handleVolume = async (e) => { /* ... */ };
  const handleSeek = async (e) => {
    const newPos = Number(e.target.value);
    if (player) {
      await player.seek(newPos);
      setPositionMs(newPos);
    }
  };
  const fmt = (ms) => { /* ... */ };
  const art = currentTrack?.thumbnailUrl || 'https://via.placeholder.com/160';
  
  return (
    <div className="player-container" style={{ position: 'relative' }}>
      <div className="spotify-player-skinned">
        <div className="spotify-card">
          <img src={art} alt="Album Art" className="spotify-art" />
          <div className="spotify-track-info">
            <h3 className="spotify-title">{currentTrack?.title || '재생 준비'}</h3>
            <div className="spotify-progress-container">
              <span>{fmt(positionMs)}</span>
              <input type="range" min={0} max={durationMs || 0} value={Math.min(positionMs, durationMs || 0)} onChange={handleSeek} className="spotify-progress-bar" disabled={!isHost || !durationMs} />
              <span>{fmt(durationMs)}</span>
            </div>
          </div>
          <div className="spotify-controls">
            <button className="spotify-control-btn" onClick={() => handleSeek({ target: { value: 0 } })} disabled={!isHost}>⏮️</button>
            <button className="spotify-control-btn spotify-play-pause-btn" onClick={() => { activateAudio(); onPlayPause(); }} disabled={!isHost}>{isPlaying ? '⏸️' : '▶️'}</button>
            <button className="spotify-control-btn" onClick={onNext} disabled={!isHost}>⏭️</button>
          </div>
          <div className="spotify-volume-container">
            <span>🔊</span>
            <input type="range" min={0} max={100} value={volume} onChange={handleVolume} disabled={!isHost} />
          </div>
        </div>
      </div>
      {!audioActivated && isHost && ( <button onClick={activateAudio} style={{ position: 'absolute', inset: 0, background: 'transparent', border: 'none', cursor: 'pointer', zIndex: 10 }} title="오디오 활성화" /> )}
    </div>
  );
}