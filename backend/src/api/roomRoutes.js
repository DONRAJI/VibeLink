const express = require('express');
const Room = require('../models/Room');

const router = express.Router();

// 방 생성 API
router.post('/', async (req, res) => {
  try {
    const { host } = req.body;
    
    // 입력 검증
    if (!host || typeof host !== 'string' || host.trim().length < 2) {
      return res.status(400).json({ message: '유효한 호스트 이름을 입력해주세요. (2글자 이상)' });
    }
    
    if (host.trim().length > 20) {
      return res.status(400).json({ message: '호스트 이름은 20글자 이하여야 합니다.' });
    }
    
    // 고유한 방 코드 생성 (중복 방지)
    let code;
    let attempts = 0;
    do {
      code = Math.random().toString(36).substring(2, 8).toUpperCase();
      attempts++;
      
      if (attempts > 10) {
        throw new Error('방 코드 생성에 실패했습니다.');
      }
    } while (await Room.findOne({ code }));
    
    const room = new Room({
      code,
      host,
      participants: [] // 빈 배열로 시작, 소켓 연결 시에만 추가
    });
    
    await room.save();
    console.log(`✅ 새 방 생성됨: ${code} (호스트: ${host.trim()})`);
    
    res.status(201).json({ 
      roomCode: code, 
      message: '방이 성공적으로 생성되었습니다.',
      host: host.trim()
    });
  } catch (error) {
    console.error('❌ 방 생성 오류:', error);
    
    if (error.name === 'ValidationError') {
      res.status(400).json({ message: '입력 데이터가 올바르지 않습니다.' });
    } else {
      res.status(500).json({ message: '방 생성 중 오류가 발생했습니다. 다시 시도해주세요.' });
    }
  }
});

// 방 정보 조회 API
router.get('/:code', async (req, res) => {
  try {
    const { code } = req.params;
    
    // 입력 검증
    if (!code || code.length !== 6) {
      return res.status(400).json({ message: '유효한 방 코드를 입력해주세요. (6자리)' });
    }
    
    const room = await Room.findOne({ code: code.toUpperCase() });
    if (!room) {
      console.log(`❌ 존재하지 않는 방 코드: ${code}`);
      return res.status(404).json({ message: '존재하지 않는 방 코드입니다.' });
    }
    
    console.log(`✅ 방 정보 조회: ${code} (참가자: ${room.participants.length}명)`);
    res.json(room);
  } catch (error) {
    console.error('❌ 방 조회 오류:', error);
    res.status(500).json({ message: '방 조회 중 오류가 발생했습니다. 다시 시도해주세요.' });
  }
});

module.exports = router;
