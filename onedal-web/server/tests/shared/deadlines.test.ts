import {
    BUSINESS_DAY_END_HOUR, DEFAULT_DELIVERY_SLACK_MINUTES,
    businessDayEnd, defaultDropoffDeadline, derivePickupDeadline,
    departureDeadline, minutesUntil, formatCountdown,
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
