import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 📵 **«상대가 취소했다고 함» — 관제웹 그 콜의 단계 시트 맨 위 경고 한 줄(단계 칸들 위 · 콜마다 한 번)** (기사님 «가» · 46 서버 7029e696 · onedal-69 «가»).
 *    🔴 글만이다 — 버튼이 아니고, 결재(CANCEL)를 대신 누르거나 자동으로 바꾸지 않는다. 기사님이 보고 누르신다.
 *    🔴 통화 행 안에 두지 않는다 — 운영센터가 적으면 그 통화 단계가 끝나 시트가 다음 칸으로 넘어가고, 지나간 칸의 줄은 안 보인다.
 *    사실 칸(counterpart_cancelled_at)이 비어 있으면 줄 자체가 없다. 시각은 HH:MM(상대시각 없음).
 */
const DASH = join(__dirname, '../../../client-app/src/components/dashboard');
const sheet = readFileSync(join(DASH, 'StepSheetMock.tsx'), 'utf8');
const card = readFileSync(join(DASH, 'PinnedRouteCard.tsx'), 'utf8');
const at = card.indexOf('{seededSteps.filter(x => x.row?.counterpart_cancelled_at).map(x => (');
const block = card.slice(at, card.indexOf('))}', at) + 3);

describe('📵 상대 취소 — 관제웹 경고 줄', () => {
    it('🔴 사실 칸이 있는 통화 행마다 한 줄 — 글자 그대로 · 단계 칸들(가로 트랙) 위 한 곳 · 통화 행 안에는 없다', () => {
        expect(at).toBeGreaterThan(0);
        expect(block).toContain('⚠️ 상대가 취소했다고 함 — 확인하고 CANCEL');
        expect(block).toContain('role="alert"');
        expect(at).toBeLessThan(card.indexOf('<StepSwipeTrack'));
        expect(card.slice(card.indexOf('<StepSwipeTrack'))).not.toContain('상대가 취소했다고 함');
        expect(sheet).not.toContain('counterpart_cancelled_at');
    });
    it('🔴 글만 — 버튼 · 누르기 · 소켓 보내기가 없다(결재를 대신하지 않는다)', () => {
        expect(block).not.toMatch(/<button|onClick|emit\(|decide|save\(/);
    });
    it('🔴 누가 · 언제 — 이름은 서버가 준 것만 · 시각은 HH:MM · 상대시각 없음', () => {
        expect(block).toContain('x.counterpartCancelledByName');
        expect(block).toContain('hhmmText(x.row.counterpart_cancelled_at)');
        expect(block).toContain("x.step === 'CALL_PICKUP' ? '상차지' : '하차지'");
        expect(block).not.toMatch(/분 전|방금|Date\.now\(\)/);
    });
    it('🔴 관제웹 통화 저장은 이 칸을 싣지 않는다 — 기사가 «다시 저장»해도 서버가 그대로 둔다', () => {
        expect(sheet).not.toMatch(/counterpartCancelled\s*:/);
    });
});
