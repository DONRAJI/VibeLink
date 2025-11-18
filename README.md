# 🎵 VibeLink - 실시간 공유 플레이리스트 서비스

여러 사람이 함께 음악을 실시간으로 추가/투표/재생 컨트롤하며 즐길 수 있는 웹 기반 공유 플레이리스트 서비스입니다. 방 단위로 YouTube 또는 Spotify 플랫폼을 선택하고, 재생 후 큐에서 제거할지 유지할지(플레이리스트 모드) 결정할 수 있습니다.

![VibeLink Logo](https://via.placeholder.com/800x200/4A90E2/FFFFFF?text=VibeLink+-+Music+Together)

> 이 문서는 "개요 / 구조 / 아키텍처 / 사용법"만 다룹니다. 설치 과정, 환경 변수 설정 등 운영 세부 내용은 의도적으로 제외했습니다.

## ✨ 주요 기능 개요

### P0 (핵심 필수)
- **방 생성/참여 & 즉시 입장**: 로비에서 공개 방 클릭 시 바로 입장, 코드 진입 시 자동 닉네임 복원
- **플랫폼 선택**: 방 단위로 YouTube 또는 Spotify 플랫폼 지정 (Spotify 방은 Premium 호스트 필요)
- **음악 검색/추가 (다중 플랫폼)**: 통합 검색 API로 `platform=youtube|spotify` 지정. 검색 결과는 방/플랫폼/쿼리/페이지 단위 캐시 → 곡 추가 후에도 목록 유지
- **실시간 큐 동기화**: Socket.IO 이벤트로 모든 참가자에게 즉시 반영
- **재생 컨트롤 동기화**: 호스트의 재생/일시정지/다음 곡이 모든 사용자에게 반영

### P1 (상호작용 & 재생 고도화)
- **투표 기반 우선순위 (향후 확장)**: 투표 데이터 구조 준비 (소켓 이벤트 훅 유지)
- **Spotify Web Playback SDK 통합**: 호스트만 실제 스트리밍. 다른 참가자는 상태/현재 트랙만 동기화
- **자동 다음 곡 재생 (YouTube + Spotify)**: 트랙 종료 감지 시 큐/플레이리스트 다음 항목 자동 재생
- **플레이리스트 모드**: `ephemeral` (기존 방식 - 재생 후 제거) / `persistent` (재생 후 유지 + 커서 이동) 선택 지원

### P2 (UX 보강 & 운영)
- **검색 페이지네이션**: Spotify 페이지 기반 / YouTube pageToken 기반 Prev/Next, 1P/2P UI 제공
- **중복 참가 방지**: 프론트/백엔드 모두 동일 소켓/닉네임 중복 join 무시
- **관리자 방 정리(Admin Purge)**: 테스트/유휴 방 삭제용 `DELETE /api/rooms/admin/purge` (헤더 토큰 필요)
- **참가자 목록 & 채팅**: 실시간 채팅 (`ChatWindow`) + 참가자 갱신
- **반응형 디자인 개선**: 모바일/데스크톱 대응 레이아웃

### 예정 (Auth 확장)
- **OAuth 로그인 (Kakao/Google)**: provider 기반 권한 정책 (예: 게스트: 공개방만, 로그인 사용자: Spotify 방 생성)
- **개인화 프로필/아바타**

## 🚀 아키텍처 & 기술 개요

### 백엔드 레이어
- **Node.js / Express** – REST + OAuth 콜백 + 검색
- **Socket.IO** – 실시간 재생/큐/채팅/참가자 이벤트
- **MongoDB / Mongoose** – Room 모델 (playlistMode, playlistCursor 포함)
- **YouTube Data API v3** – 영상 검색 (pageToken 기반 페이징)
- **Spotify Web API** – OAuth 인증 / 재생 제어 / 디바이스 조회 / 상태 폴링
- **Axios** – 외부 API 호출

### 프론트엔드 레이어
- **React 18 + React Router v6** – 라우팅 & 자동 방 입장 래퍼
- **Socket.IO Client** – 실시간 이벤트 수신/발신
- **YouTube IFrame API 직접 통합** – 경량, 세밀한 상태 제어
- **Spotify Web Playback SDK** – 호스트 장치 재생
- **Axios / fetch** – 백엔드 REST 연동
- **SessionStorage / LocalStorage** – 검색 쿼리/결과 & 닉네임/Spotify 사용자 캐시
- **CSS3** – 반응형 스타일링

## 📐 아키텍처 흐름 (고수준)

1. 사용자가 로비 또는 직접 URL로 방에 접근
2. 프론트는 Socket 연결 후 `joinRoom` 이벤트로 서버에 참가 요청
3. 서버는 Room 상태(현재 트랙, 큐, 참가자, 모드)를 브로드캐스트
4. 호스트가 재생/일시정지/다음 곡 → 서버 소켓 이벤트 → 모든 클라이언트 UI 업데이트
5. Spotify 방: 호스트 브라우저의 Web Playback SDK 디바이스에서만 실제 스트림 재생; 다른 참가자는 상태만 동기화
6. 트랙 종료(YouTube IFrame / Spotify state) → 자동 다음 곡 로직 실행 (ephemeral=제거, persistent=커서 이동)
7. 검색은 REST API (YouTube pageToken / Spotify offset) → 결과 캐시 → 다중 곡 추가 최적화

## 📱 사용 방법 요약

### 방 생성 & 플랫폼/모드 선택
1. 로비 또는 생성 화면에서 닉네임 입력 → 방 생성
2. 생성 시 플랫폼(YouTube/Spotify), 플레이리스트 모드(ephemeral/persistent) 선택
3. 6자리 방 코드 자동 발급 & 공개방은 로비 목록에 표시

### 즉시 입장 / 재접속
* 로비에서 카드 클릭 → 해당 방 바로 입장
* URL 직접 접근(`/room/:code`) 시 저장된 닉네임 자동 복원 / 없으면 프롬프트 표시

### 음악 검색 & 추가
1. 검색어 입력 후 엔터 또는 검색 버튼
2. 결과는 10개씩 페이지네이션(YouTube Prev/Next, Spotify Page 번호)
3. 곡 추가 후에도 같은 검색 결과 유지 → 여러 곡 연속 추가 가능

### 재생 컨트롤
* **호스트만**: 재생/일시정지/다음/특정 곡 선택 재생
* YouTube: IFrame 종료 이벤트로 자동 다음 곡
* Spotify: 상태 폴링 + 보정 루프로 다음 곡 자동 재생 안정화

### 플레이리스트 모드
* `ephemeral`: 재생 완료 시 해당 트랙 큐에서 제거
* `persistent`: 트랙 유지, 커서만 다음으로 이동 (반복 감상/히스토리 유지)

### 관리 기능
* `DELETE /api/rooms/admin/purge` 헤더 `x-admin-token: ADMIN_TOKEN` → 모든 테스트용 방 정리

### 채팅 & 참가자
* 실시간 채팅 메시지와 참가자 목록 자동 갱신

## 🎨 컴포넌트 구조 (주요)

```
frontend/src/components/
├── SplashScreen/        # 초기 인트로
├── RoomEntry/           # 방 생성/입장 (모드/플랫폼 설정 확장 예정)
├── Lobby/               # 공개방 리스트 + 카드
├── RoomHeader/          # 방 정보 + 참가자 + 나가기
├── MusicPlayer/         # 플레이어 (YouTube + Spotify 분기)
│   ├── SpotifyPlayer.js # Spotify Web Playback SDK 래퍼
├── PlaylistQueue/       # 큐 목록/호스트 재생 버튼
├── MusicSearch/         # 검색 + 페이지네이션 + 결과 캐시
├── ChatWindow/          # 실시간 채팅
└── (Auth 예정)          # Kakao/Google 로그인 버튼 등
```

## 🌐 주요 인터랙션 (요약)

방 생성/참여, 큐/재생 제어, 검색/추가, 채팅 및 참가자 동기화를 중심으로 동작합니다. 세부 REST/Socket 명세는 별도 개발 문서에서 관리합니다.

## 📱 반응형 UX

- 데스크톱: 다중 패널 (플레이어 / 큐 / 검색 / 채팅)
- 모바일: 세로 스택, 핵심 컨트롤 우선 배치

## 🔄 플레이리스트 모드 동작 상세

| 모드 | 재생 완료 후 처리 | 다음 곡 결정 | 사용 사례 |
|------|------------------|--------------|-----------|
| ephemeral | 큐에서 제거 | 남은 큐 첫번째 | 일회성 파티/즉흥 선택 |
| persistent | 큐 유지, 커서 +1 | 커서 위치 기준 | 시리즈 감상 / 반복 순회 |

커서는 서버에서 관리되며 소켓 이벤트로 참가자에게 브로드캐스트됩니다.

## 🚧 개발 로드맵 (진행 상황)

- [x] Phase 1: 백엔드 기본 구조 / 방 / 검색
- [x] Phase 2: 프론트 MVP / 큐 / 플레이어 UI
- [x] Phase 3: Socket 실시간 연동 (큐/재생/채팅)
- [x] Phase 4: YouTube & Spotify 통합 / 자동 다음 곡 / 플레이리스트 모드
- [x] Phase 4.5: 검색 결과 캐싱 & 페이지네이션 / 중복 참가 방지 / 관리자 Purge
- [ ] Phase 5: Kakao/Google OAuth / 권한 정책 / 지속적 배포 파이프라인
- [ ] Phase 6: 투표 알고리즘 정교화 / 추천 / 사용자 프로필

## 🤝 기여

이 저장소에 대한 기능 제안 / 버그 리포트는 Issue 로 등록해 주세요. 구조 개선(PR) 시에는 변경 의도와 영향 범위를 간단히 요약해 주시면 됩니다.

## 📄 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다. (추후 상용 정책 변동 시 README 업데이트 예정)

## 📞 문의

프로젝트에 대한 문의사항이 있으시면 이슈를 생성해 주세요.

---

**VibeLink** - 음악으로 연결하는 새로운 경험 🎵✨ (YouTube + Spotify + 실시간 협업)
