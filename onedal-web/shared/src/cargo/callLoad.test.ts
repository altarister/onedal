import { describe, expect, it } from 'vitest';
import { boxesOf, vehicleMatchOf, type CallLoad } from './callLoad';

/**
 * 🚚 **짐 묶음에서 우리 차종 · 라면박스 수를 꺼낸다 — 지금 정의 표 데이터로**.
 * 인성 «다» 는 우리 차종 다마스 · «14t» 는 표가 «우리 차종 없음»으로 적은 낱말 · 차종 글자가 없으면 모름(인성은 «수단 상관없음» 칸이 없다).
 * 픽커는 차종 글자가 없으면 수단 상관없음 · «승» 은 승용차 · «한차» 는 모름.
 * 박스 수는 크기 낱말의 박스 수(픽커 «소형» 2) > 콜 차종 표준(1t짐 80) · 둘 다 모르면 null.
 */
const loadOf = (vehicleText: string | null, sizeText: string | null = null): CallLoad => ({ vehicleText, sizeText, itemText: null, lines: [] });

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

    it('인성 확정 뒤 상세 «다마스-다마» 는 우리 차종 다마스다', () => {
        expect(vehicleMatchOf(loadOf('다마스-다마'), 'insung')).toEqual({ kind: 'OURS', vehicle: '다마스' });
    });

    it('픽커 차종 글자가 없으면 수단 상관없음이다', () => {
        expect(vehicleMatchOf(loadOf(null), 'kakaopicker')).toEqual({ kind: 'ANY' });
    });

    it('픽커 «승» 은 우리 차종 승용차다', () => {
        expect(vehicleMatchOf(loadOf('승'), 'kakaopicker')).toEqual({ kind: 'OURS', vehicle: '승용차' });
    });

    it('픽커 «한차» 는 모름이다', () => {
        expect(vehicleMatchOf(loadOf('한차'), 'kakaopicker')).toEqual({ kind: 'UNKNOWN' });
    });
});

describe('boxesOf', () => {
    it('1t 콜은 1t짐 80박스다', () => {
        expect(boxesOf(loadOf('1t'), 'insung')).toBe(80);
    });

    it('차종이 없으면 모름(null)이다', () => {
        expect(boxesOf(loadOf(null), 'insung')).toBeNull();
    });

    it('픽커 «소형» 은 라면박스 2개다', () => {
        expect(boxesOf(loadOf(null, '소형'), 'kakaopicker')).toBe(2);
    });

    it('픽커 «대형» 은 박스 수 모름이고 차종 글자도 없으면 null 이다', () => {
        expect(boxesOf(loadOf(null, '대형'), 'kakaopicker')).toBeNull();
    });
});
