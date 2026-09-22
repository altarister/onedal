import { resolvePhaseKey } from "@onedal/shared";
import type { PhaseKey } from "@onedal/shared";

/**
 * 🔴 국면별 필터 설정 (기사님 확정)
 *
 * 기사님: *"이번이 마지막 기준 설정이면 좋겠다. 또 오해가 있어서 잘못 만들지 말자."*
 *
 * 이 테스트는 **명세의 표를 그대로 고정한다.** 값이 바뀌면
 * "명세가 바뀐 것인가, 실수인가"를 먼저 물을 것.
 */
describe('국면 결정 — 두 축의 조합 (§2-4-1)', () => {

    /** 🔄 첫짐은 **둘**(노선행 · 복귀)이다 — 관내는 국면이 아니라 파생이다 */
    it('🔄 첫짐 2종: 콜 0건일 때 callTarget 가 국면을 정한다', () => {
        expect(resolvePhaseKey('DEST',  'STANDBY')).toBe('first');
        expect(resolvePhaseKey('HOME',  'STANDBY')).toBe('home');
        // 관내는 국면이 아니다 — 저장된 `LOCAL` 이 들어와도 노선행으로 본다 (안전 기본값)
        expect(resolvePhaseKey('LOCAL' as any, 'STANDBY')).toBe('first');
    });

    it('🔴 콜을 잡으면 어디서 출발했든 **합짐**이다 — 관내·복귀는 "첫짐의 자리"', () => {
        // 기사님: "첫짐-합짐-운행중-관내-합짐-운행중-복귀-합짐-운행중"
        for (const target of ['DEST', 'HOME']) {
            expect(resolvePhaseKey(target, 'GATHERING')).toBe('merge');
        }
    });

    it('🔴 출발하면 어디서 출발했든 **운행중**이다', () => {
        for (const target of ['DEST', 'HOME']) {
            expect(resolvePhaseKey(target, 'DELIVERING')).toBe('drive');
        }
    });

    it('알 수 없는 callTarget 는 노선행(DEST)으로 본다 (안전 기본값)', () => {
        expect(resolvePhaseKey('', 'STANDBY')).toBe('first');
        expect(resolvePhaseKey('???', 'STANDBY')).toBe('first');
    });

});

/**
 * 🔄 **값은 국면마다 여러 벌이 아니라 한 벌이다** — 그래서 국면에 매인 넷을 두지 않는다:
 *   · 국면마다 어느 칸을 보이고 감출지 정하는 표
 *   · 국면마다 다른 기본값
 *   · 국면 이름 → 평면(앱 피기백) 이름으로 옮기는 다리
 *   · 다섯 벌 JSON 을 방어적으로 읽기
 * 기사님: *"개선되어 중복인건 그냥 삭제 할꺼야."*
 *
 * ✅ **그 넷이 지키던 뜻은 이 검사들이 지킨다**:
 *   · «칸이 늘면 표에만 한 줄» · «없는 값을 지어내지 않는다(NULL≠0)»
 *     → `filterPhaseRows.test.ts` 의 «FILTER_FIELDS — 표 하나가 컬럼·폼을 다 만든다»
 *   · «지금 이 칸이 쓰이나»(감추지 않고 흐리게)
 *     → `phaseUi.test.ts` 의 «안 쓰이는 칸을 감추지 않는다»
 *   · «지금 무엇을 하나»(국면 결정 진리표)
 *     → **위 describe 가 그대로 지킨다**
 */
