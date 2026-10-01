import { readFileSync } from 'fs';
import { join } from 'path';
import { allowState } from '../../../ops/src/api/allowance';

/**
 * 🎛️ **운영센터 허락 화면 — «지금 살아 있나»는 shared allowanceLive 하나** (reviews/29 6단계 · onedal-1f «가»).
 *    🔴 허락 시각만 보고 «허락됨»이라 그리면 기한이 지난 회원이 켜진 것처럼 보인다 — 폰은 이미 알람으로 도는데 화면이 거짓말한다.
 *    화면은 날짜를 더하거나 빼지 않는다(달력 칸으로 고른 날을 그대로 서버에 적는다).
 */
const WEB = join(__dirname, '../../..');
const read = (f: string) => readFileSync(join(WEB, f), 'utf8');
const TODAY = '2026-10-01';

describe('🎛️ 운영센터 허락 화면', () => {
    it('허락 시각이 없으면 꺼짐 · 기한이 비면 켜짐(기한 없음)', () => {
        expect(allowState(null, null, TODAY)).toEqual({ live: false, on: false, text: '꺼짐' });
        expect(allowState('2026-09-01T00:00:00+09:00', null, TODAY)).toEqual({ live: true, on: true, text: '켜짐 · 기한 없음' });
    });
    it('🔴 기한 날이 오늘이면 아직 산다 · 어제면 «기한 지남»(허락 시각은 남아 있다)', () => {
        expect(allowState('2026-09-01T00:00:00+09:00', '2026-10-01', TODAY)).toEqual({ live: true, on: true, text: '켜짐 · 2026-10-01 까지' });
        expect(allowState('2026-09-01T00:00:00+09:00', '2026-09-30', TODAY)).toEqual({ live: false, on: true, text: '기한 지남 (2026-09-30)' });
    });
    it('🔴 상세는 서버 문(setAllow · setPaidUntil)에 적는다 — 자리만이던 «6단계에서 켜집니다»는 없다 · 승인 버튼 옆에 결과 한 줄', () => {
        const d = read('ops/src/pages/MemberDetail.tsx');
        expect(d).toContain("api.setAllow(m.id, 'auto', on, until)");
        expect(d).toContain("api.setAllow(m.id, 'stats', on, until)");
        expect(d).toContain('api.setPaidUntil(m.id, until)');
        expect(d).not.toContain('6단계에서 켜집니다');
        expect(d).toContain('승인하면 자동 잡기 · 통계 허락이 함께 켜집니다');
        const ops = read('ops/src/api/ops.ts');
        expect(ops).toContain('`/members/${id}/allow`');
        expect(ops).toContain('`/members/${id}/paid-until`');
    });
    it('🔴 목록 · 상세가 allowState 한 벌로 그린다 — 화면에 날짜 덧셈이 없다', () => {
        expect(read('ops/src/pages/Members.tsx')).toContain('allowState(allowedAt, until, today)');
        expect(read('ops/src/pages/MemberDetail.tsx')).toContain('allowState(m.autoAllowedAt, m.autoUntil, today)');
        expect(read('ops/src/ui.tsx')).not.toContain('allowText');
        const a = read('ops/src/api/allowance.ts');
        expect(a).toContain('allowanceLive(allowedAt, until, today)');
        expect(a).not.toMatch(/new Date|setDate|setMonth|Date\.now/);
        expect(read('ops/src/pages/MemberDetail.tsx')).not.toMatch(/plusDaysKey|setDate|setMonth/);
    });
});
