import { readFileSync } from "fs";
import { join } from "path";
import { evaluateArrivalTick, GPS_ARRIVAL } from "../../src/services/geoService";

/**
 * 🔴 도착 감지 규칙
 *
 * 한 정거장은 한 번만 찍는다 — 멈춤 조건이 없으면 500m 안에서 **1초에 여러 번** 발화하고
 * (실측 4연발), 매번 필터 재계산까지 딸려 온다.
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

    /**
     * 🔴 **모의 좌표도 «서면 도착»이다** — 모의 주행이 정거장에서 정차 연기(`stopped`)를 한다.
     *    근접만으로 찍으면 모의 차가 빠르게 달리는 중에 도착이 찍혀 시트가 올라왔다가 주행 신호에 1초 만에 내려간다.
     *    실 GPS 는 도착 때 이미 서 있다 — 모의도 같은 순서여야 시트 마중이 시험된다. 30초는 안 기다린다(정차 12초).
     */
    it('🔴 시뮬(mock)은 반경 안이어도 달리는 틱에는 발화하지 않는다', () => {
        expect(evaluateArrivalTick(null, R - 0.1, 300, 'mock', 0, false).fire).toBe(false);
        expect(evaluateArrivalTick(null, R - 0.1, 300, 'mock', 0).fire).toBe(false);
    });
    it('시뮬(mock)은 반경 안에서 서 있다(정차 연기)고 오면 곧바로 발화한다', () => {
        expect(evaluateArrivalTick(null, R - 0.1, 0, 'mock', 0, true).fire).toBe(true);
        expect(evaluateArrivalTick(null, R + 0.1, 0, 'mock', 0, true).fire).toBe(false);
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
    /* 감시 쪽(도착 · 떠남 · 지나침 · 근접 예고)은 geoRules 가 GPS 틱을 넣어 동작으로 문다 — 여기서는 소켓이 무엇을 찍나 */
    const sock = codeOnly(read('socket/socketHandlers.ts'));

    /**
     * 🔴 **GPS 가 하차 완료(DELIVERED)와, 지나친 정거장의 도착·완료를 찍는다** (기사님 확정).
     *
     * 기사님: *"곤지암과 부발에서 멀어진 거면 하차를 했는데 버튼을 못 누른 걸로 봐야 하지
     * 않을까… 운행 중에 클릭 못 할 거라 말이지."*
     *
     * 하차 완료의 근거는 **«도착 + 2km 이탈»이라는 물리적 사실**이다. 안 내렸으면 그 자리를 뜨지 않는다.
     * GPS 가 안 찍으면 손으로 눌러야 하는 단계가 비어 적재가 남고, 다음 콜이 차종에서 막힌다.
     *
     * 기사님: *"운전중에 그걸 누르는건 너무 위험하다. 실 업무를 진행하면 도착을 못 읽는
     * 경우가 있을 거야 … 지나온 목적지를 벗어나면 도착과 상차완료를 순차적으로 종료시켜
     * 주는 것이 맞을 것 같다."* · *"**지나가면 실었다가 맞아.**"*
     *
     * 지나침의 근거는 **«지나침»** 그 자체다. 도착(500m + 정지 30초)은 안 서고
     * 지나치면 아예 안 찍히는데, 실 업무에서는 그게 흔하다 — 그러면 사슬이 첫 칸부터 멈춘다.
     * 지나침은 도착과 무관하게 혼자 서고, 상차·하차 **둘 다** 찍는다.
     */
    it('🔴 GPS 가 찍는 것 — 도착 둘 · 하차완료 · 그리고 지나침이 찍는 도착·완료', () => {
        // 도착 둘은 stopType 삼항으로만 나온다 — ARRIVED_* 밖으로 샐 길이 없다
        expect(sock).toMatch(/stopType === 'pickup' \? 'ARRIVED_PICKUP' as const : 'ARRIVED_DROPOFF' as const/);
        expect(sock).toMatch(/bridgeMilestone\(uid, stop\.orderId, milestone, 'GPS'/);

        // 하차 완료는 **떠남 감지가 있을 때만** 열린다 — 근거 없이 찍으면 안 된다
        expect(sock).toMatch(/reportMilestone\(uid, orderId, 'DELIVERED', 'GPS'/);
    });

    /**
     * 🚚 **지나침 판정** (기사님 확정) — 거리 둘은 판정 기준 탭에서 고친다.
     */
    it('지나침은 상차·하차 둘 다 «도착 → 완료» 순서로 찍는다', () => {
        // 순서가 곧 규칙이다 — 도착이 먼저다 (역행은 reportMilestone 이 거른다)
        expect(sock).toMatch(/\[arrived, done\]/);
        expect(sock).toMatch(/'ARRIVED_PICKUP' as const : 'ARRIVED_DROPOFF' as const;\s*\n\s*const done/);
        expect(sock).toMatch(/'PICKED_UP' as const : 'DELIVERED' as const/);
    });

    it('🔴 통화 단계는 지나침이 안 찍는다 — 안 한 통화를 했다고 적으면 화면이 거짓말한다', () => {
        const i = sock.indexOf('auto-passed');
        const block = sock.slice(Math.max(0, i - 2000), i);
        expect(block).not.toMatch(/'CALLED_PICKUP'|'CALLED_DROPOFF'/);
    });

    it('사이클이 끝나면 도착 상태도 지운다 — 어제 찍은 정거장이 오늘 되살아나지 않는다', () => {
        const fm = codeOnly(read('state/filterManager.ts'));
        expect(fm).toMatch(/arrivalFired\.clear\(\)/);
        expect(fm).toMatch(/arrivalNoticed\.clear\(\)/);
    });
});
