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
     * 🔴 **2026-09-03 재개정 — «상차 완료는 자동으로 안 찍는다»가 폐기됐다.**
     *
     * 기사님: *"운전중에 그걸 누르는건 너무 위험하다. 실 업무를 진행하면 도착을 못 읽는
     * 경우가 있을 거야 … 지나온 목적지를 벗어나면 도착과 상차완료를 순차적으로 종료시켜
     * 주는 것이 맞을 것 같다."* → *"이 명제는 이제 유효하지 않다 삭제하는 것이 맞아.
     * **지나가면 실었다가 맞아.**"*
     *
     * 근거가 «도착 + 이탈»에서 **«지나침»**으로 바뀌었다. 도착(500m + 정지 30초)은 안 서고
     * 지나치면 아예 안 찍히는데, 실 업무에서는 그게 흔하다 — 그러면 사슬이 첫 칸부터 멈춘다.
     * 지나침은 도착과 무관하게 혼자 서고, 상차·하차 **둘 다** 찍는다.
     */
    it('🔴 GPS 가 찍는 것 — 도착 둘 · 하차완료 · 그리고 지나침이 찍는 도착·완료', () => {
        // 도착 둘은 stopType 삼항으로만 나온다 — ARRIVED_* 밖으로 샐 길이 없다
        expect(sock).toMatch(/stopType === 'pickup' \? 'ARRIVED_PICKUP' as const : 'ARRIVED_DROPOFF' as const/);
        expect(sock).toMatch(/bridgeMilestone\(uid, stop\.orderId, milestone, 'GPS'/);

        // 하차 완료는 **떠남 감지가 있을 때만** 열린다 — 근거 없이 찍으면 안 된다
        expect(sock).toMatch(/reportMilestone\(uid, orderId, 'DELIVERED', 'GPS'/);
        expect(geo).toMatch(/DEPARTED_KM/);
        expect(geo).toMatch(/onDeparted/);
    });

    /**
     * 🚚 **지나침 판정** (기사님 확정 2026-09-03) — 거리 둘은 판정 기준 탭에서 고친다.
     */
    it('지나침은 상차·하차 둘 다 «도착 → 완료» 순서로 찍는다', () => {
        expect(geo).toMatch(/evaluatePassTick/);
        expect(geo).toMatch(/onPassed/);
        // 순서가 곧 규칙이다 — 도착이 먼저다 (역행은 reportMilestone 이 거른다)
        expect(sock).toMatch(/\[arrived, done\]/);
        expect(sock).toMatch(/'ARRIVED_PICKUP' as const : 'ARRIVED_DROPOFF' as const;\s*\n\s*const done/);
        expect(sock).toMatch(/'PICKED_UP' as const : 'DELIVERED' as const/);
    });

    /**
     * 🔴 **2026-09-03 실측으로 메운 구멍** — 진입(300m) 등록은 «다음 정거장»을 볼 때만
     * 일어나는데, 도착이 먼저 찍히면 그 정거장은 그 순간 «다녀온 곳»이 되어 **등록 기회를
     * 영영 잃는다.** 시뮬은 500m 근접만으로 도착이 찍히므로 늘 그렇게 된다 —
     * 실측 12:34~12:36 에 상차지 도착 3건이 다 찍혔는데 지나침은 **한 번도 안 걸렸다.**
     */
    it('도착이 찍힌 정거장도 지나침 감시에 들어간다 — 아니면 완료를 영영 못 찍는다', () => {
        const i = geo.indexOf("🏁 [도착 감지]");
        expect(i).toBeGreaterThan(-1);
        // 도착 발화 뒤에 passWatch 등록이 있어야 한다 (stopType 을 안 가린다)
        const after = geo.slice(i, i + 2000);
        expect(after).toMatch(/passWatch\.set/);
        // 하차 전용 가지(departWatch) 안이 아니라 **밖**이어야 한다
        const dropIdx = after.indexOf("next.stopType === 'dropoff'");
        const passIdx = after.indexOf('passWatch.set');
        expect(passIdx).toBeGreaterThan(dropIdx);
        expect(after.slice(dropIdx, passIdx)).toMatch(/\n\s*\}/);   // 가지가 닫힌 뒤다
    });

    /**
     * 🔴 **도착 반경(500m)이 진입(300m)보다 넓다** — 도착만으로 «들어왔다»로 치면
     * 450m 에서 도착한 콜이 **다음 틱에 400m 이탈**로 곧바로 완료가 된다. 짐을 싣기도 전에.
     * (2026-09-03 코드 리뷰가 잡았다 — 단위 검사는 순수 함수만 봐서 통과했고, 그 규칙을
     *  어긴 것은 **부르는 쪽**이었다.)
     */
    it('도착만으로는 «진입»으로 치지 않는다 — entered 를 지금 거리로 적는다', () => {
        const i = geo.indexOf('passWatch.set');
        const j = geo.indexOf('passWatch.set', i + 1);
        expect(j).toBeGreaterThan(-1);              // 등록 자리가 둘이다 (진입 · 도착)
        // 도착 쪽 등록은 거리를 재서 entered 를 정한다 — true 로 박지 않는다
        const arrivalReg = geo.slice(j - 600, j + 400);
        expect(arrivalReg).toMatch(/entered:\s*distKm\s*<=/);
    });

    it('🔴 지나침 거리는 코드에 안 박는다 — 판정 기준(DB)에서 온다 (규칙 ③)', () => {
        const geoCode = codeOnly(geo);
        // 300·400 같은 리터럴이 아니라 설정에서 읽어야 한다
        expect(geoCode).toMatch(/judgment\?\.pass|DEFAULT_JUDGMENT\.pass/);
        expect(geoCode).not.toMatch(/nearM:\s*\d|awayM:\s*\d/);
    });

    it('🔴 통화 단계는 지나침이 안 찍는다 — 안 한 통화를 했다고 적으면 화면이 거짓말한다', () => {
        const i = sock.indexOf('auto-passed');
        const block = sock.slice(Math.max(0, i - 2000), i);
        expect(block).not.toMatch(/'CALLED_PICKUP'|'CALLED_DROPOFF'/);
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
