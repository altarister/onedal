import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 📅 **예약 셋 — 받아 적기만** (reviews/23 1단계).
 *
 * 원달앱이 콜 줄마다 `reserved`(예약 표시가 있나 · true/false/null) · `reservedDay`(0 오늘 · 1 내일 · N 그 뒤 · null 모름) · `reservedAt`(«HH:MM» · null)을 싣는다.
 * 서버는 목록 원문(`intel`)과 장부(`orders`)에 그대로 적는다 — 1단계에서는 판정·경로·약속에 쓰지 않는다.
 * 🔴 서버 칸이 앱보다 먼저 선다 — 앱이 칸을 더했는데 서버에 없으면 `intelColumns` 짝이 빨간불이다.
 *    shared 콜 양식(`SimplifiedOfficeOrder`)의 세 칸은 원달앱 칸과 같은 때 든다 — `appOrderShape` 짝이 한쪽만 있으면 빨간불이다.
 */
const SRC = join(__dirname, '../../src');
const read = (p: string) => readFileSync(p, 'utf8');

describe('📅 예약 셋', () => {
    it('intel · orders 에 칸이 선다', () => {
        const db = read(join(SRC, 'db.ts'));
        expect(db).toMatch(/ensureColumns\('intel', \{[^}]*reserved: 'INTEGER', reservedDay: 'INTEGER'/s);
        expect(db).toMatch(/ensureColumns\('orders', \{ reserved: 'INTEGER', reservedDay: 'INTEGER', reservedAt: 'TEXT' \}\)/);
    });

    it('목록 보고가 intel 에 적는다', () => {
        const scrap = read(join(SRC, 'routes/scrap.ts'));
        expect(scrap).toMatch(/INSERT INTO intel \([^)]*reserved, reservedDay, reservedAt[,)]/);
        expect(scrap).toContain('(item as any).reservedDay ?? null');
    });

    it('장부가 적고, 재확정 때 빈 값이 기존 값을 안 지운다', () => {
        const repo = read(join(SRC, 'repositories/OrderRepository.ts'));
        expect(repo).toMatch(/goalCity, reserved, reservedDay, reservedAt[,\s)]/);
        expect(repo).toContain('reserved = COALESCE(excluded.reserved, reserved)');
        expect(repo).toContain('reservedDay = COALESCE(excluded.reservedDay, reservedDay)');
        expect(repo).toContain('(cachedOrder as any).reservedDay ?? null');
    });
});
