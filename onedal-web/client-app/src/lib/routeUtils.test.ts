import { describe, it, expect } from 'vitest';
import { getDistanceKm, getMinuteDiff, getAddressLabel, shortStopLabel } from './routeUtils';

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
        expect(getAddressLabel('')).toBe('배차값없음');
        expect(getAddressLabel('서울')).toBe('서울');
    });
});

/**
 * ✂️ **시트 상태바에 넣을 만큼만 자른 지명** (기사님 확정)
 *
 * 09-03 실제 자료: 지명 72종 · 평균 3.5자 · 최장 10자(`경기광주자연앤자이점`).
 * 한 줄이 약 56칸인데 최장 문장이 71칸이라 두 경우가 넘쳤다.
 */
describe('✂️ 지명 줄이기', () => {
    it('짧은 지명은 그대로다 — 대부분이 여기 든다', () => {
        expect(shortStopLabel('초월읍')).toBe('초월읍');
        expect(shortStopLabel('가산동')).toBe('가산동');
        expect(shortStopLabel('남한산성면')).toBe('남한산성면');
    });

    it('긴 지명은 자른다 — 실제로 넘치던 값들', () => {
        expect(shortStopLabel('경기광주자연앤자이점')).toBe('경기광주자연…');
        expect(shortStopLabel('더샵오포센트럴포레')).toBe('더샵오포센트…');
    });

    it('🔴 자르면 «잘렸다»고 말한다 — 말없이 자르면 그게 이름 전부로 읽힌다 (규칙 ④)', () => {
        expect(shortStopLabel('경기광주자연앤자이점').endsWith('…')).toBe(true);
        expect(shortStopLabel('초월읍').endsWith('…')).toBe(false);
    });

    it('경계에서 안 자른다 — 딱 맞으면 그대로', () => {
        expect(shortStopLabel('가나다라마바')).toBe('가나다라마바');
        expect(shortStopLabel('가나다라마바사')).toBe('가나다라마바…');
    });

    it('빈 값에 손대지 않는다', () => {
        expect(shortStopLabel('')).toBe('');
    });
});
