// @ts-nocheck
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import * as fileLogger from '../../src/utils/fileLogger';
import { phoneSupplyOf, serverIdOf } from '../../src/state/phoneSupply';
import { applyPhoneStatus, phoneStatusOf } from '../../src/state/phoneStatus';
import { getUserDevicesSnapshot } from '../../src/routes/devices';
import { ackDecision, unackedPhoneDecisions } from '../../src/state/decisions';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import db from '../../src/db';
import { approvedUser } from '../fixtures/approvedUser';

/**
 * 📡 **관제앱 공급 소켓(`/supply`) — 값 한 곳 · 결재 한 곳** (reviews/50 ①-1).
 * 결재 행동을 쓰는 곳은 `state/decisions.ts` 의 `decide` 하나 · 보고 응답과 공급이 같은 모드 함수 · 1초 주기가 불러도 로그가 늘지 않는다.
 * 못 잡는 것: 실제 관제앱 · 블루투스(①-2 · ①-3) · 공급 소켓 위로 오가는 값(drive e2e 몫) · 공급 소켓이 둘일 때의 재전송 순서.
 */
const SRC = join(__dirname, '../../src');
const walk = (d: string): string[] => readdirSync(d).flatMap(f => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
});

describe('📡 관제앱 공급', () => {
    it('🔴 결재 행동 쓰기(KEEP · CANCEL 을 결재 큐에 적기)는 decisions.ts 밖에 없다', () => {
        const writes = walk(SRC).filter(f => !f.endsWith('state/decisions.ts')).filter(f => {
            const s = readFileSync(f, 'utf8');
            return /pendingDecisions\.set\([^)]*action:\s*['"](KEEP|CANCEL|SIMULATED_KEEP)/.test(s) || /decisionData\.action\s*=/.test(s);
        });
        expect(writes).toEqual([]);
    });

    it('🔴 공급 소켓은 관제웹과 다른 이름공간 — 세션 충돌 · 창 넘겨주기 · «관제웹 있음»이 닿지 않는다', () => {
        const sock = readFileSync(join(SRC, 'socket/supplySocket.ts'), 'utf8');
        expect(sock).toContain('io.of(SUPPLY_NAMESPACE)');
        expect(sock).not.toMatch(/session\.activeWebSession/);
    });

    it('🔴 1초 주기가 연달아 불러도 로그가 늘지 않는다', () => {
        const U = 'test-phone-supply';
        approvedUser(U);
        db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id, mode) VALUES (?, ?, 'AUTO')`).run(U, 'dev-supply-1');
        getUserSession(U);   // 관제웹이 없어 자동 → 알람으로 내려주는 폰 — 첫 셈에서만 한 줄
        const spy = jest.spyOn(fileLogger, 'slog');
        phoneSupplyOf(U);
        spy.mockClear();
        phoneSupplyOf(U);
        phoneSupplyOf(U);
        expect(spy).not.toHaveBeenCalled();
        expect(phoneSupplyOf(U).phones['dev-supply-1']).toBeUndefined();   // 보고가 없는 등록 폰(서랍 속)은 폰 줄에 없다 — 셈도 로그도 안 한다
        spy.mockRestore();
        clearUserSession(U);
    });

    describe('받았음 두 길 · 다시 붙을 때', () => {
        const U2 = 'test-supply-ack';
        const setup = () => {
            const s = getUserSession(U2);
            s.deviceEvaluatingMap.set('dev-a', 'o-ack');
            s.pendingDecisions.set('o-ack', { action: 'KEEP', evaluatedAt: Date.now() });
            return s;
        };
        afterEach(() => clearUserSession(U2));

        it.each([['공급 먼저 → 보고 나중', '공급 소켓', '보고'], ['보고 먼저 → 공급 나중', '보고', '공급 소켓']])('🔴 %s — 큐 지움 한 번 · 로그 한 줄', (_n, first, second) => {
            const s = setup();
            const del = jest.spyOn(s.pendingDecisions, 'delete');
            const log = jest.spyOn(fileLogger, 'slog');
            expect(ackDecision(null, s, U2, 'o-ack', first)).toBe(true);
            expect(ackDecision(null, s, U2, 'o-ack', second)).toBe(false);
            expect(del).toHaveBeenCalledTimes(1);
            expect(log).toHaveBeenCalledTimes(1);
            expect(s.deviceEvaluatingMap.has('dev-a')).toBe(false);
            log.mockRestore();
        });

        it('🔴 다시 붙으면 받았음 안 온 결재가 한 번 · 받았음 뒤에는 0', () => {
            const s = setup();
            expect(unackedPhoneDecisions(s)).toEqual([{ deviceId: 'dev-a', orderId: 'o-ack', action: 'KEEP' }]);
            ackDecision(null, s, U2, 'o-ack', '공급 소켓');
            expect(unackedPhoneDecisions(s)).toEqual([]);
        });
    });

    describe('📶 블루투스로만 아는 폰 사실 (reviews/50 ①-4)', () => {
        const U3 = 'test-phone-status';
        beforeAll(() => {
            approvedUser(U3);
            db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id) VALUES (?, ?)`).run(U3, 'dev-status-1');
        });
        it('🔴 그 기사님 등록 폰만 받는다 — 남의 폰 번호는 버림', () => {
            expect(applyPhoneStatus(U3, { deviceId: 'dev-status-1', sameServer: false, unlinkedWhy: null, heardAt: 1 })).toBe(true);
            expect(applyPhoneStatus(U3, { deviceId: 'someone-else', sameServer: false, unlinkedWhy: null, heardAt: 1 })).toBe(false);
            expect(phoneStatusOf('dev-status-1').bleSameServer).toBe(false);
            expect(phoneStatusOf('someone-else')).toEqual({});
        });
        it('🔴 보고가 안 오는 폰(등록만)도 기기 목록에 블루투스 사실이 붙는다 · 꺼진 폰은 보낼 모드가 없다(적용중 아님)', () => {
            const row = getUserDevicesSnapshot(U3).find(d => d.deviceId === 'dev-status-1')!;
            expect(row.bleSameServer).toBe(false);
            expect(row.sentMode).toBeUndefined();
        });
        it('서버 표지는 다시 불러도 같다 — 다시 떠도 같은 값(호스트 · 포트 · 비밀)', () => {
            expect(serverIdOf()).toBe(serverIdOf());
            expect(serverIdOf()).toMatch(/^[0-9a-f]{12}$/);
        });
    });
});
