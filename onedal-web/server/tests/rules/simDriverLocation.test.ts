import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 📍 **시뮬 문제지는 «지금 현위치»에서 거리를 잰다** (기사님 확정 2026-08-31)
 *
 * 기사님: *"문제를 낼 때 지금 현위치와 얼마 떨어져 있는지 직선거리로 확인하고 출제한다,
 * 뭐 그런 거야?"* — 그렇다.
 *
 * ── 무엇이 문제였나 ──
 * 콜 화면의 «현위치 ➔ 상차지 N KM» 은 앱 1차 필터의 **상차 반경 축이 먹는 입력**이다
 * (`InsungParser` 의 `distances[0]`). 시뮬은 그 값을 계산하고는 있었는데, 기준이 되는
 * 기사 좌표가 **URL 로 한 번 고른 뒤 움직이지 않는 고정값**(기본 `127.2553,37.4095`)이었다.
 *
 * 실측(0831 16:54): 적요는 «7.2km»(고정 좌표 기준)인데 실제 현위치에서는 **11.4km** 였고,
 * 같은 상차지가 다른 판에서는 22.4km 로 찍혔다. **필터는 정직하게 굴렀고 거짓말을 한 것은
 * 문제지다** — 그래서 책상 판에서 상차 반경 축은 사실상 채점되지 않고 있었다.
 *
 * 실제 인성은 배차망 서버가 그 거리를 매번 계산해 화면에 띄운다. 시뮬도 같아야 한다.
 *
 * ⚠️ **딸려 오는 것**: 정답표가 «어디서 시작했느냐»에 따라 달라진다. 7지점 채점은
 *    **집에서 시작하는 판** 기준이다 (docs/지금/폰_테스트.md 에 못박아 뒀다).
 */
const SIM = join(__dirname, '../../../../onedal-sim');
const read = (rel: string) => readFileSync(join(SIM, rel), 'utf8');

describe('시뮬 — 현위치를 따라간다', () => {
    it('🔴 서버에 «지금 어디»를 묻고 기사 좌표를 갱신한다', () => {
        const ctx = read('packages/ui-simulators/src/context/SimulationContext.tsx');
        expect(ctx).toMatch(/\/api\/sim\/driver-location/);
        expect(ctx).toMatch(/setDriverLocation\(/);
    });

    it('🔴 서버가 없어도 시뮬은 돈다 — 못 받으면 있던 좌표를 쓴다', () => {
        const ctx = read('packages/ui-simulators/src/context/SimulationContext.tsx');
        const eff = ctx.slice(ctx.indexOf('/api/sim/driver-location'));
        expect(eff.slice(0, 600)).toMatch(/catch/);
    });

    it('거리는 그 좌표에서 잰다 — 문제지에 숫자를 박지 않는다', () => {
        const gen = read('packages/core-simulator/src/generator.ts');
        expect(gen).toMatch(/const pickupDistanceKm = calculateDistanceKm\(driverCoord, pickupCoord\)/);
    });
});

/**
 * 🔴 **기사님의 실시간 위치는 운영에서 열지 않는다.**
 * 2026-08-09 에 무인증 `GET /api/scrap` 을 «정찰 정보 노출»로 지웠다 — 위치는 그보다 민감하다.
 * 시뮬레이터가 없는 곳에는 이 문도 없어야 한다 (앱의 `import.meta.env.DEV` 와 같은 원칙).
 */
describe('시뮬 전용 문 — 개발 빌드에서만 열린다', () => {
    const route = readFileSync(join(__dirname, '../../src/routes/sim.ts'), 'utf8');

    it('🔴 운영에서는 404', () => {
        expect(route).toMatch(/process\.env\.NODE_ENV !== "production"/);
        expect(route).toMatch(/return res\.status\(404\)/);
    });

    it('🔴 세션이 여럿이면 아무 것도 고르지 않는다 (누구 위치인지 모르는 값을 내주지 않는다)', () => {
        expect(route).toMatch(/userIds\.length !== 1/);
    });

    it('🔴 «내 주소로 메운 값»인지 함께 밝힌다 (규칙 ⑤-2 — 추정은 추정이라 말한다)', () => {
        expect(route).toMatch(/isFallback/);
    });
});
