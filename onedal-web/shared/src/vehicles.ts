export const VEHICLE_OPTIONS = [
    '오토바이', 
    '다마스', 
    '라보', 
    '승용차', 
    '1t', 
    '1.4t', 
    '2.5t', 
    '3.5t', 
    '5t', 
    '11t', 
    '25t', 
    '특수화물'
] as const;

export type VehicleType = typeof VEHICLE_OPTIONS[number];

/**
 * 물류/배차 중심의 차량 이름을 카카오내비 기준 차종 코드(car_type)로 매핑합니다.
 * 카카오내비 기준:
 * 1: 1종 (승용차/소형승합/소형화물)
 * 2: 2종 (중형승합/중형화물)
 * 3: 3종 (대형승합/2축 대형화물)
 * 4: 4종 (3축 대형화물)
 * 5: 5종 (4축 이상 특수화물)
 * 6: 6종 (경차)
 * 7: 이륜차 (오토바이)
 */
export function mapVehicleToKakaoCarType(vehicle: string): number {
    switch(vehicle) {
        case '오토바이':
            return 7; // 이륜차
        case '특수화물':
            return 5; // 특수화물
        case '11t':
        case '25t':
            return 4; // 4종 대형화물
        case '5t':
            return 3; // 3종 대형화물
        case '2.5t':
        case '3.5t':
            return 2; // 2종 중형화물
        case '1t':
        case '1.4t':
        case '다마스':
        case '라보':
        case '승용차':
        default:
            return 1; // 1종 소형화물 (디폴트)
    }
}

/**
 * 합짐 모드 시 허용 차종 자동 추론
 * 
 * 첫 짐의 차종을 기반으로 "남은 적재 공간에 실을 수 있는 차종" 목록을 반환합니다.
 * 예: 첫 짐이 1t → 다마스, 라보, 오토바이급만 추가 적재 가능
 * 예: 첫 짐이 라보 → 라보, 다마스, 오토바이급만 추가 적재 가능
 * 
 * VEHICLE_OPTIONS 배열이 작은 차 → 큰 차 순서이므로, 
 * 첫 짐 차종의 인덱스보다 작거나 같은 차종들만 반환합니다.
 */
export function getSharedModeVehicleTypes(firstLoadVehicle: string): string[] {
    const idx = VEHICLE_OPTIONS.indexOf(firstLoadVehicle as any);
    if (idx === -1) return [...VEHICLE_OPTIONS]; // 알 수 없는 차종이면 전체 허용
    // 첫 짐과 같거나 작은 차종만 합짐 대상 (배열 앞쪽이 작은 차)
    return VEHICLE_OPTIONS.slice(0, idx + 1) as unknown as string[];
}
