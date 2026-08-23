import { useState, useEffect } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Navigate } from 'react-router-dom';
import { logRoadmapEvent } from '../lib/roadmapLogger';
import { isNativeApp, nativeGoogleIdToken } from '../lib/nativeGoogleAuth';

export default function Login() {
  const { loginWithGoogle, loginBypass, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [googleLoadFailed, setGoogleLoadFailed] = useState(false);
  /** 🔐 앱이면 구글 웹 버튼이 **영영 안 뜬다** — 네이티브 계정 선택창으로 간다 */
  const [native] = useState(isNativeApp);
  const [nativeBusy, setNativeBusy] = useState(false);

  useEffect(() => {
    // 앱 환경 등에서 3초 후에도 구글 버튼 렌더링/동작이 원활하지 않으면 우회 버튼 노출
    const timer = setTimeout(() => {
      setGoogleLoadFailed(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  /**
   * 🔐 **앱 전용 로그인** (2026-08-23).
   *
   * 구글은 임베디드 웹뷰 안에서의 로그인을 **정책으로 막는다.** 그래서 앱에서는
   * `<GoogleLogin>` 이 **에러도 없이 조용히 안 뜬다.** 대신 안드로이드 계정 선택창을
   * OS 가 띄우고, 거기서 받은 `idToken` 을 **웹과 똑같은 경로**로 서버에 넘긴다.
   */
  const handleNativeLogin = async () => {
    setNativeBusy(true);
    try {
      logRoadmapEvent("웹", "앱에서 네이티브 구글 로그인 시작");
      const idToken = await nativeGoogleIdToken();
      await loginWithGoogle(idToken);
      navigate('/');
    } catch (e: any) {
      // 🔴 무엇이 잘못됐는지 화면에 그대로 적는다 — 앱 로그는 주행 뒤 사라진다
      alert(`구글 로그인 실패\n\n${e?.message ?? e}`);
    } finally {
      setNativeBusy(false);
    }
  };

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
          {native ? (
            /* 🔐 앱: 안드로이드 계정 선택창 (OS 가 띄운다 — 웹뷰 정책과 무관) */
            <button
              onClick={handleNativeLogin}
              disabled={nativeBusy}
              className="w-full flex items-center justify-center gap-2 bg-white text-[#1f1f1f] font-semibold rounded-lg px-4 py-3 shadow disabled:opacity-60 transition-opacity"
            >
              <svg className="w-5 h-5" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
              {nativeBusy ? '구글 계정 확인 중…' : 'Google 계정으로 로그인'}
            </button>
          ) : (
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
          )}

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
