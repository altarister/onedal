import { basename } from 'path';
import db from '../../src/db';

/**
 * 🧪 **서버 검사는 기사님 로컬 DB(local.db)를 열지 않는다** (jest 흔들림 · onedal-1f «가»).
 *
 * 검사가 기사님이 폰을 붙여 시험 중인 로컬 서버(4000)와 같은 local.db 에 쓰고 지웠다 — 병렬 일꾼끼리, 그리고 떠 있는 서버의
 * 부팅·매시간 통계 묶기·타이머와 경주했다. 이제 jest 설정이 일꾼마다 빈 DB(jest-w<번호>.db)를 준다(tests/jestWorkerDb.js).
 */
describe('🧪 검사 DB', () => {
    it('🔴 열린 DB 는 일꾼 전용 jest-w<번호>.db — local.db · data.db 가 아니다', () => {
        const file = basename(db.name);
        expect(file).toMatch(/^jest-w\d+\.db$/);
        expect(['local.db', 'data.db']).not.toContain(file);
    });
});
