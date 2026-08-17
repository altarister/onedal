import { describe, it, expect } from 'vitest';
import { mergeOrderViews } from './orderMerge';
import type { SecuredOrder } from '@onedal/shared';

const o = (id: string, status: string, extra: Partial<SecuredOrder> = {}) =>
    ({ id, status, pickup: '판교', dropoff: '탄현', fare: 10000, ...extra }) as SecuredOrder;

/**
 * 🔴 2026-08-11 — 이 병합이 `Dashboard.tsx` 안에 인라인으로 있었고
 *    이력 필터가 `isTerminal(s) || s === 'ORDER_CONFIRMED'` 라
 *    **ORDER_PICKED_UP 을 버렸다.** 상차한 콜이 화면에서 사라진 원인 중 하나다.
 *
 *    서버 복구 쿼리를 고쳐도 여기서 다시 걸러내면 "고쳤는데 안 된다"가 된다.
 *    서버 테스트로는 안 잡히는 자리라 별도로 건다.
 */
describe('mergeOrderViews — 관제웹이 보는 콜 목록', () => {
    it('🔴 상차한 콜(ORDER_PICKED_UP)이 DB 이력에서 살아남는다', () => {
        const merged = mergeOrderViews([o('a', 'ORDER_PICKED_UP')], [], []);
        expect(merged.map(x => x.id)).toEqual(['a']);
    });

    it('확정·완료·방출도 전부 살아남는다', () => {
        const ids = ['ORDER_CONFIRMED', 'ORDER_DELIVERED', 'ORDER_COMPLETED', 'ORDER_RELEASED_BY_ME',
                     'SAFE_CANCEL', 'ORDER_RELEASED_BY_OFFICE']
            .map((s, i) => o(`h${i}`, s));
        expect(mergeOrderViews(ids, [], [])).toHaveLength(6);
    });

    it('평가 중 상태가 이력으로 오면 버린다 — 서버 메모리에만 있어야 할 유령이다', () => {
        const merged = mergeOrderViews(
            [o('ghost', 'ORDER_SECURED_EVALUATING'), o('real', 'ORDER_CONFIRMED')], [], []);
        expect(merged.map(x => x.id)).toEqual(['real']);
    });

    it('소켓이 이력을 덮어쓴다 — 소켓이 더 최신이다', () => {
        const merged = mergeOrderViews(
            [o('a', 'ORDER_CONFIRMED')], [], [o('a', 'ORDER_PICKED_UP')]);
        expect(merged[0].status).toBe('ORDER_PICKED_UP');
    });

    it('얕은 병합이라 이력에만 있던 필드는 살아남는다', () => {
        // 소켓 페이로드에 그 키가 **아예 없을 때**의 이야기다.
        // socket.io 직렬화가 undefined 를 떨어뜨리므로 실제로 오는 모양이 이렇다.
        const merged = mergeOrderViews(
            [o('a', 'ORDER_CONFIRMED', { detailMemo: '지하 2층' })],
            [], [o('a', 'ORDER_PICKED_UP')]);
        expect(merged[0].detailMemo).toBe('지하 2층');
        expect(merged[0].status).toBe('ORDER_PICKED_UP');
    });

    it('⚠️ 키가 undefined 로 **들어 있으면** 덮어쓴다 — 스프레드의 성질', () => {
        // 고칠 대상이 아니라 기록이다. 예전 인라인 코드도 똑같이 동작했고,
        // 직렬화를 거치면 이 모양은 오지 않는다. 나중에 "왜 지워졌지"를 막으려 남긴다.
        const merged = mergeOrderViews(
            [o('a', 'ORDER_CONFIRMED', { detailMemo: '지하 2층' })],
            [], [{ ...o('a', 'ORDER_PICKED_UP'), detailMemo: undefined }]);
        expect(merged[0].detailMemo).toBeUndefined();
    });

    it('진행분이 종료분보다 뒤에 적용된다 — 같은 콜이면 진행이 이긴다', () => {
        const merged = mergeOrderViews([], [o('a', 'ORDER_RELEASED_BY_ME')], [o('a', 'ORDER_CONFIRMED')]);
        expect(merged[0].status).toBe('ORDER_CONFIRMED');
    });

    it('같은 콜이 세 갈래에 다 있어도 하나로 합쳐진다', () => {
        const merged = mergeOrderViews(
            [o('a', 'ORDER_CONFIRMED')], [o('a', 'ORDER_DELIVERED')], [o('a', 'ORDER_PICKED_UP')]);
        expect(merged).toHaveLength(1);
    });

    it('전부 비어 있으면 빈 배열', () => {
        expect(mergeOrderViews([], [], [])).toEqual([]);
    });
});
