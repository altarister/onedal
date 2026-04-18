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
