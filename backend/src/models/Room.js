const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  host: { type: String, required: true },
  participants: [String],
  queue: [{
    videoId: String,
    title: String,
    thumbnailUrl: String,
    addedBy: String,
    votes: { type: Number, default: 0 }
  }],
  currentTrack: {
    videoId: String,
    title: String,
    thumbnailUrl: String
  },
  // 채팅 메시지 기록 (최근 N개 유지)
  chatMessages: [{
    user: String,
    message: String,
    timestamp: { type: Date, default: Date.now }
  }],
  isPlaying: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Room', roomSchema);
