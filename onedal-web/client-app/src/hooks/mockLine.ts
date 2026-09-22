/**
 * 🎭 **모의 주행이 달릴 선 — 심사 중에는 직전 선을 지킨다** (다섯 번째 바퀴 · onedal-49 가설 · 시험 도구).
 *
 * 후보콜이 판정에 들어오면 서버가 후보를 넣은 합짐 미리보기 선을 싣고(`OrderEvaluator` 의 `merged.polyline`),
 * 관제웹이 그 선을 지도에 그린다 — 기사님이 원한 «심사 중 점선 궤적»이라 **지도는 그대로다.**
 * 그런데 모의 주행이 같은 선으로 갈아타 13.1km 튀었고(06:30:09), 서버가 다음 틱을 «하차지를 떠났다»로 읽어
 * 확정 콜을 가짜로 하차 완료했다. 실 GPS 는 선을 안 따르니 **모의 주행이 달리는 선만** 가른다.
 */
type Pt = { x: number; y: number };

/** 심사 중이면 직전 선(없으면 지금 선) · 아니면 지금 선 */
export function mockLineOf(prev: Pt[] | null, current: Pt[] | null, evaluating: boolean): Pt[] | null {
    if (evaluating && prev?.length) return prev;
    return current;
}

/**
 * 🅿️ **모의 주행이 좌표를 내는가** (여섯 번째 바퀴 · 기사님 «콜을 못 잡으면 그 자리에서 대기»).
 *
 * 선이 사라진 것(콜 0건)은 멈출 까닭이 아니다 — 실 GPS 처럼 **달리던 자리(`parked`)에서 계속 낸다.**
 * 🔴 예전엔 선이 있어야만 냈다. 콜 0건이 되자 좌표가 끊겼고, 서버는 5초 뒤 «돌고 있는 모의 주행이 아니다»로 보고 기점을 집 주소로 잡았다.
 * 끝은 기사님이 끌 때(`running`) · 실 GPS 가 살아날 때뿐이다. 한 번도 달린 적 없으면 자리가 없으니 안 낸다 (규칙 ④).
 */
export function mockDriveOn(o: { simulator: boolean; running: boolean; realLive: boolean; hasLine: boolean; parked: boolean }): boolean {
    return o.simulator && o.running && !o.realLive && (o.hasLine || o.parked);
}
