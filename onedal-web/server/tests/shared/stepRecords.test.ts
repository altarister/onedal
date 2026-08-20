import { recordsOfSteps } from '@onedal/shared';

/**
 * 🔄 **파생 치환 ① — 카운트다운·타임라인이 새 장부를 읽는다** (기사님 승인 2026-08-21)
 *
 * `deriveRouteTimeline`·`deriveCallStep` 은 옛 장부 모양(통화신고·마일스톤)을 먹는다.
 * 그 계산은 검사로 두껍게 덮여 있으니 건드리지 않고, **새 장부(여섯 단계 행)를
 * 옛 모양으로 바꿔 주는 어댑터** 하나만 세운다. 읽는 곳의 재료 출처만 바뀐다.
 *
 * 🔴 약속 규칙이 그대로 건너가야 한다:
 *   · 통화 완료(DONE) 약속      → 확정 (DECLARED) — 출발 마감을 묶는다
 *   · 통화 건너뜀(SKIPPED) 약속 → 추정 그대로 — *"난 그런 결정을 내릴 권한이 없어"*
 *   · PLANNED (아직 안 함)      → 기록 없음 — 타임라인이 추정 약속을 만든다
 */

const view = (step: string, row: Record<string, any>, born = true) =>
    ({ step, table: '', label: '', born, row });

describe('recordsOfSteps — 단계 행을 옛 장부 모양으로', () => {
    it('🔴 통화 완료 → DECLARED 신고 (약속·짐 그대로)', () => {
        const { reports } = recordsOfSteps([view('CALL_PICKUP', {
            status: 'DONE', promised_arrival_at: '2026-08-21T08:02:00Z',
            promised_arrival_from_at: '2026-08-21T07:32:00Z',
            planned_unit: '파레트', planned_quantity: 2, planned_handling: '지게차',
            planned_protections: '["결박"]',
        })]);
        expect(reports).toHaveLength(1);
        expect(reports[0]).toMatchObject({
            stopType: 'pickup', kind: 'DECLARED',
            unit: '파레트', quantity: 2, handling: '지게차',
            promisedArrivalAt: '2026-08-21T08:02:00Z',
            promisedArrivalFromAt: '2026-08-21T07:32:00Z',
            protections: ['결박'],
        });
    });

    it('🔴 통화 건너뜀 → SKIPPED — 확정 약속이 아니다 (출발 마감을 묶으면 안 된다)', () => {
        const { reports } = recordsOfSteps([view('CALL_PICKUP', {
            status: 'SKIPPED', promised_arrival_at: '2026-08-21T08:02:00Z',
        })]);
        expect(reports[0].kind).toBe('SKIPPED');
    });

    it('PLANNED 는 기록이 아니다 — 아직 안 한 일', () => {
        const { reports, milestones } = recordsOfSteps([
            view('CALL_PICKUP', { status: 'PLANNED', promised_arrival_at: '2026-08-21T08:02:00Z' }),
            view('ARRIVE_PICKUP', { status: 'PLANNED' }),
        ]);
        expect(reports).toHaveLength(0);
        expect(milestones).toHaveLength(0);
    });

    it('🔴 상차 완료의 실측 → ACTUAL 신고 — 정차 계산에서 계획을 이긴다', () => {
        const { reports } = recordsOfSteps([view('LOADED', {
            status: 'DONE', occurred_at: '2026-08-21T08:10:00Z', source: 'MANUAL_WEB',
            actual_unit: '라면박스', actual_quantity: 40, actual_handling: '수작업',
        })]);
        expect(reports.find(r => r.kind === 'ACTUAL')).toMatchObject({
            stopType: 'pickup', unit: '라면박스', quantity: 40, handling: '수작업',
        });
    });

    it('🔴 도착·완료 행 → 마일스톤 (시각·출처 그대로 — GPS/SKIPPED 삼분 보존)', () => {
        const { milestones } = recordsOfSteps([
            view('ARRIVE_PICKUP', { status: 'DONE', occurred_at: '2026-08-21T08:05:00Z', source: 'GPS' }),
            view('LOADED', { status: 'SKIPPED', occurred_at: '2026-08-21T08:10:00Z', source: 'SKIPPED' }),
            view('ARRIVE_DROPOFF', { status: 'DONE', occurred_at: '2026-08-21T09:00:00Z', source: 'MANUAL_WEB' }),
        ]);
        expect(milestones).toEqual([
            { milestone: 'ARRIVED_PICKUP', occurredAt: '2026-08-21T08:05:00Z', source: 'GPS' },
            { milestone: 'PICKED_UP', occurredAt: '2026-08-21T08:10:00Z', source: 'SKIPPED' },
            { milestone: 'ARRIVED_DROPOFF', occurredAt: '2026-08-21T09:00:00Z', source: 'MANUAL_WEB' },
        ]);
    });

    it('안 태어난 단계(회색 예정)는 통째로 무시한다', () => {
        const { reports, milestones } = recordsOfSteps([
            view('CALL_DROPOFF', { status: 'PLANNED', promised_arrival_at: 'x' }, false),
        ]);
        expect(reports).toHaveLength(0);
        expect(milestones).toHaveLength(0);
    });
});
