import { describe, it, expect } from 'vitest';
import { circled, stopLabel, hhmm, cumMinutes, arrivalAt, visitOrder } from './labTime';

/**
 * ⏱️ **시간·정거장 이름을 다루는 규칙 — 한 곳이다** (구조 리뷰).
 *
 * 같은 누적 계산이 `MapMockup.tsx` 안에 **다섯 벌**로 흩어져 있었다(919·945·1094·1254·1404).
 * 그중 셋에서 「분끼리 빼는」 같은 버그가 났고, 한 곳만 고쳤다가 나머지를 놓쳤다.
 * 한 벌로 모으고 여기서 잠근다 (규칙 ③).
 */
const T = Date.UTC(2026, 8, 9, 0, 0, 0);
const leg = (to: string | null, durMin: number | null) => ({ to, durMin });

describe('⏱️ 누적 분 — 구간을 걸으며 정거장마다 더한다', () => {
    it('구간을 순서대로 더한다', () => {
        const m = cumMinutes([leg('①상차', 10), leg('②상차', 26), leg('①하차', 45)]);
        expect([...m]).toEqual([['①상차', 10], ['②상차', 36], ['①하차', 81]]);
    });

    it('🔴 못 잰 구간을 만나면 거기서 멈춘다 — 그 뒤는 모른다 (규칙 ④)', () => {
        const m = cumMinutes([leg('①상차', 10), leg('②상차', null), leg('①하차', 45)]);
        expect([...m.keys()]).toEqual(['①상차']);
    });

    it('이름 없는 정거장은 안 넣는다 — 열쇠가 없으면 못 찾는다', () => {
        expect([...cumMinutes([leg(null, 10), leg('①하차', 5)]).keys()]).toEqual(['①하차']);
    });
});

describe('⏱️ 도착 시각 — 잰 시각 + 누적', () => {
    const chain = { measuredAt: T, legs: [leg('①상차', 10), leg('①하차', 50)] };

    it('잰 시각에 누적을 더해 «시각»으로 낸다', () => {
        expect(arrivalAt(chain, '①하차')).toBe(T + 60 * 60000);
    });

    it('🔴 잰 시각을 모르면 null — 지금 시각으로 대신 채우지 않는다', () => {
        expect(arrivalAt({ legs: chain.legs }, '①하차')).toBeNull();
    });

    it('그 정거장이 경로에 없으면 null', () => {
        expect(arrivalAt(chain, '②하차')).toBeNull();
    });

    it('경로 자체가 없으면 null', () => {
        expect(arrivalAt(null, '①하차')).toBeNull();
    });
});

describe('⏱️ 표시', () => {
    it('시각은 시:분, 없으면 --:--', () => {
        expect(hhmm(null)).toBe('--:--');
        expect(hhmm(undefined)).toBe('--:--');
        expect(hhmm(T)).toMatch(/^\d{2}:\d{2}$/);
    });

    it('동그라미 번호는 20 까지, 넘으면 괄호', () => {
        expect(circled(1)).toBe('①');
        expect(circled(20)).toBe('⑳');
        expect(circled(21)).toBe('(21)');
    });

    it('정거장 이름은 조립하지 않고 만들어 쓴다 — 오타가 런타임까지 가지 않게', () => {
        expect(stopLabel(1, '상차')).toBe('①상차');
        expect(stopLabel(3, '하차')).toBe('③하차');
    });
});

/**
 * 🧳 **정거장에 머무는 분** (기사님 2026-09-09 *"넣어줘"*).
 * 도착 시각에는 안 붙고 **떠나는 시각**에 붙는다 — 「몇 시까지 갈게요」는 도착 약속이고
 * 짐 싣는 시간은 그 뒤의 일이다.
 */
describe('🧳 정차', () => {
    const dwell = (label: string) => label.endsWith('하차') ? 10 : 15;

    it('도착 누적에는 그 정거장 정차가 안 들어간다 — 다음 정거장부터 밀린다', () => {
        const legs = [leg('①상차', 10), leg('②상차', 26), leg('①하차', 45)];
        expect([...cumMinutes(legs, dwell).entries()]).toEqual([
            ['①상차', 10],            // 10
            ['②상차', 10 + 15 + 26],  // 상차에서 15분 머문 뒤 출발 → 51
            ['①하차', 51 + 15 + 45],  // 또 15분 → 111
        ]);
    });

    it('정차를 안 주면 예전과 같은 답이다 (되돌리는 길)', () => {
        const legs = [leg('①상차', 10), leg('②상차', 26)];
        expect([...cumMinutes(legs).values()]).toEqual([10, 36]);
    });

    it('못 잰 구간에서 멈추는 규칙은 그대로다 — 정차를 넣어도 뒤를 지어내지 않는다', () => {
        const legs = [leg('①상차', 10), leg('②상차', null), leg('①하차', 45)];
        expect([...cumMinutes(legs, dwell).keys()]).toEqual(['①상차']);
    });

    it('도착 시각도 정차를 반영한다', () => {
        const chain = { legs: [leg('①상차', 10), leg('①하차', 45)], measuredAt: T };
        expect(arrivalAt(chain, '①하차', dwell)).toBe(T + (10 + 15 + 45) * 60000);
    });
});

/**
 * 🔢 **방문 순번 — 지도와 시트가 같은 숫자를 말해야 한다** (기사님 2026-09-10 실측:
 * 지도 ⑧⑨⑩ ↔ 시트 10·11·12). 세는 곳이 둘이라 난 사고가 이번이 **세 번째**라 여기서 잠근다.
 */
describe('🔢 방문 순번', () => {
    it('지나온 것 다음에 남은 순서가 이어진다', () => {
        expect(visitOrder(['①상차', '①하차'], ['②상차', '②하차']))
            .toEqual(['①상차', '①하차', '②상차', '②하차']);
    });

    it('🔴 경로가 품고 있는 지나온 정거장을 두 번 세지 않는다 (2026-09-09 · +3 사고)', () => {
        expect(visitOrder(['①상차', '①하차'], ['①상차', '①하차', '②상차']))
            .toEqual(['①상차', '①하차', '②상차']);
    });

    it('🔴 아직 안 잡은 후보콜의 정거장은 번호를 안 먹는다 (2026-09-10 · +2 사고)', () => {
        const planned = ['②상차', '③상차', '③하차', '②하차'];   // ③ 이 후보콜
        expect(visitOrder(['①상차', '①하차'], planned, ['③상차', '③하차']))
            .toEqual(['①상차', '①하차', '②상차', '②하차']);
    });

    it('후보를 빼도 **남은 것의 상대 순서**는 그대로다 — 자리만 메운다', () => {
        expect(visitOrder([], ['가', '후보', '나', '다'], ['후보'])).toEqual(['가', '나', '다']);
    });

    it('뺄 것이 없으면 그냥 이어 붙인 것과 같다', () => {
        expect(visitOrder(['가'], ['나', '다'])).toEqual(['가', '나', '다']);
    });
});
