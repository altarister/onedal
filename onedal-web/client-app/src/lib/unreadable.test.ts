import { describe, expect, it } from 'vitest';
import { unreadableAfter, unreadableLine, visibleIn, seatOccupied, seatKeyOf } from './unreadable';
import { stageStep, initialStageMemory } from '../components/stage/stageRules';

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

/** ⚪ **화면에 보이는가** — 시트가 접혔거나 스크롤 밖이면 «아니오» (기사님 «못 봤다» · onedal-1f) */
describe('⚪ 보이는가', () => {
    it('🔴 창 안에 높이가 있으면 예 · 창 밖 · 높이 0 이면 아니오', () => {
        expect(visibleIn({ top: 600, bottom: 660, height: 60 }, 800)).toBe(true);
        expect(visibleIn({ top: 820, bottom: 880, height: 60 }, 800)).toBe(false);   // 접힌 시트 아래
        expect(visibleIn({ top: -80, bottom: -20, height: 60 }, 800)).toBe(false);   // 스크롤 위
        expect(visibleIn({ top: 600, bottom: 600, height: 0 }, 800)).toBe(false);
    });
});

/**
 * 🪧 **⚪ 는 진짜 판정과 같은 길로 시트를 올리고 내린다** (onedal-1f «가» · 같은 순서, 다른 것은 인자).
 * 시트 규칙이 받는 «평가 자리가 차 있나»(`seatOccupied`)에 ⚪ 도 든다 — 판정이 오면 올리고, 판정이 취소되면 내려가는 그 길이다.
 */
describe('🪧 ⚪ 와 시트', () => {
    const base = { nowMs: 1_000_000, calls: 0, drive: 'idle' as const, snap: 'peek' as const };
    it('🔴 평가 자리 — 판정 중 콜이 있거나 ⚪ 가 떠 있으면 차 있다 · 열쇠는 둘을 가른다', () => {
        expect(seatOccupied(null, got)).toBe(true);
        expect(seatOccupied(null, null)).toBe(false);
        expect(seatKeyOf('call-1', got)).toBe('call-1');
        expect(seatKeyOf(null, got)).toBe(`unreadable:${got.at}`);
        expect(seatKeyOf(null, null)).toBeNull();
    });
    it('🔴 ⚪ 옴 → 시트 올라감 (진짜 판정과 같은 judge)', () => {
        const up = stageStep(initialStageMemory(), { ...base, judging: seatOccupied(null, got) }, { type: 'judge' });
        const real = stageStep(initialStageMemory(), { ...base, judging: seatOccupied({ id: 'c' }, null) }, { type: 'judge' });
        expect(up.snap).toBeTruthy();
        expect(up.snap).toBe(real.snap);
    });
    it('🔴 ⚪ 지움 → 판정 취소와 같은 자리로', () => {
        const up = stageStep(initialStageMemory(), { ...base, judging: true }, { type: 'judge' });
        const after = { ...base, snap: up.snap ?? 'list', nowMs: base.nowMs + 60_000 };
        const cleared = stageStep(up.mem, { ...after, judging: seatOccupied(null, null) }, { type: 'signal' });
        const canceled = stageStep(up.mem, { ...after, judging: false }, { type: 'signal' });
        expect(cleared.snap).toBe(canceled.snap);
    });
});
