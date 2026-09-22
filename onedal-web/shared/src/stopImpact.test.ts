import { describe, it, expect } from 'vitest';
import { impactOfStop, splitDropImpact } from './stopImpact';

/**
 * 🧾 **누가 이 정거장을 몇 분 밀었나** (기사님 2026-09-09).
 *
 * 🔴 **분이 아니라 «시각»을 받는다** (리뷰에서 잡힘). 확정 전 경로와 확정 후
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
            .toEqual({ causeCallId: 2, causeLabel: '상대원동 상차', min: 11, at: T, causeNames: ['상대원동 상차'] });
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

/**
 * ✂️ **밀림을 «출발이 밀린 몫»과 «구간이 꺾인 몫»으로 가른다** (기사님 지시 2026-09-09
 * *"①을 갈라 적어"* — 화면에서 «82분이나 돌아간다는데 이것이 사실이야?» 라고 물으신 뒤).
 *
 * 아래 숫자는 그날 기사님 화면의 실측 그대로다 (콜 넷 · 파주행).
 */
describe('✂️ 하차 밀림 가르기', () => {
    const ORDER = ['①상차', '②상차', '③상차', '①하차', '③하차', '④상차', '②하차', '④하차'];
    const INSERTED = [
        { label: '①하차', name: '목감동 하차' },
        { label: '③하차', name: '군자동 하차' },
        { label: '②하차', name: '대장동 하차' },
    ];
    const pick = impactOfStop({ stopLabel: '④상차', beforeAt: m(22), afterAt: m(63),
        orderNow: ORDER, inserted: INSERTED, causeCallId: 4, at: T });
    const drop = impactOfStop({ stopLabel: '④하차', beforeAt: m(80), afterAt: m(162),
        orderNow: ORDER, inserted: INSERTED, causeCallId: 4, at: T });

    it('실측: 상차 +41분 · 하차 +82분 — 그 82분이 41 + 41 로 갈린다', () => {
        expect(pick?.min).toBe(41);
        expect(drop?.min).toBe(82);
        expect(splitDropImpact(pick, drop).map(r => r.min)).toEqual([41, 41]);
    });

    it('꺾인 몫의 원인은 상차와 하차 «사이»에 낀 것뿐이다 — 대장동 하차', () => {
        const rows = splitDropImpact(pick, drop);
        expect(rows[0].causeLabel).toBe('목감동 하차 · 군자동 하차 경유 — 출발이 밀렸다');
        expect(rows[1].causeLabel).toBe('대장동 하차 경유 — 이 구간이 꺾였다');
    });

    it('출발이 안 밀렸으면 한 줄만 — 전부 이 구간이 꺾인 것이다', () => {
        const rows = splitDropImpact(null, drop);
        expect(rows.map(r => r.min)).toEqual([82]);
    });

    it('밀림이 전부 출발 탓이면 «꺾인 몫» 줄은 안 적는다 (0 을 쌓지 않는다)', () => {
        const same = impactOfStop({ stopLabel: '④하차', beforeAt: m(80), afterAt: m(121),
            orderNow: ORDER, inserted: INSERTED, causeCallId: 4, at: T });
        expect(splitDropImpact(pick, same).map(r => r.min)).toEqual([41]);
    });

    it('하차 밀림이 없으면 아무것도 안 적는다', () => {
        expect(splitDropImpact(pick, null)).toEqual([]);
    });
});
