import { describe, it, expect } from 'vitest';
import { buildAppFilterOutput, type LabFilterInputs } from './labFilterOutput';

/**
 * 🧪 **아웃풋에 실물 필터의 요소가 빠지지 않았는가** (기사님 2026-09-07:
 * *"불러와서 요소가 빠진 것이 있는지 확인해봐 — 구조·요소·키만 맞으면 될 것 같아"*).
 *
 * 키의 «오타·없는 키»는 labFilterOutput.ts 의 `satisfies Partial<AutoDispatchFilter>` 가
 * 컴파일에서 잡는다. 여기서는 반대 방향을 잠근다 — **있어야 할 요소가 실제로 실리는가.**
 * 요소 목록의 원천: 실물 필터 설정 모달(관제웹) + AutoDispatchFilter + user_filter_phases.
 */

const BASE: LabFilterInputs = {
    callTarget: 'DEST' as const, localMode: false, dispatchPhase: 'STANDBY', driving: false,
    dstName: '파주 시내',
    groups: [
        { region: '광주시', names: ['초월읍', '곤지암읍'] },
        { region: '이천시', names: ['부발읍'] },
    ],
    pass: [
        { x: 127.29, y: 37.37, name: '초월읍', region: '광주시' },
        { x: 127.34, y: 37.35, name: '곤지암읍', region: '광주시' },
        { x: 127.49, y: 37.26, name: '부발읍', region: '이천시' },
    ],
    excluded: [],
    pickupRadiusKm: 7.5, dropoffRadiusKm: 7.5, lineRadiusKm: 10,
    discountPct: 0, vehicles: ['1t'], excludedWords: ['착불'],
    slotsUsed: 0, capacityConfirmed: false,
    modeDesc: '동선 사각형 100°/100°',
};

describe('구조·요소 — 실물 필터 설정의 요소가 아웃풋에 다 실린다', () => {
    it('첫짐(대기) 아웃풋의 요소 목록 — 실물 필터 설정 모달 대조표', () => {
        const out = buildAppFilterOutput(BASE);
        // 국면 축 (요약줄 노선/관내/복귀 · 운행 상태)
        expect(out.callTarget).toBe('DEST');
        expect(out.dispatchPhase).toBe('STANDBY');
        expect(out.driverAction).toBe('WAITING');
        expect(out.isSharedMode).toBe(false);
        // 어디로 갈까 (도착 목표·상차 반경·도착 반경)
        expect(out.destinationCity).toBe('파주 시내');
        expect(out.pickupRadiusKm).toBe(7.5);
        expect(out.destinationRadiusKm).toBe(7.5);
        // 돈 축 (콜할인율 → 차종별 하한 단가표 · 상하한가)
        expect(out.callDiscountPct).toBe(0);
        expect(out.ratePerKm).toBeDefined();
        expect(out.minFare).toBe(30000);
        expect(out.maxFare).toBe(1000000);
        // 콜 속성 축 (차종·제외 단어·적재·적재 신뢰)
        expect(out.allowedVehicleTypes).toEqual(['1t']);
        expect(out.excludedKeywords).toEqual(['착불']);
        expect(out.slotsUsed).toBe(0);
        expect(out.capacityConfidence).toBe('ESTIMATED');
        // 지역 목록 (읍면동 + 시군구 묶음 + 제안 칸: 지역 제외·좌표)
        expect(out.destinationKeywords).toEqual(['곤지암읍', '부발읍', '초월읍']);
        expect(out.destinationGroups).toEqual({ '광주시': ['초월읍', '곤지암읍'], '이천시': ['부발읍'] });
        expect(out.excludedRegions).toEqual([]);
        expect(out.destinationDongs).toHaveLength(3);
    });

    it('③ 좌표까지 내려준다 — 동마다 {name, region, lng, lat}', () => {
        const out = buildAppFilterOutput(BASE);
        expect(out.destinationDongs[0]).toEqual({ name: '초월읍', region: '광주시', lng: 127.29, lat: 37.37 });
    });
});

/**
 * 🔴 **국면을 걷어냈다** (기사님 확정 2026-09-09).
 *
 * 여기 있던 검사 셋은 «국면 파생(resolvePhaseKey)»과 «숨김(hidden) 칸이 아웃풋에서 빠진다»를
 * 잠그고 있었다. 값이 **한 벌**이 되며 둘 다 뜻이 없어졌다 —
 * 기사님: *"이제 우리에게 국면이라는 것이 없어진 것 같은데.. 원칙이 바뀐 거 아냐?"*
 *
 * ⚠️ 실물(`user_filter_phases` · `PHASE_FIELDS`)은 아직 다섯 벌이라 **여기서 갈린다.**
 *    그 차이는 `docs/기획/이식_계획.md` 에 적혀 있다.
 */
describe('값은 한 벌 — 어느 칸도 «국면»으로 빠지지 않는다', () => {
    it('첫짐이든 합짐이든 네 칸이 다 실린다 — 안 쓰는 값은 그냥 안 읽힐 뿐이다', () => {
        for (const dispatchPhase of ['STANDBY', 'GATHERING', 'DELIVERING'] as const) {
            const out = buildAppFilterOutput({ ...BASE, dispatchPhase });
            expect(out.pickupRadiusKm).toBe(7.5);
            expect(out.destinationRadiusKm).toBe(7.5);
            expect(out.detourRadiusKm).toBe(10);
            expect(out.callDiscountPct).toBe(0);
            expect(out.destinationCity).toBe('파주 시내');
        }
    });

    it('«콜을 쥐었나»는 그대로 실린다 — 값이 아니라 **상태**다', () => {
        expect(buildAppFilterOutput({ ...BASE, dispatchPhase: 'GATHERING' }).isSharedMode).toBe(true);
        expect(buildAppFilterOutput({ ...BASE, dispatchPhase: 'STANDBY' }).isSharedMode).toBe(false);
    });
});

describe('제외지역 — 목록·묶음·좌표 셋에서 같이 빠진다', () => {
    it('시군구 통째 제외', () => {
        const out = buildAppFilterOutput({ ...BASE, excluded: ['R|광주시'] });
        expect(out.destinationKeywords).toEqual(['부발읍']);
        expect(out.destinationGroups).toEqual({ '이천시': ['부발읍'] });
        expect(out.destinationDongs.map(d => d.name)).toEqual(['부발읍']);
        expect(out.excludedRegions).toEqual(['광주시']);
    });

    /**
     * 🔴 **도 통째 제외**(기사님 2026-09-09 *"원래 내가 원한 건 서울을 빼는 거였는데"*).
     * 앱은 «서울»이라는 말을 모른다 — 여기서 **시·군·구 이름으로 펴서** 내린다.
     */
    it('도를 빼면 그 도의 시·군·구 이름으로 펴서 내린다', () => {
        const out = buildAppFilterOutput({
            ...BASE,
            groups: [{ region: '서울 강남구', names: ['역삼동'] }, { region: '이천시', names: ['부발읍'] }],
            pass: [
                { x: 0, y: 0, name: '역삼동', region: '서울 강남구' },
                { x: 1, y: 1, name: '부발읍', region: '이천시' },
            ],
            excluded: ['S|서울'],
        });
        expect(out.destinationGroups).toEqual({ '이천시': ['부발읍'] });
        expect(out.destinationDongs.map(d => d.name)).toEqual(['부발읍']);
        expect(out.excludedRegions).toContain('서울 강남구');
        expect(out.excludedRegions).not.toContain('이천시');
        expect(out.excludedRegions.length).toBe(25);   // 서울 25개 구
    });

    it('읍면동 하나 제외 — 동명이인을 시군구로 가른다', () => {
        const out = buildAppFilterOutput({ ...BASE, excluded: ['D|광주시|곤지암읍'] });
        expect(out.destinationKeywords).toEqual(['부발읍', '초월읍']);
        expect(out.destinationDongs.map(d => d.name)).not.toContain('곤지암읍');
    });
});

describe('단가표 — 실물 rateFloorsFrom(폴백 시세) 그대로', () => {
    it('할인 0% = 실수령 시세 그대로 (1t 770원/km) · -10% 면 693', () => {
        expect(buildAppFilterOutput(BASE).ratePerKm?.['1t']).toBe(770);
        expect(buildAppFilterOutput({ ...BASE, discountPct: 10 }).ratePerKm?.['1t']).toBe(693);
    });

    it('«전부»(100%)면 전 차종 0 — 금액 무관 통과', () => {
        const out = buildAppFilterOutput({ ...BASE, discountPct: 100 });
        expect(Object.values(out.ratePerKm ?? {}).every(v => v === 0)).toBe(true);
    });
});
