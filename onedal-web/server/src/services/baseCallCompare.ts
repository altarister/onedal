import { baseCallDiff, mergeBaseCall, type BaseCall, type OfficeOrder } from "@onedal/shared";
import { slog } from "../utils/fileLogger";

/**
 * 🔍 **보고마다 온 기본 콜을 합쳐 지금 콜 값과 견준다** (계획서 D1) — 쓰는 값은 그대로다. 로그만 남긴다.
 * 콜 메모리와 따로 둔다 — 소켓에 실리지 않는다. 재시작하면 비어도 된다(저장은 D2 몫).
 * 🔴 견주기가 터져도 보고는 그대로 간다.
 */
const KEEP = 200;
type Held = { call: BaseCall; lastDiff: string | null };
const held = new Map<string, Held>();

const keyOf = (userId: string, id: string) => `${userId}:${id}`;

/** 온 조각을 합쳐 둔다 — 조각이 없는 보고(옛 앱)는 아무것도 안 한다 */
export function holdBaseCall(userId: string, id: string, part: BaseCall | undefined): void {
    if (!part) return;
    try {
        const key = keyOf(userId, id);
        const prev = held.get(key);
        held.delete(key);
        held.set(key, { call: mergeBaseCall(prev?.call, { ...part, id }), lastDiff: prev?.lastDiff ?? null });
        if (held.size > KEEP) held.delete(held.keys().next().value as string);
    } catch (e) {
        slog('경고', `🔍 [기본 콜 합치기 실패] ${id} — ${(e as Error).message}`);
    }
}

/** 합친 값과 지금 콜 값을 견준다 — 결과가 바뀔 때만 한 줄 */
export function compareBaseCall(userId: string, order: Partial<OfficeOrder> & { id: string }): void {
    const entry = held.get(keyOf(userId, order.id));
    if (!entry) return;
    try {
        const diff = baseCallDiff(entry.call, order).join(' · ');
        if (diff === entry.lastDiff) return;
        entry.lastDiff = diff;
        slog('콜단계', `🔍 [기본 콜 견줌] ${entry.call.targetApp} ${order.id} — ${diff ? `다른 칸: ${diff}` : '같음'}`);
    } catch (e) {
        slog('경고', `🔍 [기본 콜 견주기 실패] ${order.id} — ${(e as Error).message}`);
    }
}
