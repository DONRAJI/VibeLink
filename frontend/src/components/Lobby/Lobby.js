import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../Sidebar/Sidebar';
import RoomCard from '../RoomCard/RoomCard';
import './Lobby.css';

const API_BASE = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

export default function Lobby() {
  const navigate = useNavigate();
  const [publicRooms, setPublicRooms] = useState([]);
  const [myRooms, setMyRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [nickname, setNickname] = useState(localStorage.getItem('nickname') || 'User');

  useEffect(() => {
    async function fetchRooms() {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/rooms?visibility=public`);
        const data = await res.json();
        setPublicRooms(data.items || []);
        // Mock "Recently Played" with some public rooms for now
        setMyRooms(data.items ? data.items.slice(0, 4) : []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchRooms();
  }, []);

  return (
    <div className="lobby-container">
      <Sidebar onCreateRoom={() => navigate('/create')} />
      <div className="main-content">
        <header className="lobby-top-bar">
          <div className="nav-arrows">
            <button className="arrow-btn" onClick={() => navigate(-1)}>{'<'}</button>
            <button className="arrow-btn" onClick={() => navigate(1)}>{'>'}</button>
          </div>
          <div className="search-bar-container">
             {/* Search bar could go here if needed, or in sidebar */}
          </div>
          <div className="user-menu">
            <button className="install-app-btn">앱 설치하기</button>
            <div className="user-profile-icon">
              {nickname.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>
        
        <div className="content-scroll">
          <section className="content-section">
            <h2>최근 재생한 항목</h2>
            <div className="card-grid">
              {myRooms.length > 0 ? myRooms.map(room => (
                <RoomCard key={room.code} room={room} onEnter={() => navigate(`/room/${room.code}`)} />
              )) : <p className="empty-msg">최근 재생한 방이 없습니다.</p>}
            </div>
          </section>

          <section className="content-section">
            <h2>{nickname} 님을 위한 믹스 & 추천</h2>
            <div className="card-grid">
              {publicRooms.map(room => (
                <RoomCard key={room.code} room={room} onEnter={() => navigate(`/room/${room.code}`)} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
