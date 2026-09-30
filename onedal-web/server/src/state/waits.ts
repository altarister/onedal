import type { LogTag } from "@onedal/shared";
import { slog } from "../utils/fileLogger";

/**
 * ⏲️ **서버의 기다림 장부** — 서버가 거는 기다림(`setTimeout` 한 번짜리)은 모두 여기서 건다. `setInterval` 주기는 범위 밖이다.
 *
 * 부품마다 제 값 · 제 켜기 · 제 끄기를 맡고, 거는 순간 장부에 «이름 · 건 쪽 · 끝날 시각 · 콜»이 함께 적힌다.
 * 🔴 **장부를 따로 적는 길이 없다** — `setTimeout` 도, 장부 칸(`entries`)을 넣고 빼고 비우는 것도 이 파일에서만 한다(`waitLedger` 가 문다).
 * 🔴 서버는 **콜 번호(`orderId`)로** 끈다 — 장부 줄의 콜로 찾는다. 원달앱은 묶음(owner)으로 끈다.
 * 지금 걸린 것은 «⏲️ [기다림 …]» 로그로 본다. `/api/sim/preflight` 의 `waits` 칸에도 싣지만, 그 문은 **개발 빌드에서만** 열리고
 * 세션이 하나일 때만 답한다 — 실서버에서는 로그로 본다.
 */
export interface Wait {
    key: string;
    label: string;
    /** 건 쪽 — 경로·부품 이름 (로그·점검 표시용 · 끄는 기준이 아니다) */
    armedBy: string;
    orderId?: string;
    dueAt: number;
    tag: LogTag;
    handle: NodeJS.Timeout;
}

export interface WaitBook {
    entries: Map<string, Wait>;
}

export interface WaitSpec {
    label: string;
    armedBy: string;
    ms: number;
    orderId?: string;
    tag: LogTag;
    /** 이 기다림이 서버 종료를 붙잡지 않게 한다 */
    unref?: boolean;
}

/** 사용자 세션에 묶이지 않는 기다림 (카카오 미리 출발 보관) — 콜마다 걸려 «걸음» 줄은 찍지 않는다(끔·끝만) */
export const globalWaits: WaitBook = { entries: new Map() };

const lineOf = (w: Pick<Wait, 'label' | 'armedBy' | 'orderId'>, sec: number) =>
    `${w.label} ${sec}초 · ${w.armedBy}${w.orderId ? ` · 콜 ${w.orderId.slice(-6)}` : ''}`;

/** 건다 — 같은 키가 걸려 있으면 먼저 끈다(재시도가 겹쳐 넣으면 좀비가 남는다) */
export function armWait(book: WaitBook, key: string, spec: WaitSpec, fire: () => void): void {
    cancelWait(book, key, '다시 걸음');
    const handle = setTimeout(() => {
        const w = book.entries.get(key);
        if (w?.handle !== handle) return;
        book.entries.delete(key);
        slog(spec.tag, `⏲️ [기다림 끝] ${lineOf(spec, Math.round(spec.ms / 1000))}`);
        fire();
    }, spec.ms);
    if (spec.unref) handle.unref?.();
    book.entries.set(key, { key, label: spec.label, armedBy: spec.armedBy, orderId: spec.orderId, dueAt: Date.now() + spec.ms, tag: spec.tag, handle });
    if (book !== globalWaits) slog(spec.tag, `⏲️ [기다림 걸음] ${lineOf(spec, Math.round(spec.ms / 1000))}`);
}

/** 끈다 — 걸려 있던 것만 한 줄 남긴다 */
export function cancelWait(book: WaitBook, key: string, why: string): void {
    const w = book.entries.get(key);
    if (!w) return;
    clearTimeout(w.handle);
    book.entries.delete(key);
    slog(w.tag, `⏲️ [기다림 끔] ${lineOf(w, Math.max(0, Math.round((w.dueAt - Date.now()) / 1000)))} 남음 — ${why}`);
}

/** 한 콜에 걸린 기다림을 모두 끈다 — 키 모양과 상관없이 장부 줄의 콜로 찾는다 */
export function cancelOrderWaits(book: WaitBook, orderId: string, why: string): void {
    for (const w of [...book.entries.values()]) {
        if (w.orderId === orderId) cancelWait(book, w.key, why);
    }
}

/** 장부를 비운다 — 세션을 파기할 때. 로그는 남기지 않는다(세션 파기 줄이 따로 있다) */
export function cancelAllWaits(book: WaitBook): void {
    for (const w of book.entries.values()) clearTimeout(w.handle);
    book.entries.clear();
}

/** 지금 걸린 기다림 — 이름 · 건 쪽 · 콜 · 남은 초 */
export function waitsOf(book: WaitBook, now: number = Date.now()) {
    return [...book.entries.values()].map(w => ({
        key: w.key, label: w.label, armedBy: w.armedBy, orderId: w.orderId,
        remainSec: Math.max(0, Math.round((w.dueAt - now) / 1000)),
    }));
}
