import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// Force restart vite dev server
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    /**
     * 📱 **같은 와이파이의 폰에서도 열린다** (기사님 요청 2026-09-04).
     * 기본값은 `127.0.0.1` 이라 맥에서만 열렸다 — 폰으로 보려면 LAN 주소가 필요하다.
     * ⚠️ 개발 서버에만 걸리는 값이다. 배포(EC2)는 Express 가 `dist/` 를 서빙하므로 무관하다.
     */
    host: true,
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:4000',
      '/socket.io': {
        target: 'http://localhost:4000',
        ws: true,
      },
    },
  },
})
