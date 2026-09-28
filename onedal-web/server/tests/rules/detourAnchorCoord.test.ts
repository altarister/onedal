import { readFileSync } from 'fs';
import { join } from 'path';
import { tailSplitOf } from '@onedal/shared';

/**
 * 🧭 **합짐 방향의 기점 좌표 — 심사 중인 후보도 보여야 한다** (기사님 «가»)
 *
 * ── 왜 ──
 *
 * 방향(전진율)의 기점은 «후보 하차 바로 앞 정거장»(`tailSplitOf`)인데, 후보가 경로
 * 꼬리에 붙는 **노선 합짐의 보통 경우** 그 앞 정거장은 후보 자신의 상차다.
 * 좌표 찾기(`coordOf`)가 잡은 콜(`activeCalls`)만 보면 심사 중인 후보를 못 찾아
 * «안 잼 — 후보 하차 앞 정거장의 좌표가 없습니다»로 방향이 조용히 빠지고,
 * 같은 좌표로 재는 약속(늦음)까지 «잴 수 없음»이 되어 색이 🔴 로 끌려간다
 * (이천 모의 주행 실측 — 다섯 콜 중 둘만 방향을 쟀다).
 *
 * 후보의 좌표는 심사 첫머리(지오코딩)에서 이미 채워져 있다 — 못 볼 이유가 없다.
 */

const src = readFileSync(join(__dirname, '../../src/core/engine/OrderEvaluator.ts'), 'utf8');

describe('🧭 합짐 방향 기점 — 후보도 보인다', () => {
    it('전제: 꼬리 합짐의 기점은 후보 자신의 상차다', () => {
        const stops = [
            { orderId: 'A', stopType: 'dropoff', driveMinutes: 10 },
            { orderId: 'CAND', stopType: 'pickup', driveMinutes: 5 },
            { orderId: 'CAND', stopType: 'dropoff', driveMinutes: 7 },
        ] as const;
        const t = tailSplitOf(stops as never, 'CAND', 20);
        expect(t.tailFrom).toEqual({ orderId: 'CAND', stopType: 'pickup' });
    });

    it('🔴 좌표 찾기가 심사 중인 후보(securedOrder)의 좌표도 본다', () => {
        const at = src.indexOf('const coordOf');
        expect(at).toBeGreaterThan(0);
        const block = src.slice(at, at + 500);
        expect(block).toContain('securedOrder');
    });
});
