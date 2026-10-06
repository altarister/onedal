import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { anomalyKindLabel } from '@onedal/shared';

/**
 * 🗂️ **원달앱이 쓰는 이상 기록 갈래는 모두 한글 이름이 있다** — 운영센터 «앱 이상 기록» 탭(shared `anomalyKinds`).
 * 원달앱 소스에서 까닭 글 앞머리 «KIND: »를 모아 견준다 — 원달앱이 새 갈래를 더하고 이름을 안 주면 탭이 영문으로 뜬다.
 * 못 잡는 것: 앞머리를 글자 그대로 쓰지 않고 변수로 조립한 갈래.
 */
const APP = join(__dirname, '../../../../onedal-app/app/src/main/java/com/onedal/app');

function ktFiles(dir: string): string[] {
    return readdirSync(dir).flatMap(n => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? ktFiles(p) : n.endsWith('.kt') ? [p] : [];
    });
}

describe('앱 이상 기록 갈래 — 원달앱 앞머리 ↔ 한글 이름', () => {
    const kinds = new Set<string>();
    for (const f of ktFiles(APP)) {
        for (const m of readFileSync(f, 'utf8').matchAll(/"([A-Z][A-Z_]{3,}): /g)) kinds.add(m[1]);
    }

    it('원달앱 소스에서 앞머리를 찾는다(검사가 빈손이 아니다)', () => {
        expect(kinds.has('CALL_TAKEN')).toBe(true);
        expect(kinds.size).toBeGreaterThanOrEqual(5);
    });

    it('🔴 앞머리마다 한글 이름이 있다', () => {
        const missing = [...kinds].filter(k => anomalyKindLabel(k) === k);
        expect(missing).toEqual([]);
    });
});
