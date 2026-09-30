import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { OPEN_BLOCKED, openBlockedSayOf } from './openBlocked';

/**
 * 🚧 **앱이 못 연 까닭 — 열쇠 표** (원달앱 `OpenBlocked` · onedal-1f «가»).
 * 곧 스스로 풀리는 까닭은 띠를 안 띄운다 — 1~2초 뒤 앱이 열 콜에 «직접 여십시오»는 노이즈다.
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

    it('🔴 곧 스스로 풀리는 까닭은 띠가 없다', () => {
        for (const k of ['handFirst', 'listMoving', 'alarmHeld', 'evaluating', 'busy', 'tapRecheck']) {
            expect(openBlockedSayOf(k)).toBeNull();
        }
    });

    it('🔴 기사님 손이 필요한 까닭은 기사님 말로 짧게', () => {
        expect(openBlockedSayOf('acceptVisible')).toBe('오더카드가 떠 있어 안 누름');
        expect(openBlockedSayOf('tabBar')).toBe('맨 아래 줄이라 안 누름');
        for (const k of ['acceptVisible', 'notUnderHeader', 'noWaitingBand', 'underBand', 'tabBar', 'scrolledOff', 'tapNotSent', 'held']) {
            const say = openBlockedSayOf(k);
            expect(say).toBeTruthy();
            expect(say!.length).toBeLessThanOrEqual(20);
        }
    });

    it('까닭이 없으면 띠가 없다 · 모르는 열쇠는 지어내지 않고 그대로 보인다', () => {
        expect(openBlockedSayOf(undefined)).toBeNull();
        expect(openBlockedSayOf(null)).toBeNull();
        expect(openBlockedSayOf('newKey')).toBe('모르는 까닭(newKey)');
    });
});
