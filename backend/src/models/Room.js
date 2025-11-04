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
    votes: { type: Number, default: 0 },
    voters: { type: [String], default: [] } // 각 트랙에 투표한 사용자(socket.id) 목록
  }],
  currentTrack: {
    videoId: String,
    title: String,
    thumbnailUrl: String
  },
  isPlaying: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Room', roomSchema);
