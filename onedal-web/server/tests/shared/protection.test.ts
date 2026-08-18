import { dwellMinutes, protectionMinutes, PROTECTION_MINUTES, HANDLING_METHODS, defaultCargoByVehicle } from '@onedal/shared';

/**
 * 🔒 **방법과 보호는 축이 다르다** (기사님 확정 2026-08-18)
 *
 * 기사님: *"수작업은 짐을 손으로 내리거나 싣는 행위만을 말한다고 정의하자.
 * 박스당 20초면 다마스는 30박스가 기본값이니 10분이 걸린다는 이야기가 자연스럽게 도출된다."*
 * *"지게차 19 · 수작업 45 … 그때는 안전이라는 값이 없었으니 그냥 두리뭉실 넣은 값이야."*
 *
 * 그래서 기본 시간(찾기·대기 명목의 10~20분)을 없애고 **수량에만 비례**시킨다.
 * 결박 같은 안전 조치는 `보호` 로 빠져나가 복수 선택된다.
 */
describe('방법 — 옮기는 행위만 (수량 비례)', () => {
    it('🔴 다마스 30박스 수작업 = 10분 (박스당 20초에서 저절로 나온다)', () => {
        expect(dwellMinutes('수작업', 30)).toBe(10);
    });

    it('🔴 1t 파레트 2개 지게차 = 4분 (파레트당 2분)', () => {
        expect(dwellMinutes('지게차', 80)).toBe(4);
    });

    it('호이스트는 목록에서 뺐다 — 해본 적 없는 일에 값을 지어내지 않는다', () => {
        expect(HANDLING_METHODS).not.toContain('호이스트');
    });

    /**
     * 🔴 기본 시간을 0 으로 없앤 뒤의 함정 — `수량 0 × 박스당` 이 그대로 0분이 된다.
     *    "상차 0분"은 여유를 무한대로 만들어, 없는 숫자를 지어내는 것보다 나쁘다.
     */
    it('수량을 모르면 0분이 아니라 일반값으로 돌아간다', () => {
        expect(dwellMinutes('수작업', 0)).toBeGreaterThan(0);
    });
});

describe('보호 — 안전 조치 (복수 선택 · 합산)', () => {
    it('고른 것의 분을 더한다', () => {
        expect(protectionMinutes(['결박'])).toBe(4);
        expect(protectionMinutes(['결박', '그물망'])).toBe(5);
        expect(protectionMinutes(['호루', '결박', '그물망', '탑박스'])).toBe(9);
        expect(protectionMinutes([])).toBe(0);
        expect(protectionMinutes(null)).toBe(0);
    });

    it('상차 시간에 더해진다 — 다마스 30박스 수작업 + 결박 = 14분', () => {
        expect(dwellMinutes('수작업', 30, 'pickup', undefined, ['결박'])).toBe(14);
    });

    /** 결박은 묶는 자리(상차)의 일이다. 하차는 방법 시간만 센다 */
    it('하차에는 보호 시간을 더하지 않는다', () => {
        expect(dwellMinutes('수작업', 30, 'dropoff', undefined, ['결박'])).toBe(10);
    });

    it('🔴 파레트를 골라도 결박은 붙는다 — 1t 지게차 + 결박 = 8분', () => {
        const d = defaultCargoByVehicle('1t')!;
        expect(d.handling).toBe('지게차');
        expect(dwellMinutes(d.handling, 80, 'pickup', undefined, ['결박'])).toBe(8);
    });

    it('보호 값이 용어집과 같다 (호루 3 · 결박 4 · 그물망 1 · 탑박스 1)', () => {
        expect(PROTECTION_MINUTES).toEqual({ '호루': 3, '결박': 4, '그물망': 1, '탑박스': 1 });
    });
});
