/**
 * 기본 콜 ↔ 콜 표 한 행
 * 누가: 서버 저장(OrderRepository.saveBaseCall) · 복원(sessionRestore) · 관제웹 콜 목록(GET /api/orders)
 * 언제: 기본 콜을 콜 표에 쓰고 되살릴 때
 * 어디서: 열 목록은 생성 파일 baseCallColumns
 * 무엇을: 끝 칸 하나를 열 하나로. 참거짓은 1 · 0, 여러 줄 칸은 JSON 글자, 모르는 값은 NULL
 * 왜: «오늘(0)» · «아니오»를 «모름»과 가르고, 칸이 늘면 손으로 적지 않게 하기 위해서다
 */
import type { BaseCall, CallEvidence } from './orderShapes';
import { BASE_CALL_COLUMNS, BASE_CALL_FARE_COLUMNS, CALL_EVIDENCE_COLUMN } from './baseCallColumns';

type Cell = string | number | null;
const SQL_TYPE = { TEXT: 'TEXT', REAL: 'REAL', BOOL: 'INTEGER', JSON: 'TEXT' } as const;

/** 콜 표에 더할 열과 종류 — 옛 행은 NULL(모름)로 남는다 */
export const BASE_CALL_COLUMN_TYPES: Record<string, string> = {
    ...Object.fromEntries(BASE_CALL_COLUMNS.map((c) => [c.column, SQL_TYPE[c.kind]])),
    [BASE_CALL_FARE_COLUMNS.total]: 'REAL',
    [BASE_CALL_FARE_COLUMNS.income]: 'REAL',
    [CALL_EVIDENCE_COLUMN]: 'TEXT',
};
const ALL_COLUMNS = Object.keys(BASE_CALL_COLUMN_TYPES);

const valueAt = (call: unknown, path: readonly string[]): unknown => path.reduce<unknown>((at, key) => (at && typeof at === 'object' ? (at as Record<string, unknown>)[key] : undefined), call);

/** 기본 콜 · 기록 → 열 값 — 모든 열이 키로 있고 모르는 값은 null */
export function baseCallRowOf(call: BaseCall | undefined, evidence?: CallEvidence): Record<string, Cell> {
    const row: Record<string, Cell> = Object.fromEntries(ALL_COLUMNS.map((c) => [c, null]));
    if (call) {
        for (const c of BASE_CALL_COLUMNS) {
            const v = valueAt(call, c.path);
            if (v === undefined || v === null) continue;
            row[c.column] = c.kind === 'BOOL' ? (v ? 1 : 0) : c.kind === 'JSON' ? JSON.stringify(v) : (v as string | number);
        }
        const won = (kind: string) => call.money?.lines?.find((line) => line.kind === kind)?.won ?? null;
        row[BASE_CALL_FARE_COLUMNS.total] = won('total');
        row[BASE_CALL_FARE_COLUMNS.income] = won('income');
    }
    if (evidence?.seen?.length) row[CALL_EVIDENCE_COLUMN] = JSON.stringify(evidence);
    return row;
}

/* 깨진 JSON 은 «없음» — 콜 복원을 막지 않는다 */
const parsed = (text: unknown): unknown => {
    if (typeof text !== 'string') return undefined;
    try { return JSON.parse(text); } catch { return undefined; }
};

/** 행 → 기본 콜 · 기록 — 값이 하나도 없으면 없는 것이다 */
export function baseCallFromRow(row: Record<string, unknown>, id: string, targetApp: string): { call?: BaseCall; evidence?: CallEvidence } {
    const call = { id, targetApp, route: { pickup: {}, dropoff: {} }, money: { lines: [] }, load: {}, time: {}, job: {} } as unknown as Record<string, unknown>;
    let found = false;
    for (const c of BASE_CALL_COLUMNS) {
        const cell = row[c.column];
        if (cell === undefined || cell === null) continue;
        const value = c.kind === 'BOOL' ? cell === 1 || cell === true : c.kind === 'JSON' ? parsed(cell) : cell;
        if (value === undefined) continue;
        let at = call;
        for (const key of c.path.slice(0, -1)) at = (at[key] ??= {}) as Record<string, unknown>;
        at[c.path[c.path.length - 1]] = value;
        found = true;
    }
    const evidence = parsed(row[CALL_EVIDENCE_COLUMN]) as CallEvidence | undefined;
    return { ...(found ? { call: call as unknown as BaseCall } : {}), ...(evidence?.seen ? { evidence } : {}) };
}

/** 관제웹으로 나가는 행에서 기본 콜 · 기록 열을 뺀다 — 전화번호 · 화면 원문이 실리지 않게 */
export function withoutBaseCallColumns<T extends Record<string, unknown>>(row: T): T {
    return Object.fromEntries(Object.entries(row).filter(([key]) => !(key in BASE_CALL_COLUMN_TYPES))) as T;
}
