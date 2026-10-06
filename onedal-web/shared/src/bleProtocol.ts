import type { DeviceModeType } from './index';

/**
 * 📡 **관제앱 공급 소켓의 사건 · 틀 — 한 곳** (reviews/50 ①-1).
 * 서버는 이름공간 `/supply` 로 관제앱 서비스에 «폰에 갈 값»을 보내고, 관제앱이 블루투스로 스캔폰에 넘긴다.
 * 듣는 쪽은 관제앱 네이티브 서비스(자바)라 타입이 같이 돌지 않는다 — 칸 이름을 바꾸면 그쪽도 같이 고친다.
 */
export const SUPPLY_NAMESPACE = '/supply';

export const SUPPLY_EVENTS = {
    /** 서버 → 관제앱: 기사님 단위 필터 + 폰마다 모드 · 심사 중 · 짝 서명 (바뀔 때만) */
    supply: 'phone-supply',
    /** 서버 → 관제앱: 한 폰에 갈 결재 */
    decision: 'phone-decision',
    /** 관제앱 → 서버: 스캔폰이 결재를 실행했다 */
    decisionAck: 'phone-decision-ack',
    /** 서버 → 관제앱: 한 폰이 알람으로 연 미리보기 콜을 몇 ms 뒤 목록으로 접어라(판정 끝에 한 번 · 결재가 없는 콜) */
    fold: 'phone-fold',
} as const;

export type SupplyDecisionAction = 'KEEP' | 'CANCEL' | 'SIMULATED_KEEP';

export interface PhoneSupplyPhone {
    /** 그 폰이 실제로 돌 모드 — 서버 `modeSentToPhone` 결과(보고 응답 `deviceControl.mode` 와 같은 셈) */
    mode: DeviceModeType;
    /** 앞 콜을 결재 기다리는 중이라 다음 콜을 누르지 않는다 */
    evaluatingNow: boolean;
    /** 블루투스 짝 서명(기사님|폰) — 관제앱은 HELLO 의 서명과 견주기만 하고 저장하지 않는다 */
    pairSig: string;
}

export interface PhoneSupply {
    /** 폰에 가는 필터 본문 — 보고 응답 `dispatchEngineArgs` 와 같은 값에서 «심사 중»만 뺀 것 */
    filter: Record<string, unknown>;
    filterVersion: string;
    phones: Record<string, PhoneSupplyPhone>;
    /** 블루투스 광고 표시 [오늘 · 어제](영업일) — 원달앱이 광고에 싣고 관제앱은 이것과 맞는 폰에만 붙는다(남의 기사님 폰에 자리를 잡지 않게) */
    adTags: string[];
}

export interface PhoneDecision {
    deviceId: string;
    orderId: string;
    action: SupplyDecisionAction;
    /** 빨리 접기 남은 ms(서버 시계) — 없으면 칸 없음 */
    foldMs?: number;
}

export interface PhoneFold {
    deviceId: string;
    orderId: string;
    /** 접기까지 남은 ms(서버 시계) */
    remainMs: number;
}

export interface PhoneDecisionAck {
    deviceId: string;
    orderId: string;
}

/**
 * 📶 **블루투스 틀 — 관제앱(거는 쪽) ↔ 스캔폰 원달앱(받는 쪽 · 접근성 서비스 안 GATT 서버)** (reviews/50 ①-2).
 * 관제앱 자바 `BleProtocol.java` 와 원달앱이 같은 값을 쓴다 — 서버 `bleProtocolPair.test.ts` 가 자바를 글자로 읽어 견준다.
 * 쓰기 칸이 둘이다 — 큰 필터를 쪼개 보내는 도중에도 결재가 조각 사이로 먼저 간다(한 칸이면 틀이 깨져 끼울 수 없다).
 * - 작은 칸(관제앱 → 폰): 한 번 쓰기에 메시지 하나 `[종류 1][본문 JSON]` — PHONE · DECISION · BREATH
 * - 큰 칸(관제앱 → 폰): SUPPLY 만 `[길이 4 · 큰 끝][gzip JSON]` 을 512 바이트 조각으로 · 받는 쪽은 길이만큼 모아 푼다
 * - 알림 칸(폰 → 관제앱): `[종류 1][본문 JSON]` — HELLO · ACK · BREATH
 * 🔏 **주고받기 증명** — 짝 서명(pairSig)은 두 쪽이 서버에서 따로 받아 안다 · 공중에는 안 보낸다:
 *   관제앱 CHALLENGE `{nonce}` → 폰 HELLO `{deviceId, mac: HMAC(pairSig, 관제앱 nonce), nonce: 폰 nonce}` → 관제앱 PROOF `{proof: HMAC(pairSig, 폰 nonce)}`.
 *   폰은 PROOF 가 맞기 전까지 그 연결의 공급(SUPPLY · PHONE · DECISION · FOLD · BREATH)을 다 버린다 — 근처 기기가 «자동»이나 KEEP 을 넣지 못하게.
 *   HMAC-SHA256 · 열쇠는 pairSig 글자 · 결과는 16진 앞 32자.
 */
export const BLE_UUIDS = {
    service: '6f1d1000-1da1-4b1e-9e00-0000000000a1',
    small: '6f1d1001-1da1-4b1e-9e00-0000000000a1',
    big: '6f1d1002-1da1-4b1e-9e00-0000000000a1',
    notify: '6f1d1003-1da1-4b1e-9e00-0000000000a1',
} as const;

/** 메시지 종류 바이트 — HELLO `{deviceId, sig}` · SUPPLY `{filter, filterVersion}` · PHONE `{mode, evaluatingNow}` · DECISION `{orderId, action, foldMs?}` · ACK `{orderId}` · BREATH(관제앱 → 폰은 본문 1바이트 «서버 살아 있음» 1/0 · 폰 → 관제앱은 본문 없음) · FOLD `{orderId, remainMs}`(작은 칸) */
export const BLE_KINDS = { HELLO: 1, SUPPLY: 2, PHONE: 3, DECISION: 4, ACK: 5, BREATH: 6, FOLD: 7, CHALLENGE: 8, PROOF: 9 } as const;

/** 한 번 쓰기 최대 바이트 — 넘기면 받는 앱이 죽었다(0-3 시험 514) */
export const BLE_MAX_WRITE = 512;
/** 숨 간격 · 이만큼 아무것도 못 들으면 끊고 다시 붙는다(0-2 시험) */
export const BLE_BREATH_MS = 1000;
export const BLE_SILENT_MS = 5000;
