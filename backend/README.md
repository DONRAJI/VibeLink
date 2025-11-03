# VibeLink Backend

VibeLink의 백엔드 서버입니다. 실시간 음악 공유 방을 위한 REST API와 WebSocket 서버를 제공합니다.

## 📁 프로젝트 구조

```
/VibeLink-backend
├── src/
│   ├── api/           # REST API 라우터
│   │   ├── roomRoutes.js    # 방 관련 API
│   │   └── searchRoutes.js  # 검색 관련 API
│   ├── sockets/       # WebSocket 이벤트 핸들러
│   │   └── roomSocketHandler.js
│   ├── services/      # 외부 API 연동 서비스
│   │   └── youtubeService.js
│   ├── models/        # MongoDB 스키마
│   │   └── Room.js
│   └── app.js         # 메인 서버 파일
├── package.json
└── .env.example       # 환경 변수 예시
```

## 🚀 시작하기

### 1. 의존성 설치
```bash
npm install
```

### 2. 환경 변수 설정
`.env.example` 파일을 `.env`로 복사하고 필요한 값들을 설정하세요:

```bash
# MongoDB 연결 문자열
MONGODB_URI=mongodb://localhost:27017/vibelink

# YouTube API 키
YOUTUBE_API_KEY=your_youtube_api_key_here

# 서버 포트
PORT=4000
```

### 3. 서버 실행
```bash
# 개발 모드 (nodemon 사용)
npm run dev

# 프로덕션 모드
npm start
```

## 🔧 주요 기능

### REST API
- **POST /api/rooms** - 새로운 방 생성
- **GET /api/rooms/:code** - 방 정보 조회
- **GET /api/search** - YouTube 음악 검색

### WebSocket 이벤트
- **joinRoom** - 방 참가
- **addTrack** - 음악 트랙 추가
- **controlPlayback** - 재생 제어 (play/pause/next)
- **voteTrack** - 트랙 투표 (up/down)

## 📊 데이터 모델

### Room (방)
- `code`: 방 코드 (고유)
- `host`: 방장 ID
- `participants`: 참가자 목록
- `queue`: 재생 대기열
- `currentTrack`: 현재 재생 중인 트랙
- `isPlaying`: 재생 상태
- `createdAt`: 생성 시간

## 🔌 외부 서비스

- **MongoDB**: 방 및 사용자 데이터 저장
- **YouTube Data API**: 음악 검색 및 정보 제공
- **Socket.IO**: 실시간 양방향 통신

## 📝 개발 가이드

### 새로운 API 추가
1. `src/api/` 폴더에 새로운 라우터 파일 생성
2. `src/app.js`에 라우터 등록

### 새로운 WebSocket 이벤트 추가
1. `src/sockets/roomSocketHandler.js`에 이벤트 핸들러 추가
2. `handleConnection` 메서드에서 이벤트 리스너 등록

### 새로운 모델 추가
1. `src/models/` 폴더에 스키마 파일 생성
2. 필요한 곳에서 import하여 사용
