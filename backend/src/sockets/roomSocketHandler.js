const Room = require('../models/Room');

class RoomSocketHandler {
  constructor(io) {
    this.io = io;
  }

  handleConnection(socket) {
    console.log(`✅ 새로운 유저 접속: ${socket.id}`);

    // 방 참가 이벤트 (닉네임 포함)
    socket.on('joinRoom', async (data) => {
      try {
        // 데이터 형식 검증
        if (typeof data === 'string') {
          // 기존 호환성을 위해 문자열로 받은 경우 (roomCode만)
          console.log('⚠️ 구식 joinRoom 이벤트 형식:', data);
          socket.emit('roomError', { message: '닉네임이 필요합니다. 다시 시도해주세요.' });
          return;
        }
        
        const { roomCode, nickname } = data || {};
        
        if (!roomCode || !nickname) {
          console.log('❌ joinRoom 필수 데이터 누락:', { roomCode, nickname });
          socket.emit('roomError', { message: '방 코드와 닉네임이 필요합니다.' });
          return;
        }
        
        await this.handleJoinRoom(socket, roomCode, nickname);
      } catch (error) {
        console.error('❌ joinRoom 이벤트 처리 오류:', error);
        socket.emit('roomError', { message: '방 참가 중 오류가 발생했습니다.' });
      }
    });

    // 트랙 추가 이벤트
    socket.on('addTrack', async ({ roomCode, track, addedBy }) => {
      await this.handleAddTrack(socket, roomCode, track, addedBy);
    });

    // 재생 제어 이벤트
    socket.on('controlPlayback', async ({ roomCode, action, track }) => {
      await this.handleControlPlayback(socket, roomCode, action, track);
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

  async handleJoinRoom(socket, roomCode, nickname) {
    try {
      console.log(`🔍 방 참가 시도: 방코드=${roomCode}, 닉네임=${nickname}, 소켓ID=${socket.id}`);
      
      const room = await Room.findOne({ code: roomCode });
      if (!room) {
        console.log(`❌ 방을 찾을 수 없음: ${roomCode}`);
        socket.emit('roomError', { message: '방을 찾을 수 없습니다.' });
        return;
      }
      
      socket.join(roomCode);
      socket.roomCode = roomCode;
      socket.userId = socket.id;
      socket.nickname = nickname;
      
      // 참가자 추가 (중복 방지)
      const existingParticipant = room.participants.find(p => p.socketId === socket.id);
      if (!existingParticipant) {
        room.participants.push({
          socketId: socket.id,
          nickname: nickname
        });
        await room.save();
        console.log(`✅ ${nickname}(${socket.id})가 ${roomCode} 방에 참가했습니다. (총 ${room.participants.length}명)`);
      } else {
        console.log(`⚠️ ${nickname}(${socket.id})가 이미 ${roomCode} 방에 참가되어 있습니다.`);
      }
      
      // 방 정보 전송
      socket.emit('roomJoined', room);
      this.io.to(roomCode).emit('participantsUpdated', room.participants);
      
    } catch (error) {
      console.error('❌ handleJoinRoom 오류:', {
        error: error.message,
        stack: error.stack,
        roomCode,
        nickname,
        socketId: socket.id
      });
      socket.emit('roomError', { message: '방 참가 중 오류가 발생했습니다. 다시 시도해주세요.' });
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
          room.currentTrack = null;
          room.isPlaying = false;
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
      if (socket.roomCode && socket.userId) {
        const room = await Room.findOne({ code: socket.roomCode });
        if (room) {
          const beforeCount = room.participants.length;
          room.participants = room.participants.filter(p => p.socketId !== socket.userId);
          
          if (beforeCount !== room.participants.length) {
            await room.save();
            this.io.to(socket.roomCode).emit('participantsUpdated', room.participants);
            console.log(`❌ ${socket.nickname || socket.id}가 ${socket.roomCode} 방에서 나갔습니다. (남은 인원: ${room.participants.length}명)`);
          }
        }
      } else {
        console.log(`❌ 유저 접속 해제: ${socket.id} (방 참가 이력 없음)`);
      }
    } catch (error) {
      console.error('연결 해제 오류:', error);
    }
  }
}

module.exports = RoomSocketHandler;
