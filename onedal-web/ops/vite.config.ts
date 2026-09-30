import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * 🏢 **운영센터 개발 서버** — 포트 3002 (루트 README.md 「포트」). `pnpm dev` 와 따로 `pnpm dev:ops` 로 띄운다.
 * 🔴 `@` 별칭이 **관제웹 `src`** 를 가리킨다 — 부품(`client-app/src/components/ui/*`)을 임시로 가져다 쓰기 때문이다.
 *    그 부품들이 `@/lib/utils` · `@/components/ui/...` 로 서로를 부른다. 운영센터 제 파일은 상대 경로로 부른다.
 *    `onedal-web/ui/` 패키지가 생기면 이 별칭과 `index.css` 의 `@source` 를 지운다 (ops/CLAUDE.md).
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../client-app/src"),
    },
  },
  server: {
    host: true,
    port: 3002,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
