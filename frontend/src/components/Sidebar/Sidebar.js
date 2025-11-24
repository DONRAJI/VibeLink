import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Sidebar.css';

export default function Sidebar({ onCreateRoom }) {
  const navigate = useNavigate();

  return (
    <div className="sidebar">
      <div className="sidebar-nav">
        <button className="nav-item active" onClick={() => navigate('/lobby')}>
          <span className="icon">🏠</span>
          <span>홈</span>
        </button>
        <button className="nav-item">
          <span className="icon">🔍</span>
          <span>검색</span>
        </button>
      </div>
      
      <div className="sidebar-library">
        <div className="library-header">
          <button className="library-btn">
            <span className="icon">📚</span>
            <span>내 라이브러리</span>
          </button>
          <button className="create-btn" onClick={onCreateRoom} title="방 만들기">
            +
          </button>
        </div>
        
        <div className="library-filters">
          <button className="filter-pill">아티스트</button>
        </div>

        <div className="library-content">
          <div className="library-item">
            <div className="item-icon gradient-heart">♥</div>
            <div className="item-info">
              <div className="item-title">좋아요 표시한 곡</div>
              <div className="item-sub">📌 플레이리스트 • 1곡</div>
            </div>
          </div>
          {/* Example items */}
          <div className="library-item">
            <div className="item-img-placeholder"></div>
            <div className="item-info">
              <div className="item-title">MRCH</div>
              <div className="item-sub">아티스트</div>
            </div>
          </div>
          <div className="library-item">
            <div className="item-img-placeholder"></div>
            <div className="item-info">
              <div className="item-title">HANRORO</div>
              <div className="item-sub">아티스트</div>
            </div>
          </div>
          <div className="library-item">
            <div className="item-img-placeholder"></div>
            <div className="item-info">
              <div className="item-title">AKMU</div>
              <div className="item-sub">아티스트</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
