import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { DispatchPage } from '../src/pages/DispatchPage';
import { FIXED_NOW, seededRandom } from './seededRandom';

/**
 * 🔒 **배차 화면이 배차망마다 무엇을 그리나** 를 잠근다 (카카오픽커_시뮬레이터.md 0단계 0-2 ⑤)
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
        // 0-4 에서 이름이 `inseong` → `insung` 으로 바뀌었다 — 스냅숏은 옮기기 전 그대로 (옛 주소 넘김은 addressRedirect.test.tsx)
        ['인성', '/dispatch?net=insung'],
        ['화물24시', '/dispatch?net=hwamul24'],
        ['없는 문제지', '/dispatch?net=hwamul24&preset=없는문제지'],
    ])('%s', (_name, url) => {
        expect({ frame: frameOf(url), text: textOf(url) }).toMatchSnapshot();
    });
});

/**
 * 🎯 **배차망마다 제 문제지 책을 쓴다 — 없는 이름이면 멈춘다** (카카오픽커_시뮬레이터.md §9-3 · 2단계 2-2 · 3단계 3-2)
 *
 * 지금 문제지는 요금이 **원** 단위(5만 · 15만)이고 정답이 인성 콜 필터 기준이다. 픽커 화면(P · 2천~2만)으로 띄우면
 * 요금 크기부터 틀려 알람 판정이 통째로 헛것이 된다. 픽커는 제 책을 쓰고(«칠지점» — 지점은 인성과 같고 요금만 P · 기사님 2026-09-14),
 * 책에 없는 이름은 «없는 문제지»로 멈춘다.
 */
describe('배차 화면 — 픽커', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(FIXED_NOW); vi.spyOn(Math, 'random').mockImplementation(seededRandom(5173)); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    it('문제지 없이 열면 홈', () => {
        const text = textOf('/dispatch?net=kakaopicker');
        expect(text).toContain('시작하기');
    });

    it('픽커 «칠지점» 으로 열면 홈 — 이름은 인성과 같고 요금만 P 인 픽커 책의 문제지 (3단계 3-2)', () => {
        expect(textOf('/dispatch?net=kakaopicker&preset=칠지점')).toContain('시작하기');
    });

    it('🔴 픽커 책에 없는 이름이면 콜을 안 흘리고 멈춘다 — 쓸 수 있는 이름은 픽커 책의 것', () => {
        const text = textOf('/dispatch?net=kakaopicker&preset=병원복귀');
        expect(text).toContain('문제지 «병원복귀» 가 없습니다');
        expect(text).toContain('칠지점');
        expect(text).not.toContain('시작하기');
    });

    it('인성·화물24시는 같은 문제지로 그대로 연다', () => {
        expect(textOf('/dispatch?net=insung&preset=칠지점')).toContain('신규');
        expect(textOf('/dispatch?net=hwamul24&preset=칠지점')).toContain('화물정보');
    });
});

/**
 * 🔴 **모르는 배차망이면 멈춘다** (카카오픽커_시뮬레이터.md §3-3 · 0단계 0-4)
 *
 * 예전엔 `?net=` 이 화물24시가 아니면 전부 인성으로 그렸다. 인성인 줄 모르고 30분 시험하면 그 30분이 헛것이다 —
 * 문제지 이름을 못 찾을 때(«문제지 … 가 없습니다»)와 같은 자리다. 이름이 **아예 없을 때**도 같다.
 */
describe('배차 화면 — 배차망 이름을 모르면 멈춘다', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(FIXED_NOW); });
    afterEach(() => { vi.useRealTimers(); });

    it.each([
        ['모르는 이름', '/dispatch?net=abc', '배차망 «abc» 가 없습니다'],
        ['이름 없음', '/dispatch?preset=seven', '주소에 배차망 이름(net)이 없습니다'],
        ['빈 이름', '/dispatch?net=', '주소에 배차망 이름(net)이 없습니다'],
    ])('%s — 콜 화면을 안 그리고 쓸 수 있는 이름을 보인다', (_name, url, title) => {
        const text = textOf(url);
        expect(text).toContain(title);
        expect(text).toContain('insung');
        expect(text).toContain('hwamul24');
        // 인성 리스트도 화물24시 리스트도 아니다
        expect(text).not.toContain('대기 중인 오더가 없습니다');
        expect(text).not.toContain('화물정보');
    });
});
