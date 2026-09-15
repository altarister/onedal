import { describe, it, expect } from 'vitest';
import type { SecuredOrder } from '@onedal/shared';
import { withSecuredArrival } from './securedArrival';

/**
 * 🟢 **새 선점이 오면 같은 기기의 «심사 중» 카드만 지운다** (버그 대장 #137 · 2026-09-15 여섯 번째 바퀴).
 *
 * 10:53:34 합짐 선점 때 이미 상차한 콜(ORDER_PICKED_UP)이 목록에서 빠졌다가 1초 싱크에 돌아왔다 —
 * 그 사이 경로 홀더·정거장이 비어 지도 선이 깜빡였고, 모의 주행은 «사이클이 닫혔다»로 보고 처음 자리로 되감겨
 * 13km 튀었다. 확정 뒤 단계는 서버가 진실이다 — 관제웹이 추측으로 지우지 않는다.
 * 🔴 옛 심사 카드(화면 이탈·반송으로 버려진 선점)는 지금처럼 지워진다 (onedal-49 짚음).
 */
const order = (id: string, status: string, device = 'phoneA') =>
    ({ id, status, capturedDeviceId: device } as unknown as SecuredOrder);

describe('새 선점이 온 관제웹 콜 목록', () => {
    const fresh = order('new', 'ORDER_PRE_SECURED');

    it('확정 뒤 단계의 콜(확정·상차 완료)은 같은 기기여도 남는다', () => {
        for (const status of ['ORDER_CONFIRMED', 'ORDER_PICKED_UP']) {
            const ids = withSecuredArrival([order('held', status)], fresh).map(o => o.id);
            expect({ status, ids }).toEqual({ status, ids: ['held', 'new'] });
        }
    });

    it('같은 기기의 옛 심사 중 카드는 지워진다', () => {
        for (const status of ['ORDER_PRE_SECURED', 'ORDER_SECURED_EVALUATING', 'ORDER_AWAITING_DECISION']) {
            expect(withSecuredArrival([order('old', status)], fresh).map(o => o.id)).toEqual(['new']);
        }
    });

    it('다른 기기의 심사 중 카드는 남는다', () => {
        expect(withSecuredArrival([order('other', 'ORDER_PRE_SECURED', 'phoneB')], fresh).map(o => o.id)).toEqual(['other', 'new']);
    });

    it('같은 id 가 다시 오면 한 장만 남는다', () => {
        expect(withSecuredArrival([order('new', 'ORDER_PRE_SECURED')], fresh).map(o => o.id)).toEqual(['new']);
    });
});
