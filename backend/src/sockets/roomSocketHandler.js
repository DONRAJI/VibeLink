const Room = require('../models/Room');

class RoomSocketHandler {
  constructor(io) {
    this.io = io;
  }

  handleConnection(socket) {
    console.log(`✅ 새로운 유저 접속: ${socket.id}`);

    // 방 참가 이벤트 (이전 호환성 유지)
    socket.on('joinRoom', async (data) => {
      try {
        let roomCode, nickname;
        
        // 데이터 형식 처리 (이전 호환성)
        if (typeof data === 'string') {
          roomCode = data;
          nickname = socket.id; // 임시 닉네임
          console.log('📡 구버전 joinRoom 형식 처리:', { roomCode, nickname });
        } else if (data && typeof data === 'object') {
          roomCode = data.roomCode;
          nickname = data.nickname || socket.id;
          console.log('📡 신버전 joinRoom 형식 처리:', { roomCode, nickname });
        } else {
          console.log('❌ joinRoom 잘못된 데이터 형식:', data);
          socket.emit('roomError', { message: '잘못된 요청 형식입니다.' });
          return;
        }
        
        if (!roomCode) {
          console.log('❌ 방 코드가 없음');
          socket.emit('roomError', { message: '방 코드가 필요합니다.' });
          return;
        }
        
        await this.handleJoinRoom(socket, roomCode, nickname);
      } catch (error) {
        console.error('❌ joinRoom 이벤트 처리 오류:', error.message);
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
      console.log(`🔍 방 조회 결과:`, room ? `방 발견 (호스트: ${room.host})` : '방 없음');
      
      if (!room) {
        console.log(`❌ 방을 찾을 수 없음: ${roomCode}`);
        socket.emit('roomError', { message: '방을 찾을 수 없습니다.' });
        return;
      }
      
      socket.join(roomCode);
      socket.roomCode = roomCode;
      socket.userId = socket.id;
      socket.nickname = nickname;
      
      // 참가자 관리 (점진적 마이그레이션)
      if (!Array.isArray(room.participants)) {
        room.participants = [];
      }
      
      // 혼재된 형식 처리 (이전 호환성)
      let participants = room.participants;
      
      // 이미 객체 형식으로 된 참가자가 있는지 확인
      const hasObjectFormat = participants.some(p => typeof p === 'object' && p.socketId);
      
      if (hasObjectFormat) {
        // 새 형식 사용
        const existingParticipant = participants.find(p => 
          typeof p === 'object' && p.socketId === socket.id
        );
        if (!existingParticipant) {
          participants.push({
            socketId: socket.id,
            nickname: nickname
          });
        }
      } else {
        // 기존 형식 유지 (간단한 문자열 배열)
        if (!participants.includes(socket.id)) {
          participants.push(socket.id);
        }
      }
      
      room.participants = participants;
      await room.save();
      console.log(`✅ ${nickname}(${socket.id})가 ${roomCode} 방에 참가했습니다. (총 ${room.participants.length}명)`);
      
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
          
          // 혼재된 형식 처리
          room.participants = room.participants.filter(p => {
            if (typeof p === 'object' && p.socketId) {
              return p.socketId !== socket.userId;
            } else {
              return p !== socket.userId;
            }
          });
          
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
