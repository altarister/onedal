import { describe, it, expect } from 'vitest';
import { peakLoadPoints } from './cargoUnits';

/**
 * 📦 **적재는 «지금 함께 실리는 최대»다 — 잡은 콜을 다 더한 것이 아니다**
 *
 * 무엇을 막나
 * - **KEEP 을 적재로 세는 것** — KEEP 은 예약이다. 3번 콜을 상차하기 전에 1번을 내리면
 *   그 자리가 돌아온다. 다 더해 세면 하루 6~7콜을 도는데 3~4콜에서 «만재»로 막힌다
 * - **이미 실은 콜을 빼먹는 것** — 상차를 마친 콜은 경로에서 그 정거장이 사라진다.
 *   정거장만 걸으면 «안 실린 것»이 되어 자리가 넘치게 보인다
 * - 순서를 모를 때 **낙관하는 것** — 모르면 다 더한 값(가장 나쁜 경우)으로 물러선다 (규칙 ④)
 */
describe('📦 최대 동시 적재', () => {
    const points = { A: 40, B: 30, C: 50 };

    const AB = { A: 40, B: 30 };

    it('🔴 안 겹치면 가장 큰 하나다 — A 를 내린 뒤 B 를 싣는다', () => {
        expect(peakLoadPoints(AB, [
            { orderId: 'A', stopType: 'pickup' }, { orderId: 'A', stopType: 'dropoff' },
            { orderId: 'B', stopType: 'pickup' }, { orderId: 'B', stopType: 'dropoff' },
        ], [])).toBe(40);
    });

    it('🔴 겹치면 겹친 만큼 더한다 — 둘을 싣고 달린다', () => {
        expect(peakLoadPoints(AB, [
            { orderId: 'A', stopType: 'pickup' }, { orderId: 'B', stopType: 'pickup' },
            { orderId: 'A', stopType: 'dropoff' }, { orderId: 'B', stopType: 'dropoff' },
        ], [])).toBe(70);
    });

    it('🔴 셋 중 둘만 겹치면 그 둘이다 — 다 더한 120 이 아니다', () => {
        expect(peakLoadPoints(points, [
            { orderId: 'A', stopType: 'pickup' }, { orderId: 'B', stopType: 'pickup' },
            { orderId: 'A', stopType: 'dropoff' }, { orderId: 'B', stopType: 'dropoff' },
            { orderId: 'C', stopType: 'pickup' }, { orderId: 'C', stopType: 'dropoff' },
        ], [])).toBe(70);
    });

    it('🔴 이미 실은 콜은 처음부터 실려 있다 — 그 상차 정거장은 경로에 없다', () => {
        // A 는 상차를 마쳤다(정거장이 빠졌다). B 를 싣고 나서 A 를 내리면 둘이 함께 실린다
        expect(peakLoadPoints(AB, [
            { orderId: 'B', stopType: 'pickup' },
            { orderId: 'A', stopType: 'dropoff' }, { orderId: 'B', stopType: 'dropoff' },
        ], ['A'])).toBe(70);
    });

    it('🔴 이미 실은 콜을 먼저 내리면 그 자리가 돌아온다', () => {
        expect(peakLoadPoints(AB, [
            { orderId: 'A', stopType: 'dropoff' },
            { orderId: 'B', stopType: 'pickup' }, { orderId: 'B', stopType: 'dropoff' },
        ], ['A'])).toBe(40);
    });

    it('🔴 순서를 모르면 다 더한다 — 가장 나쁜 경우로 물러선다', () => {
        expect(peakLoadPoints(points, null, [])).toBe(120);
        expect(peakLoadPoints(points, [], [])).toBe(120);
    });

    it('🔴 정거장에 없는 콜이 있으면 다 더한다 — 반쪽 순서를 믿지 않는다', () => {
        // C 가 정거장 목록에 아예 없다 (경로가 반만 조립됐다) → 120 으로 물러선다
        expect(peakLoadPoints(points, [
            { orderId: 'A', stopType: 'pickup' }, { orderId: 'A', stopType: 'dropoff' },
            { orderId: 'B', stopType: 'pickup' }, { orderId: 'B', stopType: 'dropoff' },
        ], [])).toBe(120);
    });

    it('🔴 실은 콜의 하차가 정거장에 없으면 다 더한다 — 언제 자리가 도는지 모른다', () => {
        expect(peakLoadPoints(AB, [{ orderId: 'B', stopType: 'pickup' }, { orderId: 'B', stopType: 'dropoff' }], ['A']))
            .toBe(70);
    });

    it('빈 목록은 0 이다', () => {
        expect(peakLoadPoints({}, null, [])).toBe(0);
    });
});
