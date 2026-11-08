import { readFileSync } from 'fs';
import { join } from 'path';
import db from '../../src/db';
import scrapRouter from '../../src/routes/scrap';
import { clearUserSession } from '../../src/state/userSessionStore';
import { approvedUser } from '../fixtures/approvedUser';

/**
 * 📅 **예약 셋 — 받아 적기만**.
 *
 * 원달앱이 콜 줄마다 `reserved`(예약 표시가 있나 · true/false/null)와 첫 상차 정거장 `requestedDay`(0 오늘 · 1 내일 · N 그 뒤 · null 모름) · `requestedTime`(«HH:MM» · null)을 싣는다.
 * 서버는 목록 원문(`intel`)과 장부(`orders`)의 `reserved` · `reservedDay` · `reservedAt` 칸에 그 값을 적는다 — 값은 보고 그대로다.
 * 🔴 서버 칸이 앱보다 먼저 선다 — 앱이 칸을 더했는데 서버에 없으면 `intelColumns` 짝이 빨간불이다.
 *    shared 콜 양식(`SimplifiedOfficeOrder`)의 칸은 원달앱 칸과 같은 때 든다 — `appOrderShape` 짝이 한쪽만 있으면 빨간불이다.
 */
const SRC = join(__dirname, '../../src');
const read = (p: string) => readFileSync(p, 'utf8');

const U = 'test-reservation-intel';
const DEV = 'dev-reservation-intel-1';
const scrapHandler = (() => {
    const layer = (scrapRouter as any).stack.find((l: any) => l.route?.path === '/' && l.route.methods.post);
    return layer.route.stack[layer.route.stack.length - 1].handle;
})();
beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, 'reserve@test', '예약칸검사');
    approvedUser(U);
    db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id) VALUES (?, ?)`).run(U, DEV);
});
afterAll(async () => {
    await new Promise(r => setTimeout(r, 200));
    db.prepare(`DELETE FROM intel WHERE device_id = ?`).run(DEV);
    db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(U);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(U);
    clearUserSession(U);
});

describe('📅 예약 셋', () => {
    it('intel · orders 에 칸이 선다', () => {
        const db = read(join(SRC, 'db.ts'));
        expect(db).toMatch(/ensureColumns\('intel', \{[^}]*reserved: 'INTEGER', reservedDay: 'INTEGER'/s);
        expect(db).toMatch(/ensureColumns\('orders', \{ reserved: 'INTEGER', reservedDay: 'INTEGER', reservedAt: 'TEXT' \}\)/);
    });

    it('목록 보고가 intel 에 적는다 — 첫 상차 · 마지막 하차 정거장 값이 보고 그대로', async () => {
        const scrap = read(join(SRC, 'routes/scrap.ts'));
        expect(scrap).toMatch(/INSERT INTO intel \([^)]*reserved, reservedDay, reservedAt[,)]/);
        const item = {
            fare: 12000, reserved: true,
            pickupDetails: [{ listText: '강남 대치2', distanceKm: 3.2, promiseText: '예약', requestedDay: 1, requestedTime: '14:00', geo: { x: 127.06, y: 37.5 } }],
            dropoffDetails: [{ listText: '분당 이매2', distanceKm: 17.5, geo: { x: 127.13, y: 37.39 } }],
        };
        const res: any = { status: () => res, json: () => res };
        await scrapHandler({ body: { data: [item], deviceId: DEV, supplyLinked: true }, app: { get: () => ({ to: () => ({ emit: () => {} }) }) } }, res);
        let row: any;
        for (let i = 0; i < 50 && !row; i++) {
            await new Promise(r => setTimeout(r, 20));
            row = db.prepare(`SELECT * FROM intel WHERE device_id = ?`).get(DEV);
        }
        expect(row).toMatchObject({
            pickup: '강남 대치2', dropoff: '분당 이매2', pickupDistanceKm: 3.2, deliveryDistanceKm: 17.5,
            scheduleText: '예약', reserved: 1, reservedDay: 1, reservedAt: '14:00',
            pickupX: 127.06, pickupY: 37.5, dropoffX: 127.13, dropoffY: 37.39,
        });
    });

    it('장부가 적고, 재확정 때 빈 값이 기존 값을 안 지운다', () => {
        const repo = read(join(SRC, 'repositories/OrderRepository.ts'));
        expect(repo).toMatch(/goalCity, reserved, reservedDay, reservedAt[,\s)]/);
        expect(repo).toContain('reserved = COALESCE(excluded.reserved, reserved)');
        expect(repo).toContain('reservedDay = COALESCE(excluded.reservedDay, reservedDay)');
        // 장부 예약 날 칸 ← 첫 상차 정거장 날 — 저장 → 되살리기 왕복 검사(callShapeLedger)가 동작으로 문다
    });
});
