import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🪜 **마중은 «그 콜의 그 단계»까지다** (S13·S14·S15 · 기사님 실측 2026-09-12)
 *
 * 기사님: *"2, 4, 6번에 도착하는데 시트가 그대로야. 1, 3, 5는 시트가 올라갔어
 * **근데 그 스텝이 열리지는 않았어**"* · *"246만 올리는 것으로 땜빵 하지 말고"*
 *
 * ── 로그가 말한 것 ──
 * ```
 * 15:20:46  기사님이 시트를 내리심   → 손 유예 30초
 * 15:21:02  도착 ②  (손 뒤 16초)    🔴 막힘
 * 15:21:29  도착 ③  (유예 밖)       ✅ 올라감
 * 15:21:36  또 내리심               → 유예
 * 15:21:52  도착 ④                  🔴 막힘
 * ```
 * 도착 간격이 **23초**, 손 유예가 **30초**라 한 번 걸러 한 번씩 먹혔다.
 *
 * 🔴 **그런데 뿌리는 하나다.** 시트만 올라오고 **그 단계가 안 열려서** 기사님이 할 일이
 *    없었고, 그래서 **손으로 내리셨다.** 명세대로 단계가 열렸다면 «통화 완료»가 시트를
 *    내렸을 것이고(S14 — 완료 행동이 문을 닫는다) 손 유예도 안 걸렸다.
 *
 * ── 왜 빠졌나 ──
 * 원 명세는 [v23 부품 정의서](../../../../docs/기획/화면개편/wireframe-v23-parts.html) 이고
 * `docs/기획/화면규칙.md` 는 그것을 부품별로 다시 적은 **요약본**이다. 옮기는 동안
 * **Ⅲ-S6/S7 의 «그 단계»와 Ⅳ 의 «완료 행동이 문을 닫는다»가 떨어졌다.**
 * 요약본만 보고 만들면 이런 것이 샌다 — 그래서 이 검사가 **원 명세 쪽**을 문다.
 */

const CLIENT = join(__dirname, '../../../client-app/src');
const read = (rel: string) => readFileSync(join(CLIENT, rel), 'utf8');
/** 주석을 걷어낸 코드만 — 주석의 역사 기록에 걸리지 않게 */
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('S13·S14·S15 — 마중은 «그 콜의 그 단계»까지다', () => {

    it('🔴 S15 «지금 보는 콜·단계»가 한 그릇이다 — 단계가 함께 산다', () => {
        /**
         * v23 Ⅳ: *"stage(시트높이) · **focus(콜·단계)** · 파생 제조소 세 상태를
         * Dashboard 가 들고 모두가 바라봄"* — 그릇이 갈리면 **도착이 가리킨 콜과
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
         * 기사님 2026-09-12: *"gps 관리하는 거 하나 만들고 경로 관리하는 거 만들고 …
         * **지금 그걸 각자 하고 있어서 문제** 같은데"*
         *
         * 🔴 `auto-arrived` 를 **세 곳**이 각자 들었다 (`gpsFocusStore`·`StageView`·`Dashboard`).
         *    한 사건에 세 판단이 나오니 «덱이 가리킨 콜»과 «시트가 연 콜»이 갈라졌다.
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
         * 2026-08-31 실측: 한 칸으로 겸했더니 도착 직후 다음 정거장 근접이 그 칸을
         * **덮어써** 시트가 읽기도 전에 사라졌다 (도착 6번 중 시트 2번).
         * 🔴 답하는 질문이 다르면 칸도 다르다 (규칙 ⑤-4 ⑤).
         */
        const store = codeOnly(read('stores/gpsFocusStore.ts'));
        expect(store).toMatch(/arrival:\s*Arrival\s*\|\s*null/);
        /* 도착일 때만 그 칸을 남긴다 — 근접은 안 건드린다 */
        expect(store).toMatch(/kind === 'arrive' \?/);
    });

    it('🔴 S13 사건이 가리킨 콜이 이긴다 — 이미 열린 것이 있어도 바꾼다', () => {
        /**
         * 🔴 예전엔 `if (openIdx >= 0) return { snap:'full', openIdx }` 한 줄이
         *    `preferIdx` 를 **먹었다.** 그래서 도착해도 열려 있던 딴 콜이 그대로 남았다.
         *    KEEP 때 같은 병을 한 번 고쳤는데(2026-09-06) 이 줄이 살아 있어 되살아났다.
         */
        const tr = codeOnly(read('components/stage/sheetTransition.ts'));
        const i = tr.indexOf('export function sheetTransition');
        const body = tr.slice(i, tr.indexOf('\n}', i));
        /* preferIdx 를 먼저 본 뒤에야 «이미 열린 것»으로 물러난다 */
        expect(body.indexOf('preferIdx')).toBeLessThan(body.indexOf('openIdx >= 0'));
    });

    it('🔴 S14 문을 닫는 것은 «완료 행동»이다 — 그 길이 코드에 있다', () => {
        /**
         * v23 Ⅳ: *"통화 완료·시트 저장 → focus 해제 + 시트 자동 복귀
         * (뒤로가기를 찾을 일 없음)"* — 이 길이 없으면 기사님이 **손으로 내리게 되고**,
         * 그 순간 S11 유예(30초)가 걸려 **다음 도착 마중이 조용히 사라진다.**
         */
        const view = codeOnly(read('components/stage/StageView.tsx'));
        expect(view).toMatch(/type: 'done'/);
    });

    it('🔴 S13 KEEP 한 콜이 **덱에 늦게 들어와도** 연다 — 시트만 올라가던 것', () => {
        /**
         * 기사님 실측 2026-09-12: *"특히 **콜 잡고 난 화면에서 아코디언이 열리지 않아서
         * 스텝이 안 보였어**"*
         *
         * 🔴 KEEP 사건은 서버가 `order-confirmed` 를 쏘는 **그 순간** 오는데, 그 콜이
         *    덱에 들어오는 것은 `sync-active-orders` 가 온 **뒤**다. `findIndex` 가 -1 이라
         *    **시트는 올라가는데 열린 것이 없었다.** 도착은 이미 덱에 있는 콜이라 잘 됐다 —
         *    그래서 이 병이 도착 뒤에 숨어 있었다.
         */
        const view = codeOnly(read('components/stage/StageView.tsx'));
        expect(view).toMatch(/pendingOpenRef/);
        /* 못 열었으면 남겨 두고, 덱이 갱신될 때 마저 연다 */
        expect(view).toMatch(/if \(eventId && want < 0\) pendingOpenRef\.current = eventId/);
        const i = view.indexOf('const want = pendingOpenRef.current');
        expect(i).toBeGreaterThan(-1);
        expect(view.slice(i, i + 400)).toMatch(/setOpenIdx\(i\)/);
        /* 🔴 높이는 안 건드린다 — 정하는 손은 하나다 (S6) */
        expect(view.slice(i, i + 400)).not.toMatch(/setSnap\(/);
    });

    /**
     * 🎯 **스텝과 아코디언은 다른 것이다** (기사님 지시 2026-09-12).
     *
     * 기사님: *"**스텝과 아코디언을 구분해야지** 그걸 뭉뚱그려 하니까 안 되는 거야.
     * KEEP 은 시트(다)와 생성된 아코디언(**상차지 통화**) 이렇게 정의되어야 하는 거 아냐?"*
     *
     * 사건은 셋을 정한다 — **높이 · 어느 콜 · 어느 단계**. 그런데 코드는 앞의 둘만 정했고,
     * 스텝은 **장부**가 정했다(`stepCurIdx` = 끝난 단계의 다음). 그래서 GPS 도착이 찍히는
     * 순간 그 단계가 **같은 밀리초에 끝나** 기사님은 도착 스텝을 한 프레임도 못 보셨다.
     */
    it('🔴 도착하면 «그 도착 단계»를 보여 준다 — 장부는 안 건드린다', () => {
        const card = codeOnly(read('components/dashboard/PinnedRouteCard.tsx'));
        /* 경로가 낸 «어느 쪽»을 그대로 쓴다 — 여기서 다시 판단하지 않는다 */
        expect(card).toMatch(/arrival\.stopType === 'pickup' \? 'ARRIVE_PICKUP' : 'ARRIVE_DROPOFF'/);
        /* 화면이 보여줄 단계만 옮긴다 — 장부(stepCurIdx)는 그대로다 */
        expect(card).toMatch(/setStepNav\(i\)/);
        /* 그 효과 **안**에서 장부를 안 건드린다 — 화면이 볼 자리만 옮긴다 */
        const i = card.indexOf('if (!arrival || arrival.orderId !== route.id');
        expect(i).toBeGreaterThan(-1);
        expect(card.slice(i, card.indexOf('}, [arrival', i))).not.toMatch(/setSeededSteps|stepCurIdx\s*=/);
    });

    it('🔴 «어느 쪽 도착인가»는 경로가 낸다 — 단계표가 그 말을 안다', () => {
        /* 서버가 `stopType` 을 싣고(planArrivalStops), 단계표도 `stop` 을 들고 있다 */
        const tables = readFileSync(join(__dirname, '../../../shared/src/stepTables.ts'), 'utf8');
        expect(tables).toMatch(/step: 'ARRIVE_PICKUP'[\s\S]{0,80}stop: 'pickup'/);
        expect(tables).toMatch(/step: 'ARRIVE_DROPOFF'[\s\S]{0,80}stop: 'dropoff'/);
    });
});
