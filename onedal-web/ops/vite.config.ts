import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * 🏢 **운영센터 개발 서버** — 포트 3002 (루트 README.md 「포트」). `pnpm dev` 와 따로 `pnpm dev:ops` 로 띄운다.
 *    부품은 `@onedal/ui`(작업 공간 패키지)에서 온다 — 별칭 없음.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 3002,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
