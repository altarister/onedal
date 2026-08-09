import {
    findTagConflicts, isTimeSensitive,
    computeSlackMinutes, allowedDetourMinutes, describeSlack,
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
    it('🔴 위험물과 식료품은 함께 실을 수 없다', () => {
        expect(findTagConflicts(['위험물'], ['식료품'])).toEqual([['위험물', '식료품']]);
        expect(findTagConflicts(['냉장'], ['위험물'])).toEqual([['냉장', '위험물']]);
    });

    it('문제없는 조합은 빈 배열', () => {
        expect(findTagConflicts(['식료품', '냉장'], ['파손주의'])).toEqual([]);
        expect(findTagConflicts([], ['위험물'])).toEqual([]);
    });

    it('시간에 민감한 화물을 구분한다', () => {
        expect(isTimeSensitive(['냉동'])).toBe(true);
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
