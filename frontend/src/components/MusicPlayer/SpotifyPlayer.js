import React, { useEffect, useRef, useState, useCallback } from 'react';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

export default function SpotifyPlayer({ currentTrack, isPlaying, onPlayPause, onNext, onEnded, isHost }) {
  // 상태 관리
  const [player, setPlayer] = useState(null);
  const deviceIdRef = useRef(null);
  const lastTrackIdRef = useRef(null);
  
  // --- [핵심 수정 1] --- SDK로부터 직접 상태를 받을 변수들
  const [isActive, setActive] = useState(false);
  const [sdkCurrentTrack, setSdkCurrentTrack] = useState(null);
  const [isPaused, setIsPaused] = useState(true);
  
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [volume, setVolume] = useState(80);
  const [sdkReady, setSdkReady] = useState(false);
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
      console.log('[SpotifyPlayer] 기기 준비 완료, ID:', device_id);
      deviceIdRef.current = device_id;
      fetch(`${API_BASE_URL}/api/spotify/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.userId, deviceId: device_id }),
      })
      .then(() => console.log('[SpotifyPlayer] 장치 활성화 요청 성공'))
      .catch(e => console.error('[SpotifyPlayer] 장치 활성화 요청 실패:', e));
    });

    spotifyPlayer.addListener('not_ready', ({ device_id }) => console.warn(`기기 ${device_id} 오프라인`));
    
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
    
    spotifyPlayer.addListener('initialization_error', ({ message }) => console.error('초기화 오류:', message));
    spotifyPlayer.addListener('authentication_error', ({ message }) => console.error('인증 오류:', message));
    spotifyPlayer.addListener('account_error', ({ message }) => console.error('계정 오류:', message));

    spotifyPlayer.connect().then(success => {
      if (success) {
        console.log('[SpotifyPlayer] SDK 성공적으로 연결됨. 이제 재생 준비 완료.');
        setPlayer(spotifyPlayer);
      }
    });

    return () => {
      console.log('[SpotifyPlayer] 연결 해제 및 정리');
      spotifyPlayer.disconnect();
    };
  }, [sdkReady, isHost, player, fetchPlaybackToken, getStoredSpotifyUser, volume]);

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
        }).catch(e => console.error('백엔드 재생 API 호출 실패:', e));
      }
      return;
    }

    // --- [핵심 수정 2] --- togglePlay() 대신 명시적인 resume/pause 호출
    if (isActive) {
      // 부모가 '재생'을 원하는데 SDK가 '일시정지' 상태이면 -> 재생
      if (isPlaying && isPaused) {
        player.resume();
      } 
      // 부모가 '일시정지'를 원하는데 SDK가 '재생' 상태이면 -> 일시정지
      else if (!isPlaying && !isPaused) {
        player.pause();
      }
    }

  }, [currentTrack, isPlaying, isHost, player, getStoredSpotifyUser, isActive, isPaused]);

  const activateAudio = async () => {
    if (audioActivated) return;
    try {
      if (player) await player.activateElement();
      setAudioActivated(true);
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

  const handleSeek = async (e) => {
    const newPos = Number(e.target.value);
    if (player) {
      await player.seek(newPos);
      setPositionMs(newPos);
    }
  };

  const fmt = (ms) => {
    if (isNaN(ms) || ms < 0) return '0:00';
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // --- [핵심 수정 3] --- UI 렌더링 시 SDK 상태(sdkCurrentTrack)를 우선적으로 사용
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