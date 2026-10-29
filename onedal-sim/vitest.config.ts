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
    // jsdom 검사(화면 글자 ↔ 정의 표 · 실물 xml)가 레포의 shared 표와 ex_images 를 ?raw 로 읽는다 — jsdom 환경은 폴더 밖 읽기를 막아서 그 두 폴더만 연다
    server: { fs: { allow: ['.', '../onedal-web/shared/src', '../ex_images'] } },
    test: {
        include: ['tests/**/*.test.{ts,tsx}', 'packages/*/src/**/*.test.{ts,tsx}'],
        environment: 'node',
    },
});
