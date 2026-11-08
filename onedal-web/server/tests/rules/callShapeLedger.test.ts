// @ts-nocheck
import db from '../../src/db';

/**
 * 🧾 **콜 한 칸 · 판 번호 · 기사님 몫 사본** — 장부(orders)에 콜 모양 전체를 담는 칸 셋.
 *    callShape(콜 모양 JSON) · callShapeVersion(그 모양의 판 번호) · incomeWon(기사님 몫 원 — 모르면 NULL).
 *    셋 다 기본값 없음 · NULL 허용 — 칸 셋이 비어 있는 옛 줄은 지금 몸통(옛 칸)으로 되살린다.
 */
const ID = 'test-call-shape-ledger-1';

afterAll(() => { db.prepare(`DELETE FROM orders WHERE id = ?`).run(ID); });

describe('🧾 장부의 콜 한 칸 칸 셋', () => {
    it('orders 에 callShape TEXT · callShapeVersion INTEGER · incomeWon INTEGER — 셋 다 NULL 허용 · 기본값 없음', () => {
        const cols = new Map((db.prepare(`PRAGMA table_info(orders)`).all() as any[]).map(c => [c.name, c]));
        const shapeOf = (name: string) => {
            const c = cols.get(name);
            return c && { type: c.type, notnull: c.notnull, dflt_value: c.dflt_value };
        };
        expect(shapeOf('callShape')).toEqual({ type: 'TEXT', notnull: 0, dflt_value: null });
        expect(shapeOf('callShapeVersion')).toEqual({ type: 'INTEGER', notnull: 0, dflt_value: null });
        expect(shapeOf('incomeWon')).toEqual({ type: 'INTEGER', notnull: 0, dflt_value: null });
    });

    it('칸 셋을 안 적고 넣은 줄은 셋이 NULL — 0원 · 빈 글로 채우지 않는다', () => {
        db.prepare(`INSERT INTO orders (id, timestamp, pickup, dropoff) VALUES (?, ?, ?, ?)`)
            .run(ID, new Date().toISOString(), '경기 이천시 부발읍', '경기 여주시 가남읍');
        const row = db.prepare(`SELECT callShape, callShapeVersion, incomeWon FROM orders WHERE id = ?`).get(ID);
        expect(row).toEqual({ callShape: null, callShapeVersion: null, incomeWon: null });
    });
});
