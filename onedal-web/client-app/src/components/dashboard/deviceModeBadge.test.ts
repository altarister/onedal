import { describe, it, expect } from 'vitest';
import { directBadgeOf } from './deviceModeBadge';

/**
 * 🏷️ **«직접 모드» 배지는 도는 모드로** (29 P5-3) — 옆 모드 단추(`runningModeOf`)와 같은 값.
 * 못 잡는 것: 패널이 이 함수를 부르는가(관제웹 검사는 DOM 없이 돈다 — 71 e2e 화면).
 */
describe('🏷️ 직접 모드 배지', () => {
    it('새 폰 — 명령은 자동인데 원달앱이 직접으로 돈다고 보고하면 «직접 모드»', () => {
        expect(directBadgeOf({ mode: 'AUTO', effectiveMode: 'MANUAL' })).toBe(true);
    });
    it('도는 모드가 직접이 아니면 배지 없음 — 계약 안 함 · 알람', () => {
        expect(directBadgeOf({ mode: 'SIMULATION' })).toBe(false);
        expect(directBadgeOf({ mode: 'MANUAL', effectiveMode: 'ALARM' })).toBe(false);
    });
    it('직접 명령 · 직접으로 돎 → «직접 모드»', () => {
        expect(directBadgeOf({ mode: 'MANUAL' })).toBe(true);
    });
});
