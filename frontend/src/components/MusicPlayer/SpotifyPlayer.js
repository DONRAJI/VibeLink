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

  // 플레이어 초기화 (방장일 때만 실제 플레이어 구성)
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

  // 렌더링: Spotify는 시각 영상이 없으므로 간단한 표시만
  return (
    <div className="player-container">
      <div className="video-container" style={{ background:'#121212', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', height:0, paddingBottom:'30%', borderRadius:8 }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:24, marginBottom:8 }}>Spotify 플레이어</div>
          <div style={{ fontSize:14, opacity:0.8 }}>{isHost ? '방장 디바이스에서 재생 중' : '재생 상태 동기화 중'}</div>
        </div>
      </div>
    </div>
  );
}
