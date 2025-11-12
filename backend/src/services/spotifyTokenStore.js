// services/spotifyTokenStore.js

// 이 Map 객체는 서버가 실행되는 동안 메모리에 유지됩니다.
const userTokens = new Map();

module.exports = userTokens;