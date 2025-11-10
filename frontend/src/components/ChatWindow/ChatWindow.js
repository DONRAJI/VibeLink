import React, { useEffect, useRef, useState } from 'react';
import './ChatWindow.css';

// 단순 채팅 UI 컴포넌트
// props:
// - roomCode: 문자열, 현재 방 코드
// - nickname: 문자열, 내 닉네임
// - messages: [{ user, message, timestamp }]
// - onSendMessage: (text) => void
const ChatWindow = ({ roomCode, nickname, messages = [], onSendMessage }) => {
  const [text, setText] = useState('');
  const listRef = useRef(null);

  // 새로운 메시지가 들어오면 스크롤 가장 아래로
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSendMessage?.(trimmed);
    setText('');
  };

  return (
    <div className="chat-window">
      <div className="chat-header">
        💬 실시간 채팅 <span className="room-code">#{roomCode}</span>
      </div>
      <div className="chat-list" ref={listRef}>
        {(messages || []).map((m, i) => (
          <div key={i} className={`chat-item ${m.user === nickname ? 'me' : ''}`}>
            <div className="chat-meta">
              <span className="chat-user">{m.user || '익명'}</span>
              <span className="chat-time">{new Date(m.timestamp || Date.now()).toLocaleTimeString()}</span>
            </div>
            <div className="chat-text">{m.message}</div>
          </div>
        ))}
      </div>
      <form className="chat-input" onSubmit={handleSubmit}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="메시지를 입력하세요..."
          maxLength={500}
        />
        <button type="submit" disabled={!text.trim()}>전송</button>
      </form>
    </div>
  );
};

export default ChatWindow;
