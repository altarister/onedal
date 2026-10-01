// @ts-nocheck
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { execFileSync } from 'child_process';

/**
 * 📅 **한국 날 키는 한 뿌리** (공통 함수 4 · onedal-1f «가»).
 * 영업일 경계는 자정(timing.ts — 기사님 «24시를 기준으로»)이라 영업일 키 = 한국 달력 날이다. 이름은 뜻 이름으로 둘(businessDayKey · kstDateText) 두되 계산은 kstDateText 하나 —
 * 기기 시간대를 따르지 않는다(서버 TZ 설정이 빠져도 · 한국이 아닌 브라우저에서도 같은 날).
 * 같은 날을 «+9시간 → toISOString().slice(0, 10)» · 기기 시간대 getFullYear 로 손으로 다시 재는 사본을 두지 않는다.
 */
const WEB = join(__dirname, '../../..');

describe('📅 한국 날 키', () => {
    it('🔴 기계 시간대가 UTC 여도(서버 TZ 설정 없이) 영업일 키는 한국 날 · kstDateText 와 같다', () => {
        /* jest 안의 process.env 는 사본이라 TZ 를 바꿔도 날 계산에 안 닿는다 — 자식 프로세스를 TZ=UTC 로 띄워 잰다 */
        const script = `import { businessDayKey, kstDateText } from '@onedal/shared';
const at = ['2026-10-01T00:30:00+09:00', '2026-10-01T23:59:59+09:00', '2026-10-02T00:00:00+09:00', '2026-12-31T15:00:00Z'].map(Date.parse);
console.log(JSON.stringify(at.map(ms => [businessDayKey(ms), kstDateText(ms)])));`;
        const out = execFileSync(process.execPath, [require.resolve('tsx/cli'), '-e', script], { cwd: join(__dirname, '../..'), env: { ...process.env, TZ: 'UTC' }, encoding: 'utf8' });
        const pairs: [string, string][] = JSON.parse(out.trim().split('\n').pop()!);
        for (const [b, k] of pairs) expect(b).toBe(k);
        expect(pairs[0][0]).toBe('2026-10-01');
    }, 30_000);

    it('🔴 한국 날을 손으로 다시 재는 사본이 없다', () => {
        const roots = ['server/src', 'shared/src', 'client-app/src', 'logbook/src', 'ops/src'];
        const walk = (d: string): string[] => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
        const files = roots.flatMap(r => walk(join(WEB, r))).filter(f => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f));
        const code = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
        const copies = files.filter(f => {
            const c = code(f);
            return /(KST_MS|9 \* 3600_000)[^;\n]*\)\.toISOString\(\)\.slice\(0, 10\)/.test(c)
                || /getFullYear\(\)\}-\$\{/.test(c);
        }).map(f => relative(WEB, f));
        expect(copies).toEqual([]);
    });
});
