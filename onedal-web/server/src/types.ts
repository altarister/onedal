// 서버/클라이언트 공통 타입 정의 (Shared Types)

export const EVENT_TYPES = {
    NEW_ORDER: "NEW_ORDER" as const,
    INTEL_BULK: "INTEL_BULK" as const,
};

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES];

export interface OrderData {
    id?: string;               // 서버에서 발급하는 UUID
    type: EventType;          // 보통 "NEW_ORDER"
    origin: string;           // 상차지 (예: 경기 광주 오포)
    destination: string;      // 하차지 (예: 강남구 역삼동)
    price: number;            // 45000 (숫자)
    timestamp: string;        // ISO 8601 포맷
    status?: "pending" | "completed" | "canceled";
}
