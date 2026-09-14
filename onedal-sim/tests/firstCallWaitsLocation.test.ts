import { describe, expect, it } from 'vitest';

/**
 * 📍 **첫 콜은 기사님 위치를 받은 뒤에 낸다** (기사님 지시 2026-09-14 · 전수표 0단계 옆 «나»).
 *
 * 시뮬레이터가 켜지자마자 첫 콜을 내서, 서버에서 내 위치를 받기 전의 **기본 자리(경기 광주시)**로
 * 상차 거리를 쟀다 — «7지점 한 바퀴» 01 콜이 실제 2.2km 인데 7.2km 로 적혀 반경 4.55km 에서 떨어졌다.
 * 같은 날 세 번 첫 콜을 놓친 원인이다 (원달앱 로그: 같은 상차지가 첫 콜 7.2km · 나중 콜 2.2km).
 *
 *   · 위치를 서버·폰에서 처음 받는 순간 «받았음»이 켜진다. 주소창에 위치를 넣고 열면 처음부터 켜져 있다
 *   · 콜을 내는 쪽은 «받았음»이 켜질 때까지 첫 콜을 안 낸다
 *   · 끝내 답이 없으면 기다림을 끝내고 기본 자리로 시작한다 — 시뮬은 어떤 경우에도 돌아야 한다. 화면이 경고한다
 */
/* 소스는 Vite 의 `import.meta.glob`(?raw)으로 읽는다 — 시뮬레이터 tsconfig 에 Node 타입을 들이지 않으려고 (boundaries.test.ts 와 같다) */
const FILES = {
    ...import.meta.glob('../packages/ui-simulators/src/context/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }),
    ...import.meta.glob('../src/pages/DispatchPage.tsx', { query: '?raw', import: 'default', eager: true }),
} as Record<string, string>;
const src = (rel: string) => {
    const text = FILES[`../${rel}`];
    if (typeof text !== 'string') throw new Error(`소스를 못 읽었다: ${rel}`);
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
};

describe('📍 첫 콜은 위치를 받은 뒤', () => {
    it('🔴 콜을 내는 훅은 위치를 받기 전에는 시드도 주기 스트리밍도 안 한다', () => {
        const hook = src('packages/ui-simulators/src/context/useSimStreaming.ts');
        expect(hook).toMatch(/if \(isTimerPaused \|\| !ready\) return;/);
        expect(hook).toMatch(/\[isTimerPaused, initialCount, ready\]/);
    });

    it('🔴 위치를 처음 받는 순간 «받았음»이 켜지고, 끝내 답이 없으면 기다림을 끝내며 경고를 켠다', () => {
        const ctx = src('packages/ui-simulators/src/context/SimulationContext.tsx');
        expect(ctx).toMatch(/useState\(!!initialLocationKnown\)/);
        expect(ctx).toMatch(/const apply = [\s\S]{0,300}setLocationReady\(true\)/);
        expect(ctx).toMatch(/setTimeout\([\s\S]{0,200}setLocationFallback\(/);
        expect(ctx).toMatch(/LOCATION_WAIT_MS/);
    });

    it('🔴 배차 화면이 «받았음»을 훅에 넘기고, 주소창에 위치가 있으면 처음부터 켠다 · 기본 자리로 시작하면 경고한다', () => {
        const page = src('src/pages/DispatchPage.tsx');
        expect(page).toMatch(/ready: locationReady/);
        expect(page).toMatch(/initialLocationKnown=\{searchParams\.has\('lon'\) && searchParams\.has\('lat'\)\}/);
        expect(page).toMatch(/locationFallback &&/);
    });
});
