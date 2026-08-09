import {
    MILESTONES,
    MILESTONE_SOURCES,
    MILESTONE_TO_STATUS,
    canReportMilestone,
    isTerminal,
    TERMINAL_STATUSES,
} from '@onedal/shared';

/**
 * [Phase 8.2/8.3] 상차·하차 보고
 *
 * 기사님: *"모든 콜은 배송이 완료되면 — 화면 분석해서 자동으로 하든, 내가 직접 누르든,
 * 앱으로부터 받든 — 이벤트를 받게 될 것이다."*
 *
 * 진입점이 셋이므로 순서 역전과 중복이 반드시 생긴다. 규칙을 여기서 못박는다.
 */
describe('마일스톤 규격', () => {
    it('마일스톤은 상차/하차 둘뿐이다', () => {
        expect(MILESTONES).toEqual(['PICKED_UP', 'DELIVERED']);
    });

    it('진입 경로 셋을 모두 구분해 기록한다 (자동 감지 정확도 측정 근거)', () => {
        expect(MILESTONE_SOURCES).toEqual(['AUTO_SCRAPE', 'APP_BUTTON', 'MANUAL_WEB']);
    });

    it('마일스톤이 어떤 상태로 이어지는지 한 곳에서만 정한다', () => {
        expect(MILESTONE_TO_STATUS.PICKED_UP).toBe('ORDER_PICKED_UP');
        expect(MILESTONE_TO_STATUS.DELIVERED).toBe('ORDER_DELIVERED');
    });
});

describe('canReportMilestone — 상태 전이 규칙', () => {
    it('확정된 콜만 상차 보고할 수 있다', () => {
        expect(canReportMilestone('ORDER_CONFIRMED', 'PICKED_UP')).toBe(true);
    });

    it('평가 중인 콜은 상차 보고할 수 없다', () => {
        expect(canReportMilestone('ORDER_AWAITING_DECISION', 'PICKED_UP')).toBe(false);
        expect(canReportMilestone('ORDER_SECURED_EVALUATING', 'DELIVERED')).toBe(false);
    });

    it('상차 보고를 건너뛰고 바로 하차 보고해도 받는다', () => {
        // 바쁘면 상차 보고를 안 누르고 지나간다. 그렇다고 하차를 막으면 콜이 영영 안 닫힌다.
        expect(canReportMilestone('ORDER_CONFIRMED', 'DELIVERED')).toBe(true);
    });

    it('상차한 콜은 하차 보고할 수 있다', () => {
        expect(canReportMilestone('ORDER_PICKED_UP', 'DELIVERED')).toBe(true);
    });

    it('🔴 하차한 뒤 상차 보고가 늦게 와도 되돌리지 않는다', () => {
        // 앱이 통신 끊겼다 복구되며 밀린 이벤트를 몰아 보내면 순서가 역전된다.
        // 되돌리면 이미 내린 짐이 다시 "적재 중"이 되어 합짐 필터가 잘못 좁아진다.
        expect(canReportMilestone('ORDER_DELIVERED', 'PICKED_UP')).toBe(false);
        expect(canReportMilestone('ORDER_DELIVERED', 'DELIVERED')).toBe(false);
    });

    it('취소·방출된 콜에는 어떤 보고도 받지 않는다', () => {
        for (const dead of ['ORDER_CANCELED', 'ORDER_RELEASED', 'ORDER_FORCE_CANCELED', 'ORDER_COMPLETED']) {
            expect(canReportMilestone(dead, 'PICKED_UP')).toBe(false);
            expect(canReportMilestone(dead, 'DELIVERED')).toBe(false);
        }
    });

    it('상태를 모르면 보고를 받지 않는다', () => {
        expect(canReportMilestone(undefined, 'PICKED_UP')).toBe(false);
    });
});

describe('🔴 하차 = 종결 → 적재 공간 회복', () => {
    // 이 한 줄이 없어서 하차한 뒤에도 서버가 짐을 계속 세었고,
    // 잔여 용량이 회복되지 않아 합짐 필터가 좁은 채로 남아 다음 짐을 못 잡았다.
    it('ORDER_DELIVERED 는 종결 상태다', () => {
        expect(isTerminal('ORDER_DELIVERED')).toBe(true);
        expect(TERMINAL_STATUSES).toContain('ORDER_DELIVERED');
    });

    it('상차 중(ORDER_PICKED_UP)은 아직 종결이 아니다 — 짐이 실려 있다', () => {
        expect(isTerminal('ORDER_PICKED_UP')).toBe(false);
    });

    it('확정(ORDER_CONFIRMED)도 종결이 아니다 — 자리를 잡아둔 상태', () => {
        expect(isTerminal('ORDER_CONFIRMED')).toBe(false);
    });
});
