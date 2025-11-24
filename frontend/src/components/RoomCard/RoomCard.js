import React from 'react';
import './RoomCard.css';

export default function RoomCard({ room, onEnter }) {
  return (
    <div className="room-card" onClick={() => onEnter(room.code)}>
      <div className="card-image-container">
        {/* Placeholder or room image */}
        <div className="card-image-placeholder">
          🎵
        </div>
        <button className="play-btn">▶</button>
      </div>
      <div className="card-info">
        <h3 className="card-title">{room.name}</h3>
        <p className="card-desc">
          {room.host} • {room.platform === 'spotify' ? 'Spotify' : 'YouTube'}
        </p>
      </div>
    </div>
  );
}
