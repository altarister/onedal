import { readFileSync } from 'fs';
import { join } from 'path';

const sheet = () => readFileSync(join(__dirname,
    '../../../client-app/src/components/dashboard/StepSheetMock.tsx'), 'utf8');
const code = () => sheet().split('\n')
    .filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');

/**
 * 🎯 **단계마다 주 버튼은 하나다** (기사님 확정 2026-08-19)
 *
 * 기사님: *"지금 보니 상차지 도착과 상차 완료가 완전 똑같은데? 이거 중복으로 하나 더
 * 생긴 거 아닌가?"*
 *
 * 두 단계가 **같은 시트를 보여주고 버튼 두 개가 나란히** 있어서 똑같아 보였다.
 * 데이터로는 다른 사실인데(도착 = 거기 갔다 · 완료 = 실었다) 화면이 구분을 지웠다.
 * 그래서 도착을 안 누르고 상차 완료만 눌러도 넘어갔고, 실측에서 그런 콜이 실제로 나왔다.
 *
 * ⚠️ **둘을 합치지는 않는다** — 도착과 상차 사이가 화주 부재·대기·불일치를 잡는
 *    유일한 구간이다 (`✕ 상차 취소` 가 그 자리에 있다). 화면만 갈랐다.
 *
 * → 지금 단계의 버튼 하나만 보인다:
 *      상차지 도착 → `📍 도착`        (+ 건너뛰기)
 *      상차 완료   → `📦 상차 완료`    (+ 건너뛰기, + ✕ 상차 취소)
 *      하차지 도착 → `📍 도착`        (+ 건너뛰기)
 *      하차 완료   → `🏁 하차 완료`    (건너뛰기 없음 — 콜의 끝)
 */
/**
 * 🏗️ 옛 시트(StopCallSheet)는 철거됐다 (기사님 확인 2026-08-21).
 * "단계마다 주 버튼 하나"는 이제 **구조가 보장한다** — 단계마다 컴포넌트가 따로다
 * (LiveCall · LiveArrive · LiveDone). stepId 조건 분기로 버튼을 숨기던 옛 방식의
 * 검사들은 아래처럼 구조 검사로 바뀐다.
 */
describe('단계마다 주 버튼 하나 — 컴포넌트 분리가 보장한다', () => {
    it('단계별 컴포넌트가 따로다 — 도착과 완료가 같은 화면에 겹칠 수 없다', () => {
        const c = code();
        expect(c).toMatch(/function LiveCall/);
        expect(c).toMatch(/function LiveArrive/);
        expect(c).toMatch(/function LiveDone/);
    });

    it('도착 화면에는 완료 버튼이 없다', () => {
        const c = code();
        const arrive = c.slice(c.indexOf('function LiveArrive'), c.indexOf('function LiveDone'));
        expect(arrive).not.toMatch(/상차 완료|하차 완료/);
    });
});

describe('현장 내용 저장 — 완료 뒤 수정용', () => {
    it('🔴 완료 뒤에만 💾 다시 저장이 있다 — 완료 전 저장 버튼은 중복이다', () => {
        const c = code();
        const done = c.slice(c.indexOf('function LiveDone'));
        expect(done).toMatch(/done[\s\S]{0,600}💾/);
        expect(done).toMatch(/다시 저장/);
    });
});
