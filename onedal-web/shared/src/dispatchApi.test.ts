import { describe, it, expect } from 'vitest';
import { leftForOtherNetwork, timeoutActionOf } from './dispatchApi';

/**
 * 📲 **원달앱이 확정한 콜은 원달앱이 끝까지 책임진다** (38 F36 · 기사님 정답).
 * 서버는 «다른 배차망 화면»을 놓음으로 보지 않고, 원달앱이 계약한 콜은 시한에 스스로 세지 않고 원달앱 «눌렀음» 보고를 기다린다.
 * 못 잡는 것: 서버 기다림 장부(armWait)의 시계 배선 — 폰 day1 S15 · S16.
 */
describe('📲 다른 배차망 화면인가', () => {
    it('🔴 콜의 배차망과 화면의 배차망이 다르면 참 · 같거나 하나라도 모르면 거짓', () => {
        expect(leftForOtherNetwork('insung', 'hwamul24')).toBe(true);
        expect(leftForOtherNetwork('insung', 'insung')).toBe(false);
        expect(leftForOtherNetwork(undefined, 'hwamul24')).toBe(false);
        expect(leftForOtherNetwork('insung', null)).toBe(false);
    });
});

describe('⏱️ 안전취소 시한이 지났을 때 서버가 할 일', () => {
    it('🔴 KEEP 이면 지킨다 · 원달앱이 계약한 진짜 콜이면 원달앱 보고를 기다린다 · 미리보기 · 체험 · 손 확정은 지금처럼 치운다', () => {
        expect(timeoutActionOf({ keep: true, who: 'APP', simulated: false })).toBe('KEEP_GUARD');
        expect(timeoutActionOf({ keep: false, who: 'APP', simulated: false })).toBe('WAIT_APP_REPORT');
        expect(timeoutActionOf({ keep: false, who: 'APP', simulated: true })).toBe('FORCE_CANCEL');
        expect(timeoutActionOf({ keep: false, who: 'NONE', simulated: false })).toBe('FORCE_CANCEL');
        expect(timeoutActionOf({ keep: false, who: 'DRIVER', simulated: false })).toBe('FORCE_CANCEL');
    });
});
