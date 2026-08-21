import {
    BUSINESS_DAY_END_HOUR, DEFAULT_DELIVERY_SLACK_MINUTES,
    businessDayEnd, defaultDropoffDeadline, derivePickupDeadline, buildArrivalSlots,
    departureDeadline, minutesUntil, formatCountdown, deriveCallTiming, businessDayKey, resetToBaseFilter,
} from '@onedal/shared';

/**
 * [2026-08-12] 기사님이 정한 두 원칙으로 마감을 **통화 전에도** 만든다.
 *
 *   원칙 1 (반드시)  일과시간(17시) 전에 가져다 준다
 *   원칙 2 (가급적)  이동시간을 제외하고 2시간 안에 배송한다
 *
 * 마감이 없으면 여유가 무한이 되어 합짐이 무제한 통과했다.
 */
const at = (h: number, m = 0) => new Date(`2026-08-12T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+09:00`).getTime();
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });

describe('원칙 1 — 일과시간 전에 가져다 준다', () => {
    it('일과 종료는 17시다 (기사님 결정)', () => {
        expect(BUSINESS_DAY_END_HOUR).toBe(17);
        expect(hhmm(new Date(businessDayEnd(at(9))).toISOString())).toBe('17:00');
    });

    it('🔴 17시가 지나면 다음 날로 넘어간다 — 그날 안에 못 가는 콜이다', () => {
        const end = new Date(businessDayEnd(at(18)));
        expect(hhmm(end.toISOString())).toBe('17:00');
        expect(end.getDate()).toBe(13);   // 다음 날
    });

    it('정확히 17시면 이미 끝난 것으로 본다', () => {
        expect(new Date(businessDayEnd(at(17))).getDate()).toBe(13);
    });
});

describe('원칙 2 — 이동시간 제외 2시간', () => {
    it('여유는 2시간이다', () => {
        expect(DEFAULT_DELIVERY_SLACK_MINUTES).toBe(120);
    });

    it('09시에 이동 90분이면 마감은 12:30 (10:30 도착 + 2시간)', () => {
        expect(hhmm(defaultDropoffDeadline(at(9), 90))).toBe('12:30');
    });

    it('🔴 2시간을 더하면 일과를 넘길 때는 17시로 자른다 (원칙 1 이 이긴다)', () => {
        // 16시에 이동 30분 → 도착 16:30, +2시간이면 18:30 이지만 일과는 17시
        expect(hhmm(defaultDropoffDeadline(at(16), 30))).toBe('17:00');
    });

    it('🔴 도착 자체가 일과를 넘기면 마감을 도착 시각으로 둔다 — 여유 0', () => {
        // 마감이 도착보다 앞서면 "이미 지각"이라 거짓말하게 된다
        expect(hhmm(defaultDropoffDeadline(at(16), 120))).toBe('18:00');
    });
});

describe('상차 마감은 하차 마감에서 역산한다', () => {
    it('하차 마감 − 상차→하차 이동 − 하차 작업', () => {
        const drop = new Date(at(15)).toISOString();
        expect(hhmm(derivePickupDeadline(drop, 60, 20)!)).toBe('13:40');
    });

    it('하차 마감이나 이동시간을 모르면 만들지 않는다 (0 으로 때우지 않는다)', () => {
        expect(derivePickupDeadline(null, 60, 20)).toBeNull();
        expect(derivePickupDeadline(new Date(at(15)).toISOString(), null, 20)).toBeNull();
    });
});

describe('최소 출발 시각 — 카운트다운의 근거', () => {
    it('상차 마감 − 현위치→상차지 이동', () => {
        // 기사님 예: 상차지까지 30분, 도착 예상에 30분을 더해 약속 → 30분 뒤에 출발해도 된다
        const pickupDeadline = new Date(at(10)).toISOString();
        expect(hhmm(departureDeadline(pickupDeadline, 30)!)).toBe('09:30');
    });

    it('그 시각까지 남은 시간이 곧 대기 예산이다', () => {
        const dep = new Date(at(9, 30)).toISOString();
        expect(minutesUntil(dep, at(9))).toBe(30);
    });

    it('🔴 이미 지났으면 음수를 그대로 준다 — 0 으로 깎으면 지각을 숨기게 된다', () => {
        expect(minutesUntil(new Date(at(9)).toISOString(), at(9, 20))).toBe(-20);
    });

    it('현위치를 모르면 만들지 않는다', () => {
        expect(departureDeadline(new Date(at(10)).toISOString(), null)).toBeNull();
    });
});

describe('카운트다운 표기', () => {
    it('한 시간 미만은 분:초', () => {
        expect(formatCountdown(new Date(at(9, 30)).toISOString(), at(9, 1) + 46_000)).toBe('28:14');
    });

    it('한 시간 이상은 시:분:초', () => {
        expect(formatCountdown(new Date(at(11)).toISOString(), at(9))).toBe('2:00:00');
    });

    it('지났으면 음수로 보여준다', () => {
        expect(formatCountdown(new Date(at(9)).toISOString(), at(9, 5))).toBe('-5:00');
    });

    it('없으면 null', () => {
        expect(formatCountdown(null, at(9))).toBeNull();
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

    /**
     * 🔄 **:00/:30 경계로 옮겼다가 되돌렸다** (2026-08-19, 하루 안에 두 번).
     *    경계로 올리면 **여유가 제멋대로 변한다** — 도착 예상 17:02 면 28분,
     *    17:29 면 1분 (기사님: *"여유 시간의 디폴트 값이 막 변화하는 거잖아"*).
     *    중복 칸의 진짜 원인은 눈금이 아니라 **기준점이 열 때마다 달라진 것**이었고,
     *    그건 호출부가 저장된 약속을 기준점으로 넘겨서 푼다.
     */
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
        // 예전 `buildHourSlots` 는 정시부터 만들어 "고르면 지각" 칸이 섞였고,
        // 그걸 표시하려고 `beforeEta` 플래그를 뒀다. 이제 그런 칸 자체가 없다.
        expect(buildArrivalSlots(NOW, 28, 5).every(x => x.minutesFromNow >= 28)).toBe(true);
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

/**
 * 🔴 2026-08-12 리팩토링 — 시간 파생의 **유일한 지점**.
 *
 * 예전에는 `PinnedRouteCard` 와 `DepartureCountdown` 이 같은 계산을 각자 했다.
 *   단독 구간 선택(osrm ?? kakao) · 접근 거리(총 − 단독) · 상차 정차
 * 한쪽만 고치면 **카운트다운과 통화 화면이 다른 시각을 말한다.**
 * 이 레포에서 반복된 사고(BB·DD·II·JJ·PP·WW)가 전부 이 모양이었다.
 */
describe('deriveCallTiming — 시간 파생의 유일한 지점', () => {
    const NOW = new Date('2026-08-12T09:00:00+09:00').getTime();
    const order = {
        approachDurationMin: 39,
        totalDistanceKm: 94.5,
        kakaoSoloDistanceKm: 68,
        kakaoSoloDurationMin: 86,
    };
    const rp = (o: any) => [o] as any;

    it('단독 구간과 접근 구간을 한 곳에서 구한다', () => {
        const t = deriveCallTiming(order, [], [], NOW);
        expect(t.soloKm).toBe(68);
        expect(t.soloMinutes).toBe(86);
        expect(t.approachKm).toBe(26.5);     // 94.5 − 68
        expect(t.approachMinutes).toBe(39);
    });

    it('🔴 OSRM 이 있으면 거리와 시간을 **같은 출처**에서 가져온다', () => {
        // 한쪽만 OSRM 이 되면 속도가 이상해진다
        const t = deriveCallTiming(
            { ...order, osrmSoloDistanceKm: 70, osrmSoloDurationMin: 90 }, [], [], NOW);
        expect(t.soloKm).toBe(70);
        expect(t.soloMinutes).toBe(90);
    });

    it('상차 정차는 실측이 통화값을 이긴다', () => {
        const t = deriveCallTiming(order, [
            { stopType: 'pickup', kind: 'DECLARED', unit: '파레트', quantity: 2, handling: '수작업' },
            { stopType: 'pickup', kind: 'ACTUAL', unit: '파레트', quantity: 2, handling: '지게차' },
        ] as any, [], NOW);
        expect(t.pickupDwell).toBe(4);       // 지게차 파레트 2개 × 2분 (2026-08-18 새 축)
    });

    it('하차 방법을 안 물었으면 상차 방법으로 본다', () => {
        const t = deriveCallTiming(order,
            rp({ stopType: 'pickup', kind: 'DECLARED', unit: '파레트', quantity: 2, handling: '지게차' }), [], NOW);
        expect(t.dropoffDwell).toBe(t.pickupDwell);
    });

    /**
     * ⚠️ 이 검사는 원래 *"하차 도착 예상 + 120분"* 으로 하차 마감을 먼저 잡고 상차를 역산하는
     *    방향을 고정했다. **방향을 뒤집었다** (기사님 2026-08-16):
     * ```
     *    상차 마감 = 콜 잡은 시각 + 60분          (콜 대기 여유)
     *    하차 마감 = 상차 마감 + 단독 주행 + 30분  (휴식 여유)
     * ```
     *    옛 방향은 100km 콜의 마감을 5~6시간 뒤로 잡아 **여유가 실제보다 훨씬 크게** 나왔다.
     *
     * 🔴 그래서 이제 **`capturedAt`(콜 잡은 시각)이 없으면 마감을 만들 수 없다.**
     *    지금 시각으로 대신하지 않는다 — 화면을 열 때마다 마감이 뒤로 밀려
     *    *"영원히 여유가 있다"* 고 거짓말한다.
     */
    it('마감이 없으면 잡은 시각에서 순산하고 **추정임을 밝힌다**', () => {
        const t = deriveCallTiming({ ...order, capturedAt: new Date(NOW).toISOString() }, [], [], NOW);
        expect(t.deadlineEstimated).toBe(true);
        expect(t.pickupDeadlineAt).not.toBeNull();
        expect(t.dropoffDeadlineAt).not.toBeNull();
        expect(t.departureAt).not.toBeNull();
        // ⏱️ 두 시계(⑯): 추정 도착 약속 = max(도착 예상 39분, 상차 시계 30분) = +39분.
        //    여유30·+60 완료 규칙은 폐기 — 접근이 시계를 넘으면 도착 예상이 바닥이다
        expect(new Date(t.pickupPromisedArrivalAt!).getTime() - NOW).toBe(39 * 60_000);
        expect(new Date(t.pickupDeadlineAt!).getTime() - new Date(t.pickupPromisedArrivalAt!).getTime())
            .toBe(t.pickupDwell * 60_000);
    });

    it('🔴 콜 잡은 시각을 모르면 마감을 지어내지 않는다', () => {
        const t = deriveCallTiming(order, [], [], NOW);   // capturedAt 없음
        expect(t.pickupDeadlineAt).toBeNull();
        expect(t.dropoffDeadlineAt).toBeNull();
    });

    /**
     * ⚠️ 기대값이 `81` → `66` 으로 바뀌었다. 차이 15분은 **상차 정차**다.
     *
     * 기사님(2026-08-16): *"화주의 생각은 보통 **여기서 물건 실어서 몇 시에 보낼 수 있을까**야.
     * 그러니 상차 시간을 포함해야 해."* → **상차 마감은 상차지 *도착* 시각이 아니라
     * *상차 완료* 시각**이다. 그래서 출발 역산에 주행뿐 아니라 상차 정차도 뺀다.
     *
     * 예전 값(81분)대로 두면 기사님이 상차지에 정시 도착해도 **약속보다 15분 늦게** 보내게 된다.
     * 통화값이 이긴다는 규칙 자체는 그대로다 — `pickupDeadlineAt` 은 여전히 통화값이다.
     */
    it('🔴 통화로 정한 마감이 언제나 이긴다 · 출발은 상차 정차까지 빼서 구한다', () => {
        const declared = new Date('2026-08-12T11:00:00+09:00').toISOString();
        const t = deriveCallTiming(order,
            rp({ stopType: 'pickup', kind: 'DECLARED', deadlineAt: declared }), [], NOW);
        expect(t.pickupDeadlineAt).toBe(declared);
        // 상차 마감 11:00 − 상차 정차 − 접근 39분 = 최소 출발 시각
        expect(t.waitMinutes).toBe(81 - t.pickupDwell);
    });

    it('대기 예산 = 최소 출발까지 남은 시간', () => {
        const t = deriveCallTiming(order, [], [], NOW);
        expect(t.waitMinutes).toBe(minutesUntil(t.departureAt, NOW));
    });

    it('상차했으면 상차지까지 남은 주행이 0 이다', () => {
        const t = deriveCallTiming(order, [], [{ milestone: 'ARRIVED_PICKUP' }], NOW);
        expect(t.arrivedPickup).toBe(true);
        expect(t.toPickup.driveMinutes).toBe(0);
        // 하차지까지는 단독 구간만 남고, 상차 작업이 앞에 붙는다
        expect(t.toDropoff.driveMinutes).toBe(86);
        expect(t.toDropoff.leadLabel).toBe('상차');
    });

    it('🔴 현위치를 모르면 만들지 않는다 — 0 으로 때우지 않는다', () => {
        const t = deriveCallTiming({ ...order, approachDurationMin: undefined }, [], [], NOW);
        expect(t.toPickup.driveMinutes).toBeNull();
        expect(t.departureAt).toBeNull();
        expect(t.waitMinutes).toBeNull();
    });
});

/**
 * 영업일 경계 — 기사님 결정(2026-08-12): *"그냥 하차시간을 기준으로 24시를 기준으로."*
 *
 * ⚠️ 일과 종료(17시)와 다른 것이다.
 *    17시 = "이 시각까지 갖다 준다" (배송 마감 상한)
 *    자정 = 어제와 오늘을 가르는 선 (오늘 필터가 되돌아가는 시점)
 */
describe('영업일 경계는 자정이다', () => {
    const at = (d: number, h: number, m = 0) =>
        new Date(`2026-08-${String(d).padStart(2,'0')}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00+09:00`).getTime();

    it('같은 날은 같은 키', () => {
        expect(businessDayKey(at(12, 6))).toBe(businessDayKey(at(12, 23, 59)));
    });

    it('🔴 자정을 넘기면 다른 날 — 여기서 오늘 필터가 되돌아간다', () => {
        expect(businessDayKey(at(12, 23, 59))).not.toBe(businessDayKey(at(13, 0, 1)));
    });

    it('17시(일과 종료)로는 날이 바뀌지 않는다 — 둘은 다른 개념이다', () => {
        expect(businessDayKey(at(12, 16))).toBe(businessDayKey(at(12, 18)));
    });

    it('로컬 날짜 문자열이다', () => {
        expect(businessDayKey(at(12, 9))).toBe('2026-08-12');
        expect(businessDayKey(at(3, 9))).toBe('2026-08-03');
    });
});

/**
 * 아침에 오늘 필터가 무엇으로 돌아가는가.
 *
 * 기사님: *"세션이 바뀌거나 담날이 되거나 하면 디폴트 값을 가져오고,
 * 운행 시작 전 오늘 콜이 많이 나올 만한 곳으로 필터에 값을 바꾸고…"*
 */
describe('resetToBaseFilter — 오늘 필터를 기본 설정으로', () => {
    const base = {
        destinationCity: '파주', destinationRadiusKm: 10, minFare: 30000, maxFare: 1000000,
        pickupRadiusKm: 10, detourRadiusKm: 5, excludedKeywords: ['착불'],
        allowedVehicleTypes: ['1t'], isActive: true, isSharedMode: false,
        driverAction: 'WAITING', dispatchPhase: 'STANDBY',
        destinationKeywords: [], customCityFilters: [], customFilters: [],
    } as any;

    it('기사님이 정한 기본 설정을 그대로 가져온다', () => {
        const r = resetToBaseFilter(base);
        expect(r.destinationCity).toBe('파주');
        expect(r.minFare).toBe(30000);
        expect(r.pickupRadiusKm).toBe(10);
        expect(r.excludedKeywords).toEqual(['착불']);
    });

    it('🔴 어제 경로에서 나온 경유은 비운다 — 그 지역으로 오늘 콜 잡기하면 안 된다', () => {
        const r = resetToBaseFilter({ ...base, destinationKeywords: ['어제동'], customCityFilters: ['어제시'] });
        expect(r.destinationKeywords).toEqual([]);
        expect(r.customCityFilters).toEqual([]);
        expect(r.destinationGroups).toEqual({});
    });

    it('수동 고정도 풀린다 — 새 하루는 자동 경유으로 시작한다', () => {
        expect(resetToBaseFilter({ ...base, userOverrides: true }).userOverrides).toBe(false);
    });

    it('🔴 콜 잡기은 끄지 않는다 — 아침에 기본 설정 그대로 잡는 것이 의도다', () => {
        expect(resetToBaseFilter({ ...base, isActive: true }).isActive).toBe(true);
        // 기본 설정에서 꺼 뒀으면 꺼진 채로 시작한다 (기본 설정을 따를 뿐 강제하지 않는다)
        expect(resetToBaseFilter({ ...base, isActive: false }).isActive).toBe(false);
    });

    it('원본을 건드리지 않는다', () => {
        const src = { ...base, userOverrides: true };
        resetToBaseFilter(src);
        expect(src.userOverrides).toBe(true);
    });
});
