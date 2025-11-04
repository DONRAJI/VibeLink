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

// CORS 설정 개선
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL || 'https://your-frontend-domain.com'
    : ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));

// JSON 파싱 제한
app.use(express.json({ limit: '10mb' }));

// 요청 로깅
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// 👇 [수정 1] Render.com 같은 배포 환경을 위한 포트 설정
// process.env.PORT는 Render가 자동으로 주입해주는 포트 번호입니다.
// 이 값이 없으면(즉, 로컬 개발 환경이면) 4000번을 사용합니다.
const port = process.env.PORT || 4000;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

// MongoDB 연결 옵션 (현대 드라이버에서 지원되는 옵션만 사용)
const mongoOptions = {
  maxPoolSize: 10, // 연결 풀 크기
  serverSelectionTimeoutMS: 5000, // 서버 선택 타임아웃
  socketTimeoutMS: 45000 // 소켓 타임아웃
  // bufferMaxEntries 옵션은 MongoDB Node 드라이버 최신 버전에서 제거되었습니다.
};

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/vibelink', mongoOptions)
  .then(() => {
    console.log('✅ MongoDB에 성공적으로 연결되었습니다.');
    console.log(`📊 연결된 데이터베이스: ${mongoose.connection.db.databaseName}`);
  })
  .catch(err => {
    console.error('❌ MongoDB 연결 오류:', err);
    process.exit(1);
  });

// MongoDB 연결 이벤트 처리
mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB 연결 오류:', err);
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB 연결이 끊어졌습니다.');
});

// 기본 라우트
app.get('/', (req, res) => res.send('VibeLink 백엔드 서버가 동작 중입니다! 🚀'));

// 디버깅용 라우트 - 모든 방 목록 조회
app.get('/debug/rooms', async (req, res) => {
  try {
    const Room = require('./models/Room');
    const rooms = await Room.find({}, 'code host participants createdAt').limit(10);
    res.json({
      totalRooms: await Room.countDocuments(),
      recentRooms: rooms
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
