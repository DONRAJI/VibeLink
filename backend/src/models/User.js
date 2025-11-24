const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true }, // ID
  password: { type: String, required: true },
  nickname: { type: String, required: true },
  name: { type: String, required: true },
  birthdate: { type: String, required: true }, // YYYY-MM-DD format
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
