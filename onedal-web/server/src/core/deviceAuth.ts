import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { DEVICE_LINK_ERRORS, DEVICE_TOKEN_HEADER } from "@onedal/shared";
import db from "../db";
import { slog } from "../utils/fileLogger";
import { enterLogWho } from "../utils/logContext";

/**
 * 🔑 **폰이 누구인가 — 폰 문 한 곳** (reviews/29 1단계 D·E · 기준 1).
 *
 * 폰 이름만으로 자기를 밝히면 남이 대입해 다른 기사의 콜을 건드릴 수 있었다. 연결 때 서버가 비밀 토큰을 주고
 * (`user_devices.token_hash` 에는 sha256 만) 폰 요청마다 헤더 `X-Device-Token` 으로 대조한다.
 * - 연결 안 된 폰 → 401 `DEVICE_NOT_PAIRED` (가짜 기사로 받지 않는다)
 * - 토큰이 틀림 → 401 `DEVICE_TOKEN_INVALID`
 * - 토큰이 없음 → 🔴 이번 단계는 통과(옛 앱) · 기기마다 한 줄. 기사님 폰 재연결 뒤 한 줄로 강제한다
 */
export type DeviceAuth =
    | { ok: true; userId: string; deviceId: string }
    | { ok: false; status: 401; error: string };

const hashOf = (token: string) => createHash("sha256").update(token).digest("hex");

/** 연결 때 새 토큰 — 원문(폰에 줄 것)과 해시(DB 에 둘 것) */
export function newDeviceToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString("hex");
    return { token, hash: hashOf(token) };
}

/** 요청의 폰 토큰 — express 는 헤더 이름을 소문자로 읽는다 */
export function deviceTokenOf(req: { headers?: Record<string, unknown> }): string | undefined {
    const v = req.headers?.[DEVICE_TOKEN_HEADER.toLowerCase()];
    return typeof v === "string" && v ? v : undefined;
}

const toldNoToken = new Set<string>();
const toldNotPaired = new Set<string>();

export function authDevice(deviceId: string | null | undefined, token: string | undefined): DeviceAuth {
    if (!deviceId) return { ok: false, status: 401, error: DEVICE_LINK_ERRORS.NOT_PAIRED };
    const row = db.prepare("SELECT d.user_id, d.token_hash, u.name FROM user_devices d LEFT JOIN users u ON u.id = d.user_id WHERE d.device_id = ?").get(deviceId) as
        { user_id: string; token_hash: string | null; name: string | null } | undefined;
    if (!row) {
        if (!toldNotPaired.has(deviceId)) { toldNotPaired.add(deviceId); slog('통신', `📵 [연결 안 된 폰] ${deviceId} — 보고 거절 (${DEVICE_LINK_ERRORS.NOT_PAIRED})`); }
        return { ok: false, status: 401, error: DEVICE_LINK_ERRORS.NOT_PAIRED };
    }
    if (token && row.token_hash) {
        const a = Buffer.from(hashOf(token), "hex"), b = Buffer.from(row.token_hash, "hex");
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
            slog('통신', `🚫 [폰 토큰 틀림] ${deviceId} — 거절 (${DEVICE_LINK_ERRORS.TOKEN_INVALID})`);
            return { ok: false, status: 401, error: DEVICE_LINK_ERRORS.TOKEN_INVALID };
        }
    } else if (!toldNoToken.has(deviceId)) {
        toldNoToken.add(deviceId);
        slog('통신', `🔑 [토큰 없는 폰] ${deviceId} — ${row.token_hash ? '토큰을 안 실음(옛 앱)' : '토큰을 받은 적 없음(재연결 전)'} · 이번 단계는 통과`);
    }
    enterLogWho(row.name, row.user_id);   // 🪪 이 폰 보고의 로그 줄 끝에 «@기사» (reviews/29 1단계 J)
    return { ok: true, userId: row.user_id, deviceId };
}
