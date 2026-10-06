// @ts-nocheck
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import * as fileLogger from '../../src/utils/fileLogger';
import { phoneSupplyOf } from '../../src/state/phoneSupply';
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
        expect(phoneSupplyOf(U).phones['dev-supply-1']).toMatchObject({ mode: 'ALARM', evaluatingNow: false });
        spy.mockRestore();
        clearUserSession(U);
    });
});
