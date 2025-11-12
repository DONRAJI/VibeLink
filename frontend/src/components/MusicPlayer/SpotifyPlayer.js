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
    script.onerror = () => console.error('Spotify SDK 로드 실패');
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
        getOAuthToken: async (cb) => {
          try {
            const token = await fetchPlaybackToken(user.userId);
            cb(token);
          } catch (e) { console.error('토큰 제공 실패:', e); }
        },
        volume: volume / 100,
      });

      spotifyPlayer.addListener('ready', ({ device_id }) => {
        console.log('[SpotifyPlayer] Ready with device_id', device_id);
        deviceIdRef.current = device_id;
      });

      spotifyPlayer.addListener('player_state_changed', (state) => {
        if (!state) return;
        setPositionMs(state.position || 0);
        const dur = state.duration || state.track_window?.current_track?.duration_ms || 0;
        setDurationMs(dur);
        const prev = state.track_window?.previous_tracks?.[0];
        if (state.paused && prev && lastTrackIdRef.current && prev.id === lastTrackIdRef.current && state.position === 0) {
          endedRef.current?.();
        }
      });

      // 기타 에러 리스너
      spotifyPlayer.addListener('not_ready', ({ device_id }) => console.warn(`Device ${device_id} has gone offline`));
      spotifyPlayer.addListener('initialization_error', ({ message }) => console.error(message));
      spotifyPlayer.addListener('authentication_error', ({ message }) => console.error(message));
      spotifyPlayer.addListener('account_error', ({ message }) => console.error(message));

      const connected = await spotifyPlayer.connect();
      if (connected) setPlayer(spotifyPlayer);
    };
    setup();
    return () => {
      spotifyPlayer?.disconnect();
    };
  }, [sdkReady, player, isHost, getStoredSpotifyUser, fetchPlaybackToken, volume]);

  // --- [핵심 수정] --- 재생 제어 로직 통합
  useEffect(() => {
    const controlPlayback = async () => {
      if (!isHost || !deviceIdRef.current) return;
      const user = getStoredSpotifyUser();
      if (!user?.userId) return;

      const token = await fetchPlaybackToken(user.userId);
      const isSpotifyTrack = currentTrack?.platform === 'spotify';

      // 1. 새 트랙 재생 (가장 중요)
      if (isSpotifyTrack && currentTrack.id && lastTrackIdRef.current !== currentTrack.id && isPlaying) {
        console.log(`[SpotifyPlayer] 새 트랙 재생: ${currentTrack.title}`);
        lastTrackIdRef.current = currentTrack.id;
        // 기기 활성화 + 트랙 재생을 한 번의 API 호출로 처리!
        await fetch(`https://api.spotify.com/v1/me/player`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            device_ids: [deviceIdRef.current],
            play: true // 여기서 바로 재생 시작
          })
        });
        await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceIdRef.current}`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ uris: [currentTrack.uri || `spotify:track:${currentTrack.id}`] })
        });
        return;
      }

      // 2. 재생/일시정지 토글
      if (isSpotifyTrack) {
        const endpoint = isPlaying ? 'play' : 'pause';
        console.log(`[SpotifyPlayer] ${endpoint} 요청`);
        await fetch(`https://api.spotify.com/v1/me/player/${endpoint}?device_id=${deviceIdRef.current}`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}` }
        }).catch(e => console.error(`${endpoint} 실패:`, e));
      }
    };

    controlPlayback();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack, isPlaying, isHost, player]); // player를 의존성 배열에 추가하여 player 준비 후 실행되도록 보장

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
    const user = getStoredSpotifyUser();
    if (!user?.userId) return;
    const newPos = Number(e.target.value);
    setPositionMs(newPos);
    try {
      const token = await fetchPlaybackToken(user.userId);
      await fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${newPos}&device_id=${deviceIdRef.current}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (err) { console.error('시크 실패:', err); }
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