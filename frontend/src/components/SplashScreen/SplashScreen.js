import React, { useState, useEffect } from 'react';
import './SplashScreen.css';

const SplashScreen = ({ onComplete }) => {
  const [isVisible, setIsVisible] = useState(true);
  const logoSrc = process.env.REACT_APP_LOGO_URL || (process.env.PUBLIC_URL ? process.env.PUBLIC_URL + '/VibeLink1.png' : '/VibeLink1.png');

  useEffect(() => {
    // 화면 표시 시간을 2초로 다시 줄입니다.
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => {
        onComplete();
      }, 500); // fade-out 시간
    }, 2000); // 2초

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className={`splash-screen ${isVisible ? 'visible' : 'fade-out'}`}>
      <div className="splash-content">
        <div className="logo-container">
          <div className="logo-placeholder">
            <img src={logoSrc} alt="VibeLink Logo" className="logo-image" />
          </div>
        </div>
        <h1 className="app-title">VibeLink</h1>
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