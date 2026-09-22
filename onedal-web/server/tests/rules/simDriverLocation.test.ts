import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 📍 **시뮬 문제지는 «지금 현위치»에서 거리를 잰다** (기사님 확정)
 *
 * 기사님: *"문제를 낼 때 지금 현위치와 얼마 떨어져 있는지 직선거리로 확인하고 출제한다,
 * 뭐 그런 거야?"* — 그렇다.
 *
 * ── 왜 «지금 현위치»인가 ──
 * 콜 화면의 «현위치 ➔ 상차지 N KM» 은 앱 1차 필터의 **상차 반경 축이 먹는 입력**이다
 * (`InsungParser` 의 `distances[0]`). 기준이 되는 기사 좌표를 URL 로 한 번 고른 **고정값**으로 두면
 * 적요는 «7.2km»(고정 좌표 기준)인데 실제 현위치에서는 **11.4km** 인 일이 난다 (실측).
 * **필터는 정직하게 굴러도 거짓말을 하는 것은 문제지다** — 상차 반경 축이 사실상 채점되지 않는다.
 *
 * 실제 인성은 배차망 서버가 그 거리를 매번 계산해 화면에 띄운다. 시뮬도 같아야 한다.
 *
 * ⚠️ **딸려 오는 것**: 정답표가 «어디서 시작했느냐»에 따라 달라진다. 7지점 채점은
 *    **집에서 시작하는 시험** 기준이다.
 */
const SIM = join(__dirname, '../../../../onedal-sim');
const read = (rel: string) => readFileSync(join(SIM, rel), 'utf8');
/** 주석은 뺀다 — 설명 문장이 «코드에 있다»로 오독되면 안 된다 */
const codeOnly = (src: string) =>
    src.split('\n').filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');

describe('시뮬 — 현위치를 따라간다', () => {
    it('🔴 서버에 «지금 어디»를 묻고 기사 좌표를 갱신한다', () => {
        const ctx = read('packages/ui-simulators/src/context/SimulationContext.tsx');
        expect(ctx).toMatch(/\/api\/sim\/driver-location/);
        expect(ctx).toMatch(/setDriverLocation\(/);
    });

    it('🔴 서버가 못 답하면 폰 GPS 로 넘어간다 (필드에서는 라이브 서버 문이 닫혀 있다)', () => {
        const ctx = codeOnly(read('packages/ui-simulators/src/context/SimulationContext.tsx'));
        expect(ctx).toMatch(/catch \{[\s\S]{0,40}\}\s*\n?\s*fromPhone\(\)/);
        expect(ctx).toMatch(/navigator\.geolocation\.getCurrentPosition/);
    });

    it('🔴 폰 GPS 도 실패하면 있던 좌표를 쓴다 — 시뮬은 어떤 경우에도 돈다', () => {
        const ctx = codeOnly(read('packages/ui-simulators/src/context/SimulationContext.tsx'));
        const fn = ctx.slice(ctx.indexOf('const fromPhone')).slice(0, 500);
        // 성공 경로에서만 좌표를 바꾼다 — 실패 콜백은 아무것도 안 한다
        expect((fn.match(/apply\(/g) ?? []).length).toBe(1);
    });

    it('🔴 시뮬레이터 앱이 웹뷰의 위치 요청을 허락한다 (APK 권한 · 0831 신설)', () => {
        const app = join(__dirname, '../../../../onedal-app/simulator-app/src/main');
        expect(readFileSync(join(app, 'AndroidManifest.xml'), 'utf8'))
            .toMatch(/ACCESS_FINE_LOCATION/);
        const act = readFileSync(join(app, 'java/com/onedal/simulator/MainActivity.kt'), 'utf8');
        expect(act).toMatch(/setGeolocationEnabled\(true\)/);
        expect(act).toMatch(/onGeolocationPermissionsShowPrompt/);
    });

    it('거리는 그 좌표에서 잰다 — 문제지에 숫자를 박지 않는다', () => {
        const gen = read('packages/core-simulator/src/generator.ts');
        expect(gen).toMatch(/const pickupDistanceKm = calculateDistanceKm\(driverCoord, pickupCoord\)/);
    });
});

/**
 * 🔴 **기사님의 실시간 위치는 운영에서 열지 않는다.**
 * 위치는 무인증 문으로 내줄 수 없는 정보다 — 콜 정보보다 민감하다.
 * 시뮬레이터가 없는 곳에는 이 문도 없어야 한다 (앱의 `import.meta.env.DEV` 와 같은 원칙).
 */
describe('시뮬 전용 문 — 개발 빌드에서만 열린다', () => {
    const route = readFileSync(join(__dirname, '../../src/routes/sim.ts'), 'utf8');

    it('🔴 운영에서는 404', () => {
        // 🔴 «라이브인가»를 혼자 판정하지 않는다 — 레포의 두 신호 판정(isLiveServer)을 쓴다.
        //    NODE_ENV 하나만 보면 그 설정이 빠진 날 조용히 열린다
        expect(route).toMatch(/isLiveServer\(\)/);
        expect(route).not.toMatch(/process\.env\.NODE_ENV/);
        expect(route).toMatch(/return res\.status\(404\)/);
    });

    it('🔴 세션이 여럿이면 아무 것도 고르지 않는다 (누구 위치인지 모르는 값을 내주지 않는다)', () => {
        expect(route).toMatch(/userIds\.length !== 1/);
    });

    it('🔴 «내 주소로 메운 값»인지 함께 밝힌다 (규칙 ⑤-2 — 추정은 추정이라 말한다)', () => {
        expect(route).toMatch(/isFallback/);
    });
});
