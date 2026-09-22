import type { DeviceSession } from '@onedal/shared';

/**
 * 📱 **폰이 «실제로 쓰는 값»을 서버 값과 비교한다** — 테스트 시작 전 점검용 (기사님 지시 2026-09-14)
 *
 * 기사님: *"지금 여러 번 같은 지점에 오류가 계속되고 있어 … 먼발치에서 근본적인 원인을 찾아 수정해야 할 것 같아"*
 *
 * 🔴 **그날 콜이 안 잡힌 두 번은 조건이 틀어져 있었는데 점검은 초록이었다.** 점검(`/api/sim/preflight`)이
 *    «서버가 정한 값»(`activeFilter`)만 봤기 때문이다:
 *    · 14:41 폰이 서버 응답을 못 읽어 **옛 필터 · 직접 모드(MANUAL)** 로 돌았다
 *    · 폰은 통신마다 «적용 중인 모드»(`appliedMode`)와 «들고 있는 필터 지문»(`filterVersion`)을 보낸다 —
 *      **서버는 이미 알고 있었다.** 그 순간 서버가 «보낼 지문»과 비교하는 곳이 없었을 뿐이다.
 *
 * 여기는 **비교만** 한다 — 값은 폰이 보낸 그대로(`devices.ts`), 보낸 지문은 `scrap.ts` 가 응답에 싣는 그것이다.
 * 검사: `tests/core/phoneCheck.test.ts`
 */

/** ⏱️ 지문이 바뀐 뒤 폰이 받기까지 기다려 주는 시간 — 폰의 생존신고가 60초라 그 한 번 + 여유 */
export const FILTER_SYNC_GRACE_MS = 70_000;
/** 📡 이보다 오래 소식이 없으면 «연락 끊김» — 생존신고 60초 */
export const CONTACT_STALE_MS = 60_000;

type SentFilter = { version: string; since: number };
/** 🧬 폰마다 «서버가 마지막으로 보낸 필터 지문»과 **그 지문이 처음 나간 때** */
const sentFilters = new Map<string, SentFilter>();

/**
 * `scrap.ts` 가 폰 응답에 싣는 지문을 계산한 **그 자리에서** 부른다 — 다른 곳에서 다시 계산하면
 * «점검은 맞다는데 폰은 다른 것을 받았다»가 된다 (규칙 ③).
 * 지문이 **바뀔 때만** «언제부터»를 새로 잡는다 — 매 통신마다 잡으면 «받는 중»이 영영 안 끝난다.
 */
export function rememberSentFilterVersion(deviceId: string, version: string, now: number = Date.now()): void {
    if (sentFilters.get(deviceId)?.version === version) return;
    sentFilters.set(deviceId, { version, since: now });
}

export function sentFilterVersionOf(deviceId: string): SentFilter | undefined {
    return sentFilters.get(deviceId);
}

/** 검사끼리 섞이지 않게 비운다 */
export function forgetSentFilterVersions(): void {
    sentFilters.clear();
}

export interface PhoneCheck {
    deviceId: string;
    name: string;
    appVersion: string | null;
    /** 관제웹에서 정한 모드 ↔ 폰이 대답한 모드. 대답이 없으면 `got: null` — 초록으로 지어내지 않는다 (규칙 ④) */
    mode: { want: string; got: string | null; ok: boolean };
    /**
     * `same` 최신 · `waiting` 바뀐 지 얼마 안 됨(다음 통신에 실려 간다) ·
     * `stale` 오래 다름 = 폰이 옛 필터로 돈다 · `unknown` 비교할 재료가 없다
     */
    filter: { state: 'same' | 'waiting' | 'stale' | 'unknown'; ok: boolean; ageSec: number | null };
    contact: { ageSec: number | null; ok: boolean };
}

export function phoneCheckOf(d: DeviceSession, sent: SentFilter | undefined, now: number): PhoneCheck {
    const mode = { want: d.mode, got: d.appliedMode ?? null, ok: !!d.appliedMode && d.appliedMode === d.mode };

    let filter: PhoneCheck['filter'];
    if (!sent || !d.filterVersion) filter = { state: 'unknown', ok: false, ageSec: null };
    else if (sent.version === d.filterVersion) filter = { state: 'same', ok: true, ageSec: 0 };
    else {
        const age = now - sent.since;
        const ageSec = Math.round(age / 1000);
        filter = age > FILTER_SYNC_GRACE_MS
            ? { state: 'stale', ok: false, ageSec }
            : { state: 'waiting', ok: true, ageSec };
    }

    const contact = d.lastSeen
        ? { ageSec: Math.round((now - d.lastSeen) / 1000), ok: now - d.lastSeen <= CONTACT_STALE_MS }
        : { ageSec: null, ok: false };

    return { deviceId: d.deviceId, name: d.deviceName ?? d.deviceId, appVersion: d.version ?? null, mode, filter, contact };
}
