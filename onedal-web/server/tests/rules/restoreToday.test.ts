import Database from 'better-sqlite3';
import { restoreWhere, RESTORABLE_STATUSES } from '@onedal/shared';

/**
 * 🗓️ **자정을 넘긴 운행 — 오늘 내린 콜은 오늘 시트에 되살린다** (기사님 확정 · 사이클 = 하루).
 *
 * 재부팅 복구(`restoreAndRecalculateSession`)와 새로고침 이력(`GET /orders`)은 «잡은 시각이 오늘»인 종결 콜만 살렸다.
 * 어제 잡고 오늘 하차한 콜은 재부팅 뒤 시트에서 빠졌다. 기사님: *"오늘 내린 콜만 분리해서 오늘 시트에 올린다."*
 * 🔴 두 곳이 **같은 창**이어야 한다(어긋나면 새로고침마다 깜빡인다) — 조건은 shared `restoreWhere` 한 곳.
 */
describe('🗓️ 복구 창 — 오늘 잡은 콜 · 3일 안 미완료 · 오늘 하차한 콜', () => {
    const NOW = Date.parse('2026-09-15T01:00:00+09:00');
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE orders (id TEXT, userId TEXT, status TEXT, timestamp TEXT, completedAt TEXT)`);
    const put = db.prepare(`INSERT INTO orders VALUES (?, 'u', ?, ?, ?)`);
    put.run('오늘잡음', 'ORDER_DELIVERED', '2026-09-15T00:10:00.000Z', '2026-09-15T00:30:00.000Z');
    put.run('어제잡고오늘내림', 'ORDER_DELIVERED', '2026-09-14T14:00:00.000Z', '2026-09-14T15:30:00.000Z');   // KST 00:30
    put.run('어제잡고어제내림', 'ORDER_DELIVERED', '2026-09-14T10:00:00.000Z', '2026-09-14T11:00:00.000Z');
    put.run('어제잡은미완료', 'ORDER_PICKED_UP', '2026-09-14T13:00:00.000Z', null);
    const ids = () => {
        const w = restoreWhere(NOW);
        const statusIn = RESTORABLE_STATUSES.map(() => '?').join(', ');
        return (db.prepare(`SELECT id FROM orders WHERE userId = 'u' AND status IN (${statusIn}) AND ${w.sql} ORDER BY id`)
            .all(...RESTORABLE_STATUSES, ...w.params) as { id: string }[]).map(r => r.id);
    };

    it('🔴 어제 잡고 오늘 내린 콜을 살린다 · 어제 내린 콜은 안 살린다', () => {
        expect(ids()).toEqual(['어제잡고오늘내림', '어제잡은미완료', '오늘잡음'].sort());
    });
});
