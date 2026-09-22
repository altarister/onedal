import { describe, expect, it } from 'vitest';
import { callTargetOfDay, isHomeCallSince } from './callTargetDay';
import type { CallTargetEvent } from './callTargetDay';

/**
 * 🧭 **복귀 켬은 «바꾼 일»에서 계산한다** (기사님 확정).
 *
 * 짐의 수명(콜 0건이면 끝)과 방향의 수명은 다르다. 2026-09-15 02:03 이천 왕복 — B1·B3 하차로 0건이 되자 복귀가 꺼졌고,
 * 서버 재기동에는 복귀 켬 자체가 사라졌다(메모리에만 있었다).
 */
const at = (h: number, m: number, day = 15) => new Date(2026, 8, day, h, m).toISOString();
const now = new Date(2026, 8, 15, 2, 30).getTime();
const ev = (target: 'DEST' | 'HOME', time: string, by: 'driver' | 'auto' = 'driver'): CallTargetEvent => ({ target, at: time, by });

describe('지금 복귀인가 — 오늘 줄의 마지막', () => {
    it('줄이 없으면 복귀 끔 — 기본값을 지어내지 않는다', () => {
        expect(callTargetOfDay([], now)).toEqual({ target: 'DEST', homeOnAt: null });
    });

    it('오늘 마지막 줄이 HOME 이면 복귀 켬 · 켠 시각은 그 줄', () => {
        expect(callTargetOfDay([ev('HOME', at(2, 3))], now)).toEqual({ target: 'HOME', homeOnAt: at(2, 3) });
    });

    it('켰다가 껐으면 끔 · 순서가 섞여 와도 시각으로 고른다', () => {
        expect(callTargetOfDay([ev('DEST', at(2, 20), 'auto'), ev('HOME', at(2, 3))], now)).toEqual({ target: 'DEST', homeOnAt: null });
    });

    it('🔴 어제 켠 줄은 안 본다 — 자정을 넘기면 꺼진다 (오늘 필터와 같은 수명)', () => {
        expect(callTargetOfDay([ev('HOME', at(23, 50, 14))], now)).toEqual({ target: 'DEST', homeOnAt: null });
    });
});

describe('복귀콜인가 — 복귀를 켠 뒤에 잡은, 판이 집인 콜', () => {
    const home = '광주시';
    const on = at(2, 3);

    it('켠 뒤에 잡고 판이 집이면 복귀콜 · 하차를 마친 콜도 센다', () => {
        expect(isHomeCallSince({ status: 'ORDER_CONFIRMED', capturedAt: at(2, 4), board: '광주시' }, on, home)).toBe(true);
        expect(isHomeCallSince({ status: 'ORDER_DELIVERED', capturedAt: at(2, 4), board: '광주시' }, on, home)).toBe(true);
    });

    it('🔴 켜기 전에 잡은 콜은 판이 집이어도 안 센다 — 오늘 02:03 의 B1·B3 자리', () => {
        expect(isHomeCallSince({ status: 'ORDER_DELIVERED', capturedAt: at(1, 58), board: '광주시' }, on, home)).toBe(false);
    });

    it('판이 집이 아니거나 취소·방출이면 안 센다 · 복귀가 꺼져 있으면 복귀콜은 없다', () => {
        expect(isHomeCallSince({ status: 'ORDER_CONFIRMED', capturedAt: at(2, 4), board: '이천시' }, on, home)).toBe(false);
        for (const status of ['SAFE_CANCEL', 'ORDER_RELEASED_BY_ME', 'ORDER_RELEASED_BY_OFFICE'])
            expect(isHomeCallSince({ status, capturedAt: at(2, 4), board: '광주시' }, on, home)).toBe(false);
        expect(isHomeCallSince({ status: 'ORDER_CONFIRMED', capturedAt: at(2, 4), board: '광주시' }, null, home)).toBe(false);
    });
});
