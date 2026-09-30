import { describe, expect, it } from 'vitest';
import { isRoadmapEcho } from './roadmapLogger';

/**
 * 🔁 **logRoadmapEvent 의 콘솔 사본은 콘솔 가로채기가 다시 올리지 않는다** (onedal-1f «가»).
 * 개발 모드 StrictMode 가 두 번째 줄을 서식 지시자·스타일과 함께 다시 찍어, 접두사만 떼는 검사로는 모양에 따라 새어
 * 같은 줄이 «#없음 [🖥️콘솔] %s [ROADMAP …]» 으로 한 번 더 서버 파일에 왔다. 앞머리 어디든 «[ROADMAP 시:분»이 있으면 사본이다.
 */
describe('🔁 ROADMAP 사본', () => {
    it('🔴 맨 앞 · %s · %c%s 와 스타일 뒤 — 모두 사본', () => {
        expect(isRoadmapEcho('[ROADMAP 20:47:54.499] [🖥️관제웹] ⚪ [지움]')).toBe(true);
        expect(isRoadmapEcho('%s [ROADMAP 20:47:54.499] [🖥️관제웹] ⚪ [지움]')).toBe(true);
        expect(isRoadmapEcho('%c%s color: rgba(0, 0, 0, 0.5) [ROADMAP 20:47:54.499] [🖥️관제웹] ⚪ [지움]')).toBe(true);
    });
    it('보통 콘솔 줄은 사본이 아니다', () => {
        expect(isRoadmapEcho('🔵 [하차 목록] 3곳')).toBe(false);
        expect(isRoadmapEcho('ROADMAP 이라는 낱말만 있는 줄')).toBe(false);
    });
});
