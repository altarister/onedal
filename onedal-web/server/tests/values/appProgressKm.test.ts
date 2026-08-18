import { buildAppProgressKm } from '../../src/state/filterManager';

/**
 * 🧭 앱에 내려보낼 경로 순서 맵 (기사님 확정 2026-08-18 — 여유 0km, 역주행은 버린다)
 *
 * 실사고: 파주 도착 직전 `초월읍(광주) → 금촌동(파주)` 이 앱 필터를 통과했다.
 * 세션의 detourProgressKm 은 트림 비교용이라 **지나온 동도 계속 들고 있다** —
 * 그대로 보내면 지나온 동이 "경로 위"로 남아 차단이 안 된다. 그래서 키를
 * 지금 목록(destinationKeywords)으로 좁혀 보내는 것이 이 함수의 존재 이유다.
 */
describe('buildAppProgressKm', () => {
    const session = (keywords: string[], progress: Record<string, number> | null) => ({
        activeFilter: { destinationKeywords: keywords },
        detourProgressKm: progress,
    }) as any;

    it('경로가 없으면(첫짐) 빈 객체 — 앱이 순서 검사를 건너뛴다', () => {
        expect(buildAppProgressKm(session(['금촌동', '교하동'], null))).toEqual({});
    });

    it('키는 지금 목록으로 좁힌다 — 지나온 동(목록에서 빠진 것)은 실리지 않는다', () => {
        const out = buildAppProgressKm(session(
            ['신장동', '금촌동'],                                  // 트림 후 남은 목록
            { 초월읍: 3.2, 신장동: 27.1, 금촌동: 83.5 },            // 세션엔 지나온 초월읍이 남아 있다
        ));
        expect(out).toEqual({ 신장동: 27.1, 금촌동: 83.5 });
        expect('초월읍' in out).toBe(false);                        // ← 실사고 재발 방지 지점
    });

    it('Infinity(하차지 원)와 값 없음(스냅 실패)은 null — 모르면 막지 않는다', () => {
        const out = buildAppProgressKm(session(
            ['경안동', '산황동', '금촌동'],
            { 경안동: 0.5, 금촌동: Infinity },                      // 산황동은 스냅 실패로 값 없음
        ));
        expect(out).toEqual({ 경안동: 0.5, 산황동: null, 금촌동: null });
        // JSON 은 Infinity 를 못 싣는다 — null 로 바꿔야 앱 파서가 "순서 모름"으로 읽는다
        expect(JSON.parse(JSON.stringify(out))).toEqual(out);
    });
});
