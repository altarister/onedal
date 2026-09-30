// @ts-nocheck
import { readFileSync } from 'fs';
import { join } from 'path';
import Database from 'better-sqlite3';
import db from '../../src/db';
import { groupSameCalls, rollupDay, flowsForViewer, statsTableCurrent } from '../../src/services/callFlowStats';

/**
 * 📊 **모르는 요금·km 는 합과 평균에서 뺀다 · 예약은 날 1 이상만** (04 교차 리뷰 ② · 기사님 «옛 데이터는 지워도 된다 — 최선의 코드» · onedal-1f «가»).
 * 앱 보고 문은 모르는 요금을 0 으로 적는다 — 그대로 더하면 아침 카드 평균 요금이 낮아진다. 평균의 나눗수는 «아는 콜 수»(fare_calls · km_calls) 하나.
 * 옛 모양 표(fare_calls 없음)면 서버는 멀쩡히 두고 통계 묶기·읽기만 멈춘다 — 표를 지우고 다시 띄우면 원문에서 다시 묶는다.
 */
const U = 'test-stats-unknown';
const DAY = '2020-02-03';
const iso = (h: number, m = 0) => new Date(Date.parse(`${DAY}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+09:00`)).toISOString();
const ins = db.prepare(`INSERT INTO intel (user_id, device_id, type, pickup, dropoff, fare, timestamp, targetApp, vehicleType, deliveryDistanceKm, verdict, reserved, reservedDay, source)
    VALUES (?, 'd', 'INTEL_BULK', ?, ?, ?, ?, 'kakaopicker', '다마스', ?, NULL, ?, ?, 'real')`);

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, 'unknown@test', '모름검사');
    ins.run(U, '광주 경안', '용산 한남', 30000, iso(9, 0), 20, 1, 1);     // 요금·km 앎 · 내일 예약
    ins.run(U, '광주 경안', '용산 한남2', 0, iso(9, 5), null, 1, 0);      // 요금 모름(0) · km 모름 · «당상»(오늘)
});
afterAll(() => {
    db.prepare(`DELETE FROM intel WHERE user_id = ?`).run(U);
    db.prepare(`DELETE FROM stats_flows WHERE day = ?`).run(DAY);
    db.prepare(`DELETE FROM stats_rollup_days WHERE day = ?`).run(DAY);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(U);
});

describe('📊 모름은 빼고 센다', () => {
    it('🔴 요금 0(모름)은 요금이 없는 콜 — 첫·끝 요금 null', () => {
        const [c] = groupSameCalls([{ user_id: U, targetApp: 'kakaopicker', pickup: 'a', dropoff: 'b', fare: 0, timestamp: iso(8) }]);
        expect(c.fareFirst).toBeNull();
        expect(c.fareLast).toBeNull();
    });

    it('🔴 하루 묶기 — 요금·km 합은 아는 값만 · 아는 콜 수 따로 · 예약은 날 1 이상만', () => {
        rollupDay(DAY);
        const rows = db.prepare(`SELECT * FROM stats_flows WHERE day = ? AND user_id = ?`).all(DAY, U);
        const sum = (k: string) => rows.reduce((s, r) => s + (r[k] ?? 0), 0);
        expect(sum('calls')).toBe(2);
        expect(sum('fare_calls')).toBe(1);
        expect(sum('fare_first_sum')).toBe(30000);
        expect(sum('km_calls')).toBe(1);
        expect(sum('km_sum')).toBe(20);
        expect(sum('reserved_calls')).toBe(1);
    });

    it('🔴 평균은 아는 콜 수로 나눈다 — 요금 3만·모름 두 콜이면 3만', () => {
        const row = { day: DAY, hour: 9, target_app: 'kakaopicker', from_sigungu: '광주시', to_sigungu: '서울 용산구', user_id: U, drivers: 1,
            calls: 2, fare_calls: 1, fare_first_sum: 30000, fare_last_sum: 30000 };
        const [cell] = flowsForViewer([row], U, 'weekday');
        expect(cell.mine).toMatchObject({ calls: 2, fareCalls: 1, fareFirstAvg: 30000 });
        const [none] = flowsForViewer([{ ...row, fare_calls: 0, fare_first_sum: 0, fare_last_sum: 0 }], U, 'weekday');
        expect(none.mine.fareFirstAvg).toBeNull();
    });
});

describe('📊 옛 모양 표', () => {
    it('🔴 fare_calls 가 없는 옛 표면 «옛 모양» — 묶기·읽기를 멈출 신호', () => {
        const old = new Database(':memory:');
        old.exec(`CREATE TABLE stats_flows (day TEXT, hour INTEGER, calls INTEGER, fare_first_sum INTEGER)`);
        expect(statsTableCurrent(old)).toBe(false);
        expect(statsTableCurrent(db)).toBe(true);
    });

    it('🔴 새 칸을 쓰는 문장은 모듈을 불러올 때 준비하지 않는다 — 옛 표에서 서버가 넘어지지 않게', () => {
        const src = readFileSync(join(__dirname, '../../src/services/callFlowStats.ts'), 'utf8');
        expect(src).not.toMatch(/^const stmtInsertFlow = db\.prepare\(/m);
    });
});
