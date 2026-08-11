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
export const FALLBACK_ORIGIN_ADDRESS = '경기 광주시 초월읍 경충대로1127번길 15';

/**
 * 기사님이 구글 지도로 확인해 준 좌표 (2026-08-12).
 *   https://www.google.co.kr/maps/place/경기도+광주시+초월읍+경충대로1127번길+15
 *   → `!3d37.3766872!4d127.2944428`
 *
 * 카카오 지오코딩도 `127.294001, 37.377178` 로 거의 같은 점을 준다(약 50m 차이).
 * **둘이 일치한다는 것을 확인했으므로** 상수로 박아 둔다 —
 * 부팅 때마다 API 를 두드릴 이유가 없고, 키가 없거나 카카오가 죽어도 계산이 멈추지 않는다.
 */
const VERIFIED_COORD = { x: 127.2944428, y: 37.3766872 } as const;

/** 카카오 지오코딩이 이 반경(도) 밖 값을 주면 주소가 바뀐 것이다 — 조용히 쓰지 않는다 */
const COORD_DRIFT_TOLERANCE = 0.01;   // 약 1km

let cached: { x: number; y: number } | null = null;

/**
 * 임시 출발지 좌표.
 *
 * 확인된 상수를 즉시 돌려주고, **뒤에서 한 번 카카오로 대조**한다.
 * 어긋나면 경고만 남기고 상수를 계속 쓴다 (운행 중에 출발지가 말없이 바뀌면 더 나쁘다).
 */
export async function getFallbackOrigin(): Promise<{ x: number; y: number } | null> {
    if (cached) return cached;
    cached = { ...VERIFIED_COORD };
    console.log(`📍 [임시 출발지] GPS 미수신 — ${FALLBACK_ORIGIN_ADDRESS} (${cached.x}, ${cached.y}) 기준으로 계산합니다`);

    // 대조는 결과를 기다리지 않는다. 실패해도 계산은 그대로 진행된다
    geocodeAddress(FALLBACK_ORIGIN_ADDRESS).then(c => {
        if (!c) { console.warn('⚠️ [임시 출발지] 카카오 대조 실패 — 확인된 상수를 계속 씁니다'); return; }
        const drift = Math.max(Math.abs(c.x - VERIFIED_COORD.x), Math.abs(c.y - VERIFIED_COORD.y));
        if (drift > COORD_DRIFT_TOLERANCE) {
            console.warn(`⚠️ [임시 출발지] 카카오 좌표가 확인값과 ${drift.toFixed(4)}도 차이납니다 ` +
                `(카카오 ${c.x},${c.y} / 확인 ${VERIFIED_COORD.x},${VERIFIED_COORD.y}) — 주소를 다시 확인하세요`);
        }
    }).catch(() => {});

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
