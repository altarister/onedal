import db from '../../src/db';
import { JUDGMENT_COLORS } from '@onedal/shared';

/**
 * 🎨 **판정 색 목록(shared `JUDGMENT_COLORS`)의 색은 모두 장부 표에 들어간다** — `order_judgments.color` 에 CHECK 가 걸려 있어,
 *    색이 늘었는데 표가 그대로면 새 색 판정을 DB 가 거부한다. 글자를 견주지 않고 실제로 넣어 본다(검사 DB 는 db.ts 의 CREATE 그대로).
 *    빨개지면: 표의 CHECK 를 떼는 날이다 — 행을 복사해 표를 다시 만든다(db.ts 머리 «예외»).
 */
describe('판정 색 ↔ 장부 표', () => {
    it('색마다 판정 행이 들어간다', () => {
        for (const c of JUDGMENT_COLORS) {
            const id = `color-fit-${c}`;
            expect(() => db.prepare(`INSERT OR REPLACE INTO order_judgments (orderId, userId, color, score, detail, judgedAt) VALUES (?, 'color-fit', ?, 50, '{}', ?)`)
                .run(id, c, new Date().toISOString())).not.toThrow();
            db.prepare(`DELETE FROM order_judgments WHERE orderId = ?`).run(id);
        }
    });
});
