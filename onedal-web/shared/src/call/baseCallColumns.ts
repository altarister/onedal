/**
 * 기본 콜 저장 열 목록
 * 누가: 서버 콜 표(orders) 열 더하기 · 저장 · 복원 (baseCallRow)
 * 언제: 기본 콜 타입을 고친 뒤 다시 뽑는다
 * 어디서: 🔴 생성 파일 — orderShapes.ts 의 BaseCall 타입에서 뽑는다. 손으로 고치지 말고 cd onedal-web && pnpm gen:pages basecall
 * 무엇을: 끝 칸 하나 = 열 하나. 여러 줄 칸은 JSON 글자. 맨 위 칸은 call_ 를 붙인다
 * 왜: 칸이 늘면 열도 따라 늘게 — 손으로 두 벌을 적지 않는다
 */
export type BaseCallColumnKind = 'TEXT' | 'REAL' | 'BOOL' | 'JSON';

export const BASE_CALL_COLUMNS: ReadonlyArray<{ column: string; path: readonly string[]; kind: BaseCallColumnKind }> = [
    { column: 'call_dispatcherName', path: ['dispatcherName'], kind: 'TEXT' },
    { column: 'call_dispatcherPhone', path: ['dispatcherPhone'], kind: 'TEXT' },
    { column: 'call_requesterName', path: ['requesterName'], kind: 'TEXT' },
    { column: 'call_fromOtherOffice', path: ['fromOtherOffice'], kind: 'BOOL' },
    { column: 'call_orderNo', path: ['orderNo'], kind: 'TEXT' },
    { column: 'call_clientOrderNo', path: ['clientOrderNo'], kind: 'TEXT' },
    { column: 'call_stage', path: ['stage'], kind: 'TEXT' },
    { column: 'route_listRegion_pickup', path: ['route', 'listRegion', 'pickup'], kind: 'TEXT' },
    { column: 'route_listRegion_dropoff', path: ['route', 'listRegion', 'dropoff'], kind: 'TEXT' },
    { column: 'route_pickup_customerName', path: ['route', 'pickup', 'customerName'], kind: 'TEXT' },
    { column: 'route_pickup_department', path: ['route', 'pickup', 'department'], kind: 'TEXT' },
    { column: 'route_pickup_contactName', path: ['route', 'pickup', 'contactName'], kind: 'TEXT' },
    { column: 'route_pickup_phone1', path: ['route', 'pickup', 'phone1'], kind: 'TEXT' },
    { column: 'route_pickup_phone2', path: ['route', 'pickup', 'phone2'], kind: 'TEXT' },
    { column: 'route_pickup_region', path: ['route', 'pickup', 'region'], kind: 'TEXT' },
    { column: 'route_pickup_addressDetail', path: ['route', 'pickup', 'addressDetail'], kind: 'TEXT' },
    { column: 'route_pickup_memo', path: ['route', 'pickup', 'memo'], kind: 'TEXT' },
    { column: 'route_pickup_loadingMethod', path: ['route', 'pickup', 'loadingMethod'], kind: 'TEXT' },
    { column: 'route_dropoff_customerName', path: ['route', 'dropoff', 'customerName'], kind: 'TEXT' },
    { column: 'route_dropoff_department', path: ['route', 'dropoff', 'department'], kind: 'TEXT' },
    { column: 'route_dropoff_contactName', path: ['route', 'dropoff', 'contactName'], kind: 'TEXT' },
    { column: 'route_dropoff_phone1', path: ['route', 'dropoff', 'phone1'], kind: 'TEXT' },
    { column: 'route_dropoff_phone2', path: ['route', 'dropoff', 'phone2'], kind: 'TEXT' },
    { column: 'route_dropoff_region', path: ['route', 'dropoff', 'region'], kind: 'TEXT' },
    { column: 'route_dropoff_addressDetail', path: ['route', 'dropoff', 'addressDetail'], kind: 'TEXT' },
    { column: 'route_dropoff_memo', path: ['route', 'dropoff', 'memo'], kind: 'TEXT' },
    { column: 'route_dropoff_loadingMethod', path: ['route', 'dropoff', 'loadingMethod'], kind: 'TEXT' },
    { column: 'route_viaDropoffs', path: ['route', 'viaDropoffs'], kind: 'JSON' },
    { column: 'route_pickupDistance', path: ['route', 'pickupDistance'], kind: 'REAL' },
    { column: 'route_deliveryDistance', path: ['route', 'deliveryDistance'], kind: 'REAL' },
    { column: 'money_lines', path: ['money', 'lines'], kind: 'JSON' },
    { column: 'money_paymentType', path: ['money', 'paymentType'], kind: 'TEXT' },
    { column: 'money_billingType', path: ['money', 'billingType'], kind: 'TEXT' },
    { column: 'load_vehicleType', path: ['load', 'vehicleType'], kind: 'TEXT' },
    { column: 'load_itemSize', path: ['load', 'itemSize'], kind: 'TEXT' },
    { column: 'load_itemDescription', path: ['load', 'itemDescription'], kind: 'TEXT' },
    { column: 'load_weightKg', path: ['load', 'weightKg'], kind: 'REAL' },
    { column: 'load_sizeCm', path: ['load', 'sizeCm'], kind: 'REAL' },
    { column: 'load_passengerCount', path: ['load', 'passengerCount'], kind: 'REAL' },
    { column: 'load_careTags', path: ['load', 'careTags'], kind: 'JSON' },
    { column: 'time_pickup_text', path: ['time', 'pickup', 'text'], kind: 'TEXT' },
    { column: 'time_pickup_reserved', path: ['time', 'pickup', 'reserved'], kind: 'BOOL' },
    { column: 'time_pickup_day', path: ['time', 'pickup', 'day'], kind: 'REAL' },
    { column: 'time_pickup_at', path: ['time', 'pickup', 'at'], kind: 'TEXT' },
    { column: 'time_pickup_after', path: ['time', 'pickup', 'after'], kind: 'TEXT' },
    { column: 'time_pickup_by', path: ['time', 'pickup', 'by'], kind: 'TEXT' },
    { column: 'time_dropoff_text', path: ['time', 'dropoff', 'text'], kind: 'TEXT' },
    { column: 'time_dropoff_reserved', path: ['time', 'dropoff', 'reserved'], kind: 'BOOL' },
    { column: 'time_dropoff_day', path: ['time', 'dropoff', 'day'], kind: 'REAL' },
    { column: 'time_dropoff_at', path: ['time', 'dropoff', 'at'], kind: 'TEXT' },
    { column: 'time_dropoff_after', path: ['time', 'dropoff', 'after'], kind: 'TEXT' },
    { column: 'time_dropoff_by', path: ['time', 'dropoff', 'by'], kind: 'TEXT' },
    { column: 'time_returnPickup_text', path: ['time', 'returnPickup', 'text'], kind: 'TEXT' },
    { column: 'time_returnPickup_reserved', path: ['time', 'returnPickup', 'reserved'], kind: 'BOOL' },
    { column: 'time_returnPickup_day', path: ['time', 'returnPickup', 'day'], kind: 'REAL' },
    { column: 'time_returnPickup_at', path: ['time', 'returnPickup', 'at'], kind: 'TEXT' },
    { column: 'time_returnPickup_after', path: ['time', 'returnPickup', 'after'], kind: 'TEXT' },
    { column: 'time_returnPickup_by', path: ['time', 'returnPickup', 'by'], kind: 'TEXT' },
    { column: 'time_remaining', path: ['time', 'remaining'], kind: 'TEXT' },
    { column: 'time_postTime', path: ['time', 'postTime'], kind: 'TEXT' },
    { column: 'job_tripType', path: ['job', 'tripType'], kind: 'TEXT' },
    { column: 'job_orderForm', path: ['job', 'orderForm'], kind: 'TEXT' },
    { column: 'job_tagsText', path: ['job', 'tagsText'], kind: 'TEXT' },
    { column: 'job_detailMemo', path: ['job', 'detailMemo'], kind: 'TEXT' },
];

/** 금액 줄에서 뽑아 SQL 이 읽는 요금 열 — 판정이 읽는 두 종류 */
export const BASE_CALL_FARE_COLUMNS = { total: 'money_total_won', income: 'money_income_won' } as const;

/** 화면 기록 열 */
export const CALL_EVIDENCE_COLUMN = 'call_evidence';
