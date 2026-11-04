import { describe, expect, it } from 'vitest';
import { clockText, hhmmText, isoKst, kstDateText, manwonText, wonText } from './format';

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

/**
 * 💸 **요금 글자 — 한 모양 · 한 곳** (공통 함수 2). 만원은 소수 한 자리 «3.2만», 원은 쉼표 «12,345원».
 *    빈 값은 null — 빈 자리 글자(«—» · «금액미상»)는 부르는 쪽이 정한다.
 */
describe('💸 manwonText · wonText', () => {
    it('🔴 만원은 소수 한 자리 · 원은 쉼표', () => {
        expect(manwonText(32_000)).toBe('3.2만');
        expect(manwonText(100_000)).toBe('10.0만');
        expect(manwonText(0)).toBe('0.0만');
        expect(manwonText(-5_000)).toBe('-0.5만');
        expect(wonText(12_345)).toBe('12,345원');
        expect(wonText(0)).toBe('0원');
    });
    it('🔴 빈 값은 null', () => {
        for (const v of [null, undefined]) {
            expect(manwonText(v)).toBeNull();
            expect(wonText(v)).toBeNull();
        }
    });
});

/**
 * 🕐 **서버 응답 시각은 ISO** — SQLite 지역 시각 글자(«2026-10-01 14:05:03» · 한국 시각 · 시간대 표시 없음)는 Safari 가 못 읽는다.
 *    응답을 만드는 자리에서 isoKst 로 바꾼다. 날짜만(«2026-10-01» — 날 키)은 그대로.
 */
describe('🕐 isoKst', () => {
    it('🔴 지역 시각 글자 → +09:00 ISO · ISO 는 그대로 · 날짜만은 그대로 · 빈 값 null', () => {
        expect(isoKst('2026-10-01 14:05:03')).toBe('2026-10-01T14:05:03+09:00');
        expect(isoKst('2026-10-01T05:05:03.000Z')).toBe('2026-10-01T05:05:03.000Z');
        expect(isoKst('2026-10-01')).toBe('2026-10-01');
        for (const v of [null, undefined, '']) expect(isoKst(v)).toBeNull();
    });
    it('🔴 시각 글자 함수도 지역 시각 글자를 같은 길로 읽는다', () => {
        expect(clockText('2026-10-01 14:05:03')).toBe('14:05:03');
        expect(hhmmText('2026-10-01 00:04:00')).toBe('00:04');
    });
});

describe('📅 kstDateText', () => {
    it('🔴 한국 달력 날 — UTC 로 전날인 시각도 한국 날 · 지역 글자도 · 빈 값 null', () => {
        expect(kstDateText('2026-10-01T16:30:00.000Z')).toBe('2026-10-02');
        expect(kstDateText('2026-10-02 01:30:00')).toBe('2026-10-02');
        expect(kstDateText(null)).toBeNull();
    });
});
