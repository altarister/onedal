import { describe, expect, it } from 'vitest';
import { clockText, hhmmText } from './format';

/**
 * 🕐 **시각 글자는 한 모양 — 24시간 «HH:MM:SS» · «HH:MM» · 늘 한국 시각** (onedal-1f 결정 · 공통 함수 1).
 * 같은 14:05:03 이 자리마다 «14시 5분 3초»(toLocaleTimeString ko-KR hour12:false) · «오후 2:05:03» 으로 갈렸다.
 * 기기 시간대가 달라도 한국 시각으로 — 날짜 계산(timing)과 같은 뿌리.
 */
const AT = Date.UTC(2026, 9, 1, 5, 5, 3);   // 한국 14:05:03

describe('🕐 clockText · hhmmText', () => {
    it('🔴 숫자 · ISO 글자 · Date 모두 한국 시각 24시간', () => {
        expect(clockText(AT)).toBe('14:05:03');
        expect(clockText(new Date(AT).toISOString())).toBe('14:05:03');
        expect(clockText(new Date(AT))).toBe('14:05:03');
        expect(hhmmText(AT)).toBe('14:05');
        expect(hhmmText('2026-10-01T15:04:00.000Z')).toBe('00:04');   // 자정을 넘긴 한국 시각
    });
    it('🔴 빈 값 · 0 · 못 읽는 글자는 null — 빈 자리 글자는 부르는 쪽이 정한다', () => {
        for (const v of [null, undefined, '', 0, 'nope']) {
            expect(clockText(v as never)).toBeNull();
            expect(hhmmText(v as never)).toBeNull();
        }
    });
});
