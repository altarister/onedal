import { Router } from "express";
import { ACK_KEYS, CONSENT_KINDS, isTargetApp, type AckKey, type Agreement, type ContentKind, type JoinInfo, type JoinMeReply, type JoinRequest } from "@onedal/shared";
import db from "../db";
import { accountGateOf } from "../core/accountGate";
import { latestContent, isContentKind } from "./contents";
import { slog } from "../utils/fileLogger";

/**
 * 🪪 **가입 · 동의 · 내 상태 · 탈퇴** (reviews/29 2단계 · shared join.ts 규격 · 붙일 때 requireAuth 한 번 — index.ts).
 * - 승인은 여기서 하지 않는다 — 새 가입은 approved_at 이 빈 채로 남고 운영센터가 승인한다. 기존 회원은 A1 옮기기로 이미 승인돼 있다
 * - 동의 판은 지금 최신 판과 같아야 받는다 — 다르면 409(그 사이 글이 고쳐졌다 · 화면이 글을 다시 읽어 동의 단계를 다시 그린다)
 * - 탈퇴는 지우지 않는다 — withdrawn_at 만 적는다(기록 · 콜은 남는다 · 파기는 관리자 손). 폰은 폰 문(core/accountGate)이 막는다
 */
const router = Router();

/** 종류별로 동의한 가장 높은 판 — 글 없는 고지(kind 'ack')는 판이 없어 섞지 않는다 */
function agreedOf(userId: string): Agreement[] {
    return db.prepare(`SELECT kind, MAX(version) AS version FROM agreements WHERE user_id = ? AND kind != 'ack' GROUP BY kind ORDER BY kind`).all(userId) as Agreement[];
}

/** 글 없는 필수 고지 둘이 다 있나 — 모르는 키가 섞여도 받지 않는다 */
function acksComplete(list: unknown): list is AckKey[] {
    return Array.isArray(list) && list.every(k => (ACK_KEYS as readonly string[]).includes(k)) && ACK_KEYS.every(k => list.includes(k));
}

/** 다시 동의할 글 — CONSENT_KINDS 가운데 글에 그 종류의 판이 있고, 동의가 없거나 동의 판 < 최신 판인 것. 글이 없는 종류는 요구하지 않는다 */
function reconsentOf(agreed: Agreement[]): ContentKind[] {
    return CONSENT_KINDS.filter(kind => {
        const latest = latestContent(kind);
        if (!latest) return false;
        const mine = agreed.find(a => a.kind === kind)?.version;
        return mine == null || mine < latest.version;
    });
}

function infoOf(phone: string | null, networks: string | null): JoinInfo | null {
    if (!phone && !networks) return null;
    let list: unknown = [];
    try { list = JSON.parse(networks ?? '[]'); } catch { list = []; }
    return { phone: phone ?? '', dispatchNetworks: Array.isArray(list) ? list.filter(isTargetApp) : [] };
}

export function joinMeOf(userId: string): JoinMeReply | null {
    const row = db.prepare(`SELECT phone, dispatch_networks FROM users WHERE id = ?`).get(userId) as { phone: string | null; dispatch_networks: string | null } | undefined;
    const gate = accountGateOf(userId);
    if (!row || !gate.facts) return null;
    const agreed = agreedOf(userId);
    return { ...gate.facts, blocked: gate.blocked, info: infoOf(row.phone, row.dispatch_networks), agreed, reconsent: reconsentOf(agreed) };
}

/** 동의 줄이 모두 지금 최신 판인가 — 아니면 그 종류 이름 */
function staleAgreement(list: unknown): string | null {
    if (!Array.isArray(list)) return 'agreements';
    for (const a of list as Agreement[]) {
        if (!isContentKind(a?.kind)) return String(a?.kind);
        if (latestContent(a.kind)?.version !== a.version) return a.kind;
    }
    return null;
}

function saveAgreements(userId: string, list: Agreement[]): void {
    // item 칸(4장 «항목») — 글 동의는 종류 이름 · 글 없는 고지는 kind 'ack' 줄에 고지 키(위 POST /)
    const put = db.prepare(`INSERT INTO agreements (user_id, kind, version, item, agreed_at) VALUES (?, ?, ?, ?, datetime('now', 'localtime'))`);
    for (const a of list) put.run(userId, a.kind, a.version, a.kind);
}

router.get("/me", (req, res) => {
    const me = joinMeOf(req.user!.id);
    return me ? res.json(me) : res.status(404).json({ error: "회원 정보가 없습니다." });
});

router.post("/", (req, res) => {
    const userId = req.user!.id;
    const { info, agreements, acknowledged } = (req.body ?? {}) as Partial<JoinRequest>;
    const phone = typeof info?.phone === 'string' ? info.phone.trim() : '';
    const networks = info?.dispatchNetworks;
    if (!phone || !Array.isArray(networks) || networks.length === 0 || !networks.every(isTargetApp)) {
        return res.status(400).json({ error: "연락처와 배차망을 확인해 주세요." });
    }
    if (!acksComplete(acknowledged)) return res.status(400).json({ error: "필수 고지에 모두 동의해 주세요." });
    const stale = staleAgreement(agreements ?? []);
    if (stale) return res.status(409).json({ error: "글이 바뀌었습니다. 다시 읽고 동의해 주세요.", kind: stale });
    db.transaction(() => {
        db.prepare(`UPDATE users SET phone = ?, dispatch_networks = ? WHERE id = ?`).run(phone, JSON.stringify(networks), userId);
        saveAgreements(userId, (agreements ?? []) as Agreement[]);
        const ack = db.prepare(`INSERT INTO agreements (user_id, kind, version, item, agreed_at) VALUES (?, 'ack', 0, ?, datetime('now', 'localtime'))`);
        for (const k of acknowledged) ack.run(userId, k);
    })();
    slog('통신', `🪪 [가입 정보] ${userId} — 배차망 ${networks.join(' · ')} · 동의 ${(agreements ?? []).length}건`);
    return res.json(joinMeOf(userId));
});

router.post("/agree", (req, res) => {
    const userId = req.user!.id;
    const list = (req.body ?? {}).agreements;
    const stale = staleAgreement(list);
    if (stale) return res.status(409).json({ error: "글이 바뀌었습니다. 다시 읽고 동의해 주세요.", kind: stale });
    saveAgreements(userId, list as Agreement[]);
    slog('통신', `🪪 [동의] ${userId} — ${(list as Agreement[]).map(a => `${a.kind} ${a.version}판`).join(' · ') || '없음'}`);
    return res.json(joinMeOf(userId));
});

router.post("/withdraw", (req, res) => {
    const userId = req.user!.id;
    db.prepare(`UPDATE users SET withdrawn_at = COALESCE(withdrawn_at, datetime('now', 'localtime')) WHERE id = ?`).run(userId);
    slog('통신', `🪪 [탈퇴] ${userId} — 폰 보고 거절 · 기록은 남는다`);
    return res.json({ ok: true });
});

export default router;
