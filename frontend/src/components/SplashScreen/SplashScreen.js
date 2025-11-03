import React, { useState, useEffect } from 'react';
import './SplashScreen.css';

const SplashScreen = ({ onComplete }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => {
        onComplete();
      }, 500);
    }, 2000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className={`splash-screen ${isVisible ? 'visible' : 'fade-out'}`}>
      <div className="splash-content">
        <div className="logo-container">
          <div className="logo-placeholder">
            🎵
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
