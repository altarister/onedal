// ━━━━━━━━━━ [관제 배차 평가 상숫값] ━━━━━━━━━━
// 기사님이 언제든지 이 수치들을 조정해서 콜 판독 기준을 바꿀 수 있습니다.
export const DISPATCH_CONFIG = {
    // 1. 단독 주행 판독 기준 (분)
    SOLO_HONEY_TIME_MAX: 40,    // 이 시간 이하로 걸리면 '꿀'
    SOLO_SHIT_TIME_MIN: 90,     // 이 시간 이상 걸리면 '똥'

    // 2. 합짐(경유) 판독 기준 (추가 패널티)
    DETOUR_HONEY_TIME_MAX: 30,  // 추가되는 시간이 이 분 이하 AND
    DETOUR_HONEY_DIST_MAX: 15,  // 추가되는 거리가 이 분 이하면 '꿀'
    
    DETOUR_SHIT_TIME_MIN: 60,   // 추가되는 시간이 이 분 이상 OR
    DETOUR_SHIT_DIST_MIN: 30,   // 추가되는 거리가 이 분 이상이면 '똥'
    
    // 3. 통신 타임아웃 세팅 (밀리초)
    WAITING_WARNING_MS: 30000,  // 30초 후 경고 푸시
    WAITING_TIMEOUT_MS: 35000,  // 35초 후 강제 연결 해제
};
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
