/**
 * 🗺️ **카카오에 다시 물어야 하나** — 이미 받아 둔 순서가 남은 길을 덮으면 안 묻는다 (기사님 확정).
 *
 * 카카오 응답은 구간마다 거리·분을 따로 준다. 1·2·3·4 로 가는 중에 1 에 도착해도
 * 2·3·4 로 가는 구간은 **받아 둔 그 값 그대로**다. 그러니 도착·상차 완료·하차 통화·하차 완료·
 * 되돌리기에서는 다시 부를 것이 없다 — 지나온 구간만 빼면 된다.
 *
 * 🔴 다시 부르는 때는 넷이다.
 *    ① 정거장이 **는다** (새 콜을 확정했다)
 *    ② 예정에 없이 **빠진다** (콜을 취소·방출했다 — 남은 것이 받아 둔 순서에 없다)
 *    ③ **순서가 바뀐다** (통화로 굳힌 약속이 순서를 다시 정했다)
 *    ④ 기사님이 재탐색을 누르거나 경로를 크게 벗어났다 — 이 함수 밖에서 판단한다
 *
 * ⚠️ 받아 둔 분은 **부른 그 시각의 길 상태**다. 안 부르는 동안 그 값이 낡는 것은 ④ 로 갱신한다.
 */
export function routeNeedsRecompute(
    /** 카카오에 보낸 그 순서 (`sectionStops`) */
    sent: ReadonlyArray<{ orderId: string; stopType: 'pickup' | 'dropoff' }> | null | undefined,
    /** 지금 남은 정거장 — 다녀온 곳은 빼고, 갈 차례대로 */
    remaining: ReadonlyArray<{ orderId: string; stopType: 'pickup' | 'dropoff' }>,
): boolean {
    if (remaining.length === 0) return false;      // 갈 곳이 없다 — 경로를 지어내지 않는다
    if (!sent?.length) return true;                // 견줄 것이 없다

    /* 남은 것이 보낸 순서 안에 **같은 차례로** 다 들어 있나 (부분 수열) */
    let i = 0;
    for (const st of sent) {
        const want = remaining[i];
        if (want && want.orderId === st.orderId && want.stopType === st.stopType) i++;
    }
    return i < remaining.length;
}
