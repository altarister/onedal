export function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

/**
 * 정렬만 한다 — **받은 객체를 그대로 옮긴다.**
 * 🧭 제네릭인 이유: 호출부가 좌표에 이름표(orderId·stopType)를 붙여 넘기고, 그 이름표가
 *    정렬 뒤에도 살아 있어야 «구간의 주인»을 좌표 되짚기 없이 알 수 있다 (2026-08-29).
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
            const d = getDistanceKm(currentLoc.y, currentLoc.x, p.y, p.x);
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
            const d = getDistanceKm(currentLoc.y, currentLoc.x, p.y, p.x);
            if (d < minD) { minD = d; bestIdx = idx; }
        });
        const best = dPool.splice(bestIdx, 1)[0];
        sortedDropoffs.push(best);
        currentLoc = best;
    }
    
    return { sortedPickups, sortedDropoffs };
}
