import { describe, it, expect } from 'vitest';
import { summarizeTally } from './filterTally';

/**
 * [2026-08-23] 스캔 성적표의 **주어는 폰이다.**
 *
 * 처음엔 필터 카드 한복판에 `👁️ 방금 6건 → 통과 0` 을 놓았다. 폰이 하나일 땐 맞아 보였지만
 * 기사님이 바로 짚으셨다 — *"폰이 2개 이상이어도 상관없는 건가? 1번 폰은 작동하는데
 * 2번 폰은 작동하지 않는다면?"*
 *
 * 필터는 **한 벌**(서버가 만들어 모두에게 내려보낸다), 성적표는 **폰마다**다.
 * 한 벌짜리 카드에 폰마다 다른 값을 놓으면 둘 중 하나를 골라야 하고,
 * 옛 코드는 `devices.filter(...).pop()` 으로 **배열 순서상 마지막 폰**을 집었다.
 * 멀쩡한 폰이 멈춘 폰을 가리는 화면이었다.
 */
const mk = (over: Partial<Record<string, number>> = {}) => ({
    seen: 0, passed: 0, vehicle: 0, region: 0, fare: 0,
    pickup: 0, blacklist: 0, routeOrder: 0, ...over,
}) as any;

describe('summarizeTally — 폰 하나의 성적표', () => {
    it('많이 걸린 축이 앞에 온다 — 지금 풀 것이 맨 앞이다', () => {
        const s = summarizeTally(mk({ seen: 6, passed: 0, region: 4, vehicle: 1, routeOrder: 1 }));
        expect(s!.rejects.map(([n]) => n)).toEqual(['도착지', '차종', '경로순서']);
    });

    it('0인 축은 적지 않는다 — 줄이 길어지면 아무도 안 읽는다', () => {
        const s = summarizeTally(mk({ seen: 3, passed: 2, fare: 1 }));
        expect(s!.rejects).toEqual([['요금', 1]]);
    });

    it('동점이면 선언 순서가 유지된다 — 스캔마다 순서가 뒤집히지 않게', () => {
        const s = summarizeTally(mk({ seen: 4, passed: 0, vehicle: 2, region: 2 }));
        expect(s!.rejects.map(([n]) => n)).toEqual(['도착지', '차종']);
    });

    it('🔴 아직 안 훑은 폰은 null 이다 — "0건"이라고 적지 않는다', () => {
        expect(summarizeTally(undefined)).toBeNull();
        expect(summarizeTally(null)).toBeNull();
        expect(summarizeTally(mk({ seen: 0 }))).toBeNull();
    });

    it('통과분은 그대로 전달된다', () => {
        const s = summarizeTally(mk({ seen: 8, passed: 2, region: 6 }));
        expect([s!.seen, s!.passed]).toEqual([8, 2]);
    });
});

/**
 * 🕐 기사님: *"`방금 1건 → 통과 0 · 차종 1` 같은 게 나오니까 **멈춰 있는 것 같아.**
 * 보내온 마지막 시간을 쓰는 것이 더 좋을 것 같다."*
 *
 * `방금` 은 다시 그려져야만 참인 말이다 — 폰이 끊기면 문구가 숫자와 함께 멈춘다.
 */
describe('🕐 언제 온 숫자인가', () => {
    it('받은 시각을 초까지 적는다 (30초 전과 90초 전이 같아 보이면 못 읽는다)', () => {
        const t = new Date(2026, 7, 23, 20, 39, 13).getTime();
        expect(summarizeTally(mk({ seen: 6, passed: 0, region: 4 }), t)!.at).toBe('20:39:13');
    });

    it('한 자리 수는 0을 채운다 — 자리가 밀리면 눈이 못 따라간다', () => {
        const t = new Date(2026, 7, 23, 5, 4, 7).getTime();
        expect(summarizeTally(mk({ seen: 1, passed: 1 }), t)!.at).toBe('05:04:07');
    });

    it('🔴 시각을 모르면 null — 아무 시각이나 지어내지 않는다', () => {
        expect(summarizeTally(mk({ seen: 1, passed: 1 }))!.at).toBeNull();
        expect(summarizeTally(mk({ seen: 1, passed: 1 }), 0)!.at).toBeNull();
    });
});

/**
 * 🔴 **어느 화면에 사는가**(폰 카드 O · 필터 카드 X)는 여기서 안 지킨다 —
 *    앱→서버→화면 왕복을 통째로 보는 `server/tests/rules/filterTally.test.ts` 한 곳에 뒀다.
 *    같은 규칙이 두 벌이면 나중에 한쪽만 고쳐진다.
 */
