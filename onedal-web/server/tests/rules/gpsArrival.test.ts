import { readFileSync } from "fs";
import { join } from "path";
import { evaluateArrivalTick, GPS_ARRIVAL } from "../../src/services/geoService";

/**
 * 🔴 도착 감지 규칙 (근거: docs/기록/결정_이력.md «도착은 GPS 가 찍는다»)
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

    /**
     * 🔴 **2026-08-25 개정** — 하차 완료(DELIVERED)를 GPS 가 찍을 수 있게 열었다.
     *
     * 기사님: *"곤지암과 부발에서 멀어진 거면 하차를 했는데 버튼을 못 누른 걸로 봐야 하지
     * 않을까… 운행 중에 클릭 못 할 거라 말이지."*
     *
     * 근거는 **«도착 + 2km 이탈»이라는 물리적 사실**이다. 안 내렸으면 그 자리를 뜨지 않는다.
     * 실측(2026-08-25): GPS 도착 3건이 다 찍혔는데 손으로 눌러야 하는 네 단계가 전부 비어
     * 적재가 90박스로 남았고, 다음 콜이 차종에서 막혔다.
     *
     * ⚠️ **상차 완료(PICKED_UP)는 여전히 금지다.** 상차지는 짐을 실었는지를 GPS 가 구분할
     *    수 없다 — 못 실었는데 실은 것으로 치면 적재가 거짓이 된다. 하차와 대칭이 아니다.
     */
    it("🔴 GPS 가 찍는 것은 ARRIVED_* 둘과 DELIVERED 뿐 — 상차 완료는 여전히 물리 행위다", () => {
        // 도착 둘은 stopType 삼항으로만 나온다 — ARRIVED_* 밖으로 샐 길이 없다
        expect(sock).toMatch(/stopType === 'pickup' \? 'ARRIVED_PICKUP' as const : 'ARRIVED_DROPOFF' as const/);
        expect(sock).toMatch(/bridgeMilestone\(uid, stop\.orderId, milestone, 'GPS'/);

        // 🔴 상차 완료는 절대 GPS 로 찍지 않는다
        expect(sock).not.toMatch(/'PICKED_UP'[^\n]*'GPS'|'GPS'[^\n]*'PICKED_UP'/);

        // 하차 완료는 **떠남 감지가 있을 때만** 열린다 — 근거 없이 찍으면 안 된다
        expect(sock).toMatch(/reportMilestone\(uid, orderId, 'DELIVERED', 'GPS'/);
        expect(geo).toMatch(/DEPARTED_KM/);
        expect(geo).toMatch(/onDeparted/);

        // 'GPS' 출처는 네 자리뿐이다 — 도착(report+bridge) 둘, 하차완료(report+bridge) 둘.
        // 늘어나면 "이것도 GPS 가 알 수 있는 일인가"를 다시 묻게 된다
        const gpsCalls = sock.match(/'GPS'/g) ?? [];
        expect(gpsCalls.length).toBe(4);
    });

    it('🚚 떠남은 하차지에서만 본다 — 상차지는 감시하지 않는다', () => {
        // departWatch 에 넣는 자리가 dropoff 가지 안에 있어야 한다
        const i = geo.indexOf("next.stopType === 'dropoff'");
        expect(i).toBeGreaterThan(-1);
        expect(geo.slice(i, i + 400)).toMatch(/departWatch\.set/);
        // 되돌아와도 다시 안 걸린다 — 한 번 발화하면 지운다
        expect(geo).toMatch(/departWatch\.delete/);
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
