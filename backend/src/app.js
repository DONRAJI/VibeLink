require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");

// 라우터 임포트
const roomRoutes = require('./api/roomRoutes');
const searchRoutes = require('./api/searchRoutes');

// 소켓 핸들러 임포트
const RoomSocketHandler = require('./sockets/roomSocketHandler');

const app = express();
app.use(cors());
app.use(express.json());
const port = 4000;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// MongoDB 연결
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/vibelink')
  .then(() => console.log('✅ MongoDB에 성공적으로 연결되었습니다.'))
  .catch(err => console.error('❌ MongoDB 연결 오류:', err));

// 기본 라우트
app.get('/', (req, res) => res.send('VibeLink 백엔드 서버가 동작 중입니다! 🚀'));

// API 라우터 등록
app.use('/api/rooms', roomRoutes);
app.use('/api/search', searchRoutes);

// WebSocket 이벤트 핸들러 초기화
const roomSocketHandler = new RoomSocketHandler(io);
io.on('connection', (socket) => {
  roomSocketHandler.handleConnection(socket);
});

server.listen(port, () => {
  console.log(` VibeLink 서버가 http://localhost:${port} 에서 실행 중입니다. `);
});
