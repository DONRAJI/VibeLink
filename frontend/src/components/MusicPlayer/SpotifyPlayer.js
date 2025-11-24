import React, { useEffect, useState, useCallback, useRef } from 'react';

// Server-Side Controlled Spotify Player
// - No direct /play or /control calls from here.
// - Emits onDeviceReady(deviceId) so parent can sync with backend.
// - Listens to player state to update UI.

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

// Global variable to track the last played track ID (for local state tracking if needed)
let globalLastPlayedTrackId = null;

export default function SpotifyPlayer({ currentTrack, isPlaying, onPlayPause, onNext, onEnded, isHost, onDeviceReady }) {
  const [player, setPlayer] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [currentSdkTrack, setCurrentSdkTrack] = useState(null);
  const [isPaused, setIsPaused] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [volume, setVolume] = useState(50);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);

  // Refs for state management
  const initRef = useRef(false);
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

  // 1. SDK Initialization
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
        if (onDeviceReady) {
          onDeviceReady(device_id, user.userId);
        }
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

        // End of Track Detection
        const dur = state.duration || state.track_window?.current_track?.duration_ms || 0;
        const pos = state.position || 0;

        const nearingEnd = dur > 0 && pos >= Math.max(0, dur - 1000);
        const justResetToZero = state.paused && lastPositionRef.current > 1000 && pos === 0;

        if (onEnded) {
          // Case A: Track finished and stopped/paused at end
          if (state.paused && nearingEnd && currentTrackId === globalLastPlayedTrackId) {
            if (endedTrackRef.current !== currentTrackId) {
              console.log('[SpotifyPlayer] Track ended (paused at end)');
              endedTrackRef.current = currentTrackId;
              onEnded();
            }
          }
          // Case B: Track finished and Spotify auto-played next (or reset)
          else if (justResetToZero && currentTrackId === globalLastPlayedTrackId) {
            if (endedTrackRef.current !== currentTrackId) {
              console.log('[SpotifyPlayer] Track ended (reset to zero)');
              endedTrackRef.current = currentTrackId;
              onEnded();
            }
          }
        }

        lastPositionRef.current = pos;
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
    };
  }, [isHost, fetchPlaybackToken, getStoredSpotifyUser, onDeviceReady]);

  // 2. Track Change Detection - Just update global tracker
  useEffect(() => {
    if (currentTrack?.id) {
      globalLastPlayedTrackId = currentTrack.id;
    }
  }, [currentTrack]);

  // 4. Volume Control
  useEffect(() => {
    if (!player) return;
    (async () => { try { await player.setVolume(volume / 100); } catch { } })();
  }, [player, volume]);

  // 5. Position Polling
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


  // Handlers - Direct API Calls for Immediate Response
  const handlePlayPauseClick = async () => {
    if (!isHost) return;
    onPlayPause && onPlayPause();
  };

  const handlePrev = async () => {
    // onPrev not implemented in parent yet?
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