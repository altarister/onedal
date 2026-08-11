import { geocodeAddress } from './kakaoService';

/**
 * ⚠️⚠️ 임시 코드 — GPS 가 살아나면 통째로 지운다 ⚠️⚠️
 *
 * 기사님: *"일단 시간을 이야기하려면 얼마나 걸리는지 카카오로 정확히 알아야 하는데
 * **브라우저상 GPS 가 작동하지 못해서** 알 수가 없는 상황이다. 이럴 때는 출발지로
 * (아래 주소)를 넣어서 계산해 줘. 이건 임시 코드라고 명기해 주고
 * **GPS 작동하면 GPS 값으로 바꿔줘.**"*
 *
 * ══ 왜 필요한가 ══
 *
 * 현위치를 모르면 `현위치 → 상차지` 접근 구간을 계산할 수 없다.
 * 그러면 도착 예상이 나오지 않고, 통화에서 *"몇 시까지 갈 수 있다"* 를 말할 수 없다.
 * 지금은 화면이 정직하게 *"주행 시간을 아직 모릅니다"* 라고만 하는데,
 * 그 상태로는 **아무 시각도 약속할 수 없어** 통화 자체가 진행되지 않는다.
 *
 * ══ 지켜야 할 것 ══
 *
 * 1. **GPS 가 있으면 GPS 가 언제나 이긴다.** 이 값은 `driverLocation` 이 없을 때만 쓴다.
 * 2. 이 좌표로 계산했다는 사실을 **숨기지 않는다** (`isFallback`).
 *    화면이 "임시 출발지 기준"이라고 말할 수 있어야 한다.
 *    없는 위치를 아는 척하면 2026-08-11 에 고친 것과 같은 종류의 거짓말이 된다.
 * 3. 좌표를 손으로 박지 않는다 — 주소만 두고 **카카오로 한 번 지오코딩**해서 캐시한다.
 *    내가 찍은 좌표는 검증할 방법이 없다.
 */
export const FALLBACK_ORIGIN_ADDRESS =
    '경기도 광주시 초월읍 경충대로 1127번길 15 동광뷰엘 104동 601호';

let cached: { x: number; y: number } | null = null;
let tried = false;

/**
 * 임시 출발지 좌표. 첫 호출에서만 지오코딩하고 그 뒤로는 캐시를 쓴다.
 * 실패하면 `null` — **0,0 같은 가짜 좌표를 만들지 않는다.**
 */
export async function getFallbackOrigin(): Promise<{ x: number; y: number } | null> {
    if (cached) return cached;
    if (tried) return null;      // 한 번 실패했으면 매 요청마다 카카오를 두드리지 않는다
    tried = true;

    const coord = await geocodeAddress(FALLBACK_ORIGIN_ADDRESS);
    if (!coord) {
        console.warn(`⚠️ [임시 출발지] 지오코딩 실패 — 접근 구간은 계속 '모름'으로 둡니다: ${FALLBACK_ORIGIN_ADDRESS}`);
        return null;
    }
    cached = coord;
    console.log(`📍 [임시 출발지] GPS 미수신 시 사용할 좌표 확보: ${FALLBACK_ORIGIN_ADDRESS} → ${coord.x}, ${coord.y}`);
    return cached;
}

/**
 * 경로 계산에 쓸 출발지.
 *
 * **GPS 가 있으면 언제나 GPS.** 없을 때만 임시 주소로 대신한다.
 */
export async function resolveOrigin(
    driverLocation: { x: number; y: number } | null,
): Promise<{ origin: { x: number; y: number } | null; isFallback: boolean }> {
    if (driverLocation) return { origin: driverLocation, isFallback: false };
    const fb = await getFallbackOrigin();
    return { origin: fb, isFallback: !!fb };
}
