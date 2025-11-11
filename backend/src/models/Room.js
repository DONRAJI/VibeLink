const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  host: { type: String, required: true },
  title: { type: String },
  platform: { type: String, enum: ['youtube', 'spotify'], default: 'youtube' },
  visibility: { type: String, enum: ['public', 'private'], default: 'public' },
  tags: [{ type: String }],
  participants: [String],
  // 통합 큐 스키마: YouTube 또는 Spotify 트랙을 저장
  queue: [{
    platform: { type: String, enum: ['youtube', 'spotify'], default: 'youtube' },
    // YouTube 전용
    videoId: String,
    // Spotify 전용
    id: String,      // spotify track id
    uri: String,     // spotify:track:...
    artists: String,
    durationMs: Number,
    // 공통
    title: String,
    thumbnailUrl: String,
    addedBy: String,
    votes: { type: Number, default: 0 }
  }],
  // 현재 재생 트랙(플랫폼 통합)
  currentTrack: {
    platform: { type: String, enum: ['youtube', 'spotify'], default: 'youtube' },
    videoId: String, // YouTube
    id: String,      // Spotify
    uri: String,
    artists: String,
    durationMs: Number,
    title: String,
    thumbnailUrl: String
  },
  // 채팅 메시지 기록 (최근 메시지 보관)
  chatMessages: [{
    user: String,
    message: String,
    timestamp: { type: Date, default: Date.now }
  }],
  isPlaying: { type: Boolean, default: false },
  lastActivityAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

// 인덱스 (검색/정렬 최적화)
roomSchema.index({ visibility: 1, lastActivityAt: -1 });
roomSchema.index({ platform: 1 });
roomSchema.index({ tags: 1 });

module.exports = mongoose.model('Room', roomSchema);
