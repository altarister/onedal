import { readFileSync } from "fs";
import { join } from "path";
import { evaluateArrivalTick, GPS_ARRIVAL } from "../../src/services/geoService";

/**
 * 🔴 도착 감지 재설계 규칙 (2026-08-17 — docs/도착감지_재설계_계획.md)
 *
 * 실측 사고가 배경이다: 마지막 하차지 1곳만 보던 감지가 멈춤 조건이 없어
 * 500m 안에서 **1초에 4연발**했고, 매번 filter 재계산까지 딸려 왔다.
 */

const SRC = join(__dirname, "../../src");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('도착 판정 한 틱 — 순수 함수 (L2)', () => {
    const R = GPS_ARRIVAL.RADIUS_KM;

    it('반경 밖이면 절대 발화하지 않고 정지 유지도 끊는다', () => {
        const r = evaluateArrivalTick(1000, R + 0.1, 3, 'browser', 100_000);
        expect(r.fire).toBe(false);
        expect(r.heldSinceMs).toBeNull();
    });

    it('시뮬(mock)은 근접만으로 발화한다 — 15배속엔 정지가 없다', () => {
        expect(evaluateArrivalTick(null, R - 0.1, 300, 'mock', 0).fire).toBe(true);
    });

    it('🔴 실 GPS 는 통과(고속)로는 발화하지 않는다 — 정거장 옆 도로는 누구나 지나간다', () => {
        const r = evaluateArrivalTick(null, R - 0.1, 30, 'browser', 0);
        expect(r.fire).toBe(false);
        expect(r.heldSinceMs).toBeNull();
    });

    it('실 GPS 정지 첫 틱 — 유지 시작만 하고 발화는 안 한다', () => {
        const r = evaluateArrivalTick(null, R - 0.1, 2, 'browser', 50_000);
        expect(r.fire).toBe(false);
        expect(r.heldSinceMs).toBe(50_000);
    });

    it(`실 GPS 정지 ${GPS_ARRIVAL.HOLD_SEC}초 유지 → 발화`, () => {
        const since = 50_000;
        const now = since + GPS_ARRIVAL.HOLD_SEC * 1000;
        expect(evaluateArrivalTick(since, R - 0.1, 2, 'browser', now - 1).fire).toBe(false);
        expect(evaluateArrivalTick(since, R - 0.1, 2, 'browser', now).fire).toBe(true);
    });

    it('🔴 속도를 모르면(null) 정지로 치지 않는다 — 없는 숫자를 지어내지 않는다', () => {
        const r = evaluateArrivalTick(null, R - 0.1, null, 'browser', 0);
        expect(r.fire).toBe(false);
        expect(r.heldSinceMs).toBeNull();
    });
});

describe('감시 구조 (L1 — 코드 모양)', () => {
    const geo = codeOnly(read('services/geoService.ts'));
    const sock = codeOnly(read('socket/socketHandlers.ts'));

    it('🔴 감시는 "발화 안 된 다음 정거장 하나"뿐이다', () => {
        expect(geo).toMatch(/stops\.find\(st => !session\.arrivalFired\.has/);
    });

    it('🔴 정거장 목록은 routeComposer 의 planArrivalStops 에서만 온다 — 감시가 자기 순서를 만들지 않는다', () => {
        expect(geo).toMatch(/planArrivalStops\(active, gps\)/);
        expect(geo).not.toMatch(/getLastDropoffCoord\(session\)[\s\S]{0,200}UNLOADING/);   // 옛 방식의 부활 금지
    });

    it('🔴 한 번 찍으면 멈춘다 — 4연발의 해답', () => {
        expect(geo).toMatch(/session\.arrivalFired\.add\(key\)/);
    });

    it('🔴 점프 틱은 도착을 판단하지 않는다 (정지 유지도 끊는다)', () => {
        const fn = geo.slice(geo.indexOf('function watchArrival'));
        const guard = fn.slice(0, fn.indexOf('planArrivalStops'));
        expect(guard).toMatch(/if \(jumped\)/);
        expect(guard).toMatch(/heldSinceMs = null/);
    });

    it("🔴 GPS 가 기록하는 마일스톤은 ARRIVED_* 둘뿐 — 상차·하차 완료는 물리 행위다", () => {
        // 'GPS' 출처로 reportMilestone 을 부르는 자리는 socketHandlers 한 곳이고,
        // 그 마일스톤은 stopType 삼항으로 ARRIVED_ 둘 중 하나만 나온다
        expect(sock).toMatch(/stopType === 'pickup' \? 'ARRIVED_PICKUP' as const : 'ARRIVED_DROPOFF' as const/);
        const gpsCalls = sock.match(/'GPS'/g) ?? [];
        expect(gpsCalls.length).toBe(1);
        expect(sock).not.toMatch(/'PICKED_UP'[^\n]*'GPS'|'GPS'[^\n]*'PICKED_UP'/);
    });

    it('사이클이 끝나면 도착 상태도 지운다 — 어제 찍은 정거장이 오늘 되살아나지 않는다', () => {
        const fm = codeOnly(read('state/filterManager.ts'));
        expect(fm).toMatch(/arrivalFired\.clear\(\)/);
        expect(fm).toMatch(/arrivalNoticed\.clear\(\)/);
    });

    it('근접 예고도 정거장당 1회다', () => {
        expect(geo).toMatch(/session\.arrivalNoticed\.has\(key\)/);
        expect(geo).toMatch(/session\.arrivalNoticed\.add\(key\)/);
    });
});
