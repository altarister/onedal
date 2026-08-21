import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * 포트 5173 은 바꾸지 않는다 — `onedal-web/scripts/appLoop.mjs`(pnpm e2e:app)가
 * 이 포트로 크롬을 열어 앱 구간 7단계를 검사한다.
 * `host: true` 라야 같은 공유기의 앱폰이 개발용 PC IP 로 들어올 수 있다.
 */
export default defineConfig({
    plugins: [react()],
    server: { host: true, port: 5173 },
});
