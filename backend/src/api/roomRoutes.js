const express = require('express');
const Room = require('../models/Room');

const router = express.Router();

// 공개 방 목록 조회 API (검색/필터/정렬/페이지네이션)
router.get('/', async (req, res) => {
  try {
    const {
      q = '',
      platform,
      tags = '',
      sort = 'active',
      order = 'desc',
      page = '1',
      pageSize = '20',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const sizeNum = Math.min(50, Math.max(1, parseInt(pageSize, 10) || 20));

    const filter = { visibility: 'public' };

    if (platform && ['youtube', 'spotify'].includes(platform)) {
      filter.platform = platform;
    }

    const tagList = (tags || '')
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
    if (tagList.length > 0) {
      filter.tags = { $all: tagList };
    }

    if (q && typeof q === 'string') {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { title: regex },
        { host: regex },
        { tags: regex },
      ];
    }

    const sortMap = {
      active: { lastActivityAt: order === 'asc' ? 1 : -1 },
      created: { createdAt: order === 'asc' ? 1 : -1 },
      popularity: { participantsCount: order === 'asc' ? 1 : -1 },
    };

    // participantsCount는 가상 정렬이므로 이후 집계 필요. 기본은 active로.
    const baseSort = sortMap[sort] || sortMap.active;

    // 집계 파이프라인: participantsCount 계산 및 필요한 필드만 투영
    const pipeline = [
      { $match: filter },
      {
        $addFields: {
          participantsCount: { $size: { $ifNull: ['$participants', []] } },
          titleComputed: { $ifNull: ['$title', { $concat: ['Room ', '$code'] }] },
        }
      },
      { $sort: baseSort },
      { $skip: (pageNum - 1) * sizeNum },
      { $limit: sizeNum },
      {
        $project: {
          _id: 0,
          code: 1,
          title: '$titleComputed',
          host: 1,
          participantsCount: 1,
          platform: 1,
          visibility: 1,
          tags: 1,
          currentTrack: 1,
          isPlaying: 1,
          lastActivityAt: 1,
          createdAt: 1,
        }
      }
    ];

    const [items, total] = await Promise.all([
      Room.aggregate(pipeline).exec(),
      Room.countDocuments(filter)
    ]);

    res.json({
      items,
      page: pageNum,
      pageSize: sizeNum,
      total,
      totalPages: Math.ceil(total / sizeNum)
    });
  } catch (error) {
    console.error('❌ 방 목록 조회 오류:', error);
    res.status(500).json({ message: '방 목록 조회 중 오류가 발생했습니다.' });
  }
});

// 방 생성 API
router.post('/', async (req, res) => {
  try {
    const { host, title, platform, visibility, tags, userId } = req.body || {};
    
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
    
    // Spotify 프리미엄 방 생성 제한
    const selectedPlatform = ['youtube', 'spotify'].includes(platform) ? platform : 'youtube';
    if (selectedPlatform === 'spotify') {
      // 간단한 프리미엄 검증 요청 (OAuth 완료된 사용자)
      if (!userId) {
        return res.status(403).json({ message: 'Spotify 프리미엄 방을 생성하려면 먼저 Spotify 인증이 필요합니다.' });
      }
      // 임시 메모리 저장소 접근 (auth 라우터에서 설정됨)
      const { userTokens } = require('./spotifyAuthRoutes');
      const tokenInfo = userTokens.get(userId);
      if (!tokenInfo || tokenInfo.profile?.product !== 'premium') {
        return res.status(403).json({ message: 'Spotify 프리미엄 사용자만 Spotify 방을 생성할 수 있습니다.' });
      }
    }

    const room = new Room({
      code,
      host: host.trim(),
      title: (typeof title === 'string' && title.trim().length > 0) ? title.trim() : undefined,
      platform: selectedPlatform,
      visibility: visibility === 'private' ? 'private' : 'public',
      tags: Array.isArray(tags) ? tags.filter(t => typeof t === 'string' && t.trim()).slice(0, 10) : [],
      participants: [], // 빈 배열로 시작, 소켓 연결 시에만 추가
      queue: [], // 큐 기본값 초기화로 push 안전성 확보
      lastActivityAt: new Date(),
    });
    
    await room.save();
    console.log(`✅ 새 방 생성됨: ${code} (호스트: ${host.trim()})`);
    
    res.status(201).json({ 
      roomCode: code, 
      message: '방이 성공적으로 생성되었습니다.',
      host: host.trim(),
      platform: room.platform,
      visibility: room.visibility
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
    // Spotify 방 참가 제한
    if (room.platform === 'spotify') {
      const { userId } = req.query;
      const { userTokens } = require('./spotifyAuthRoutes');
      const info = userId ? userTokens.get(userId) : null;
      if (!info || info.profile?.product !== 'premium') {
        return res.status(403).json({ message: 'Spotify 프리미엄 사용자만 이 방에 참가할 수 있습니다.' });
      }
    }
    
    console.log(`✅ 방 정보 조회: ${code} (참가자: ${room.participants.length}명)`);
    res.json(room);
  } catch (error) {
    console.error('❌ 방 조회 오류:', error);
    res.status(500).json({ message: '방 조회 중 오류가 발생했습니다. 다시 시도해주세요.' });
  }
});

module.exports = router;
