import { readFileSync } from 'fs';
import { join } from 'path';
import { sameCallOf } from '../../src/routes/detail';
import { callFromShape, callShapeOf, CALL_SHAPE_VERSION } from '@onedal/shared';

/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  배차 규칙 회귀 방지 — **"이건 버그가 아니라 규칙이다"**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 이 파일이 있는 이유는 하나다. **주석은 무시할 수 있지만 빨간불은 못 넘긴다.**
 *
 * 규칙이 깨지는 모양은 늘 같다 —
 * **일부러 비대칭으로 둔 것을 "빠뜨린 것"으로 읽고 고쳐서** 규칙을 깨뜨린다. 예:
 *   · MANUAL 에 안전취소가 없는 것을 "누락"으로 읽고 지우자고 한다
 *   · 6단계 시퀀스를 "중복"으로 읽고 두 단계를 한 번에 저장한다
 *   · 요약 줄의 콜 번호를 "군더더기"로 읽고 지운다
 *
 * 그래서 규칙을 **문장이 아니라 검사**로 남긴다. 새 규칙이 확인될 때마다 여기에 한 줄 늘린다.
 *
 * ⚠️ 이 테스트가 깨졌다면 **먼저 "내가 규칙을 어긴 건 아닌가"를 의심할 것.**
 *    규칙 자체를 바꿔야 한다면 기사님과 합의한 뒤 이 파일부터 고친다.
 */

const SRC = join(__dirname, '../../src');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
/** 주석은 걷어낸다 — 갈래 안 주석에 이름을 적어도 세지 않게 */
const code = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// ─────────────────────────────────────────────────────────────────
// ① 콜의 주인은 기사님이다
// ─────────────────────────────────────────────────────────────────
describe('규칙 ① 콜의 주인은 기사님이다', () => {
    /**
     * 출처: README 「이건 버그가 아니라 규칙이다」 ①
     *   *"서버는 콜을 스스로 버리거나 취소하지 않는다 — 조건이 나빠도 이유만 적어 관제웹에 보인다"*
     *
     * 요율이 미달이어도 서버는 **사유만 남긴다.** 판단은 기사님 몫이다.
     */
    it('요율 미달은 사유만 남긴다 — 서버가 콜을 버리지 않는다', () => {
        const src = read('core/engine/OrderEvaluator.ts');
        const idx = src.indexOf('요율 미달');
        expect(idx).toBeGreaterThan(0);

        // 요율 판정부 근처에서 콜을 없애는 호출이 나오면 규칙 위반이다
        const around = src.slice(Math.max(0, idx - 1500), idx + 1500);
        // ⚠️ 여기의 상태값은 **검사 대상 소스의 이름**이라 개명 때 같이 고쳐야 한다.
        //    (ORDER_CANCELED → SAFE_CANCEL. 안 고치면 검사가 조용히 아무것도 안 본다)
        expect(around).not.toMatch(/forceCancelEvaluatingOrder|handleDecision\s*\([^)]*SAFE_CANCEL/);
    });

    /**
     * 출처: README 「이건 버그가 아니라 규칙이다」 ①
     *   *"기사님이 직접 누른 콜(`matchType: 'MANUAL'`)에는 안전취소 자동 취소를 걸지 않는다"*
     * 기사님: *"수동으로 잡은 콜은 무조건 콜이 들어 오는 거고."*
     *
     * 🔴 유령 콜을 없애려고 MANUAL 경로에 `forceCancelEvaluatingOrder` 를 넣으면
     *    바로 이 규칙 위반이다.
     *    카카오가 잠깐 죽었다고 기사님이 실제로 들고 있는 짐을 서버가 지우는 셈이다.
     */
    /* MANUAL 콜은 즉시 KEEP — 동작 검사 factWhoConfirmed «손으로 확정한 콜은 서버가 바로 KEEP» 가 문다(31 P0 T) */

    it('🔴 MANUAL 경로에서 콜을 지우는 것은 평가가 아니라 **확정까지** 실패했을 때뿐이다', () => {
        const src = code(read('routes/detail.ts'));
        // 끝은 코드 줄(심사 갈래의 결재 큐 등록)로 자른다 — 그 줄을 못 찾으면 범위가 파일 끝까지 늘어나므로 먼저 문다
        const start = src.indexOf('if (isManual)');
        const end = src.indexOf('session.pendingDecisions.set(payload.order.id, { action: null');
        expect(start).toBeGreaterThan(-1);
        expect(end).toBeGreaterThan(start);
        const branch = src.slice(start, end);
        const cancels = branch.match(/forceCancelEvaluatingOrder/g) ?? [];
        // 마지막 출구(확정 실패) 하나뿐이어야 한다. 늘어났다면 규칙이 새고 있다
        expect(cancels.length).toBe(1);
        // 그리고 그 자리는 handleDecision 뒤여야 한다 (평가 실패로는 안 지운다)
        expect(branch.indexOf('handleDecision')).toBeLessThan(branch.indexOf('forceCancelEvaluatingOrder'));
    });

    /**
     * 출처: README 「이건 버그가 아니라 규칙이다」 ① — KEEP 된 콜은 절대 취소하지 않는다
     *   (`services/dispatchEngine.ts` 의 `forceCancelEvaluatingOrder` 머리도 같은 말이다)
     */
    /* KEEP 이면 타임아웃이 취소하지 않음 — 동작 검사 factWhoConfirmed «대조 — KEEP 이 내려진 콜은…» · deviceRelease 가 문다(31 P0 T) */
});

// ─────────────────────────────────────────────────────────────────
// ② 안전장치는 겹쳐 둔다, 빼지 않는다
// ─────────────────────────────────────────────────────────────────
describe('규칙 ② 안전장치는 겹쳐 둔다', () => {
    /**
     * 출처: README 「이건 버그가 아니라 규칙이다」 ②
     *   *"서버가 앱에 보내는 명령(KEEP/CANCEL)은 **앱이 받았다고 답할 때까지** 지우지 않고"* (at-least-once)
     *   판결을 한 번 보내고 지우면 그 응답이 유실될 때 **영구 유실**된다.
     */
    it('판결은 앱의 ACK 로만 지운다 — 보내고 나서 지우면 유실된다', () => {
        // «받았음»은 관제앱 공급 소켓 한 길 — 결재를 지우는 곳은 ackDecision 안뿐 · 보고 문은 결재를 다루지 않는다
        expect(read('routes/scrap.ts')).not.toMatch(/pendingDecisions\.delete\(|ackDecision/);
        expect(read('socket/supplySocket.ts')).toContain('ackDecision(io, getUserSession(userId), userId, ack.orderId,');
        const src = read('state/decisions.ts');
        const deletes = [...src.matchAll(/pendingDecisions\.delete\(([^)]*)\)/g)];
        expect(deletes.length).toBe(1);
        // 지우는 자리가 받았음 함수 밖이면 at-least-once 가 깨진다
        expect(deletes[0].index).toBeGreaterThan(src.indexOf('export function ackDecision('));
    });

    /**
     * 출처: README 「이건 버그가 아니라 규칙이다」 ② — *"명령마다 `orderId` 를 싣는다"*
     *   orderId 가 없으면 오더A 의 응답이 오더B 화면에서 실행된다 ("Ghost Response").
     */
    it('관제앱으로 가는 결재에는 orderId 가 반드시 실린다', () => {
        const src = read('state/decisions.ts');
        const start = src.indexOf('out.push({');
        expect(start).toBeGreaterThan(0);
        // 객체 리터럴 **안쪽만** 본다. 근처 로그의 `orderId:` 에 속으면 안 된다
        const literal = src.slice(start, src.indexOf('})', start));
        expect(literal).toMatch(/\borderId\b/);
    });

    /**
     * 🧟 타이머 좀비
     *   `setTimeout` ID 를 저장하지 않으면 오더가 사라져도 타이머를 못 끈다.
     */
    /* 안전취소 경고 · 해제는 장부에 — 동작 검사 factWhoConfirmed «원달앱이 확정한 콜은 결재를 기다린다»(entries 의 warn_ · timeout_) 가 문다(31 P0 T) */
});

// ─────────────────────────────────────────────────────────────────
// ③ 데이터를 변조해서 동작을 바꾸지 않는다
// ─────────────────────────────────────────────────────────────────
describe('규칙 ③ 데이터를 변조해서 동작을 바꾸지 않는다', () => {
    /**
     * 출처: README 「이건 버그가 아니라 규칙이다」 ④
     *   *"조건을 건너뛰려고 값을 덮어쓰지 않는다 (예: 반경을 `999` 로) — 조건문으로 건너뛴다"*
     *   합짐 모드에서는 앱이 `isSharedMode` 를 보고 규칙으로 상차 거리 검사를 건너뛴다.
     *
     * 값을 거짓으로 만들어 동작을 바꾸면, 그 값을 읽는 **모든 다른 곳**이 함께 속는다.
     */
    it('합짐이라고 상차 반경을 999 같은 가짜 값으로 덮어쓰지 않는다', () => {
        for (const f of ['state/filterManager.ts', 'services/dispatchEngine.ts']) {
            expect(read(f)).not.toMatch(/pickupRadiusKm\s*[:=]\s*999/);
        }
    });
});

/**
 * 🔴 규칙 ① — **KEEP 된 콜은 절대 취소하지 않는다**
 *
 * KEEP 뒤 앱이 리스트로 이탈할 때, 화면 이탈 감지가 deviceEvaluatingMap 만 보고 콜의 상태를
 * 안 보면 **확정된 콜을** SAFE_CANCEL 로 덮어쓴다 (그 맵은 피기백 ACK 까지 남아 있어야 해서
 * KEEP 뒤에도 살아 있다). 그래서 강제 정리는 심사 중인 콜만 건드린다.
 *
 * 또 재열람 대조가 **취소된 콜**에 매칭하면 "진짜 ID" 를 돌려줘 새 콜이 만들어지지 않은 채
 * 30초 타이머로 죽는다 — 취소했다가 다시 잡는 정상 흐름이 막힌다. 그래서 종결된 콜은 건너뛴다.
 */
describe('규칙 ① — 강제 정리는 심사 중인 콜만 건드린다', () => {
    const src = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');

    it('🔴 forceCancelEvaluatingOrder 가 심사 중(isEvaluating)인지 확인한다', () => {
        const engine = src('../../src/services/dispatchEngine.ts');
        const body = engine.slice(engine.indexOf('export function forceCancelEvaluatingOrder'));
        expect(body.slice(0, 2000)).toMatch(/isEvaluating\(/);
    });

    it('🔴 재열람 대조는 종결된 콜을 건너뛴다 — 취소한 콜을 다시 잡을 수 있어야 한다', () => {
        const detail = src('../../src/routes/detail.ts');
        expect(detail).toMatch(/myOrders\.filter\(\w+ => !isTerminal\(/);
    });
});

/**
 * 🔁 **같은 콜 찾기는 정거장 글자(`stopTextOf` — 상세 주소가 먼저)를 견준다** — 서버가 판정 글자로 정거장을 덮어쓰지 않는다.
 *    덮어쓴 글자끼리 견주면 다시 연 인성 괄호 콜이 다른 콜로 뜨고, 목록 하차만 같은 화물24시 두 콜이 한 콜로 묶인다.
 */
describe('🔁 같은 콜 찾기 — sameCallOf', () => {
    const insungPickup = '경기 화성시 안녕동 158-95(경기 화성시 안녕남로119번길 25)';
    const call = (id: string, pickup: { listText: string; addressDetail?: string }, dropoff: { listText: string; addressDetail?: string }, fare = 50000): any =>
        ({ id, fare, pickupDetails: [pickup], dropoffDetails: [dropoff] });

    it('🔴 앞 콜 상차 글자가 다듬어져 있어도 상세 주소가 같으면 같은 콜이다', () => {
        const before = call('a', { listText: '경기 화성시 안녕동 158-95', addressDetail: insungPickup }, { listText: '경기 오산시 원동' });
        const reopened = call('b', { listText: insungPickup, addressDetail: insungPickup }, { listText: '경기 오산시 원동' });
        expect(sameCallOf(before, reopened)).toBe(true);
    });

    it('🔴 화물24시 — 목록 하차가 같아도 상세 하차 주소가 다르면 다른 콜이다', () => {
        const pickup = { listText: '경기 군포 부곡동', addressDetail: '경기 군포 당정동 공단로124번길 4' };
        const one = call('a', pickup, { listText: '경기 안산 단원구 와동', addressDetail: '경기 안산 단원구 와동 715' });
        const two = call('b', pickup, { listText: '경기 안산 단원구 와동', addressDetail: '경기 안산 단원구 와동 820-3' });
        expect(sameCallOf(one, two)).toBe(false);
    });

    it('번호가 같으면 같은 콜이다', () => {
        expect(sameCallOf(call('a', { listText: '가산동' }, { listText: '방배동' }), call('a', { listText: '구로동' }, { listText: '방배동' }, 1))).toBe(true);
    });

    /* 🔢 오더 번호 — 두 콜 모두 번호가 있을 때만 번호로 가른다(배차망 이름이 아니라 «번호가 있다» 사실로) */
    const pickup24 = { listText: '경기 군포 부곡동', addressDetail: '경기 군포 당정동 공단로124번길 4 (크레텍)' };
    const dropoff24 = { listText: '경기 화성 신동', addressDetail: '경기 화성 신동 703' };
    const numbered = (id: string, orderNo: string | null, pickup = pickup24): any => ({ ...call(id, pickup, dropoff24, 250000), orderNo });

    it('🔴 노선 · 요금 · 상차 상세 주소가 같아도 오더 번호가 다르면 다른 콜이다', () => {
        expect(sameCallOf(numbered('a', '3-4991-0836'), numbered('b', '3-5100-2200'))).toBe(false);
    });

    it('오더 번호가 같으면 상차 글자가 조금 달라도 같은 콜이다', () => {
        const reopened = numbered('b', '3-4991-0836', { listText: '경기 군포 당정동', addressDetail: '경기 군포 당정동 공단로124번길 4' });
        expect(sameCallOf(numbered('a', '3-4991-0836'), reopened)).toBe(true);
    });

    it('한쪽이라도 오더 번호가 없으면 노선 · 요금 · 주소로 가른다', () => {
        expect(sameCallOf(numbered('a', '3-4991-0836'), numbered('b', null))).toBe(true);
        expect(sameCallOf(numbered('a', null), numbered('b', '3-5100-2200'))).toBe(true);
        expect(sameCallOf(numbered('a', null), numbered('b', null))).toBe(true);
    });

    it('🔴 콜 한 칸으로 되살린 콜도 오더 번호로 가른다', () => {
        const restored = callFromShape(callShapeOf(numbered('a', '3-4991-0836')), CALL_SHAPE_VERSION) as any;
        expect(restored.orderNo).toBe('3-4991-0836');
        expect(sameCallOf(restored, numbered('b', '3-5100-2200'))).toBe(false);
    });
});

/**
 * 🗺️ **합짐 중에는 경로 우선순위를 바꿀 수 없다** (기사님 확정)
 *
 * "진행 중 리스트가 2개 이상이면 추천·시간·거리 중 선택되지 못한 버튼을 숨긴다.
 *  그럼 어떤 것이 선택되어 있는지 알 수 있고 경로를 바꿀 수 없게 되는 거지."
 *
 * 우선순위 변경은 도로 선택을 바꾼다 — 순서는 안 바뀌지만 주행 시간이 변해
 * 이미 잡은 약속들과 어긋날 수 있다. 콜이 하나일 때만 고르게 한다.
 */
describe('합짐 중 경로 우선순위 잠금', () => {
    it('🔴 진행 2건 이상이면 선택된 것만 남기고 잠근다', () => {
        const route = readFileSync(join(__dirname,
            '../../../client-app/src/components/stage/StageView.tsx'), 'utf8');
        expect(route).toMatch(/isPriorityLocked\(/);
    });

    /**
     * 🔴 **심사 중에도 잠근다** (기사님 확정)
     *
     * 기사님: *"합짐1 심사 때 경로를 바꿀 수 없다 —
     * **이미 그 경로로 들어온 콜**일 테니까."*
     *
     * 🔴 **그 한 줄이 규칙의 뿌리다.** 합짐은 **첫짐 경로 위에서 산출된 콜**이다.
     *    그 경로를 바꾸면 «가는 길에 있다»는 **산출 근거 자체가 사라진다** —
     *    바꿔 보게 열어 두면 결재의 재료가 무너진다.
     *
     * ⚠️ 그러므로 **심사 중인 콜도 센다.** 규칙은 `lib/routePriority.ts` 한 곳에 있다.
     */
    it('🔴 심사 중인 콜도 «화면의 콜»로 센다 — 예외를 두지 않는다', () => {
        const route = readFileSync(join(__dirname,
            '../../../client-app/src/components/stage/StageView.tsx'), 'utf8');
        // 🔴 변수 이름에 기대지 않는다 — 잠금을 «어디서 얻는가»가 규칙이다
        const lock = route.match(/const \w+ = isPriorityLocked\([^;]+;/)?.[0] ?? '';
        // 규칙은 한 곳(lib/routePriority)에서 온다 — 여기서 다시 세지 않는다
        expect(lock).toMatch(/isPriorityLocked\(/);
        // 🔴 심사 중 예외(`isEvaluating`·`anyEvaluating`)가 다시 들어오면 빨간불
        expect(lock).not.toMatch(/isEvaluating|anyEvaluating/);
    });

    it('세는 규칙 자체는 `lib/routePriority` 하나에 있다 (규칙 ③)', () => {
        const lib = readFileSync(join(__dirname,
            '../../../client-app/src/lib/routePriority.ts'), 'utf8');
        expect(lib).toMatch(/export function isPriorityLocked/);
        expect(lib).toMatch(/callsOnScreen >= 2/);
    });
});
