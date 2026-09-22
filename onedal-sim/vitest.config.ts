import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { buildInfoPlugin } from './buildInfoPlugin';

/**
 * 🧪 **시뮬레이터 검사** — `pnpm test` (기사님 확정 2026-09-14)
 *
 * 그 전까지 onedal-sim 에는 검사 실행 명령이 아예 없었다. 공통 코드에서 인성·24시를 떼어내는
 * 0단계는 «떼기 전과 후가 같은가»를 봐야 해서, 이것이 먼저다.
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
