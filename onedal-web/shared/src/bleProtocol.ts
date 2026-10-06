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
}

export interface PhoneDecision {
    deviceId: string;
    orderId: string;
    action: SupplyDecisionAction;
    /** 빨리 접기 남은 ms(서버 시계) — 없으면 칸 없음 */
    foldMs?: number;
}

export interface PhoneDecisionAck {
    deviceId: string;
    orderId: string;
}
