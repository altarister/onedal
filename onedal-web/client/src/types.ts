// 서버/클라이언트 공통 타입 정의 (Shared Types)

export interface OrderData {
    id: string;               // 서버에서 발급하는 UUID
    type: "NEW_ORDER" | "INTEL_BULK";
    origin: string;           // 상차지 (예: 경기 광주 오포)
    destination: string;      // 하차지 (예: 강남구 역삼동)
    price: number;            // 45000 (숫자)
    timestamp: string;        // ISO 8601 포맷
    status: "pending" | "completed" | "canceled";
}
