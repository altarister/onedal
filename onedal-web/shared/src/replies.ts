import type { OpsBoardIntel } from './ops';

/**
 * 📦 **서버 응답 · 소켓 알림의 모양 — 한 곳** (공통 함수 6 · `sharedReplies` 검사).
 * 서버는 보내는 자리에서 이 이름을 붙이고(`const body: XxxReply = …`), 받는 화면(관제웹 · 운영센터 · 운행일지)은 이것을 가져온다.
 * 따로 적으면 서버가 칸 이름을 바꿔도 양쪽 tsc 가 못 잡아 화면이 조용히 빈다.
 */

// ── 콜 흐름 통계(GET /api/stats/flows · /flows/admin) ─────────────────

/** 한 칸의 합 — 평균은 요금을 아는 콜(fareCalls)로만, 하나도 모르면 null */
export interface FlowSum { calls: number; fareCalls: number; fareFirstAvg: number | null; fareLastAvg: number | null; /** 아는 km 의 평균(소수 한 자리) — 모르면 null · 나중에 더한 칸이라 읽는 쪽은 없을 수도 있게 */ kmAvg?: number | null }

/** 기사가 보는 칸 — 내 것 · 모두(남이 3명 넘게 섞였을 때만) */
export interface FlowsViewerCell {
    group: string; targetApp: string; from: string; to: string;
    mine: FlowSum | null;
    all: (FlowSum & { drivers: number }) | null;
    /** 남이 섞였지만 3명이 안 돼 합계를 가렸다 — 화면은 «표본 적음» */
    fewOthers: boolean;
}
export interface FlowsViewerReply { from: string; to: string; groupBy: string; days: string[]; cells: FlowsViewerCell[] }

/** 관리자가 보는 칸 — 기사별 · 합은 콜이 있을 때만 */
export type FlowsAdminCell = { group: string; targetApp: string; from: string; to: string; userId: string; drivers: number } & Partial<FlowSum>;
export interface FlowsAdminReply { from: string; to: string; groupBy: string; cells: FlowsAdminCell[] }

// ── 관제웹 소켓 알림 ────────────────────────────────────────────

/** emergency-alert — 앱폰 비상 보고 */
export interface EmergencyAlert {
    deviceId: string;
    orderId: string;
    reason: string;
    screenContext: string;
    /** 화면 글자 앞 300자 — 없으면 없음 */
    screenText?: string;
    timestamp: string;
}

/** safecancel-warning — 안전취소 시간이 되도록 결재가 없다 */
export interface SafeCancelWarning {
    orderId: string;
    deviceId: string;
    pickup: string;
    dropoff: string;
    message: string;
    timestamp: string;
}

/** filter-pass-alarm — 알람 모드 폰이 필터를 통과한 콜을 봤다 */
export interface FilterPassAlarm {
    deviceId: string;
    deviceName?: string;
    /** 이번 스캔에서 필터를 통과한 콜 수 — 목록에 보이는 수(띠의 «필터 통과 N건») */
    passed: number;
    /** 그중 새로 알람감이 된 콜 수 — 소리는 이것으로 가른다(서버) */
    passedNew?: number;
    /** 소리 없는 띠 — 앱이 못 연 까닭이 «손 필요»로 바뀌었을 때만 온다 */
    silent?: boolean;
    /** 이번 스캔에서 판정한 콜 수 */
    seen: number;
    /** 🚧 통과 콜이 있는데 원달앱이 안 연 까닭 열쇠 — 없으면 앱이 열었다 (shared `openBlockedSayOf`) */
    openBlocked?: string;
    at: number;
}

// ── 원장(GET /api/sim/intel · 개발 빌드 · 관제웹 현황판 «버린 콜») ──────────

/** 운영센터 현황판(OpsBoardIntel)과 같은 줄 · 총수 + 개발 문의 표식 둘 */
export type SimIntelReply = OpsBoardIntel & { ok: true; limit: number };

// ── 서버 상태(GET /api/health · 로그인 없이) ────────────────────────

export interface HealthReply { ok: boolean; now: number; bootedAt: string; live: boolean; uptimeSec: number; uptimeText: string }

// ── 운행일지 ─────────────────────────────────────────────────────

/** GET /api/logbook/filter-days — 하루 성과 한 줄 */
export interface FilterDayRow {
    day: string;
    revenue: number;
    calls: number;
    cancels: Record<string, number>;
    colors: Record<string, number>;
    settings: Record<string, { destinationCity?: string; pickupRadiusKm?: number;
        detourAllowKm?: number; dropoffRadiusKm?: number; discountPct?: number }>;
}
export interface FilterDaysReply { days: FilterDayRow[] }

/** GET /api/logbook/analytics/summary */
export interface SummaryMetrics {
    todayRevenue: number;
    todayDistanceKm: number;
    todayEfficiency: number;        // 원/km
    monthRevenue: number;
    monthDistanceKm: number;
    monthEfficiency: number;
    unpaidTotal: number;
    todayOrderCount: number;
    monthOrderCount: number;
}

/** GET /api/logbook/places/hotspots */
export interface HotspotPlace {
    id: number;
    addressDetail: string;
    customerName: string;
    region: string;
    visitCount: number;
    lastVisitedAt: string | null;
}
export interface BlacklistedPlace {
    id: number;
    addressDetail: string;
    customerName: string;
    rating: number;
    blacklistMemo: string | null;
}
export interface PlaceInsights {
    hotspots: HotspotPlace[];
    blacklisted: BlacklistedPlace[];
}
