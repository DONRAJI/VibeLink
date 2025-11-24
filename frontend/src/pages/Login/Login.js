import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './Login.css';

const API_BASE = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('nickname', data.nickname);
        navigate('/lobby');
      } else {
        alert(data.message);
      }
    } catch (err) {
      console.error(err);
      alert('로그인 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>VibeLink에 로그인</h1>
        <form onSubmit={handleLogin}>
          <div className="input-group">
            <label>아이디</label>
            <input
              type="text"
              placeholder="아이디"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="input-group">
            <label>비밀번호</label>
            <input
              type="password"
              placeholder="비밀번호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="login-btn">로그인</button>
        </form>
        <div className="links">
          <Link to="/signup">VibeLink 가입하기</Link>
        </div>
      </div>
    </div>
  );
}
