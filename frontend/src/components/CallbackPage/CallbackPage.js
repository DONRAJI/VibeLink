import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const CallbackPage = () => {
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const success = params.get('success');
        const userId = params.get('userId');
        const product = params.get('product');
        const email = params.get('email');
        const error = params.get('error');

        if (window.opener) {
            // 팝업으로 열린 경우 부모 창에 메시지 전달
            window.opener.postMessage({
                type: 'SPOTIFY_AUTH',
                success: success === 'true',
                userId,
                product,
                email,
                error
            }, '*');
            window.close();
        } else {
            // 팝업이 아닌 경우 (예: 직접 접속) 메인으로 이동
            // 만약 인증 성공했다면 로컬 스토리지에 저장 후 이동
            if (success === 'true' && userId) {
                localStorage.setItem('spotifyUser', JSON.stringify({ userId, product, email }));
            }
            navigate('/');
        }
    }, [location, navigate]);

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
            <h2>Spotify 인증 처리 중...</h2>
            <p>잠시만 기다려주세요. 창이 자동으로 닫히지 않으면 닫아주세요.</p>
        </div>
    );
};

export default CallbackPage;
