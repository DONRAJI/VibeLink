# 🎵 VibeLink - 실시간 공유 플레이리스트 서비스

여러 사람이 함께 음악을 실시간으로 추가하고 제어하며 즐길 수 있는 웹 기반 공유 플레이리스트 서비스입니다.

![VibeLink Logo](https://via.placeholder.com/800x200/4A90E2/FFFFFF?text=VibeLink+-+Music+Together)

[![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-v18+-blue.svg)](https://reactjs.org/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-v4.8+-red.svg)](https://socket.io/)
[![MongoDB](https://img.shields.io/badge/MongoDB-v6+-brightgreen.svg)](https://mongodb.com/)

## ✨ 주요 기능

### P0 (필수 기능)
- **공유방 생성 및 참여**: 방장이 방을 생성하면 고유 링크/코드가 발급되며, 참가자는 이를 통해 방에 접속
- **음악 검색 및 추가**: YouTube API를 통해 음악을 검색하고, 검색 결과를 공유 플레이리스트 큐에 추가
- **실시간 큐 동기화**: 한 명이 곡을 추가/삭제하면, 해당 방의 모든 참가자 화면에 큐 목록이 즉시 업데이트
- **재생 컨트롤 동기화**: 방장이 음악을 재생/일시정지하면, 모든 참가자의 화면에 현재 재생 상태와 진행 바가 동기화

### P1 (핵심 기능)
- **다음 곡 투표**: 참가자들이 큐에 있는 곡에 '좋아요' 투표를 할 수 있으며, 투표 수가 가장 많은 곡이 다음 순서로 올라옴
- **방장(호스트) 권한**: 방장만이 재생, 일시정지, 곡 넘기기, 곡 강제 삭제 등 플레이어 제어 권한을 가짐

### P2 (추가 기능)
- **참가자 목록**: 현재 방에 접속해 있는 참가자들의 닉네임 목록을 표시
- **반응형 웹 디자인**: 모바일과 데스크톱 모두에서 최적화된 사용자 경험 제공

## 🚀 기술 스택

### 백엔드
- **Node.js** + **Express.js**: 서버 프레임워크
- **Socket.IO**: 실시간 양방향 통신
- **MongoDB** + **Mongoose**: 데이터베이스 및 ODM
- **YouTube Data API**: 음악 검색 및 재생

### 프론트엔드
- **React.js**: 사용자 인터페이스
- **Socket.IO Client**: 실시간 통신
- **React Player**: YouTube 비디오 재생
- **CSS3**: 모던하고 반응형 디자인

## 📦 설치 및 실행

### 1. 저장소 클론
```bash
git clone <repository-url>
cd VibeLink
```

### 2. 백엔드 설정
```bash
cd backend

# 의존성 설치
npm install

# 환경 변수 설정
cp env.example .env
# .env 파일을 편집하여 필요한 값들을 설정하세요

# 서버 실행
npm run dev  # 개발 모드
npm start    # 프로덕션 모드
```

### 3. 프론트엔드 설정
```bash
cd frontend

# 의존성 설치
npm install

# 개발 서버 실행
npm start
```

### 4. 환경 변수 설정
백엔드 `.env` 파일에 다음을 설정하세요:

```env
# MongoDB 연결 문자열
MONGODB_URI=mongodb://localhost:27017/vibelink

# YouTube Data API 키 (Google Cloud Console에서 발급)
YOUTUBE_API_KEY=your_youtube_api_key_here

# 서버 포트
PORT=4000
```

## 🔑 YouTube API 키 발급 방법

1. [Google Cloud Console](https://console.cloud.google.com/)에 접속
2. 새 프로젝트 생성 또는 기존 프로젝트 선택
3. YouTube Data API v3 활성화
4. 사용자 인증 정보에서 API 키 생성
5. 생성된 키를 `.env` 파일의 `YOUTUBE_API_KEY`에 설정

## 📱 사용 방법

### 방 생성하기
1. 앱에 접속하여 닉네임 입력
2. "새 방 만들기" 버튼 클릭
3. 생성된 6자리 방 코드를 다른 참가자들과 공유

### 방 참가하기
1. 앱에 접속하여 닉네임과 방 코드 입력
2. "방 참가하기" 버튼 클릭

### 음악 추가하기
1. 방에 입장한 후 "음악 검색" 섹션에서 원하는 곡 검색
2. 검색 결과에서 원하는 곡 선택 후 "추가" 버튼 클릭
3. 곡이 플레이리스트 큐에 추가됨

### 음악 재생하기
- **방장만 가능**: 재생/일시정지, 다음 곡 넘기기, 특정 곡 선택 재생
- **모든 참가자**: 투표를 통한 곡 순서 조정

## 🎨 컴포넌트 구조

```
src/
├── components/
│   ├── SplashScreen.js      # 스플래시 화면
│   ├── RoomEntry.js         # 방 생성/입장
│   ├── RoomHeader.js        # 방 헤더 및 참가자 목록
│   ├── MusicPlayer.js       # 음악 플레이어
│   ├── PlaylistQueue.js     # 플레이리스트 큐
│   └── MusicSearch.js       # 음악 검색
├── App.js                   # 메인 앱 컴포넌트
└── App.css                  # 전역 스타일
```

## 🌐 API 엔드포인트

### 방 관리
- `POST /api/rooms` - 새 방 생성
- `GET /api/rooms/:code` - 방 정보 조회

### 음악 검색
- `GET /api/search?query=<검색어>` - YouTube 음악 검색

### Socket.IO 이벤트
- `joinRoom` - 방 참가
- `addTrack` - 트랙 추가
- `controlPlayback` - 재생 제어
- `voteTrack` - 트랙 투표

## 📱 반응형 디자인

- **데스크톱**: 최대 1200px 너비, 카드 기반 레이아웃
- **태블릿**: 768px 이하, 세로 스택 레이아웃
- **모바일**: 480px 이하, 최적화된 터치 인터페이스

## 🔧 개발 스크립트

### 백엔드
```bash
npm run dev    # 개발 모드 (nodemon)
npm start      # 프로덕션 모드
```

### 프론트엔드
```bash
npm start      # 개발 서버 실행
npm build      # 프로덕션 빌드
npm test       # 테스트 실행
```

## 🚧 개발 로드맵

- [x] **Phase 1**: 백엔드 기초 및 API 연동
- [x] **Phase 2**: 프론트엔드 MVP
- [x] **Phase 3**: WebSocket 연동
- [x] **Phase 4**: 플레이어 기능 구현
- [ ] **Phase 5**: 고도화 및 배포

## 🤝 기여하기

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다. 자세한 내용은 `LICENSE` 파일을 참조하세요.

## 📞 문의

프로젝트에 대한 문의사항이 있으시면 이슈를 생성해 주세요.

---

**VibeLink** - 음악으로 연결하는 새로운 경험 🎵✨
