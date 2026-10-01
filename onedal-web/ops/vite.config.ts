import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * 🏢 **운영센터 개발 서버** — 포트 3002 (루트 README.md 「포트」). `pnpm dev` 와 따로 `pnpm dev:ops` 로 띄운다.
 *    부품은 `@onedal/ui`(작업 공간 패키지)에서 온다 — 별칭 없음.
 *    `envDir` 는 관제웹 폴더 — 구글 웹 클라이언트 ID(`VITE_GOOGLE_CLIENT_ID`)를 한 벌만 둔다(복사해 두면 갈라진다).
 */
/** 프록시가 향하는 서버 — 평소 4000. 사본 서버로 시험할 때만 `OPS_API_TARGET=http://localhost:<포트>` (화면 코드는 같은 출처 그대로라 실서버와 같은 길을 지난다) */
const API_TARGET = process.env.OPS_API_TARGET || 'http://localhost:4000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: '../client-app',
  build: {
    rolldownOptions: {
      // 📦 공용(shared)의 코드 모듈은 순수하다 — 운영센터가 안 부르는 것(동 좌표 명부 등)은 덩어리에서 털어낸다.
      //    🔴 .css(theme.css)는 가져오기 자체가 일이라 뺀다 — 안 빼면 색 · 글꼴이 조용히 빠진다
      treeshake: { moduleSideEffects: (id: string) => id.endsWith('.css') || !id.includes('/shared/src/') },
    },
  },
  server: {
    host: true,
    port: 3002,
    strictPort: true,
    proxy: {
      '/api': API_TARGET,
      // 🔔 신호 소켓(/ops 이름공간)도 서버로 넘긴다 — 이 줄이 없으면 소켓이 Vite 에서 멈춰 «○ 신호 끊김»으로만 돈다(관제웹 vite.config 와 같은 모양)
      '/socket.io': { target: API_TARGET, ws: true },
    },
  },
})
