import { resolvePhaseKey } from "@onedal/shared";
import type { PhaseKey } from "@onedal/shared";

/**
 * 🔴 국면별 필터 설정 — docs/지금/필터.md §3 (2026-08-14 기사님 확정)
 *
 * 기사님: *"이번이 마지막 기준 설정이면 좋겠다. 또 오해가 있어서 잘못 만들지 말자."*
 *
 * 이 테스트는 **명세의 표를 그대로 고정한다.** 값이 바뀌면
 * "명세가 바뀐 것인가, 실수인가"를 먼저 물을 것.
 */
describe('국면 결정 — 두 축의 조합 (§2-4-1)', () => {

    /** 🔄 개정 2026-09-11 — 관내가 파생이 되어 **둘**이다 (이식 C4-8b-2 · 위 진리표 주석 참조) */
    it('🔄 첫짐 2종: 콜 0건일 때 callTarget 가 국면을 정한다', () => {
        expect(resolvePhaseKey('DEST',  'STANDBY')).toBe('first');
        expect(resolvePhaseKey('HOME',  'STANDBY')).toBe('home');
        // 관내는 이제 국면이 아니다 — 옛 값이 들어와도 노선행으로 본다 (안전 기본값)
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
 * 🔄 **국면 × 필드 표 · 기본값 · 조각→평면 매핑 · 저장 JSON 방어가 여기 있었다**
 *    (걷어냄 2026-09-11 · 이식 C3-3b).
 *
 * 넷 다 **값이 국면마다 다섯 벌이던 시절**의 규칙이다:
 *   · `PHASE_FIELDS`            국면마다 어느 칸을 보이고 감출지
 *   · `DEFAULT_PHASE_SETTINGS`  국면마다 다른 기본값
 *   · `applyPhaseToFilter`      국면 이름 → 평면(앱 피기백) 이름으로 옮기는 다리
 *   · `normalizePhaseSettings`  다섯 벌 JSON 을 방어적으로 읽기
 *
 * 🔴 **값이 한 벌이 되며(C3-3a) 넷 다 답할 질문이 없어졌다.** 기사님 2026-09-11:
 *    *"개선되어 중복인건 그냥 삭제 할꺼야."*
 *
 * ✅ **지키던 뜻은 옮겨 갔다 — 사라진 게 아니다**:
 *   · «칸이 늘면 표에만 한 줄» · «없는 값을 지어내지 않는다(NULL≠0)»
 *     → `filterPhaseRows.test.ts` 의 «FILTER_FIELDS — 표 하나가 컬럼·폼을 다 만든다»
 *   · «지금 이 칸이 쓰이나»(감추지 않고 흐리게)
 *     → `phaseUi.test.ts` 의 «안 쓰이는 칸을 감추지 않는다»
 *   · «지금 무엇을 하나»(국면 결정 진리표)
 *     → **위 describe 가 그대로 지킨다**
 */
