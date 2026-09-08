import { describe, it, expect } from 'vitest';
import { impactOfStop } from './labPortMap';

/**
 * 🧾 **누가 이 정거장을 몇 분 밀었나** (기사님 2026-09-09).
 *
 * 🔴 **분이 아니라 «시각»을 받는다** (2026-09-09 리뷰에서 잡힘). 확정 전 경로와 확정 후
 *    경로는 **잰 시각이 다르다** — 그 사이에 달렸으면 각자의 «0분»이 다른 자리다.
 *    분끼리 빼면 그 주행 시간이 통째로 섞인다. 단위를 시각으로 두어 애초에 못 틀리게 한다.
 */
const T = Date.UTC(2026, 8, 9, 0, 0, 0);
const m = (min: number) => T + min * 60000;
const base = {
    orderNow: ['①상차', '②상차', '①하차', '②하차'],
    inserted: [{ label: '②상차', name: '상대원동 상차' }, { label: '②하차', name: '식사동 하차' }],
    causeCallId: 2, at: T,
};

describe('🧾 정거장 지연의 원인과 분', () => {
    it('앞에 낀 정거장만 원인으로 적는다 — ①하차 앞엔 ②상차만 있다', () => {
        expect(impactOfStop({ ...base, stopLabel: '①하차', beforeAt: m(80), afterAt: m(91) }))
            .toEqual({ causeCallId: 2, causeLabel: '상대원동 상차', min: 11, at: T });
    });

    it('둘 다 앞에 끼면 둘 다 적는다', () => {
        const r = impactOfStop({ ...base, orderNow: ['①상차', '②상차', '②하차', '①하차'],
            stopLabel: '①하차', beforeAt: m(80), afterAt: m(120) });
        expect(r?.causeLabel).toBe('상대원동 상차 · 식사동 하차');
        expect(r?.min).toBe(40);
    });

    it('🔴 두 경로를 «잰 시각»이 다를 때 — 그 사이 주행이 섞이지 않는다', () => {
        /**
         * 확정 전 경로는 04:00 에 쟀고 ①하차를 «+80분»(05:20)이라 했다.
         * 30분 달린 뒤 04:30 에 다시 재니 ①하차가 «+65분»(05:35)이다.
         * 분끼리 빼면 65−80 = **−15분**(빨라졌다)이 되지만, 실제로는 도착 예정이
         * 05:20 → 05:35 로 **15분 늦어졌다.** 시각으로 재야 답이 맞는다.
         */
        expect(impactOfStop({ ...base, stopLabel: '①하차', beforeAt: m(80), afterAt: m(30 + 65) })?.min).toBe(15);
    });

    it('🔴 앞에 낀 것이 없으면 이 확정 탓이 아니다 — 적지 않는다', () => {
        expect(impactOfStop({ ...base, stopLabel: '①상차', beforeAt: m(20), afterAt: m(20) })).toBeNull();
    });

    it('안 밀렸으면 적지 않는다 (0분을 쌓지 않는다)', () => {
        expect(impactOfStop({ ...base, stopLabel: '①하차', beforeAt: m(80), afterAt: m(80) })).toBeNull();
    });

    it('못 잰 값이 섞이면 적지 않는다 — 지어내지 않는다 (규칙 ④)', () => {
        expect(impactOfStop({ ...base, stopLabel: '①하차', beforeAt: null, afterAt: m(91) })).toBeNull();
        expect(impactOfStop({ ...base, stopLabel: '①하차', beforeAt: m(80), afterAt: undefined })).toBeNull();
    });

    it('당겨졌으면 음수로 적는다 — 취소로 순서가 줄 때 쓰인다', () => {
        expect(impactOfStop({ ...base, stopLabel: '①하차', beforeAt: m(91), afterAt: m(80) })?.min).toBe(-11);
    });
});
