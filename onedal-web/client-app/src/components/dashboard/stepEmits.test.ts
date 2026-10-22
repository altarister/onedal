import { describe, it, expect, vi, beforeEach } from 'vitest';

/** 소켓은 가짜로 — 나간 것(이름 · 몸통 · 차례)을 받아 본다 */
const sent: Array<[string, any]> = [];
vi.mock('../../lib/socket', () => ({ socket: { emit: (name: string, body: unknown) => { sent.push([name, body]); }, on: () => {}, off: () => {} } }));

import { sendCallSave, sendArrive, sendSkip, sendDone, sendCod, actualCargoOf, cargoOfRow } from './StepSheetMock';

/**
 * 📤 **단계 저장 — 카드 단추와 팝업 시트가 같은 보내기(`send…` — StepSheetMock)를 쓴다.**
 * 같은 행 · 같은 입력이면 같은 사건 이름 · 같은 몸통 · 같은 차례다.
 * 못 잡는 것: 서버가 그 몸통을 받아 무엇을 하는지(서버 jest · drive 몫) · 단추가 이 함수를 실제로 부르는지(화면 사진 · 폰).
 */
const ROW = { planned_unit: '라면박스', planned_quantity: 20, planned_handling: '수작업', predicted_at: '2026-10-22T01:00:00Z' };

describe('📤 단계 저장 보내기', () => {
    beforeEach(() => { sent.length = 0; });

    it('🔴 완료는 실측 먼저 → 완료 보고 — 두 건 · 이 차례', () => {
        sendDone('c1', 'LOADED', ROW, { cargo: actualCargoOf(ROW), reasons: [], reasonMemo: '' });
        expect(sent.map(([n, b]) => [n, b.kind ?? b.milestone])).toEqual([['save-cargo-report', 'ACTUAL'], ['report-milestone', 'PICKED_UP']]);
        expect(sent[0][1]).toMatchObject({ unit: '라면박스', quantity: 20, stopType: 'pickup' });
        expect(sent[1][1]).toMatchObject({ predictedAt: '2026-10-22T01:00:00Z' });
        sent.length = 0;
        sendDone('c1', 'DELIVERED', ROW, { cargo: actualCargoOf(ROW), reasons: [], reasonMemo: '' });
        expect(sent[0][1]).toMatchObject({ stopType: 'dropoff', unit: undefined });   // 하차엔 단위 · 수량을 안 싣는다
        expect(sent[1][1]).toMatchObject({ milestone: 'DELIVERED' });
    });
    it('🔴 통화 저장 — 상차만 짐 단위 · 수량 · 손댄 약속만 · 스킵은 «통화 없이 진행»', () => {
        const v = { cargo: cargoOfRow(ROW), memo: '경비실', pick: { touched: false, until: 'x' } };
        sendCallSave('c1', true, 'DECLARED', v);
        sendCallSave('c1', false, 'DECLARED', v);
        sendCallSave('c1', true, 'SKIPPED', v);
        expect(sent.map(([n]) => n)).toEqual(['save-cargo-report', 'save-cargo-report', 'save-cargo-report']);
        expect(sent[0][1]).toMatchObject({ kind: 'DECLARED', stopType: 'pickup', unit: '라면박스', memo: '경비실', promisedArrivalAt: undefined });
        expect(sent[1][1]).toMatchObject({ unit: undefined, quantity: undefined, stopType: 'dropoff' });
        expect(sent[2][1]).toMatchObject({ kind: 'SKIPPED', memo: '통화 없이 진행' });
    });
    it('도착 · 스킵 · 착불', () => {
        sendArrive('c1', 'ARRIVE_DROPOFF', ROW, { reasons: [], reasonMemo: '' });
        sendSkip('c1', 'PICKED_UP');
        sendCod('c1', false);
        expect(sent).toEqual([
            ['report-milestone', { orderId: 'c1', milestone: 'ARRIVED_DROPOFF', predictedAt: '2026-10-22T01:00:00Z', reasons: undefined }],
            ['report-milestone', { orderId: 'c1', milestone: 'PICKED_UP', source: 'SKIPPED' }],
            ['cod-collected', { orderId: 'c1', received: false }],
        ]);
    });
});
