import React, { useEffect, useState, useRef } from 'react';
import './MusicPlayer.css';

const MusicPlayer = ({ currentTrack, isPlaying, onPlayPause, onNext, onEnded, isHost }) => {
  // --- API 및 플레이어 상태 관리 ---
  const playerRef = useRef(null); // YouTube 플레이어 객체 인스턴스 저장
  const [isApiReady, setIsApiReady] = useState(false); // YouTube API 스크립트 로드 여부
  const [isPlayerReady, setIsPlayerReady] = useState(false); // 플레이어 인스턴스 준비 여부
  
  // --- 내부 상태 관리 ---
  const [internalPlaying, setInternalPlaying] = useState(isPlaying);
  const [playerError, setPlayerError] = useState(null);

  // --- Props를 Ref에 저장 (이벤트 핸들러에서 최신 Props 사용) ---
  // useEffect 안의 이벤트 핸들러는 생성 시점의 state/props를 기억합니다.
  // 항상 최신 onEnded 함수를 참조하기 위해 ref를 사용합니다.
  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  // --- 1. YouTube IFrame API 스크립트 로드 (컴포넌트 마운트 시 1회) ---
  useEffect(() => {
    // window.YT가 이미 있는지 확인 (예: 다른 곳에서 이미 로드)
    if (window.YT && window.YT.Player) {
      setIsApiReady(true);
    } else {
      // 스크립트 태그 동적 생성
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      
      // API가 로드되면 이 전역 함수를 호출함
      window.onYouTubeIframeAPIReady = () => {
        console.log('YouTube IFrame API가 준비되었습니다.');
        setIsApiReady(true);
      };
      
      document.body.appendChild(tag);

      // 컴포넌트 언마운트 시 콜백 정리
      return () => {
        window.onYouTubeIframeAPIReady = null;
      };
    }
  }, []); // 빈 배열: 마운트 시 1회만 실행

  // --- 2. 플레이어 생성/변경 (currentTrack 또는 API 준비 상태 변경 시) ---
  useEffect(() => {
    // API가 준비되지 않았으면 아무것도 하지 않음
    if (!isApiReady) {
      return;
    }

    // (정리) 기존 플레이어가 있다면 파괴
    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }

    // (초기화) 트랙이 없거나 videoId가 없으면 상태 초기화 후 종료
    if (!currentTrack || !currentTrack.videoId) {
      setIsPlayerReady(false);
      setInternalPlaying(false);
      setPlayerError(null);
      return;
    }

    // (생성) API가 준비되었고, currentTrack이 있으면 새 플레이어 생성
  console.log('새 YouTube 플레이어 생성:', currentTrack.videoId);
    setPlayerError(null);
    setIsPlayerReady(false); // onReady 이벤트가 다시 true로 설정할 것임

    playerRef.current = new window.YT.Player('youtube-player-container', {
      videoId: currentTrack.videoId,
      playerVars: {
        'autoplay': isPlaying ? 1 : 0, // 부모의 isPlaying 상태에 따라 자동 재생
        'controls': 1,       // 컨트롤 표시
        'rel': 0,            // 관련 동영상 표시 안 함
        'modestbranding': 1, // YouTube 로고 최소화
        'enablejsapi': 1,    // API 제어 활성화
        'origin': window.location.origin // API 사용을 위한 출처 명시
      },
      events: {
        'onReady': (event) => {
          console.log('플레이어 준비 완료:', currentTrack.videoId);
          setIsPlayerReady(true);
          // 내부 재생 상태를 부모 상태와 동기화
          setInternalPlaying(isPlaying);
        },
        'onStateChange': (event) => {
          const state = event.data;
          console.log('플레이어 상태 변경:', state);
          
          // === 🔥 핵심: 영상 재생 종료 감지 ===
          if (state === window.YT.PlayerState.ENDED) {
            console.log('영상 재생 종료됨 -> onEnded() 호출');
            onEndedRef.current(); // Ref를 통해 최신 onEnded 함수 호출
          }
          // === (핵심 끝) ===

          // 플레이어 내부의 재생/일시정지 버튼 클릭 시 내부 상태 반영
          if (state === window.YT.PlayerState.PLAYING) {
            setInternalPlaying(true);
          } else if (state === window.YT.PlayerState.PAUSED) {
            setInternalPlaying(false);
          }
        },
        'onError': (event) => {
          console.error('YouTube 플레이어 오류:', event.data, 'Video ID:', currentTrack.videoId);
          setPlayerError({ message: `오류 코드 ${event.data}` });
          // 참고: 오류 발생 시(예: "볼 수 없는 동영상") 다음 곡으로 넘기려면
          // onEndedRef.current(); // 이 주석을 해제하세요.
        }
      }
    });

    // 이 useEffect가 다시 실행될 때(트랙 변경 시) 기존 플레이어 파괴
    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
    // isPlaying은 'autoplay' 변수로만 사용하고, 의존성 배열에서 제외
    // (isPlaying 변경 시 플레이어를 파괴/재생성하는 것을 방지)
    // 
    // === 📍 수정된 부분 ===
    // ESLint 경고를 오류로 처리하는 CI 환경을 위해 이 라인을 명시적으로 비활성화합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack, isApiReady]);

  // --- 3. 외부 재생/일시정지 제어 (부모의 isPlaying 변경 시) ---
  useEffect(() => {
    // 내부 UI 상태(버튼 모양)를 부모 상태와 동기화
    setInternalPlaying(isPlaying);

    // 플레이어가 준비되었고, API 제어 객체가 있을 때만 명령 전송
    if (isPlayerReady && playerRef.current) {
      if (isPlaying) {
        console.log('외부 제어: playVideo() 호출');
        playerRef.current.playVideo();
      } else {
        console.log('외부 제어: pauseVideo() 호출');
        playerRef.current.pauseVideo();
      }
    }
  }, [isPlaying, isPlayerReady]); // isPlaying(부모) 또는 isPlayerReady가 변경될 때 실행


  // --- 4. 로컬 컨트롤 버튼 핸들러 ---
  // (이 버튼들은 단지 부모의 상태 변경을 "요청"할 뿐입니다)
  const handlePlay = () => {
    console.log('재생 요청 (부모에게 전달)');
    onPlayPause();
  };

  const handlePause = () => {
    console.log('일시정지 요청 (부모에게 전달)');
    onPlayPause();
  };

  // --- 5. 렌더링 ---

  // 트랙이 없을 때 표시 (기존과 동일)
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

  // 트랙이 있을 때
  return (
    <div className="music-player">
      <div className="player-container">
        <div className="video-container">
          {playerError && (
            // (오류 표시 로직 - 기존과 거의 동일)
            <div className="player-error">
               <p>플레이어 오류: {playerError?.message || '알 수 없는 오류'}</p>
               <p>문제가 발생한 비디오 ID: {currentTrack.videoId}</p>
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
          
          {/* === <iframe> 대신 플레이어가 삽입될 Div === */}
          <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', backgroundColor: '#000' }}>
            <div 
              id="youtube-player-container"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%'
              }}
            />
          </div>
          {/* === (변경 끝) === */}

        </div>
        
        <div className="player-info">
          <div className="track-info">
            <h3 className="track-title">{currentTrack.title}</h3>
            <div className="track-meta">
              <span className="track-source">YouTube</span>
              {currentTrack.addedBy && (
                <span className="track-added-by">추가: {currentTrack.addedBy}</span>
              )}
            </div>
          </div>
          
          <div className="player-controls">
            <button
              className={`control-btn ${internalPlaying ? 'playing' : ''}`}
              // internalPlaying을 기준으로 버튼 모양 변경
            _ onClick={internalPlaying ? handlePause : handlePlay}
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