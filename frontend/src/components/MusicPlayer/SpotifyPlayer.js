// src/components/SpotifyPlayer.js (전체 코드)

import React, { useEffect, useState, useCallback, useRef } from 'react';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

export default function SpotifyPlayer({ currentTrack, isPlaying, onPlayPause, onNext, onEnded, isHost }) {
  const [player, setPlayer] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const lastTrackIdRef = useRef(null);

  const [isActive, setActive] = useState(false);
  const [sdkCurrentTrack, setSdkCurrentTrack] = useState(null);
  const [isPaused, setIsPaused] = useState(true);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);

  const [volume, setVolume] = useState(80);
  const [sdkReady, setSdkReady] = useState(false);

  // 활성 장치가 필요한지 여부를 나타내는 상태
  const [needsActivation, setNeedsActivation] = useState(false);

  const getStoredSpotifyUser = useCallback(() => {
    try { return JSON.parse(localStorage.getItem('spotifyUser')); } catch { return null; }
  }, []);

  const fetchPlaybackToken = useCallback(async (userId) => {
    const resp = await fetch(`${API_BASE_URL}/api/spotify/playback/${userId}`);
    if (!resp.ok) throw new Error('토큰을 가져오지 못했습니다');
    return (await resp.json()).accessToken;
  }, []);

  // 브라우저 오디오 활성화만 수행 (전환 호출 제거)
  const ensureActivation = useCallback(async () => {
    if (!isHost) return false;
    if (!player) return false;
    try {
      if (player.activateElement) {
        await player.activateElement();
      }
      setNeedsActivation(false);
      return true;
    } catch (e) {
      console.warn('[SpotifyPlayer] ensureActivation 실패:', e?.message || e);
      setNeedsActivation(true);
      return false;
    }
  }, [isHost, player]);

  // 디바이스 목록 조회 (진단용)
  const fetchDevices = useCallback(async () => {
    const user = getStoredSpotifyUser();
    if (!user?.userId) return [];
    try {
      const resp = await fetch(`${API_BASE_URL}/api/spotify/devices/${user.userId}`);
      if (!resp.ok) return [];
      const data = await resp.json();
      return data.devices || [];
    } catch { return []; }
  }, [getStoredSpotifyUser]);

  // 서버 디바이스 목록과 동기화 (가능하면 SDK 장치 식별)
  const syncDeviceIdFromServer = useCallback(async () => {
    const devices = await fetchDevices();
    if (!devices || devices.length === 0) return null;
    let matched = devices.find(d => d.name === 'VibeLink Web Player');
    if (!matched) matched = devices.find(d => (d.name || '').toLowerCase().includes('web player'));
    if (matched) {
      if (matched.id !== deviceId) setDeviceId(matched.id);
      return matched.id;
    }
    return null;
  }, [fetchDevices, deviceId]);

  // 재생 재시도 로직 (play-first, transfer 제거)
  const retryPlay = useCallback(async (trackUri, maxAttempts = 5) => {
    const user = getStoredSpotifyUser();
    if (!user?.userId) return false;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const activated = await ensureActivation();
      if (!activated) {
        await new Promise(r => setTimeout(r, attempt * 300));
        continue;
      }
      let targetDeviceId = deviceId;
      if (!targetDeviceId) {
        targetDeviceId = await syncDeviceIdFromServer();
      } else {
        // 서버 디바이스 확인해 존재하지 않으면 동기화
        const devices = await fetchDevices();
        const exists = devices.some(d => d.id === targetDeviceId);
        if (!exists) {
          targetDeviceId = await syncDeviceIdFromServer();
        }
      }
      if (!targetDeviceId) {
        await new Promise(r => setTimeout(r, attempt * 300));
        continue;
      }
      const playResp = await fetch(`${API_BASE_URL}/api/spotify/play`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.userId, deviceId: targetDeviceId, trackUri })
      });
      if (playResp.ok) {
        console.log('[SpotifyPlayer][retryPlay] play success');
        setNeedsActivation(false);
        return true;
      } else {
        console.warn(`[SpotifyPlayer][retryPlay] play failed status=${playResp.status}`);
      }
      await new Promise(r => setTimeout(r, attempt * 400));
    }
    console.error('[SpotifyPlayer][retryPlay] all attempts failed');
    setNeedsActivation(true);
    return false;
  }, [deviceId, ensureActivation, fetchDevices, getStoredSpotifyUser, syncDeviceIdFromServer]);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    document.body.appendChild(script);
    window.onSpotifyWebPlaybackSDKReady = () => setSdkReady(true);
    return () => { player?.disconnect(); document.body.removeChild(script); try { delete window.onSpotifyWebPlaybackSDKReady; } catch {} };
  }, [player]);

  useEffect(() => {
    if (!sdkReady || !isHost || player) return;
    const user = getStoredSpotifyUser();
    if (!user?.userId) return;

    const spotifyPlayer = new window.Spotify.Player({
      name: 'VibeLink Web Player',
      getOAuthToken: cb => fetchPlaybackToken(user.userId).then(cb),
      volume: volume / 100,
    });

    spotifyPlayer.addListener('ready', async ({ device_id }) => {
      console.log('[SDK] 기기 준비 완료, ID:', device_id);
      setDeviceId(device_id);
      // 초기에는 전환 호출을 하지 않고, 실제 재생 시도 시 활성화/재생을 진행합니다.
      setNeedsActivation(true);
    });

    spotifyPlayer.addListener('player_state_changed', (state) => {
      if (!state) { setActive(false); return; }
      setSdkCurrentTrack(state.track_window.current_track);
      setIsPaused(state.paused);
      setPositionMs(state.position);
      setDurationMs(state.duration);
      setActive(true);
    });

    spotifyPlayer.addListener('not_ready', () => setDeviceId(null));

    spotifyPlayer.connect().then(success => {
      if (success) setPlayer(spotifyPlayer);
    });

    return () => spotifyPlayer.disconnect();
  }, [sdkReady, isHost, player, fetchPlaybackToken, getStoredSpotifyUser, volume]);

  const sendControlCommand = useCallback((action) => {
    if (!isHost || !deviceId) return;
    const user = getStoredSpotifyUser();
    if (!user?.userId) return;
    fetch(`${API_BASE_URL}/api/spotify/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.userId, deviceId: deviceId, action: action }),
    });
  }, [isHost, deviceId, getStoredSpotifyUser]);

  useEffect(() => {
    if (!isHost || !player || !deviceId || currentTrack?.platform !== 'spotify') return;
    const user = getStoredSpotifyUser();
    if (!user?.userId) return;

    if (currentTrack.id && lastTrackIdRef.current !== currentTrack.id) {
      lastTrackIdRef.current = currentTrack.id;
      if (isPlaying) {
        retryPlay(currentTrack.uri || `spotify:track:${currentTrack.id}`);
      }
      return;
    }

    if (isActive) {
      if (isPlaying && isPaused) sendControlCommand('resume');
      else if (!isPlaying && !isPaused) sendControlCommand('pause');
    }
  }, [currentTrack, isPlaying, isHost, player, deviceId, isActive, isPaused, sendControlCommand, getStoredSpotifyUser]);

  const handleVolume = async (e) => {
    const v = Number(e.target.value);
    setVolume(v);
    if (player) await player.setVolume(v / 100);
  };

  const handleSeek = (e) => {
    const newPos = Number(e.target.value);
    if (player) {
      player.seek(newPos).then(() => setPositionMs(newPos));
    }
  };

  const fmt = (ms) => {
    if (isNaN(ms) || ms < 0) return '0:00';
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const displayTrack = sdkCurrentTrack || currentTrack;
  const art = displayTrack?.album?.images[0]?.url || displayTrack?.thumbnailUrl || 'https://via.placeholder.com/160';
  const title = displayTrack?.name || displayTrack?.title || '재생 준비';

  return (
    <div className="player-container" style={{ position: 'relative' }}>
      {needsActivation && isHost && (
        <div className="activation-overlay">
          <div className="activation-box">
            <h4>🎵 Spotify 플레이어 활성화 필요</h4>
            <p>음악을 재생하려면, 다른 기기(PC, 스마트폰)에서 Spotify를 실행하여 아무 곡이나 잠시 재생해주세요.</p>
            <p>활성화 후 이 곳에서 음악 제어가 가능해집니다.</p>
            <div style={{ display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap' }}>
              <button onClick={ensureActivation}>브라우저 활성화</button>
              <button onClick={async () => { const devices = await fetchDevices(); console.log('[SpotifyPlayer] devices', devices); }}>디바이스 진단</button>
              <button onClick={() => window.open('https://open.spotify.com', '_blank')}>Spotify 열기</button>
            </div>
          </div>
        </div>
      )}

      <div className={`spotify-player-skinned ${needsActivation ? 'blurred' : ''}`}>
        <div className="spotify-card">
          <img src={art} alt="Album Art" className="spotify-art" />
          <div className="spotify-track-info">
            <h3 className="spotify-title">{title}</h3>
            <div className="spotify-progress-container">
              <span>{fmt(positionMs)}</span>
              <input 
                type="range" min={0} max={durationMs || 1} value={positionMs} 
                onMouseUp={handleSeek} onChange={(e) => setPositionMs(Number(e.target.value))}
                className="spotify-progress-bar" disabled={!isHost || !isActive} 
              />
              <span>{fmt(durationMs)}</span>
            </div>
          </div>
          <div className="spotify-controls">
            <button className="spotify-control-btn" onClick={() => sendControlCommand('previous')} disabled={!isHost || !isActive}>⏮️</button>
            <button className="spotify-control-btn spotify-play-pause-btn" onClick={async () => { if (isPaused) { await ensureActivation(); } onPlayPause(); }} disabled={!isHost || !isActive}>
              {isPaused ? '▶️' : '⏸️'}
            </button>
            <button className="spotify-control-btn" onClick={() => sendControlCommand('next')} disabled={!isHost || !isActive}>⏭️</button>
          </div>
          <div className="spotify-volume-container">
            <span>🔊</span>
            <input 
              type="range" min={0} max={100} value={volume} onChange={handleVolume} 
              disabled={!isHost || !isActive} 
            />
          </div>
        </div>
      </div>
    </div>
  );
}