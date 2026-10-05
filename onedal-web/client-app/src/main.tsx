import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from '@onedal/ui/theme'
import './index.css'
import App from './App.tsx'
import { installConsoleCapture } from './lib/roadmapLogger'
import { installWebCodeWatch } from './lib/webCodeVersion'
import { onceByMessage } from './lib/caughtErrorLog'

/**
 * 🎣 **콘솔을 가로채 서버 로그로 보낸다** — 주행이 끝나도 남게 (필드테스트 ④).
 *    가장 먼저 부른다: 이 뒤에 찍히는 것부터 잡힌다.
 */
installConsoleCapture()
/* 🖥️ 개발 서버에서 핫 교체를 센다 · 훅 파일이 바뀌면 평가 자리가 빌 때 스스로 다시 읽는다 (lib/webCodeVersion) */
installWebCodeWatch()

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

/* 🚨 경계가 잡은 같은 오류는 한 번만 찍는다 — 고장 난 칸이 동기화마다 다시 그려져도 서버 로그에 줄이 쌓이지 않게 (lib/caughtErrorLog) */
createRoot(document.getElementById('root')!, { onCaughtError: onceByMessage(console.error) }).render(
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
