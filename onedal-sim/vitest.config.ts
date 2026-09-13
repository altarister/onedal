import { defineConfig } from 'vitest/config';

/**
 * 🧪 **시뮬레이터 검사** — `pnpm test` (기사님 확정 2026-09-14 · docs/기획/카카오픽커_시뮬레이터.md §11-1)
 *
 * 그 전까지 onedal-sim 에는 검사 실행 명령이 아예 없었다. 공통 코드에서 인성·24시를 떼어내는
 * 0단계는 «떼기 전과 후가 같은가»를 봐야 해서, 이것이 먼저다.
 *
 * ⚠️ onedal-web 과 같은 vitest 이지만 **워크스페이스는 여전히 따로다** (pnpm-workspace.yaml 머리 주석).
 */
export default defineConfig({
    test: {
        include: ['tests/**/*.test.ts', 'packages/*/src/**/*.test.ts'],
        environment: 'node',
    },
});
