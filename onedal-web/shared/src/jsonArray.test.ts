import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { jsonArrayOf } from './jsonArray';

/**
 * 🧾 **JSON 배열 칸 읽기는 뿌리 하나 · «빈 것» 규칙은 자리마다** (공통 함수 7 · onedal-1f «가»).
 * 네 자리(서버 safeJsonArray · stepSeeder · shared stepRecords · 관제웹 StepSheetMock)는 «[]» 를 일부러 다르게 읽는다 —
 * 뿌리만 모으고 그 규칙은 자리에 남긴다. 아래 «옛 몸통»은 바꾸기 전 네 자리의 몸통 그대로다(전후 같은 답의 기준).
 */
const OLD = {
    safeJsonArray: (v: unknown): string[] => {
        if (typeof v !== 'string' || !v) return [];
        try { const p = JSON.parse(v); return Array.isArray(p) ? p.filter((x): x is string => typeof x === 'string') : []; } catch { return []; }
    },
    stepSeeder: (v?: string | null) => { try { return v ? JSON.parse(v) : null; } catch { return null; } },
    stepRecords: (v?: string | null): string[] | undefined => {
        try { const a = v ? JSON.parse(v) : null; return Array.isArray(a) && a.length ? a : undefined; } catch { return undefined; }
    },
    stepSheet: (v?: string | null): string[] => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } },
};
/** 새 자리 규칙 — 코드의 각 자리와 같은 식 */
const NEW = {
    safeJsonArray: (v: unknown) => (jsonArrayOf(v) ?? []).filter((x): x is string => typeof x === 'string'),
    stepSeeder: (v?: string | null) => jsonArrayOf(v),
    stepRecords: (v?: string | null) => { const a = jsonArrayOf(v) as string[] | null; return a && a.length ? a : undefined; },
    stepSheet: (v?: string | null) => (jsonArrayOf(v) ?? []) as string[],
};
const INPUTS: Array<string | null | undefined> = ['{깨짐', '', null, '[]', '["a","b"]'];

describe('🧾 jsonArrayOf', () => {
    it('🔴 깨짐 · 빈칸 · 배열 아님은 null · «[]» 는 [] 그대로', () => {
        expect(jsonArrayOf('{깨짐')).toBeNull();
        expect(jsonArrayOf('')).toBeNull();
        expect(jsonArrayOf(null)).toBeNull();
        expect(jsonArrayOf('3')).toBeNull();
        expect(jsonArrayOf('[]')).toEqual([]);
        expect(jsonArrayOf('["a"]')).toEqual(['a']);
    });
    it('🔴 네 자리 규칙이 바꾸기 전과 같은 답 — 배열 칸에 들어오는 다섯 입력', () => {
        for (const k of Object.keys(OLD) as Array<keyof typeof OLD>)
            for (const v of INPUTS) expect([k, v, NEW[k](v as never)]).toEqual([k, v, OLD[k](v as never)]);
    });
    it('🔴 네 자리가 jsonArrayOf 를 쓴다(사본 몸통 없음)', () => {
        const web = join(__dirname, '../..');
        const src = (p: string) => readFileSync(join(web, p), 'utf8');
        for (const p of ['server/src/state/userSessionStore.ts', 'server/src/services/stepSeeder.ts', 'shared/src/stepRecords.ts', 'client-app/src/components/dashboard/StepSheetMock.tsx']) {
            expect([p, /jsonArrayOf\(/.test(src(p))]).toEqual([p, true]);
            expect([p, /JSON\.parse\(v/.test(src(p))]).toEqual([p, false]);
        }
    });
});
