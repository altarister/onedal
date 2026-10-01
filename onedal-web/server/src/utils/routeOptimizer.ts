import { haversineKm } from "@onedal/shared";

/**
 * 정렬만 한다 — **받은 객체를 그대로 옮긴다.**
 * 🧭 제네릭인 이유: 호출부가 좌표에 이름표(orderId·stopType)를 붙여 넘기고, 그 이름표가
 *    정렬 뒤에도 살아 있어야 «구간의 주인»을 좌표 되짚기 없이 알 수 있다.
 */
export function optimizeWaypoints<T extends {x: number, y: number}>(
    startLoc: {x: number, y: number},
    pickups: T[],
    dropoffs: T[]
) {
    const sortedPickups: T[] = [];
    let currentLoc = startLoc;
    const pPool = [...pickups];
    while (pPool.length > 0) {
        let bestIdx = 0; let minD = Infinity;
        pPool.forEach((p, idx) => {
            const d = haversineKm(currentLoc, p);
            if (d < minD) { minD = d; bestIdx = idx; }
        });
        const best = pPool.splice(bestIdx, 1)[0];
        sortedPickups.push(best);
        currentLoc = best;
    }
    
    const sortedDropoffs: T[] = [];
    const dPool = [...dropoffs];
    while (dPool.length > 0) {
        let bestIdx = 0; let minD = Infinity;
        dPool.forEach((p, idx) => {
            const d = haversineKm(currentLoc, p);
            if (d < minD) { minD = d; bestIdx = idx; }
        });
        const best = dPool.splice(bestIdx, 1)[0];
        sortedDropoffs.push(best);
        currentLoc = best;
    }
    
    return { sortedPickups, sortedDropoffs };
}
