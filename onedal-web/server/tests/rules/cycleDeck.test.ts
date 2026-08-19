import { readFileSync } from 'fs';
import { join } from 'path';
import { isTerminal, isDeliveredCall, deckOfCycle } from '@onedal/shared';

/**
 * 🔄 **하차해도 사이클이 끝날 때까지 카드가 남는다** (기사님 확정 2026-08-19)
 *
 * 기사님: *"노선행으로 묶어서 생각해 보면 합짐이 들어가 있는 여러 개의 한 경로로 볼 수
 * 있을 것 같고, 모든 경로가 끝나면 완료로 한꺼번에 상태값을 바꾸면 될 것 같다는
 * 아이디어가 생각났어."* + *"마지막 6번째 바의 하차 완료는 볼 수도 없는 상황인 듯."*
 *
 * 지금은 하차 완료를 누르는 순간 그 콜이 진행 중 탭에서 **즉시 사라진다.** 그래서
 * 6단계가 채워진 모습을 볼 수 없고, 운행 중에 "내가 몇 개 내렸나"도 화면에 안 남는다.
 *
 * 🔴 **다만 상태는 그대로 즉시 바꾼다** — 하차한 콜의 운임은 그 순간 발생한다.
 *    사이클 끝까지 `ORDER_DELIVERED` 를 미루면 정산·운행일지가 늦고, 중간에 서버가
 *    죽으면 "내린 짐이 안 내린 걸로" 남는다. **상태는 콜별 즉시, 화면만 사이클 단위.**
 *
 * ⚠️ 취소·방출은 즉시 빠진다 — 그건 "이번 운행에서 한 일"이 아니라 없던 일이다.
 */
describe('deckOfCycle — 이번 운행의 카드 목록', () => {
    const call = (id: string, status: string) => ({ id, status, capturedAt: `2026-08-19T0${id}:00:00Z` }) as any;

    it('🔴 하차 완료한 콜이 진행 중인 콜과 함께 남는다', () => {
        const deck = deckOfCycle([call('1', 'ORDER_DELIVERED'), call('2', 'ORDER_CONFIRMED')]);
        expect(deck.map(o => o.id)).toEqual(['1', '2']);
    });

    it('🔴 진행 중인 콜이 하나도 없으면 사이클이 끝난 것 — 완료분도 빠진다', () => {
        const deck = deckOfCycle([call('1', 'ORDER_DELIVERED'), call('2', 'ORDER_COMPLETED')]);
        expect(deck).toEqual([]);
    });

    it('취소·방출은 즉시 빠진다 — 없던 일이지 한 일이 아니다', () => {
        const deck = deckOfCycle([
            call('1', 'ORDER_CONFIRMED'),
            call('2', 'SAFE_CANCEL'),
            call('3', 'ORDER_RELEASED_BY_ME'),
            call('4', 'ORDER_RELEASED_BY_OFFICE'),
        ]);
        expect(deck.map(o => o.id)).toEqual(['1']);
    });

    it('잡은 순서를 지킨다 — 새 콜이 끼어들어 기존 위치를 밀지 않는다', () => {
        const deck = deckOfCycle([call('3', 'ORDER_CONFIRMED'), call('1', 'ORDER_DELIVERED'), call('2', 'ORDER_PICKED_UP')]);
        expect(deck.map(o => o.id)).toEqual(['1', '2', '3']);
    });

    it('isDeliveredCall 은 하차·정산 완료만 — 취소는 아니다', () => {
        expect(isDeliveredCall({ status: 'ORDER_DELIVERED' })).toBe(true);
        expect(isDeliveredCall({ status: 'ORDER_COMPLETED' })).toBe(true);
        expect(isDeliveredCall({ status: 'SAFE_CANCEL' })).toBe(false);
        expect(isTerminal('SAFE_CANCEL')).toBe(true);   // 종결이지만 "한 일"은 아니다
    });
});

/**
 * 🔴 **완료분은 화면에만 섞인다** — 경로·적재·운임·카운트다운은 진행 중인 콜만 본다.
 *    섞이면 하차한 짐이 계속 실려 있는 것으로 세어지고(적재), 다 내린 콜의 하차지가
 *    경로에 남고, 카운트다운이 끝난 약속을 기준으로 잡는다.
 *    (`TERMINAL_STATUSES` 주석이 경고한 바로 그 사고 — 2026-08-11)
 */
describe('경계 — 완료분이 계산에 섞이지 않는다', () => {
    const route = () => readFileSync(join(__dirname,
        '../../../client-app/src/components/dashboard/PinnedRoute.tsx'), 'utf8');
    const code = () => route().split('\n')
        .filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');

    it('🔴 덱에만 사이클 목록을 넘긴다', () => {
        expect(code()).toMatch(/deckOfCycle/);
    });

    it('🔴 적재·운임·경로는 여전히 liveRoute(진행 중)를 쓴다', () => {
        const c = code();
        expect(c).toMatch(/적재 \{liveRoute\.length\}건/);
        expect(c).toMatch(/liveRoute\.reduce\(\(sum, o\) => sum \+ \(o\.fare \|\| 0\)/);
        expect(c).toMatch(/routeStops, liveRoute,/);          // 타임라인
    });

    it('🔴 카운트다운도 진행 중인 콜만 본다 — 끝난 약속을 기준으로 잡지 않게', () => {
        expect(code()).toMatch(/<DepartureCountdown orders=\{liveRoute\}/);
    });
});
