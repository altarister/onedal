import db from '../../src/db';
import { recordDayResult } from '../../src/state/filterManager';

/**
 * 📊 **하루 성과 기록** (필터 정의 4장 · 확정안 구현 6)
 *
 * "이 설정이 얼마를 벌었나" — 자정 전환이 리셋 **전에** 어제 설정 스냅샷과 결과
 * (매출·완료 콜·취소 소진·색 분포)를 filter_day_results 에 1회 남긴다.
 * 콜할인율을 감이 아니라 성과로 정하게 하는 기반이다.
 */

const U = 'day-result-test-user';
const DAY = '2026-08-20';
const at = (h: number) => new Date(`${DAY}T${String(h).padStart(2, '0')}:00:00+09:00`).toISOString();

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`)
      .run(U, `g-${U}`, 'day@test', '성과검사');
    const ins = db.prepare(`INSERT OR REPLACE INTO orders
        (id, type, status, userId, timestamp, capturedAt, pickup, dropoff, fare, targetApp)
        VALUES (?, 'NEW_ORDER', ?, ?, ?, ?, '상', '하', ?, ?)`);
    ins.run(`${U}-1`, 'ORDER_DELIVERED', U, at(9), at(9), 30000, 'insung');
    ins.run(`${U}-2`, 'ORDER_COMPLETED', U, at(10), at(10), 35000, 'insung');
    ins.run(`${U}-3`, 'SAFE_CANCEL', U, at(11), at(11), 40000, 'insung');       // 취소 — 매출 아님
    ins.run(`${U}-4`, 'SAFE_CANCEL', U, at(12), at(12), 20000, 'hwamul24');
    ins.run(`${U}-5`, 'ORDER_DELIVERED', U, at(23), at(23), 50000, 'insung');   // 밤 11시 — 그날이다
    // 다른 날 — 안 들어가야 한다
    ins.run(`${U}-6`, 'ORDER_DELIVERED', U,
        new Date('2026-08-19T10:00:00+09:00').toISOString(),
        new Date('2026-08-19T10:00:00+09:00').toISOString(), 99000, 'insung');
    db.prepare(`INSERT OR REPLACE INTO order_judgments (orderId, userId, color, score, detail, judgedAt)
                VALUES (?, ?, ?, ?, '{}', ?)`).run(`${U}-1`, U, '꿀', 80, at(9));
    db.prepare(`INSERT OR REPLACE INTO order_judgments (orderId, userId, color, score, detail, judgedAt)
                VALUES (?, ?, ?, ?, '{}', ?)`).run(`${U}-2`, U, '보통', 55, at(10));
});

afterAll(() => {
    db.prepare(`DELETE FROM filter_day_results WHERE user_id = ?`).run(U);
    db.prepare(`DELETE FROM order_judgments WHERE userId = ?`).run(U);
    db.prepare(`DELETE FROM orders WHERE userId = ?`).run(U);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(U);
});

describe('recordDayResult — 하루를 설정 스냅샷과 함께 남긴다', () => {
    it('🔴 매출·콜수·취소(망별)·색 분포가 그날 것만 집계된다', () => {
        recordDayResult(U, DAY, { first: { discountPct: 0 } });
        const r = db.prepare(`SELECT * FROM filter_day_results WHERE user_id = ? AND day = ?`)
                    .get(U, DAY) as any;
        expect(r.revenue).toBe(115000);                       // 3+3.5+5만 — 취소·다른 날 제외
        expect(r.calls).toBe(3);
        expect(JSON.parse(r.cancels)).toEqual({ insung: 1, hwamul24: 1 });
        expect(JSON.parse(r.colors)).toEqual({ '꿀': 1, '보통': 1 });
        expect(JSON.parse(r.settings).first.discountPct).toBe(0);   // 리셋 전 스냅샷
    });

    it('같은 날을 두 번 쓰지 않는다 (INSERT OR IGNORE)', () => {
        recordDayResult(U, DAY, { overwritten: true });
        const r = db.prepare(`SELECT settings FROM filter_day_results WHERE user_id = ? AND day = ?`)
                    .get(U, DAY) as any;
        expect(JSON.parse(r.settings).overwritten).toBeUndefined();   // 첫 기록이 남는다
    });

    it('날짜 모양이 아니면 아무것도 안 쓴다 (지어내지 않는다)', () => {
        recordDayResult(U, '', {});
        recordDayResult(U, 'not-a-day', {});
        const n = db.prepare(`SELECT COUNT(*) AS n FROM filter_day_results WHERE user_id = ?`)
                    .get(U) as any;
        expect(n.n).toBe(1);
    });
});
