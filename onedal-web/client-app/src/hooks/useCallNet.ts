/**
 * 🕸️ **콜 그물 — 지금 필터가 무엇을 담고 있나** (이식 B3-2 · 2026-09-11).
 *
 * 지도 실험실이 나흘 동안 기사님과 맞춰 온 그물을 **실물 지도에도** 그리려고 만든 훅이다.
 * 계산은 `@onedal/shared` 의 `netForGoal` 하나다 — 실험실과 **같은 함수**를 부른다
 * (기사님 확정 2026-09-11 · 계획서 §4 Q1: *«실험실 계산을 올린다»*).
 *
 * ```
 * 동선   마름모 하나 — 기점은 내 위치
 * 노선   잡은 콜들이 만든 실제 경로 양옆 «라인 반경» ∪ 마지막 하차지 → 목적지 마름모
 * ```
 *
 * 🔴 **재료가 하나라도 없으면 `null` 이다** — 그물을 지어내지 않는다 (규칙 ④).
 *    목적지를 모르거나 내 위치를 모르면 그릴 것이 없다.
 *
 * ⚠️ **마름모 각도·반경은 아직 실물에 저장할 칸이 없다** (계획서 §5). 실험실 기본값을 쓴다 —
 *    기사님이 고칠 칸은 필터를 옮기는 C 단계에서 판다. 그때까지는 **화면이 이 값으로 그린다**는
 *    것을 여기 적어 둔다 (규칙 ⑤-4 ④: 화면이 조용히 거짓말하지 않게).
 */
import { useMemo } from 'react';
import { netForGoal, mergeGoalNets, cityCenter, type NetPoint, type NetResult } from '@onedal/shared';
import type { SecuredOrder } from '@onedal/shared';

/**
 * 📐 **실물에 칸이 없는 값들** — 실험실 기본값 그대로.
 * 🔴 여기 숫자를 «적당히» 고르지 않는다. 실험실에서 기사님과 맞춘 값이고,
 *    C 단계에서 `user_filter_phases` 에 칸이 생기면 **이 상수는 지운다.**
 */
export const NET_SHAPE_DEFAULTS = {
    /** 출발지 각도(전체 °) — 얼마나 돌아도 되나 */
    srcAngleDeg: 110,
    /** 목적지 각도(전체 °) — 둘레를 얼마나 넓게 볼까 */
    dstAngleDeg: 110,
    /** 마름모 반경 km — 축에서 좌우로 */
    quadRadiusKm: 25,
} as const;

export interface CallNetInput {
    /** 도착 목표 — 시·군·구 이름 (필터의 `destinationCity`) */
    destinationCity?: string;
    /** 내 위치 — 마름모의 출발 꼭짓점 */
    myLocation: { x: number; y: number } | null;
    /** 상차 반경 km (필터) */
    pickupRadiusKm?: number;
    /** 하차지 주변 반경 km (필터) */
    destinationRadiusKm?: number;
    /** 라인 반경 km — 경로 양옆으로 몇 km 까지 (필터의 `detourRadiusKm` 자리) */
    lineRadiusKm?: number;
    /** 🧭 경로를 든 콜 — 있으면 «노선»(라인 그물), 없으면 «동선»(마름모 하나) */
    routeHolder?: SecuredOrder | null;
}

export interface CallNet {
    net: NetResult;
    /** 라인으로 만든 그물인가 — 그리는 쪽이 제 조건으로 다시 판단하지 않게 함께 낸다 (규칙 ③) */
    usedLine: boolean;
    /** 🎯 목적지 — 지도가 마커로 찍는다 */
    goal: NetPoint;
}

export function useCallNet(i: CallNetInput): CallNet | null {
    const { destinationCity, myLocation, pickupRadiusKm, destinationRadiusKm, lineRadiusKm, routeHolder } = i;
    const polyline = routeHolder?.routePolyline;

    /** 🔴 점열을 **문자로 굳혀** 의존성으로 삼는다 — 매 렌더 새 배열이면 그물을 매번 다시 만든다 */
    const lineKey = useMemo(
        () => (polyline?.length ?? 0) >= 2 ? `${polyline!.length}:${polyline![0].x},${polyline![polyline!.length - 1].y}` : '',
        [polyline]);

    return useMemo(() => {
        if (!destinationCity || !myLocation) return null;
        const goal = cityCenter(destinationCity);
        if (!Number.isFinite(goal.lng) || !Number.isFinite(goal.lat)) return null;   // 모르는 도시 — 지어내지 않는다

        const line: Array<[number, number]> | null = (polyline?.length ?? 0) >= 2
            ? polyline!.map(p => [p.x, p.y] as [number, number]) : null;
        /** 🏁 마름모가 시작하는 자리 — 라인이 끝나는 곳(마지막 하차지). 라인이 없으면 내 위치에서 시작한다 */
        const lastDrop: NetPoint | null = line
            ? { name: '마지막 하차지', lng: line[line.length - 1][0], lat: line[line.length - 1][1] }
            : null;

        const net = netForGoal(goal, {
            line,
            lineRadiusKm: lineRadiusKm ?? 6,
            lastDrop,
            params: {
                ...NET_SHAPE_DEFAULTS,
                srcDiamKm: (pickupRadiusKm ?? 10) * 2,
                dstDiamKm: (destinationRadiusKm ?? 15) * 2,
            },
            anchor: { name: '내 위치', lng: myLocation.x, lat: myLocation.y },
        });
        /**
         * 🔴 **합치는 규칙은 `mergeGoalNets` 한 곳이다** — 겹침·지나온 곳·통째 제외를 거기서 본다.
         * ⚠️ 제외 지역(`excluded`)은 실물에 아직 칸이 없다 (계획서 §3 ③) — 빈 배열이다.
         *    진행도 트림(`myProgressKm`)도 아직 안 건다 — 달리며 지나온 동을 빼는 것은 다음 판이다.
         */
        const merged = mergeGoalNets([net], { departed: false, myProgressKm: 0, excluded: [] });
        return { net: { ...net, pass: merged.pass, groups: merged.groups, count: merged.count }, usedLine: !!line, goal };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- polyline 은 lineKey 로 굳혀 본다 (위 주석)
    }, [destinationCity, myLocation?.x, myLocation?.y, pickupRadiusKm, destinationRadiusKm, lineRadiusKm, lineKey]);
}
