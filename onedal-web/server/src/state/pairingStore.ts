import { slog } from '../utils/fileLogger';
import { maskPin } from "@onedal/shared";
/**
 * pairingStore.ts — 6자리 PIN 기반 기기 페어링 임시 저장소
 * 
 * PIN은 서버 메모리에 3분간 유효하게 보관되며, 1회 사용 후 즉시 폐기됩니다.
 * DB를 사용하지 않는 이유: 3분 TTL의 임시 데이터이므로 메모리가 훨씬 효율적.
 */

interface PendingPin {
    userId: string;
    expiresAt: number;
}

const pendingPins = new Map<string, PendingPin>();

/**
 * 만료된 PIN을 주기적으로 정리 (메모리 누수 방지)
 *
 * 🔴 `.unref()` — **이 타이머가 서버를 붙잡지 않게 한다**.
 * Node 는 살아 있는 타이머가 하나만 있어도 안 죽는다. 기사님이 Ctrl+C 를 누르셨을 때
 * `tsx` 가 *"Previous process hasn't exited yet. Force killing..."* 를 뱉은 이유 중
 * 하나가 이것이다. unref 한 타이머는 **할 일이 남았을 때만** 붙잡는다 —
 * 서버가 도는 동안에는 평소대로 1분마다 돌고, 끝낼 때만 조용히 비켜선다.
 */
setInterval(() => {
    const now = Date.now();
    for (const [pin, entry] of pendingPins) {
        if (now > entry.expiresAt) {
            pendingPins.delete(pin);
        }
    }
    /* 🔢 시도 한도 기록도 창·잠금이 지나면 지운다 — 대입이 쏟아져도 메모리가 안 쌓이게 */
    for (const m of [ipFails, deviceFails])
        for (const [k, f] of m) if (now - f.firstAt > PIN_TRY.WINDOW_MS && f.lockedUntil <= now) m.delete(k);
}, 60_000).unref(); // 1분마다 정리

/**
 * 새로운 6자리 PIN을 생성하고 userId와 매핑하여 메모리에 보관합니다.
 * 동일 userId로 이미 발급된 미사용 PIN이 있으면 폐기 후 새로 발급합니다.
 */
export function generatePin(userId: string): { pin: string; expiresIn: number } {
    // 기존에 이 유저가 받아간 미사용 PIN이 있으면 먼저 정리
    for (const [existingPin, entry] of pendingPins) {
        if (entry.userId === userId) {
            pendingPins.delete(existingPin);
        }
    }

    // 6자리 숫자 생성 (100000~999999)
    let pin: string;
    do {
        pin = Math.floor(100000 + Math.random() * 900000).toString();
    } while (pendingPins.has(pin)); // 극히 드문 충돌 방지

    const TTL_MS = 180_000; // 3분
    pendingPins.set(pin, {
        userId,
        expiresAt: Date.now() + TTL_MS,
    });

    slog('통신', `🔑 [PIN 발급] User: ${userId} → PIN: ${maskPin(pin)} (3분간 유효)`);
    return { pin, expiresIn: 180 };
}

/**
 * PIN을 소비(사용)합니다.
 * 유효한 PIN이면 해당 userId를 반환하고 PIN을 즉시 폐기합니다.
 * 만료되었거나 존재하지 않으면 null을 반환합니다.
 */
function consumePin(pin: string): string | null {
    const entry = pendingPins.get(pin);

    if (!entry) {
        return null; // 존재하지 않는 PIN
    }

    // 즉시 폐기 (1회용)
    pendingPins.delete(pin);

    if (Date.now() > entry.expiresAt) {
        return null; // 만료된 PIN
    }

    slog('통신', `✅ [PIN 소비] PIN: ${maskPin(pin)} → User: ${entry.userId} (페어링 성공)`);
    return entry.userId;
}

/**
 * 현재 활성 PIN 수를 반환합니다. (디버깅/모니터링용)
 */
export function getActivePinCount(): number {
    return pendingPins.size;
}

/**
 * 🔢 **연결 번호 시도 한도** (reviews/29 1단계 F · onedal-1f «가») — 코드 상수다. 기사님이 고칠 값이 아니다.
 *    3분 수명의 6자리(90만)를 대입하면 남의 계정에 폰을 붙일 수 있었다.
 *    같은 IP 가 10분 안에 5번 틀리면 · 같은 폰(deviceId)이 3번 틀리면 10분 잠근다 — 맞힐 확률이 0.0006% 로 준다.
 *    기사님이 번호를 한두 번 잘못 치는 일은 넉넉히 넘긴다. 메모리라 서버를 다시 띄우면 비는 것은 받아들인다.
 */
export const PIN_TRY = { IP_FAILS: 5, DEVICE_FAILS: 3, WINDOW_MS: 10 * 60_000, LOCK_MS: 10 * 60_000 } as const;

type Fails = { count: number; firstAt: number; lockedUntil: number };
const ipFails = new Map<string, Fails>();
const deviceFails = new Map<string, Fails>();

function lockLeftMs(m: Map<string, Fails>, key: string, now: number): number {
    const f = m.get(key);
    return f && f.lockedUntil > now ? f.lockedUntil - now : 0;
}

function recordFail(m: Map<string, Fails>, key: string, limit: number, now: number, what: string): void {
    const prev = m.get(key);
    const f = !prev || now - prev.firstAt > PIN_TRY.WINDOW_MS ? { count: 0, firstAt: now, lockedUntil: 0 } : prev;
    f.count += 1;
    if (f.count >= limit && f.lockedUntil <= now) {
        f.lockedUntil = now + PIN_TRY.LOCK_MS;
        slog('통신', `🔒 [연결 번호 잠금] ${what} ${key} — ${f.count}번 틀림 · ${PIN_TRY.LOCK_MS / 60_000}분 잠금`);
    }
    m.set(key, f);
}

export type PinTry = { ok: true; userId: string } | { ok: false; locked: boolean; retryInSec?: number };

/** 🔢 연결 번호를 한도 안에서 쓴다 — 잠겼으면 맞는 번호도 안 받는다 */
export function tryConsumePin(pin: string, who: { ip: string; deviceId: string }): PinTry {
    const now = Date.now();
    const left = Math.max(lockLeftMs(ipFails, who.ip, now), lockLeftMs(deviceFails, who.deviceId, now));
    if (left > 0) return { ok: false, locked: true, retryInSec: Math.ceil(left / 1000) };
    const userId = consumePin(pin);
    if (userId) {
        ipFails.delete(who.ip);
        deviceFails.delete(who.deviceId);
        return { ok: true, userId };
    }
    recordFail(ipFails, who.ip, PIN_TRY.IP_FAILS, now, 'IP');
    recordFail(deviceFails, who.deviceId, PIN_TRY.DEVICE_FAILS, now, '폰');
    return { ok: false, locked: false };
}
