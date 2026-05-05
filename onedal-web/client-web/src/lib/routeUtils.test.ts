import { describe, it, expect } from 'vitest';
import { getDistanceKm, getMinuteDiff, getAddressLabel } from './routeUtils';

describe('getDistanceKm (Haversine Formula)', () => {
    it('같은 좌표의 거리는 0km이다', () => {
        expect(getDistanceKm(37.5, 127.0, 37.5, 127.0)).toBe(0);
    });

    it('서울-부산 간 직선 거리를 대략적으로 계산한다 (약 320km 내외)', () => {
        // 서울: 37.5665, 126.9780 (위도, 경도)
        // 부산: 35.1796, 129.0756
        const distance = getDistanceKm(37.5665, 126.9780, 35.1796, 129.0756);
        expect(distance).toBeGreaterThan(310);
        expect(distance).toBeLessThan(340);
    });
});

describe('getMinuteDiff', () => {
    it('두 시간 사이의 분 차이를 정확히 계산한다', () => {
        expect(getMinuteDiff('10:00', '10:30')).toBe(30);
        expect(getMinuteDiff('09:45', '10:15')).toBe(30);
    });

    it('자정을 넘기는 경우(다음 날)도 계산할 수 있다', () => {
        expect(getMinuteDiff('23:30', '00:30')).toBe(60);
    });

    it('시간이 없거나 "?"로 들어오면 null을 반환한다', () => {
        expect(getMinuteDiff('10:00', '?')).toBeNull();
        expect(getMinuteDiff('?', '10:30')).toBeNull();
        expect(getMinuteDiff(undefined, '10:30')).toBeNull();
    });
});

describe('getAddressLabel', () => {
    it('동/읍/면 단위가 있으면 추출한다', () => {
        expect(getAddressLabel('경기도 성남시 분당구 정자동')).toBe('정자동');
        expect(getAddressLabel('경기도 광주시 오포읍')).toBe('오포읍');
        expect(getAddressLabel('충청남도 홍성군 홍북면')).toBe('홍북면');
    });

    it('~가(예: 종로3가)로 끝나는 주소를 추출한다', () => {
        expect(getAddressLabel('서울특별시 종로구 종로3가')).toBe('종로3가');
    });

    it('동/읍/면이 없고 구까지만 있으면 구를 추출한다', () => {
        expect(getAddressLabel('인천광역시 연수구')).toBe('연수구');
    });

    it('동/읍/면/구가 없으면 띄어쓰기 기준 두 번째 항목을 반환한다', () => {
        expect(getAddressLabel('세종특별자치시 새롬동')).toBe('새롬동'); // '동'으로 잡힘
        expect(getAddressLabel('경기 화성시')).toBe('화성시');
    });

    it('빈 문자열이나 1단어 주소는 그대로 반환한다', () => {
        expect(getAddressLabel('')).toBe('미상');
        expect(getAddressLabel('서울')).toBe('서울');
    });
});
