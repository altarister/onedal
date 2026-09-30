// @ts-nocheck
import db from '../../src/db';
import { getSummaryMetrics } from '../../src/services/statService';
import { businessDayKey, businessDayRange } from '@onedal/shared';

/**
 * 📅 **운행일지 «오늘·이번 달 매출»은 한국 영업일로 센다** (04 교차 리뷰 ① · onedal-1f «가»).
 * 완료 시각은 UTC 글자(toISOString)로 저장된다 — 날 글자 앞부분(LIKE 'YYYY-MM-DD%')으로 거르면 한국 새벽 0~9시 콜이 어제로 간다.
 * 영업일 [시작, 끝)은 businessDayKey 와 같은 규칙(로컬 자정 · 서버 TZ Asia/Seoul) 한 벌에서.
 */
const U = 'test-summary-day';
const at = (dayOffset: number, h: number) => { const d = new Date(); d.setDate(d.getDate() + dayOffset); d.setHours(h, 0, 0, 0); return d.toISOString(); };

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, 'summary@test', '매출날검사');
    const ins = db.prepare(`INSERT OR REPLACE INTO orders (id, type, status, userId, timestamp, capturedAt, pickup, dropoff, fare, targetApp, completedAt)
        VALUES (?, 'NEW_ORDER', 'ORDER_DELIVERED', ?, ?, ?, '상', '하', ?, 'insung', ?)`);
    ins.run(`${U}-dawn`, U, at(0, 2), at(0, 2), 30000, at(0, 3));      // 오늘 새벽 3시(한국) — UTC 로는 어제
    ins.run(`${U}-yday`, U, at(-1, 22), at(-1, 22), 50000, at(-1, 23)); // 어제 23시(한국)
});
afterAll(() => {
    db.prepare(`DELETE FROM orders WHERE userId = ?`).run(U);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(U);
});

describe('📅 오늘 매출은 한국 영업일', () => {
    it('🔴 한국 새벽 3시 완료 콜은 오늘 · 어제 23시 완료 콜은 오늘이 아니다', () => {
        const m = getSummaryMetrics(U);
        expect(m.todayRevenue).toBe(30000);
        expect(m.todayOrderCount).toBe(1);
    });

    it('영업일 [시작, 끝)은 businessDayKey 와 같은 날 경계', () => {
        const now = Date.now();
        const { startMs, endMs } = businessDayRange(now);
        expect(businessDayKey(startMs)).toBe(businessDayKey(now));
        expect(businessDayKey(endMs - 1)).toBe(businessDayKey(now));
        expect(businessDayKey(endMs)).not.toBe(businessDayKey(now));
    });
});
