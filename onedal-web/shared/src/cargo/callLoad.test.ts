import { describe, expect, it } from 'vitest';
import { boxesOf, vehicleMatchOf, type CallLoad } from './callLoad';

/**
 * 🚚 **짐 묶음에서 우리 차종 · 라면박스 수를 꺼낸다 — 지금 정의 표 데이터로**.
 * 인성 «다» 는 우리 차종 다마스 · «14t» 는 표가 «우리 차종 없음»으로 적은 낱말 · 차종 글자가 없으면 모름(인성은 «수단 상관없음» 칸이 없다).
 * 박스 수는 크기 낱말이 표에 없으면 콜 차종 표준(1t짐 80) · 차종을 모르면 null.
 */
const loadOf = (vehicleText: string | null): CallLoad => ({ vehicleText, sizeText: null, itemText: null, lines: [] });

describe('vehicleMatchOf', () => {
    it('인성 «다» 는 우리 차종 다마스다', () => {
        expect(vehicleMatchOf(loadOf('다'), 'insung')).toEqual({ kind: 'OURS', vehicle: '다마스' });
    });

    it('인성 «14t» 는 우리 차종에 없음이다', () => {
        expect(vehicleMatchOf(loadOf('14t'), 'insung')).toEqual({ kind: 'NONE' });
    });

    it.each([[null], [''], ['  ']] as const)('인성 차종 글자 %j 는 모름이다', (text) => {
        expect(vehicleMatchOf(loadOf(text), 'insung')).toEqual({ kind: 'UNKNOWN' });
    });
});

describe('boxesOf', () => {
    it('1t 콜은 1t짐 80박스다', () => {
        expect(boxesOf(loadOf('1t'), 'insung')).toBe(80);
    });

    it('차종이 없으면 모름(null)이다', () => {
        expect(boxesOf(loadOf(null), 'insung')).toBeNull();
    });
});
