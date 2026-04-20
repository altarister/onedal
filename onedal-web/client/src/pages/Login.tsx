
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Navigate } from 'react-router-dom';
import { logRoadmapEvent } from '../lib/roadmapLogger';

export default function Login() {
  const { loginWithGoogle, isAuthenticated } = useAuth();
  const navigate = useNavigate();

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
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="bg-gray-900 border border-gray-800 p-8 rounded-2xl shadow-xl w-full max-w-sm flex flex-col items-center">
        
        <div className="w-16 h-16 bg-gradient-to-tr from-violet-600 to-fuchsia-600 rounded-xl mb-6 flex items-center justify-center shadow-lg shadow-violet-900/50">
          <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>

        <h1 className="text-3xl font-bold text-white mb-2">1DAL</h1>
        <p className="text-gray-400 text-sm mb-8">모빌리티 배차 통합 관제 시스템</p>

        <div className="w-full flex justify-center">
          <GoogleLogin
            onSuccess={handleSuccess}
            onError={() => {
              console.log('Login Failed');
              alert("Google 로그인 창을 열 수 없습니다.");
            }}
            useOneTap
            theme="filled_black"
            size="large"
          />
        </div>
      </div>
    </div>
  );
}
