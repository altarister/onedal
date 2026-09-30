import { describe, expect, it } from 'vitest';
import { unreadableAfter, unreadableLine } from './unreadable';

/**
 * ⚪ **평가 자리의 «판정 못 함»** (기사님 «가» · onedal-1f) — 서버가 보낸 한 줄을 들고 있다가
 * 진짜 판정이 오거나(order-evaluating) 상세에서 나가면(detail-unreadable-clear) 비운다.
 */
const got = { reason: '요금을 못 읽음', pickup: '경기 광주시 광남2동', fare: 0, at: '2026-09-30T10:46:24.179Z' };

describe('⚪ 판정 못 함 상태', () => {
    it('🔴 받으면 든다 · 새로 받으면 바뀐다', () => {
        expect(unreadableAfter(null, { type: 'unreadable', body: got })).toEqual(got);
        expect(unreadableAfter(got, { type: 'unreadable', body: { ...got, reason: '주소를 못 읽음' } })?.reason).toBe('주소를 못 읽음');
    });
    it('🔴 진짜 판정이 오거나 상세에서 나가면 비운다', () => {
        expect(unreadableAfter(got, { type: 'evaluating' })).toBeNull();
        expect(unreadableAfter(got, { type: 'clear' })).toBeNull();
    });
    it('🔴 둘째 줄에 받은 시각(시:분:초)', () => {
        const line = unreadableLine(got);
        expect(line.head).toBe('⚪ 판정 못 함 — 요금을 못 읽음');
        expect(line.sub).toMatch(/^\d{2}:\d{2}:\d{2} · /);
        expect(line.sub).toContain('광남2동');
    });
});
