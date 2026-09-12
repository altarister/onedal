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
        const i = view.indexOf("socket.on('auto-arrived'");
        expect(i).toBeGreaterThan(-1);
        /* 도착 처리에서 시트에 넘기는 사건이 orderId 를 들고 있어야 한다 */
        const fn = view.slice(view.lastIndexOf('const onArrived', i), i);
        expect(fn).toMatch(/type: 'arrive'[^}]*orderId/);
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
});
