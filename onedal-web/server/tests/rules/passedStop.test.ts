import { evaluatePassTick } from "../../src/services/geoService";

/**
 * 🚚 **지나치면 도착·완료를 대신 찍는다** (기사님 확정 2026-09-03)
 *
 * 기사님: *"운전중에 그걸 누르는건 너무 위험하다. 실 업무를 진행하면 도착을 못 읽는
 * 경우가 있을 거야. 그래서 지금 지나온 목적지를 200m 벗어나면 도착과 상차완료를
 * 순차적으로 종료시켜 주는 것이 맞을 것 같다."* (거리는 300m 진입 · 400m 이탈로 확정)
 *
 * 🔴 **«상차·하차 완료는 절대 자동으로 찍지 않는다»는 이제 폐기됐다** (기사님 확정 2026-09-03:
 *    *"이 명제는 이제 유효하지 않다 삭제하는 것이 맞아. 지나가면 실었다가 맞아."*).
 *    2026-08-25 에 하차만 풀었던 예외를 **상차까지** 넓힌 것이다.
 *
 * ── 왜 도착 감지로는 부족한가 ──
 * 도착은 «500m + 정지 30초»다. 실 업무에서는 안 서고 지나치는 일이 흔하고, 그러면
 * 사슬이 **첫 칸부터 시작을 못 한다** — 도착이 없으니 떠남 감시도 안 걸린다.
 * 그래서 이 판정은 **도착이 찍혔든 아니든** 혼자 선다.
 */
describe('🚚 지나침 판정 — 순수 함수', () => {
    const NEAR = 0.3;   // 진입 300m
    const AWAY = 0.4;   // 이탈 400m

    it('멀리 있으면 아무 일도 없다', () => {
        const r = evaluatePassTick(1.2, NEAR, AWAY, false);
        expect(r.entered).toBe(false);
        expect(r.passed).toBe(false);
    });

    it('300m 안에 들어오면 «그 앞을 지났다»고 표시만 한다 — 아직 찍지 않는다', () => {
        const r = evaluatePassTick(0.25, NEAR, AWAY, false);
        expect(r.entered).toBe(true);
        expect(r.passed).toBe(false);
    });

    it('🔴 들어온 적이 있고 400m 밖으로 나가면 «지나왔다» — 여기서 도착·완료를 찍는다', () => {
        const r = evaluatePassTick(0.45, NEAR, AWAY, true);
        expect(r.passed).toBe(true);
    });

    it('🔴 들어온 적이 **없으면** 아무리 멀어도 안 찍는다 — 그냥 스쳐 간 남의 정거장이다', () => {
        const r = evaluatePassTick(9.9, NEAR, AWAY, false);
        expect(r.passed).toBe(false);
        expect(r.entered).toBe(false);
    });

    it('들어온 뒤 300~400m 사이는 아직 아니다 — 되돌아올 수 있다', () => {
        const r = evaluatePassTick(0.35, NEAR, AWAY, true);
        expect(r.passed).toBe(false);
        expect(r.entered).toBe(true);   // 표시는 유지된다
    });

    it('경계값 — 진입은 이하, 이탈은 이상에서 참이다', () => {
        expect(evaluatePassTick(NEAR, NEAR, AWAY, false).entered).toBe(true);
        expect(evaluatePassTick(AWAY, NEAR, AWAY, true).passed).toBe(true);
    });

    /** 🔴 두 값이 뒤집혀 설정되면(이탈 ≤ 진입) 들어오자마자 찍힌다 — 그건 막는다 */
    it('이탈 거리가 진입보다 작거나 같으면 절대 안 찍는다 (설정 사고 방어)', () => {
        expect(evaluatePassTick(0.3, 0.4, 0.3, true).passed).toBe(false);
        expect(evaluatePassTick(0.3, 0.3, 0.3, true).passed).toBe(false);
    });
});
