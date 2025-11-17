// src/components/SpotifyPlayer.js (전체 코드)

import React, { useEffect, useState, useCallback, useRef } from 'react';

// 단순화된 SpotifyPlayer: 최소 SDK 연결 + 재생/일시정지/다음/이전
// 외부 props: currentTrack ( { id, uri, platform } ), isPlaying (boolean), onPlayPause(), onNext(), isHost

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

export default function SpotifyPlayer({ currentTrack, isPlaying, onPlayPause, onNext, onEnded, isHost }) {
  const [player, setPlayer] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [currentSdkTrack, setCurrentSdkTrack] = useState(null);
  const [isPaused, setIsPaused] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [volume, setVolume] = useState(50);
  const lastPlayedTrackRef = useRef(null);
  const initRef = useRef(false);
  const controlInFlightRef = useRef(false);
  const playInFlightRef = useRef(false);
  const lastControlAtRef = useRef(0);
  const lastPlayAtRef = useRef(0);
  const volumeDebounceRef = useRef(null);
  const endedTrackRef = useRef(null);
  const lastPositionRef = useRef(0);

  const getStoredSpotifyUser = useCallback(() => {
    try { return JSON.parse(localStorage.getItem('spotifyUser')); } catch { return null; }
  }, []);

  const fetchPlaybackToken = useCallback(async (userId) => {
    const resp = await fetch(`${API_BASE_URL}/api/spotify/playback/${userId}`);
    if (!resp.ok) throw new Error('playback token fetch 실패');
    const data = await resp.json();
    return data.accessToken;
  }, []);

  // SDK 로드 및 초기화 (단일 인스턴스 보장)
  useEffect(() => {
    if (!isHost) return; // 호스트만 재생 장치 세팅
    if (initRef.current) return; // 중복 초기화 방지 (StrictMode 등)

    const initPlayer = async () => {
      const user = getStoredSpotifyUser();
      if (!user?.userId) return;
      let token;
      try { token = await fetchPlaybackToken(user.userId); } catch (e) { console.error('[SpotifyPlayer] 토큰 실패', e); return; }
      const spPlayer = new window.Spotify.Player({
        name: 'VibeLink Web Player',
        getOAuthToken: cb => cb(token),
        volume: volume / 100
      });

      spPlayer.addListener('ready', ({ device_id }) => {
        console.log('[SpotifyPlayer] Ready deviceId=', device_id);
        setDeviceId(device_id);
      });
      spPlayer.addListener('not_ready', ({ device_id }) => {
        console.log('[SpotifyPlayer] Device offline', device_id);
      });
      spPlayer.addListener('player_state_changed', (state) => {
        if (!state) { setIsActive(false); return; }
        setCurrentSdkTrack(state.track_window.current_track);
        setIsPaused(state.paused);
        setIsActive(true);
        // --- 종료 감지 보강 ---
        try {
          const curId = state.track_window?.current_track?.id;
          const dur = typeof state.duration === 'number' ? state.duration : (state.track_window?.current_track?.duration_ms || 0);
          const pos = typeof state.position === 'number' ? state.position : 0;
          const nearingEnd = dur > 0 && pos >= Math.max(0, dur - 800);
          const justResetToZero = state.paused && lastPositionRef.current > 1000 && pos === 0;
          // 동일 트랙에 대해 한 번만 onEnded 호출
          if (onEnded && lastPlayedTrackRef.current && curId === lastPlayedTrackRef.current) {
            if ((state.paused && nearingEnd) || justResetToZero) {
              if (endedTrackRef.current !== curId) {
                endedTrackRef.current = curId;
                onEnded();
              }
            }
          }
          lastPositionRef.current = pos;
        } catch {}
      });
      spPlayer.connect().then(success => { if (success) setPlayer(spPlayer); });
    };

    const existing = document.getElementById('spotify-player-js');
    const start = () => { if (!initRef.current) { initRef.current = true; initPlayer(); } };

    if (window.Spotify) {
      start();
    } else if (existing) {
      window.onSpotifyWebPlaybackSDKReady = start;
    } else {
      const script = document.createElement('script');
      script.id = 'spotify-player-js';
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;
      document.body.appendChild(script);
      window.onSpotifyWebPlaybackSDKReady = start;
    }

    return () => {
      try { player?.disconnect(); } catch {}
      // 스크립트는 유지하여 다른 화면 이동 시 재사용 (중복 생성 방지)
    };
  }, [isHost, fetchPlaybackToken, getStoredSpotifyUser]);

  // 볼륨 변경 시 반영 (SDK 초기화와 분리)
  useEffect(() => {
    if (!player) return;
    (async () => { try { await player.setVolume(volume / 100); } catch {} })();
  }, [player, volume]);

  // 트랙 변경 시 재생 (한 번만 시도)
  useEffect(() => {
    if (!isHost) return;
    const id = currentTrack?.id;
    if (!id || currentTrack.platform !== 'spotify') return;
    if (!deviceId) return;
    if (!isPlaying) return; // 외부가 play 상태일 때만 시작
    const user = getStoredSpotifyUser();
    if (!user?.userId) return;
    const trackUri = currentTrack.uri || `spotify:track:${id}`;
    if (lastPlayedTrackRef.current === id) return;
    lastPlayedTrackRef.current = id;
    endedTrackRef.current = null; // 새 트랙에 대해 종료 플래그 초기화
    try { player?.activateElement && player.activateElement(); } catch {}
    const now = Date.now();
    if (playInFlightRef.current || (now - lastPlayAtRef.current) < 300) return;
    playInFlightRef.current = true;
    lastPlayAtRef.current = now;
    fetch(`${API_BASE_URL}/api/spotify/play`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.userId, deviceId, trackUri })
    }).then(r => {
      if (!r.ok) console.warn('[SpotifyPlayer] play 실패 status=', r.status);
    }).catch(e => console.warn('[SpotifyPlayer] play 네트워크 오류', e))
      .finally(() => { playInFlightRef.current = false; });
  }, [currentTrack?.id, isPlaying, isHost, deviceId, getStoredSpotifyUser, player]);

  // isPlaying 토글에 따른 pause/resume
  useEffect(() => {
    if (!isHost || !deviceId || !player) return;
    const user = getStoredSpotifyUser();
    if (!user?.userId) return;
    const action = isPlaying ? 'resume' : 'pause';
    const now = Date.now();
    if (controlInFlightRef.current || (now - lastControlAtRef.current) < 250) return;
    controlInFlightRef.current = true;
    lastControlAtRef.current = now;
    fetch(`${API_BASE_URL}/api/spotify/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.userId, deviceId, action })
    }).catch(e => console.warn('[SpotifyPlayer] control 오류', action, e))
      .finally(() => { controlInFlightRef.current = false; });
  }, [isPlaying, isHost, deviceId, player, getStoredSpotifyUser]);

  const handlePlayPauseClick = () => {
    onPlayPause && onPlayPause(); // 부모에 상태 토글 위임
  };

  const handlePrev = () => {
    const user = getStoredSpotifyUser();
    if (!isHost || !user?.userId || !deviceId) return;
    fetch(`${API_BASE_URL}/api/spotify/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.userId, deviceId, action: 'previous' })
    }).catch(()=>{});
  };

  const handleNext = () => {
    // 내장 next 제어 제거: 앱 큐에 맞춰 다음 트랙만 재생
    if (!isHost) return;
    onNext && onNext();
  };

  const handleVolume = (e) => {
    const v = Number(e.target.value);
    setVolume(v);
    if (!player) return;
    if (volumeDebounceRef.current) clearTimeout(volumeDebounceRef.current);
    volumeDebounceRef.current = setTimeout(async () => {
      try { await player.setVolume(v / 100); } catch {}
    }, 200);
  };

  const track = currentSdkTrack || currentTrack;
  const art = track?.album?.images?.[0]?.url || track?.thumbnailUrl || 'https://via.placeholder.com/100';
  const title = track?.name || track?.title || '대기중';
  const artist = track?.artists?.[0]?.name || '';

  return (
    <div className="simple-spotify-player" style={{ display:'flex', gap:16, alignItems:'center', padding:12, border:'1px solid #ddd', borderRadius:8 }}>
      <img src={art} alt="art" style={{ width:64, height:64, objectFit:'cover', borderRadius:4 }} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontWeight:600, fontSize:14, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{title}</div>
        <div style={{ fontSize:12, color:'#555', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{artist}</div>
        <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:8 }}>
          <button onClick={handlePrev} disabled={!isHost}>⏮</button>
          <button onClick={handlePlayPauseClick} disabled={!isHost}>{isPlaying ? (isPaused ? '▶️' : '⏸️') : '▶️'}</button>
          <button onClick={handleNext} disabled={!isHost}>⏭</button>
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ fontSize:12 }}>🔊</span>
            <input type="range" min={0} max={100} value={volume} onChange={handleVolume} />
          </div>
        </div>
      </div>
      {!isActive && isHost && <div style={{ fontSize:11, color:'#a00' }}>플레이어 준비 중… Spotify 앱이 켜져있어야 빠릅니다.</div>}
    </div>
  );
}