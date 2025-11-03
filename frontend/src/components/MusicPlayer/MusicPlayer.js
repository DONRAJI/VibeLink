import React, { useEffect, useState } from 'react';
import './MusicPlayer.css';

const MusicPlayer = ({ currentTrack, isPlaying, onPlayPause, onNext, onEnded, isHost }) => {
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [internalPlaying, setInternalPlaying] = useState(false);
  const [playerError, setPlayerError] = useState(null);
  const [progressCheckInterval, setProgressCheckInterval] = useState(null);

  // 외부에서 전달받은 isPlaying과 내부 상태를 동기화
  useEffect(() => {
    setInternalPlaying(isPlaying);
  }, [isPlaying]);

  // YouTube Player API 및 자동 다음곡 재생 설정
  useEffect(() => {
    // YouTube Player API 스크립트 로드
    const loadYouTubeAPI = () => {
      if (!window.YT) {
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(script);
      }
    };

    // YouTube API 준비 함수 설정
    window.onYouTubeIframeAPIReady = () => {
      console.log('YouTube API 준비 완료');
    };

    // 자동 다음곡 재생을 위한 플레이어 리스너 설정
    window.setupYouTubePlayerListener = () => {
      console.log('YouTube 플레이어 리스너 설정 중...');
      
      let autoAdvanceTriggered = false; // 중복 실행 방지
      
      const handleMessage = (event) => {
        if (event.origin !== 'https://www.youtube.com' && event.origin !== 'https://www.youtube-nocookie.com') {
          return;
        }

        try {
          const data = JSON.parse(event.data);
          
          // 플레이어 상태 변경 이벤트
          if (data.event === 'video-progress' && data.info) {
            const currentTime = data.info.currentTime;
            const duration = data.info.duration;
            
            // 영상이 거의 끝났을 때 (마지막 2초)
            if (duration && currentTime && (duration - currentTime) <= 2 && !autoAdvanceTriggered) {
              console.log('곡 종료 감지, 다음 곡으로 이동');
              autoAdvanceTriggered = true;
              
              if (onNext) {
                setTimeout(() => {
                  onNext(); // 다음 곡으로 이동
                  autoAdvanceTriggered = false; // 리셋
                }, 500);
              }
            }
          }
          
          // YouTube Player 상태 이벤트 (직접적인 종료 감지)
          if (data.event === 'onStateChange' && data.info === 0) { // 0 = ended
            console.log('YouTube 플레이어 종료 이벤트 감지');
            if (onNext && !autoAdvanceTriggered) {
              autoAdvanceTriggered = true;
              setTimeout(() => {
                onNext();
                autoAdvanceTriggered = false;
              }, 500);
            }
          }
        } catch (parseError) {
          // JSON 파싱 오류는 무시
        }
      };

      // 기존 리스너 제거 후 새로 추가
      window.removeEventListener('message', handleMessage);
      window.addEventListener('message', handleMessage);
      
      console.log('YouTube 메시지 리스너 등록 완료');
    };

    loadYouTubeAPI();

    // 컴포넌트 언마운트 시 정리
    return () => {
      delete window.setupYouTubePlayerListener;
    };
  }, [onNext]);

  useEffect(() => {
    if (currentTrack) {
      console.log('새 트랙 로드:', currentTrack.title, 'videoId:', currentTrack.videoId);
      
      // 즉시 플레이어를 준비 상태로 설정
      setIsPlayerReady(true);
      setPlayerError(null);
      
      // 기존 진행 체크 인터벌 정리
      if (progressCheckInterval) {
        clearInterval(progressCheckInterval);
      }
      
      // 새로운 트랙을 위한 자동 진행 체크 설정 (백업 방식)
      const checkProgress = setInterval(() => {
        try {
          const iframe = document.getElementById('youtube-iframe');
          if (iframe && iframe.contentWindow) {
            // YouTube Player API를 통한 현재 시간 확인 (가능한 경우)
            iframe.contentWindow.postMessage(
              '{"event":"command","func":"getCurrentTime","args":""}',
              'https://www.youtube.com'
            );
            iframe.contentWindow.postMessage(
              '{"event":"command","func":"getDuration","args":""}',
              'https://www.youtube.com'
            );
          }
        } catch (error) {
          // 에러 무시 - 메인 이벤트 리스너가 작동할 것
        }
      }, 5000); // 5초마다 체크
      
      setProgressCheckInterval(checkProgress);
    }
    
    return () => {
      if (progressCheckInterval) {
        clearInterval(progressCheckInterval);
      }
    };
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

  // 로딩 화면 제거 - 바로 플레이어 표시

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
                  console.log('직접 YouTube 링크로 이동');
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
          
          {/* YouTube iframe 직접 사용 - 자동 다음 곡 기능 포함 */}
          <div 
            style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden' }}
            id="youtube-player-container"
          >
            <iframe
              key={currentTrack.videoId} // 비디오 변경 시 iframe 재생성
              id="youtube-iframe"
              src={`https://www.youtube-nocookie.com/embed/${currentTrack.videoId}?autoplay=${internalPlaying ? 1 : 0}&controls=1&rel=0&showinfo=0&modestbranding=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}&widget_referrer=${encodeURIComponent(window.location.origin)}&iv_load_policy=3&fs=1&cc_load_policy=0&playsinline=1&start=0&end=0&loop=0&playlist=`}
              title={currentTrack.title}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%'
              }}
              onLoad={() => {
                console.log('YouTube iframe 로드 완료');
                // YouTube Player API로 이벤트 감지 설정
                window.setupYouTubePlayerListener && window.setupYouTubePlayerListener();
              }}
            />
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
