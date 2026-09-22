/**
 * 경로 포인트(지도 핀 렌더링 + ETA 매핑에 사용)
 */
export interface RoutePoint {
    type: string;
    name: string;
    isEvaluating: boolean;
    x?: number;
    y?: number;
    routeId?: string;
}

/*
 * 🧭 **관제웹은 방문 순서를 따로 만들지 않는다** (기사님 동의).
 *
 * 서버가 `optimizeWaypoints` 로 방문 순서를 만든다. 관제웹이 **한 벌 더** 만들어
 * 인덱스로 끼워 맞추면 두 순서가 어긋날 때 ETA 가 엉뚱한 정거장에 붙는다
 * ("파생값 두 벌"). 순서는 `sync-active-orders` 의 `routeStops` 가
 * 유일한 원천이고, tests/rules/routeOrderSingleSource.test.ts 가 이것을 지킨다.
 */

/**
 * 🕐 **칩의 시각은 `deriveRouteTimeline` 한 곳에서 만든다** — 카카오 `sectionEtas`(경로 계산
 *    시각 + 구간 주행 누적)를 그대로 옮기면 **정차를 안 세어**, 같은 화면의 시트와 다른 시각을
 *    말한다.
 */

