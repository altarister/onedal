import type { CargoReport } from '@onedal/shared';

/**
 * 🔄 콜별 기록의 화면 모양 — **재료는 여섯 단계 행 하나다**.
 *
 * 이 파일에는 **모양(타입)과 빈 값만** 있다. 채우는 것은 `useStepRecords`(steps-synced) 뿐이다.
 */
export interface MilestoneRow { milestone: string; occurredAt: string; predictedAt?: string; source?: string; reasons?: string[] }
/** ⏱️ 정거장마다 예측·실측 정차(분) — 없으면 null (규칙 ④). 원천은 `dwellLedgerOfSteps` */
export interface DwellPair { planned: number | null; actual: number | null }
export interface DwellLedger { pickup: DwellPair; dropoff: DwellPair }
export interface CallRecords { reports: CargoReport[]; milestones: MilestoneRow[]; dwell: DwellLedger }

const NO_DWELL: DwellPair = { planned: null, actual: null };
export const EMPTY_RECORDS: CallRecords = {
    reports: [], milestones: [], dwell: { pickup: NO_DWELL, dropoff: NO_DWELL },
};
