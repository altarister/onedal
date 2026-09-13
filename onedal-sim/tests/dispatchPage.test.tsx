import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { DispatchPage } from '../src/pages/DispatchPage';
import { FIXED_NOW, seededRandom } from './seededRandom';

/**
 * 🔒 **배차 화면이 배차망마다 무엇을 그리나** 를 잠근다 (2026-09-14 · 카카오픽커_시뮬레이터.md 0단계 0-2 ⑤)
 *
 * ⑤ 에서 DispatchPage 안의 `net === 'hwamul24' ? … : …` 갈래를 `nets.ts` 로 모은다. 기존 검사는 화면 부품을
 * 하나씩 그릴 뿐 **어느 배차망에 어느 부품을 고르는지**는 안 봤다 — 그래서 옮기기 **전에** 이 스냅숏을 떴다.
 *
 * 서버 렌더라 첫 그림만 본다(콜 스트리밍·위치 조회는 브라우저에서만 돈다) — 리스트 부품·겉 테두리·
 * «문제지가 없다» 멈춤 화면을 고르는 갈래를 보기에는 충분하다. 상세를 고르는 갈래는 ⑤ 에서 따로 대조한다.
 */
const textOf = (url: string) =>
    renderToStaticMarkup(<MemoryRouter initialEntries={[url]}><DispatchPage /></MemoryRouter>)
        .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const frameOf = (url: string) =>
    (renderToStaticMarkup(<MemoryRouter initialEntries={[url]}><DispatchPage /></MemoryRouter>).match(/^<div class="([^"]*)"/) ?? [])[1];

describe('배차 화면 — 배차망마다 고르는 부품 (첫 그림)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(FIXED_NOW);
        vi.spyOn(Math, 'random').mockImplementation(seededRandom(5173));
    });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    it.each([
        ['인성', '/dispatch?net=inseong'],
        ['화물24시', '/dispatch?net=hwamul24'],
        ['net 없음', '/dispatch'],
        ['모르는 net', '/dispatch?net=abc'],
        ['없는 문제지', '/dispatch?net=hwamul24&preset=없는문제지'],
    ])('%s', (_name, url) => {
        expect({ frame: frameOf(url), text: textOf(url) }).toMatchSnapshot();
    });
});
