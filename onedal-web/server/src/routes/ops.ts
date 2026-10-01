import { Router, type Request } from "express";
import {
    CALL_NOTE_MEMO_MAX, CARGO_UNITS, LEGACY_CARGO_UNITS, CONTENT_KINDS, DEVICE_OFFLINE_LABEL, IN_PROGRESS_STATUSES, WORD_KINDS, isTargetApp, isoKst, restoreWindow,
    type CargoReport, type CargoUnit, type OpsAgreement, type OpsCallNote,
    type ContentKind, type OpsAnomaly, type OpsAudit, type OpsCall, type OpsContent, type OpsCounts, type OpsMember,
    type OpsMemberDetail, type OpsNotice, type OpsPhone, type OpsScreenWord, type TargetAppType, type WordKind,
} from "@onedal/shared";
import db from "../db";
import { getUserDevicesSnapshot } from "./devices";
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
};
const USER_SQL = `SELECT u.*, s.vehicle_type FROM users u LEFT JOIN user_settings s ON s.user_id = u.id`;

function networksOf(text: string | null): TargetAppType[] {
    try { const v = JSON.parse(text ?? '[]'); return Array.isArray(v) ? v.filter(isTargetApp) : []; } catch { return []; }
}

function phonesOf(userId: string, io: unknown): OpsPhone[] {
    return getUserDevicesSnapshot(userId, io).map(s => ({
        deviceId: s.deviceId,
        deviceName: s.deviceName ?? '',
        memberId: userId,
        status: s.status,
        offlineReason: s.offlineReason ? DEVICE_OFFLINE_LABEL[s.offlineReason] : null,
        lastSeenAt: s.lastSeen ? new Date(s.lastSeen).toISOString() : '',
        appVersion: s.version ?? '',
        mode: s.mode === 'AUTO' || s.mode === 'MANUAL' ? s.mode : 'ALARM',
        locationOn: s.lat != null && s.lng != null,
    }));
}

function memberOf(r: UserRow, io: unknown): OpsMember {
    return {
        id: r.id, name: r.name, email: r.email, phone: r.phone ?? '', vehicle: r.vehicle_type ?? '', networks: networksOf(r.dispatch_networks),
        role: r.role, createdAt: isoKst(r.created_at) ?? '', approvedAt: isoKst(r.approved_at), suspendedAt: isoKst(r.suspended_at),
        suspendAfterActive: !!r.suspend_after_active, withdrawnAt: isoKst(r.withdrawn_at), opsAllowedAt: isoKst(r.ops_allowed_at),
        paidUntil: null, autoAllowedAt: null, autoUntil: null, statsAllowedAt: null, statsUntil: null,
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
        kakaoUsage: null,
        agreements: (db.prepare(`SELECT kind, item, version, agreed_at FROM agreements WHERE user_id = ? ORDER BY id`).all(r.id) as
            { kind: OpsAgreement['kind']; item: string | null; version: number; agreed_at: string }[])
            .map(a => ({ kind: a.kind, item: a.item, version: a.version, at: isoKst(a.agreed_at) ?? '' })),
    };
    return res.json(detail);
});

/** 회원 한 줄을 바꾸고 기록 한 줄 — 자기 자신을 잠그는 일(정지 · 탈퇴)은 막는다 */
function memberWrite(req: Request, res: any, action: string, sql: string, params: unknown[], opts: { selfBlock?: boolean; cutSockets?: boolean; detail?: string } = {}) {
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
    memberWrite(req, res, '승인', `UPDATE users SET approved_at = COALESCE(approved_at, datetime('now', 'localtime')) WHERE id = ?`, []));

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
    const io = req.app.get("io");
    const ids = (db.prepare(`SELECT DISTINCT user_id FROM user_devices`).all() as { user_id: string }[]).map(r => r.user_id);
    res.json(ids.flatMap(id => phonesOf(id, io)));
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

router.get("/counts", (req, res) => {
    const pendingMembers = (db.prepare(`SELECT COUNT(*) n FROM users WHERE approved_at IS NULL AND withdrawn_at IS NULL`).get() as { n: number }).n;
    const io = req.app.get("io");
    const ids = (db.prepare(`SELECT DISTINCT user_id FROM user_devices`).all() as { user_id: string }[]).map(r => r.user_id);
    const phonesOffline = ids.flatMap(id => phonesOf(id, io)).filter(p => p.status !== 'ONLINE').length;
    const counts: OpsCounts = { pendingMembers, callsTodo: 0, phonesOffline };
    res.json(counts);
});

// ── 통화 도우미 ──────────────────────────────────────────

router.get("/calls", (req, res) => {
    const memberId = typeof req.query.memberId === 'string' && req.query.memberId ? req.query.memberId : null;
    const rows = db.prepare(`${ORDER_SQL} WHERE ${IN_PROGRESS_SQL}${memberId ? ' AND o.userId = ?' : ''} ORDER BY o.timestamp DESC`)
        .all(...inProgressParams(), ...(memberId ? [memberId] : [])) as OrderRow[];
    const calls = rows.map(opsCallOf);
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
    if (!stopType || unit === undefined || quantity === undefined || promised === undefined) return res.status(400).json({ error: "통화 결과 칸을 확인해 주세요." });
    if (memo.length > CALL_NOTE_MEMO_MAX) return res.status(400).json({ error: `메모는 ${CALL_NOTE_MEMO_MAX}자까지입니다.` });
    const actual = stepsView(o.id).find(s => s.step === (stopType === 'pickup' ? 'LOADED' : 'DELIVERED'));
    if (actual?.born && (actual.row as Record<string, any>).actual_unit != null) return res.status(409).json({ error: "기사님이 현장에서 적은 값이 있습니다." });
    const report = { stopType, kind: 'DECLARED', unit: unit ?? undefined, quantity: quantity ?? undefined, promisedArrivalAt: promised ?? undefined, memo: memo || undefined } as CargoReport;
    try {
        saveCargoReport(o.userId, o.id, report, adminId, req.app.get("io"));
    } catch (e) {
        if (e instanceof CargoReportError) return res.status(e.status).json({ error: e.message });
        throw e;
    }
    audit(adminId, '통화 결과 적음', o.userId, `${o.id.slice(-6)} · ${stopType === 'pickup' ? '상차' : '하차'} · ${unit ?? '-'} × ${quantity ?? '-'}${memo ? ` · ${memo.slice(0, 20)}` : ''}`);
    return res.json(opsCallOf(db.prepare(`${ORDER_SQL} WHERE o.id = ?`).get(o.id) as OrderRow));
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
