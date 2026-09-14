import { describe, it, expect } from 'vitest';
import { autoRadii, heldRadiusDistanceKm, RADIUS_BASE_KM_DEFAULT, type RadiusSet } from './phases';
import { resetToBaseFilter } from './index';

/**
 * 📐 **반경 자동 맞춤** (이식 C4-12 · 2026-09-12 · 계획서 §C4-12 에 규칙 ⑤-4 다섯).
 *
 * 기사님: *"필터의 목적지와의 거리에 따라 마름모 반경·현위반경·목적반경·라인반경이
 * **자동으로 바뀌어 주면 좋겠다**. 그래서 **자동, 수동**으로."* ·
 * *"지금 초월과 성남 이렇게 하려니까 **너무 가까워서 문제가 발생한다**."*
 *
 * 🔴 **왜 필요한가** (실측): 초월→성남은 15.6km 인데 현위 10 + 목적 15 = **25km** 다.
 *    원 둘이 거리보다 크니 마름모가 설 자리가 없어 **손잡이 셋이 아무 일도 안 한다**
 *    (마름모반경을 10km 로 줄여도 100km 로 키워도 163동 그대로).
 *
 * 🔴 **계산은 여기 한 곳이다** — 서버(`filterManager`)와 관제웹(`useCallNet`)이 같은
 *    함수를 부른다. 두 벌이면 «지도는 든다는데 판정은 탈락»이 된다 (규칙 ③).
 */
const BASE: RadiusSet = { pickupRadiusKm: 10, destinationRadiusKm: 15, quadRadiusKm: 25, detourRadiusKm: 6 };

describe('반경 자동 맞춤 (C4-12)', () => {
    it('🔴 기준 거리에서는 «아무것도 안 바뀐다»', () => {
        /**
         * 기준 40km 의 근거: 지금 값으로 거리만 바꿔 재니 **35km 부터 마름모가 일하기
         * 시작하고 40km 에서 폭이 106 으로 뛴다**(25km 6 · 30km 19 · 35km 36 · 45km 219).
         * 곧 이 값은 40km 안팎에 맞춰진 값이라, 거기서 배율 1.0 이 되는 것이 맞다.
         */
        expect(RADIUS_BASE_KM_DEFAULT).toBe(40);
        expect(autoRadii(40, BASE, 40)).toEqual(BASE);
    });

    it('🔴 가까우면 비율을 지키며 함께 줄어든다', () => {
        const r = autoRadii(20, BASE, 40);           // 배율 0.5
        expect(r.pickupRadiusKm).toBeCloseTo(5, 5);
        expect(r.destinationRadiusKm).toBeCloseTo(7.5, 5);
        expect(r.quadRadiusKm).toBeCloseTo(12.5, 5);
        expect(r.detourRadiusKm).toBeCloseTo(3, 5);
    });

    it('🔴 멀어도 «지금 값»을 넘지 않는다 — 잘 도는 것을 안 깬다', () => {
        /**
         * 순수 비례면 파주(62km)가 676 → **778동**으로 되레 넓어진다.
         * 멀리 갈 때는 지금도 넷이 다 일하고 있어 고칠 이유가 없다 — **가까울 때만 줄인다.**
         */
        expect(autoRadii(62, BASE, 40)).toEqual(BASE);
        expect(autoRadii(200, BASE, 40)).toEqual(BASE);
    });

    it('🔴 거리를 모르면 손대지 않는다 — 지어내지 않는다 (규칙 ④)', () => {
        expect(autoRadii(null, BASE, 40)).toEqual(BASE);
        expect(autoRadii(undefined, BASE, 40)).toEqual(BASE);
        expect(autoRadii(NaN, BASE, 40)).toEqual(BASE);
        /* 0km 도 «모른다»다 — 목적지가 내 발밑일 수는 없다 */
        expect(autoRadii(0, BASE, 40)).toEqual(BASE);
    });

    it('🔴 기준이 이상하면 손대지 않는다 — 0 으로 나누지 않는다', () => {
        expect(autoRadii(20, BASE, 0)).toEqual(BASE);
        expect(autoRadii(20, BASE, -5)).toEqual(BASE);
        expect(autoRadii(20, BASE, NaN)).toEqual(BASE);
    });

    it('🔴 기준값이 바뀌면 자동도 따라간다 — 원천은 기사님이 맞춘 값이다', () => {
        /* 평소값을 손으로 20/30/50/12 로 바꾸면 자동도 그 비율을 옮긴다 */
        const mine: RadiusSet = { pickupRadiusKm: 20, destinationRadiusKm: 30, quadRadiusKm: 50, detourRadiusKm: 12 };
        const r = autoRadii(20, mine, 40);
        expect(r.pickupRadiusKm).toBeCloseTo(10, 5);
        expect(r.quadRadiusKm).toBeCloseTo(25, 5);
    });

    it('🔴 각도는 안 건드린다 — 거리와 무관한 «방향 허용폭»이다', () => {
        const r = autoRadii(20, BASE, 40) as Record<string, unknown>;
        expect(r.srcAngleDeg).toBeUndefined();
        expect(r.dstAngleDeg).toBeUndefined();
        expect(Object.keys(r).sort()).toEqual(
            ['destinationRadiusKm', 'detourRadiusKm', 'pickupRadiusKm', 'quadRadiusKm']);
    });
});

/**
 * 📏 **자동 반경의 거리는 하루에 한 번 잰다** (기사님 확정 2026-09-14 · 필터.md §10-1 ③ 개정).
 *
 * 기사님: *"자동 반경은 그날 첫짐일 때 적용되는 거다. 위치가 바뀐다고 바뀌어서는 안 된다.
 * 그럼 나중에 관내콜을 할 수가 없다. 그리고 가는 길에 좋은 콜을 못 잡는다."*
 *
 * «7지점 한 바퀴» 실측: 합짐 때 «마지막 하차지(중리동) → 이천» 1.2km 로 다시 재서
 * 배율 0.03 — 목적 원 10km → 0.3km, 도착지 목록이 1곳이 됐다.
 */
describe('자동 반경 거리 — 들고 있으면 다시 재지 않는다 (2026-09-14)', () => {
    it('🔴 들고 있는 거리가 있으면 지금 잰 값을 버린다 (중리동 1.2km 로 줄지 않는다)', () => {
        expect(heldRadiusDistanceKm(18.2, 1.2)).toBe(18.2);
    });
    it('비어 있으면 지금 잰 값을 쓴다 — 그날 처음 · 다시 구하기(null) · 목적지를 바꾼 뒤', () => {
        expect(heldRadiusDistanceKm(undefined, 18.2)).toBe(18.2);
        expect(heldRadiusDistanceKm(null, 7.5)).toBe(7.5);
    });
    it('못 재면 없다 — 0 으로 지어내지 않는다 (규칙 ④)', () => {
        expect(heldRadiusDistanceKm(undefined, null)).toBeUndefined();
    });
    it('🔴 영업일이 바뀌면 비운다 — 어제 거리가 오늘 살아나지 않는다 (규칙 ③)', () => {
        const base = { radiusDistanceKm: 18.2 } as any;
        expect(resetToBaseFilter(base).radiusDistanceKm).toBeUndefined();
    });
});
