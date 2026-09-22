import { readFileSync } from 'fs';
import { join } from 'path';
import { isTerminal, isDeliveredCall, deckOfCycle } from '@onedal/shared';

/**
 * 🔄 **하차해도 그날(자정)까지 카드가 남는다** (기사님 확정)
 *
 * 기사님: *"노선행으로 묶어서 생각해 보면 합짐이 들어가 있는 여러 개의 한 경로로 볼 수
 * 있을 것 같고, 모든 경로가 끝나면 완료로 한꺼번에 상태값을 바꾸면 될 것 같다는
 * 아이디어가 생각났어."* + *"마지막 6번째 바의 하차 완료는 볼 수도 없는 상황인 듯."*
 *
 * 하차 완료를 누르는 순간 그 콜을 진행 중 탭에서 **빼 버리면** 6단계가 채워진 모습을
 * 볼 수 없고, 운행 중에 "내가 몇 개 내렸나"도 화면에 안 남는다.
 *
 * 🔴 **다만 상태는 그대로 즉시 바꾼다** — 하차한 콜의 운임은 그 순간 발생한다.
 *    사이클 끝까지 `ORDER_DELIVERED` 를 미루면 정산·운행일지가 늦고, 중간에 서버가
 *    죽으면 "내린 짐이 안 내린 걸로" 남는다. **상태는 콜별 즉시, 화면만 하루 단위.**
 *
 * ⚠️ 취소·방출은 즉시 빠진다 — 그건 "이번 운행에서 한 일"이 아니라 없던 일이다.
 */
describe('deckOfCycle — 이번 운행의 카드 목록', () => {
    const call = (id: string, status: string) => ({ id, status, capturedAt: `2026-08-19T0${id}:00:00Z` }) as any;

    it('🔴 하차 완료한 콜이 진행 중인 콜과 함께 남는다', () => {
        const deck = deckOfCycle([call('1', 'ORDER_DELIVERED'), call('2', 'ORDER_CONFIRMED')]);
        expect(deck.map(o => o.id)).toEqual(['1', '2']);
    });

    /* 🗓️ 사이클 = 하루. 진행 중이 0건이어도 오늘 한 일은 남는다 (아래 «하루 덱») */
    it('🔴 진행 중인 콜이 하나도 없어도 하차분은 남는다 — 하차 시각을 모르면 남긴다', () => {
        const deck = deckOfCycle([call('1', 'ORDER_DELIVERED'), call('2', 'ORDER_COMPLETED')]);
        expect(deck.map(o => o.id)).toEqual(['1', '2']);
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

    it('isDeliveredCall 은 하차·정산 완료만 — 취소는 아니다 (재확인)', () => {
        expect(isDeliveredCall({ status: 'ORDER_DELIVERED' })).toBe(true);
        expect(isDeliveredCall({ status: 'ORDER_COMPLETED' })).toBe(true);
        expect(isDeliveredCall({ status: 'SAFE_CANCEL' })).toBe(false);
        expect(isTerminal('SAFE_CANCEL')).toBe(true);   // 종결이지만 "한 일"은 아니다
    });
});

/**
 * 🔵 **사이클 경계 — 어제 하차한 것은 안 따라온다** (기사님 확정)
 *
 * 기사님: *"상태가 완료된 상황인데 왜 이것이 진행중으로 나오는 거지? 지금 진행중인 콜과
 * 연결된 것도 없는데 말이지."*
 *
 * 경계는 **자정 하나**다 (`businessDayKey` — 서버 `ensureBusinessDay` 와 같은 선).
 * 어제 하차한 콜은 오늘 새 콜을 잡아도 진행 중 탭으로 다시 나오지 않고, 오늘 먼저 내린 콜은
 * 운행이 끊겼다 이어져도 남는다.
 *
 * 경계는 하차 시각에서 파생한다 (규칙 ③ — 사이클 번호를 따로 저장하지 않는다).
 */
describe('🔵 사이클 경계 — 어제의 완료분은 안 따라온다', () => {
    const NOW = Date.parse('2026-08-22T15:00:00+09:00');
    const at = (hhmm: string) => `2026-08-22T${hhmm}:00+09:00`;
    const done = (id: string, capturedAt: string, completedAt: string) =>
        ({ id, status: 'ORDER_DELIVERED', capturedAt, completedAt }) as any;
    const live = (id: string, capturedAt: string) =>
        ({ id, status: 'ORDER_CONFIRMED', capturedAt }) as any;

    it('🔴 어제 하차한 콜은 새 콜과 함께 소환되지 않는다 · 오늘 먼저 내린 콜은 남는다', () => {
        const deck = deckOfCycle([
            done('어제분', '2026-08-21T10:04:00+09:00', '2026-08-21T10:05:00+09:00'),
            done('문산읍', at('10:04'), at('10:05')),   // 오늘 아침에 내렸다 — 운행이 끊겼어도 오늘 한 일
            live('교하동', at('14:24')),
        ], NOW);
        expect(deck.map(o => o.id)).toEqual(['문산읍', '교하동']);
    });

    it('🔴 같은 운행에서 먼저 내린 콜은 남는다 — 6칸 채워진 모습을 봐야 한다', () => {
        const deck = deckOfCycle([
            done('야당동', at('06:33'), at('06:36')),   // 뒤 콜을 잡은 뒤에 내렸다
            live('문발동', at('06:34')),
        ], NOW);
        expect(deck.map(o => o.id)).toEqual(['야당동', '문발동']);
    });

    it('🔴 하차 시각을 모르면 남긴다 — 없는 값으로 카드를 지우지 않는다 (규칙 ④)', () => {
        const deck = deckOfCycle([
            { id: '옛콜', status: 'ORDER_DELIVERED', capturedAt: at('10:04') } as any,
            live('교하동', at('14:24')),
        ], NOW);
        expect(deck.map(o => o.id)).toEqual(['옛콜', '교하동']);
    });

    it('🔴 시각은 날짜로 비교한다 — UTC 표기(Z)의 날짜 글자에 속지 않는다', () => {
        // completedAt 은 Z 표기다. '2026-08-21T15:30Z' 는 글자로는 21일이지만 한국 시각 22일 00:30 — 오늘이다.
        const deck = deckOfCycle([
            { id: '자정직후', status: 'ORDER_DELIVERED', capturedAt: '2026-08-21T23:50:00+09:00', completedAt: '2026-08-21T15:30:00.000Z' } as any,
            live('교하동', at('14:24')),
        ], NOW);
        expect(deck.map(o => o.id)).toEqual(['자정직후', '교하동']);
    });
});

/**
 * 🔴 **하차 시각이 화면까지 닿아야 규칙이 산다.**
 *    `completedAt` 이 장부에만 있고 세션·복구·DTO 어디에도 없으면
 *    관제웹의 `deckOfCycle` 은 영영 "모른다"만 보고 아무것도 못 거른다.
 */
describe('🚚 하차 시각이 관제웹까지 온다', () => {
    const server = (p: string) => readFileSync(join(__dirname, '../../src', p), 'utf8');

    it('🔴 재시작 복구가 completedAt 을 되살린다', () => {
        expect(server('services/dispatchEngine.ts')).toMatch(/completedAt:\s*row\.completedAt/);
    });

    it('🔴 하차 처리가 장부와 메모리를 함께 갱신한다', () => {
        // DB 만 쓰고 메모리를 안 쓰면, 재시작 전까지 화면은 하차 시각을 모른다
        const src = server('services/dispatchEngine.ts');
        expect(src).toMatch(/completedAt\s*=\s*\?/);              // 장부
        expect(src).toMatch(/\.completedAt\s*=\s*(occurredAt|deliveredAt)/); // 메모리
    });
});

/**
 * 🔴 **완료분은 화면에만 섞인다** — 경로·적재·운임·카운트다운은 진행 중인 콜만 본다.
 *    섞이면 하차한 짐이 계속 실려 있는 것으로 세어지고(적재), 다 내린 콜의 하차지가
 *    경로에 남고, 카운트다운이 끝난 약속을 기준으로 잡는다.
 *    (`TERMINAL_STATUSES` 주석이 경고한 바로 그 사고 —)
 */
describe('경계 — 완료분이 계산에 섞이지 않는다', () => {
    const route = () => readFileSync(join(__dirname,
        '../../../client-app/src/components/dashboard/PinnedRoute.tsx'), 'utf8')
        + readFileSync(join(__dirname, '../../../client-app/src/hooks/useRouteDerivations.ts'), 'utf8');
    const code = () => route().split('\n')
        .filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');

    it('🔴 덱에만 사이클 목록을 넘긴다', () => {
        expect(code()).toMatch(/deckOfCycle/);
    });

    /**
     * 🔴 **완료분이 계산에 섞이지 않는다.** 적재·운임은 헤더의
     *    `VehicleLogoSummary` 가 보여 주고 (기사님 확정), 거기서는 `confirmedCalls`(= 진행 중)로 센다.
     *    전체를 더하면 취소·방출한 콜의 운임까지 합쳐져 과다 표시된다.
     */
    it('🔴 적재·운임·경로는 여전히 «진행 중»만 쓴다', () => {
        expect(code()).toMatch(/routeStops, liveRoute,/);          // 타임라인
        const head = readFileSync(join(__dirname,
            '../../../client-app/src/components/dashboard/VehicleStatusPanel.tsx'), 'utf8');
        expect(head).toMatch(/const confirmedCalls = liveCalls\.filter\(o => !isEvaluating\(o\.status\)\)/);
        expect(head).toMatch(/confirmedCalls\.reduce\(\(sum, o\) => sum \+ \(o\.fare \|\| 0\)/);
        // 🔴 심사 중·끝난 콜이 섞인 배열로 더하지 않는다
        expect(head).not.toMatch(/liveCalls\.reduce\(\(sum, o\) => sum \+ \(o\.fare/);
    });

    /* 🚩 카운트다운은 시트 상태바 조각(`useDepartureDue`)이다 — 진행 중인 콜만 넘긴다 */
    it('🔴 카운트다운도 진행 중인 콜만 본다 — 끝난 약속을 기준으로 잡지 않게', () => {
        const stage = readFileSync(join(__dirname, '../../../client-app/src/components/stage/StageView.tsx'), 'utf8');
        expect(stage).toMatch(/useDepartureDue\(\{ orders: liveRoute,/);
        expect(code()).not.toMatch(/<DepartureCountdown/);
    });
});

/**
 * 🗓️ **시트의 사이클 = 하루** (기사님 결정).
 *    *"시트는 오늘 한 일을 남긴다"* — 진행 중인 콜이 0건이 돼도, 운행이 끊겼다 이어져도 **오늘 하차한 콜은 남는다.**
 *    어제 하차분은 빠진다(자정 경계 = `businessDayKey` · 서버 `ensureBusinessDay` 와 같은 선). 하차 시각을 모르면 남긴다(규칙 ④).
 */
describe('🗓️ 하루 덱 — 오늘 한 일이 남는다', () => {
    const NOW = Date.parse('2026-09-15T15:00:00+09:00');
    const done = (id: string, completedAt?: string) => ({ id, status: 'ORDER_DELIVERED', capturedAt: '2026-09-15T08:00:00+09:00', completedAt }) as any;
    const live = (id: string) => ({ id, status: 'ORDER_CONFIRMED', capturedAt: '2026-09-15T14:00:00+09:00' }) as any;

    it('🔴 진행 중인 콜이 0건이어도 오늘 하차한 콜은 남는다', () => {
        expect(deckOfCycle([done('아침', '2026-09-15T10:00:00+09:00')], NOW).map(o => o.id)).toEqual(['아침']);
    });
    it('🔴 운행이 끊겼다 이어져도 오늘 먼저 내린 콜은 남는다 (옛 «지난 운행» 경계를 걷었다)', () => {
        expect(deckOfCycle([done('아침', '2026-09-15T10:05:00+09:00'), live('오후')], NOW).map(o => o.id)).toEqual(['아침', '오후']);
    });
    it('🔴 어제 하차한 콜은 빠진다 — 자정이 경계다', () => {
        expect(deckOfCycle([done('어제', '2026-09-14T23:50:00+09:00'), live('오늘')], NOW).map(o => o.id)).toEqual(['오늘']);
    });
    it('하차 시각을 모르면 남긴다 (규칙 ④)', () => {
        expect(deckOfCycle([done('모름')], NOW).map(o => o.id)).toEqual(['모름']);
    });
});

