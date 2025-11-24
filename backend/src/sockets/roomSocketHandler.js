const Room = require('../models/Room');
const SpotifyService = require('../services/spotifyService');
const { userTokens } = require('../services/spotifyTokenStore');

// Map to track which Spotify User ID controls which room (for playback)
const roomSpotifyHost = new Map();

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

        // Spotify Device ID 업데이트 (프론트엔드에서 전송)
        socket.on('updateDeviceId', ({ roomCode, userId, deviceId }) => {
            if (roomCode && userId && deviceId) {
                const code = roomCode.toString().toUpperCase();
                roomSpotifyHost.set(code, { userId, deviceId });
                console.log(`[Socket] Room ${code} Spotify Host updated: ${userId} / ${deviceId}`);

                // userTokens에도 deviceId 업데이트 (선택사항)
                const tokenInfo = userTokens.get(userId);
                if (tokenInfo) {
                    tokenInfo.deviceId = deviceId;
                    userTokens.set(userId, tokenInfo);
                }
            }
        });

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

    async handleJoinRoom(socket, data) {
        try {
            const roomCode = (typeof data === 'string' ? data : data?.roomCode) || '';
            const normalizedCode = roomCode.toString().toUpperCase();
            const nickname = typeof data === 'object' ? (data?.nickname || '') : '';
            const userId = typeof data === 'object' ? (data?.userId || '') : '';

            if (socket.roomCode && socket.roomCode === normalizedCode) {
                console.log(`⚠️ 중복 joinRoom 무시: ${socket.id} -> ${normalizedCode}`);
                return;
            }

            const room = await Room.findOne({ code: normalizedCode });
            if (!room) {
                socket.emit('roomError', { message: '방을 찾을 수 없습니다.' });
                return;
            }

            // Spotify Premium Check
            if (room.platform === 'spotify') {
                if (!userId) {
                     socket.emit('roomError', { message: 'Spotify 인증 정보가 필요합니다.' });
                     return;
                }
                const tokenInfo = userTokens.get(userId);
                if (!tokenInfo || tokenInfo.profile?.product !== 'premium') {
                    socket.emit('roomError', { message: 'Spotify Premium 사용자만 입장 가능합니다.' });
                    return;
                }
            }

            socket.join(normalizedCode);
            socket.roomCode = normalizedCode;
            socket.userId = socket.id;
            if (nickname) socket.userName = nickname;

            const participantKey = nickname || socket.id;
            if (!room.participants.includes(participantKey)) {
                room.participants.push(participantKey);
                room.lastActivityAt = new Date();
                await room.save();
            }

            socket.emit('roomJoined', room);
            this.io.to(normalizedCode).emit('participantsUpdated', room.participants);

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
            if (!Array.isArray(room.queue)) room.queue = [];

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
                }
            } else if (action === 'pause') {
                room.isPlaying = false;
            } else if (action === 'resume') {
                room.isPlaying = true;
            } else if (action === 'next') {
                console.log(`[디버그] '다음' 작업이 트리거되었습니다. 현재 대기열 길이: ${room.queue.length}`);

                if (room.queue.length > 0) {
                    const nextTrack = room.queue[0];
                    console.log(`[디버그] 대기열에서 다음 트랙이 선택됨: ${nextTrack.title}`);

                    room.currentTrack = nextTrack;
                    room.isPlaying = true;
                    if (!persistent) {
                        room.queue.shift();
                    }
                } else {
                    console.log('[디버그] 대기열이 비어 있습니다. 재생을 중지합니다.');
                    room.currentTrack = null;
                    room.isPlaying = false;
                }
            }

            room.lastActivityAt = new Date();
            await room.save();

            console.log(`${code} 방에 '${action}' 요청. 현재: ${room.currentTrack?.title || '없음'}`);

            // --- [Server-Side Spotify Control] ---
            const current = room.currentTrack;
            if (current && current.platform === 'spotify') {
                const hostInfo = roomSpotifyHost.get(code);
                if (hostInfo) {
                    const { userId, deviceId } = hostInfo;
                    const tokenInfo = userTokens.get(userId);

                    if (tokenInfo && tokenInfo.accessToken) {
                        try {
                            if (action === 'play' || action === 'next' || (action === 'resume' && room.isPlaying)) {
                                console.log(`[Server] Playing Spotify track: ${current.title}`);
                                await SpotifyService.playTrack(tokenInfo.accessToken, deviceId, current.uri);
                            } else if (action === 'pause') {
                                console.log(`[Server] Pausing Spotify track`);
                                await SpotifyService.pauseTrack(tokenInfo.accessToken, deviceId);
                            }
                        } catch (err) {
                            console.error(`[Server] Spotify Control Error: ${err.message}`);
                        }
                    } else {
                        console.warn(`[Server] No token found for host ${userId}`);
                    }
                } else {
                    console.warn(`[Server] No Spotify host info for room ${code}`);
                }
            }

            this.io.to(code).emit('playbackControlled', {
                action,
                track: room.currentTrack,
                isPlaying: room.isPlaying
            });

            if (action === 'next' || action === 'play') {
                this.io.to(code).emit('queueUpdated', room.queue);
            }

        } catch (error) {
            console.error('재생 제어 오류:', error);
        }
    }

    async handleVoteTrack(socket, roomCode, trackId, voteType) {
        try {
            const code = (roomCode || '').toString().toUpperCase();
            const room = await Room.findOne({ code });
            if (!room) return;

            const trackIndex = room.queue.findIndex(t => (t.id === trackId || t.videoId === trackId));
            if (trackIndex !== -1) {
                if (voteType === 'up') room.queue[trackIndex].votes += 1;
                else room.queue[trackIndex].votes -= 1;
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
            const room = await Room.findOne({ code });
            if (!room) return;

            const chatEntry = { user, message, timestamp: new Date() };
            if (!room.chatMessages) room.chatMessages = [];
            room.chatMessages.push(chatEntry);

            if (room.chatMessages.length > 100) {
                room.chatMessages = room.chatMessages.slice(-100);
            }

            await room.save();
            this.io.to(code).emit('newChatMessage', chatEntry);
        } catch (error) {
            console.error('채팅 오류:', error);
        }
    }

    async handleDisconnect(socket) {
        console.log(`❌ 유저 접속 해제: ${socket.id}`);
    }
}

module.exports = RoomSocketHandler;
