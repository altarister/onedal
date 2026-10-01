/**
 * ⚖️ **앱 판정 낱말이 빠지지 않는가** — 축 이름표 · 갈래 기호(시나리오 칸이 쓴다).
 *
 * 🔴 **판정 규칙은 여기서 검사하지 않는다** — 그건 앱의 일이다(`InsungParser`).
 *    여기에 판정 사본을 두면 앱과 갈라진다. 이 검사가 무는 것은
 *    **«앱이 준 낱말을 삼키지 않는가»** 하나다.
 */
import { describe, it, expect } from 'vitest';
import { MARK_SIGN, VERDICT_AXIS_LABEL } from './callVerdict';

describe('버린 콜 — 앱 판정을 옮겨 적는 낱말', () => {
    it('앱이 보내는 축 여섯을 전부 한국어로 안다', () => {
        for (const axis of ['vehicle', 'region', 'fare', 'pickup', 'blacklist', 'routeOrder']) {
            expect(VERDICT_AXIS_LABEL[axis]).toBeTruthy();
        }
    });

    it('기호 표가 네 갈래를 모두 덮는다', () => {
        expect(Object.keys(MARK_SIGN).sort()).toEqual(['dropped', 'kept', 'missed', 'unknown']);
    });
});
