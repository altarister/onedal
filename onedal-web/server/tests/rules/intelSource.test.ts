import { readFileSync } from 'fs';
import { join } from 'path';
import { reportSourceOf } from '../../src/core/helpers';

/**
 * 🏷️ **목록 원문 줄마다 출처 — 실물 앱인가 시뮬레이터인가** (reviews/23·25 1단계).
 *
 * 앱이 보고 본문에 `source`('real' | 'sim')를 한 칸 싣는다 — 한 보고는 한 화면·한 앱이다.
 * 서버는 그 보고의 intel 줄마다 적는다. 통계·뉴스레터는 real 만 센다(가짜 흐름을 «많다»고 말하지 않게).
 * 🔴 모르는 값·옛 앱(칸 없음)은 NULL — 지어내지 않는다(규칙 ④). 가르는 곳은 `reportSourceOf` 하나 —
 *    목록 보고(scrap)와 픽커 상세 보관(orders)이 같은 규칙을 쓴다.
 */
const SRC = join(__dirname, '../../src');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

describe('🏷️ intel 출처 칸', () => {
    it('intel 에 source 칸이 선다', () => {
        expect(read('db.ts')).toMatch(/ensureColumns\('intel', \{[^}]*source: 'TEXT'/s);
    });

    it('real/sim 만 받는다 — 그 밖은 null', () => {
        expect(reportSourceOf('real')).toBe('real');
        expect(reportSourceOf('sim')).toBe('sim');
        expect(reportSourceOf('REAL')).toBeNull();
        expect(reportSourceOf(undefined)).toBeNull();
        expect(reportSourceOf(1)).toBeNull();
    });

    it('목록 보고가 줄마다 적는다', () => {
        const scrap = read('routes/scrap.ts');
        expect(scrap).toContain('const source = reportSourceOf(body.source);');
        expect(scrap).toMatch(/INSERT INTO intel \([^)]*, source\)/);
    });

    it('🔴 픽커 상세 보관도 출처 · 예약 셋을 적는다 — 같은 콜의 목록 줄과 갈라지지 않게', () => {
        const orders = read('routes/orders.ts');
        const i = orders.indexOf('"PICKER_DETAIL"');
        const block = orders.slice(orders.lastIndexOf('INSERT INTO intel', i), i + 1200);
        expect(block).toMatch(/rawDetailText, reserved, reservedDay, reservedAt, source\)/);
        expect(block).toContain('reportSourceOf((payload as any).source)');
        expect(block).toContain('(payload.order as any).reservedDay ?? null');
    });
});
