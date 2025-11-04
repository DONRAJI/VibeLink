import React, { useEffect, useState } from 'react';
import ReactPlayer from 'react-player';
import './MusicPlayer.css';

const MusicPlayer = ({ currentTrack, isPlaying, onPlayPause, onNext, onEnded, isHost }) => {
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [internalPlaying, setInternalPlaying] = useState(false);
  const [playerError, setPlayerError] = useState(null);

  // 외부에서 전달받은 isPlaying과 내부 상태를 동기화
  useEffect(() => {
    setInternalPlaying(isPlaying);
  }, [isPlaying]);

  useEffect(() => {
    if (currentTrack) {
      console.log('새 트랙 로드:', currentTrack.title, 'videoId:', currentTrack.videoId);
      
      // 즉시 플레이어를 준비 상태로 설정
      setIsPlayerReady(true);
      setPlayerError(null);
    }
  }, [currentTrack]);

  useEffect(() => {
    if (currentTrack && isPlayerReady) {
      // 플레이어가 준비되면 내부 상태를 즉시 동기화
      setInternalPlaying(isPlaying);
    }
  }, [currentTrack, isPlayerReady, isPlaying]);

  // 컴포넌트 정리 (필요한 경우에만)
  useEffect(() => {
    return () => {
      // 컴포넌트 언마운트 시 정리 작업
    };
  }, []);

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

  return (
    <div className="music-player">
      <div className="player-container">
        <div className="video-container">
          {playerError && (
            <div className="player-error">
              <p>플레이어 오류: {playerError?.message || '알 수 없는 오류'}</p>
              <p>비디오 ID: {currentTrack.videoId}</p>
              <button
                onClick={() => {
                  window.open(`https://www.youtube.com/watch?v=${currentTrack.videoId}`, '_blank');
                }}
                style={{
                  margin: '10px',
                  padding: '5px 10px',
                  backgroundColor: '#ff0000',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                YouTube에서 직접 보기
              </button>
            </div>
          )}

          {/* ReactPlayer 사용: onEnded로 자동 다음 곡 트리거 (호스트만) */}
          <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0 }}>
              <ReactPlayer
                key={currentTrack.videoId}
                url={`https://www.youtube.com/watch?v=${currentTrack.videoId}`}
                playing={internalPlaying}
                controls
                width="100%"
                height="100%"
                onError={(e) => setPlayerError(e)}
                onReady={() => setIsPlayerReady(true)}
                onEnded={() => {
                  if (isHost) {
                    // 호스트에서만 다음 곡 자동 재생
                    if (typeof onEnded === 'function') onEnded();
                  }
                }}
              />
            </div>
          </div>
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
