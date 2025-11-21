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
    // 채팅 메시지 수신
    socket.on('chatMessage', async ({ roomCode, user, message }) => {
      await this.handleChatMessage(socket, roomCode, user, message);
    });
    socket.on('controlPlayback', async ({ roomCode, action, track }) => {
      await this.handleControlPlayback(socket, roomCode, action, track);
    });

    // (Auto-DJ 기능 제거됨)

    // 트랙 투표 이벤트
    socket.on('voteTrack', async ({ roomCode, videoId, trackId, voteType }) => {
      const id = trackId || videoId; // 하위호환
      await this.handleVoteTrack(socket, roomCode, id, voteType);
    });

    // 연결 해제 이벤트
    socket.on('disconnect', async () => {
      await this.handleDisconnect(socket);
    });
  }

  // (Auto-DJ 토글 핸들러 제거)

  async handleJoinRoom(socket, data) {
    try {
      // data는 문자열(과거 방식) 또는 { roomCode, nickname } 객체일 수 있음
      const roomCode = (typeof data === 'string' ? data : data?.roomCode) || '';
      const normalizedCode = roomCode.toString().toUpperCase();
      const nickname = typeof data === 'object' ? (data?.nickname || '') : '';

      // 이미 동일 방에 참가한 상태면 중복 처리 방지
      if (socket.roomCode && socket.roomCode === normalizedCode) {
        console.log(`⚠️ 중복 joinRoom 무시: ${socket.id} -> ${normalizedCode}`);
        return;
      }

      const room = await Room.findOne({ code: normalizedCode });
      if (!room) {
        socket.emit('roomError', { message: '방을 찾을 수 없습니다.' });
        return;
      }

      socket.join(normalizedCode);
      socket.roomCode = normalizedCode;
      socket.userId = socket.id;
      if (nickname) socket.userName = nickname;

      // 참가자 추가 (닉네임 우선 저장, 없으면 socket.id 저장 - 하위호환)
      const participantKey = nickname || socket.id;
      if (!room.participants.includes(participantKey)) {
        room.participants.push(participantKey);
        room.lastActivityAt = new Date();
        await room.save();
      }

      // 방 정보 전송
      socket.emit('roomJoined', room);
      this.io.to(normalizedCode).emit('participantsUpdated', room.participants);

      // 기존 채팅 기록 (최대 100개) 전송
      const history = (room.chatMessages || []).slice(-100);
      socket.emit('chatHistory', history);

      console.log(`유저 ${socket.id}가 ${normalizedCode} 방에 참가했습니다.`);
    } catch (error) {
      console.error('방 참가 오류:', error);
      socket.emit('roomError', { message: '방 참가 중 오류가 발생했습니다.' });
    }
  }

  async handleAddTrack(socket, roomCode, track, addedBy) {
    try {
      const code = (roomCode || '').toString().toUpperCase();
      const room = await Room.findOne({ code });
      if (!room) return;
      // 큐 안전 가드: 없으면 초기화
      if (!Array.isArray(room.queue)) room.queue = [];
      // 통합 트랙 구조: YouTube(videoId) 또는 Spotify(id, uri)
      let newTrack;
      if (track.platform === 'spotify') {
        newTrack = {
          id: track.id,
          uri: track.uri,
          title: track.title,
          thumbnailUrl: track.thumbnailUrl,
          artists: track.artists,
          durationMs: track.durationMs,
          platform: 'spotify',
          addedBy,
          votes: 0
        };
      } else {
        newTrack = {
          videoId: track.videoId,
          title: track.title,
          thumbnailUrl: track.thumbnailUrl,
          platform: 'youtube',
          addedBy,
          votes: 0
        };
      }
      room.queue.push(newTrack);
      room.lastActivityAt = new Date();
      await room.save();

      console.log(`${code} 방에 '${track.title}' 트랙 추가 요청`);
      this.io.to(code).emit('trackAdded', newTrack);
      this.io.to(code).emit('queueUpdated', room.queue);
    } catch (error) {
      console.error('트랙 추가 오류:', error);
    }
  }

  async handleControlPlayback(socket, roomCode, action, track) {
    try {
      const code = (roomCode || '').toString().toUpperCase();
      const room = await Room.findOne({ code });
      if (!room) return;
      const previousTrack = room.currentTrack ? { ...room.currentTrack } : null;
      const persistent = room.playlistMode === 'persistent';

      if (action === 'play' && track) {
        room.currentTrack = track;
        room.isPlaying = true;
        if (!persistent) {
          room.queue = room.queue.filter(t => {
            if (track.platform === 'spotify') {
              return !(t.platform === 'spotify' && t.id === track.id);
            }
            return !(t.platform === 'youtube' && t.videoId === track.videoId);
          });
        } else {
          // persistent 모드: cursor를 현재 트랙 위치로 이동
          const idx = room.queue.findIndex(t => (track.platform === 'spotify' ? t.id === track.id : t.videoId === track.videoId));
          if (idx >= 0) room.playlistCursor = idx;
        }
      } else if (action === 'pause') {
        room.isPlaying = false;
      } else if (action === 'next') {
        if (!persistent) {
          if (room.queue.length > 0) {
            const nextTrack = room.queue[0];
            room.currentTrack = nextTrack;
            room.queue.shift(); // Use shift() instead of slice for clarity
            room.markModified('queue'); // Explicitly mark as modified
            room.isPlaying = true;
            console.log(`[NEXT] Playing: ${nextTrack.title}, Remaining Queue: ${room.queue.length}`);
          } else {
            const recommended = await this.recommendNext(previousTrack, room);
            if (recommended) {
              room.currentTrack = recommended;
              room.isPlaying = true;
            } else {
              room.currentTrack = null;
              room.isPlaying = false;
            }
          }
        } else {
          // persistent 모드: cursor 이동
          if (room.queue.length === 0) {
            room.currentTrack = null;
            room.isPlaying = false;
          } else {
            let nextIndex = room.playlistCursor + 1;
            if (nextIndex >= room.queue.length) {
              // 끝에 도달: 재생 종료 (루프 가능하게 하려면 nextIndex=0 설정)
              room.currentTrack = null;
              room.isPlaying = false;
            } else {
              room.playlistCursor = nextIndex;
              room.currentTrack = room.queue[nextIndex];
              room.isPlaying = true;
            }
          }
        }
      }

      room.lastActivityAt = new Date();
      await room.save();

      console.log(`${code} 방에 '${action}' 컨트롤 요청. Current: ${room.currentTrack?.title}`);
      this.io.to(code).emit('playbackControlled', { action, track: room.currentTrack, isPlaying: room.isPlaying });
      this.io.to(code).emit('queueUpdated', room.queue);
      if (persistent) {
        this.io.to(code).emit('playlistCursor', { cursor: room.playlistCursor, mode: room.playlistMode });
      }
    } catch (error) {
      console.error('재생 제어 오류:', error);
    }
  }

  // 이전 트랙을 시드로 YouTube 관련 영상에서 하나 선택
  async recommendNext(previousTrack, room) {
    try {
      if (!previousTrack?.videoId || !this.youtubeService) return null;
      const candidates = await this.youtubeService.getRelatedVideos(previousTrack.videoId, 10);

      const existingIds = new Set([
        ...(room.queue || []).map(t => t.videoId),
        room.currentTrack?.videoId,
        previousTrack.videoId,
      ].filter(Boolean));

      const chosen = (candidates || []).find(c => c.videoId && !existingIds.has(c.videoId));
      if (!chosen) return null;

      return {
        videoId: chosen.videoId,
        title: chosen.title,
        thumbnailUrl: chosen.thumbnailUrl,
        addedBy: 'Recommended',
        votes: 0,
      };
    } catch (e) {
      console.error('추천곡 선택 실패:', e.message);
      return null;
    }
  }

  // (Auto-DJ 추천 로직 제거)

  async handleVoteTrack(socket, roomCode, trackId, voteType) {
    try {
      const code = (roomCode || '').toString().toUpperCase();
      const room = await Room.findOne({ code });
      if (!room) return;

      const track = room.queue.find(t => (t.videoId === trackId) || (t.id === trackId));
      if (track) {
        if (voteType === 'up') {
          track.votes += 1;
        } else if (voteType === 'down') {
          track.votes = Math.max(0, track.votes - 1);
        }

        // 투표 수에 따라 큐 정렬
        room.queue.sort((a, b) => b.votes - a.votes);
        room.lastActivityAt = new Date();
        await room.save();

        this.io.to(code).emit('queueUpdated', room.queue);
      }
    } catch (error) {
      console.error('투표 오류:', error);
    }
  }

  async handleChatMessage(socket, roomCode, user, message) {
    try {
      const code = (roomCode || '').toString().toUpperCase();
      if (!message || !code) return;
      const room = await Room.findOne({ code });
      if (!room) return;

      const entry = {
        user: (user || socket.userName || '익명').substring(0, 50),
        message: message.toString().substring(0, 500),
        timestamp: new Date()
      };

      if (!Array.isArray(room.chatMessages)) room.chatMessages = [];
      room.chatMessages.push(entry);
      if (room.chatMessages.length > 500) {
        room.chatMessages = room.chatMessages.slice(-500);
      }
      room.lastActivityAt = new Date();
      await room.save();

      this.io.to(code).emit('newChatMessage', entry);
    } catch (error) {
      console.error('채팅 메시지 처리 오류:', error);
    }
  }

  async handleDisconnect(socket) {
    try {
      if (socket.roomCode) {
        const room = await Room.findOne({ code: socket.roomCode });
        if (room) {
          const removeKey = socket.userName || socket.userId;
          room.participants = room.participants.filter(p => p !== removeKey);
          room.lastActivityAt = new Date();
          await room.save();
          this.io.to(socket.roomCode).emit('participantsUpdated', room.participants);
        }
      }
      console.log(`❌ 유저 접속 해제: ${socket.id}`);
    } catch (error) {
      console.error('연결 해제 오류:', error);
    }
  }

  // (추천곡 선택 로직 제거됨)
}

module.exports = RoomSocketHandler;
