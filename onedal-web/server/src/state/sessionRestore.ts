/**
 * ♻️ **세션 되살리기** — 서버를 다시 띄운 뒤 첫 접속 · 상세 보고 때 장부(DB)의 콜 · 궤적 · 다녀온 정거장 · 마지막 위치를 세션에 되살리고 국면을 다시 세운다(한 번만).
 * 🔴 이 파일은 마일스톤(services/milestones)을 가져오지 않는다 — 방향: sessionRestore · milestones → dispatchEngine(결재 · 경로 재계산).
 * 바깥 일을 하는 함수: bootstrapUserSession · bootstrapOnce · hydrateVisitedStops · restoreAndRecalculateSession(세션 · 장부(DB) · 단계 장부 · 궤적 저장 · 카카오 · 설정 · 지금 시각 · 소켓 · 로그) (콜 한 줄 · 다녀온 정거장 · 마지막 점 셈 restoredOrderFrom · visitedStopsFrom · restoredFixFrom 은 값만 받는다)
 */
import { businessDayKey, restoreWhere, deriveDispatchPhase, RESTORABLE_STATUSES, IN_PROGRESS_STATUSES, UNFINISHED_RESTORE_BUSINESS_DAYS, restoreWindow } from "@onedal/shared";
import { isHeldReserved } from "../services/reservedOrders";
import type { MyOrder } from "@onedal/shared";
import { calculateSoloRoute } from "../services/kakaoService";
import { getUserSession, type UserSession } from "./userSessionStore";
import { rememberOrder } from "./orderMemory";
import { updateActiveFilter } from "./filterManager";
import { originOf, lastKnownPositionOf } from "../services/geoMotion";
import { composeMergedRoute, planMergedStops, parseSectionEnds, parseSectionStops, pickRouteHolder, toKm, toMin, hasVisitedStop, parsePolyline } from "../services/routeComposer";
import { logRoadmapEvent } from "../utils/roadmapLogger";
import db from "../db";
import { OrderRepository } from "../repositories/OrderRepository";
import { lastTrackPointOf } from "../services/gpsTrackStore";
import { SettingsRepository } from "../repositories/SettingsRepository";
import { getActiveCalls } from "../core/activeCalls";
import { buildOrderSync, filterVersionOf } from "../core/helpers";
import { stepRecordsOf } from "../services/stepSeeder";
import { slog } from "../utils/fileLogger";
import { clockText } from "@onedal/shared";
import { applyRouteAndSave, applySoloRouteAndSave, lastSyncLogSig, promiseOrderOpts, rebuildDestinationKeywords } from "../services/dispatchEngine";

/**
 * 로그인·소켓 접속 시 실행되는 **단일 부트스트랩 시퀀스**.
 *
 * 이 과정을 여러 곳에 흩으면 복구를 기다리지 않고 filter-init 이 먼저 나가
 *   ① 앱폰이 1~3초간 "첫짐 필터(경유 없음)"를 받아 경로 이탈 콜을 잡을 수 있고
 *   ② 관제탑이 첫짐 → 합짐으로 깜빡이며
 *   ③ destinationKeywords 를 여러 곳이 각자 만들어 진실 공급원이 없어진다.
 *
 * 그래서 아래 순서를 한 함수가 책임진다. **⑥ 이전에는 앱폰에 콜 잡기를 시키지 않는다.**
 *
 *   ① 세션 확보    DB에서 baseFilter 로드 (지리 연산 없음)
 *   ② 데이터 로드   오늘의 활성 콜 복구 → myOrders
 *   ③ 노선 산출    카카오 Solo / Detour+TSP → routePolyline
 *   ④ 상태 파생    dispatchPhase · allowedVehicleTypes · isSharedMode
 *   ⑤ 경유 도출    폴리라인 기준(활성 콜 있음) 또는 destinationCity 기준(없음)
 *   ⑥ 필터 확정    activeFilter 완성 → 관제탑 filter-init 1회 + 앱폰 콜 잡기 재개
 */
/**
 * ⏳ **되살리기는 기사마다 한 번 · 도는 중에 부른 쪽은 끝날 때까지 기다린다** — 관제웹 접속과 /detail(재시작 직후 판정 전)이 겹쳐도
 *    두 번 돌지 않고, /detail 은 되살린 잡은 콜로 판정한다.
 */
const bootstrapRuns = new Map<string, Promise<void>>();

export function bootstrapUserSession(userId: string, io: any): Promise<void> {
    const running = bootstrapRuns.get(userId);
    if (running) return running;
    if (getUserSession(userId).isRestored) return Promise.resolve();
    const run = bootstrapOnce(userId, io).finally(() => bootstrapRuns.delete(userId));
    bootstrapRuns.set(userId, run);
    return run;
}

async function bootstrapOnce(userId: string, io: any): Promise<void> {
    const session = getUserSession(userId);          // ① (지리 연산 없이 baseFilter 만)
    if (session.isRestored || session.isBootstrapping) return;

    session.isBootstrapping = true;                  // 이 순간부터 앱폰은 isActive=false 를 받는다
    const t0 = Date.now();
    logRoadmapEvent('부팅', "서버", "[Bootstrap] 시작 — 필터 확정 전까지 앱폰 콜 잡기 일시 정지");

    try {
        /**
         * 브라우저 GPS 가 안 잡히면 접근 구간(현위치 → 상차지)을 계산할 수 없어
         * 통화에서 "몇 시까지 갈 수 있다"를 말할 수가 없다.
         * 그럴 때 **사용자 설정의 '내 주소'** 로 메운다.
         *
         * 주소·좌표를 코드에 박지 않는다 — 설정의 주소는 지오코딩까지 되어 있고,
         * 이사하면 설정만 바꾸면 된다.
         *
         * **GPS 가 들어오면 그 값이 언제나 이긴다** (dashboard-gps-update).
         * 추정으로 계산했다는 사실은 `originIsFallbackLEGACY` 으로 숨기지 않는다.
         */

        /**
         * 📍 **«내가 어디 있었나»도 되살린다**.
         *
         * ── 왜 ──
         * 세션의 `lastFix` 는 **메모리에만 산다.** 18:56 에 이천에서 주행이 끝나고
         * 20:11 에 서버가 다시 뜨자 «좌표를 한 번도 받은 적 없는» 상태가 됐고,
         * PC 지도의 「현위치」가 **광주 초월읍(집)** 을 가리켰다 — 차는 이천에 있는데.
         * **점은 `gps_tracks` 에 그대로 있었다** (「칸은 있는데 안 읽는다」 · 이 레포의 단골).
         *
         * 🔴 **경로 기점은 이걸로 안 바뀐다.** `originOf` 는 5분 문턱을 그대로 보므로
         *    낡은 좌표면 여전히 집을 고른다 (여주 4시간 25분 사고 방어).
         *    되살리는 것은 **«내가 어디 있나»의 답**이고, 그건 지도·그물이 읽는다.
         * ⚠️ 영업일 밖 점은 `lastTrackPointOf` 가 안 준다 — 어제 자리가 오늘 살아나지 않는다.
         */
        const lastPt = lastTrackPointOf(userId);
        /* 🔴 «이미 아는 자리가 있나»도 **파생 함수로 묻는다** — 원자료(`lastFix`)를 직접
           읽으면 «기점은 `originOf` 로만 읽는다» 규칙과 구분이 안 된다 (그 검사가 잡았다) */
        if (lastPt && !lastKnownPositionOf(session)) {
            Object.assign(session, restoredFixFrom(lastPt));
            slog('부팅', `📍 [위치 복구] ${clockText(lastPt.atMs)} 의 마지막 점 — `
                + `${lastPt.x.toFixed(5)}, ${lastPt.y.toFixed(5)} (출처 ${lastPt.source})`);
        }

        await restoreAndRecalculateSession(userId, io);   // ②③④ (DB 로드 → 카카오 노선 → 상태 파생)
        rebuildDestinationKeywords(userId, io);           // ⑤ (활성 콜 유무로 경유/도시 분기)
    } catch (err) {
        console.error("🚨 [Bootstrap] 실패:", err);
    } finally {
        // ⑥ 성공하든 실패하든 반드시 잠금을 푼다. 여기서 막히면 콜 잡기가 영영 멈춘다.
        session.isBootstrapping = false;
    }

    const f = session.activeFilter;
    slog('부팅', `✅ [Bootstrap 완료] ${Date.now() - t0}ms | phase=${f.dispatchPhase} 합짐=${f.isSharedMode} ` +
        `차종=${(f.allowedVehicleTypes || []).length}종 키워드=${(f.destinationKeywords || []).length}개`);
    logRoadmapEvent('부팅', "서버", `[Bootstrap] 완료 (${Date.now() - t0}ms) — 관제탑에 확정 필터 1회 전송, 앱폰 콜 잡기 재개`);

    if (io) io.to(userId).emit("filter-init", filterInitOf(session));
}

/** 📤 관제웹 filter-init 한 벌 — 확정 필터 두 벌 + «하루 복구 실패» (보내는 세 자리가 같은 모양) */
export function filterInitOf(session: UserSession) {
    return {
        activeFilter: session.activeFilter,
        baseFilter: session.baseFilter,
        restoreFailed: session.restoreFailedAt !== null,
    };
}

/** 📍 궤적의 마지막 점으로 되살리는 «내가 어디 있나» — 값만 받는 셈 (마지막 점) */
export function restoredFixFrom(lastPt: { x: number; y: number; atMs: number; source?: string | null }):
    Pick<UserSession, 'lastFix' | 'lastFixAt' | 'lastFixIsMock' | 'lastFixSource'> & { mockGpsOwner?: UserSession['mockGpsOwner'] } {
    return {
        lastFix: { x: lastPt.x, y: lastPt.y },
        lastFixAt: lastPt.atMs,
        lastFixIsMock: lastPt.source === 'mock',
        lastFixSource: (lastPt.source as 'gps' | 'mock' | 'manual') ?? 'gps',
        /**
         * 🎭 **모의 좌표면 «임자»도 그 시각으로 함께 되살린다** (기사님 확정).
         *
         * 🔴 **안 되살리면 «내가 어디 있나»가 한 순간에 두 답을 낸다.** `originOf` ③ 은
         *    모의 좌표를 «콜을 쥐었거나 모의 주행이 돌 때만» 믿는데, 그 «돌고 있나»가
         *    메모리에만 사는 `mockGpsOwner` 다. 서버가 다시 뜨면 그 칸만 비어,
         *    **같은 좌표를 복구해 놓고 첫 목록은 집 주소로 만든다.**
         *    실측: 부트스트랩이 집 기준 상차 10곳·하차 26곳을
         *    «확정 필터»로 관제웹에 보낸 19ms 뒤, 모의 GPS 가 들어오자 이천 기준
         *    9곳·19곳으로 다시 만들었다. 관제웹은 둘을 겹쳐 받아 **영역은 집 둘레,
         *    점은 이천**이 되었다 — 기사님: *"녹색원이 저리 작은데 이천시 근처에
         *    보라 점이 찍힌다는것이 틀린거지."*
         * 🔴 **시각은 지어내지 않는다** — 그 점을 받은 시각(`atMs`)을 그대로 쓴다.
         *    그래서 5초 넘게 묵은 점이면 `mockRunning` 이 여전히 거짓이고 집 주소로 간다
         *    («멈춘 뒤 남은 모의 좌표»를 믿지 않는 원래 방어는 그대로다).
         */
        ...(lastPt.source === 'mock' ? { mockGpsOwner: { socketId: '복구', at: lastPt.atMs, warned: false } } : {}),
    };
}

/** 장부의 도착 마일스톤을 콜 객체 칸으로 되살린다 — 재시작해도 다녀온 곳을 기억하게 */
function hydrateVisitedStops(orderId: string): { arrivedPickupAt?: string; arrivedDropoffAt?: string } {
    // 🔄 파생 치환 ② — 복구의 재료도 새 장부 (단계 행의 occurred_at)
    return visitedStopsFrom(stepRecordsOf(orderId).milestones as { milestone: string; occurredAt?: string }[]);
}

/** 🚏 다녀온 정거장(도착 시각) — 값만 받는 셈 (단계 장부의 마일스톤 줄) */
export function visitedStopsFrom(rows: { milestone: string; occurredAt?: string }[]): { arrivedPickupAt?: string; arrivedDropoffAt?: string } {
    const at = (m: string) => rows.find(r => r.milestone === m)?.occurredAt;
    return {
        arrivedPickupAt: at('ARRIVED_PICKUP'),
        arrivedDropoffAt: at('ARRIVED_DROPOFF'),
    };
}

/**
 * ♻️ 장부의 콜 한 줄 → 세션 콜 — 값만 받는 셈 (orders 줄 · 그 콜의 다녀온 정거장 · 판정 스냅샷 · 상하차지 연락처).
 * 장부의 칸을 하나씩 옮겨 담는다 — 새 칸을 만들면 여기도 실어야 재시작 뒤 살아난다.
 */
export function restoredOrderFrom(row: any, got: {
    visited: ReturnType<typeof visitedStopsFrom>;
    judgment: ReturnType<typeof OrderRepository.getJudgmentVerdict>;
    contacts: ReturnType<typeof OrderRepository.stopContactsOf>;
}): MyOrder {
    return {
        id: row.id,
        type: row.type,
        pickup: row.pickup,
        dropoff: row.dropoff,
        fare: row.fare,
        timestamp: row.timestamp,
        status: row.status,
        capturedAt: row.capturedAt,
        /** 🎯 판 — 안 읽으면 재기동 뒤 전부 하차지 시로 조용히 물러난다 (#131) */
        goalCity: row.goalCity ?? undefined,
        /** 📅 예약 — 안 읽으면 재기동 뒤 예약 콜이 오늘 첫짐이 되고 상차 약속이 오늘로 돌아간다 */
        reserved: row.reserved == null ? undefined : !!row.reserved,
        reservedDay: row.reservedDay ?? undefined,
        reservedAt: row.reservedAt ?? undefined,
        reservedFor: row.reserved_for ?? undefined,
        capturedDeviceId: row.capturedDeviceId,
        vehicleType: row.vehicleType,
        distanceKm: row.distanceKm,
        totalDistanceKm: row.totalDistanceKm,
        totalDurationMin: row.totalDurationMin,
        /**
         * 🗺️ **장부에 남은 궤적을 그대로 되살린다** (기사님 확정).
         * 이게 있으면 아래 카카오 복구 연산을 건너뛴다 — 한 번 잰 경로를 다시 재지 않는다.
         * 깨진 값이면 없는 것으로 친다 (그러면 아래에서 다시 잰다 — 안전망).
         */
        routePolyline: parsePolyline(row.routePolyline),
        /* 🎨 구간 경계·주인도 함께 편다 — 관제웹 콜 목록(GET /orders)과 같이 셋이 같이 살아야 지도가 색을 내고, 합짐 경로 재사용이 남은 정거장과 견줄 수 있다 */
        sectionEnds: parseSectionEnds(row.sectionEnds),
        sectionStops: parseSectionStops(row.sectionStops),
        kakaoSoloDistanceKm: row.kakaoSoloDistanceKm,
        kakaoSoloDurationMin: row.kakaoSoloDurationMin,
        kakaoTimeExt: row.kakaoTimeExt,
        pickupX: row.pickupX,
        pickupY: row.pickupY,
        dropoffX: row.dropoffX,
        dropoffY: row.dropoffY,
        // [T8] 착불 여부가 복구에서 빠져 있었다 — 재접속 직후 착불 표시가 사라진다
        paymentType: row.paymentType,
        /**
         * 🏁 **하차 시각** — 화면의 사이클 경계가 이걸 본다.
         * 없으면 관제웹이 "언제 내렸는지 모른다"가 되어 지난 운행의 완료분을
         * 못 가른다 (그래도 카드를 지우진 않는다 — 규칙 ④).
         */
        completedAt: row.completedAt,
        isShared: !!row.isShared,
        isExpress: !!row.isExpress,
        // 🧭 어떻게 잡았나(자동·알람·직접) — 안 되살리면 재부팅마다 갈래 배지가 사라진다
        capturedVia: row.capturedVia,
        capturedMode: row.capturedMode ?? null,
        openedBy: row.openedBy ?? null,
        orderForm: row.orderForm,
        detailMemo: row.detailMemo,
        /**
         * 🧾 **카드가 그리는 장부 칸도 되살린다** — 🏢 배차사 · 📦 물품 · 수수료 · 예약 시각 · 구분 · 계산서 · 탁송료 ·
         *    배송거리 · 게시 시각 · 배차망. 지난 콜 목록(GET /orders)과 같은 칸을 실어야 재시작 뒤 카드와 목록이 같은 말을 한다.
         */
        dispatcherName: row.dispatcherName ?? undefined,
        dispatcherPhone: row.dispatcherPhone ?? undefined,
        itemDescription: row.itemDescription ?? undefined,
        commissionRate: row.commissionRate ?? undefined,
        scheduleText: row.scheduleText ?? undefined,
        tripType: row.tripType ?? undefined,
        billingType: row.billingType ?? undefined,
        tollFare: row.tollFare ?? undefined,
        postTime: row.postTime ?? undefined,
        deliveryDistance: row.deliveryDistance ?? undefined,
        targetApp: row.targetApp ?? undefined,
        /**
         * 🚏 **도착 시각을 되살린다**.
         * 안 되살리면 재시작 직후 `hasVisitedStop` 이 false 가 되어
         * **이미 다녀온 정거장으로 되돌아가는 경로**가 다시 그려진다.
         */
        ...got.visited,
        /**
         * 🎨 **색도 되살린다** — 심사 스냅샷(DB)을 재시작 뒤 콜에 붙인다. 안 붙이면 관제웹이
         *    **문장을 뒤져** 색을 정하다가 재탐색 문구(`🍯 (꿀)` — 괄호)를 못 잡아
         *    **꿀콜이 「보통」 초록**으로 보인다. 🚨 `(사고)` 도 마찬가지다.
         *    새로 재는 게 아니라 **그때 그 값**이다 — 색은 심사 1회 고정 (v2 ③④).
         */
        judgment: got.judgment ?? undefined,
        /** 📞 **상하차지 연락처도 되살린다** — 단계 시트의 📞 이 이것을 읽는다. 안 되살리면 재시작 뒤 진행 중 콜의 전화 버튼이 사라진다 */
        ...got.contacts,
    };
}

/**
 * [방안 1] 서버 재시작 시 DB에서 콜을 불러와 1회성 카카오 궤적 복구 연산
 * ⚠️ 직접 호출하지 말 것 — bootstrapUserSession() 을 통해서만 실행된다.
 */
export async function restoreAndRecalculateSession(userId: string, io: any) {
    const session = getUserSession(userId);
    if (session.isRestored) return; // 이미 복구했으면 스킵 — «복구됨»은 몸통이 끝난 뒤에 켠다 (던지면 꺼진 채 · 잡기 멈춤)
    session.restoreFailedAt = null;

    try {
        const { todayStartIso, unfinishedSinceIso } = restoreWindow(Date.now());

        // 1. orders와 places 테이블을 조인하여 복구 대상 콜과 X, Y 좌표를 불러옵니다.
        //
        // 🔴 상태 목록을 여기 손으로 적지 않는다.
        //    손으로 적으면 새 상태(ORDER_PICKED_UP · ORDER_DELIVERED 같은 것)가 빠져
        //    **짐을 실은 채 새로고침하면 콜이 사라진다.** shared 의 RESTORABLE_STATUSES 한 곳에서만 정한다.
        //
        // 🗓️ 미완료 콜은 영업일(자정) 기준으로 **어제부터** 되살린다.
        //    `timestamp >= 오늘 자정` 만 쓰면 **전날 상차한 콜이 사라져서**
        //    전날 상차 → 다음날 배송하는 운행이 통째로 깨진다.
        //    종결 콜은 오늘 것만 — 목록이 무한정 길어질 이유가 없다.
        const statusPlaceholders = RESTORABLE_STATUSES.map(() => '?').join(', ');
        const progressPlaceholders = IN_PROGRESS_STATUSES.map(() => '?').join(', ');
        /* 🗓️ 창은 shared `restoreWhere` 한 벌 — «오늘 하차»도 살린다 (자정 넘긴 운행) */
        const win = restoreWhere(Date.now(), 'o.');
        const rows = db.prepare(`
            SELECT o.*,
                   pPlace.x as pickupX, pPlace.y as pickupY,
                   dPlace.x as dropoffX, dPlace.y as dropoffY
            FROM orders o
            LEFT JOIN orderStops pStop ON pStop.orderId = o.id AND pStop.stopType = 'pickup'
            LEFT JOIN places pPlace ON pStop.placeId = pPlace.id
            LEFT JOIN orderStops dStop ON dStop.orderId = o.id AND dStop.stopType = 'dropoff'
            LEFT JOIN places dPlace ON dStop.placeId = dPlace.id
            WHERE o.userId = ? AND o.status IN (${statusPlaceholders})
              AND ${win.sql}
            ORDER BY o.timestamp ASC
        `).all(userId, ...RESTORABLE_STATUSES, ...win.params) as any[];

        // 🔴 상한을 넘겨 **빠진** 미완료 콜은 조용히 사라지게 두지 않는다.
        //    기사님이 모르는 채로 콜을 잃으면 안 된다 — 상한을 두면서 그 실패를 새로 만들 수는 없다.
        const dropped = db.prepare(`
            SELECT id, status, pickup, dropoff, timestamp FROM orders
            WHERE userId = ? AND status IN (${progressPlaceholders}) AND timestamp < ?
            ORDER BY timestamp DESC LIMIT 20
        `).all(userId, ...IN_PROGRESS_STATUSES, unfinishedSinceIso) as any[];

        if (dropped.length > 0) {
            const daysAgo = (t: string) =>
                Math.floor((Date.now() - new Date(t).getTime()) / 86_400_000);
            console.warn(
                `⚠️ [복구 제외] 어제 영업일보다 오래된 미완료 콜 ${dropped.length}건이 화면에서 빠집니다:\n` +
                dropped.map(o => `   · ${o.id.slice(0, 8)} ${o.status} ${o.pickup}→${o.dropoff} (${daysAgo(o.timestamp)}일 전)`).join('\n')
            );
            io?.to(userId).emit("stale-orders-dropped", {
                count: dropped.length,
                days: UNFINISHED_RESTORE_BUSINESS_DAYS,
                orders: dropped.map(o => ({
                    id: o.id, status: o.status, pickup: o.pickup, dropoff: o.dropoff,
                    daysAgo: daysAgo(o.timestamp),
                })),
            });
        }

        if (rows.length === 0) return;

        logRoadmapEvent('부팅', "서버", `♻️ [복구] 서버 재시작 — DB 의 콜 ${rows.length}개 궤적을 되살린다`);

        // 2. session 메모리 재구성
        for (const row of rows) {
            const order: MyOrder = restoredOrderFrom(row, {
                visited: hydrateVisitedStops(row.id),
                judgment: OrderRepository.getJudgmentVerdict(row.id),
                contacts: OrderRepository.stopContactsOf(row.id),
            });
            rememberOrder(session, order as any);
        }

        /**
         * 🧾 **확정 콜 목록은 이번에 장부에서 읽은 콜로만 만든다** (기사님 «가»).
         *    메모리에는 관제웹이 붙기 전에 폰이 올린 판정 중 콜이 먼저 들어와 있을 수 있다 — 그 콜까지 담으면
         *    «진행 중»으로 세여 국면 · 합짐 · 차종이 바뀌고, 그 콜의 상세 보고가 자기 자신에 맞아 판정을 못 받는다.
         *    판정 중 콜은 메모리에 그대로 두어 이어지는 상세 보고가 보통 판정을 받는다.
         */
        const loadedIds = [...new Set(rows.map(r => r.id as string))];
        const allLoaded = loadedIds.map(id => session.pendingOrdersData.get(id)).filter(Boolean) as MyOrder[];
        /**
         * 📅 **보관 날이 오늘 뒤인 콜은 예약 보관으로** — 영업일 전환과 같은 가름.
         *    새 날에 서버가 뜨면 세션이 오늘로 태어나 영업일 전환이 안 돈다 — 그래서 여기서도 가른다.
         */
        const today = businessDayKey(Date.now());
        session.reservedOrders = allLoaded.filter(o => isHeldReserved(o, today));
        session.myOrders = allLoaded.filter(o => !isHeldReserved(o, today));

        // 카카오 궤적 복원 연산 시에는 진행 중인(취소/방출/완료가 아닌) 콜만 필터링하여 사용
        const routingOptions = SettingsRepository.getKakaoRoutingOptions(userId);
        const activeCalls = getActiveCalls(session);
        const activeMain = activeCalls[0];
        const activeSubs = activeCalls.slice(1);

        // 3. 첫짐 콜의 카카오 궤적 1회 복구
        if (activeMain && activeMain.pickupX && activeMain.dropoffX) {
            /**
             * 🗺️ **장부에 궤적이 있으면 다시 재지 않는다** (기사님 확정).
             *
             * 기사님: *"확정된 경로를 새로 받아올 필요가 없다 생각되어서 하는 질문이야."*
             *
             * 거리·시간·접근 구간까지 행에 남아 있으므로 카카오를 부를 이유가 없다.
             * ⚠️ 궤적이 없거나(옛 행·연산 실패) 깨졌으면 **아래로 내려가 다시 잰다** —
             *    안전망은 빼지 않는다 (규칙 ②).
             */
            if (activeMain.routePolyline?.length) {
                slog('부팅', `🗺️ [복구 - 궤적 재사용] ${activeMain.id} — 장부의 ${activeMain.routePolyline.length}점을 그대로 씁니다 (카카오 호출 없음)`);
            } else
            try {
                // 🔴 복구도 마찬가지다 — 상차하고 달리다 **새로고침만 해도** 경로가 상차지로
                //    되돌아가던 자리다.
                const res = await calculateSoloRoute(
                    activeMain.pickupX, activeMain.pickupY!,
                    activeMain.dropoffX, activeMain.dropoffY!,
                    originOf(session),
                    routingOptions.defaultPriority,
                    routingOptions.carType,
                    hasVisitedStop(activeMain, 'pickup'),
                );
                // 🔴 복구도 기록 규약 `applySoloRoute` 한 곳을 거친다 — 폴리라인·ETA 만 손으로 쓰면
                //    `approachDuration` · `kakaoSolo*` · `totalDistanceKm` 가 버려져 **재접속하면 접근 구간이 '모름'** 이 되고,
                //    통화에서 "몇 시까지 갈 수 있다"를 말할 수가 없다.
                applySoloRouteAndSave(activeMain, res);   // sectionEtas 도 여기서 함께 기록된다

                if (res.approachDuration) {
                    slog('부팅', `🗺️ [복구 - 접근 구간] ${originOf(session)?.isFallback ? '임시 출발지' : '현위치'} → 상차지 ` +
                        `${toKm(res.approachDistance || 0)}km / ${toMin(res.approachDuration)}분`);
                }
            } catch(e) {
                console.error('🗺️ [첫짐 콜 복구 연산 실패]', e);
            }
        }

        // 4. 합짐(서브콜) 카카오 궤적 1회 복구
        //    🗺️ 장부의 합짐 경로가 지금 남은 정거장과 같으면 다시 재지 않는다 — 되살리기가 재시작 직후 판정 길에 들어오니 짧아야 한다
        const mergedHolder = activeMain ? pickRouteHolder(activeCalls, activeMain) : null;
        const plannedNow = activeSubs.length > 0 ? planMergedStops(activeCalls, null, originOf(session), promiseOrderOpts(session)) : null;
        const stopKey = (s: { orderId: string; stopType: string }) => `${s.orderId}|${s.stopType}`;
        const wantStops = new Set((plannedNow?.orderedStops ?? []).map(stopKey));
        const haveStops = new Set((mergedHolder?.sectionStops ?? []).map(stopKey));
        const savedMergedFits = !!mergedHolder?.routePolyline?.length && wantStops.size > 0
            && wantStops.size === haveStops.size && [...wantStops].every(k => haveStops.has(k));
        if (activeSubs.length > 0 && activeMain && savedMergedFits) {
            slog('부팅', `🗺️ [복구 - 합짐 궤적 재사용] ${mergedHolder!.id} — 장부 경로의 정거장 ${wantStops.size}곳이 지금과 같다 (카카오 호출 없음)`);
        } else if (activeSubs.length > 0 && activeMain) {
            try {
                const calcResult = await composeMergedRoute({
                    calls: activeCalls,
                    origin: originOf(session),
                    priority: routingOptions.defaultPriority,
                    carType: routingOptions.carType,
                    promiseOpts: promiseOrderOpts(session),
                });
                // myOrders 에는 종료된 콜도 함께 로드되므로 반드시 활성 콜 기준으로 잡아야 한다.
                if (calcResult) applyRouteAndSave(pickRouteHolder(activeCalls, activeMain), calcResult.merged);
            } catch(e) {
                console.error('🗺️ [합짐 복구 연산 실패]', e);
            }
        }

        logRoadmapEvent('부팅', "서버", `♻️ [복구] DB 의 콜·궤적을 세션에 되살렸다 — 관제웹에 sync 전송`);

        // 5. [이슈 W] 복구된 데이터로부터 배차 상태를 다시 "파생"시킨다.
        //
        // activeFilter 를 복구하지 않으면 진행 중인 콜이 있는데도 필터가 STANDBY(첫짐) /
        // isSharedMode=false 로 남아 콜 잡기가 계속된다. 그러면
        //   - OrderEvaluator가 도착지 경유 검사를 건너뛰어 경로 이탈 콜도 통과
        //   - 첫짐 절대하한가(minFare)가 잘못 적용
        //   - 남은 적재 공간을 무시한 차종 허용 (라보 2건 만재여도 1t 콜을 잡으러 감)
        //   - KEEP 시 isShared=0 으로 기록되어 통계 왜곡 (이슈 R)
        //
        // 상태를 따로 저장했다가 되살리는 대신 **데이터에서 매번 파생**시킨다.
        // 저장된 상태는 실제와 어긋날 수 있지만 파생값은 어긋날 수 없다.
        //
        // ⚠️ 미완료 콜은 3일까지 되살아나므로 며칠 전 콜이 섞여 들어올 수 있다. 그래도 안전한 이유는
        //    **파생**이다: 아래 상태는 전부 `getActiveCalls(session)` 에서 매번 다시 구하므로
        //    "지금 실려 있는 콜"이 진실인 것은 변하지 않는다.
        const restoredActive = getActiveCalls(session);
        if (restoredActive.length > 0) {
            // 복구 시점엔 출발 사실이 없다(서버 재시작으로 세션이 새로 났다) → 모으기부터 다시
            const phase = deriveDispatchPhase(restoredActive.length, !!session.departedAt);

            /* 🚚 차종은 넘기지 않는다 — 필터 매니저가 되살린 콜(상차지 도착 · 상차 완료)과 장부의 경로 순서(`sectionStops`)로
                  «함께 실리는 최대»를 구한다. 순서를 못 되살린 콜이 있으면 그 셈이 스스로 다 더한 값으로 물러선다 */
            updateActiveFilter(userId, {
                dispatchPhase: phase,
                isSharedMode: true,
            }, io);

            // 경유 키워드는 부트스트랩 ⑤(rebuildDestinationKeywords)가 일괄 처리한다.
            // 여기서 또 계산하면 같은 지리 연산을 두 번 돌린다.

            const f = session.activeFilter;
            slog('부팅', `🔄 [상태 복구] 진행 중 ${restoredActive.length}건 → phase=${phase}, 합짐=ON, ` +
                `추가 가능 차종=[${(f.allowedVehicleTypes || []).join(', ')}], 경유 키워드=${(f.destinationKeywords || []).length}개`);
            logRoadmapEvent('부팅', "서버", `[Session DB Load] 진행 중 ${restoredActive.length}건 기준으로 배차 상태 재구성 (${phase}/합짐)`);

            // 관제탑에 복구 사실을 알린다.
            // 이미 배달했는데 완료 처리를 안 한 건이 있으면 서버는 계속 "적재 중"으로 믿고
            // 합짐 필터를 좁게 유지하므로, 기사님이 완료 처리를 하도록 유도해야 한다.
            if (io) {
                io.to(userId).emit("session-restored", {
                    restoredCount: restoredActive.length,
                    dispatchPhase: phase,
                    orderIds: restoredActive.map(c => c.id),
                });
            }
        }

        // 6. 프론트엔드로 복구된 궤적 즉시 전송
        if (io) {
            const sync = buildOrderSync(session);
            const sig = filterVersionOf(sync);
            if (lastSyncLogSig.get(userId) !== sig) {
                lastSyncLogSig.set(userId, sig);
                slog('통신', `📤 [Socket 푸시] sync-active-orders (활성 ${getActiveCalls(session).length}건 · 지문 ${sig})`);
            }
            io.to(userId).emit("sync-active-orders", sync);
        }

    } catch (err) {
        session.restoreFailedAt = Date.now();
        console.error('🚨 [restoreAndRecalculateSession] 오류 발생:', err);
        slog('경고', `🚨 [하루 복구 실패] 원달앱 콜 잡기를 멈춘 채 둔다 — 관제웹 재접속 · 상세 진입이 다시 시도한다`);
    } finally {
        session.isRestored = session.restoreFailedAt === null;   // 되살릴 콜이 없어 일찍 끝난 날도 성공이다
    }
}
