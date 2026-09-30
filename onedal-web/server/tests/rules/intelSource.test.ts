import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🏷️ **목록 원문 줄마다 출처 — 실물 앱인가 시뮬레이터인가** (reviews/23·25 1단계).
 *
 * 앱이 보고 본문에 `source`('real' | 'sim')를 한 칸 싣는다 — 한 보고는 한 화면·한 앱이다.
 * 서버는 그 보고의 intel 줄마다 적는다. 통계·뉴스레터는 real 만 센다(가짜 흐름을 «많다»고 말하지 않게).
 * 🔴 모르는 값·옛 앱(칸 없음)은 NULL — 지어내지 않는다(규칙 ④).
 */
const SRC = join(__dirname, '../../src');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

describe('🏷️ intel 출처 칸', () => {
    it('intel 에 source 칸이 선다', () => {
        expect(read('db.ts')).toMatch(/ensureColumns\('intel', \{[^}]*source: 'TEXT'/s);
    });

    it('보고 본문의 source 를 real/sim 만 받아 줄마다 적는다', () => {
        const scrap = read('routes/scrap.ts');
        expect(scrap).toContain("const source = body.source === 'real' || body.source === 'sim' ? body.source : null;");
        expect(scrap).toMatch(/INSERT INTO intel \([^)]*, source\)/);
    });
});
