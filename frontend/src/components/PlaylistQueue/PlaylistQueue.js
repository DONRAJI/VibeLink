import React from 'react';
import './PlaylistQueue.css';

const PlaylistQueue = ({ queue, currentTrack, onPlayTrack, onVoteTrack, isHost }) => {
  const handleVote = (videoId, voteType) => {
    onVoteTrack(videoId, voteType);
  };

  if (queue.length === 0) {
    return (
      <div className="playlist-queue empty">
        <div className="empty-queue">
          <div className="empty-icon">📝</div>
          <h3>플레이리스트가 비어있습니다</h3>
          <p>음악을 검색하여 플레이리스트에 추가해보세요!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="playlist-queue">
      <div className="queue-header">
        <h3>플레이리스트 큐 ({queue.length})</h3>
        {!currentTrack && queue.length > 0 && (
          <button 
            className="play-first-btn"
            onClick={() => onPlayTrack(queue[0])}
            disabled={!isHost}
          >
            ▶️ 첫 곡 재생
          </button>
        )}
      </div>
      
      <div className="queue-list">
        {queue.map((track, index) => (
          <div key={track.videoId} className="queue-item">
            <div className="track-info">
              <div className="track-number">{index + 1}</div>
              <img 
                src={track.thumbnailUrl} 
                alt={track.title} 
                className="track-thumbnail"
              />
              <div className="track-details">
                <h4 className="track-title">{track.title}</h4>
                <div className="track-meta">
                  {track.addedBy && (
                    <span className="added-by">추가: {track.addedBy}</span>
                  )}
                  <span className="votes">👍 {track.votes || 0}</span>
                </div>
              </div>
            </div>
            
            <div className="track-actions">
              {isHost && (
                <button 
                  className="action-btn play-btn"
                  onClick={() => onPlayTrack(track)}
                  title="지금 재생"
                >
                  ▶️
                </button>
              )}
              
              <div className="vote-buttons">
                <button
                  className="vote-btn upvote"
                  onClick={() => handleVote(track.videoId, 'up')}
                  title="좋아요"
                >
                  👍
                </button>
                <button
                  className="vote-btn downvote"
                  onClick={() => handleVote(track.videoId, 'down')}
                  title="싫어요"
                >
                  👎
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PlaylistQueue;
