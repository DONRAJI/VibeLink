import React, { useState, useEffect } from 'react';
import './SplashScreen.css';

const SplashScreen = ({ onComplete }) => {
  const [isVisible, setIsVisible] = useState(true);
  const logoSrc = process.env.REACT_APP_LOGO_URL || (process.env.PUBLIC_URL ? process.env.PUBLIC_URL + '/VibeLink1.png' : '/VibeLink1.png');

  useEffect(() => {
    // 총 애니메이션 시간(3.5초) + 추가 대기 시간을 고려하여 타이머 설정
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => {
        onComplete();
      }, 500); // fade-out 시간
    }, 4000); // 3500ms(애니메이션) + 500ms(대기)

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className={`splash-screen ${isVisible ? 'visible' : 'fade-out'}`}>
      <div className="splash-content">
        <div className="logo-container">
          <div className="logo-placeholder">
            {/* 4번째 이미지를 기본 로고로 사용 */}
            <img src={logoSrc} alt="VibeLink Logo" className="logo-image" />
          </div>
        </div>
        <h1 className="app-title">VibeLink</h1>
        <p className="app-subtitle">실시간 공유 플레이리스트</p>
        <div className="loading-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;