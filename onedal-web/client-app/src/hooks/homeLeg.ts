import { getDistanceKm } from '../lib/routeUtils';

/**
 * 🏠 **모의 주행 — 마지막 하차 뒤 집으로 떠나는 구간** (버그 대장 #133 · 시험 도구 · 개발 빌드 전용).
 *
 * 경로 끝(마지막 하차지)에서 멈추면 서버의 하차 완료(지나침 이탈 · 떠남)가 영영 안 찍힌다 —
 * 실제 기사님은 마지막 짐을 내리고 **집으로 간다.** 그 연기를 한다.
 * 🔴 **길은 도로 경로로 받는다** (`homeLegRoute.fetchHomeLeg` · 개발 전용) — 직선을 지어내지 않는다. 못 받으면 달리지 않는다.
 * 🔴 이 파일은 **순수 판단만** 둔다 — 서버 주소(`serverTarget` · `import.meta`)를 모의 주행 훅에 끌어오지 않게 (서버 jest 가 훅을 import 한다).
 */
type Pt = { x: number; y: number };

/** 달릴까 — 집·지금 자리를 알고, 아직 안 달렸고, 떠날 수 있을 만큼(`awayKm`) 집에서 멀 때만 */
export function homeLegNeeded(at: Pt | null | undefined, home: Pt | null | undefined, awayKm: number, done: boolean): boolean {
    if (done || !at || !home) return false;
    return getDistanceKm(at.y, at.x, home.y, home.x) > awayKm;
}
