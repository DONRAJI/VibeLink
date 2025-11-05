const Room = require('../models/Room');

class RoomSocketHandler {
  constructor(io, youtubeService) {
    this.io = io;
    this.youtubeService = youtubeService;
  }

  handleConnection(socket) {
    console.log(`✅ 새로운 유저 접속: ${socket.id}`);

    // 방 참가 이벤트
    socket.on('joinRoom', async (data) => {
      await this.handleJoinRoom(socket, data);
    });

    // 트랙 추가 이벤트
    socket.on('addTrack', async ({ roomCode, track, addedBy }) => {
      await this.handleAddTrack(socket, roomCode, track, addedBy);
    });

    // 재생 제어 이벤트
    socket.on('controlPlayback', async ({ roomCode, action, track }) => {
      await this.handleControlPlayback(socket, roomCode, action, track);
    });

    // Auto-DJ 토글 이벤트
    socket.on('toggleAutoDJ', async ({ roomCode, enabled }) => {
      await this.handleToggleAutoDJ(socket, roomCode, enabled);
    });

    // 트랙 투표 이벤트
    socket.on('voteTrack', async ({ roomCode, videoId, voteType }) => {
      await this.handleVoteTrack(socket, roomCode, videoId, voteType);
    });

    // 연결 해제 이벤트
    socket.on('disconnect', async () => {
      await this.handleDisconnect(socket);
    });
  }

  async handleToggleAutoDJ(socket, roomCode, enabled) {
    try {
      const room = await Room.findOne({ code: roomCode });
      if (!room) return;

      room.autoDjEnabled = !!enabled;
      await room.save();

      this.io.to(roomCode).emit('roomSettingsUpdated', {
        autoDjEnabled: room.autoDjEnabled,
      });
    } catch (error) {
      console.error('Auto-DJ 토글 오류:', error);
    }
  }

  async handleJoinRoom(socket, data) {
    try {
      // data는 문자열(과거 방식) 또는 { roomCode, nickname } 객체일 수 있음
      const roomCode = typeof data === 'string' ? data : data?.roomCode;
      const nickname = typeof data === 'object' ? (data?.nickname || '') : '';

      const room = await Room.findOne({ code: roomCode });
      if (!room) {
        socket.emit('roomError', { message: '방을 찾을 수 없습니다.' });
        return;
      }
      
      socket.join(roomCode);
      socket.roomCode = roomCode;
      socket.userId = socket.id;
      if (nickname) socket.userName = nickname;
      
      // 참가자 추가 (닉네임 우선 저장, 없으면 socket.id 저장 - 하위호환)
      const participantKey = nickname || socket.id;
      if (!room.participants.includes(participantKey)) {
        room.participants.push(participantKey);
        await room.save();
      }
      
      // 방 정보 전송
      socket.emit('roomJoined', room);
      this.io.to(roomCode).emit('participantsUpdated', room.participants);
      
      console.log(`유저 ${socket.id}가 ${roomCode} 방에 참가했습니다.`);
    } catch (error) {
      console.error('방 참가 오류:', error);
      socket.emit('roomError', { message: '방 참가 중 오류가 발생했습니다.' });
    }
  }

  async handleAddTrack(socket, roomCode, track, addedBy) {
    try {
      const room = await Room.findOne({ code: roomCode });
      if (!room) return;
      
  const newTrack = { ...track, addedBy, votes: 0 };
      room.queue.push(newTrack);
      await room.save();
      
      console.log(`${roomCode} 방에 '${track.title}' 트랙 추가 요청`);
      this.io.to(roomCode).emit('trackAdded', newTrack);
      this.io.to(roomCode).emit('queueUpdated', room.queue);
    } catch (error) {
      console.error('트랙 추가 오류:', error);
    }
  }

  async handleControlPlayback(socket, roomCode, action, track) {
    try {
      const room = await Room.findOne({ code: roomCode });
      if (!room) return;
      const previousTrack = room.currentTrack ? { ...room.currentTrack } : null;

      if (action === 'play' && track) {
        room.currentTrack = track;
        room.isPlaying = true;
        // 현재 트랙을 큐에서 제거
        room.queue = room.queue.filter(t => t.videoId !== track.videoId);
      } else if (action === 'pause') {
        room.isPlaying = false;
      } else if (action === 'next') {
        if (room.queue.length > 0) {
          room.currentTrack = room.queue[0];
          room.queue = room.queue.slice(1);
          room.isPlaying = true;
        } else {
          // 큐가 비어있을 때 Auto-DJ가 켜져 있으면 추천곡 자동 추가
          if (room.autoDjEnabled && previousTrack && this.youtubeService) {
            const autoTrack = await this.pickAutoDjTrack(room, previousTrack.videoId);
            if (autoTrack) {
              room.currentTrack = autoTrack;
              room.isPlaying = true;
            } else {
              room.currentTrack = null;
              room.isPlaying = false;
            }
          } else {
            room.currentTrack = null;
            room.isPlaying = false;
          }
        }
      }
      
      await room.save();
      
      console.log(`${roomCode} 방에 '${action}' 컨트롤 요청`);
      this.io.to(roomCode).emit('playbackControlled', { action, track: room.currentTrack, isPlaying: room.isPlaying });
      this.io.to(roomCode).emit('queueUpdated', room.queue);
    } catch (error) {
      console.error('재생 제어 오류:', error);
    }
  }

  // Auto-DJ: 추천곡 중 중복을 제외하고 하나 선택
  async pickAutoDjTrack(room, seedVideoId) {
    try {
      const candidates = await this.youtubeService.getRelatedVideos(seedVideoId, 10);
      const existingIds = new Set([
        ...(room.queue || []).map(t => t.videoId),
        room.currentTrack?.videoId,
      ].filter(Boolean));

      const chosen = candidates.find(c => !existingIds.has(c.videoId));
      if (!chosen) return null;

      const newTrack = {
        videoId: chosen.videoId,
        title: chosen.title,
        thumbnailUrl: chosen.thumbnailUrl,
        addedBy: 'AutoDJ',
        votes: 0,
      };

      // AutoDJ가 선택했지만 곧바로 재생하므로 큐에는 넣지 않음
      // 필요시 히스토리/로그 용도로 별도 저장 가능
      return newTrack;
    } catch (e) {
      console.error('Auto-DJ 추천 실패:', e.message);
      return null;
    }
  }

  async handleVoteTrack(socket, roomCode, videoId, voteType) {
    try {
      const room = await Room.findOne({ code: roomCode });
      if (!room) return;
      
      const track = room.queue.find(t => t.videoId === videoId);
      if (track) {
        if (voteType === 'up') {
          track.votes += 1;
        } else if (voteType === 'down') {
          track.votes = Math.max(0, track.votes - 1);
        }

        // 투표 수에 따라 큐 정렬
        room.queue.sort((a, b) => b.votes - a.votes);
        await room.save();

        this.io.to(roomCode).emit('queueUpdated', room.queue);
      }
    } catch (error) {
      console.error('투표 오류:', error);
    }
  }

  async handleDisconnect(socket) {
    try {
      if (socket.roomCode) {
        const room = await Room.findOne({ code: socket.roomCode });
        if (room) {
          const removeKey = socket.userName || socket.userId;
          room.participants = room.participants.filter(p => p !== removeKey);
          await room.save();
          this.io.to(socket.roomCode).emit('participantsUpdated', room.participants);
        }
      }
      console.log(`❌ 유저 접속 해제: ${socket.id}`);
    } catch (error) {
      console.error('연결 해제 오류:', error);
    }
  }
}

module.exports = RoomSocketHandler;
