// @ts-nocheck
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { BASE_CALL_COLUMNS } from './baseCallColumns';
import { BASE_CALL_COLUMN_TYPES, baseCallFromRow, baseCallRowOf, withoutBaseCallColumns } from './baseCallRow';
import { mergeBaseCall, mergeEvidence } from './baseCallToOffice';

/**
 * 🎯 **기본 콜 → 콜 표 한 행 → 기본 콜이 같은 값이다** (계획서 D2).
 * 기본 콜에 칸이 늘면 «모든 칸이 찬 콜»이 그 칸을 못 채워 빨개진다 — 열 목록을 다시 뽑으라는 뜻이다.
 */
const SHEET = JSON.parse(readFileSync(join(__dirname, '../network/callMergeCases.json'), 'utf8'));
/* 열 목록의 경로마다 값을 넣은 콜 — 종류마다 «0 · 거짓 · 빈 목록»처럼 모름과 헷갈리는 값을 넣는다 */
const full = () => {
    const call = { id: 'c', targetApp: 'insung', route: { pickup: {}, dropoff: {} }, money: { lines: [] }, load: {}, time: {}, job: {} };
    for (const c of BASE_CALL_COLUMNS) {
        let at = call;
        for (const key of c.path.slice(0, -1)) at = (at[key] ??= {});
        at[c.path[c.path.length - 1]] = c.kind === 'BOOL' ? false : c.kind === 'REAL' ? 0 : c.kind === 'JSON' ? [] : `${c.column} 값`;
    }
    call.money.lines = [{ kind: 'total', won: 0 }, { kind: 'income', won: 34600 }, { kind: 'fee', rate: '23%' }];
    return call;
};
const roundTrip = (call, evidence?) => baseCallFromRow(baseCallRowOf(call, evidence), call.id, call.targetApp);

describe('🎯 기본 콜 ↔ 콜 표 한 행', () => {
    it('모든 칸이 찬 콜이 같은 값으로 돌아온다 — 0 · 거짓 · 빈 목록도', () => {
        const call = full();
        expect(roundTrip(call).call).toEqual(call);
    });
    it('🔴 타입의 끝 칸이 열 목록에 다 있다', () => {
        const leaves = (v, path = []) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.entries(v).flatMap(([k, x]) => leaves(x, [...path, k])) : [path.join('.')]);
        const want = leaves(full()).filter((p) => p !== 'id' && p !== 'targetApp').sort();
        expect(BASE_CALL_COLUMNS.map((c) => c.path.join('.')).sort()).toEqual(want);
    });
    it.each(SHEET.cases.filter((c) => c.expectBaseCall).map((c) => [c.why, c]))('문제지 사례가 같은 값으로 돌아온다 — %s', (_w, c) => {
        const merged = mergeBaseCall({ id: 'c', targetApp: c.network, ...c.expectBaseCall.confirm }, { id: 'c', targetApp: c.network, ...c.expectBaseCall.detail });
        const back = roundTrip(merged).call;
        expect(JSON.parse(JSON.stringify(back))).toEqual(JSON.parse(JSON.stringify({ ...merged, load: merged.load ?? {}, time: merged.time ?? {}, job: merged.job ?? {} })));
    });
    it('요금 두 열은 금액 줄에서 나온다', () => {
        const row = baseCallRowOf(full());
        expect(row.money_total_won).toBe(0);
        expect(row.money_income_won).toBe(34600);
    });
    it('🔴 값을 모르는 칸은 NULL 이고 없는 콜은 되살리지 않는다', () => {
        const row = baseCallRowOf(undefined);
        expect(Object.values(row).every((v) => v === null)).toBe(true);
        expect(baseCallFromRow(row, 'c', 'insung')).toEqual({});
    });
    it('🔴 깨진 JSON 은 없음으로 — 복원을 막지 않는다', () => {
        const row = { ...baseCallRowOf(full()), money_lines: '{깨짐', call_evidence: '[' };
        const back = baseCallFromRow(row, 'c', 'insung');
        expect(back.call.money.lines).toEqual([]);
        expect(back.evidence).toBeUndefined();
    });
    it('기록은 JSON 한 열로 돌아온다', () => {
        const evidence = { seen: [{ at: 't', screen: 'newCall', read: 'text', rawText: '상세 글' }] };
        expect(roundTrip(full(), evidence).evidence).toEqual(evidence);
    });
    it('🔴 관제웹으로 나가는 행에는 기본 콜 · 기록 열이 없다', () => {
        const out = withoutBaseCallColumns({ id: 'c', pickup: '상', ...baseCallRowOf(full()) });
        expect(out).toEqual({ id: 'c', pickup: '상' });
        expect(Object.keys(BASE_CALL_COLUMN_TYPES).length).toBe(BASE_CALL_COLUMNS.length + 3);
    });
    it('🔴 같은 상세 글을 다시 보내면 기록 줄이 쌓이지 않는다', () => {
        const line = { at: 't1', screen: 'newCall', read: 'text', rawText: '상세 글' };
        const once = mergeEvidence(undefined, { seen: [line] });
        expect(mergeEvidence(once, { seen: [{ ...line, at: 't2' }] }).seen).toHaveLength(1);
        expect(mergeEvidence(once, { seen: [{ ...line, rawText: '다른 글' }] }).seen).toHaveLength(2);
    });
});
