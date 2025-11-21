import React, { useEffect, useState, useCallback, useRef } from 'react';
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
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);

  const lastPlayedTrackRef = useRef(null);
  const initRef = useRef(false);
  const controlInFlightRef = useRef(false);
  const playInFlightRef = useRef(false);
  const lastControlAtRef = useRef(0);
  const lastPlayAtRef = useRef(0);
  const volumeDebounceRef = useRef(null);
  const endedTrackRef = useRef(null);
  const lastPositionRef = useRef(0);
  const lastSdkTrackIdRef = useRef(null);
  const ensurePlayAbortRef = useRef({ aborted: false });

  const getStoredSpotifyUser = useCallback(() => {
    try { return JSON.parse(localStorage.getItem('spotifyUser')); } catch { return null; }
  }, []);

  const fetchPlaybackToken = useCallback(async (userId) => {
    const resp = await fetch(`${API_BASE_URL}/api/spotify/playback/${userId}`);
    if (!resp.ok) throw new Error('playback token fetch 실패');
    const data = await resp.json();
    return data.accessToken;
  }, []);

  // SDK 로드 및 초기화
  useEffect(() => {
    if (!isHost) return;
    if (initRef.current) return;

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
        const currentTrackId = state.track_window?.current_track?.id;
        setCurrentSdkTrack(state.track_window.current_track);
        setIsPaused(state.paused);
        setIsActive(true);

        if (!isSeeking) {
          setPosition(state.position);
          setDuration(state.duration);
        }

        // --- 종료 감지 로직 ---
        try {
          const curId = currentTrackId;
          const dur = typeof state.duration === 'number' ? state.duration : (state.track_window?.current_track?.duration_ms || 0);
          const pos = typeof state.position === 'number' ? state.position : 0;

          const nearingEnd = dur > 0 && pos >= Math.max(0, dur - 1000);
          const justResetToZero = state.paused && lastPositionRef.current > 1000 && pos === 0;

          const prevSdkId = lastSdkTrackIdRef.current;
          const trackChangedAutomatically =
            prevSdkId &&
            lastPlayedTrackRef.current &&
            prevSdkId === lastPlayedTrackRef.current &&
            curId !== lastPlayedTrackRef.current;

          if (onEnded) {
            if (endedTrackRef.current !== lastPlayedTrackRef.current) {
              if (curId === lastPlayedTrackRef.current) {
                if ((state.paused && nearingEnd) || justResetToZero) {
                  console.log('[SpotifyPlayer] Track ended (paused/reset)');
                  endedTrackRef.current = curId;
                  onEnded();
                }
              } else if (trackChangedAutomatically) {
                console.log('[SpotifyPlayer] Track ended (auto changed)');
                endedTrackRef.current = lastPlayedTrackRef.current;
                onEnded();
              }
            }
          }

          lastPositionRef.current = pos;
          lastSdkTrackIdRef.current = curId;
        } catch (e) {
          console.error('[SpotifyPlayer] state change error', e);
        }
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
      try { player?.disconnect(); } catch { }
      ensurePlayAbortRef.current.aborted = true;
    };
  }, [isHost, fetchPlaybackToken, getStoredSpotifyUser]);

  // 볼륨 변경
  useEffect(() => {
    if (!player) return;
    (async () => { try { await player.setVolume(volume / 100); } catch { } })();
  }, [player, volume]);

  // 재생 위치 폴링 (UI 업데이트용)
  useEffect(() => {
    if (!player || isPaused || isSeeking) return;
    const interval = setInterval(() => {
      player.getCurrentState().then(state => {
        if (state && !isSeeking) {
          setPosition(state.position);
        }
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [player, isPaused, isSeeking]);

  // 트랙 변경 시 재생
  useEffect(() => {
    if (!isHost) return;
    const id = currentTrack?.id;
    if (!id || currentTrack.platform !== 'spotify') return;
    if (!deviceId) return;
    if (!isPlaying) return;
    const user = getStoredSpotifyUser();
    if (!user?.userId) return;

    const trackUri = currentTrack.uri || `spotify:track:${id}`;

    // 이미 같은 트랙을 재생 중이면 스킵 (중복 요청 방지)
    if (lastPlayedTrackRef.current === id && isActive && !isPaused) {
      return;
    }

    if (lastPlayedTrackRef.current !== id) {
      lastPlayedTrackRef.current = id;
      endedTrackRef.current = null;
    }

    try { player?.activateElement && player.activateElement(); } catch { }

    const now = Date.now();
    if (playInFlightRef.current || (now - lastPlayAtRef.current) < 500) return; // 300 -> 500ms로 증가
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

    ensurePlayAbortRef.current.aborted = false;
    const ensurePlayback = async () => {
      const abortObj = ensurePlayAbortRef.current;
      const sleep = (ms) => new Promise(res => setTimeout(res, ms));
      let attempts = 0;
      while (!abortObj.aborted && attempts < 5) { // 4 -> 5회
        attempts++;
        await sleep(attempts === 1 ? 1000 : 1500); // 대기 시간 증가
        try {
          const st = await fetch(`${API_BASE_URL}/api/spotify/playback-state/${user.userId}`);
          if (!st.ok) continue;
          const data = await st.json();
          const activeDevId = data?.device?.id;
          const isPlayingFlag = !!data?.is_playing;
          const currentId = data?.item?.id;

          // 이미 잘 재생 중이면 종료
          if (activeDevId === deviceId && isPlayingFlag && currentId === id) {
            return;
          }

          // 다른 기기에서 재생 중이거나 멈춰있으면 전송/재생
          if (activeDevId !== deviceId) {
            // 전송 시도
            await fetch(`${API_BASE_URL}/api/spotify/transfer`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: user.userId, deviceId })
            }).catch(() => { });
            await sleep(500);
          }

          // 다시 재생 요청
          await fetch(`${API_BASE_URL}/api/spotify/play`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.userId, deviceId, trackUri })
          }).catch(() => { });

        } catch (e) {
          // 무시
        }
      }
    };
    ensurePlayback();
  }, [currentTrack?.id, isPlaying, isHost, deviceId, getStoredSpotifyUser, player]);

  // isPlaying 토글
  useEffect(() => {
    if (!isHost || !deviceId || !player) return;
    const user = getStoredSpotifyUser();
    if (!user?.userId) return;
    const action = isPlaying ? 'resume' : 'pause';

    // 이미 상태가 일치하면 스킵
    if (isPlaying === !isPaused) return;

    const now = Date.now();
    if (controlInFlightRef.current || (now - lastControlAtRef.current) < 300) return;
    controlInFlightRef.current = true;
    lastControlAtRef.current = now;

    fetch(`${API_BASE_URL}/api/spotify/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.userId, deviceId, action })
    }).catch(e => console.warn('[SpotifyPlayer] control 오류', action, e))
      .finally(() => { controlInFlightRef.current = false; });
  }, [isPlaying, isHost, deviceId, player, getStoredSpotifyUser, isPaused]);

  const handlePlayPauseClick = () => {
    onPlayPause && onPlayPause();
  };

  const handlePrev = () => {
    const user = getStoredSpotifyUser();
    if (!isHost || !user?.userId || !deviceId) return;
    fetch(`${API_BASE_URL}/api/spotify/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.userId, deviceId, action: 'previous' })
    }).catch(() => { });
  };

  const handleNext = () => {
    if (!isHost) return;
    onNext && onNext();
  };

  const handleVolume = (e) => {
    const v = Number(e.target.value);
    setVolume(v);
    if (!player) return;
    if (volumeDebounceRef.current) clearTimeout(volumeDebounceRef.current);
    volumeDebounceRef.current = setTimeout(async () => {
      try { await player.setVolume(v / 100); } catch { }
    }, 200);
  };

  const handleSeek = (e) => {
    const newPos = Number(e.target.value);
    setPosition(newPos);
    setIsSeeking(true);
  };

  const handleSeekEnd = async (e) => {
    const newPos = Number(e.target.value);
    setIsSeeking(false);
    if (player) {
      try { await player.seek(newPos); } catch { }
    }
  };

  const formatTime = (ms) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return `${m}:${ss < 10 ? '0' : ''}${ss}`;
  };

  const track = currentSdkTrack || currentTrack;
  const art = track?.album?.images?.[0]?.url || track?.thumbnailUrl || 'https://via.placeholder.com/100';
  const title = track?.name || track?.title || '대기중';
  const artist = track?.artists?.[0]?.name || '';

  return (
    <div className="simple-spotify-player" style={{ display: 'flex', flexDirection: 'column', padding: 12, border: '1px solid #ddd', borderRadius: 8, gap: 12 }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <img src={art} alt="art" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 4 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
          <div style={{ fontSize: 12, color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{artist}</div>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={handlePrev} disabled={!isHost}>⏮</button>
            <button onClick={handlePlayPauseClick} disabled={!isHost}>{isPlaying ? (isPaused ? '▶️' : '⏸️') : '▶️'}</button>
            <button onClick={handleNext} disabled={!isHost}>⏭</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 12 }}>🔊</span>
              <input type="range" min={0} max={100} value={volume} onChange={handleVolume} style={{ width: 60 }} />
            </div>
          </div>
        </div>
      </div>

      {/* Seek Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#555' }}>
        <span>{formatTime(position)}</span>
        <input
          type="range"
          min={0}
          max={duration || 100}
          value={position}
          onChange={handleSeek}
          onMouseUp={handleSeekEnd}
          onTouchEnd={handleSeekEnd}
          style={{ flex: 1 }}
          disabled={!isHost}
        />
        <span>{formatTime(duration)}</span>
      </div>

      {!isActive && isHost && <div style={{ fontSize: 11, color: '#a00' }}>플레이어 준비 중… Spotify 앱이 켜져있어야 빠릅니다.</div>}
    </div>
  );
}