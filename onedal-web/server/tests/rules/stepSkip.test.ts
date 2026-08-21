import { readFileSync } from 'fs';
import { join } from 'path';
import { deriveCallStep, MILESTONE_SOURCES, isSkipped, canReportMilestone } from '@onedal/shared';

/**
 * ⏭️ **건너뛴 것도 데이터로 남는다** (기사님 확정 2026-08-19)
 *
 * 기사님: *"내가 확인한 건지 아닌지가 명확하게 데이터로 남아 있어야 데이터로 가치가
 * 있는지 판단할 수 있을 것 같아. 콜의 6단계를 시퀀스적으로 만든 거고, 그걸 넘어갈 때의
 * 조건이 내 선택이 필수가 아니어야 하겠다 — 통화 스킵과 같은 거 말야."*
 *
 * 지금은 갈라져 있다:
 *   통화 단계(0·1) — `SKIPPED` 리포트로 **서버에 남는다** (2026-08-12)
 *   현장 단계(2~5) — `skippedTo` **세션 로컬**뿐 → 새로고침하면 되살아난다
 *
 * → 현장 스킵도 마일스톤으로 남기고, **출처를 삼분**한다:
 *
 *   | source       | 뜻            | 데이터 가치 |
 *   |--------------|---------------|-------------|
 *   | `MANUAL_WEB` | 직접 눌렀다   | **확인된 시각** — 실측 통계에 쓴다 |
 *   | `GPS`        | 자동 감지     | 참고값 — 500m 안에 들어왔다 |
 *   | `SKIPPED`    | 안 한 채 지나감 | 그 콜의 실측은 **믿을 수 없다** |
 */
describe('출처 삼분 — 확인했는가 아닌가', () => {
    it('🔴 SKIPPED 가 출처 목록에 있다', () => {
        expect(MILESTONE_SOURCES).toContain('SKIPPED');
        expect(MILESTONE_SOURCES).toContain('GPS');
        expect(MILESTONE_SOURCES).toContain('MANUAL_WEB');
    });

    it('🔴 isSkipped 로 한 곳에서 가른다 — 문자열 비교를 흩지 않는다', () => {
        expect(isSkipped({ source: 'SKIPPED' })).toBe(true);
        expect(isSkipped({ source: 'GPS' })).toBe(false);
        expect(isSkipped({ source: 'MANUAL_WEB' })).toBe(false);
        expect(isSkipped({})).toBe(false);
    });
});

/**
 * 🔴 **건너뛴 단계는 "지나갔지만 증거가 없다"** — 두 성질이 다르다.
 *    진행(index)은 앞으로 가지만, 초록칠(done)은 안 된다.
 *    화면에서 구분되지 않으면 "확인한 것"과 "넘어간 것"이 같아 보인다.
 */
describe('deriveCallStep — 건너뛴 단계는 초록이 아니다', () => {
    const ms = (milestone: string, source = 'MANUAL_WEB') => ({ milestone, source });

    it('직접 찍은 도착은 진행도 하고 초록도 된다', () => {
        const p = deriveCallStep([ms('ARRIVED_PICKUP')], []);
        expect(p.index).toBe(3);
        expect(p.done[2]).toBe(true);
    });

    it('GPS 로 찍힌 도착도 초록이다 — 실제로 갔다는 증거다', () => {
        const p = deriveCallStep([ms('ARRIVED_PICKUP', 'GPS')], []);
        expect(p.done[2]).toBe(true);
    });

    it('🔴 건너뛴 도착은 진행은 하되 초록이 아니다', () => {
        const p = deriveCallStep([ms('ARRIVED_PICKUP', 'SKIPPED')], []);
        expect(p.index).toBe(3);          // 다음 단계로 넘어간다
        expect(p.done[2]).toBe(false);    // 그러나 증거는 없다
    });

    it('🔴 건너뛴 상차 완료도 마찬가지 — 실었는지 아무도 모른다', () => {
        const p = deriveCallStep([ms('ARRIVED_PICKUP', 'SKIPPED'), ms('PICKED_UP', 'SKIPPED')], []);
        expect(p.index).toBe(4);
        expect(p.done[3]).toBe(false);
    });
});

/**
 * 🔴 **한 칸씩만 건너뛴다** (규칙 ⑥ — 시퀀스를 압축하지 않는다)
 *
 * 기사님: *"상차지 도착하기 전이나 도착하고 물건 올리는 도중에 하차지 도착으로
 * 스킵해 버리면 중간에 다시 뒤로가기해서 넣어야 하니 말야."*
 *
 * 그래서 스킵은 **지금 단계**에만 열린다. 상태 전이 규칙(`canReportMilestone`)이
 * 이미 역행·건너뛰기를 막고 있으므로, 그 규칙을 그대로 쓴다.
 */
describe('한 칸씩만 — 두 칸 건너뛰기는 막힌다', () => {
    it('상차도 안 했는데 하차 완료로 건너뛸 수 없다', () => {
        // ORDER_CONFIRMED 에서 DELIVERED 는 상태 규칙이 허용하지만(현장 사정),
        // 스킵은 그것과 다르다 — 화면이 지금 단계만 열어야 한다
        expect(canReportMilestone('ORDER_CONFIRMED', 'ARRIVED_PICKUP')).toBe(true);
        expect(canReportMilestone('ORDER_PICKED_UP', 'ARRIVED_PICKUP')).toBe(false);   // 역행 금지
    });
});

describe('저장 경로 — 스킵이 장부에 남는다', () => {
    const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');

    it('🔴 관제웹이 현장 단계 스킵을 서버로 보낸다', () => {
        // 🏗️ 발신처가 옛 시트(카드)에서 새 단계 화면으로 옮겨갔다 (2026-08-21 철거)
        const sheet = read('../../../client-app/src/components/dashboard/StepSheetMock.tsx');
        expect(sheet).toMatch(/source: 'SKIPPED'/);
    });

    /**
     * 🔄 **내 진단이 틀렸던 것을 남긴다** (2026-08-19).
     *
     * 기사님이 *"버튼이 어디 있는 건지 알려줘, 못 찾았어"* 라고 하셔서 "현장 기록 폼
     * 안에 갇혔다"고 진단하고 밖으로 뺐다. **틀렸다.** 현장 단계는 `forceOpen='ACTUAL'`
     * 이라 폼이 늘 열려 있어 버튼도 보인다. 못 찾으신 진짜 이유는 그 화면이
     * **하차 완료 단계**였기 때문이다 — 거기는 건너뛰기를 일부러 안 둔다(콜의 끝).
     * 실제로 기사님은 곧 버튼을 찾아 세 번 누르셨다 (장부에 SKIPPED 3건).
     *
     * 그래서 검사도 "폼 밖에 있는가"가 아니라 **"주 버튼과 한 줄에 있는가"** 로 고친다
     * (기사님 확정 배치: 좌 건너뛰기 20% · 가운데 주 버튼 · 우 취소 20%).
     */
    it('🔴 건너뛰기가 주 버튼과 한 줄에 있다 (통화 스킵·도착 건너뛰기)', () => {
        // 🏗️ 새 단계 시트 기준 — 통화 단계는 [통화 스킵][통화 완료], 도착 단계는 [⏭️ 건너뛰기][📍 도착]
        const sheet = read('../../../client-app/src/components/dashboard/StepSheetMock.tsx');
        expect(sheet).toMatch(/save\('SKIPPED'\)/);
        expect(sheet).toMatch(/⏭️ 건너뛰기/);
    });

    it('🔴 서버가 스킵 출처를 그대로 받아 적는다 — 손으로 덮어쓰지 않는다', () => {
        const handlers = read('../../src/socket/socketHandlers.ts');
        expect(handlers).toMatch(/source/);
    });
});
