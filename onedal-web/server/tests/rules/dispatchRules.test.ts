import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  배차 규칙 회귀 방지 — **"이건 버그가 아니라 규칙이다"**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 이 파일이 있는 이유는 하나다. **주석은 무시할 수 있지만 빨간불은 못 넘긴다.**
 *
 * 2026-08-13 기사님: *"내 의도와 다르게 수정되는 부분이 있는 것 같아.
 *                     그걸 어떻게 미연에 방지할 수 있는지 솔루션을 찾아봐."*
 *
 * 실제로 반복된 사고의 형태는 늘 같았다 —
 * **일부러 비대칭으로 둔 것을 "빠뜨린 것"으로 읽고 고쳐서** 규칙을 깨뜨렸다.
 *   · MANUAL 에 안전취소가 없는 것을 "누락"으로 읽음 → 지우자고 제안 (2026-08-13)
 *   · 6단계 시퀀스를 "중복"으로 읽고 두 단계를 한 번에 저장 (2026-08-12)
 *   · 요약 줄의 콜 번호를 "군더더기"로 읽고 제거 (2026-08-12)
 *
 * 그래서 규칙을 **문장이 아니라 검사**로 남긴다. 새 규칙이 확인될 때마다 여기에 한 줄 늘린다.
 *
 * ⚠️ 이 테스트가 깨졌다면 **먼저 "내가 규칙을 어긴 건 아닌가"를 의심할 것.**
 *    규칙 자체를 바꿔야 한다면 기사님과 합의한 뒤 이 파일부터 고친다.
 */

const SRC = join(__dirname, '../../src');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

// ─────────────────────────────────────────────────────────────────
// ① 콜의 주인은 기사님이다
// ─────────────────────────────────────────────────────────────────
describe('규칙 ① 콜의 주인은 기사님이다', () => {
    /**
     * 출처: `docs/architecture/필터_체계.md` §6
     *   *"자동 취소하지 않습니다. 관제탑에 사유만 표시하고, 사장님이 최종 판단합니다."*
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
        //    (2026-08-18 ORDER_CANCELED → SAFE_CANCEL. 안 고치면 검사가 조용히 아무것도 안 본다)
        expect(around).not.toMatch(/forceCancelEvaluatingOrder|handleDecision\s*\([^)]*SAFE_CANCEL/);
    });

    /**
     * 출처: `docs/시퀀스_수동.md`
     *   *"[MANUAL TRACK] 기사님 수동 콜 포획 (사용자 의도 → 안전취소 불필요)"*
     *   *"기사님 의도이므로 묻지 않고 확정"*
     * 기사님: *"수동으로 잡은 콜은 무조건 콜이 들어 오는 거고."*
     *
     * 🔴 2026-08-13 — 유령 콜을 없애자며 MANUAL 경로에
     *    `forceCancelEvaluatingOrder` 를 넣자고 제안했다. 정확히 이 규칙 위반이었다.
     *    카카오가 잠깐 죽었다고 기사님이 실제로 들고 있는 짐을 서버가 지우는 셈이다.
     */
    it('MANUAL 콜은 즉시 KEEP 된다 — 서버가 심사하지 않는다', () => {
        const src = read('routes/detail.ts');
        const branch = src.slice(src.indexOf('if (isManual)'));
        expect(branch).toMatch(/pendingDecisions\.set\([^)]*action:\s*'KEEP'/);
    });

    it('🔴 MANUAL 경로에서 콜을 지우는 것은 평가가 아니라 **확정까지** 실패했을 때뿐이다', () => {
        const src = read('routes/detail.ts');
        const branch = src.slice(src.indexOf('if (isManual)'), src.indexOf('// [Option B]'));
        const cancels = branch.match(/forceCancelEvaluatingOrder/g) ?? [];
        // 마지막 출구(확정 실패) 하나뿐이어야 한다. 늘어났다면 규칙이 새고 있다
        expect(cancels.length).toBe(1);
        // 그리고 그 자리는 handleDecision 뒤여야 한다 (평가 실패로는 안 지운다)
        expect(branch.indexOf('handleDecision')).toBeLessThan(branch.indexOf('forceCancelEvaluatingOrder'));
    });

    /**
     * 출처: `docs/architecture/안전모드_구조.md` §핵심 방어 원칙 1 (Phase 1)
     *   *"KEEP된 콜은 절대 취소하지 않는다"*
     */
    it('KEEP 결재가 내려진 콜은 타임아웃이 취소하지 않는다', () => {
        const src = read('routes/detail.ts');
        const timeout = src.slice(src.indexOf('const timeoutTimer'));
        expect(timeout).toMatch(/action === 'KEEP'[\s\S]{0,400}return/);
    });
});

// ─────────────────────────────────────────────────────────────────
// ② 안전장치는 겹쳐 둔다, 빼지 않는다
// ─────────────────────────────────────────────────────────────────
describe('규칙 ② 안전장치는 겹쳐 둔다', () => {
    /**
     * 출처: `docs/troubleshooting/배차_동기화_장애.md`
     *   *"서버는 앱이 확인할 때까지 판결을 삭제하지 않습니다"* (at-least-once)
     *   판결을 한 번 보내고 지우면 그 응답이 유실될 때 **영구 유실**된다.
     */
    it('판결은 앱의 ACK 로만 지운다 — 보내고 나서 지우면 유실된다', () => {
        const src = read('routes/scrap.ts');
        const deletes = [...src.matchAll(/pendingDecisions\.delete\(([^)]*)\)/g)].map(m => m[1].trim());
        expect(deletes.length).toBeGreaterThan(0);
        // 지우는 자리가 하나라도 ackDecisionId 가 아니면 at-least-once 가 깨진다
        expect(deletes.every(arg => arg === 'ackDecisionId')).toBe(true);
    });

    /**
     * 출처: 같은 문서 — 결함 #2 (orderId 미검증)
     *   오더A 의 응답이 오더B 화면에서 실행되던 "Ghost Response" 의 직접 원인.
     */
    it('피기백 판결에는 orderId 가 반드시 실린다', () => {
        const src = read('routes/scrap.ts');
        const start = src.indexOf('piggybackDecision = {');
        expect(start).toBeGreaterThan(0);
        // 객체 리터럴 **안쪽만** 본다. 근처 로그의 `orderId:` 에 속으면 안 된다
        const literal = src.slice(start, src.indexOf('}', start));
        expect(literal).toMatch(/\borderId\s*:/);
    });

    /**
     * 출처: 같은 문서 — 결함 #4 (타이머 좀비)
     *   `setTimeout` ID 를 저장하지 않으면 오더가 사라져도 타이머를 못 끈다.
     */
    it('안전취소 타이머는 ID 를 저장해 취소할 수 있어야 한다', () => {
        const src = read('routes/detail.ts');
        expect(src).toMatch(/activeTimers\.set\(`warn_/);
        expect(src).toMatch(/activeTimers\.set\(`timeout_/);
    });
});

// ─────────────────────────────────────────────────────────────────
// ③ 데이터를 변조해서 동작을 바꾸지 않는다
// ─────────────────────────────────────────────────────────────────
describe('규칙 ③ 데이터를 변조해서 동작을 바꾸지 않는다', () => {
    /**
     * 출처: `docs/architecture/필터_체계.md` §5 · 변경 이력 2026-04-23
     *   *"합짐 모드에서는 상차 반경을 데이터로 조작하지 않습니다
     *     (과거에는 999km로 덮어썼으나 제거됨). 대신 앱이 isSharedMode 를 보고
     *     규칙으로 거리 검사를 건너뜁니다."*
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
 * 🔴 규칙 ① — **KEEP 된 콜은 절대 취소하지 않는다** (2026-08-19 실사고)
 *
 * 03:35:19 KEEP → 03:35:29 앱이 리스트로 이탈 → 화면 이탈 감지가 **확정된 콜을**
 * SAFE_CANCEL 로 덮어썼다. 이탈 감지는 deviceEvaluatingMap 만 보고 콜의 상태를
 * 안 봤다 (그 맵은 피기백 ACK 까지 남아 있어야 해서 KEEP 뒤에도 살아 있다).
 *
 * 이어서 같은 콜을 다시 잡자, 재열람 대조가 **취소된 콜**에 매칭해 "진짜 ID" 를
 * 돌려줬고 새 콜은 만들어지지 않은 채 30초 타이머로 죽었다 — 취소했다가
 * 다시 잡는 정상 흐름이 영영 막히는 버그다.
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
 * 🗺️ **합짐 중에는 경로 우선순위를 바꿀 수 없다** (기사님 확정 2026-08-19)
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
            '../../../client-app/src/components/dashboard/PinnedRoute.tsx'), 'utf8');
        expect(route).toMatch(/priorityLocked/);
    });

    /**
     * 기사님(2026-08-19 보완): *"안전취소 30초 동안은 경로를 바꿔 볼 수 있어야
     * 잡을지 말지를 결정할 수 있을 것 같아."*
     * 심사 중에는 "이 콜을 붙이면 어떤 경로가 되나"를 보는 것이 결재의 재료다.
     */
    it('🔴 심사 중(평가 콜 존재)에는 잠그지 않는다 — 결재의 재료다', () => {
        const route = readFileSync(join(__dirname,
            '../../../client-app/src/components/dashboard/PinnedRoute.tsx'), 'utf8');
        const lock = route.match(/const priorityLocked = [^;]+;/)?.[0] ?? '';
        expect(lock).toMatch(/isEvaluating/);
    });
});
