import { readFileSync } from 'fs';
import { join } from 'path';
import { LOG_TAGS, NO_TAG } from '@onedal/shared';

/**
 * 🏷️ **로그 태그 열 낱말 — 한 곳(shared)에서만 산다** (reviews/22 2단계).
 *
 * 태그는 셋(서버·관제웹·원달앱)이 같은 낱말이어야 `pnpm log --tag` 하나로 찾힌다.
 * 원달앱 짝(`LogTag.kt`)이 생기면 «같다» 검사를 여기에 잇는다 — README 「짝이 있는 것」.
 */

describe('🏷️ 로그 태그 목록', () => {
    it('열 개이고 겹치지 않는다', () => {
        expect(LOG_TAGS.length).toBe(10);
        expect(new Set(LOG_TAGS).size).toBe(LOG_TAGS.length);
    });

    it('계획서의 열 낱말 그대로다 — 셋이 같은 낱말을 쓰는 전제', () => {
        expect([...LOG_TAGS]).toEqual(['콜단계', '판정', '결재', '필터', '누름', '화면', '위치', '통신', '경고', '부팅']);
    });

    it('태그 없이 찍힌 줄은 파일에서 #없음 이 붙는다', () => {
        const logger = readFileSync(join(__dirname, '../../src/utils/fileLogger.ts'), 'utf8');
        expect(logger).toContain('NO_TAG');
        expect(NO_TAG).toBe('없음');
    });
});
