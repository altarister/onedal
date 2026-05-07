import { useState, useEffect } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Navigate } from 'react-router-dom';
import { logRoadmapEvent } from '../lib/roadmapLogger';

export default function Login() {
  const { loginWithGoogle, loginBypass, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [googleLoadFailed, setGoogleLoadFailed] = useState(false);

  useEffect(() => {
    // 앱 환경 등에서 3초 후에도 구글 버튼 렌더링/동작이 원활하지 않으면 우회 버튼 노출
    const timer = setTimeout(() => {
      setGoogleLoadFailed(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSuccess = async (credentialResponse: any) => {
    if (credentialResponse.credential) {
      logRoadmapEvent("웹", "유저가 구글 로그인 버튼 클릭 ");
      try {
        await loginWithGoogle(credentialResponse.credential);
        navigate('/');
      } catch (error) {
        alert("로그인에 실패했습니다.");
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base px-4">
      <div className="bg-surface border border-border-card p-8 rounded-2xl shadow-xl w-full max-w-sm flex flex-col items-center">
        
        <div className="w-16 h-16 bg-gradient-to-tr from-accent-alt to-info rounded-xl mb-6 flex items-center justify-center shadow-lg shadow-accent-alt/30">
          <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>

        <h1 className="text-3xl font-bold text-text-primary mb-2">1DAL</h1>
        <p className="text-text-muted text-sm mb-8">모빌리티 배차 통합 관제 시스템</p>

        <div className="w-full flex flex-col items-center gap-4">
          <GoogleLogin
            onSuccess={handleSuccess}
            onError={() => {
              console.log('Login Failed');
              setGoogleLoadFailed(true);
            }}
            useOneTap
            theme="filled_black"
            size="large"
          />

          {googleLoadFailed && (
            <button 
                onClick={async () => {
                    try {
                        await loginBypass();
                        navigate('/');
                    } catch (e: any) {
                        alert(`우회 접속 실패: ${e.message}\n(서버 꺼짐 또는 같은 와이파이 아님)`);
                    }
                }}
                className="mt-2 text-xs text-text-muted hover:text-text-primary underline decoration-border-card underline-offset-4 transition-colors"
            >
                개발자 모드: 강제 접속 (디바이스 테스트용)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
