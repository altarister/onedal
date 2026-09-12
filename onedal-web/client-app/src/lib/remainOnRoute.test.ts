import { describe, it, expect } from 'vitest';
import { remainOnRouteKm } from './remainOnRoute';

/**
 * 🛣️ **남은 거리는 «길을 따라» 잰다 — 직선이 아니다** (기사님 지적 2026-09-13:
 *    *"frontend에서 다 알고 있는 값일껀데."*).
 *
 * ── 왜 있나 ──
 * 시트 상태바가 정차 중에 «얼마나 더 가야 하나»를 말해야 하는데, 예전에 그 조각을 **뺐다** —
 * *"직선 거리는 우리가 아는 값 중 가장 부정확했다"*(B5 ㉱). 그래서 저는 서버가 도로 기준
 * 거리를 새로 줘야 한다고 봤다. **틀렸다.**
 *
 * 🔴 **폴리라인이 곧 도로다.** 카카오가 준 점열이 화면에 이미 와 있고(`routePolyline`),
 *    «경로 위 진행도»를 재는 함수도 `shared` 에 이미 있다(`progressAlongKm`).
 *      남은 거리 = 정거장의 진행도 − 내 위치의 진행도
 *    둘을 **같은 폴리라인·같은 함수**로 재니 일관되고, 산을 뚫지 않는다.
 *
 * 🟢 정거장이 도로에서 떨어져 있어도(실측: 물류센터 601m) 최근접 도로점으로 붙으므로
 *    그 값이 곧 «얼마나 더 달려야 하나»다.
 * ⚠️ **모르면 null 이다** — 경로가 없거나 이미 지났으면 지어내지 않는다 (규칙 ④).
 */
const northSouth = Array.from({ length: 101 }, (_, i) => ({ x: 127.3, y: 37.20 + i * 0.001 }));

describe('🛣️ 경로 위 남은 거리', () => {

    it('길을 따라 잰다 — 아래에서 위로 갈 때', () => {
        const km = remainOnRouteKm(northSouth, { x: 127.3, y: 37.21 }, { x: 127.3, y: 37.26 });
        /* 0.05° ≈ 5.5km */
        expect(km).not.toBeNull();
        expect(km!).toBeGreaterThan(5);
        expect(km!).toBeLessThan(6);
    });

    /**
     * 🔴 **이 한 건이 이 파일의 이유다** — ㄱ 자로 굽은 길.
     *    직선으로 재면 짧게 나오고, 길을 따라 재면 길다. 후자가 참이다.
     */
    it('🔴 굽은 길은 직선보다 멀다', () => {
        /* 동쪽으로 5km 간 뒤 북쪽으로 5km — 끝점은 직선 ~7km 인데 길은 ~10km */
        const elbow = [
            ...Array.from({ length: 51 }, (_, i) => ({ x: 127.30 + i * 0.00113, y: 37.20 })),
            ...Array.from({ length: 51 }, (_, i) => ({ x: 127.3565, y: 37.20 + i * 0.0009 })),
        ];
        const km = remainOnRouteKm(elbow, { x: 127.30, y: 37.20 }, { x: 127.3565, y: 37.2459 });
        expect(km!).toBeGreaterThan(9);
    });

    /** 🟢 정거장이 도로에서 떨어져 있어도 최근접 도로점으로 붙는다 (물류센터 601m) */
    it('정거장이 도로 밖이어도 잰다', () => {
        const offRoadStop = { x: 127.3 + 0.007, y: 37.26 };      // 옆으로 ~600m
        const km = remainOnRouteKm(northSouth, { x: 127.3, y: 37.21 }, offRoadStop);
        expect(km!).toBeGreaterThan(5);
        expect(km!).toBeLessThan(6);
    });

    /** 🔴 이미 지났으면 null — 음수를 «남았다»고 적지 않는다 (규칙 ④) */
    it('🔴 이미 지난 정거장이면 null 이다', () => {
        expect(remainOnRouteKm(northSouth, { x: 127.3, y: 37.26 }, { x: 127.3, y: 37.21 })).toBeNull();
    });

    it('🔴 경로나 위치를 모르면 null 이다 — 지어내지 않는다', () => {
        expect(remainOnRouteKm(undefined, { x: 127.3, y: 37.21 }, { x: 127.3, y: 37.26 })).toBeNull();
        expect(remainOnRouteKm(northSouth, null, { x: 127.3, y: 37.26 })).toBeNull();
        expect(remainOnRouteKm(northSouth, { x: 127.3, y: 37.21 }, null)).toBeNull();
        expect(remainOnRouteKm([{ x: 127.3, y: 37.2 }], { x: 127.3, y: 37.21 }, { x: 127.3, y: 37.26 })).toBeNull();
    });
});
