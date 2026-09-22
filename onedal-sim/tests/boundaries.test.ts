import { describe, expect, it } from 'vitest';

/**
 * 🔒 **배차망을 아는 곳은 정해져 있다**
 *
 * 배차망별 코드는 배차망 폴더에 두고, 배차망을 고르는 일은 `nets.ts` 한 곳에서 한다.
 * 소스를 훑어 잠근다 — 공통 코드가 배차망 이름(`=== 'kakaopicker'`)으로 물으면 새 배차망을 더할 때마다 공통 코드를 고쳐야 하고,
 * 빠뜨린 자리는 그 콜을 다른 배차망처럼 다룬다 (픽커 콜을 «인성콜»로 적는 식).
 *
 * 규칙:
 *   ① 공통 코드(core-simulator/src)는 배차망 이름을 모른다
 *   ② 배차망 폴더(insung · hwamul24 · kakaopicker)는 서로를 import 하지 않는다
 *   ③ ui-simulators 에서 배차망 폴더를 import 하는 곳은 nets.ts · index.ts 뿐이다
 *   ④ 앱 껍데기(src)는 배차망 이름을 모른다 — 옛 주소를 받는 App.tsx 만 예외
 *
 * 주석은 뺀다 — 규칙이 막는 것은 **코드**다 (주석은 설명이라 배차망 이름을 적어도 된다).
 * 소스는 Vite 의 `import.meta.glob`(?raw)으로 읽는다 — 시뮬레이터 tsconfig 에 Node 타입을 들이지 않으려고.
 */
const NAMES = /inseong|insung|hwamul24|kakaopicker|Inseong|Insung|Hwamul24|Picker|인성|화물24|픽커/;

const raw = (files: Record<string, string>) =>
    Object.fromEntries(Object.entries(files).filter(([path]) => !/\.test\.tsx?$/.test(path)));

const CORE = raw(import.meta.glob('../packages/core-simulator/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }));
const UI = raw(import.meta.glob('../packages/ui-simulators/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }));
const APP = raw(import.meta.glob('../src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }));

/** 주석을 걷는다 — JSX 주석 · 블록 주석 · 줄 주석 (주소의 `://` 은 남긴다) */
const codeOnly = (src: string) =>
    src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** 배차망 이름이 나오는 코드 줄들 — `파일:줄 내용` */
const nameHits = (files: Record<string, string>) =>
    Object.entries(files).flatMap(([path, src]) => codeOnly(src).split('\n')
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => NAMES.test(line))
        .map(({ line, i }) => `${path.replace(/^\.\.\//, '')}:${i + 1} ${line.trim()}`));

const importsOf = (src: string) => [...src.matchAll(/from\s+'([^']+)'/g)].map(m => m[1]);

describe('배차망을 아는 곳 — 정해진 자리만', () => {
    it('🧪 훑을 파일을 실제로 읽었다 — 빈 목록이면 규칙이 헛돈다', () => {
        expect(Object.keys(CORE).length).toBeGreaterThan(0);
        expect(Object.keys(UI).length).toBeGreaterThan(0);
        expect(Object.keys(APP).length).toBeGreaterThan(0);
    });

    it('① 공통 코드(core-simulator)는 배차망 이름을 모른다', () => {
        expect(nameHits(CORE)).toEqual([]);
    });

    it('② 배차망 폴더는 서로를 import 하지 않는다', () => {
        const nets = ['insung', 'hwamul24', 'kakaopicker'];
        const crossing = Object.entries(UI).flatMap(([path, src]) => {
            const own = nets.find(n => path.includes(`/src/${n}/`));
            if (!own) return [];
            return importsOf(src).filter(p => nets.some(other => other !== own && p.includes(other))).map(p => `${path} → ${p}`);
        });
        expect(crossing).toEqual([]);
    });

    it('③ 배차망 폴더를 import 하는 곳은 nets.ts · index.ts 뿐이다', () => {
        const importers = Object.entries(UI)
            .filter(([path]) => !/\/src\/(insung|hwamul24|kakaopicker)\//.test(path))
            .filter(([, src]) => importsOf(src).some(p => /(^|\/)(insung|hwamul24|kakaopicker)\//.test(p)))
            .map(([path]) => path.replace(/^.*\/ui-simulators\/src\//, ''))
            .sort();
        expect(importers).toEqual(['index.ts', 'nets.ts']);
    });

    it('④ 앱 껍데기(src)는 배차망 이름을 모른다 — 옛 주소를 받는 App.tsx 만 예외', () => {
        const files = Object.fromEntries(Object.entries(APP).filter(([path]) => !path.endsWith('/App.tsx')));
        expect(nameHits(files)).toEqual([]);
    });
});
