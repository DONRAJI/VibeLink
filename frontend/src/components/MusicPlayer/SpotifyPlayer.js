import React, { useEffect, useRef, useState, useCallback } from 'react';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

export default function SpotifyPlayer({ currentTrack, isPlaying, onPlayPause, onNext, onEnded, isHost }) {
  const [player, setPlayer] = useState(null);
  const deviceIdRef = useRef(null);
  const lastTrackIdRef = useRef(null);
  const [is_active, setActive] = useState(false); // 현재 우리 플레이어가 활성 상태인지
  const [current_track_sdk, setTrack] = useState(null); // SDK가 직접 알려주는 현재 트랙 정보
  const [is_paused, setPaused] = useState(true); // SDK가 알려주는 일시정지 상태
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

  // --- [핵심 수정 1] --- 공식 문서의 초기화, 연결, 이벤트 리스너 설정 플로우
  useEffect(() => {
    if (!sdkReady || !isHost || player) return;

    const user = getStoredSpotifyUser();
    if (!user?.userId) return;

    // 1. 플레이어 객체 생성
    const spotifyPlayer = new window.Spotify.Player({
      name: 'VibeLink Web Player',
      getOAuthToken: cb => fetchPlaybackToken(user.userId).then(cb),
      volume: volume / 100,
    });

    // 2. 이벤트 리스너 연결
    spotifyPlayer.addListener('ready', ({ device_id }) => {
      console.log('[SpotifyPlayer] 기기 준비 완료, ID:', device_id);
      deviceIdRef.current = device_id;
      // '준비'되면 즉시 '활성화' 요청 (장치 깨우기)
      fetch(`${API_BASE_URL}/api/spotify/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.userId, deviceId: device_id }),
      })
      .then(() => console.log('[SpotifyPlayer] 장치 활성화 요청 성공'))
      .catch(e => console.error('[SpotifyPlayer] 장치 활성화 요청 실패:', e));
    });

    spotifyPlayer.addListener('not_ready', ({ device_id }) => console.warn(`기기 ${device_id} 오프라인`));
    
    // 플레이어 상태 변경 시, SDK가 보내주는 최신 정보로 내부 상태 업데이트
    spotifyPlayer.addListener('player_state_changed', (state) => {
      if (!state) {
        setActive(false);
        return;
      }
      setTrack(state.track_window.current_track);
      setPaused(state.paused);
      setPositionMs(state.position);
      setDurationMs(state.duration);
      setActive(true);
      
      // 트랙 종료 감지 로직 (이전과 동일)
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

    // 3. Spotify 서버와 연결 (가장 중요!)
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


  // --- [핵심 수정 2] --- '재생 제어'는 이제 '명령'만 전달
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

    // 같은 트랙에서 재생/일시정지 토글 (SDK 직접 제어)
    if (is_active) {
      player.togglePlay();
    }

  }, [currentTrack, isPlaying, isHost, player, getStoredSpotifyUser, is_active]);

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
      setPositionMs(newPos); // UI 즉각 반응
    }
  };

  const fmt = (ms) => {
    if (isNaN(ms) || ms < 0) return '0:00';
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

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
            <button className="spotify-control-btn spotify-play-pause-btn" onClick={() => { activateAudio(); onPlayPause(); }} disabled={!isHost}>
              {isPlaying ? '⏸️' : '▶️'}
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