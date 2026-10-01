import type { Server } from "socket.io";
import { cargoMismatchRatio, clockText, type CargoReport } from "@onedal/shared";
import { bridgeCargoReport, stepsView, stepRecordsOf } from "./stepSeeder";
import { routeTlOf } from "./routeTl";
import { recalcRouteIfStopsChanged } from "./dispatchEngine";
import { updateActiveFilter } from "../state/filterManager";
import { getUserSession } from "../state/userSessionStore";
import { slog } from "../utils/fileLogger";

/**
 * 📞 **통화 결과 · 현장 실측을 적는 길 하나** (reviews/29 5단계 · 기사 소켓 `save-cargo-report` 와 운영센터 `/api/ops/calls/:id/note` 가 같이 부른다).
 * - `userId` = 그 콜의 기사 · `writerId` = 적은 사람(기사 자신 또는 관리자). 단계 행 `written_by` 에 남는다 — 나중 것이 이긴다
 * - 관리자는 통화 신고(DECLARED)만. 현장 실측(ACTUAL)이 이미 있는지는 운영센터 문이 먼저 본다(409)
 * - 몸통은 옛 소켓 처리 그대로다 — 기사 흐름이 같은 입력에 같은 단계 행이 되는지 `opsCallHelper` 검사가 문다
 */
export class CargoReportError extends Error {
    constructor(public status: number, message: string) { super(message); }
}

export function saveCargoReport(userId: string, orderId: string, report: CargoReport, writerId: string, io: Server): void {
    if (!orderId) throw new Error("orderId 누락");
    /* 📞 관리자(통화 도우미)는 통화 신고만 — 현장 실측 · 건너뜀은 현장 기사만 (reviews/29 5단계) */
    if (writerId !== userId && report.kind !== 'DECLARED') throw new CargoReportError(400, "관리자는 통화 신고만 적을 수 있습니다");
    // 단계 행(새 장부)이 유일한 원천이다
    bridgeCargoReport(userId, orderId, report, getUserSession(userId)?.judgment, routeTlOf(userId), writerId);
    /* 적은 소켓이 아니라 기사 화면 전부에 — 관리자가 적어도 기사 관제웹이 바로 닫힌다.
       관리자 방(운영센터 소켓 /ops 만)에는 자료 없이 신호만(운영센터가 GET /api/ops/calls 로 다시 읽고 requireOps 가 요청마다 허락을 본다 · 허락을 거둔 소켓이 방에 남아도 자료를 못 받는다) */
    io.to(userId).emit("steps-synced", { orderId, steps: stepsView(orderId, getUserSession(userId)?.judgment) });
    io.of("/ops").to("admin_room").emit("ops-calls-changed", { memberId: userId });

    const all = stepRecordsOf(orderId).reports;
    const pick = (st: string, k: string) => all.find(r => r.stopType === st && r.kind === k);
    const ratio = cargoMismatchRatio(pick(report.stopType, 'DECLARED'), pick(report.stopType, 'ACTUAL'));

    const label = report.stopType === 'pickup' ? '상차지' : '하차지';
    const kindLabel = report.kind === 'DECLARED' ? '통화 신고' : '현장 실측';
    // 화면이 보내는 것은 `unit` 이다 — `sizeClass` 는 옛 필드라 폴백으로만 본다
    slog('콜단계', `📞 [${label} ${kindLabel}] ${report.unit || report.sizeClass || '-'} × ${report.quantity ?? '-'} · ${report.handling || '-'}`);

    /**
     * 🔬 **계측** — 약속이 **무슨 값으로** 만들어졌는지 남긴다.
     *
     * 기사님 실측: `17:33:31` 에 잡은 콜의 상차 약속이 `18:51` 로 저장됐다.
     * 도착 예상은 `17:56` 이었으니 여유 30분이면 `18:26` 이어야 한다.
     * 저장값에서 역산한 주행은 47분, 경로가 아는 주행은 21분 — **어느 쪽이
     * 47분을 만들었는지 확인할 방법이 없었다.**
     *
     * → 관제웹이 그 순간 실제로 쓴 재료(`_diag`)를 그대로 찍는다.
     *   서버 로그의 `🧭 [경로 순서]` 줄과 나란히 놓으면 갈린다:
     *     · 두 주행분이 같다  → 관제웹의 **더하는 방식**이 틀렸다 (카카오호출시점·기준시각)
     *     · 다르다            → 시트가 **경로가 아닌 값**(콜별 파생 폴백)을 썼다
     *
     * ⚠️ `_diag` 는 로그로만 쓰고 **저장하지 않는다** — 장부에 남기려면 규칙 ⑤-4 의
     *    넷(스키마·값·시점·화면)을 먼저 정해야 한다. 원인이 확정되면 지운다.
     */
    const diag = (report as any)._diag;
    const promise = (report as any).promisedArrivalAt ?? report.deadlineAt;
    if (promise || diag) {
        const hhmm = (iso?: string) => clockText(iso) ?? '-';   // 🕐 한 모양은 shared (옛 «14시 5분 3초»)
        const parts = [
            `약속 ${hhmm(promise)}`,
            diag ? `시트가 쓴 값 → 주행 ${diag.driveMinutes ?? '모름'} + 선행 ${diag.leadMinutes ?? '-'}` : null,
            diag ? `출처 ${diag.source ?? '?'}` : null,
            // 시트는 "기준시각 + 주행" 으로 도착 예상을 만든다. 그 기준시각이 무엇이었나
            diag ? `기준 ${hhmm(diag.baseAt)} · 카카오호출시점 ${hhmm(diag.routeComputedAt)}` : null,
            diag?.suggestedAt ? `추천 ${hhmm(diag.suggestedAt)}` : null,
            diag?.touched != null ? (diag.touched ? '기사님이 누름' : '자동 추천 그대로') : null,
        ].filter(Boolean);
        slog('판정', `   🔬 [약속 계측] ${parts.join(' · ')}`);
    }

    // 신고와 실측이 크게 어긋나면 그대로 진행하면 안 된다.
    // 퀵사무실에 확인해 수행 여부를 다시 정할 수 있게 관제탑에 띄운다.
    if (ratio !== null && (ratio >= 1.5 || ratio <= 0.5)) {
        console.warn(`⚠️ [신고 불일치] ${label} — 실측이 신고의 ${ratio.toFixed(1)}배`);
        io.to(userId).emit("cargo-mismatch", { orderId, stopType: report.stopType, ratio });
    }

    /**
     * ⏱️ **통화로 약속을 저장하면 그 자리에서 경로를 다시 짠다** (기사님 확정).
     *
     * 굳은 약속은 정거장 순서를 정한다(`orderByPromise`). 저장만 하고 경로를 그냥 두면
     * 미뤄 둔 약속이 **다음 사건이 올 때까지** 순서에 반영되지 않아, 기사님이 바로 화면을 보시면
     * 옛 순서가 그대로다.
     * 🔴 **약속이 든 저장일 때만** 부른다 — 짐만 신고한 저장으로 카카오를 더 부르지 않는다.
     *    순서가 그대로면 안쪽에서 다시 «경로 유지»로 걸러진다 (`recalcRouteIfStopsChanged`).
     */
    if ((report as any).promisedArrivalAt || (report as any).onwardDeadlineAt) {
        recalcRouteIfStopsChanged(userId, io, '통화 약속 저장')
            .catch(e => console.error('🗺️ [통화 뒤 경로 재계산 실패]', (e as Error).message));
    }

    // 🔴 짐 양을 신고하면 여기서 필터를 다시 파생시킨다 — 안 하면 잔여 용량(allowedVehicleTypes)이
    //    **다음 이벤트가 올 때까지 그대로**다.
    //
    //    무겁지 않다 — recalculateDerivedFields 의 needsGeoRecalc 가드 때문에
    //    `{}` 로는 지리 연산이 돌지 않고, broadcastFilter 는 관제웹 소켓으로만 나간다.
    //    앱은 POST /api/scrap 응답 꼬리에서 필터를 끌어가므로 폰으로 밀려가지 않는다.
    updateActiveFilter(userId, {}, io);
}
