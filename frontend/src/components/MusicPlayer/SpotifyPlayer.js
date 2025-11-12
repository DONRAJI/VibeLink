// SpotifyPlayer.js (전체 교체)

import React, { useEffect, useRef, useState, useCallback } from 'react';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

export default function SpotifyPlayer({ currentTrack, isPlaying, onPlayPause, onNext, onEnded, isHost }) {
  const [sdkReady, setSdkReady] = useState(false);
  const [player, setPlayer] = useState(null);
  const deviceIdRef = useRef(null);
  const lastTrackIdRef = useRef(null);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [volume, setVolume] = useState(80);
  const [audioActivated, setAudioActivated] = useState(false);

  const getStoredSpotifyUser = useCallback(() => {
    try {
      const raw = localStorage.getItem('spotifyUser');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }, []);

  const fetchPlaybackToken = useCallback(async (userId) => {
    const resp = await fetch(`${API_BASE_URL}/api/spotify/playback/${userId}`);
    if (!resp.ok) throw new Error('토큰을 가져오지 못했습니다');
    const data = await resp.json();
    return data.accessToken;
  }, []);

  useEffect(() => {
    window.onSpotifyWebPlaybackSDKReady = () => setSdkReady(true);
    if (window.Spotify) {
      setSdkReady(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    document.body.appendChild(script);
    return () => {
      try { delete window.onSpotifyWebPlaybackSDKReady; } catch {}
    };
  }, []);

  const endedRef = useRef(onEnded);
  useEffect(() => { endedRef.current = onEnded; }, [onEnded]);

  useEffect(() => {
    if (!sdkReady || player || !isHost) return;
    const user = getStoredSpotifyUser();
    if (!user?.userId) return;

    let spotifyPlayer;
    const setup = async () => {
      spotifyPlayer = new window.Spotify.Player({
        name: 'VibeLink Web Player',
        getOAuthToken: (cb) => fetchPlaybackToken(user.userId).then(cb).catch(e => console.error('토큰 제공 실패:', e)),
        volume: volume / 100,
      });

      spotifyPlayer.addListener('ready', ({ device_id }) => {
        console.log('[SpotifyPlayer] 기기 준비 완료, ID:', device_id);
        deviceIdRef.current = device_id;
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

      spotifyPlayer.addListener('not_ready', ({ device_id }) => console.warn(`기기 ${device_id} 오프라인`));
      spotifyPlayer.addListener('initialization_error', ({ message }) => console.error(message));
      spotifyPlayer.addListener('authentication_error', ({ message }) => console.error(message));
      spotifyPlayer.addListener('account_error', ({ message }) => console.error(message));

      if (await spotifyPlayer.connect()) {
        setPlayer(spotifyPlayer);
      }
    };
    setup();
    return () => spotifyPlayer?.disconnect();
  }, [sdkReady, player, isHost, getStoredSpotifyUser, fetchPlaybackToken, volume]);

  // --- [핵심 수정] --- 재생 제어 로직 전체 개선
  useEffect(() => {
    const controlPlayback = async () => {
      if (!isHost || !player || !deviceIdRef.current || currentTrack?.platform !== 'spotify') {
        return;
      }
      
      const user = getStoredSpotifyUser();
      if (!user?.userId) return;

      // 1. 새로운 트랙 재생 시
      if (currentTrack.id && lastTrackIdRef.current !== currentTrack.id) {
        lastTrackIdRef.current = currentTrack.id;
        if (isPlaying) {
          try {
            console.log(`[프론트엔드->백엔드] 1. 장치 활성화 요청`);
            // --- [변경!] --- 1. 장치 활성화 API 호출
            await fetch(`${API_BASE_URL}/api/spotify/transfer`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: user.userId,
                deviceId: deviceIdRef.current,
              }),
            });

            // 잠시 딜레이를 주어 Spotify 서버가 장치 변경을 인지할 시간을 줍니다. (안정성 향상)
            await new Promise(resolve => setTimeout(resolve, 300));

            console.log(`[프론트엔드->백엔드] 2. 새 트랙 재생 요청: ${currentTrack.title}`);
            // --- [변경!] --- 2. 노래 재생 API 호출
            await fetch(`${API_BASE_URL}/api/spotify/play`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: user.userId,
                deviceId: deviceIdRef.current,
                trackUri: currentTrack.uri || `spotify:track:${currentTrack.id}`,
              }),
            });
          } catch (e) {
            console.error('백엔드를 통한 재생 제어 실패:', e);
          }
        }
        return;
      }

      // 2. 같은 트랙에서 재생/일시정지 토글
      try {
        const playerState = await player.getCurrentState();
        if (!playerState || (isPlaying && !playerState.paused) || (!isPlaying && playerState.paused)) {
          return;
        }

        if (isPlaying && playerState.paused) {
          await player.resume();
        } else if (!isPlaying && !playerState.paused) {
          await player.pause();
        }
      } catch (e) {
        console.error('재생/일시정지 제어 실패:', e);
      }
    };

    controlPlayback();
  }, [currentTrack, isPlaying, isHost, player, getStoredSpotifyUser]);


  const activateAudio = async () => {
    if (audioActivated) return;
    try {
      if (player) await player.activateElement();
      setAudioActivated(true);
    } catch (e) { console.warn('오디오 활성화 실패:', e); }
  };

  const handleVolume = async (e) => {
    const v = Number(e.target.value);
    setVolume(v);
    if (player) await player.setVolume(v / 100).catch(err => console.error('볼륨 설정 실패:', err));
  };

  const handleSeek = async (e) => {
    const newPos = Number(e.target.value);
    if (player) {
      await player.seek(newPos);
      setPositionMs(newPos); // 즉각적인 UI 피드백
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
    // ... JSX 부분은 변경 없음 ...
    <div className="player-container" style={{ position: 'relative' }}>
      <div className="spotify-player-skinned">
        <div className="spotify-card">
          <img src={art} alt="Album Art" className="spotify-art" />
          <div className="spotify-track-info">
            <h3 className="spotify-title">{currentTrack?.title || '재생 준비'}</h3>
            <div className="spotify-progress-container">
              <span>{fmt(positionMs)}</span>
              <input
                type="range" min={0} max={durationMs || 0}
                value={Math.min(positionMs, durationMs || 0)}
                onChange={handleSeek} className="spotify-progress-bar"
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
            <input type="range" min={0} max={100} value={volume} onChange={handleVolume} disabled={!isHost} />
          </div>
        </div>
      </div>
      {!audioActivated && isHost && (
        <button onClick={activateAudio} style={{ position: 'absolute', inset: 0, background: 'transparent', border: 'none', cursor: 'pointer', zIndex: 10 }} title="오디오 활성화" />
      )}
    </div>
  );
}