import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { boxesOf, carriedLoad, loadFrom, vehicleMatchOf, type CallLoad, type VehicleMatch } from './callLoad';
import { VEHICLE_OPTIONS } from './vehicles';
import type { TargetAppType } from '../network/targetApps';

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

describe('🚚 vehicleMatchOf — 공통 문제지 vehicleMatchCases (원달앱 VehicleMatch.of 와 같은 답)', () => {
    const sheet = JSON.parse(readFileSync(join(__dirname, '../network/pageReadCases.json'), 'utf8')) as
        { vehicleMatchCases: Array<{ network: TargetAppType; vehicleText: string | null; kind: VehicleMatch['kind']; vehicle?: string; why: string }> };
    it('문제지가 비지 않았다', () => expect(sheet.vehicleMatchCases.length).toBeGreaterThan(5));
    it.each(sheet.vehicleMatchCases.map(c => [c.why, c] as const))('%s', (_, c) => {
        expect(vehicleMatchOf(loadOf(c.vehicleText), c.network)).toEqual(c.vehicle ? { kind: c.kind, vehicle: c.vehicle } : { kind: c.kind });
    });
    /* 원달앱은 우리 차종 이름 목록을 따로 들고 있다 — 이 줄들이 그 목록을 shared 목록과 묶는다 */
    it('우리 차종 이름 그대로인 줄이 VEHICLE_OPTIONS 를 다 담는다', () => {
        const ours = new Set(sheet.vehicleMatchCases.filter(c => c.kind === 'OURS' && c.vehicleText === c.vehicle).map(c => c.vehicle));
        expect(VEHICLE_OPTIONS.filter(v => !ours.has(v))).toEqual([]);
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

describe('loadFrom — 콜 한 칸의 짐 덩어리를 푼다', () => {
    it('틀린 줄(모르는 갈래 · 글자 아닌 shown)은 버리고 나머지는 남긴다', () => {
        const raw = { vehicleText: '다', sizeText: 3, itemText: '박스', lines: [{ kind: 'weight', shown: '3.85톤' }, { kind: 'color', shown: '빨강' }, { kind: 'care', shown: 3 }, null] };
        expect(loadFrom(raw)).toEqual({ vehicleText: '다', sizeText: null, itemText: '박스', lines: [{ kind: 'weight', shown: '3.85톤' }] });
    });

    it('객체가 아니면 null', () => {
        for (const raw of [null, undefined, '다', 3, []]) expect(loadFrom(raw)).toBeNull();
    });
});

describe('carriedLoad', () => {
    it('칸마다 앞 묶음이 먼저 · 비면 다음 묶음 — 상세에 크기 낱말이 없어도 보고의 크기 낱말이 남는다', () => {
        const detail: CallLoad = { vehicleText: '트럭-1t', sizeText: null, itemText: null, lines: [{ kind: 'goods', shown: '폰)' }] };
        const report: CallLoad = { vehicleText: '1t', sizeText: '소형', itemText: null, lines: [] };
        const memory: CallLoad = { vehicleText: null, sizeText: null, itemText: '박스 2개', lines: [{ kind: 'passenger', shown: '2분동승' }] };
        expect(carriedLoad(detail, report, memory)).toEqual({ vehicleText: '트럭-1t', sizeText: '소형', itemText: '박스 2개', lines: [{ kind: 'goods', shown: '폰)' }] });
        expect(carriedLoad(null, report, memory)?.lines).toEqual([{ kind: 'passenger', shown: '2분동승' }]);
    });

    it('묶음이 하나도 없으면 null', () => {
        expect(carriedLoad(null, undefined)).toBeNull();
    });
});
