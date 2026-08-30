import { getUserSession } from '../../src/state/userSessionStore';
import { updateActiveFilter } from '../../src/state/filterManager';
import { StateMachine } from '../../src/core/engine/StateMachine';

/**
 * 🧪 #81 — **KEEP 전이가 시 별칭을 지워, 앱 3단계 검증이 빈손이 된다** (2026-08-30)
 *
 * 실측 (7지점 7판 · 서버 로그 그대로):
 *   16:39:01.085  경유 갱신 — 별칭 7개(이천시·이천·광주시…)를 한 벌로 채움 ✅
 *   16:39:01.088  KEEP 상태 전이 — destinationKeywords 만 싣고 필터 갱신
 *                 → 별칭 재생성 가드가 «묶음이 없으니 못 만든다 → 비운다» → **별칭 []**
 *
 * 빈 별칭이 앱에 피기백되면: 하차지가 동명이동 주의 동(중리동 등)일 때 3단계
 * 검증(`CautionDongVerifier.verifyCityMatch`)이 **빈 목록.any = false** 로 무조건
 * «동명이동!» — 05(사음동→이천터미널)가 세 판 연속 확정 직전에 죽은 이유다.
 *
 * 뿌리는 서버 CLAUDE.md 의 규칙 위반: *"destinationKeywords 를 넘길 땐
 * customCityFilters 도 같이."* 전이 3ms 전에 `syncDetourFilter` 가 키워드·묶음·별칭을
 * **한 벌로** 이미 넣었다 — 전이가 키워드를 또 실을 이유가 없고, 실으면 지운다.
 * 전이의 일은 국면·차종뿐이다 (규칙 ③ — 경유 한 벌의 조립은 한 곳에서).
 */
describe('#81 KEEP 전이는 경유 한 벌을 건드리지 않는다', () => {
    it('🔴 전이 필터에 destinationKeywords 가 없다 — 경유 조립은 syncDetourFilter 의 일', () => {
        const s = getUserSession('test-81-transition-shape');
        s.activeFilter.dispatchPhase = 'GATHERING';

        const t = StateMachine.advanceOnKeep(s, ['오토바이', '다마스']);

        expect(t.changed).toBe(true);
        expect(t.newFilter).toBeDefined();
        expect('destinationKeywords' in (t.newFilter as any)).toBe(false);
    });

    it('🔴 KEEP 전이를 통과해도 시 별칭이 살아 있다 — 16:39:01 재현', () => {
        const s = getUserSession('test-81-aliases-survive');
        // 16:39:01.085 의 세션: 01·03 을 보유(확정)했고, 경유 갱신이 한 벌을 채워 둔 상태
        s.myOrders = [
            { id: 'A', status: 'ORDER_CONFIRMED', pickup: '초월읍', dropoff: '신둔면', fare: 50000 } as any,
            { id: 'B', status: 'ORDER_CONFIRMED', pickup: '곤지암읍', dropoff: '관고동', fare: 50000 } as any,
        ];
        s.activeFilter.dispatchPhase = 'GATHERING';
        s.activeFilter.isSharedMode = true;
        s.activeFilter.destinationKeywords = ['중리동', '신둔면', '관고동', '초월읍'];
        s.activeFilter.destinationGroups = { '이천시': ['중리동', '신둔면', '관고동'], '광주시': ['초월읍'] };
        s.activeFilter.customCityFilters = ['이천시', '이천', '광주시', '광주'];

        const t = StateMachine.advanceOnKeep(s, ['오토바이', '다마스']);
        updateActiveFilter('test-81-aliases-survive', t.newFilter!);

        // 별칭이 비면 앱 3단계가 동명이동 주의 동(중리동)을 전부 «동명이동!»으로 죽인다
        expect(s.activeFilter.customCityFilters).toEqual(['이천시', '이천', '광주시', '광주']);
        // 경유 키워드도 그대로다 — 전이는 경유를 만들지도 지우지도 않는다
        expect(s.activeFilter.destinationKeywords).toEqual(['중리동', '신둔면', '관고동', '초월읍']);
    });
});
