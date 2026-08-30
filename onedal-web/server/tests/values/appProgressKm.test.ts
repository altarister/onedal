import { buildAppProgressKm } from '../../src/state/filterManager';

/**
 * 🧭 앱에 내려보낼 경로 순서 맵 (기사님 확정 2026-08-18 — 여유 0km, 역주행은 버린다)
 *
 * 실사고: 파주 도착 직전 `초월읍(광주) → 금촌동(파주)` 이 앱 필터를 통과했다.
 * 세션의 순서 맵은 **지나온 동도 계속 들고 있다** — 그대로 보내면 지나온 동이
 * "경로 위"로 남아 차단이 안 된다. 그래서 키를 지금 목록(destinationKeywords)으로
 * 좁혀 보내는 것이 이 함수의 존재 이유다.
 *
 * 🔴 #78 (2026-08-30) 이후 원천은 `detourOrderKm`(순서 전용 · 순수 스냅점)이다.
 *    트림용 `detourProgressKm` 을 그대로 쓰던 시절, pad·Infinity 가 순서에 섞여
 *    곤지암읍(6km 길목)이 «경로 끝 19.2km»로 나가 순방향 콜이 차단됐다.
 *    지리 재현 검사는 `routeOrderKm.test.ts` — 여기는 배선(키 좁힘·null 규약)만 본다.
 */
describe('buildAppProgressKm', () => {
    const LINE = [{ x: 127.25, y: 37.41 }, { x: 126.73, y: 37.77 }];
    const session = (keywords: string[], order: Record<string, number> | null) => ({
        activeFilter: { destinationKeywords: keywords },
        detourOrderKm: order,
        myOrders: [{ status: 'ORDER_CONFIRMED', routePolyline: LINE }],
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

    /**
     * 🔴 2026-08-18 에는 하차원 안 동이 전부 null 이 되어 판정이 통째로 죽은 적이 있다
     *    (당시 원천이던 트림용 맵의 Infinity 를 null 로 바꿔 보냈던 것).
     *    순서 전용 맵에는 Infinity 가 아예 없다 — 하차원 안 동도 **각자의 실제 위치**를
     *    유한한 숫자로 갖는다. 그래도 방어는 남긴다: 유한하지 않은 값이 섞여 들면
     *    «순서 미상 — 통과»(null)다. 느슨한 쪽이 안전하다 (규칙 ⑤).
     */
    it('유한하지 않은 값이 섞여 들면 null — 모르면 막지 않는다', () => {
        const out = buildAppProgressKm(session(['경안동', '금촌동'], { 경안동: 0.5, 금촌동: Infinity }));
        expect(out.경안동).toBe(0.5);
        expect(out.금촌동).toBeNull();
        // JSON 은 Infinity 를 못 싣는다 — 실어 보내는 값은 전부 JSON 왕복이 돼야 한다
        expect(JSON.parse(JSON.stringify(out))).toEqual(out);
    });

    it('값 없음(스냅 실패)은 null — 모르면 막지 않는다', () => {
        const out = buildAppProgressKm(session(['경안동', '산황동'], { 경안동: 0.5 }));
        expect(out).toEqual({ 경안동: 0.5, 산황동: null });
        expect(JSON.parse(JSON.stringify(out))).toEqual(out);
    });
});
