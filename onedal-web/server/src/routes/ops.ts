import { Router, type Request } from "express";
import {
    CALL_NOTE_MEMO_MAX, CARGO_UNITS, LEGACY_CARGO_UNITS, CONTENT_KINDS, DEVICE_OFFLINE_LABEL, IN_PROGRESS_STATUSES, WORD_KINDS, isTargetApp, isoKst, restoreWindow, runningModeOf,
    type CargoReport, type CargoUnit, type OpsAgreement, type OpsCallNote,
    type ContentKind, type OpsAnomaly, type OpsAudit, type OpsCall, type OpsContent, type OpsCounts, type OpsMember,
    type OpsMemberDetail, type OpsNotice, type OpsPhone, type OpsScreenWord, type TargetAppType, type WordKind,
} from "@onedal/shared";
import db from "../db";
import { getUserDevicesSnapshot, getActiveDevicesSnapshot } from "./devices";
import { BOOTED_AT, GIT_INFO } from "./health";
import { peekUserSession, baseFilterFromDb, getAllActiveUserIds } from "../state/userSessionStore";
import { appFilterOf } from "../state/appFilter";
import { kakaoUsageOf, kakaoBoardOf } from "../services/kakaoUsage";
import { networkLevelOf, needsUpdateOf, locationStaleOf, NETWORK_ALARM } from "../services/opsHome";
import { nextStopOf } from "../services/geoService";
import { listReleases, scrapReleaseCodes } from "../core/releases";
import { intelRowsOf } from "../services/intelRows";
import type { OpsBoardFilter, OpsBoardIntel, OpsBoardPhone, OpsBoardServer, OpsHome, OpsLocations, OpsStats } from "@onedal/shared";
import { marketStatsOf, clampStatsRange } from "../services/callFlowStats";
import { rangeOf } from "./stats";
import { TARGET_APPS, accountBlocked, kakaoTotalOf, kstDateText, nearestDong } from "@onedal/shared";
import { latestContent, isContentKind } from "./contents";
import { noticeOf, type NoticeRow } from "./notices";
import { slog } from "../utils/fileLogger";
import { stepsView } from "../services/stepSeeder";
import { saveCargoReport, CargoReportError } from "../services/cargoReport";

/**
 * 🏢 **운영센터 서버 문 `/api/ops/*`** (reviews/29 3단계 · shared ops.ts 규격 · 붙일 때 requireAuth + requireOps 한 번 — index.ts).
 * - 🔴 관리자의 쓰기마다 `ops_audit` 한 줄 — `audit()` 하나로만 쓴다. 회원 상세를 열면 서버가 «회원 봄» 한 줄(3초 안 중복 없음)
 * - 기사 운행 값(필터 · 판정 기준 · 결재)은 여기서 쓰지 않는다 (ops/CLAUDE.md)
 * - 즉시 정지 · 탈퇴는 그 회원의 관제웹 소켓을 끊는다. 폰은 폰 문(core/accountGate)이 막는다. «끝난 뒤» 정지는 안 끊는다
 * - 6단계 칸(유료 기한 · 자동 잡기 · 통계 허락)과 5단계(통화 도우미 · 카카오 사용량)는 아직 없어 null · 0 · 빈 값으로 보낸다
 */
const router = Router();

const adminOf = (req: Request) => req.user!.id;
const nowText = () => db.prepare(`SELECT datetime('now', 'localtime') AS t`).get() as { t: string };

/** 🧾 관리자의 한 일 · 본 것 — 여기 한 곳으로만 쓴다 */
export function audit(adminId: string, action: string, target: string | null, detail = ''): void {
    db.prepare(`INSERT INTO ops_audit (at, admin_id, action, target_user_id, detail) VALUES (datetime('now', 'localtime'), ?, ?, ?, ?)`).run(adminId, action, target, detail);
}

/** 👀 같은 관리자가 같은 회원을 3초 안에 다시 열면 안 적는다 — 화면이 두 번 그려도 한 줄 */
const lastViewed = new Map<string, number>();
/**
 * 🧰 **현황판 열람 — 열어 둔 동안 한 줄** — 현황판은 10초마다 다시 읽는다. 같은 관리자 · 같은 회원(전체 보기는 대상 없음)으로
 *    마지막 읽기 뒤 60초 안에 다시 읽으면 줄을 안 더하고 «마지막 읽기»만 늘린다 — 60초 넘게 안 보다 다시 열면 새 줄.
 *    phones · filter · intel 셋이 같은 묶음을 쓴다(셋을 한 번에 읽어도 한 줄).
 */
export const BOARD_VIEW_GAP_MS = 60_000;
const lastBoardRead = new Map<string, number>();
function auditBoardView(adminId: string, target: string | null, action = '현황판 봄', detail = '/board'): void {
    const key = `${adminId}|${action}|${target ?? '*'}`, now = Date.now();
    const last = lastBoardRead.get(key);
    lastBoardRead.set(key, now);
    if (last != null && now - last <= BOARD_VIEW_GAP_MS) return;
    audit(adminId, action, target, detail);
}

function auditView(adminId: string, target: string, detail: string): void {
    const key = `${adminId}|${target}`, now = Date.now();
    if (now - (lastViewed.get(key) ?? 0) < 3000) return;
    lastViewed.set(key, now);
    audit(adminId, '회원 봄', target, detail);
}

type UserRow = {
    id: string; name: string; email: string; phone: string | null; dispatch_networks: string | null; role: 'ADMIN' | 'USER';
    created_at: string; approved_at: string | null; suspended_at: string | null; suspend_after_active: number | null;
    withdrawn_at: string | null; ops_allowed_at: string | null; vehicle_type: string | null;
    auto_allowed_at: string | null; auto_until: string | null; stats_allowed_at: string | null; stats_until: string | null; paid_until: string | null;
};
const USER_SQL = `SELECT u.*, s.vehicle_type FROM users u LEFT JOIN user_settings s ON s.user_id = u.id`;

function networksOf(text: string | null): TargetAppType[] {
    try { const v = JSON.parse(text ?? '[]'); return Array.isArray(v) ? v.filter(isTargetApp) : []; } catch { return []; }
}

function phonesOf(userId: string, io: unknown): OpsPhone[] {
    return getUserDevicesSnapshot(userId, io).map(s => {
        /* 🎛️ 명령이 아니라 실제로 도는 모드 — 자동 잡기 허락이 꺼지면 AUTO 명령도 알람으로 돈다 (shared `runningModeOf`) */
        const running = runningModeOf(s);
        return {
            deviceId: s.deviceId,
            deviceName: s.deviceName ?? '',
            memberId: userId,
            status: s.status,
            offlineReason: s.offlineReason ? DEVICE_OFFLINE_LABEL[s.offlineReason] : null,
            lastSeenAt: s.lastSeen ? new Date(s.lastSeen).toISOString() : '',
            appVersion: s.version ?? '',
            mode: running === 'AUTO' || running === 'MANUAL' ? running : 'ALARM',
            locationOn: s.lat != null && s.lng != null,
        };
    });
}

function memberOf(r: UserRow, io: unknown): OpsMember {
    return {
        id: r.id, name: r.name, email: r.email, phone: r.phone ?? '', vehicle: r.vehicle_type ?? '', networks: networksOf(r.dispatch_networks),
        role: r.role, createdAt: isoKst(r.created_at) ?? '', approvedAt: isoKst(r.approved_at), suspendedAt: isoKst(r.suspended_at),
        suspendAfterActive: !!r.suspend_after_active, withdrawnAt: isoKst(r.withdrawn_at), opsAllowedAt: isoKst(r.ops_allowed_at),
        paidUntil: r.paid_until, autoAllowedAt: isoKst(r.auto_allowed_at), autoUntil: r.auto_until,
        statsAllowedAt: isoKst(r.stats_allowed_at), statsUntil: r.stats_until,
        phones: phonesOf(r.id, io),
    };
}

const userRow = (id: string) => db.prepare(`${USER_SQL} WHERE u.id = ?`).get(id) as UserRow | undefined;

type OrderRow = { id: string; userId: string; status: string; targetApp: string | null; pickup: string; dropoff: string; fare: number | null; capturedAt: string | null; timestamp: string; color: string | null };
const ORDER_SQL = `SELECT o.id, o.userId, o.status, o.targetApp, o.pickup, o.dropoff, o.fare, o.capturedAt, o.timestamp, j.color
    FROM orders o LEFT JOIN order_judgments j ON j.orderId = o.id`;
const nameOf = (id: string | null | undefined) => id ? ((db.prepare(`SELECT name FROM users WHERE id = ?`).get(id) as { name?: string } | undefined)?.name ?? id) : '';

/** 📞 통화 결과 — 두 통화 행 중 통화 신고로 닫힌 것의 마지막 · 적은 사람은 written_by(없으면 그 기사) */
function callNoteOf(o: OrderRow, steps: ReturnType<typeof stepsView>): OpsCallNote | null {
    const done = (['CALL_PICKUP', 'CALL_DROPOFF'] as const)
        .map(step => ({ step, v: steps.find(s => s.step === step) }))
        .filter(({ v }) => v?.born && v.row.status === 'DONE' && (v.row as Record<string, any>).planned_source === 'DECLARED')
        .sort((a, b) => String((b.v!.row as any).occurred_at ?? '').localeCompare(String((a.v!.row as any).occurred_at ?? '')));
    if (!done.length) return null;
    const r = done[0].v!.row as Record<string, any>;
    return {
        stopType: done[0].step === 'CALL_PICKUP' ? 'pickup' : 'dropoff',
        unit: (r.planned_unit as CargoUnit | null) ?? null, quantity: r.planned_quantity ?? null,
        promisedArrivalAt: isoKst(r.promised_arrival_at), memo: r.memo ?? '',
        writtenBy: nameOf(r.written_by ?? o.userId), writtenAt: isoKst(r.occurred_at) ?? '',
        counterpartCancelledAt: isoKst(r.counterpart_cancelled_at ?? null),
        counterpartCancelledBy: r.counterpart_cancelled_at ? nameOf(r.counterpart_cancelled_by ?? o.userId) : null,
    };
}

/** 운영센터 콜 한 줄 — 🟡(통화 필요)이고 상차 통화가 아직이면 needsCall · 정거장 시각은 약속 › 통화 때 예상 › 상차 시계(상차 날의 기준) */
function opsCallOf(o: OrderRow): OpsCall {
    const steps = stepsView(o.id);
    const atOf = (step: 'CALL_PICKUP' | 'CALL_DROPOFF') => {
        const r = steps.find(s => s.step === step)?.row as Record<string, any> | undefined;
        return isoKst(r?.promised_arrival_at ?? r?.predicted_at ?? r?.deadline_at ?? null);
    };
    const pickupCall = steps.find(s => s.step === 'CALL_PICKUP');
    return {
        id: o.id, memberId: o.userId, targetApp: isTargetApp(o.targetApp) ? o.targetApp : 'insung', status: o.status,
        verdict: (o.color ?? '보통') as OpsCall['verdict'],
        needsCall: o.color === '똥' && (!pickupCall?.born || pickupCall.row.status === 'PLANNED'),
        callNote: callNoteOf(o, steps), fare: o.fare ?? 0, capturedAt: isoKst(o.capturedAt ?? o.timestamp) ?? '',
        pickup: { place: o.pickup, phone: null, address: o.pickup, at: atOf('CALL_PICKUP') },
        dropoff: { place: o.dropoff, phone: null, address: o.dropoff, at: atOf('CALL_DROPOFF') },
    };
}

/** 오늘 잡은 콜(회원 상세) */
function todayCallsOf(userId: string): OpsCall[] {
    const { todayStartIso } = restoreWindow(Date.now());
    return (db.prepare(`${ORDER_SQL} WHERE o.userId = ? AND o.timestamp >= ? ORDER BY o.timestamp DESC`).all(userId, todayStartIso) as OrderRow[]).map(opsCallOf);
}

/** 진행 중 콜(KEEP 한 · 끝나지 않은 · 재부팅 복구 창) — 미리보기 · 체험 콜은 orders 에 없다 */
const IN_PROGRESS_SQL = `o.status IN (${IN_PROGRESS_STATUSES.map(() => '?').join(', ')}) AND o.timestamp >= ?`;
const inProgressParams = () => [...IN_PROGRESS_STATUSES, restoreWindow(Date.now()).unfinishedSinceIso];

type AnomalyRow = { id: number; created_at: string; device_id: string; target_app: string; screen_name: string | null; failure_reason: string; user_id: string | null };
const ANOMALY_SQL = `SELECT a.id, a.created_at, a.device_id, a.target_app, a.screen_name, a.failure_reason, d.user_id
    FROM telemetry_anomalies a LEFT JOIN user_devices d ON d.device_id = a.device_id`;
const anomalyOf = (a: AnomalyRow): OpsAnomaly => ({
    id: a.id, at: isoKst(a.created_at) ?? '', memberId: a.user_id, deviceId: a.device_id,
    targetApp: isTargetApp(a.target_app) ? a.target_app : 'insung', screen: a.screen_name ?? '', reason: a.failure_reason,
});


type AuditRow = { id: number; at: string; admin_name: string | null; admin_id: string; action: string; target_user_id: string | null; detail: string };
const auditOf = (a: AuditRow): OpsAudit => ({ id: a.id, at: isoKst(a.at) ?? '', admin: a.admin_name ?? a.admin_id, action: a.action, targetMemberId: a.target_user_id, detail: a.detail });
const AUDIT_SQL = `SELECT a.*, u.name AS admin_name FROM ops_audit a LEFT JOIN users u ON u.id = a.admin_id`;

// ── 회원 ────────────────────────────────────────────────

router.get("/members", (req, res) => {
    const io = req.app.get("io");
    const rows = db.prepare(`${USER_SQL} ORDER BY u.created_at`).all() as UserRow[];
    res.json(rows.map(r => memberOf(r, io)));
});

router.get("/members/:id", (req, res) => {
    const r = userRow(req.params.id);
    if (!r) return res.status(404).json({ error: "없는 회원입니다." });
    auditView(adminOf(req), r.id, '/members/:id');
    const detail: OpsMemberDetail = {
        member: memberOf(r, req.app.get("io")),
        todayCalls: todayCallsOf(r.id),
        anomalies: (db.prepare(`${ANOMALY_SQL} WHERE d.user_id = ? ORDER BY a.id DESC LIMIT 50`).all(r.id) as AnomalyRow[]).map(anomalyOf),
        audit: (db.prepare(`${AUDIT_SQL} WHERE a.target_user_id = ? ORDER BY a.id DESC LIMIT 50`).all(r.id) as AuditRow[]).map(auditOf),
        kakaoUsage: kakaoUsageOf(r.id),
        agreements: (db.prepare(`SELECT kind, item, version, agreed_at FROM agreements WHERE user_id = ? ORDER BY id`).all(r.id) as
            { kind: OpsAgreement['kind']; item: string | null; version: number; agreed_at: string }[])
            .map(a => ({ kind: a.kind, item: a.item, version: a.version, at: isoKst(a.agreed_at) ?? '' })),
    };
    return res.json(detail);
});

/** 회원 한 줄을 바꾸고 기록 한 줄 — 자기 자신을 잠그는 일(정지 · 탈퇴)은 막는다 */
export function memberWrite(req: Request, res: any, action: string, sql: string, params: unknown[], opts: { selfBlock?: boolean; cutSockets?: boolean; detail?: string } = {}) {
    const id = req.params.id as string, adminId = adminOf(req);
    if (!userRow(id)) return res.status(404).json({ error: "없는 회원입니다." });
    if (opts.selfBlock && id === adminId) return res.status(400).json({ error: "자기 계정은 정지 · 탈퇴할 수 없습니다." });
    db.prepare(sql).run(...params, id);
    audit(adminId, action, id, opts.detail ?? '');
    if (opts.cutSockets) req.app.get("io")?.in(id).disconnectSockets(true);
    slog('통신', `🏢 [운영센터] ${action} — ${id}${opts.cutSockets ? ' · 관제웹 연결 끊음' : ''}`);
    return res.json(memberOf(userRow(id)!, req.app.get("io")));
}

router.post("/members/:id/approve", (req, res) =>
    /* 🎛️ 승인 때 비어 있는 두 허락을 지금으로 켠다(기한 없음) — 기사는 모두 같은 기능이 기본(reviews/29 기준 2 · 6단계) */
    memberWrite(req, res, '승인', `UPDATE users SET approved_at = COALESCE(approved_at, datetime('now', 'localtime')),
        auto_allowed_at = COALESCE(auto_allowed_at, datetime('now', 'localtime')), stats_allowed_at = COALESCE(stats_allowed_at, datetime('now', 'localtime')) WHERE id = ?`, []));

router.post("/members/:id/suspend", (req, res) => {
    const afterActive = !!(req.body ?? {}).afterActive;
    return memberWrite(req, res, afterActive ? '정지 (진행 중 콜 끝난 뒤)' : '즉시 정지',
        `UPDATE users SET suspended_at = datetime('now', 'localtime'), suspend_after_active = ? WHERE id = ?`, [afterActive ? 1 : 0],
        { selfBlock: true, cutSockets: !afterActive });
});

router.post("/members/:id/resume", (req, res) =>
    memberWrite(req, res, '정지 풀기', `UPDATE users SET suspended_at = NULL, suspend_after_active = 0 WHERE id = ?`, []));

router.post("/members/:id/withdraw", (req, res) =>
    memberWrite(req, res, '탈퇴 처리', `UPDATE users SET withdrawn_at = COALESCE(withdrawn_at, datetime('now', 'localtime')) WHERE id = ?`, [],
        { selfBlock: true, cutSockets: true, detail: '폰 보고 거절 · 기록은 남는다' }));

// ── 폰 · 이상 기록 · 기록 · 숫자 ─────────────────────────

router.get("/phones", (req, res) => {
    res.json(allPhonesOf(req.app.get("io")));
});

router.get("/anomalies", (_req, res) => {
    const anomalies = (db.prepare(`${ANOMALY_SQL} ORDER BY a.id DESC LIMIT 100`).all() as AnomalyRow[]).map(anomalyOf);
    const words = db.prepare(`SELECT target_app, page, word, kind, first_seen FROM screen_words ORDER BY last_seen DESC LIMIT 100`).all() as
        { target_app: string; page: string; word: string; kind: WordKind; first_seen: string }[];
    const screenWords: OpsScreenWord[] = words.filter(w => isTargetApp(w.target_app) && (WORD_KINDS as readonly string[]).includes(w.kind))
        .map(w => ({ targetApp: w.target_app as TargetAppType, page: w.page, word: w.word, kind: w.kind, firstSeenAt: isoKst(w.first_seen) ?? '' }));
    res.json({ anomalies, screenWords });
});

router.get("/audit", (req, res) => {
    const since = typeof req.query.since === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.since) ? req.query.since : null;
    const rows = since
        ? db.prepare(`${AUDIT_SQL} WHERE a.at >= ? ORDER BY a.id DESC`).all(since) as AuditRow[]
        : db.prepare(`${AUDIT_SQL} ORDER BY a.id DESC LIMIT 200`).all() as AuditRow[];
    res.json(rows.map(auditOf));
});

/** 모든 회원의 폰 — 폰 쪽(/phones) · 메뉴 숫자 · 홈이 같이 부른다 */
const allPhonesOf = (io: unknown): OpsPhone[] =>
    (db.prepare(`SELECT DISTINCT user_id FROM user_devices`).all() as { user_id: string }[]).flatMap(r => phonesOf(r.user_id, io));

/** 🔢 메뉴 숫자 — /counts 와 홈이 같이 부른다(홈 숫자 = 메뉴 숫자) */
function opsCountsOf(io: unknown): OpsCounts {
    const pendingMembers = (db.prepare(`SELECT COUNT(*) n FROM users WHERE approved_at IS NULL AND withdrawn_at IS NULL`).get() as { n: number }).n;
    const phonesOffline = allPhonesOf(io).filter(p => p.status !== 'ONLINE').length;
    const callsTodo = opsCallsOf(null).filter(c => c.needsCall).length;   // 통화 도우미 화면(/calls)과 같은 함수
    return { pendingMembers, callsTodo, phonesOffline };
}

router.get("/counts", (req, res) => {
    res.json(opsCountsOf(req.app.get("io")));
});

// ── 통화 도우미 ──────────────────────────────────────────

/** 📞 진행 중 KEEP 콜 — 통화 도우미 화면과 메뉴 숫자(/counts 의 callsTodo)가 같이 부른다 · memberId 가 없으면 회원 전부 */
function opsCallsOf(memberId: string | null) {
    const rows = db.prepare(`${ORDER_SQL} WHERE ${IN_PROGRESS_SQL}${memberId ? ' AND o.userId = ?' : ''} ORDER BY o.timestamp DESC`)
        .all(...inProgressParams(), ...(memberId ? [memberId] : [])) as OrderRow[];
    return rows.map(opsCallOf);
}

router.get("/calls", (req, res) => {
    const memberId = typeof req.query.memberId === 'string' && req.query.memberId ? req.query.memberId : null;
    const calls = opsCallsOf(memberId);
    res.json([...calls.filter(c => c.needsCall), ...calls.filter(c => !c.needsCall)]);
});

const UNITS: readonly string[] = [...CARGO_UNITS, ...LEGACY_CARGO_UNITS];

/**
 * 📞 관리자가 기사 콜에 통화 결과를 적는다 — 이 문이 셋을 확인한다(04 메모 ②): 관리자 허락(requireOps · 앞에서) · 그 콜이 있고 진행 중 · 대상 기사 = 그 콜의 기사.
 *    기사 소켓의 orderOn(남의 콜 거절)은 넓히지 않는다. 🔴 기사님이 현장에서 잰 값(ACTUAL)이 있으면 409 — 나중 것이 이겨도 현장 실측은 못 덮는다.
 */
router.post("/calls/:id/note", (req, res) => {
    const adminId = adminOf(req);
    const o = db.prepare(`${ORDER_SQL} WHERE o.id = ? AND ${IN_PROGRESS_SQL}`).get(req.params.id, ...inProgressParams()) as OrderRow | undefined;
    if (!o) return res.status(404).json({ error: "진행 중인 콜이 아닙니다." });
    const b = (req.body ?? {}) as Record<string, unknown>;
    const stopType = b.stopType === 'pickup' || b.stopType === 'dropoff' ? b.stopType : null;
    const unit = b.unit == null ? null : typeof b.unit === 'string' && UNITS.includes(b.unit) ? b.unit : undefined;
    const quantity = b.quantity == null ? null : typeof b.quantity === 'number' && b.quantity > 0 ? b.quantity : undefined;
    const promised = b.promisedArrivalAt == null ? null : typeof b.promisedArrivalAt === 'string' && Number.isFinite(Date.parse(b.promisedArrivalAt)) ? b.promisedArrivalAt : undefined;
    const memo = typeof b.memo === 'string' ? b.memo.trim() : '';
    /* 📵 상대 취소 — true · false 만 받는다(없으면 그대로) */
    const counterpartCancelled = typeof b.counterpartCancelled === 'boolean' ? b.counterpartCancelled : undefined;
    if (!stopType || unit === undefined || quantity === undefined || promised === undefined) return res.status(400).json({ error: "통화 결과 칸을 확인해 주세요." });
    if (memo.length > CALL_NOTE_MEMO_MAX) return res.status(400).json({ error: `메모는 ${CALL_NOTE_MEMO_MAX}자까지입니다.` });
    const actual = stepsView(o.id).find(s => s.step === (stopType === 'pickup' ? 'LOADED' : 'DELIVERED'));
    if (actual?.born && (actual.row as Record<string, any>).actual_unit != null) return res.status(409).json({ error: "기사님이 현장에서 적은 값이 있습니다." });
    const report = { stopType, kind: 'DECLARED', unit: unit ?? undefined, quantity: quantity ?? undefined, promisedArrivalAt: promised ?? undefined, memo: memo || undefined, counterpartCancelled } as CargoReport;
    const callStep = stopType === 'pickup' ? 'CALL_PICKUP' : 'CALL_DROPOFF';
    const wasCancelled = !!(stepsView(o.id).find(s => s.step === callStep)?.row as Record<string, any> | undefined)?.counterpart_cancelled_at;
    try {
        saveCargoReport(o.userId, o.id, report, adminId, req.app.get("io"));
    } catch (e) {
        if (e instanceof CargoReportError) return res.status(e.status).json({ error: e.message });
        throw e;
    }
    audit(adminId, '통화 결과 적음', o.userId, `${o.id.slice(-6)} · ${stopType === 'pickup' ? '상차' : '하차'} · ${unit ?? '-'} × ${quantity ?? '-'}${counterpartCancelled ? ' · 상대 취소' : ''}${memo ? ` · ${memo.slice(0, 20)}` : ''}`);
    /* 📵 적혀 있던 «상대 취소»를 관리자가 지웠다 — 따로 한 줄(누가 무엇을 되돌렸나) */
    if (counterpartCancelled === false && wasCancelled) audit(adminId, '상대 취소 지움', o.userId, `${o.id.slice(-6)} · ${stopType === 'pickup' ? '상차' : '하차'}`);
    return res.json(opsCallOf(db.prepare(`${ORDER_SQL} WHERE o.id = ?`).get(o.id) as OrderRow));
});

// ── 현황판(관제웹 현황판과 같은 칸 · 읽기만 · 🔴 남의 세션을 만들거나 깨우지 않는다) ──────────

const boardMemberOf = (req: Request): string | null => typeof req.query.memberId === 'string' && req.query.memberId ? req.query.memberId : null;

/** 🖥️ 서버 점검 — /board/server 와 홈이 같이 부른다 */
function boardServerOf(io: any): OpsBoardServer {
    const seen = getActiveDevicesSnapshot(io).map(d => d.lastSeen).filter(n => n > 0);
    return {
        bootedAt: BOOTED_AT.toISOString(), commit: GIT_INFO.commit, branch: GIT_INFO.branch, committedAt: GIT_INFO.committedAt,
        dbFile: process.env.DB_FILE || "local.db",
        sockets: { web: io?.of("/").sockets.size ?? 0, ops: io?.of("/ops").sockets.size ?? 0 },
        lastScrapAt: seen.length ? new Date(Math.max(...seen)).toISOString() : null,
    };
}

router.get("/board/server", (req, res) => {
    res.json(boardServerOf(req.app.get("io")));
});

router.get("/board/phones", (req, res) => {
    const io = req.app.get("io"), memberId = boardMemberOf(req);
    auditBoardView(adminOf(req), memberId);
    const owners = memberId ? [memberId] : (db.prepare(`SELECT DISTINCT user_id FROM user_devices`).all() as { user_id: string }[]).map(r => r.user_id);
    const body: OpsBoardPhone[] = owners.flatMap(uid => getUserDevicesSnapshot(uid, io).map(({ lat, lng, ...rest }) =>
        ({ ...rest, memberId: uid, hasLocation: lat != null && lng != null })));
    res.json(body);
});

router.get("/board/filter", (req, res) => {
    const memberId = boardMemberOf(req);
    if (!memberId) return res.status(400).json({ error: "회원을 골라 주세요." });
    auditBoardView(adminOf(req), memberId);
    const session = peekUserSession(memberId);
    /* 📦 폰마다 «앱이 받는 값» — 폰 문과 같은 함수 · 내일 콜 목록은 폰에 마지막으로 실은 것(다시 재지 않는다) · 기기마다 다른 칸은 evaluatingNow */
    const app = session
        ? (db.prepare(`SELECT device_id FROM user_devices WHERE user_id = ? ORDER BY device_id`).all(memberId) as Array<{ device_id: string }>)
            .map(d => ({ deviceId: d.device_id, filter: appFilterOf(session, memberId, d.device_id, session.reservedPickup).filter }))
        : null;
    const body: OpsBoardFilter = { active: session?.activeFilter ?? null, base: session?.baseFilter ?? baseFilterFromDb(memberId), app };
    return res.json(body);
});

/* 🗺️ 카카오 호출 — 회원 전체를 모아 본다(/board/server 처럼 한 회원 열람이 아니라 열람 기록은 안 남긴다) */
router.get("/board/kakao", (_req, res) => {
    res.json(kakaoBoardOf());
});

router.get("/board/intel", (req, res) => {
    const memberId = boardMemberOf(req);
    auditBoardView(adminOf(req), memberId);
    const asked = Number.parseInt(String(req.query.limit ?? ''), 10);
    const limit = Math.min(200, Math.max(1, Number.isFinite(asked) ? asked : 40));
    const body: OpsBoardIntel = intelRowsOf({ userId: memberId, limit });
    res.json(body);
});

// ── 통계 ───────────────────────────────────────────────

/* 📊 시장에 뜬 실물 콜 — 기간은 옛 통계 문과 같은 읽기(rangeOf) · 셈은 services/callFlowStats 한 곳 */
router.get("/stats", (req, res) => {
    const { from, to } = clampStatsRange(rangeOf(req.query).from, rangeOf(req.query).to);   // 원문을 읽는 문이라 기간 상한
    const body: OpsStats = { from, to, ...marketStatsOf(from, to) };
    res.json(body);
});

// ── 위치 ───────────────────────────────────────────────

/**
 * 🗺️ **회원 위치 — 운전석 폰 GPS 마지막 점** (reviews/33 3단계 · 기사님 «가» · onedal-69 «가» Q5).
 *    세션의 lastFix 중 폰이 보낸 진짜 위치(lastFixSource 'gps')만 — 모의 주행 · 손으로 찍은 점은 «지금 어디 있나»에 섞으면 거짓 위치다.
 *    시 · 구는 동 명부(shared nearestDong · 카카오 안 부름). 세션이 없는 회원은 점이 없다(peek · 세션을 만들지 않는다).
 *    todayOnly: 홈 뱃지는 «지금 어디서 일하나»라 한국 날이 오늘인 점만 · /locations 는 오래된 점도 시각과 함께 다 준다.
 */
export function locationsOf({ todayOnly }: { todayOnly: boolean }): OpsLocations {
    const today = kstDateText(Date.now());
    const rows = getAllActiveUserIds().flatMap(memberId => {
        const s = peekUserSession(memberId);
        if (!s?.lastFix || s.lastFixSource !== 'gps' || s.lastFixAt == null) return [];
        if (todayOnly && kstDateText(s.lastFixAt) !== today) return [];
        const { x: lng, y: lat } = s.lastFix;
        return [{ memberId, lat, lng, at: new Date(s.lastFixAt).toISOString(), region: nearestDong({ lng, lat }).region }];
    });
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.region, (counts.get(r.region) ?? 0) + 1);
    const regions = [...counts.entries()].map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    return { rows, regions };
}

/* 좌표를 보는 문 — 열람 기록 «위치 봄»(같은 관리자가 60초 안에 다시 읽으면 줄을 안 더한다 · 현황판과 같은 묶기) */
router.get("/locations", (req, res) => {
    auditBoardView(adminOf(req), null, '위치 봄', '/locations');
    res.json(locationsOf({ todayOnly: false }));
});

// ── 홈 ─────────────────────────────────────────────────

/**
 * 🏠 **운영센터 홈 한 장** (reviews/33 2단계 · onedal-69 «가» · 모양은 onedal-ea) — 숫자는 그 쪽 문과 같은 함수로 센다.
 *    메뉴 숫자 opsCountsOf · 서버 점검 boardServerOf · 콜 opsCallsOf · 폰 phonesOf · 카카오 kakaoBoardOf(+shared kakaoTotalOf).
 *    🔴 읽기만 · 세션은 peek 만(남의 세션을 만들지 않는다).
 */
export function homeOf(io: any): OpsHome {
    const now = Date.now();
    const today = kstDateText(now) ?? '';
    const counts = opsCountsOf(io);
    const server = boardServerOf(io);
    const phones = allPhonesOf(io);
    const calls = opsCallsOf(null);

    /* 👥 회원 갈래 — 사실 칸에서(탈퇴 빼고 셈) · 사용 중은 shared accountBlocked 의 «막히지 않음» */
    const users = db.prepare(`SELECT approved_at, suspended_at, suspend_after_active, withdrawn_at, paid_until, auto_until, stats_until FROM users WHERE withdrawn_at IS NULL`).all() as
        Array<{ approved_at: string | null; suspended_at: string | null; suspend_after_active: number | null; withdrawn_at: string | null; paid_until: string | null; auto_until: string | null; stats_until: string | null }>;
    const factsOf = (u: typeof users[number]) => ({ approvedAt: u.approved_at, suspendedAt: u.suspended_at, suspendAfterActive: !!u.suspend_after_active, withdrawnAt: u.withdrawn_at, paidUntil: u.paid_until });
    const inGrace = (u: typeof users[number]) => !!u.approved_at && !u.suspended_at && !!u.paid_until && u.paid_until < today;
    const weekEnd = kstDateText(Date.parse(`${today}T00:00:00+09:00`) + 7 * 86_400_000) ?? '';
    const endsSoon = (d: string | null) => !!d && d >= today && d <= weekEnd;
    const members = {
        total: users.length,
        active: users.filter(u => !accountBlocked(factsOf(u), today)).length,
        pending: users.filter(u => !u.approved_at).length,
        suspended: users.filter(u => !!u.suspended_at).length,
        grace: users.filter(inGrace).length,
    };

    /* 🚗 운행 중 — 진행 중 콜(/calls 와 같은 함수)이 있는 기사마다 한 줄 · 다음 정거장은 도착 감지와 같은 nextStopOf(peek 세션 · 운전석 폰 마지막 점) */
    const byMember = new Map<string, OpsCall[]>();
    for (const c of calls) byMember.set(c.memberId, [...(byMember.get(c.memberId) ?? []), c]);
    const alertMembers = new Set<string>();
    const rows = [...byMember.entries()].map(([memberId, mine]) => {
        const session = peekUserSession(memberId);
        const next = session?.lastFix ? nextStopOf(session, session.lastFix) : null;
        const nextCall = next ? mine.find(c => c.id === next.orderId) : undefined;
        const stop = nextCall ? (next!.stopType === 'pickup' ? nextCall.pickup : nextCall.dropoff) : null;
        /* 🚨 진행 중 콜이 있는데 배차망 폰이 하나도 안 붙어 있거나(꺼 둔 예비 폰 하나로는 안 울린다) 위치가 10분 넘게 안 온다(운전석 GPS · 원달앱 폰 위치 중 늦은 것 · onedal-69 Q2 «가» · Q6 «나») */
        const myPhones = phones.filter(p => p.memberId === memberId);
        if (myPhones.length > 0 && !myPhones.some(p => p.status === 'ONLINE')) alertMembers.add(memberId);
        if (locationStaleOf(session?.lastFixAt, getUserDevicesSnapshot(memberId, io).map(d => d.lastLocationAt), now)) alertMembers.add(memberId);
        return {
            memberId,
            stage: mine.some(c => c.status === 'ORDER_PICKED_UP') ? '배송 중' : '상차 가는 중',
            nextStop: stop?.place ?? null,
            etaAt: stop?.at ?? null,
        };
    });

    /* 📡 배차망마다 — 마지막 실물 읽기 · 못 읽음 오늘 / 7일 · 오늘 처음 보는 글자 · 단계(services/opsHome) */
    const todayStartIso = new Date(Date.parse(`${today}T00:00:00+09:00`)).toISOString();
    const windowIso = new Date(now - NETWORK_ALARM.WINDOW_MS).toISOString();
    const deviceNow = getActiveDevicesSnapshot(io);
    const one = (sql: string, ...args: unknown[]) => (db.prepare(sql).get(...args) as { n: number }).n;
    const networks = TARGET_APPS.map(targetApp => {
        const last = db.prepare(`SELECT MAX(timestamp) t FROM intel WHERE targetApp = ? AND source = 'real'`).get(targetApp) as { t: string | null };
        const anomaliesToday = one(`SELECT COUNT(*) n FROM telemetry_anomalies WHERE target_app = ? AND created_at >= date('now', 'localtime')`, targetApp);
        const anomalies7d = one(`SELECT COUNT(*) n FROM telemetry_anomalies WHERE target_app = ? AND created_at >= datetime('now', 'localtime', '-7 days')`, targetApp);
        const newWords = one(`SELECT COUNT(*) n FROM screen_words WHERE target_app = ? AND first_seen >= ?`, targetApp, todayStartIso);
        const level = networkLevelOf({
            shownNow: deviceNow.some(d => d.status === 'ONLINE' && d.targetApp === targetApp),
            readsInWindow: one(`SELECT COUNT(*) n FROM intel WHERE targetApp = ? AND source = 'real' AND timestamp >= ?`, targetApp, windowIso),
            failsInWindow: one(`SELECT COUNT(*) n FROM telemetry_anomalies WHERE target_app = ? AND created_at >= datetime('now', 'localtime', ?)`, targetApp, `-${NETWORK_ALARM.WINDOW_MS / 60_000} minutes`),
            newWords,
        });
        return { targetApp, lastGoodAt: last.t, anomaliesToday, anomalies7d, newWords, level };
    });

    /* 📱 업데이트 필요 — 앱 배포 표의 이름 → 코드가 최소 판보다 낮은 폰 */
    const releases = listReleases().filter(r => r.app === 'scanner').map(r => ({ versionName: r.version, versionCode: r.versionCode }));
    const minimum = scrapReleaseCodes().appMinimumCode;
    const needUpdate = phones.filter(p => needsUpdateOf(p.appVersion, releases, minimum)).length;

    const keepAts = calls.filter(c => c.needsCall).map(c => c.capturedAt).filter(Boolean).sort();
    return {
        todo: {
            emergencies: alertMembers.size,
            networkAlarms: networks.filter(n => n.level === 'alarm').length,
            callsTodo: counts.callsTodo,
            oldestKeepAt: keepAts[0] ?? null,
            pendingMembers: counts.pendingMembers,
            expiringSoon: users.filter(u => !!u.approved_at && (endsSoon(u.paid_until) || endsSoon(u.auto_until) || endsSoon(u.stats_until) || inGrace(u))).length,
            phonesOffline: counts.phonesOffline,
            needUpdate,
        },
        access: { phonesOnline: phones.filter(p => p.status === 'ONLINE').length, phonesOffline: counts.phonesOffline, lastScrapAt: server.lastScrapAt, bootedAt: server.bootedAt, sockets: server.sockets },
        networks,
        working: { reporting: new Set(phones.filter(p => p.status === 'ONLINE').map(p => p.memberId)).size, driving: byMember.size, rows },
        regions: locationsOf({ todayOnly: true }).regions,   // 시 · 구 수만 — 좌표가 없어 열람 기록은 안 남긴다
        members,
        kakao: kakaoTotalOf(kakaoBoardOf().rows),
    };
}

router.get("/home", (req, res) => {
    res.json(homeOf(req.app.get("io")));
});

// ── 공지 ────────────────────────────────────────────────

router.get("/notices", (_req, res) => {
    res.json((db.prepare(`SELECT * FROM notices ORDER BY id DESC LIMIT 200`).all() as NoticeRow[]).map(noticeOf));
});

router.post("/notices", (req, res) => {
    const { text, activeUntil } = (req.body ?? {}) as { text?: unknown; activeUntil?: unknown };
    if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: "공지 글이 비었습니다." });
    const until = typeof activeUntil === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(activeUntil) ? activeUntil : null;
    const adminId = adminOf(req);
    const id = Number(db.prepare(`INSERT INTO notices (text, posted_at, active_until, posted_by) VALUES (?, datetime('now', 'localtime'), ?, ?)`).run(text.trim(), until, adminId).lastInsertRowid);
    audit(adminId, '공지 올림', null, text.trim().slice(0, 30));
    const notice: OpsNotice = noticeOf(db.prepare(`SELECT * FROM notices WHERE id = ?`).get(id) as NoticeRow);
    return res.json(notice);
});

router.post("/notices/:id/end", (req, res) => {
    const id = Number(req.params.id), adminId = adminOf(req);
    const row = db.prepare(`SELECT * FROM notices WHERE id = ?`).get(id) as NoticeRow | undefined;
    if (!row) return res.status(404).json({ error: "없는 공지입니다." });
    if (!row.ended_at) {
        db.prepare(`UPDATE notices SET ended_at = datetime('now', 'localtime'), ended_by = ? WHERE id = ?`).run(adminId, id);
        audit(adminId, '공지 내림', null, `#${id}`);
    }
    return res.json(noticeOf(db.prepare(`SELECT * FROM notices WHERE id = ?`).get(id) as NoticeRow));
});

// ── 글 ──────────────────────────────────────────────────

const contentOf = (kind: ContentKind): OpsContent => {
    const c = latestContent(kind);
    return c ? { kind, title: c.title, body: c.body, version: c.version, updatedAt: c.updatedAt } : { kind, title: '', body: '', version: 0, updatedAt: '' };
};

router.get("/contents", (_req, res) => {
    res.json(CONTENT_KINDS.map(contentOf));
});

/** 글 저장은 새 판 한 줄 — 옛 판을 덮어쓰지 않는다(동의가 판을 가리킨다) */
router.put("/contents/:kind", (req, res) => {
    const kind = req.params.kind;
    if (!isContentKind(kind)) return res.status(404).json({ error: "없는 글 종류입니다." });
    const { title, body } = (req.body ?? {}) as { title?: unknown; body?: unknown };
    if (typeof title !== 'string' || typeof body !== 'string') return res.status(400).json({ error: "제목과 본문이 필요합니다." });
    const adminId = adminOf(req);
    const version = (latestContent(kind)?.version ?? 0) + 1;
    db.prepare(`INSERT INTO contents (kind, version, title, body, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?)`).run(kind, version, title, body, nowText().t, adminId);
    audit(adminId, '페이지 글 적음', null, `${title || kind} ${version}판`);
    return res.json(contentOf(kind));
});

export default router;
