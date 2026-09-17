import { useSyncExternalStore } from 'react';
import { apiBase } from './bridge';

/**
 * 🚪 **시뮬 전용 문(`/api/sim/*`)을 여는 유일한 자리** (버그 대장 #161).
 *
 * 서버는 이 문들을 **운영에서 닫는다** — `server/src/routes/sim.ts` 의 `isDevBuild()`.
 * 기사님 실시간 좌표를 무인증으로 여는 문이라 **일부러** 닫은 것이다. 라이브의 404 는 답이다.
 *
 * 🔴 **닫힌 문의 답을 값으로 믿지 않는다** (규칙 ④). 404 본문 `{error:'not found'}` 을 그대로
 *    넘기면 그것이 «위치»·«시나리오»가 된다. **없는 것은 `null` 이다.**
 * 🔴 **카드마다 막지 않는다** — 그러면 `ok` 를 안 보는 자리가 새 카드마다 생긴다.
 *    `statusboardSimDoor` 검사가 «`/sim/` 직접 `fetch` 금지»를 잠근다.
 * 🔴 **닫힌 것을 알면 다시 안 묻는다** — 안 그러면 콘솔이 404 로 덮인다. 문은 서버 한 벌이라
 *    한 번 닫혔으면 이 서버에서는 계속 닫혀 있다 (`switchTarget` 은 새로고침하므로 기억도 사라진다).
 */
export type SimDoor = 'unknown' | 'open' | 'closed';

let door: SimDoor = 'unknown';
const watchers = new Set<() => void>();

const setDoor = (next: SimDoor) => {
    if (door === next) return;
    door = next;
    watchers.forEach(w => w());
};

const subscribe = (w: () => void) => { watchers.add(w); return () => { watchers.delete(w); }; };
const snapshot = (): SimDoor => door;

/** 🚪 이 서버에 시뮬 전용 문이 열려 있나 — 화면이 «없는 칸»을 안 세우게 */
export function useSimDoor(): SimDoor {
    return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** 📮 답 그대로 — 실패한 까닭을 화면이 적어야 하는 자리(콜 보내기)가 쓴다 */
export type SimReply<T> = { ok: true; data: T } | { ok: false; why: string; closed: boolean };

/**
 * 🚪 시뮬 문을 두드린다 — **`ok` 를 본 뒤에야** 본문을 값으로 만든다.
 * `path` 는 `/sim` **뒤**만 적는다 (`/driver-location` · `/scenario?key=…`).
 */
export async function simAsk<T>(path: string, init?: RequestInit): Promise<SimReply<T>> {
    if (door === 'closed') return { ok: false, why: '이 서버에는 시뮬 전용 문이 없다', closed: true };
    try {
        const r = await fetch(`${apiBase()}/sim${path}`, init);
        if (!r.ok) {
            const closed = r.status === 404;
            if (closed) setDoor('closed');
            const said = await r.json().then((d: { error?: string } | null) => d?.error).catch(() => undefined);
            return { ok: false, why: closed ? '이 서버에는 시뮬 전용 문이 없다' : (said ?? `HTTP ${r.status}`), closed };
        }
        setDoor('open');
        return { ok: true, data: await r.json() as T };
    } catch {
        return { ok: false, why: '서버에 못 닿았다', closed: false };
    }
}

/** 🚪 값만 필요한 자리 — **못 받았으면 `null`.** 0 도 빈 객체도 아니다 (규칙 ④) */
export async function simFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
    const r = await simAsk<T>(path, init);
    return r.ok ? r.data : null;
}
