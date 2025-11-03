const express = require('express');
const Room = require('../models/Room');

const router = express.Router();

// 방 생성 API
router.post('/', async (req, res) => {
  try {
    const { host } = req.body;
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    const room = new Room({
      code,
      host,
      participants: [host]
    });
    
    await room.save();
    res.status(201).json({ roomCode: code, message: '방이 성공적으로 생성되었습니다.' });
  } catch (error) {
    console.error('방 생성 오류:', error);
    res.status(500).json({ message: '방 생성 중 오류가 발생했습니다.' });
  }
});

// 방 정보 조회 API
router.get('/:code', async (req, res) => {
  try {
    const room = await Room.findOne({ code: req.params.code });
    if (!room) {
      return res.status(404).json({ message: '방을 찾을 수 없습니다.' });
    }
    res.json(room);
  } catch (error) {
    console.error('방 조회 오류:', error);
    res.status(500).json({ message: '방 조회 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
