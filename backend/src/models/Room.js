const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  host: { type: String, required: true },
  participants: { type: [String], default: [] },
  queue: {
    type: [{
      videoId: String,
      title: String,
      thumbnailUrl: String,
      addedBy: String,
      votes: { type: Number, default: 0 }
    }],
    default: []
  },
  currentTrack: {
    videoId: String,
    title: String,
    thumbnailUrl: String
  },
  isPlaying: { type: Boolean, default: false },
  // Auto-DJ 기능 토글
  autoDjEnabled: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
}, { minimize: false });

module.exports = mongoose.model('Room', roomSchema);
