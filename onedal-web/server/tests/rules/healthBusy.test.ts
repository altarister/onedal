import express from 'express';
import type { AddressInfo } from 'net';
import healthRouter from '../../src/routes/health';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';

/**
 * 🚦 **«지금 운행 중인가» 문** (`GET /api/health/busy`) — 배포가 이것을 묻고 운행 중이면 기다린다(`scripts/deploy.sh`).
 *    서버 안에서 온 요청에만 답하고, 진행 중 콜 · 심사 중 · 결재 기다림 · 걸린 기다림을 센다.
 */
const U = 'busy-user';
async function askBusy(): Promise<{ busy: boolean; live: number; evaluating: number; decisions: number; waits: number }> {
    const app = express(); app.use('/api/health', healthRouter);
    const srv = app.listen(0, '127.0.0.1');
    await new Promise(r => srv.once('listening', r));
    try {
        const r = await fetch(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/health/busy`);
        return await r.json() as any;
    } finally { srv.close(); }
}

describe('운행 중인가', () => {
    afterEach(() => clearUserSession(U));

    it('아무것도 없으면 운행 중이 아니다', async () => {
        clearUserSession(U);
        const r = await askBusy();
        expect(r.live + r.evaluating + r.decisions + r.waits).toBe(0);
        expect(r.busy).toBe(false);
    });

    it('진행 중 콜 · 심사 중 · 결재 기다림 하나씩이면 운행 중 — 끝난 콜은 안 센다', async () => {
        const s = getUserSession(U);
        s.myOrders.push({ id: 'live', status: 'ORDER_CONFIRMED' } as any, { id: 'done', status: 'ORDER_DELIVERED' } as any);
        s.pendingOrdersData.set('eval', { id: 'eval' } as any);
        s.pendingDecisions.set('dec', { action: 'KEEP', evaluatedAt: Date.now() });
        const r = await askBusy();
        expect([r.live, r.evaluating, r.decisions, r.busy]).toEqual([1, 1, 1, true]);
    });

    it('밖에서 온 요청에는 답하지 않는다(404)', () => {
        const layer: any = (healthRouter as any).stack.find((l: any) => l.route?.path === '/busy');
        let status = 0;
        const res: any = { status: (c: number) => { status = c; return res; }, end: () => res, json: () => res };
        layer.route.stack[0].handle({ socket: { remoteAddress: '203.0.113.5' } }, res, () => {});
        expect(status).toBe(404);
    });
});
