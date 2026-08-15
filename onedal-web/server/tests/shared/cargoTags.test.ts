import {
    findTagConflicts, isTimeSensitive,
    computeSlackMinutes, allowedDetourMinutes, describeSlack,
    dwellMinutes, computeStopTiming, unitPoints, DWELL_UNKNOWN_PICKUP_MINUTES, DWELL_UNKNOWN_DROPOFF_MINUTES,
    CARGO_UNITS, CARGO_UNIT_QUANTITY_INPUT, HANDLING_METHODS,
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

    /**
     * ⚠️ 이 검사는 원래 *"이미 늦은 짐이 있으면 우회 여력 **0** (음수가 아니라)"* 이었다.
     *
     * 그 `0` 이 **한계**로 쓰이면서 사고가 났다 — `shitTime = slackLimit(0)` 이 되어
     * `+0분` 짜리 콜조차 `0 >= 0` 으로 똥이 됐다. 2026-08-15 실측: 요금 99,000원 ·
     * 우회 `+1.1km` · 주행 `+6분` 짜리가 🟡 로 떴다.
     *
     * 더 나쁜 것은 **"모른다"와 "늦었다"가 같은 0 으로 뭉개진 것**이다. 기사님 확정:
     *   마감 미확정 → 일반값(90분)   ·   확정 후 지각 → 합짐을 막는다
     * 두 경우를 구분하려면 음수가 음수로 나와야 한다.
     */
    it('이미 늦은 짐이 있으면 음수를 그대로 돌려준다 (0 으로 뭉개지 않는다)', () => {
        expect(allowedDetourMinutes([-30, 120])).toBe(-30);
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

    /**
     * ⚠️ 이 검사는 원래 *"방법을 모르면 **낙관하지 않는다** — 기본 20분"* 이었다.
     *    상차 20 + 하차 20 = 40분이 주행에 얹혀 꿀콜이 똥이 됐다.
     *
     * 기사님 확정(2026-08-15): *"**일반적인 값**을 넣어두고 미확인으로 표시하면 좋을 듯.
     * 그럼 계산은 일반값으로 하면 꿀콜이 되어 **잡은 후 내가 전화하여 확정**하면 되니까."*
     * → 비관도 낙관도 아닌 **일반값**을 쓰고, 화면에 `미확인` 을 함께 적는다 (규칙 ⑤-2).
     *
     * 상차가 더 긴 이유도 기사님 말이다 — **상차에는 결박이 붙는다.**
     */
    it('🔴 방법을 모르면 일반값 — 상차 15분 · 하차 10분', () => {
        expect(dwellMinutes(undefined, 30, 'pickup')).toBe(DWELL_UNKNOWN_PICKUP_MINUTES);
        expect(dwellMinutes(null, 30, 'dropoff')).toBe(DWELL_UNKNOWN_DROPOFF_MINUTES);
        expect(DWELL_UNKNOWN_PICKUP_MINUTES).toBe(15);
        expect(DWELL_UNKNOWN_DROPOFF_MINUTES).toBe(10);
        // 안 넘기면 더 긴 쪽(상차)으로 본다 — 낙관하지 않되 비관도 아니다
        expect(dwellMinutes(null, 30)).toBe(DWELL_UNKNOWN_PICKUP_MINUTES);
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
