import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * 🕐 **시각 글자는 shared format.ts 한 곳** (onedal-1f 결정 · 공통 함수 1).
 * `toLocaleTimeString` 은 옵션에 따라 «14시 5분 3초» · «오후 2:05:03» 이 나와 자리마다 갈렸고,
 * `toTimeString().slice(0, 5)` 는 기기 시간대를 따른다. 코드가 이 둘로 시각을 만들지 않는다(clockText · hhmmText).
 */
const ROOT = join(__dirname, '../../..');
const DIRS = ['server/src', 'shared/src', 'client-app/src', 'logbook/src'];
const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(join(d, e.name)) : /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [join(d, e.name)] : []);

describe('🕐 시각 한 모양', () => {
    it('🔴 코드가 toLocaleTimeString · toTimeString().slice(0,5) 로 시각을 만들지 않는다', () => {
        const bad: string[] = [];
        for (const dir of DIRS) for (const f of walk(join(ROOT, dir))) {
            readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
                if (/^\s*(\*|\/\/)/.test(l)) return;
                if (/toLocaleTimeString\(|toTimeString\(\)\.(slice|substring)\(0, ?5\)/.test(l)) bad.push(`${f.slice(ROOT.length + 1)}:${i + 1}`);
            });
        }
        expect(bad).toEqual([]);
    });
});
