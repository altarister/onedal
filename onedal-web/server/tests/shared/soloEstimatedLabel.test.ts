import { deriveCallTiming, DEFAULT_DEADLINE_RULES } from '@onedal/shared';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🚚 **배송 주행이 «실측인가 어림인가»를 화면이 말한다** (B단계 · 기사님 확정 2026-09-01)
 *
 * 하차 마감은 `상차 완료 + 배송 주행 × 150%` 다. 그러니 **이 값이 곧 마감의 근거**이고,
 * 마감은 기사님이 *"독촉 전화가 오면 카카오를 근거로 대응"* 하시는 값이다.
 * 어림으로 선 마감과 실측으로 선 마감은 **전화에서 할 말이 다르다.**
 *
 * 규칙 ⑤-2 는 모르는 값을 일반값으로 계산하는 것을 허락하되 조건을 걸었다 —
 * *"화면에 «미확인»이라고 함께 적으므로 숫자가 거짓말을 하지 않는다. **표시 없이 값만 쓰면
 * 위반이다.**"* 그래서 계산이 «추정»을 알고 있으면 화면까지 그 사실이 가야 한다.
 */
const NOW = Date.parse('2026-09-01T09:00:00+09:00');
const order = (over: object = {}) => ({
    id: 'A', capturedAt: new Date(NOW).toISOString(),
    pickup: '경기 광주시 초월읍', dropoff: '경기 이천시 신둔면',
    ...over,
}) as any;

describe('soloEstimated — 계산이 «어림임»을 숨기지 않는다', () => {
    it('🔴 카카오 실측이 있으면 추정이 아니다 (A단계가 채우는 값)', () => {
        const t = deriveCallTiming(
            order({ kakaoSoloDurationMin: 42, kakaoSoloDistanceKm: 33.5, deliveryDistance: 30 }),
            [], [], NOW, DEFAULT_DEADLINE_RULES);
        expect(t.soloMinutes).toBe(42);
        expect(t.soloKm).toBe(33.5);
        expect(t.soloEstimated).toBe(false);
    });

    it('🔴 배송거리만 있으면 환산값이고 «추정»이다', () => {
        const t = deriveCallTiming(order({ deliveryDistance: 30 }), [], [], NOW, DEFAULT_DEADLINE_RULES);
        expect(t.soloMinutes).toBeGreaterThan(0);
        expect(t.soloEstimated).toBe(true);
    });

    it('아무것도 없으면 분을 지어내지 않는다 (규칙 ④)', () => {
        const t = deriveCallTiming(order(), [], [], NOW, DEFAULT_DEADLINE_RULES);
        expect(t.soloMinutes).toBeNull();
        expect(t.soloEstimated).toBe(false);   // 어림조차 못 냈다 — «추정»이라 말할 값도 없다
    });

    it('🔴 실측이 추정을 이긴다 — 배송거리가 더 크게 나와도 실측이 남는다', () => {
        const t = deriveCallTiming(
            order({ kakaoSoloDurationMin: 42, kakaoSoloDistanceKm: 33.5, deliveryDistance: 200 }),
            [], [], NOW, DEFAULT_DEADLINE_RULES);
        expect(t.soloMinutes).toBe(42);
        expect(t.soloEstimated).toBe(false);
    });
});

/**
 * 🔒 **화면이 실제로 말하는지 자리로 지킨다.** 값만 만들어 두고 안 그리면 규칙 ⑤-2 위반이
 * 조용히 성립한다 — 이 레포가 «만들고 나중에 노출한다»로 여러 번 당한 형태다.
 */
describe('규칙: 콜 카드가 실측/추정과 하차 마감을 접지 않고 보여 준다', () => {
    const card = readFileSync(
        join(__dirname, '../../../client-app/src/components/dashboard/PinnedRouteCard.tsx'), 'utf8');
    /** 주석은 뺀다 — 사고 이력이 «코드에 있다»로 오독되면 안 된다 */
    const codeOnly = card.split('\n').filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');

    it('🔴 «실측»과 «추정»을 소리 내어 적는다', () => {
        expect(codeOnly).toMatch(/soloEstimated \? '\(추정\)' : '\(실측\)'/);
    });

    it('🔴 하차 마감을 카드에 적는다', () => {
        expect(codeOnly).toMatch(/timing\.dropoffDeadlineAt/);
    });

    it('🔴 판정 근거 서랍(details) 안으로 접어 넣지 않는다', () => {
        const line = codeOnly.indexOf('🚚 배송 주행');
        const drawer = codeOnly.indexOf('판정 근거 · 원본 데이터');
        expect(line).toBeGreaterThan(0);
        expect(line).toBeLessThan(drawer);   // 서랍보다 앞 = 펼치지 않아도 보인다
    });
});
