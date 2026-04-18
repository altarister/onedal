// 운전자의 현재 위치(웹 대시보드 브라우저 GPS 또는 목업 좌표) 보존 스토어
export let globalDriverLocation: { x: number, y: number } | null = null;

// [개발/테스트용 목업 GPS 좌표]
// 웹 브라우저 환경에서는 GPS 락이 늦게 잡히거나 아예 불가능한 경우가 많습니다.
// globalDriverLocation이 null일 때 카카오 경로 연산이 실패하지 않도록,
// PinnedRoute.tsx의 기본 좌표와 동일한 위치(경기 광주 부근)를 폴백으로 사용합니다.
const MOCK_DRIVER_LOCATION = { x: 127.29441569159479, y: 37.376544054495625 };

export function updateDriverLocation(loc: { x: number, y: number }) {
    globalDriverLocation = loc;
}

/**
 * 현재 운전자 위치를 반환합니다.
 * GPS가 아직 잡히지 않았거나 웹 개발환경에서 위치 권한이 없으면
 * 목업(Mock) 좌표를 반환하여 카카오 경로 연산이 중단되지 않도록 합니다.
 */
export function getDriverLocation(): { x: number, y: number } {
    if (globalDriverLocation) {
        return globalDriverLocation;
    }
    console.log(`📍 [GPS 폴백] 실제 GPS 미수신 → 개발용 목업 좌표 사용 (${MOCK_DRIVER_LOCATION.x}, ${MOCK_DRIVER_LOCATION.y})`);
    return MOCK_DRIVER_LOCATION;
}
