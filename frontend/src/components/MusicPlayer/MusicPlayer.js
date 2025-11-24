import React, { useEffect, useState, useRef } from 'react';
import './MusicPlayer.css';
import SpotifyPlayer from './SpotifyPlayer';

const MusicPlayer = ({ currentTrack, isPlaying, onPlayPause, onNext, onEnded, isHost, onDeviceReady }) => {
  // --- API 및 플레이어 상태 관리 ---
  const playerRef = useRef(null); // YouTube 플레이어 객체 인스턴스 저장
  const [isApiReady, setIsApiReady] = useState(false); // YouTube API 스크립트 로드 여부
  const [isPlayerReady, setIsPlayerReady] = useState(false); // 플레이어 인스턴스 준비 여부

  // --- 내부 상태 관리 ---
  const [internalPlaying, setInternalPlaying] = useState(isPlaying);
  const [playerError, setPlayerError] = useState(null);

  // --- Props를 Ref에 저장 (이벤트 핸들러에서 최신 Props 사용) ---
  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  // --- 1. YouTube IFrame API 스크립트 로드 (컴포넌트 마운트 시 1회) ---
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      setIsApiReady(true);
    } else {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = () => {
        setIsApiReady(true);
      };
    }
  }, []);

  // --- 2. YouTube 플레이어 인스턴스 생성 ---
  useEffect(() => {
    if (!isApiReady || playerRef.current) return;

    // YouTube 플레이어 생성
    playerRef.current = new window.YT.Player('youtube-player', {
      height: '360',
      width: '640',
      videoId: currentTrack?.platform === 'youtube' ? currentTrack.videoId : '',
      playerVars: {
        autoplay: 1,
        controls: 1,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
        modestbranding: 1,
        rel: 0,
      },
      events: {
        onReady: (event) => {
          setIsPlayerReady(true);
          if (currentTrack?.platform === 'youtube' && isPlaying) {
            event.target.playVideo();
          }
        },
        onStateChange: (event) => {
          // YT.PlayerState.ENDED = 0
          if (event.data === 0) {
            if (onEndedRef.current) onEndedRef.current();
          }
          // YT.PlayerState.PLAYING = 1, PAUSED = 2
          if (event.data === 1) setInternalPlaying(true);
          if (event.data === 2) setInternalPlaying(false);
        },
        onError: (event) => {
          console.error('YouTube Player Error:', event.data);
          setPlayerError(event.data);
          // 에러 발생 시 다음 곡으로 넘어가거나 처리 필요
          // 예: onNext();
        }
      },
    });

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [isApiReady]); // 의존성에서 currentTrack, isPlaying 제거 (인스턴스 생성은 한 번만)

  // --- 3. Props 변경에 따른 플레이어 제어 (YouTube) ---
  useEffect(() => {
    if (!playerRef.current || !isPlayerReady) return;
    if (currentTrack?.platform !== 'youtube') {
      // Spotify나 다른 플랫폼일 경우 YouTube 플레이어 정지
      playerRef.current.stopVideo();
      return;
    }

    const player = playerRef.current;
    const currentVideoId = player.getVideoData()?.video_id;

    // 비디오 ID가 다르면 로드
    if (currentTrack.videoId && currentTrack.videoId !== currentVideoId) {
      player.loadVideoById(currentTrack.videoId);
    }

    // 재생 상태 동기화
    // 주의: loadVideoById는 자동 재생되므로, isPlaying이 false면 pauseVideo 호출 필요
    // 하지만 로딩 직후 상태를 알기 어려우므로 약간의 딜레이나 상태 확인이 필요할 수 있음
    // 여기서는 단순화하여 처리
    if (isPlaying) {
      if (player.getPlayerState() !== 1) player.playVideo();
    } else {
      if (player.getPlayerState() === 1) player.pauseVideo();
    }

  }, [currentTrack, isPlaying, isPlayerReady]);


  // --- 렌더링 ---
  return (
    <div className="music-player-container">
      {/* YouTube Player Container */}
      <div
        id="youtube-player"
        style={{
          display: currentTrack?.platform === 'youtube' ? 'block' : 'none',
          width: '100%',
          maxWidth: '640px',
          margin: '0 auto'
        }}
      />

      {/* Spotify Player Container */}
      {currentTrack?.platform === 'spotify' && (
        <SpotifyPlayer
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          onPlayPause={onPlayPause}
          onNext={onNext}
          onEnded={onEnded}
          isHost={isHost}
          onDeviceReady={onDeviceReady}
        />
      )}

      {/* No Track / Placeholder */}
      {!currentTrack && (
        <div className="no-track-placeholder">
          <p>재생 중인 곡이 없습니다.</p>
        </div>
      )}

      {playerError && <div className="player-error">플레이어 오류 발생: {playerError}</div>}
    </div>
  );
};

export default MusicPlayer;
