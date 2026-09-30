import path from "path"
import { execSync } from "child_process"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// Force restart vite dev server
/**
 * 🖥️ **관제웹 코드 판** — 뜰 때(개발) · 빌드할 때(배포)의 커밋. 관제웹이 소켓에 붙을 때 서버 로그로 알린다 (`lib/webCodeVersion`).
 *    개발 서버는 커밋이 뜬 뒤에 생기므로 관제웹이 «마지막 핫 교체»를 함께 싣는다.
 */
const WEB_COMMIT = (() => {
  try { return execSync('git rev-parse --short HEAD', { stdio: 'pipe' }).toString().trim(); } catch { return 'unknown'; }
})();

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __WEB_COMMIT__: JSON.stringify(WEB_COMMIT) },
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
