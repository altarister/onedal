import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 💰 **판정석은 쌍둥이 콜의 추정 요금을 요금 옆에 알린다** (기사님 «가» · 09-30 저녁 · onedal-1f).
 * 원달앱이 tagsText 끝에 «요금 둘 중 낮은 값 · …»을 싣고 서버는 콜을 통째로 관제웹에 보낸다 — 판정석이 안 읽으면
 * 추정 요금이 확정 요금처럼 보인다.
 */
const seat = readFileSync(join(__dirname, '../../../client-app/src/components/dashboard/JudgmentSeat.tsx'), 'utf8');

describe('💰 판정석 추정 요금', () => {
    it('🔴 판정석이 콜의 tagsText 에서 쌍둥이 꼬리를 읽는다', () => {
        expect(seat).toMatch(/twinFareNoteOf\(route\.tagsText\)/);
    });
    it('🔴 요금 옆 글은 «추정 · 둘 중 낮은 값» — 먼발치에서 확정 요금이 아님을 알아보게', () => {
        expect(seat).toContain('추정 · 둘 중 낮은 값');
    });
});
