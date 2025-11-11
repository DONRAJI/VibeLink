import React, { useEffect, useRef, useState } from 'react';

// 백엔드 URL 환경변수
const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

/**
 * Spotify Web Playback SDK를 이용한 네이티브 재생 컴포넌트
 * 제한사항:
 * - Spotify Premium 계정 필요
 * - 브라우저/플랫폼 제약 존재
 * - 실제 재생은 인증된 사용자(대개 방장)의 계정/디바이스에서만 출력됨
 */
export default function SpotifyPlayer({ currentTrack, isPlaying, onPlayPause, onNext, onEnded, isHost }) {
  const [sdkReady, setSdkReady] = useState(false);
  const [player, setPlayer] = useState(null);
  const deviceIdRef = useRef(null);
  const lastTrackIdRef = useRef(null);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [volume, setVolume] = useState(80); // 0~100
  const [audioActivated, setAudioActivated] = useState(false);

  // 로컬에 저장된 스포티파이 사용자 정보 로드
  function getStoredSpotifyUser() {
    try {
      const raw = localStorage.getItem('spotifyUser');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async function fetchPlaybackToken(userId) {
    const resp = await fetch(`${API_BASE_URL}/api/spotify/playback/${userId}`);
    if (!resp.ok) throw new Error('토큰을 가져오지 못했습니다');
    const data = await resp.json();
    return data.accessToken;
  }

  // 장치 활성 전환(Transfer Playback)
  async function transferToDevice(userId) {
    if (!deviceIdRef.current) return;
    const token = await fetchPlaybackToken(userId);
    await fetch('https://api.spotify.com/v1/me/player', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_ids: [deviceIdRef.current], play: false })
    });
  }

  // SDK 스크립트 로드
  useEffect(() => {
    // onSpotifyWebPlaybackSDKReady를 미리 정의해 AnthemError 방지
    window.onSpotifyWebPlaybackSDKReady = () => setSdkReady(true);

    if (window.Spotify) {
      // 이미 로드됨
      setSdkReady(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    script.onerror = () => {
      console.error('Spotify Web Playback SDK 로드 실패');
    };
    document.body.appendChild(script);

    return () => {
      // 언마운트 시 콜백 제거(다른 페이지에서 재정의될 수 있음)
      try { delete window.onSpotifyWebPlaybackSDKReady; } catch {}
    };
  }, []);

  useEffect(() => {
    if (!sdkReady || player || !isHost) return;
    console.log('[SpotifyPlayer] Initializing player... (sdkReady=', sdkReady, ', isHost=', isHost, ')');
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
          } catch (e) {
            console.error('토큰 제공 실패:', e);
          }
        },
        volume: 0.8,
      });

      spotifyPlayer.addListener('ready', ({ device_id }) => {
        console.log('[SpotifyPlayer] Ready device_id=', device_id);
        deviceIdRef.current = device_id;
      });
      spotifyPlayer.addListener('not_ready', ({ device_id }) => {
        console.warn('[SpotifyPlayer] Not Ready device=', device_id);
      });
      spotifyPlayer.addListener('initialization_error', ({ message }) => console.error('[SpotifyPlayer] init error', message));
      spotifyPlayer.addListener('authentication_error', ({ message }) => console.error('[SpotifyPlayer] auth error', message));
      spotifyPlayer.addListener('account_error', ({ message }) => console.error('[SpotifyPlayer] account error', message));

      // 트랙 종료 감지(간이): 이전 트랙과 비교해 위치 0, paused 상태 등 조건으로 판별
      spotifyPlayer.addListener('player_state_changed', (state) => {
        if (!state) return;
        // 상태 덤프 (디버깅 필요시 주석 해제)
        // console.log('[SpotifyPlayer] state change', state);
        const prev = state.track_window?.previous_tracks?.[0];
        const paused = state.paused;
        setPositionMs(state.position || 0);
        const dur = state.duration || state.track_window?.current_track?.duration_ms || 0;
        setDurationMs(dur);
        // 종료 추정 로직: 이전 트랙 ID와 lastTrackIdRef 비교 + 위치 0 + paused
        if (paused && prev && lastTrackIdRef.current && prev.id === lastTrackIdRef.current && state.position === 0) {
          endedRef.current && endedRef.current();
        }
      });

      const connected = await spotifyPlayer.connect();
      console.log('[SpotifyPlayer] connect() ->', connected);
      if (connected) setPlayer(spotifyPlayer);
    };

    setup();

    return () => {
      if (spotifyPlayer) {
        spotifyPlayer.disconnect();
      }
    };
  }, [sdkReady, player, isHost]);

  // 트랙/재생 상태 변경 시 제어 (방장만)
  // 최신 onEnded 유지 (exhaustive-deps 회피를 위한 ref)
  const endedRef = useRef(onEnded);
  useEffect(() => { endedRef.current = onEnded; }, [onEnded]);

  useEffect(() => {
    const doPlayIfNeeded = async () => {
      if (!isHost) return;
      if (!player || !deviceIdRef.current) return;
      const user = getStoredSpotifyUser();
      if (!user?.userId) return;

      if (currentTrack?.platform === 'spotify') {
        // 새로운 트랙 재생
        if (currentTrack.id && lastTrackIdRef.current !== currentTrack.id && isPlaying) {
          lastTrackIdRef.current = currentTrack.id;
          try {
            const token = await fetchPlaybackToken(user.userId);
            console.log('[SpotifyPlayer] PUT play track', currentTrack.id, 'device=', deviceIdRef.current);
            // 활성 디바이스 전환 보장
            await transferToDevice(user.userId);
            await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceIdRef.current}`, {
              method: 'PUT',
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ uris: [currentTrack.uri || `spotify:track:${currentTrack.id}`] })
            });
          } catch (e) {
            console.error('Spotify 재생 요청 실패:', e);
          }
        } else {
          // 재생/일시정지 토글
          try {
            if (isPlaying) { console.log('[SpotifyPlayer] resume()'); await player.resume(); }
            else { console.log('[SpotifyPlayer] pause()'); await player.pause(); }
          } catch (e) {
            console.error('재생/일시정지 실패:', e);
          }
        }
      }
    };
    doPlayIfNeeded();
  }, [currentTrack, isPlaying, isHost, player]);

  // 사용자 제스처로 오디오 컨텍스트 활성화 (브라우저 자동재생 제한 대응)
  const activateAudio = async () => {
    try {
      if (player && player.activateElement) {
        await player.activateElement();
        setAudioActivated(true);
      } else {
        setAudioActivated(true);
      }
    } catch (e) {
      console.warn('오디오 활성화 실패:', e);
    }
  };

  // 볼륨 변경
  const handleVolume = async (e) => {
    const v = Number(e.target.value);
    setVolume(v);
    try {
      if (player) await player.setVolume(Math.min(1, Math.max(0, v / 100)));
    } catch (err) {
      console.error('볼륨 설정 실패:', err);
    }
  };

  // 시크(원하는 위치로 건너뛰기)
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
    } catch (err) {
      console.error('시크 실패:', err);
    }
  };

  const fmt = (ms) => {
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2,'0')}`;
  };

  const art = currentTrack?.thumbnailUrl;

  return (
    <div className="player-container" style={{ padding: '8px 0' }}>
      <div className="video-container" style={{ background:'#f2d9db', display:'flex', alignItems:'center', justifyContent:'center', height:0, paddingBottom:'30%', borderRadius:12, position:'relative' }}>
        {/* 상단 바 */}
        <div style={{ position:'absolute', top:12, left:12, right:12, background:'#d9c0c2', borderRadius:12, padding:'10px 14px', display:'flex', alignItems:'center', gap:12 }}>
          <img src={art} alt="art" style={{ width:48, height:48, borderRadius:'50%', objectFit:'cover' }} onError={(e)=>{e.target.style.display='none';}} />
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:700 }}>{currentTrack?.title || '재생 준비'}</div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <input type="range" min={0} max={durationMs || 0} value={Math.min(positionMs, durationMs || 0)} onChange={handleSeek} style={{ width:'100%' }} disabled={!isHost || !durationMs} />
              <div style={{ fontSize:12, color:'#333' }}>{fmt(positionMs)} / {fmt(durationMs)}</div>
            </div>
          </div>
        </div>

        {/* 하단 컨트롤 */}
        <div style={{ position:'absolute', bottom:14, left:24, right:24, background:'#fff', borderRadius:12, padding:'16px 20px', boxShadow:'0 10px 20px rgba(0,0,0,0.12)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ width:64 }} />
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <button className="control-btn" onClick={()=>{ /* 이전은 미지원 -> 0으로 시크 */ setPositionMs(0); handleSeek({ target:{ value:0 } }); }} disabled={!isHost}>⏮️</button>
            <button className={`control-btn ${isPlaying ? 'playing':''}`} onClick={()=>{ activateAudio(); onPlayPause(); }} disabled={!isHost}>{isPlaying ? '⏸️' : '▶️'}</button>
            <button className="control-btn" onClick={onNext} disabled={!isHost}>⏭️</button>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span>🔊</span>
            <input type="range" min={0} max={100} value={volume} onChange={handleVolume} style={{ width:120 }} disabled={!isHost} />
          </div>
        </div>

        {!audioActivated && isHost && (
          <button onClick={activateAudio} style={{ position:'absolute', inset:0, background:'transparent', border:'none', cursor:'pointer' }} title="오디오 활성화">
            {/* 클릭 영역 전체를 활성화 버튼으로 */}
          </button>
        )}
      </div>
    </div>
  );
}
