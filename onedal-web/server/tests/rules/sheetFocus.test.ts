import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🪜 **마중은 «그 콜의 그 단계»까지다** (S13·S14·S15 · 기사님 실측)
 *
 * 기사님: *"2, 4, 6번에 도착하는데 시트가 그대로야. 1, 3, 5는 시트가 올라갔어
 * **근데 그 스텝이 열리지는 않았어**"* · *"246만 올리는 것으로 땜빵 하지 말고"*
 *
 * 🔴 **시트만 올리지 않고 그 단계까지 연다.** 시트만 올라오고 **그 단계가 안 열리면** 기사님이 할 일이
 *    없어 **손으로 내리시고**, 그 순간 손 유예(30초)가 걸린다. 도착 간격(실측 23초)이 유예보다 짧으면
 *    다음 도착 마중이 한 번 걸러 한 번씩 막힌다. 단계가 열리면 «통화 완료»가 시트를
 *    내리고(S14 — 완료 행동이 문을 닫는다) 손 유예도 안 걸린다.
 */

const CLIENT = join(__dirname, '../../../client-app/src');
const read = (rel: string) => readFileSync(join(CLIENT, rel), 'utf8');
/** 주석을 걷어낸 코드만 — 주석 속 설명 글자에 걸리지 않게 */
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('S13·S14·S15 — 마중은 «그 콜의 그 단계»까지다', () => {

    it('🔴 S15 «지금 보는 콜·단계»가 한 그릇이다 — 단계가 함께 산다', () => {
        /**
         * stage(시트높이) · **focus(콜·단계)** · 파생 제조소 세 상태를 한 곳이 들고
         * 모두가 바라본다 — 그릇이 갈리면 **도착이 가리킨 콜과
         * 시트가 연 콜이 달라진다** (규칙 ⑤-4 ⑤).
         */
        const store = codeOnly(read('stores/gpsFocusStore.ts'));
        expect(store).toMatch(/stepKey|stopType/);
    });

    it('🔴 S13 도착이 «어느 콜인지»를 시트에 싣는다 — KEEP 만 싣고 있었다', () => {
        const view = codeOnly(read('components/stage/StageView.tsx'));
        expect(view).toMatch(/type: 'arrive'[^}]*orderId/);
    });

    it('🔴 S15 정거장 사건을 듣는 곳은 **하나**다 — 각자 들으면 각자 판단한다', () => {
        /**
         * 기사님: *"gps 관리하는 거 하나 만들고 경로 관리하는 거 만들고 …
         * **지금 그걸 각자 하고 있어서 문제** 같은데"*
         *
         * 🔴 `auto-arrived` 를 여러 곳(`gpsFocusStore`·`StageView`·`Dashboard`)이 각자 들으면
         *    한 사건에 판단이 여럿 나와 «덱이 가리킨 콜»과 «시트가 연 콜»이 갈라진다. 듣는 곳은 `gpsFocusStore` 다.
         * ⚠️ `Dashboard` 는 **알림 한 줄**만 띄우므로 판단이 아니다 — 갈라짐과 무관하다.
         *    무는 것은 «시트가 제 손으로 또 듣는가»다.
         */
        const view = codeOnly(read('components/stage/StageView.tsx'));
        expect(view).not.toMatch(/socket\.on\(['"]auto-arrived/);
        expect(view).not.toMatch(/socket\.on\(['"]next-stop-approaching/);
        /* 대신 스토어가 남긴 «방금 도착»을 본다 */
        expect(view).toMatch(/st\.arrival/);
    });

    it('🔴 S15 «지금 보는 콜»과 «방금 도착»은 다른 칸이다 — 근접이 도착을 덮지 못한다', () => {
        /**
         * 한 칸으로 겸하면 도착 직후 다음 정거장 근접이 그 칸을
         * **덮어써** 시트가 읽기도 전에 사라진다 (실측: 도착 6번 중 시트 2번).
         * 🔴 답하는 질문이 다르면 칸도 다르다 (규칙 ⑤-4 ⑤).
         */
        const store = codeOnly(read('stores/gpsFocusStore.ts'));
        expect(store).toMatch(/arrival:\s*Arrival\s*\|\s*null/);
        /* 도착일 때만 그 칸을 남긴다 — 근접은 안 건드린다 */
        expect(store).toMatch(/kind === 'arrive' \?/);
    });

    it('🔴 S13 사건이 가리킨 콜이 이긴다 — 이미 열린 것이 있어도 바꾼다', () => {
        /**
         * 🔴 «이미 열린 것»(`if (openIdx >= 0) return { snap:'full', openIdx }`)을 먼저 보면
         *    `preferIdx` 가 **먹혀** 도착해도 열려 있던 딴 콜이 그대로 남는다. KEEP 도 같은 길을 쓴다.
         */
        const tr = codeOnly(read('components/stage/sheetTransition.ts'));
        const i = tr.indexOf('export function sheetTransition');
        const body = tr.slice(i, tr.indexOf('\n}', i));
        /* preferIdx 를 먼저 본 뒤에야 «이미 열린 것»으로 물러난다 */
        expect(body.indexOf('preferIdx')).toBeLessThan(body.indexOf('openIdx >= 0'));
    });

    it('🔴 S14 문을 닫는 것은 «완료 행동»이다 — 그 길이 코드에 있다', () => {
        /**
         * 통화 완료·시트 저장 → focus 해제 + 시트 자동 복귀
         * (뒤로가기를 찾을 일 없음) — 이 길이 없으면 기사님이 **손으로 내리게 되고**,
         * 그 순간 S11 유예(30초)가 걸려 **다음 도착 마중이 조용히 사라진다.**
         */
        const view = codeOnly(read('components/stage/StageView.tsx'));
        expect(view).toMatch(/type: 'done'/);
    });

    it('🔴 S13 KEEP 한 콜이 **덱에 늦게 들어와도** 연다 — 시트만 올라가던 것', () => {
        /**
         * 기사님 실측: *"특히 **콜 잡고 난 화면에서 아코디언이 열리지 않아서
         * 스텝이 안 보였어**"*
         *
         * 🔴 KEEP 사건은 서버가 `order-confirmed` 를 쏘는 **그 순간** 오는데, 그 콜이
         *    덱에 들어오는 것은 `sync-active-orders` 가 온 **뒤**다. `findIndex` 가 -1 이라
         *    **시트는 올라가는데 열린 것이 없다.** 그래서 못 연 콜을 남겨 두고 덱이 갱신될 때 마저 연다.
         *    (도착은 이미 덱에 있는 콜이라 이 문제가 없다)
         */
        const view = codeOnly(read('components/stage/StageView.tsx'));
        expect(view).toMatch(/pendingOpenRef/);
        /* 못 열었으면 남겨 두고, 덱이 갱신될 때 마저 연다 */
        expect(view).toMatch(/if \(eventId && want < 0\) pendingOpenRef\.current = eventId/);
        const i = view.indexOf('const want = pendingOpenRef.current');
        expect(i).toBeGreaterThan(-1);
        /**
         * 🔴 **늦게 열기도 규칙을 지나는 사건이다** (#144). `setOpenIdx` 를 바로 부르면
         *    높이 규칙 밖에서 열려, 주행에 내려간 시트 안에서 콜만 열리는 «표에 없는 상태»가 난다.
         *    기사님: *"늦게 열기 효과가 KEEP 한 콜을 열면 다시 올라오고"*. 높이는 규칙 한 곳이 정한다 (S6).
         */
        expect(view.slice(i, i + 500)).toMatch(/feedRef\.current\(\{ type: 'keepReady' \}\)/);
        expect(view.slice(i, i + 500)).not.toMatch(/setSnap\(|setOpenIdx\(/);
    });

    /**
     * 🪧 **판정 중에는 시트가 잠긴다 — 판정 영역만 누를 수 있다** (기사님 · #144).
     *    *"뭔가 잘못눌러 취소나 킵을 못하면 안되니까"* — 손잡이 · 상태바(버튼 · 지난 N) · 콜 줄을 딤드하고 막는다.
     */
    it('🔴 #144 판정 중에는 시트가 잠기고 · 새 판정은 규칙에 judge 로 들어간다', () => {
        const sheet = codeOnly(read('components/stage/StageSheet.tsx'));
        expect(sheet).toMatch(/locked/);
        const view = codeOnly(read('components/stage/StageView.tsx'));
        expect(view).toMatch(/locked=\{!!judging\}/);
        expect(view).toMatch(/type: 'judge'/);
    });

    /**
     * 🎯 **스텝과 아코디언은 다른 것이다** (기사님 지시).
     *
     * 기사님: *"**스텝과 아코디언을 구분해야지** 그걸 뭉뚱그려 하니까 안 되는 거야.
     * KEEP 은 시트(다)와 생성된 아코디언(**상차지 통화**) 이렇게 정의되어야 하는 거 아냐?"*
     *
     * 사건은 셋을 정한다 — **높이 · 어느 콜 · 어느 단계**. 스텝을 **장부**(`stepCurIdx` = 끝난 단계의 다음)로
     * 정하면, GPS 도착이 찍히는 순간 그 단계가 **같은 밀리초에 끝나** 기사님은 도착 스텝을 한 프레임도 못 보신다.
     */
    /**
     * 🎬 **시트가 맨 위로 올라가면 시트 상태바가 말하는 «그 콜 · 그 단계»를 연다** (기사님).
     *
     * 🔴 카드가 도착 사건을 **따로 듣고** «도착 단계»를 억지로 열면, 그 단계는 이미 끝난 단계라
     *    장부의 현재 단계(`3 LOADED`)와 화면(`2 ARRIVE_PICKUP · 도착이 연 것`)이 갈린다.
     *    그래서 단계를 정하는 곳은 상태바 하나(`barFocusOf`)이고, 카드는 받은 것을 그린다 (기사님 지시).
     */
    it('🔴 #143 카드는 도착을 따로 듣지 않는다 — 단계는 시트 상태바가 정한다', () => {
        const card = codeOnly(read('components/dashboard/PinnedRouteCard.tsx'));
        expect(card).not.toMatch(/st\.arrival/);
        expect(card).not.toMatch(/'ARRIVE_PICKUP' : 'ARRIVE_DROPOFF'/);
        const view = codeOnly(read('components/stage/StageView.tsx'));
        expect(view).toMatch(/barFocusOf\(/);
    });

    /**
     * 🔴 **KEEP 처리는 늘 최신 값을 본다** (이천 왕복 실측).
     *    `order-confirmed` 를 듣는 효과가 한 번만 등록되면 그 안의 `feed` 가 화면이 처음 떴을 때의 빈 덱·닫힌 `openIdx` 를
     *    붙잡아, 시트는 `full·KEEP` 로 오르는데 콜이 안 열린다 (`[시트연콜]` 이 안 찍힌다). 그래서 `feedRef.current` 를 부른다.
     */
    /**
     * 🔴 **끌어올리면 손으로 넘겨 둔 단계를 지우고 상태바 단계로 맞춘다** (기사님).
     *    `focusStep` 값이 바뀔 때만 지우면 — 다음 정거장 콜은 그 값이 늘 `null` 이라, 손으로 넘겨 둔 단계가
     *    끌어올린 뒤에도 남아 상태바와 다른 단계가 뜬다. 그래서 «이 카드가 상태바의 콜이 된 순간»(`focused`)에 지운다.
     */
    /** 🪜 **«「나」가 비었나»를 화면이 재서 규칙에 넘긴다** — 건너뛰기 판단은 규칙 한 곳 (#147) */
    it('🔴 #147 StageView 가 규칙에 listEmpty 를 넘긴다', () => {
        const view = codeOnly(read('components/stage/StageView.tsx'));
        const i = view.indexOf('const feed = ');
        expect(i).toBeGreaterThan(-1);
        expect(view.slice(i, i + 900)).toMatch(/listEmpty:/);
    });

    it('🔴 #145 카드가 상태바의 콜이 되는 순간 손으로 넘긴 단계를 지운다', () => {
        const route = codeOnly(read('components/dashboard/PinnedRoute.tsx'));
        expect(route).toMatch(/focused=\{!!focus && focus\.orderId === route\.id\}/);
        const card = codeOnly(read('components/dashboard/PinnedRouteCard.tsx'));
        expect(card).toMatch(/if \(focused\) setStepNav\(null\);\s*\}, \[focused, focusStep\]\)/);
    });

    it('🔴 #143 KEEP 처리는 늘 최신 feed 를 부른다', () => {
        const view = codeOnly(read('components/stage/StageView.tsx'));
        const i = view.indexOf("const onConfirmed");
        expect(i).toBeGreaterThan(-1);
        const body = view.slice(i, view.indexOf("socket.on('order-confirmed'", i));
        expect(body).toMatch(/feedRef\.current\(\{ type: 'keep' \}\)/);
    });

    /**
     * 🔴 **늦게 여는 길은 덱 «길이»가 아니라 덱의 콜이 바뀔 때 돈다** — 심사 중인 콜이 이미 덱에 들어 있어
     *    KEEP 해도 길이가 안 바뀐다. 길이에 묶으면 다음 콜 심사가 들어올 때에야 그 콜이 열린다.
     */
    it('🔴 #143 못 연 콜은 덱의 콜이 바뀔 때 연다 — 길이가 아니다', () => {
        const view = codeOnly(read('components/stage/StageView.tsx'));
        expect(view).not.toMatch(/\}, \[cycleDeck\.length\]\);/);
    });

    it('🔴 «어느 쪽 도착인가»는 경로가 낸다 — 단계표가 그 말을 안다', () => {
        /* 서버가 `stopType` 을 싣고(planArrivalStops), 단계표도 `stop` 을 들고 있다 */
        const tables = readFileSync(join(__dirname, '../../../shared/src/stepTables.ts'), 'utf8');
        expect(tables).toMatch(/step: 'ARRIVE_PICKUP'[\s\S]{0,80}stop: 'pickup'/);
        expect(tables).toMatch(/step: 'ARRIVE_DROPOFF'[\s\S]{0,80}stop: 'dropoff'/);
    });
});
