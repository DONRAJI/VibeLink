const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Signup
router.post('/signup', async (req, res) => {
  try {
    const { username, password, nickname, name, birthdate } = req.body;
    
    // Check if user exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: '이미 존재하는 아이디입니다.' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      username,
      password: hashedPassword,
      nickname,
      name,
      birthdate
    });

    await newUser.save();

    res.status(201).json({ message: '회원가입 성공' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '서버 오류' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ message: '아이디 또는 비밀번호가 잘못되었습니다.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: '아이디 또는 비밀번호가 잘못되었습니다.' });
    }

    const token = jwt.sign({ userId: user._id, nickname: user.nickname }, process.env.JWT_SECRET || 'secret', { expiresIn: '24h' });

    res.json({ token, nickname: user.nickname, userId: user._id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '서버 오류' });
  }
});

module.exports = router;
