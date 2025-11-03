import React, { useRef, useEffect, useState } from 'react';
import ReactPlayer from 'react-player';
import './MusicPlayer.css';

const MusicPlayer = ({ currentTrack, isPlaying, onPlayPause, onNext, onEnded, isHost }) => {
  const playerRef = useRef(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [internalPlaying, setInternalPlaying] = useState(false);
  const [playerError, setPlayerError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // 외부에서 전달받은 isPlaying과 내부 상태를 동기화
  useEffect(() => {
    setInternalPlaying(isPlaying);
  }, [isPlaying]);

  useEffect(() => {
    if (currentTrack && isPlayerReady) {
      // 새로운 트랙이 로드되면 내부 상태를 초기화
      setInternalPlaying(isPlaying);
      setPlayerError(null);
      setIsLoading(false);
    }
  }, [currentTrack, isPlayerReady, isPlaying]);

  // 컴포넌트 마운트 시 window 객체에 콜백 함수 할당
  useEffect(() => {
    // YouTube 플레이어 준비 완료 콜백
    window.handleYouTubePlayerReady = () => {
      console.log('YouTube 플레이어가 준비되었습니다.');
      setIsPlayerReady(true);
      setInternalPlaying(isPlaying);
      setPlayerError(null);
      setIsLoading(false);
    };

    // YouTube 플레이어 재생 시작 콜백
    window.handleYouTubePlayerPlay = () => {
      console.log('비디오 재생 시작');
      setInternalPlaying(true);
    };

    // YouTube 플레이어 일시정지 콜백
    window.handleYouTubePlayerPause = () => {
      console.log('비디오 일시정지');
      setInternalPlaying(false);
    };

    // YouTube 플레이어 버퍼링 콜백
    window.handleYouTubePlayerBuffer = () => {
      console.log('비디오 버퍼링 중...');
    };

    // YouTube 플레이어 오류 콜백
    window.handleYouTubePlayerError = (error) => {
      console.error('YouTube 플레이어 오류:', error);
      setPlayerError(error);
      setInternalPlaying(false);
      setIsLoading(false);
    };

    // 컴포넌트 언마운트 시 window 객체에서 콜백 함수 제거
    return () => {
      delete window.handleYouTubePlayerReady;
      delete window.handleYouTubePlayerPlay;
      delete window.handleYouTubePlayerPause;
      delete window.handleYouTubePlayerBuffer;
      delete window.handleYouTubePlayerError;
    };
  }, [isPlaying]);

  const handlePlay = () => {
    console.log('재생 요청:', currentTrack?.title);
    setInternalPlaying(true);
    onPlayPause();
  };

  const handlePause = () => {
    console.log('일시정지 요청');
    setInternalPlaying(false);
    onPlayPause();
  };

  if (!currentTrack) {
    return (
      <div className="music-player empty">
        <div className="empty-state">
          <div className="empty-icon">🎵</div>
          <h3>재생할 곡이 없습니다</h3>
          <p>플레이리스트에서 곡을 선택하거나 검색하여 추가해보세요.</p>
        </div>
      </div>
    );
  }

  // 플레이어가 로딩 중일 때 로딩 화면 표시
  if (isLoading || !isPlayerReady) {
    return (
      <div className="music-player loading">
        <div className="loading-state">
          <div className="loading-spinner">⏳</div>
          <h3>플레이어 로딩 중...</h3>
          <p>YouTube 플레이어를 준비하고 있습니다. 잠시만 기다려주세요.</p>
          <div className="loading-progress">
            <div className="progress-bar">
              <div className="progress-fill"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="music-player">
      <div className="player-container">
        <div className="video-container">
          {playerError && (
            <div className="player-error">
              <p>플레이어 오류: {playerError?.message || '알 수 없는 오류'}</p>
              <p>비디오 ID: {currentTrack.videoId}</p>
            </div>
          )}
          
          <ReactPlayer
            ref={playerRef}
            url={`https://www.youtube.com/watch?v=${currentTrack.videoId}`}
            playing={internalPlaying}
            controls={true}
            width="100%"
            height="100%"
            onEnded={onEnded}
            onReady={() => window.handleYouTubePlayerReady()}
            onError={(error) => window.handleYouTubePlayerError(error)}
            onPlay={() => window.handleYouTubePlayerPlay()}
            onBuffer={() => window.handleYouTubePlayerBuffer()}
            onPause={() => window.handleYouTubePlayerPause()}
            config={{
              youtube: {
                playerVars: {
                  modestbranding: 1,
                  rel: 0,
                  showinfo: 1,
                  controls: 1,
                  disablekb: 0,
                  fs: 1,
                  iv_load_policy: 3,
                  cc_load_policy: 0,
                  autoplay: 0,
                  start: 0,
                  origin: window.location.origin
                }
              }
            }}
          />
        </div>
        
        <div className="player-info">
          <div className="track-info">
            <h3 className="track-title">{currentTrack.title}</h3>
            <div className="track-meta">
              <span className="track-source">YouTube</span>
              {currentTrack.addedBy && (
                <span className="track-added-by">추가: {currentTrack.addedBy}</span>
              )}
              <span className="video-id">ID: {currentTrack.videoId}</span>
            </div>
          </div>
          
          <div className="player-controls">
            <button
              className={`control-btn ${internalPlaying ? 'playing' : ''}`}
              onClick={internalPlaying ? handlePause : handlePlay}
              disabled={!isHost}
            >
              {internalPlaying ? '⏸️ 일시정지' : '▶️ 재생'}
            </button>
            
            <button
              className="control-btn next-btn"
              onClick={onNext}
              disabled={!isHost}
            >
              ⏭️ 다음 곡
            </button>
          </div>
          

        </div>
      </div>
    </div>
  );
};

export default MusicPlayer;
