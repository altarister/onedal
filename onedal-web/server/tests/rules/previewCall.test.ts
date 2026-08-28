import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 👀 **미리보기 콜 — 확정 전에 판정만 받는다** (기사님 확정 2026-08-22 · 용어집 §9)
 *
 * 기사님: *"내가 상세 페이지를 보았을 때 팝업 3장을 열어서 정보를 모두 확인하고 그걸 가지고
 * 판단까지 해주면 나는 **페널티 축적 없이** 콜을 판단할 수 있는 장점이 있군."*
 *
 * 무엇이 문제였나 (2026-08-22 실측, 손으로 연 상세 3회 전부):
 *   17:17  1차 선점: `계산서필 → 카톤`      ← 주소가 아니라 **적요 조각**
 *   17:19  1차 선점: `가전 → 계산서필`
 *   17:24  1차 선점: `박스 → 계산서필`      ← 실제로는 경안동 → 문산읍
 *
 * 상세 수집(적요상세·출발지·도착지)은 **확정 화면에서만** 돌았다. 확정 전에는 팝업을 못 여니
 * *"리스트에서 본 콜 중 요금이 같은 것"* 을 역추적해 주소를 빌려 왔고, 그게 실패하면 화면
 * 요약 파싱값을 그대로 썼다 — 앱 주석에 이미 *"오파싱 가능성 있음"* 이라 적혀 있던 자리다.
 *
 * 🔴 고치는 방향은 그 코드를 고치는 게 아니라 **그 코드가 사는 자리를 없애는 것**이다.
 *    손으로 연 상세에서 팝업 3장을 먼저 읽으면 주소를 직접 읽으므로 역추적이 필요 없다.
 *
 * 그리고 확정을 안 누른 콜은 **인성에서 아무 일도 일어나지 않았다** — 취소할 게 없다.
 * 그런데 우리 장부에만 취소 1회가 쌓이고 있었다 (오늘 5회). 취소 카운트는 배차망
 * 10회 패널티를 세는 값이다 (용어집 §2-1).
 */

const WEB = join(__dirname, '../../..');
const APP = join(__dirname, '../../../../onedal-app/app/src/main/java/com/onedal/app');
const read = (p: string) => readFileSync(join(WEB, p), 'utf8');
const app = (p: string) => readFileSync(join(APP, p), 'utf8');
/** 주석은 검사에서 뺀다 — "이렇게 하자"고 적어 둔 글이 구현으로 세어지면 안 된다 */
const code = (src: string) => src.split('\n').filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');

describe('👀 미리보기 콜 — 규격', () => {
    it('🔴 앱↔서버 규격에 미리보기 표시가 있다', () => {
        const shared = read('shared/src/index.ts');
        expect(shared).toMatch(/isPreview\?:\s*boolean/);
    });

    it('🔴 없으면 옛 동작이다 — 필드가 선택적이라 옛 APK 가 그대로 돈다', () => {
        const shared = read('shared/src/index.ts');
        // `isPreview: boolean`(필수)이면 옛 앱의 요청이 규격에서 탈락한다
        expect(shared).not.toMatch(/isPreview:\s*boolean/);
    });
});

/**
 * 🔴 **취소 카운트를 올리는 자리는 하나여야 한다.**
 *
 * 지금은 네 곳(`dispatchEngine` ×2 · `detail` · `emergency`)이 각자
 * `incrementDeviceStats(…, "canceled")` 를 부른다. 미리보기 조건을 네 번 적으면
 * 한쪽만 고쳐져 갈라진다 — 이 레포가 반복해서 겪은 「목록을 손으로 나열」이다
 * (경유 4벌 · 상태목록 3벌 · 타이머 키 4벌).
 */
describe('🧮 취소 카운트 — 세는 자리는 한 곳', () => {
    const SITES = [
        'server/src/services/dispatchEngine.ts',
        'server/src/routes/detail.ts',
        'server/src/routes/emergency.ts',
    ];

    it('🔴 취소를 세는 함수가 있다', () => {
        expect(read('server/src/core/cancelCount.ts')).toMatch(/export function countCancel/);
    });

    it('🔴 그 함수만 incrementDeviceStats(…"canceled") 를 부른다', () => {
        for (const f of SITES) {
            expect(code(read(f))).not.toMatch(/incrementDeviceStats\([^)]*["']canceled["']/);
        }
    });

    it('🔴 세기 전에 미리보기인지 본다 — 인성엔 아무 일도 없었다', () => {
        const src = code(read('server/src/core/cancelCount.ts'));
        expect(src).toMatch(/isPreview/);
    });

    /**
     * 🔴 **판단에 쓸 값을 지운 뒤에 판단하지 않는다** (2026-08-22 18:45 실측).
     *
     * `forceCancelEvaluatingOrder` 는 `pendingOrdersData.delete(orderId)` 로 캐시를 지운 **뒤**
     * `countCancel` 을 불렀다. 그러면 세션에서 콜을 못 찾아 `isPreview` 를 영영 못 본다 —
     * 미리보기 콜인데 취소 카운트가 올랐다(실측 `FORCE_CANCEL` +1).
     *
     * 그래서 딱지를 **지우기 전에 뽑아 인자로 넘긴다.** 호출 순서에 기대지 않게 한다.
     */
    it('🔴 강제 정리는 캐시를 지우기 전에 뽑은 딱지를 넘긴다', () => {
        const src = code(read('server/src/services/dispatchEngine.ts'));
        const cut = src.indexOf('pendingOrdersData.delete');
        const call = src.indexOf("countCancel(session", cut);
        expect(cut).toBeGreaterThan(-1);
        expect(call).toBeGreaterThan(-1);
        // 삭제 이후에 부르더라도, 그 호출은 미리 뽑아 둔 값을 함께 넘겨야 한다
        const line = src.slice(call, call + 200).split(';')[0];
        expect(line).toMatch(/wasPreview|isPreview/);
    });
});

/**
 * 🔴 **미리보기 콜은 잡지 않는다** (2026-08-22 실기기 실측으로 발견).
 *
 * 규칙 ①의 *"직접콜(MANUAL)은 심사하지 않는다"* 때문에 서버가 MANUAL 콜을 **즉시 KEEP**
 * 한다. 그런데 미리보기 콜은 기사님이 **확정을 누르기 전**이라 아직 안 잡은 콜이다.
 *
 * 실측: 18:15:11 에 팝업 3장을 읽고 올라온 미리보기 콜이 그대로
 *       `✋ [Two-Track MANUAL] … 즉시 KEEP 처리` 되어 진행 중 콜이 됐다.
 *       KEEP 이라 30초 타이머도 안 돌고, 기사님은 누른 적도 없는 콜을 떠안는다.
 *
 * 🔴 **"심사하지 않는다"와 "잡는다"는 다른 말이다.** 미리보기는 심사도 안 하고 잡지도 않는다 —
 *    판정만 보여주고 기사님의 확정을 기다린다 (규칙 ① 콜의 주인은 기사님이다).
 */
describe('✋ 미리보기 콜 — 확정 전에는 잡지 않는다', () => {
    /**
     * 🔴 **같은 콜을 두 번 판정하지 않는다** (기사님 지적 2026-08-22 19:04).
     *
     * 미리보기로 한 번 판정하고(19:04:52), 확정을 눌러 다시 올라오면 또 판정했다(19:04:59).
     * 같은 콜을 두 번 계산하니 카카오 호출이 두 배가 되고 **관제웹 카드도 두 번 바뀐다** —
     * 기사님이 *"이상한 것 같기도 하고"* 라고 하신 자리다.
     *
     * 미리보기 판정은 **심사 1회 · 불변**으로 이미 저장돼 있다(`judgment` 스냅샷).
     * 확정은 **같은 콜의 상태 승급**이지 새 콜이 아니다 — 있는 판정을 쓴다.
     */
    it('🔴 확정 재전송은 이미 있는 판정을 다시 계산하지 않는다', () => {
        const src = code(read('server/src/routes/detail.ts'));
        expect(src).toMatch(/alreadyJudged|judgment/);
    });

    it('🔴 즉시 KEEP 갈래가 미리보기를 먼저 걸러낸다', () => {
        const src = code(read('server/src/routes/detail.ts'));
        // `isManual` 을 정하는 **그 줄**이 미리보기를 빼야 한다 (다른 곳의 isPreview 로는 안 된다)
        const line = src.split('\n').find(l => l.includes('const isManual')) ?? '';
        expect(line).toMatch(/isPreview/);
    });

    /**
     * 🔴 **관제웹에서도 잡을 수 없다.** 배차망에서 안 잡은 콜이라 여기서 KEEP 을 눌러도
     *    잡히지 않는다 — 결재는 **인성 앱의 확정 버튼**으로 한다. 관제웹은 색만 보여준다.
     */
    it('🔴 미리보기 카드에는 결재 버튼이 없다', () => {
        const card = code(read('client-app/src/components/dashboard/PinnedRouteCard.tsx'));
        const line = card.split('\n').find(l => l.includes("route.type !== 'MANUAL' && evaluating")) ?? '';
        expect(line).toMatch(/!route\.isPreview/);
    });
});

/**
 * 🖥️ **미리보기에게 "결재 대기"는 판정 완료다** (기사님 실측 2026-08-22).
 *
 * 기사님: *"평가를 보여주면 좋을 것 같은데 계속 평가중만 깜박이고 있어."*
 *
 * `ORDER_AWAITING_DECISION` 은 관제웹에서 **결재 대기 = 평가중**으로 그려진다. 원래는 그
 * 자리에 KEEP/CANCEL 버튼이 떠서 할 일이 있었는데, 미리보기는 버튼을 숨기므로 볼 것이
 * 없어졌다. 미리보기에게 이 상태는 **판정이 끝난 것**이다 — 색을 보여줘야 한다.
 */
describe('🖥️ 미리보기 — 판정이 끝나면 색을 보여준다', () => {
    it('🔴 미리보기는 판정 뒤 "평가중"에 머물지 않는다', () => {
        const card = code(read('client-app/src/components/dashboard/PinnedRouteCard.tsx'));
        // 선언이 여러 줄에 걸칠 수 있으므로 `const evaluating =` 부터 세미콜론까지를 본다
        const decl = card.split('const evaluating')[1]?.split(';')[0] ?? '';
        expect(decl).toMatch(/isPreview/);
        expect(decl).toMatch(/ORDER_AWAITING_DECISION/);   // 판정 전에는 평가중이 맞다
    });
});

/**
 * 🔄 **미리보기는 리스트로 돌아가면 즉시 정리한다** (기사님 실측 2026-08-22).
 *
 * 기사님: *"인성앱은 자체적으로 확정 카운터가 돌아가고 그 타이머가 끝나면 다시 리스트
 * 화면으로 돌아가. 근데 관제앱에서는 계속 평가중 타이머가 돌고 있어서 싱크가 많이 차이나."*
 *
 * 서버는 앱이 리스트로 돌아온 것을 **텔레메트리로 알고 있는데도** 무시한다 — 직접콜을
 * 함부로 정리하지 않으려는 규칙 ① 때문이다. 하지만 **미리보기는 아직 안 잡은 콜**이라
 * 그 보호가 필요 없다. 리스트로 돌아갔다 = 이 콜을 안 잡겠다는 뜻이다.
 */
describe('🔄 미리보기 — 리스트로 돌아가면 즉시 정리', () => {
    it('🔴 화면 이탈 정리가 미리보기를 제외하지 않는다', () => {
        const src = code(read('server/src/routes/devices.ts'));
        const line = src.split('\n').find(l => l.includes('startsWith("MANUAL")')) ?? '';
        expect(line).toMatch(/isPreview/);
    });
});

/**
 * 💸 **미리보기는 요금을 다시 본다** (기사님 확정 2026-08-22 · A안).
 *
 * 규칙 ⑤-1 은 *"돈은 앱이 이미 걸렀다 — 서버가 다시 세지 않는다"* 인데, 그 전제는
 * **앱 필터를 통과한 콜**에만 성립한다. 미리보기는 기사님이 리스트에서 아무 콜이나 눌러
 * 보는 것이라 **필터 밖**이다 — 하한가를 넘겼다는 보장이 없다.
 *
 * 실측(18:30): 시급으로는 🔵 90점인데 요율은 `55,000원 < 하한 67,144원` 이었다.
 *
 * ⚠️ **필터콜은 건드리지 않는다.** 거기서 하한을 되살리면 노하우 13번(3만원짜리 고수의
 *    콜)이 다시 똥으로 낙제한다 — 판정색 확정안 v2 가 그 축을 버린 이유다.
 */
describe('💸 미리보기 — 필터 밖이라 단가를 다시 본다 (A안)', () => {
    it('🔴 첫짐 판정이 미리보기일 때 요율 하한을 본다', () => {
        const src = code(read('server/src/core/engine/OrderEvaluator.ts'));
        const first = src.split("kind: 'first'")[0] ?? '';
        expect(first).toMatch(/isPreview/);
    });
});

/**
 * 🔴 **손으로 연 상세는 팝업 3장을 읽은 뒤에 올라간다.**
 *
 * 갈림은 `session.isAutoActive` 하나다 — 이 값은 앱이 `performSimulatedTouch` 를
 * 실행한 직후에만 켜지므로 **"방금 내가 눌렀나"** 를 정확히 뜻한다 (앱 CLAUDE.md 규칙).
 *
 * ⚠️ 앱이 연 상세(필터콜)는 **건드리지 않는다.** 거기서 팝업을 먼저 열면 광클이 늦어져
 *    선점을 놓친다 — 2026-08-09 에 "잡기 전 미리 계산"을 제거한 바로 그 이유다.
 */
describe('🏄 상세 수집 — 손으로 연 상세는 읽고 나서 올린다', () => {
    it('🔴 확정 전 상세에서도 상세 수집을 시작한다', () => {
        const src = code(app('HijackService.kt'));
        // handlePreConfirmScreen 안에서 상세 수집을 거는 자리가 있어야 한다
        const fn = src.split('private fun handlePreConfirmScreen')[1]?.split('private fun ')[0] ?? '';
        expect(fn).toMatch(/startCollect|surfPreConfirm/);
    });

    it('🔴 필터콜(앱이 누른 것)은 지금 그대로 — 광클을 늦추지 않는다', () => {
        const src = code(app('HijackService.kt'));
        const fn = src.split('private fun handlePreConfirmScreen')[1]?.split('private fun ')[0] ?? '';
        // 상세 수집은 isAutoActive == false 인 갈래에서만 걸린다
        expect(fn).toMatch(/!session\.isAutoActive/);
    });

    it('🔴 미리보기로 올린다는 표시를 실어 보낸다', () => {
        expect(code(app('HijackService.kt'))).toMatch(/isPreview/);
    });

    /**
     * 🔴 **확정을 누르면 서버에 알린다** (2026-08-22 18:57 실측으로 발견).
     *
     * 기사님: *"관제엡의 노랑색을 보고 확정을 눌렀어. 그런데 관제엡은 내가 생각한 것과
     * 다르게 움직이고 있어. 싱크가 전혀 안 되는 것 같아."*
     *
     * 확정 화면(`DETAIL_CONFIRMED`)에 들어가도 **아무 요청도 안 나갔다.** 두 자물쇠 때문이다:
     *   ① `handleConfirmedScreen` 은 `surfingState == IDLE` 일 때만 일한다 — 미리보기는 이미 `DONE`
     *   ② `sendConfirmOnce` 는 `isDetailScrapSent` 로 재전송을 막는다
     * 그래서 서버는 여전히 "미리보기"로 알고 30초 뒤 정리해 버린다 — 기사님은 잡았는데.
     *
     * 🔴 **딱지는 벗겨지기만 한다**(용어집 §9). 확정 화면에 들어간 순간이 그 자리다.
     */
    it('🔴 확정 화면에 들어가면 딱지를 벗고 다시 보낸다', () => {
        const src = code(app('HijackService.kt'));
        const fn = src.split('private fun handleConfirmedScreen')[1]?.split('private fun ')[0] ?? '';
        expect(fn).toMatch(/isPreview/);     // 딱지를 벗는 자리가 여기다
        expect(fn).toMatch(/sendDetail/);    // 서버에 알린다
    });

    /**
     * 🔴 **선점 보고는 한 번뿐이다** (기사님 지적 2026-08-22 · H안).
     *
     * 기사님: *"결론적으로 confirm 을 두 번 보내는 것이 문제인 듯싶은데?"*
     *
     * `confirm` 은 **1차 선점 보고**(*"이런 콜을 발견했습니다"*)다 — 확정 버튼과 다른 말이다.
     * 같은 콜을 두 번 발견할 수는 없다. 확정은 *"새로 발견했다"* 가 아니라 **같은 콜의
     * 상태가 바뀐 것**이라 `detail` 하나로 알린다.
     *
     * `evolveOrder` 는 세션에 콜이 있으면 이어받고 없으면 payload 로 만들므로,
     * 미리보기가 이미 정리된 뒤에 확정해도 콜을 잃지 않는다.
     *
     * 덤: 확정 구간에 요청이 하나뿐이라 **순서 경쟁 자체가 사라진다.**
     */
    it('🔴 확정할 때 선점 보고를 다시 하지 않는다', () => {
        const src = code(app('HijackService.kt'));
        const fn = src.split('private fun handleConfirmedScreen')[1]?.split('private fun ')[0] ?? '';
        expect(fn).not.toMatch(/sendConfirmOnce/);
    });
});

/**
 * 🔴 **배차 요청은 한 줄로 나간다** (기사님 지적 2026-08-22 · D안).
 *
 * `confirm` 과 `detail` 을 **같은 풀에 던지는데 스레드가 2개**라 둘이 동시에 출발했다.
 * 실측(19:04:57): `detail` 이 `confirm` 보다 10ms 먼저 닿았다. 서버 계약은
 * *"confirm 이 콜을 만들고 detail 이 승급한다"* 라 **순서가 뒤집히면 안 된다.**
 *
 * 🔴 앱을 기다리게 만들지 않는다(규칙 ② *"HTTP 를 물고 기다리지 않는다"*).
 *    던지는 쪽은 그대로 즉시 리턴하고, **큐가 넣은 순서대로 하나씩 꺼낸다.**
 *
 * 2스레드는 2026-05-08(`9750c58`)에 **롱폴링이 스레드를 오래 물어서** 늘린 것이다.
 * 피기백 V2 로 바뀌어 `sendDetail` 이 202 만 받고 즉시 리턴하는 지금, 그 이유는 사라졌다.
 * ⚠️ 비상 정리·텔레메트리는 원래 각자 전용 스레드라 영향받지 않는다.
 */
describe('🧵 배차 요청 — 큐가 순서를 지킨다 (D안)', () => {
    it('🔴 dispatch 실행기는 한 줄이다', () => {
        const src = code(app('api/ApiClient.kt'));
        const line = src.split('\n').find(l => l.includes('dispatchExecutor =')) ?? '';
        expect(line).toMatch(/newSingleThreadExecutor/);
    });
});
