import { readFileSync } from 'fs';
import { join } from 'path';
import { deriveRouteTimeline, pickBindingDeparture } from '@onedal/shared';

/**
 * 🗺️ **시각의 원천은 "지금 경로" 하나다** (기사님 동의 2026-08-19)
 *
 * 실측 사고 두 건이 이 함수의 존재 이유다:
 *   ① 합짐 콜의 도착시각이 안 나왔다 — 합짐은 kakaoSolo·approach 가 아예 계산되지
 *      않아 콜별 파생(deriveCallTiming)의 사슬이 끊겼다
 *   ② 카운트다운이 첫짐만 봤다 — 합짐은 출발 마감이 null 이라 후보에서 조용히 빠졌다
 *
 * 콜마다 "혼자 간다"고 가정하지 않고, 서버가 내려준 경로 순서(routeStops) 위에서
 * 주행·정차를 **순서대로 누적**해 정거장마다 도착예상·약속·출발마감을 만든다.
 *
 *   ⑴ 도착예상 = 기준시각 + 누적주행 + 앞 정거장 정차 합
 *   ⑵ 약속: 통화 확정 > 경로 추정(도착예상 + 여유 30분) > 콜별 파생 폴백
 *   ⑶ 출발마감 = 약속 − (누적주행 + 앞 정거장 정차 합)
 *
 * 기준시각은 경로를 **계산한 시점**(routeComputedAt)이다 — nowMs 로 하면 추정 약속이
 * 매초 미래로 밀려 카운트다운이 영원히 "30분 남음"에 머문다.
 */
const NOW = Date.parse('2026-08-19T04:00:00Z');
const COMPUTED = '2026-08-19T04:00:00Z';

// 경로: 현위치 →⑴ A상차(12분) →⑵ B상차(20분) →⑶ B하차(60분) →⑷ A하차(90분)
const stops = (over: object = {}) => ([
    { orderId: 'A', stopType: 'pickup',  driveMinutes: 12 },
    { orderId: 'B', stopType: 'pickup',  driveMinutes: 20 },
    { orderId: 'B', stopType: 'dropoff', driveMinutes: 60 },
    { orderId: 'A', stopType: 'dropoff', driveMinutes: 90 },
] as any).map((s: any) => ({ ...s, ...over }));

// 합짐 B 는 실제 사고 그대로 — kakaoSolo·approach 가 없다
const orders = [
    // ⏱️ 배송 120분 — 시한 캡(상차 캡 04:55 · 하차 시한 07:10)이 이 검사들의 어떤 추정
    //    약속도 물지 않는 여유. 캡 자체의 검증은 timelineDeadlineCap.test 가 한다
    { id: 'A', capturedAt: '2026-08-19T03:50:00Z', kakaoSoloDurationMin: 120, approachDurationMin: 12 },
    { id: 'B', capturedAt: '2026-08-19T03:58:00Z', kakaoSoloDurationMin: null, approachDurationMin: null },
] as any;

const noReports = (_id: string) => [] as any;
const noMilestones = (_id: string) => [] as any;

const run = (st = stops(), reportsOf: (id: string) => any = noReports) =>
    deriveRouteTimeline(st, orders, reportsOf, noMilestones, NOW, COMPUTED);

describe('deriveRouteTimeline — 경로 위에서 누적한다', () => {
    it('🔴 합짐(B)도 시각이 나온다 — 콜별 단독값이 없어도 경로가 알고 있다', () => {
        const tl = run();
        const bDrop = tl.find(e => e.orderId === 'B' && e.stopType === 'dropoff')!;
        expect(bDrop.etaMs).not.toBeNull();
        expect(bDrop.promisedUntil).not.toBeNull();
        expect(bDrop.departByMs).not.toBeNull();
    });

    it('정차가 순서대로 누적된다 — 뒤 정거장 도착예상에 앞 정거장 정차가 들어간다', () => {
        const tl = run();
        // 신고가 없으니 정차는 차종 추정 — 값 자체보다 **누적되는 구조**를 본다
        const [p1, p2, d1] = [tl[0], tl[1], tl[2]];
        expect(p2.etaMs! - p1.etaMs!).toBe((20 - 12 + p1.dwellMinutes) * 60_000);
        expect(d1.etaMs! - p2.etaMs!).toBe((60 - 20 + p2.dwellMinutes) * 60_000);
    });

    it('추정 약속 = 도착예상 + 여유 30분, 확정 아님 표시', () => {
        const tl = run();
        const p1 = tl[0];
        expect(Date.parse(p1.promisedUntil!)).toBe(p1.etaMs! + 30 * 60_000);
        expect(p1.promiseConfirmed).toBe(false);
    });

    it('통화로 확정한 약속이 추정을 이긴다', () => {
        const ARRIVE = '2026-08-19T05:30:00.000Z';
        const reportsOf = (id: string) => id === 'B'
            ? [{ stopType: 'dropoff', kind: 'DECLARED', promisedArrivalAt: ARRIVE }] as any
            : [];
        const tl = run(stops(), reportsOf);
        const bDrop = tl.find(e => e.orderId === 'B' && e.stopType === 'dropoff')!;
        expect(bDrop.promisedUntil).toBe(ARRIVE);
        expect(bDrop.promiseConfirmed).toBe(true);
    });

    it('출발마감 = 약속 − (누적주행 + 앞 정차 합)', () => {
        const tl = run();
        const p2 = tl[1];
        expect(p2.departByMs).toBe(
            Date.parse(p2.promisedUntil!) - (20 + tl[0].dwellMinutes) * 60_000);
    });

    it('주행분이 null 이면 도착예상을 지어내지 않고 콜별 파생으로 폴백한다 (규칙 ④)', () => {
        const tl = run(stops({ driveMinutes: null }));
        const aPick = tl.find(e => e.orderId === 'A' && e.stopType === 'pickup')!;
        expect(aPick.etaMs).toBeNull();
        // A 는 접근 주행이 있어 콜별 파생(잡은 시각 + 접근 + 30)이 나온다
        expect(aPick.promisedUntil).toBe('2026-08-19T04:32:00.000Z');
    });

    it('경로에 없는 콜의 정거장은 만들지 않는다', () => {
        const tl = deriveRouteTimeline(
            [{ orderId: '유령', stopType: 'pickup', driveMinutes: 5 }] as any,
            orders, noReports, noMilestones, NOW, COMPUTED);
        expect(tl).toEqual([]);
    });
});

describe('pickBindingDeparture — 어떤 콜이건 가장 빨리 나가야 하는 것', () => {
    it('🔴 합짐의 출발마감이 첫짐보다 이르면 합짐이 기준이 된다', () => {
        // 실측 사고: 카운트다운이 첫짐(1:20:57)만 보고 있었다
        const ARRIVE = '2026-08-19T04:40:00.000Z';   // B 상차를 빡빡하게 확정
        const reportsOf = (id: string) => id === 'B'
            ? [{ stopType: 'pickup', kind: 'DECLARED', promisedArrivalAt: ARRIVE }] as any
            : [];
        const tl = run(stops(), reportsOf);
        const binding = pickBindingDeparture(tl)!;
        expect(binding.orderId).toBe('B');
        expect(binding.stopType).toBe('pickup');
    });

    it('하차 약속도 출발을 묶는다 — 상차만 보지 않는다', () => {
        const ARRIVE = '2026-08-19T04:50:00.000Z';   // B 하차(주행 60분)를 빡빡하게
        const reportsOf = (id: string) => id === 'B'
            ? [{ stopType: 'dropoff', kind: 'DECLARED', promisedArrivalAt: ARRIVE }] as any
            : [];
        const binding = pickBindingDeparture(run(stops(), reportsOf))!;
        expect(binding.stopType).toBe('dropoff');
    });

    it('출발마감이 없는 정거장뿐이면 null', () => {
        expect(pickBindingDeparture([])).toBeNull();
    });
});

/**
 * 🧾 **왜 그 시각인지 내역이 함께 나온다** (기사님 실측 2026-08-19)
 *
 * 기사님: *"콜 잡은 시간 17:14:44, 상차지 디폴트값 18:00 이면 대략 46분 후 출발해야
 * 합니다 이렇게 나와야 하는데.. 30분 정도로 노출되는 것 같아. 예전 코드인 거야
 * 아님 안 바뀐 거야?"*
 *
 * 30분이 **맞았다** — `출발마감 = 약속 18:00 − 접근 주행 15분 = 17:45`. 46분은 주행을
 * 빼지 않은 값이다. 그런데 화면이 그 15분을 **어디에도 안 적어서** 기사님은 계산을
 * 확인할 방법이 없었고, "예전 코드인가"를 의심하셨다.
 *
 * 🔴 이건 계산 버그가 아니라 **근거 누락**이다. 폴백 경로(콜별 파생)는 내역을 적는데
 *    타임라인 경로는 `driveMin: null` 로 넣어 내역 줄이 통째로 사라졌다 — 정작
 *    지금 돌고 있는 건 타임라인 쪽이다.
 *
 * → 타임라인이 이미 쓰고 있는 누적 주행분을 **결과에 실어** 내보낸다 (규칙 ③ —
 *   화면이 다시 계산하면 두 벌이 된다).
 */
describe('출발마감의 내역 — 주행분이 결과에 실린다', () => {
    it('🔴 정거장마다 그 시각을 만든 누적 주행분이 함께 나온다', () => {
        const tl = run(stops());
        expect(tl.map(e => e.driveMinutes)).toEqual([12, 20, 60, 90]);
    });

    it('주행분을 모르면 null — 지어내지 않는다 (규칙 ④)', () => {
        const tl = run(stops({ driveMinutes: null }));
        expect(tl.every(e => e.driveMinutes === null)).toBe(true);
    });

    it('🔴 출발마감 = 약속 − (주행 + 앞 정차) — 내역이 그 뺄셈과 맞는다', () => {
        const ARRIVE = '2026-08-19T04:40:00.000Z';   // A 상차 확정 04:40
        const reportsOf = (id: string) => id === 'A'
            ? [{ stopType: 'pickup', kind: 'DECLARED', promisedArrivalAt: ARRIVE }] as any
            : [];
        const b = pickBindingDeparture(run(stops(), reportsOf))!;
        expect(b.driveMinutes).toBe(12);
        // 첫 정거장이므로 앞 정차는 0 — 04:40 − 12분 = 04:28
        expect(new Date(b.departByMs!).toISOString()).toBe('2026-08-19T04:28:00.000Z');
    });

    it('🔴 화면이 그 값을 그대로 적는다 — 다시 계산하지 않는다 (규칙 ③)', () => {
        const c = readFileSync(join(__dirname,
            '../../../client-app/src/components/dashboard/DepartureCountdown.tsx'), 'utf8');
        expect(c).toMatch(/binding\.driveMinutes/);
        expect(c).toMatch(/binding\.leadMinutes/);
        // 타임라인 분기에서 내역이 비어 있던 옛 모양이 남아 있으면 안 된다
        expect(c).not.toMatch(/driveMin: null/);
    });
});
