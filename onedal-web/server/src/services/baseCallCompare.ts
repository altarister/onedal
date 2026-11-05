import { baseCallDiff, mergeBaseCall, mergeEvidence, officeValuesOf, type BaseCall, type CallEvidence, type OfficeOrder } from "@onedal/shared";
import { slog } from "../utils/fileLogger";
import { OrderRepository } from "../repositories/OrderRepository";

/**
 * 🔍 **보고마다 온 기본 콜 · 화면 기록을 합쳐 두고, 지금 콜 값과 견주고, 콜을 저장할 때 함께 쓴다** (계획서 D1 · D2) — 쓰는 값은 그대로다.
 * 콜 메모리와 따로 둔다 — 소켓에 실리지 않는다. 재시작하면 콜 표에서 되살린다(`restoreHeldBaseCall`).
 * 🔴 견주기가 터져도 보고는 그대로 간다.
 */
const KEEP = 200;
type Held = { call?: BaseCall; evidence?: CallEvidence; lastDiff: string | null };
const held = new Map<string, Held>();

const keyOf = (userId: string, id: string) => `${userId}:${id}`;

/** 온 조각 · 기록을 합쳐 둔다 — 조각이 없는 보고(옛 앱)는 아무것도 안 한다 */
export function holdBaseCall(userId: string, id: string, part: BaseCall | undefined, evidence?: CallEvidence): void {
    if ((!part && !evidence) || !id || id === 'unknown') return;   // 번호 없는 콜끼리 한 칸에 합쳐지지 않게
    try {
        const key = keyOf(userId, id);
        const prev = held.get(key);
        held.delete(key);
        held.set(key, {
            call: part ? mergeBaseCall(prev?.call, { ...part, id }) : prev?.call,
            evidence: evidence?.seen ? mergeEvidence(prev?.evidence, evidence) : prev?.evidence,
            lastDiff: prev?.lastDiff ?? null,
        });
        if (held.size > KEEP) held.delete(held.keys().next().value as string);
    } catch (e) {
        slog('경고', `🔍 [기본 콜 합치기 실패] ${id} — ${(e as Error).message}`);
    }
}

/** 합친 값과 지금 콜 값을 견준다 — 결과가 바뀔 때만 한 줄 */
export function compareBaseCall(userId: string, order: Partial<OfficeOrder> & { id: string }): void {
    const entry = held.get(keyOf(userId, order.id));
    if (!entry?.call) return;
    try {
        const diff = baseCallDiff(entry.call, order).join(' · ');
        if (diff === entry.lastDiff) return;
        entry.lastDiff = diff;
        slog('콜단계', `🔍 [기본 콜 견줌] ${entry.call.targetApp} ${order.id} — ${diff ? `다른 칸: ${diff}` : '같음'}`);
    } catch (e) {
        slog('경고', `🔍 [기본 콜 견주기 실패] ${order.id} — ${(e as Error).message}`);
    }
}

/** 💾 콜을 콜 표에 쓴 뒤 부른다 — 합쳐 둔 기본 콜 · 기록을 그 행에 쓴다. 쓰다 터져도 콜 저장은 그대로다 */
export function saveHeldBaseCall(userId: string, id: string): void {
    const entry = held.get(keyOf(userId, id));
    if (!entry) return;
    try {
        OrderRepository.saveBaseCall(id, userId, entry.call, entry.evidence);
    } catch (e) {
        slog('경고', `🎯 [기본 콜 저장 실패] ${id} — ${(e as Error).message}`);
    }
}

/**
 * ♻️ 재시작 뒤 콜 표에서 되살린 기본 콜 · 기록을 되돌려 둔다 — 이어 오는 보고가 그 위에 합쳐진다.
 * 복원은 덮어쓴다. 복원 전에 먼저 온 조각이 있으면 이어 오는 상세 보고가 다시 합친다.
 */
export function restoreHeldBaseCall(userId: string, id: string, saved: { call?: BaseCall; evidence?: CallEvidence }): void {
    if (!saved.call && !saved.evidence) return;
    held.set(keyOf(userId, id), { call: saved.call, evidence: saved.evidence, lastDiff: null });
    if (held.size > KEEP) held.delete(held.keys().next().value as string);
}

/** 🧹 기사 세션을 비울 때 그 기사의 합쳐 둔 기본 콜도 비운다 — 로그아웃 · 계정 막힘 뒤 메모리에 전화번호가 남지 않게 */
export function clearHeldBaseCalls(userId: string): void {
    for (const key of [...held.keys()]) if (key.startsWith(`${userId}:`)) held.delete(key);
}

/** 🎯 합쳐 둔 기본 콜로 만든 옛 칸 값 — 옛 길이 값을 낸 칸만 (계획서 D3). 기본 콜이 없는 콜(옛 앱)은 빈 묶음 */
export function officeValuesHeld(userId: string, order: Partial<OfficeOrder> & { id: string }): Partial<OfficeOrder> {
    const entry = held.get(keyOf(userId, order.id));
    if (!entry?.call) return {};
    try {
        return officeValuesOf(entry.call, order);
    } catch (e) {
        slog('경고', `🎯 [기본 콜 옛 칸 실패] ${order.id} — 지금 값을 쓴다 — ${(e as Error).message}`);
        return {};
    }
}
