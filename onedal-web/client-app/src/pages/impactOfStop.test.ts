import { describe, it, expect } from 'vitest';
import { impactOfStop } from './labPortMap';

/**
 * 🧾 **누가 이 정거장을 몇 분 밀었나** (기사님 2026-09-09: *"31분이 왜 밀린 건지
 * 그 요소들만 딱 들어갔으면"*).
 *
 * 값은 «확정 전»과 «확정 후»의 그 정거장까지 누적 차이. 원인은 **이번에 끼워 넣은
 * 정거장 중 그 정거장보다 앞에 온 것**뿐이다.
 */
const base = {
    orderNow: ['①상차', '②상차', '①하차', '②하차'],
    inserted: [{ label: '②상차', name: '상대원동 상차' }, { label: '②하차', name: '식사동 하차' }],
    causeCallId: 2, at: 1000,
};

describe('🧾 정거장 지연의 원인과 분', () => {
    it('앞에 낀 정거장만 원인으로 적는다 — ①하차 앞엔 ②상차만 있다', () => {
        const r = impactOfStop({ ...base, stopLabel: '①하차', beforeMin: 80, afterMin: 91 });
        expect(r).toEqual({ causeCallId: 2, causeLabel: '상대원동 상차', min: 11, at: 1000 });
    });

    it('둘 다 앞에 끼면 둘 다 적는다', () => {
        const r = impactOfStop({ ...base, orderNow: ['①상차', '②상차', '②하차', '①하차'],
            stopLabel: '①하차', beforeMin: 80, afterMin: 120 });
        expect(r?.causeLabel).toBe('상대원동 상차 · 식사동 하차');
        expect(r?.min).toBe(40);
    });

    it('🔴 앞에 낀 것이 없으면 이 확정 탓이 아니다 — 적지 않는다', () => {
        // ①상차 는 ②상차보다 앞이라, ② 를 끼워도 ①상차는 안 밀린다
        const r = impactOfStop({ ...base, stopLabel: '①상차', beforeMin: 20, afterMin: 20 });
        expect(r).toBeNull();
    });

    it('안 밀렸으면 적지 않는다 (0분을 쌓지 않는다)', () => {
        const r = impactOfStop({ ...base, stopLabel: '①하차', beforeMin: 80, afterMin: 80 });
        expect(r).toBeNull();
    });

    it('못 잰 값이 섞이면 적지 않는다 — 지어내지 않는다 (규칙 ④)', () => {
        expect(impactOfStop({ ...base, stopLabel: '①하차', beforeMin: null, afterMin: 91 })).toBeNull();
        expect(impactOfStop({ ...base, stopLabel: '①하차', beforeMin: 80, afterMin: undefined })).toBeNull();
    });

    it('당겨졌으면 음수로 적는다 — 취소로 순서가 줄 때 쓰인다', () => {
        const r = impactOfStop({ ...base, stopLabel: '①하차', beforeMin: 91, afterMin: 80 });
        expect(r?.min).toBe(-11);
    });
});
