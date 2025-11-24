import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './Signup.css';

const API_BASE = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000';

export default function Signup() {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    nickname: '',
    name: '',
    birthdate: ''
  });
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (res.ok) {
        alert('회원가입 성공! 로그인해주세요.');
        navigate('/login');
      } else {
        alert(data.message);
      }
    } catch (err) {
      console.error(err);
      alert('회원가입 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="signup-container">
      <div className="signup-box">
        <h1>가입하고 듣기 시작하세요.</h1>
        <form onSubmit={handleSignup}>
          <div className="input-group">
            <label>아이디</label>
            <input name="username" onChange={handleChange} required placeholder="아이디를 입력하세요" />
          </div>
          
          <div className="input-group">
            <label>비밀번호</label>
            <input type="password" name="password" onChange={handleChange} required placeholder="비밀번호를 입력하세요" />
          </div>
          
          <div className="input-group">
            <label>이름</label>
            <input name="name" onChange={handleChange} required placeholder="이름을 입력하세요" />
          </div>
          
          <div className="input-group">
            <label>닉네임</label>
            <input name="nickname" onChange={handleChange} required placeholder="프로필에 표시될 이름입니다" />
          </div>
          
          <div className="input-group">
            <label>생년월일</label>
            <input type="date" name="birthdate" onChange={handleChange} required />
          </div>
          
          <button type="submit" className="signup-btn">가입하기</button>
        </form>
        <div className="links">
          <span>이미 계정이 있나요? </span>
          <Link to="/login">로그인하기</Link>
        </div>
      </div>
    </div>
  );
}
