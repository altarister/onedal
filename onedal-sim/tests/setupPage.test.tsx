// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { SetupPage } from '../src/pages/SetupPage';

/**
 * 🔒 **설정 화면 첫 그림 — 태그·클래스까지** (2026-09-14 · 카카오픽커_시뮬레이터.md 0단계 0-3)
 *
 * 0-3 에서 설정 화면에 남은 배차망 이름(기본 배차망 · 이름 폴백 · 배차망 버튼 색 · 시작 버튼 색)을 `nets.ts` 로 옮긴다.
 * 옮기기 **전에** 이 스냅숏을 떴다 — 색 클래스가 한 글자라도 바뀌면 빨간불이다.
 * 설정 화면이 그리는 동안 window 를 읽어 jsdom 에서 돈다. 첫 그림(인성 선택)만 본다. 화물24시를 골랐을 때의 색은 `netScreens.test.tsx` 가 값으로 문다.
 */
describe('설정 화면 — 첫 그림', () => {
    it('인성이 기본으로 골라져 있고, 배차망 버튼·시작 버튼 색이 그대로다', () => {
        expect(renderToStaticMarkup(<MemoryRouter initialEntries={['/']}><SetupPage /></MemoryRouter>)).toMatchSnapshot();
    });
});
