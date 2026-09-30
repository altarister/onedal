// @ts-nocheck
import Database from 'better-sqlite3';
import db from '../../src/db';
import { STEP_TABLES } from '@onedal/shared';
import { planMergedStops } from '../../src/services/routeComposer';
import { firmPromiseMsOf, bornRowsIn } from '../../src/services/stepSeeder';

/**
 * ⚙️ **약속 순서 계산은 약속을 정거장마다 한 번만 읽는다 · 단계 표 문장은 DB 마다 한 번만 준비한다** (서버 병목 묶음 2 · onedal-1f «가»).
 *
 * 통화로 굳힌 약속이 있으면 순서를 전부 펴는데, 마디마다 약속을 다시 읽어 단계 표 6개를 매번 새로 준비했다
 * (활성 3 + 후보 1 = 약속 읽기 3,946회 · 준비 24,113회 · 판정 CPU 0.3~0.4초). 순서는 그대로다.
 */
const KM = 0.01;
const here = { x: 127.00, y: 37.00 };
const call = (id: string, p: number, d: number) => ({ id, status: 'ORDER_CONFIRMED',
    pickupX: 127 + p * KM, pickupY: 37 + (p % 3) * KM, dropoffX: 127 + d * KM, dropoffY: 37 - (d % 4) * KM }) as any;

describe('⚙️ 약속은 정거장마다 한 번', () => {
    it('🔴 콜 넷(정거장 8) · 약속 하나 — 약속 읽기가 정거장 수를 넘지 않는다', () => {
        let reads = 0;
        const now = Date.parse('2026-09-23T00:00:00Z');
        const promiseAt = (orderId: string, stopType: string) => { reads++; return orderId === 'C' && stopType === 'pickup' ? now + 90 * 60_000 : null; };
        const plan = planMergedStops([call('A', 5, 20), call('B', 8, 25), call('C', 12, 30), call('D', 3, 18)], null, here, { nowMs: now, promiseAt });
        expect(plan?.orderedStops.length).toBe(8);
        expect(reads).toBeLessThanOrEqual(8);
    });
});

describe('⚙️ 단계 표 문장은 DB 마다 한 번', () => {
    it('🔴 같은 콜의 약속을 두 번 읽으면 두 번째는 문장을 새로 준비하지 않는다', () => {
        firmPromiseMsOf('no-such-order', 'pickup');
        const prep = jest.spyOn(db, 'prepare');
        firmPromiseMsOf('no-such-order', 'pickup');
        expect(prep).not.toHaveBeenCalled();
        prep.mockRestore();
    });

    it('🔴 DB 가 바뀌면 그 DB 의 문장으로 읽는다 — 옛 DB 에 묶인 문장을 쓰지 않는다', () => {
        const mk = (promise: string) => {
            const d = new Database(':memory:');
            for (const t of STEP_TABLES) d.exec(`CREATE TABLE ${t.table} (orderId TEXT, status TEXT, promised_arrival_at TEXT)`);
            d.prepare(`INSERT INTO ${STEP_TABLES[0].table} (orderId, status, promised_arrival_at) VALUES ('X', 'DONE', ?)`).run(promise);
            return d;
        };
        const a = mk('2026-09-23T01:00:00.000Z');
        const b = mk('2026-09-23T02:00:00.000Z');
        const step = STEP_TABLES[0].step;
        expect(bornRowsIn(a, 'X')[step]?.promised_arrival_at).toBe('2026-09-23T01:00:00.000Z');
        expect(bornRowsIn(b, 'X')[step]?.promised_arrival_at).toBe('2026-09-23T02:00:00.000Z');
        expect(bornRowsIn(a, 'X')[step]?.promised_arrival_at).toBe('2026-09-23T01:00:00.000Z');
    });
});
