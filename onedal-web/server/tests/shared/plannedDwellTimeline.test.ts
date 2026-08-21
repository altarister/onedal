import { recordsOfSteps, deriveRouteTimeline } from '@onedal/shared';

/**
 * ⏱️ **정차의 입력도 한 곳이다 — 계획 짐값(차종 기본값)을 타임라인도 먹는다**
 * (2026-08-21 리허설 13~16 실측)
 *
 * 서버 시딩(stepSeeder)은 KEEP 때 미리 눌러 둔 **계획 신고**(라면박스 5 · 수작업 ·
 * 결박 = 상차 6분)를 정차로 세는데, 관제웹 타임라인은 `recordsOfSteps` 가
 * PLANNED 행을 통째로 버려서 **미확인 15분**으로 갈랐다. 그래서 한 화면에서:
 *
 *   덱 줄   진위면 ~15:46   ← 완료 13:51(15분) + 77×1.5
 *   칩      데드라인 15:37  ← 완료 13:42(6분)  + 77×1.5
 *   경유버퍼 +29분~          ← 서버 약속 − 클라 예상 (서로 다른 정차의 뺄셈)
 *
 * 규칙 ③: **파생값을 만들었으면 그 입력도 한 곳에서 만든다.** 같은 사고 클래스
 * 4번째다 (경유 4벌 · 상태목록 3벌 · 시별칭 · 이제 정차 2벌).
 *
 * 🔴 단, 계획 행의 `promised_arrival_at` 은 서버의 **추정**이지 통화가 아니다 —
 *    DECLARED 로 내보내면 굳은 약속으로 오독된다 (안 깎는 규칙이 걸린다).
 *    그래서 kind 'PLANNED' 로 **짐값만** 나가고, 약속·확정 표시는 안 나간다.
 */

const ANCHOR = '2026-08-21T03:38:00Z';          // KST 12:38 — 리허설 13번의 아침
const NOW = Date.parse(ANCHOR);
const kst = (ms: number) => new Date(ms).toLocaleTimeString('ko-KR',
    { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });

// 리허설 13 의 모형 — 접근 58 · 단독 77 · KEEP 이 계획 신고(차종 기본값 6분)를 심었다
const steps = [{
    step: 'CALL_PICKUP', born: true,
    row: {
        status: 'PLANNED',
        planned_unit: '라면박스', planned_quantity: 5,
        planned_handling: '수작업', planned_protections: '["결박"]',
        planned_source: '차종 기본값',
        // 서버의 추정 약속 — 통화가 아니다. DECLARED 약속으로 새 나가면 안 된다
        promised_arrival_at: '2026-08-21T04:38:27.000Z',
    },
}] as any;

const stops = [
    { orderId: 'R13', stopType: 'pickup', driveMinutes: 58 },
    { orderId: 'R13', stopType: 'dropoff', driveMinutes: 135 },
] as any;
const orders = [{
    id: 'R13', capturedAt: ANCHOR,
    totalDurationMin: 135, kakaoSoloDurationMin: 77,
}] as any;

const records = () => recordsOfSteps(steps);
const run = () => deriveRouteTimeline(stops, orders,
    () => records().reports as any, () => records().milestones as any, NOW, ANCHOR);

describe('계획 짐값 → 타임라인 정차 (규칙 ③ — 입력 한 곳)', () => {
    it('🔴 recordsOfSteps 는 PLANNED 행의 짐값을 kind PLANNED 로 내보낸다', () => {
        const r = records().reports.find((x: any) => x.stopType === 'pickup');
        expect(r).toBeDefined();
        expect((r as any).kind).toBe('PLANNED');
        expect((r as any).quantity).toBe(5);
        // 🔴 추정 약속은 안 나간다 — 통화 약속(DECLARED)으로 오독되는 길을 막는다
        expect((r as any).promisedArrivalAt).toBeUndefined();
    });

    it('🔴 데드라인이 계획 정차 6분 기산 — 15:37 (미확인 15분이면 15:46 으로 갈라진다)', () => {
        const d = run().find(e => e.stopType === 'dropoff')!;
        // 상차 약속 13:36(캡 바닥) + 계획 정차 6분 = 완료 13:42 · + 77×1.5 = 15:37:30
        expect(kst(Date.parse(d.promisedUntil!))).toBe('15:37');
    });

    it('계획 신고는 통화가 아니다 — promiseConfirmed 는 여전히 false', () => {
        const p = run().find(e => e.stopType === 'pickup')!;
        expect(p.promiseConfirmed).toBe(false);
        // 상차 추정 약속도 그대로 — max(도착 예상 13:36, 시계 13:08) = 13:36
        expect(kst(Date.parse(p.promisedUntil!))).toBe('13:36');
    });

    it('통화(DECLARED)가 오면 계획(PLANNED)을 이긴다 — 정차 우선순위', () => {
        const withCall = [...steps.map((s: any) => ({ ...s, row: { ...s.row } })),] as any;
        withCall[0].row.status = 'DONE';        // 통화 완료 — 이제 DECLARED 로 나간다
        const r = recordsOfSteps(withCall).reports.find((x: any) => x.stopType === 'pickup');
        expect((r as any).kind).toBe('DECLARED');
    });
});
