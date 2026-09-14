import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { STEP_TABLES, FILTER_FIELDS, DEFAULT_FILTER_VALUES } from '@onedal/shared';
import { STOP_STEP_TO_REAL, LAB_CALL_TO_ORDERS } from './labPortMap';

/**
 * 🚚 **실험실이 가리키는 실물 자리가 진짜 있는가** (기사님 2026-09-09).
 *
 * 🔴 이식 대조표를 **문서로만** 두면 실물 칸이 하나 바뀌어도 조용히 낡는다 —
 *    이 레포가 네 번 당한 「계획을 완료로 기술」과 같은 자리다.
 *    여기서 빨간불이 나면 [이식_계획.md §5] 도 함께 고쳐야 한다는 뜻이다.
 */
describe('🚚 이식 대조 — 실험실이 가리키는 실물 칸이 실제로 있는가', () => {
    it('정거장 네 값이 실물 step_* 표의 칸을 정확히 가리킨다', () => {
        for (const [labKey, { tables, col }] of Object.entries(STOP_STEP_TO_REAL)) {
            if (col == null) continue;                       // 🆕 이식 때 파야 하는 칸 — 없는 것이 정상
            for (const table of tables) {
                const t = STEP_TABLES.find(x => x.table === table);
                expect(t, `실물에 없는 표: ${table} (${labKey})`).toBeTruthy();
                const cols = t!.columns.map(([, c]) => c);
                expect(cols, `${table} 에 ${col} 이 없다 (실험실 ${labKey})`).toContain(col);
            }
        }
    });

    it('국면 다섯 칸이 실물 DB 칸 목록과 하나도 어긋나지 않는다', () => {
        const dbPaths = [...FILTER_FIELDS.map(f => f.path)].sort();
        const labKeys = Object.keys(DEFAULT_FILTER_VALUES).sort();
        expect(labKeys).toEqual(dbPaths);
    });

    it('콜 값이 가리키는 orders 칸이 실물 DDL 에 있다 · null 은 «아직 없다»로 남는다', () => {
        const ddl = readFileSync(fileURLToPath(new URL('../../../server/src/db.ts', import.meta.url)), 'utf8');
        const orders = ddl.slice(ddl.indexOf('CREATE TABLE IF NOT EXISTS orders'));
        const body = orders.slice(0, orders.indexOf(');'));
        for (const [labKey, col] of Object.entries(LAB_CALL_TO_ORDERS)) {
            if (col == null) continue;                       // 🆕 이식 때 파야 하는 칸 — 없는 것이 정상
            expect(new RegExp(`\\b${col}\\b`).test(body) || new RegExp(`${col}:`).test(ddl),
                `orders 에 ${col} 이 없다 (실험실 ${labKey})`).toBe(true);
        }
    });

    it('정거장 쪽에서 아직 안 판 칸도 눈에 보인다', () => {
        const todo = Object.entries(STOP_STEP_TO_REAL).filter(([, v]) => v.col === null).map(([k]) => k);
        // 🆕 `promiseBy`(약속을 통화로 정했나)가 2026-09-10 에 늘었다 — 이식 때 `step_arrive_*` 에 판다
        expect(todo).toEqual(['promiseBy', 'impacts']);      // impacts → 실물 `step_arrive_*.system_reasons`
    });

    it('아직 안 판 칸이 무엇인지 눈에 보인다 — 이식 때 여기부터 판다', () => {
        const todo = Object.entries(LAB_CALL_TO_ORDERS).filter(([, v]) => v === null).map(([k]) => k);
        // 좌표 둘은 orderStops→places 조인이라 칸을 파는 대상이 아니다
        // 🧹 `terminatedAt` 은 2026-09-14 에 팠다 (`orders.terminatedAt` · 전수표 #65)
        expect(todo).toEqual(['pickup', 'drop', 'approachKm', 'approachMin', 'destName', 'optionUsed']);
    });
});
