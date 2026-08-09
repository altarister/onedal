import {
    findTagConflicts, isTimeSensitive,
    computeSlackMinutes, allowedDetourMinutes, describeSlack,
    dwellMinutes, computeStopTiming, unitPoints, buildHourSlots, DWELL_UNKNOWN_MINUTES,
} from '@onedal/shared';

/**
 * [Phase 8.4] 시간 여유가 합짐을 결정한다.
 *
 * 기사님: *"오후 2시에 콜을 잡았는데 5시까지는 와야 한다든지 하는 정보가 있어야 할 것 같아.
 * 그래야 합짐을 잡을 수 있을 듯."*
 *
 * 예전 판정은 우회 허용치가 고정 상수(30분/60분)였다. 실린 짐의 마감과 무관했다.
 */
describe('computeSlackMinutes — 마감까지 남는 시간', () => {
    const 오후2시 = new Date('2026-08-10T14:00:00+09:00').getTime();
    const 오후5시 = '2026-08-10T17:00:00+09:00';

    it('기사님 예시: 2시에 잡고 5시 마감, 남은 주행 60분 → 여유 120분', () => {
        expect(computeSlackMinutes(오후5시, 60, 오후2시)).toBe(120);
    });

    it('남은 주행이 길면 여유가 줄어든다', () => {
        expect(computeSlackMinutes(오후5시, 170, 오후2시)).toBe(10);
    });

    it('이미 늦었으면 음수 — 지각 예상', () => {
        expect(computeSlackMinutes(오후5시, 200, 오후2시)).toBe(-20);
    });

    it('🔴 마감을 모르면 null — 여유가 많다고 가정하지 않는다', () => {
        // 모르는 것을 낙관하면 지각한다
        expect(computeSlackMinutes(undefined, 60, 오후2시)).toBeNull();
        expect(computeSlackMinutes('말도안되는값', 60, 오후2시)).toBeNull();
    });
});

describe('allowedDetourMinutes — 가장 촉박한 짐이 기준', () => {
    it('하나라도 지각하면 안 되므로 최솟값을 쓴다', () => {
        expect(allowedDetourMinutes([180, 40, 300])).toBe(40);
    });

    it('마감을 아는 짐만 계산에 넣는다', () => {
        expect(allowedDetourMinutes([null, 90, null])).toBe(90);
    });

    it('이미 늦은 짐이 있으면 우회 여력 0 (음수가 아니라)', () => {
        expect(allowedDetourMinutes([-30, 120])).toBe(0);
    });

    it('아무 짐도 마감을 모르면 null → 호출부가 기존 상수로 폴백', () => {
        expect(allowedDetourMinutes([null, null])).toBeNull();
        expect(allowedDetourMinutes([])).toBeNull();
    });
});

describe('화물 성질', () => {
    it('🔴 위험물과 먹는 것은 함께 실을 수 없다', () => {
        expect(findTagConflicts(['위험물'], ['농산물'])).toEqual([['위험물', '농산물']]);
        expect(findTagConflicts(['수산물'], ['위험물'])).toEqual([['수산물', '위험물']]);
    });

    it('문제없는 조합은 빈 배열', () => {
        expect(findTagConflicts(['농산물', '수산물'], ['파손주의'])).toEqual([]);
        expect(findTagConflicts([], ['위험물'])).toEqual([]);
    });

    it('시간에 민감한 화물을 구분한다 — 늦으면 신선도가 떨어진다', () => {
        expect(isTimeSensitive(['농산물'])).toBe(true);
        expect(isTimeSensitive(['수산물'])).toBe(true);
        expect(isTimeSensitive(['생물'])).toBe(true);
        expect(isTimeSensitive(['파손주의'])).toBe(false);
        expect(isTimeSensitive([])).toBe(false);
        expect(isTimeSensitive(undefined)).toBe(false);
    });
});

describe('describeSlack — 기사님이 읽을 말로', () => {
    it.each([
        [null, '마감 미확인', 'none'],
        [-15, '15분 지각 예상', 'tight'],
        [20, '여유 20분 — 촉박', 'tight'],
        [60, '여유 60분', 'ok'],
        [150, '여유 2시간 30분 — 합짐 여력 있음', 'ample'],
    ])('%s → %s', (slack, text, level) => {
        const d = describeSlack(slack as number | null);
        expect(d.text).toBe(text);
        expect(d.level).toBe(level);
    });
});

describe('상하차 소요 시간 — 경로 시간에 더해야 하는 값', () => {
    it('수작업은 지게차보다 훨씬 오래 걸린다', () => {
        // 파레트 2개(30점)
        expect(dwellMinutes('지게차', 30)).toBe(19);
        expect(dwellMinutes('수작업', 30)).toBe(60);
    });

    it('짐이 적으면 방법 차이도 줄어든다', () => {
        expect(dwellMinutes('지게차', 2)).toBe(11);
        expect(dwellMinutes('수작업', 2)).toBe(18);
    });

    it('🔴 방법을 모르면 낙관하지 않는다 — 기본 20분', () => {
        expect(dwellMinutes(undefined, 30)).toBe(DWELL_UNKNOWN_MINUTES);
        expect(dwellMinutes(null, 30)).toBe(DWELL_UNKNOWN_MINUTES);
    });

    it('상차 + 하차 두 번을 모두 센다', () => {
        const t = computeStopTiming({ handling: '수작업', unit: '파레트', quantity: 2 }, { handling: '지게차' });
        expect(t.pickupDwell).toBe(60);
        expect(t.dropoffDwell).toBe(19);
        expect(t.totalDwell).toBe(79);   // 주행 시간에 이만큼이 더 붙는다
    });

    it('하차 방법을 안 물었으면 상차와 같다고 본다', () => {
        const t = computeStopTiming({ handling: '지게차', unit: '파레트', quantity: 1 }, undefined);
        expect(t.pickupDwell).toBe(t.dropoffDwell);
        expect(t.hasUnknown).toBe(false);
    });
});

describe('단위 — 기사님이 통화에서 실제로 쓰는 말', () => {
    it('1t 트럭에 파레트 2개면 만재 (30점)', () => {
        expect(unitPoints('파레트', 2)).toBe(30);
        expect(unitPoints('톤백', 1)).toBe(30);
    });

    it('마대·쇼핑백·서류봉투는 실제 적요에 나오는 단위 그대로다', () => {
        expect(unitPoints('마대', 5)).toBe(5);
        expect(unitPoints('쇼핑백', 2)).toBeCloseTo(0.2);
        expect(unitPoints('서류봉투', 1)).toBeCloseTo(0.02);  // 공간을 거의 안 먹는다
    });

    it('라면박스는 120개가 1t', () => {
        expect(unitPoints('라면박스', 120)).toBe(30);
        expect(unitPoints('라면박스', 40)).toBe(10);
    });

    it('모르는 단위는 0점 — 없는 값을 지어내지 않는다', () => {
        expect(unitPoints('컨테이너', 1)).toBe(0);
        expect(unitPoints(undefined, 3)).toBe(0);
    });
});

describe('시각 버튼 — "몇 시까지 오시면 되요"', () => {
    it('다음 정시부터 차례로 만든다', () => {
        const at1423 = new Date('2026-08-10T14:23:00+09:00').getTime();
        const slots = buildHourSlots(at1423, 0, 5);
        expect(slots.map(s => s.label)).toEqual(['15시', '16시', '17시', '18시', '19시']);
    });

    it('🔴 도착 예상보다 이른 시각은 표시해 준다 (고르면 지각 확정)', () => {
        const at1423 = new Date('2026-08-10T14:23:00+09:00').getTime();
        // 주행 100분이면 16:03 도착 → 15시·16시는 불가능
        const slots = buildHourSlots(at1423, 100, 5);
        expect(slots.filter(s => s.beforeEta).map(s => s.label)).toEqual(['15시', '16시']);
    });
});
