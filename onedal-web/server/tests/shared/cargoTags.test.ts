import {
    findTagConflicts, isTimeSensitive,
    computeSlackMinutes, allowedDetourMinutes, describeSlack,
    dwellMinutes, computeStopTiming, unitPoints, buildHourSlots, DWELL_UNKNOWN_MINUTES,
    CARGO_UNITS, CARGO_UNIT_QUANTITY_INPUT, HANDLING_METHODS, buildArrivalSlots,
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

/**
 * [2026-08-12] 기사님 결정 — 톤백·쇼핑백을 선택지에서 빼고 `기타` 를 넣었다.
 * 방법에 `검수`(90분)를 더했다.
 *
 * 🔴 선택지에서 뺀 것과 **읽을 수 있는 것**은 다르다.
 *    local.db 에 톤백 3건·쇼핑백 2건이 실재하고 적요 파서도 그 낱말을 읽는다.
 *    점수표에서 지우면 그 콜들의 부피가 0 이 되어 차종 추정으로 떨어진다.
 */
describe('단위 개편 (2026-08-12)', () => {
    it('선택지는 다섯 개다 — 톤백·쇼핑백은 빠지고 기타가 들어왔다', () => {
        expect([...CARGO_UNITS]).toEqual(['파레트', '라면박스', '마대', '서류봉투', '기타']);
    });

    it('🔴 옛 단위도 계속 읽힌다 — 기존 DB 행의 부피를 잃지 않는다', () => {
        expect(unitPoints('톤백', 1)).toBe(30);
        expect(unitPoints('쇼핑백', 2)).toBeCloseTo(0.2);
    });

    it('기타는 0점 — "안 실었다"가 아니라 "환산할 수 없다"는 표시다', () => {
        // 0 이면 적재 계산이 차종 기준 보수 추정으로 떨어진다. 그게 정직한 값이다
        expect(unitPoints('기타', 3)).toBe(0);
    });

    it('파레트는 3개까지만 고른다 (1t 에 2개면 만재)', () => {
        const q = CARGO_UNIT_QUANTITY_INPUT['파레트'];
        expect(q.mode).toBe('preset');
        if (q.mode === 'preset') expect(q.options).toEqual([1, 2, 3]);
    });

    it('라면박스·마대·서류봉투는 십·일의 자리로 받는다 (수십 개가 예사다)', () => {
        for (const u of ['라면박스', '마대', '서류봉투'] as const) {
            expect(CARGO_UNIT_QUANTITY_INPUT[u].mode).toBe('digits');
        }
    });

    it('기타는 수량을 세지 않는다 — 부피를 모르는데 개수만 세면 뜻이 없다', () => {
        expect(CARGO_UNIT_QUANTITY_INPUT['기타'].mode).toBe('none');
    });
});

describe('검수 방법 (2026-08-12)', () => {
    it('검수는 90분이다 (기사님 지시)', () => {
        expect(dwellMinutes('검수', 0)).toBe(90);
    });

    it('🔴 수량이 아무리 많아도 90분 고정 — per-point 를 비워 두면 폴백이 1분씩 붙는다', () => {
        expect(dwellMinutes('검수', 30)).toBe(90);   // 파레트 2개
        expect(dwellMinutes('검수', 120)).toBe(90);  // 라면박스 480개
    });

    it('다른 방법은 그대로다', () => {
        expect(dwellMinutes('지게차', 30)).toBe(19);
        expect(dwellMinutes('수작업', 30)).toBe(60);
    });

    it('네 가지가 모두 선택지에 있다', () => {
        expect([...HANDLING_METHODS]).toEqual(['지게차', '수작업', '호이스트', '검수']);
    });
});

/**
 * [2026-08-12] 도착 시각을 30분 단위로 협상한다.
 *
 * 기사님이 실제로 하는 통화:
 *   "28분 걸려 08:39에 도착하는데, 일을 마무리하고 가야 해서 9:39에 가도 될까요?"
 *   → 승낙되면 그 한 시간이 통째로 합짐 시간
 *   "빨리 오셔야 해요" → "그럼 9:09까지 갈게요"
 */
describe('buildArrivalSlots — 30분 단위 도착 협상', () => {
    const NOW = new Date('2026-08-12T08:11:00+09:00').getTime();

    it('첫 칸은 가장 이른 도착 시각 그대로다 (여유 0)', () => {
        const s = buildArrivalSlots(NOW, 28, 5);
        expect(s[0].label).toBe('08:39');
        expect(s[0].minutesFromNow).toBe(28);
    });

    it('그 뒤로 30분씩 늘어난다 — 한 칸이 곧 30분의 합짐 시간', () => {
        expect(buildArrivalSlots(NOW, 28, 5).map(x => x.label))
            .toEqual(['08:39', '09:09', '09:39', '10:09', '10:39']);
    });

    it('🔴 지각 칸이 없다 — 가장 이른 도착에서 출발하므로 못 지킬 시각을 고를 수 없다', () => {
        expect(buildArrivalSlots(NOW, 28, 5).every(x => !x.beforeEta)).toBe(true);
    });

    it('주행이 길면 그만큼 뒤에서 시작한다', () => {
        expect(buildArrivalSlots(NOW, 124, 3).map(x => x.label))
            .toEqual(['10:15', '10:45', '11:15']);
    });

    it('간격을 바꿀 수 있다', () => {
        expect(buildArrivalSlots(NOW, 0, 3, 60).map(x => x.label))
            .toEqual(['08:11', '09:11', '10:11']);
    });
});
