// api/roomRoutes.js (전체 코드)

const express = require('express');
const Room = require('../models/Room');
// 공유 저장소에서 userTokens를 가져옵니다.
const userTokens = require('../services/spotifyTokenStore');

const router = express.Router();

// 공개 방 목록 조회 API
router.get('/', async (req, res) => {
  try {
    const { q = '', platform, tags = '', sort = 'active', order = 'desc', page = '1', pageSize = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const sizeNum = Math.min(50, Math.max(1, parseInt(pageSize, 10) || 20));
    const filter = { visibility: 'public' };
    if (platform && ['youtube', 'spotify'].includes(platform)) {
      filter.platform = platform;
    }
    const tagList = (tags || '').split(',').map(t => t.trim()).filter(Boolean);
    if (tagList.length > 0) {
      filter.tags = { $all: tagList };
    }
    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ title: regex }, { host: regex }, { tags: regex }];
    }
    const sortMap = {
      active: { lastActivityAt: order === 'asc' ? 1 : -1 },
      created: { createdAt: order === 'asc' ? 1 : -1 },
      popularity: { participantsCount: order === 'asc' ? 1 : -1 },
    };
    const baseSort = sortMap[sort] || sortMap.active;
    const pipeline = [
      { $match: filter },
      { $addFields: { participantsCount: { $size: { $ifNull: ['$participants', []] } } } },
      { $sort: baseSort },
      { $skip: (pageNum - 1) * sizeNum },
      { $limit: sizeNum },
      { $project: { _id: 0, code: 1, title: 1, host: 1, participantsCount: 1, platform: 1, tags: 1, currentTrack: 1, isPlaying: 1, lastActivityAt: 1, createdAt: 1 } }
    ];
    const [items, total] = await Promise.all([
      Room.aggregate(pipeline).exec(),
      Room.countDocuments(filter)
    ]);
    res.json({ items, page: pageNum, pageSize: sizeNum, total, totalPages: Math.ceil(total / sizeNum) });
  } catch (error) {
    console.error('방 목록 조회 오류:', error);
    res.status(500).json({ message: '방 목록 조회 중 오류가 발생했습니다.' });
  }
});

// 방 생성 API
router.post('/', async (req, res) => {
  try {
    const { host, title, platform, visibility, tags, userId } = req.body || {};
    if (!host || host.trim().length < 2 || host.trim().length > 20) {
      return res.status(400).json({ message: '유효한 호스트 이름을 입력해주세요 (2-20자).' });
    }
    let code;
    let attempts = 0;
    do {
      code = Math.random().toString(36).substring(2, 8).toUpperCase();
      if (++attempts > 10) throw new Error('방 코드 생성 실패');
    } while (await Room.findOne({ code }));
    
    const selectedPlatform = ['youtube', 'spotify'].includes(platform) ? platform : 'youtube';
    if (selectedPlatform === 'spotify') {
      if (!userId) {
        return res.status(403).json({ message: 'Spotify 인증이 필요합니다.' });
      }
      const tokenInfo = userTokens.get(userId);
      if (!tokenInfo || tokenInfo.profile?.product !== 'premium') {
        return res.status(403).json({ message: 'Spotify 프리미엄 사용자만 방을 생성할 수 있습니다.' });
      }
    }
    const room = new Room({
      code,
      host: host.trim(),
      title: title?.trim(),
      platform: selectedPlatform,
      visibility: visibility === 'private' ? 'private' : 'public',
      tags: Array.isArray(tags) ? tags.filter(t => typeof t === 'string' && t.trim()).slice(0, 10) : [],
      participants: [],
      queue: [],
      lastActivityAt: new Date(),
      createdAt: new Date(),
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
    const { code } = req.params;
    const room = await Room.findOne({ code: code.toUpperCase() });
    if (!room) {
      return res.status(404).json({ message: '존재하지 않는 방 코드입니다.' });
    }
    if (room.platform === 'spotify') {
      const { userId } = req.query;
      const info = userId ? userTokens.get(userId) : null;
      if (!info || info.profile?.product !== 'premium') {
        return res.status(403).json({ message: 'Spotify 프리미엄 사용자만 이 방에 참가할 수 있습니다.' });
      }
    }
    res.json(room);
  } catch (error) {
    console.error('방 조회 오류:', error);
    res.status(500).json({ message: '방 조회 중 오류가 발생했습니다.' });
  }
});

module.exports = router;