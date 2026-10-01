// @ts-nocheck
import { readFileSync } from 'fs';
import { join } from 'path';
import { OrderEvaluator } from '../../src/core/engine/OrderEvaluator';

/**
 * 💸 **첫짐 하한은 «원달앱이 이미 걸렀나»로 가른다 — 배차망이 아니라** (reviews/34 3단계 5① · 기사님 «가» · onedal-69 «가»).
 *    원달앱은 세 배차망 모두 목록 판정에서 같은 최소 금액(FareFloor.passes)으로 거르고, 통과한 콜만 원달앱이 눌러 연다(openedByApp).
 *    손으로 연 콜은 원달앱 목록 판정을 안 거친다 — 배차망 상관없이 서버가 하한을 센다.
 *    전엔 «픽커만 건너뜀»이라 손으로 연 픽커 콜은 최소 금액 밑이어도 통과했다(노이즈).
 */
const filter = { dispatchPhase: 'STANDBY', minFare: 20000, excludedKeywords: [] };
const run = (app: string, extra: Record<string, unknown>) => {
    const reasons: string[] = [], pros: string[] = [];
    new OrderEvaluator(app).runStage1ShapeFilter({ pickup: '경기 광주시 경안동', dropoff: '서울 용산구 한남동', fare: 8000, ...extra }, filter, reasons, pros);
    return { reasons, pros };
};
const FLOOR = /첫짐 절대하한가 미달/;

describe('💸 첫짐 하한 — 원달앱이 걸렀나', () => {
    it('🔴 손으로 연 픽커 콜 · 최소 금액 밑 → «첫짐 하한 미달»', () => {
        expect(run('kakaopicker', {}).reasons.some(r => FLOOR.test(r))).toBe(true);
    });
    it('🔴 원달앱이 연 콜(openedByApp) → 다시 안 센다 — 세 배차망 같은 사실로', () => {
        for (const app of ['insung', 'hwamul24', 'kakaopicker']) {
            const out = run(app, { openedByApp: true });
            expect([app, out.reasons.some(r => FLOOR.test(r))]).toEqual([app, false]);
            expect(out.pros).toContain('요금은 앱이 이미 걸렀다 (최소 금액)');
        }
    });
    it('손으로 연 인성 · 화물24시 콜은 지금처럼 센다', () => {
        for (const app of ['insung', 'hwamul24']) expect([app, run(app, { openedByApp: false }).reasons.some(r => FLOOR.test(r))]).toEqual([app, true]);
    });
    it('🔴 판정기에 배차망 이름으로 가르는 갈래가 없다', () => {
        const src = readFileSync(join(__dirname, '../../src/core/engine/OrderEvaluator.ts'), 'utf8');
        expect(src).not.toMatch(/targetApp === ['"]/);
    });
});
