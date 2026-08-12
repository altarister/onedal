import { filterHuntBlocker, type AutoDispatchFilter } from '@onedal/shared';

/**
 * 🔴 2026-08-12 — **빈 필터가 "제한 없음"으로 읽히던 것을 막는다.**
 *
 * 앱(`InsungParser.kt` · `Hwamul24Parser.kt`)과 서버(`OrderEvaluator`)가
 * 둘 다 "도착지 키워드가 없으면 통과" 였다. 두 겹이 같은 방향으로 열려 있어서
 * 회랑 계산이 실패하거나 목적지가 비면 `isActive` 는 켜진 채
 * **도착지 제한만 사라졌다.** 필터가 느슨해지는 게 아니라 없어지는 것이다.
 */
const base: AutoDispatchFilter = {
    allowedVehicleTypes: [],
    isActive: true,
    isSharedMode: false,
    driverAction: 'WAITING',
    dispatchPhase: 'STANDBY',
    pickupRadiusKm: 10,
    minFare: 30000,
    maxFare: 1000000,
    destinationCity: '파주시',
    destinationRadiusKm: 0,
    excludedKeywords: [],
    destinationKeywords: ['금촌동', '문산읍'],
    customCityFilters: ['파주시', '파주'],
    customFilters: [],
};

describe('filterHuntBlocker — 이 필터로 사냥해도 되는가', () => {
    it('도착 도시와 지역이 다 있으면 사냥한다', () => {
        expect(filterHuntBlocker(base)).toBeNull();
    });

    it('🔴 첫짐인데 도착 지역이 비면 멈춘다 (예전에는 전부 통과했다)', () => {
        expect(filterHuntBlocker({ ...base, destinationKeywords: [] })).not.toBeNull();
    });

    it('첫짐인데 도착 도시조차 없으면 멈춘다', () => {
        expect(filterHuntBlocker({ ...base, destinationCity: '', destinationKeywords: [] })).not.toBeNull();
    });

    it('🔴 합짐인데 회랑이 안 잡혔으면 멈춘다 (경로 실패 시 실제로 일어난다)', () => {
        const blocked = filterHuntBlocker({ ...base, isSharedMode: true, destinationKeywords: [] });
        expect(blocked).toContain('회랑');
    });

    it('합짐은 회랑만 있으면 된다 — 도착 도시는 안 본다 (가는 길이 기준이므로)', () => {
        expect(filterHuntBlocker({
            ...base, isSharedMode: true, destinationCity: '', destinationKeywords: ['역삼동'],
        })).toBeNull();
    });

    it('막는 이유는 그대로 화면·로그에 쓸 수 있는 문장이다', () => {
        const msg = filterHuntBlocker({ ...base, destinationKeywords: [] });
        expect(msg).toContain('파주시');   // 어느 도시에서 못 찾았는지 말해 준다
    });
});
