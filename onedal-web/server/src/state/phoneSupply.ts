import { createHmac } from "node:crypto";
import { modeForPhone, SUPPLY_EVENTS, SUPPLY_NAMESPACE } from "@onedal/shared";
import type { DeviceModeType, PhoneSupply } from "@onedal/shared";
import db from "../db";
import { jwtSecret } from "../config/env";
import { allowanceOf } from "../core/allowance";
import { filterVersionOf } from "../core/helpers";
import { deviceLabelOf } from "../core/deviceAuth";
import { getDeviceMode, otherAutoPhoneOf } from "../routes/devices";
import { appFilterOf } from "./appFilter";
import { getUserSession } from "./userSessionStore";
import { slog } from "../utils/fileLogger";

/**
 * 📡 **관제앱 공급 소켓(`/supply`)에 갈 값 — 한 곳** (reviews/50 ①-1).
 * 기사님 단위 필터 + 폰마다 모드 · 심사 중 · 짝 서명. 관제앱 서비스가 받아 블루투스로 스캔폰에 넘긴다.
 * 🔴 **읽기만 한다** — 1초 주기가 부르므로 계산 · 로그 · 쓰기가 늘면 안 된다. 내일 콜 목록은 보고 문(scrap)이 센 `session.reservedPickup` 을 읽는다
 *    (`ensureReservedPickupList` 는 0곳이면 붙잡지 않고 다시 세며 로그를 찍는다). 내림 로그 둘은 바뀔 때만 찍는다.
 * 보내는 때: 1초 주기(안전망 · 데드맨 · 허락 시한 · 관제웹 붙음) + 기사님 손이 만든 바뀜(모드 문 · 필터 저장 · 결재 · 받았음)은 그 자리에서 바로 — 같은 `flushSupply` 다.
 */

/** 🛑 관제웹이 없어 자동 명령을 알람으로 내려주는 중인 기기 — 바뀔 때만 로그를 남긴다 */
const noWebLowered = new Set<string>();
/** 🔁 다른 폰도 자동 명령이라 알람으로 내려주는 중인 기기 — 바뀔 때만 로그를 남긴다 */
const otherAutoLowered = new Set<string>();
/** 📮 기사님마다 마지막으로 보낸 공급 글자 — 같으면 안 보낸다 */
const lastSupplyJson = new Map<string, string>();

/**
 * 🎛️ **이 폰이 실제로 돌 모드** — 보고 응답 `deviceControl.mode` 와 `phone-supply` 가 같은 이 함수를 부른다(두 벌 셈 없음).
 * 관제웹이 없거나(reviews/44) · 허락이 안 살았거나 · 다른 폰도 자동이면(reviews/48 가) 자동 명령도 알람. 표는 shared `modeTable.ts`.
 * shared `phoneModeOf` 는 관제웹 «적용중» 표시용 다른 함수다.
 */
export function modeSentToPhone(deviceId: string, userId: string, commanded: DeviceModeType = getDeviceMode(deviceId, userId)): DeviceModeType {
    const webAttached = !!getUserSession(userId).activeWebSession;
    const autoLive = allowanceOf(userId).autoLive;
    const otherAuto = otherAutoPhoneOf(deviceId, userId);
    const loweredByOtherAuto = commanded === 'AUTO' && otherAuto;
    if (loweredByOtherAuto !== otherAutoLowered.has(deviceId)) {
        if (loweredByOtherAuto) {
            otherAutoLowered.add(deviceId);
            slog('통신', `🔁 [자동은 한 폰] ${deviceLabelOf(deviceId)} 다른 폰도 자동 명령 — 알람으로 내려줌(자동으로 둘 폰을 다시 고르시면 풀림)`);
        } else {
            otherAutoLowered.delete(deviceId);
            slog('통신', `✅ [자동은 한 폰] ${deviceLabelOf(deviceId)} 자동 혼자 — 자동 그대로`);
        }
    }
    const loweredByNoWeb = commanded === 'AUTO' && autoLive && !webAttached;
    if (loweredByNoWeb !== noWebLowered.has(deviceId)) {
        if (loweredByNoWeb) {
            noWebLowered.add(deviceId);
            slog('통신', `🛑 [관제웹 없음] ${deviceLabelOf(deviceId)} 자동 명령을 알람으로 내려줌 — 결재할 관제웹이 없다`);
        } else {
            noWebLowered.delete(deviceId);
            slog('통신', `✅ [관제웹 붙음] ${deviceLabelOf(deviceId)} 자동 그대로`);
        }
    }
    return modeForPhone(commanded, autoLive, webAttached, otherAuto) as DeviceModeType;   // 받은 명령이 네 모드 중 하나라 결과도 넷 중 하나
}

/** 🔏 블루투스 짝 서명(기사님|폰) — 서버 비밀값에서 그때그때 · 저장하지 않는다 */
export function pairSigOf(userId: string, deviceId: string): string {
    return createHmac('sha256', jwtSecret()).update(`ble-pair|${userId}|${deviceId}`).digest('hex').slice(0, 32);
}

/** 📦 이 기사님의 공급 값 — 폰은 등록 폰 전부(블루투스로 먼저 붙어도 모드를 안다) */
export function phoneSupplyOf(userId: string): PhoneSupply {
    const session = getUserSession(userId);
    const { filter } = appFilterOf(session, userId, null, session.reservedPickup);
    const { evaluatingNow: _perPhone, ...shared } = filter as Record<string, unknown>;
    const ids = (db.prepare("SELECT device_id FROM user_devices WHERE user_id = ?").all(userId) as { device_id: string }[]).map(r => r.device_id);
    const phones: PhoneSupply['phones'] = {};
    for (const id of ids) {
        phones[id] = {
            mode: modeSentToPhone(id, userId),
            evaluatingNow: session.deviceEvaluatingMap.has(id),
            pairSig: pairSigOf(userId, id),
        };
    }
    return { filter: shared, filterVersion: filterVersionOf(shared), phones };
}

/** 🧯 공급이 터진 마지막 까닭 — 같은 까닭은 한 번만 적는다(1초 주기가 같은 오류를 매초 찍지 않게) */
let lastSupplyError = '';

/**
 * 📮 공급 소켓이 붙은 기사님이면 바뀐 때만(force 면 늘) `phone-supply` — 안 붙었으면 아무것도 안 한다.
 * 🔴 **던지지 않는다** — 필터 바뀜 · 모드 문 · 결재 한가운데서 불리므로, 공급이 터져도 부른 쪽 일은 끝까지 간다.
 */
export function flushSupply(io: any, userId: string, force = false): void {
    try {
        const nsp = io?.of?.(SUPPLY_NAMESPACE);
        if (!nsp?.adapter?.rooms?.get(userId)?.size) {
            lastSupplyJson.delete(userId);
            return;
        }
        const supply = phoneSupplyOf(userId);
        const json = JSON.stringify(supply);
        if (!force && json === lastSupplyJson.get(userId)) return;
        lastSupplyJson.set(userId, json);
        nsp.to(userId).emit(SUPPLY_EVENTS.supply, supply);
    } catch (e) {
        const why = e instanceof Error ? e.message : String(e);
        if (why !== lastSupplyError) {
            lastSupplyError = why;
            slog('경고', `🧯 [공급 소켓] 공급 값을 못 만들었다 — ${why}`);
        }
    }
}
