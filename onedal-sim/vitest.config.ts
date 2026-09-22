import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { buildInfoPlugin } from './buildInfoPlugin';

/**
 * 🧪 **시뮬레이터 검사** — `pnpm test` (기사님 확정)
 *
 * 공통 코드와 배차망 폴더 사이로 코드를 옮기면 «옮기기 전과 후가 같은가»를 이 검사(화면 글자 스냅숏 등)가 문다.
 *
 * ⚠️ onedal-web 과 같은 vitest 이지만 **워크스페이스는 여전히 따로다** (pnpm-workspace.yaml 머리 주석).
 */
export default defineConfig({
    plugins: [react(), buildInfoPlugin()],   // 화면 검사(.tsx)가 JSX 를 쓴다 · 설정 화면의 커밋 번호는 검사에서 `test` 로 고정
    test: {
        include: ['tests/**/*.test.{ts,tsx}', 'packages/*/src/**/*.test.{ts,tsx}'],
        environment: 'node',
    },
});
