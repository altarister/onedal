import { describe, it, expect } from 'vitest';
import { ALL_ORDER_STATUSES, ORDER_STATUS_LABEL, isLetGoStatus } from './index';

/**
 * 🏷️ **콜 상태 이름표 한 벌** — 운영센터 화면에 영어 상태(SAFE_CANCEL · ORDER_RELEASED_BY_ME)가 그대로 나오던 것.
 * 서버가 쓰는 상태 전부(`ALL_ORDER_STATUSES`)에 한국어 이름이 있고, «잡았다가 무른 콜»(안전취소 · 방출)은 «잡은 콜»과 따로 센다.
 */
describe('콜 상태 이름표', () => {
    it('모든 상태에 한국어 이름이 있다 — 영어가 화면에 새지 않는다', () => {
        for (const s of ALL_ORDER_STATUSES) expect(ORDER_STATUS_LABEL[s], s).toMatch(/[가-힣]/);
    });
    it('무름 = 안전취소 · 기사님 방출 · 사무실 방출 — 진행 중 · 상차 · 하차 · 완료는 아니다', () => {
        expect(ALL_ORDER_STATUSES.filter(isLetGoStatus).sort()).toEqual(['ORDER_RELEASED_BY_ME', 'ORDER_RELEASED_BY_OFFICE', 'SAFE_CANCEL']);
    });
});
