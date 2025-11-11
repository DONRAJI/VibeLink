require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");

// 라우터 임포트
const roomRoutes = require('./api/roomRoutes');
const searchRoutes = require('./api/searchRoutes');
const spotifyAuthRoutes = require('./api/spotifyAuthRoutes');

// 소켓 핸들러 및 서비스 임포트
const RoomSocketHandler = require('./sockets/roomSocketHandler');
const YouTubeService = require('./services/youtubeService');

const app = express();

// --- [수정된 CORS 설정 부분] ---
// Vercel의 프로덕션, 프리뷰, 로컬 주소를 모두 허용하는 설정입니다.

// 1. 허용할 주소 목록을 만듭니다.
const allowedOrigins = [
  'http://localhost:3000', // 1. 내 컴퓨터에서 개발할 때
  'http://127.0.0.1:3000', // (localhost의 IP 버전)
  process.env.FRONTEND_URL || 'https://vibe-link-g9nn.vercel.app', // 2. Vercel의 공식 프로덕션 주소
  // 3. Vercel의 모든 프리뷰 주소 (정규식 사용)
  //    vibe-link-g9nn- 뒤에 랜덤 문자열이 붙고 -donrajis-projects.vercel.app로 끝나는
  //    모든 주소를 허용합니다. (님 에러 로그 기준)
  /^https:\/\/vibe-link-g9nn-.*-donrajis-projects\.vercel\.app$/ 
];

// 2. CORS 옵션 객체를 생성합니다.
const corsOptions = {
  origin: function (origin, callback) {
    // origin이 undefined인 경우 (예: Postman) 또는 허용 목록에 있는 경우
    if (!origin || allowedOrigins.some(pattern => {
      if (pattern instanceof RegExp) {
        return pattern.test(origin);
      }
      return pattern === origin;
    })) {
      callback(null, true);
    } else {
      // 허용되지 않은 origin인 경우
      console.warn(`CORS 거부됨: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE"], // 필요한 HTTP 메소드
  credentials: true // (필요한 경우)
};

// 3. Express 앱에 CORS 옵션을 적용합니다.
app.use(cors(corsOptions));

// --- [CORS 설정 수정 끝] ---


// JSON 파싱 + 쿠키 파싱
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// 요청 로깅 (님의 기존 코드 유지)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Render.com 등을 위한 포트 설정 (님의 기존 코드 유지)
const port = process.env.PORT || 4000;

const server = http.createServer(app);
const io = new Server(server, {
  // [수정!] Socket.IO에도 동일한 CORS 옵션을 적용합니다.
  cors: corsOptions
});

// MongoDB 연결 옵션 (님의 기존 코드 유지)
const mongoOptions = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000
};

// MongoDB 연결 (님의 기존 코드 유지)
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/vibelink', mongoOptions)
  .then(() => {
    console.log('✅ MongoDB에 성공적으로 연결되었습니다.');
    console.log(`📊 연결된 데이터베이스: ${mongoose.connection.db.databaseName}`);
  })
  .catch(err => {
    console.error('❌ MongoDB 연결 오류:', err);
    process.exit(1);
  });

// MongoDB 연결 이벤트 처리 (님의 기존 코드 유지)
mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB 연결 오류:', err);
});
mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB 연결이 끊어졌습니다.');
});

// 기본 라우트 (님의 기존 코드 유지)
app.get('/', (req, res) => res.send('VibeLink 백엔드 서버가 동작 중입니다! 🚀'));

// 디버깅용 라우트 (님의 기존 코드 유지)
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

// API 라우터 등록 (님의 기존 코드 유지)
app.use('/api/rooms', roomRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/spotify', spotifyAuthRoutes);

// WebSocket 이벤트 핸들러 초기화 (님의 기존 코드 유지)
const youtubeService = new YouTubeService(process.env.YOUTUBE_API_KEY);
const roomSocketHandler = new RoomSocketHandler(io, youtubeService);
io.on('connection', (socket) => {
  roomSocketHandler.handleConnection(socket);
});

// 서버 실행 (님의 기존 코드 유지)
server.listen(port, () => {
  console.log(` VibeLink 서버가 http://localhost:${port} 에서 실행 중입니다. `);
  // Masked env presence logs (for debugging only; no secrets printed)
  const idLen = (process.env.SPOTIFY_CLIENT_ID || '').length;
  const secLen = (process.env.SPOTIFY_CLIENT_SECRET || '').length;
  console.log(`[env] Spotify CLIENT_ID set: ${idLen > 0} (len=${idLen}), SECRET set: ${secLen > 0} (len=${secLen})`);
});