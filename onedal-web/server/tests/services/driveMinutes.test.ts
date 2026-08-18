import { calculateDriveMinutes } from '../../src/services/kakaoService';

/**
 * 🛰️ **접근 주행을 모르면 0분으로 지어내지 않는다** (규칙 ④ · 2026-08-19 실측)
 *
 * GPS 미수신으로 경로를 상차지에서 시작하면(startsAtFirstStop) 현위치→상차지
 * 구간이 통째로 없다. 예전에는 첫 정거장에 0 을 적었다 — "지금 즉시 도착"이라는
 * 지어낸 값이 되어, 타임라인이 낙관 약속을 만들고 화면 시각이 통째로 이르게 밀렸다.
 *
 * 출발점을 모르면 누적의 기준 자체가 없다 — **전부 null** 이 정직하다.
 * (타임라인은 null 을 보면 콜별 파생으로 폴백하고, 시트는 "주행 모름"을 말한다)
 */
describe('calculateDriveMinutes', () => {
    const sections = [{ duration: 600 }, { duration: 1200 }];   // 10분 · 20분

    it('현위치를 알면 정거장마다 누적 분', () => {
        expect(calculateDriveMinutes(sections, false)).toEqual([10, 30]);
    });

    it('🔴 현위치를 모르면(출발점=첫 정거장) 전부 null — 0 을 지어내지 않는다', () => {
        expect(calculateDriveMinutes(sections, true)).toEqual([null, null, null]);
    });

    it('구간이 없으면 빈 배열', () => {
        expect(calculateDriveMinutes(undefined, false)).toEqual([]);
    });
});
