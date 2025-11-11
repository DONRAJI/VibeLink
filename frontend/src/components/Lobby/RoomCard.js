import React from 'react';
import './RoomCardStyles.css';

// 플랫폼 라벨 유틸 (ESLint 경고 제거 위해 실제 사용)
const platformLabel = (p) => p === 'spotify' ? 'Spotify' : 'YouTube';

export default function RoomCard({ room, onEnter }) {
  const {
    code,
    title,
    host,
    participantsCount,
    platform,
    tags = [],
    currentTrack,
    isPlaying,
    lastActivityAt,
  } = room;

  return (
    <div className="room-card" onClick={() => onEnter(code)} role="button">
      <div className="room-card-header">
          <span className={`badge platform ${platform}`}>{platformLabel(platform)}</span>
        <span className="badge count">👥 {participantsCount || 0}</span>
      </div>
      <div className="room-title">{title}</div>
      <div className="room-host">Host: {host}</div>
      {currentTrack?.title && (
        <div className="room-track">
          {currentTrack.thumbnailUrl && (
            <img src={currentTrack.thumbnailUrl} alt="thumb" />
          )}
          <span className="track-title">{currentTrack.title}</span>
          <span className={`state ${isPlaying ? 'playing' : 'paused'}`}>{isPlaying ? '▶︎' : '⏸︎'}</span>
        </div>
      )}
      {tags?.length > 0 && (
        <div className="room-tags">
          {tags.slice(0, 5).map((t) => (
            <span key={t} className="tag">#{t}</span>
          ))}
        </div>
      )}
      <div className="room-footer">
        <span className="time">{lastActivityAt ? new Date(lastActivityAt).toLocaleString() : ''}</span>
        <span className="enter">입장 →</span>
      </div>
    </div>
  );
}
