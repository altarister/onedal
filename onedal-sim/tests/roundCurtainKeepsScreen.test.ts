import { describe, it, expect } from 'vitest';

/**
 * 🧹 **새 회차 준비 화면은 배차망 화면을 내리지 않는다** — 감추기만 한다.
 * 내렸다 다시 올리면 배차망 화면이 들고 있던 상태(픽커의 «시작 → 목록»)가 처음(홈)으로 돌아간다.
 */
/* 소스는 Vite 의 `import.meta.glob`(?raw)으로 읽는다 — 시뮬레이터 tsconfig 에 Node 타입을 들이지 않으려고 (boundaries.test.ts) */
const files = import.meta.glob('../src/pages/DispatchPage.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const src = Object.values(files)[0].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('🧹 새 회차 준비 화면', () => {
  it('🔴 준비 화면 때 배차망 화면 대신 돌려주지 않는다 (화면을 내리지 않는다)', () => {
    expect(src).not.toMatch(/if \(roundCurtain\) \{\s*return/);
  });

  it('🔴 준비 화면 동안 배차망 화면은 감춘다 — 폰 접근성에서도 빠진다', () => {
    expect(src).toMatch(/roundCurtain \? 'hidden'/);
  });
});
