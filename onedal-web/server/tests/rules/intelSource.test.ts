import { readFileSync } from 'fs';
import { join } from 'path';
import { reportSourceOf } from '../../src/core/helpers';
import db from '../../src/db';
import ordersRouter from '../../src/routes/orders';
import { clearUserSession } from '../../src/state/userSessionStore';
import { approvedUser } from '../fixtures/approvedUser';

/**
 * 🏷️ **목록 원문 줄마다 출처 — 실물 앱인가 시뮬레이터인가**.
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
        expect(block).toContain('pickupStop?.requestedDay ?? null');
    });
});

/* 📄 픽커 상세 보관 줄의 상차 · 하차 글자 — 사진 «행정동 + 상호»를 이은 판정 글자(stopQueryOf) · 목록 원문이 아니다 */
const U = 'test-intel-picker-detail';
const DEV = 'dev-intel-picker-detail';
describe('📄 픽커 상세 보관 줄의 상차 · 하차 글자', () => {
    beforeAll(() => {
        approvedUser(U);
        db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id, mode) VALUES (?, ?, 'ALARM')`).run(U, DEV);
    });
    afterAll(() => {
        clearUserSession(U);
        db.prepare(`DELETE FROM intel WHERE device_id = ?`).run(DEV);
        db.prepare(`DELETE FROM orders WHERE userId = ?`).run(U);
        db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(U);
        try { db.prepare(`DELETE FROM users WHERE id = ?`).run(U); } catch { /* 다른 표가 붙잡으면 다음 돌림이 이어 쓴다 */ }
    });

    it('🔴 상세 주소 + 상호 → «행정동 상호» · 상호 없는 하차 → 행정동', async () => {
        const layer = (ordersRouter as any).stack.find((l: any) => l.route?.path === '/confirm' && l.route.methods.post);
        const res: any = { status: () => res, json: () => res };
        const app = { get: () => ({ to: () => ({ emit: () => {} }) }) };
        await layer.route.stack[layer.route.stack.length - 1].handle({ app, body: {
            step: 'BASIC', deviceId: DEV, targetApp: 'kakaopicker', matchType: 'MANUAL',
            order: { id: 'intel-picker-1', fare: 9000, rawText: '[사진]\n경기 성남시 중원구 은행2동',
                pickupDetails: [{ listText: '중원구 은행동', addressDetail: '경기 성남시 중원구 은행2동', customerName: '퓨전중화요리-궁' }],
                dropoffDetails: [{ listText: '수정구 태평동', addressDetail: '경기 성남시 수정구 태평2동' }] },
        } }, res);
        for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r));
        const row = db.prepare(`SELECT pickup, dropoff FROM intel WHERE device_id = ? AND type = 'PICKER_DETAIL'`).get(DEV) as any;
        expect(row).toEqual({ pickup: '경기 성남시 중원구 은행2동 퓨전중화요리-궁', dropoff: '경기 성남시 수정구 태평2동' });
    });
});
