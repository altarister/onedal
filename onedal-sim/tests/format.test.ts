import { describe, expect, it } from 'vitest';
import {
    formatHwamul24Region,
    formatHwamul24Vehicle,
    formatInsungVehicle,
    formatRegionFullName,
    formatRegionName,
} from '@altari/core-simulator';

/**
 * 🔒 **지금 동작을 그대로 잠근다** — 배차망별 표기 함수 (2026-09-14 · 카카오픽커_시뮬레이터.md 0단계)
 *
 * 이 함수들은 지금 공통 코드(`core-simulator/src/format.ts`)에 있지만 **한 배차망 화면만** 쓴다.
 * 0단계에서 배차망 폴더로 옮긴다. 옮기기 전에 **지금 무엇을 내는지**를 적어 둬야
 * 옮긴 뒤에도 같은지 알 수 있다 — 그래서 고칠 점이 보여도 여기서는 고치지 않는다.
 *
 * 원달앱 파서가 이 글자를 읽는다 — 인성은 차종 약자(오·다·라)를 닻 삼아 요금을 읽는다
 * (format.ts 주석 · 2026-08-24 실측: 풀네임을 뿌리면 요금을 못 읽었다).
 */
describe('인성 차종 약자 — 원달앱 인성 파서가 읽는 글자', () => {
    it('차종 풀네임을 인성 약자로', () => {
        expect(formatInsungVehicle('오토바이')).toBe('오');
        expect(formatInsungVehicle('다마스')).toBe('다');
        expect(formatInsungVehicle('라보')).toBe('라');
        expect(formatInsungVehicle('승용차')).toBe('승');
        expect(formatInsungVehicle('1.4t')).toBe('1.4');
        expect(formatInsungVehicle('1t')).toBe('1t');
    });
    it('차종이 없으면 오, 모르는 차종은 그대로', () => {
        expect(formatInsungVehicle(null)).toBe('오');
        expect(formatInsungVehicle(undefined)).toBe('오');
        expect(formatInsungVehicle('트럭')).toBe('트럭');
    });
});

describe('화물24시 차종·지역 표기', () => {
    it('차종 풀네임을 화물24시 말로', () => {
        expect(formatHwamul24Vehicle('승용차')).toBe('승용');
        expect(formatHwamul24Vehicle('1t')).toBe('1톤');
        expect(formatHwamul24Vehicle('2.5t')).toBe('2.5톤');
        expect(formatHwamul24Vehicle(null)).toBe('1톤');
    });
    it('«경기 / 광주시 / 경안동» → «경기 광주 경안동» (시·군 글자를 뗀다)', () => {
        expect(formatHwamul24Region('경기 / 광주시 / 경안동')).toBe('경기 광주 경안동');
        expect(formatHwamul24Region('경기 / 양평군 / 양서면')).toBe('경기 양평 양서면');
        expect(formatHwamul24Region('')).toBe('');
    });
});

describe('인성 지역 표기', () => {
    it('이름의 첫 토막', () => {
        expect(formatRegionName('경안동 초월')).toBe('경안동');
        expect(formatRegionName('')).toBe('');
    });
    it('마지막 토막 — 앞의 공백까지 지금 동작 그대로 (0단계는 동작을 안 바꾼다)', () => {
        expect(formatRegionFullName('경기 / 수원시 / 영통구')).toBe(' 영통구');
        expect(formatRegionFullName('')).toBe('');
    });
});
