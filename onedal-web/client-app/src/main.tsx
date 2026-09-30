import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from '@onedal/ui/theme'
import './index.css'
import App from './App.tsx'
import { installConsoleCapture } from './lib/roadmapLogger'
import { installWebCodeWatch } from './lib/webCodeVersion'

/**
 * 🎣 **콘솔을 가로채 서버 로그로 보낸다** — 주행이 끝나도 남게 (필드테스트 ④).
 *    가장 먼저 부른다: 이 뒤에 찍히는 것부터 잡힌다.
 */
installConsoleCapture()
/* 🖥️ 개발 서버에서 핫 교체를 센다 · 훅 파일이 바뀌면 평가 자리가 빌 때 스스로 다시 읽는다 (lib/webCodeVersion) */
installWebCodeWatch()

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <ThemeProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ThemeProvider>
    </GoogleOAuthProvider>
  </StrictMode>,
)
