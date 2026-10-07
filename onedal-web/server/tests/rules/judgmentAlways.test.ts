import { judge, CRITERIA, toSnapshot, DEFAULT_JUDGMENT } from '@onedal/shared';
import { firstLoadFacts } from '../../src/core/engine/judgeFacts';

/**
 * 🎨 **판정 없이 끝나는 심사는 없다** (폰 시험)
 *
 * 기사님: *"판정색은 서버로그에 있어야해. 없으면 문제야."*
 *
 * 좌표를 못 찾은 콜(예: 픽커 «광주 초월읍» 상차)에서 판정기가 **판정 함수를 부르지 않고**
 * «상차지 주소를 찾지 못했습니다» 이유만 남기고 끝나면, 서버 로그에 `🎨 [판정]` 줄이 없고
 * 장부(`order_judgments`)에도 없고, 관제웹은 «카카오 연산 실패»뿐이다.
 *
 * `onedal-web/shared/src/criteria.ts` 머리 표가 정한 대로
 * «주소 못 찾음 · 카카오 실패 · API 키 없음 → **잴 수 없음** (🔴)» 판정을 남긴다.
 *
 * 판정을 **성공 갈래 안에서만** 만들면 실패 갈래에서 빠진다.
 * → 구조: 관제웹에 보내기 직전 **한 곳**에서 «판정이 없으면 잴 수 없음 판정»을 남긴다. 실패 갈래가 늘어도 빠지지 않는다.
 */

/* 실패 갈래(좌표 못 찾음 · 카카오 키 없음)가 관제웹에 보내기 전에 판정을 남기는지는 judgmentBranches 가 끝까지 돌려 문다 */
describe('판정 없이 끝나지 않는다 (#123)', () => {

    it('좌표가 없어 걸린 시간을 모르면 — 🔴 · 점수 없음 · «잴 수 없음» 딱지 (관제웹이 «판단 불가»로 읽는 모양)', () => {
        const v = toSnapshot(judge(CRITERIA, firstLoadFacts({
            fare: 10_000, totalMinutes: null, excludedHits: [], pickupBackward: null, trapped: null, tags: ['판정 불가 — 후보콜의 상차지 주소를 찾지 못했습니다'],
        }), DEFAULT_JUDGMENT));
        expect(v.color).toBe('사고');
        expect(v.score).toBeNull();
        expect(v.tags.some(t => t.startsWith('잴 수 없음'))).toBe(true);
        expect(v.tags.some(t => t.includes('상차지 주소를 찾지 못했습니다'))).toBe(true);
    });
});
