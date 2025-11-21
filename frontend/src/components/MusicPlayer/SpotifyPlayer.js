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

  // Refs for state management
  const lastPlayedTrackIdRef = useRef(null);
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

        // 1. Check if we are very close to the end (within 1s) and paused (Spotify often pauses at end)
        // 2. Or if position reset to 0 from a significant value (auto-repeat or playlist progression)
        const nearingEnd = dur > 0 && pos >= Math.max(0, dur - 1000);
        const justResetToZero = state.paused && lastPositionRef.current > 1000 && pos === 0;

        // Detect if the track ID changed automatically (Spotify Autoplay)
        const trackChangedAutomatically =
          lastPlayedTrackIdRef.current &&
          currentTrackId &&
          lastPlayedTrackIdRef.current !== currentTrackId &&
          // Ensure it wasn't us who changed it via props
          currentTrack?.id === lastPlayedTrackIdRef.current;

        if (onEnded) {
          // Case A: Track finished and stopped/paused at end
          if (state.paused && nearingEnd && currentTrackId === lastPlayedTrackIdRef.current) {
            if (endedTrackRef.current !== currentTrackId) {
              console.log('[SpotifyPlayer] Track ended (paused at end)');
              endedTrackRef.current = currentTrackId;
              onEnded();
            }
          }
          // Case B: Track finished and Spotify auto-played next (or reset)
          else if (justResetToZero && currentTrackId === lastPlayedTrackIdRef.current) {
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
  }, [isHost, fetchPlaybackToken, getStoredSpotifyUser]);

  // 2. Playback Control Logic (Triggered by props change)
  useEffect(() => {
    if (!isHost || !deviceId || !currentTrack || currentTrack.platform !== 'spotify') return;

    const user = getStoredSpotifyUser();
    if (!user?.userId) return;

    const trackId = currentTrack.id;
    const trackUri = currentTrack.uri || `spotify:track:${trackId}`;

    // If we are already playing this track, just ensure play/pause state matches
    if (lastPlayedTrackIdRef.current === trackId) {
      if (isPlaying && isPaused) {
        // Resume
        fetch(`${API_BASE_URL}/api/spotify/control`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.userId, deviceId, action: 'resume' })
        }).catch(console.error);
      } else if (!isPlaying && !isPaused) {
        // Pause
        fetch(`${API_BASE_URL}/api/spotify/control`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.userId, deviceId, action: 'pause' })
        }).catch(console.error);
      }
      return;
    }

    // New Track Detected
    console.log(`[SpotifyPlayer] New track detected: ${trackId} (Old: ${lastPlayedTrackIdRef.current})`);
    console.log(`[SpotifyPlayer] Calling /play with URI: ${trackUri}`);

    lastPlayedTrackIdRef.current = trackId;
    endedTrackRef.current = null;

    // Play the new track
    if (isPlaying) {
      fetch(`${API_BASE_URL}/api/spotify/play`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.userId, deviceId, trackUri })
      }).then(res => {
        if (!res.ok) console.warn('[SpotifyPlayer] Play request failed', res.status);
        else console.log('[SpotifyPlayer] Play request sent successfully');
      }).catch(console.error);
    }

  }, [currentTrack, isPlaying, isHost, deviceId, isPaused, getStoredSpotifyUser]);


  // 3. Volume Control
  useEffect(() => {
    if (!player) return;
    (async () => { try { await player.setVolume(volume / 100); } catch { } })();
  }, [player, volume]);

  // 4. Position Polling
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


  // Handlers
  const handlePlayPauseClick = () => onPlayPause && onPlayPause();
  const handlePrev = () => {
    const user = getStoredSpotifyUser();
    if (!isHost || !user?.userId || !deviceId) return;
    fetch(`${API_BASE_URL}/api/spotify/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.userId, deviceId, action: 'previous' })
    }).catch(() => { });
  };
  const handleNext = () => onNext && onNext();

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