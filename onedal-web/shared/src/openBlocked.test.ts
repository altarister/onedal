import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { OPEN_BLOCKED } from './openBlocked';

/**
 * 🚧 **앱이 못 연 까닭 — 열쇠 표** (원달앱 `OpenBlocked`).
 * 원달앱이 보내는 열쇠와 표가 한 벌이어야 로그의 열쇠를 사람이 읽을 수 있다.
 */
const APP_KEYS = (() => {
    const kt = readFileSync(join(__dirname, '../../../onedal-app/app/src/main/java/com/onedal/app/core/OpenBlocked.kt'), 'utf8');
    return [...kt.matchAll(/const val \w+ = "(\w+)"/g)].map(m => m[1]);
})();

describe('🚧 앱이 못 연 까닭 표', () => {
    it('🔴 원달앱이 보내는 열쇠를 표가 빠짐없이 덮는다 — 앱이 열쇠를 더하면 여기서 빨간불', () => {
        expect(APP_KEYS.length).toBeGreaterThan(10);
        expect(APP_KEYS.filter(k => !(k in OPEN_BLOCKED))).toEqual([]);
        expect(Object.keys(OPEN_BLOCKED).filter(k => !APP_KEYS.includes(k))).toEqual([]);
    });

    it('열쇠마다 기사님 말이 짧게 있다', () => {
        for (const [k, row] of Object.entries(OPEN_BLOCKED)) {
            expect(row.say, k).toBeTruthy();
            expect(row.say.length, k).toBeLessThanOrEqual(20);
        }
    });
});
