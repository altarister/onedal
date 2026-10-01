import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { ThemeProvider } from '@onedal/ui/theme'
import './index.css'
import App from './App.tsx'

/** 구글 웹 클라이언트 ID — 관제웹과 같은 값(`vite.config.ts` 의 `envDir` 가 관제웹 `.env` 를 읽는다). 콘솔 원본에 운영센터 주소는 기사님 손 */
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </GoogleOAuthProvider>
  </StrictMode>,
)
