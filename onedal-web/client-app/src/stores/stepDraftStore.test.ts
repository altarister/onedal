import { describe, it, expect, beforeEach } from 'vitest';
import { useStepDraftStore, draftKeyOf, draftFor, syncDraft, dropDraftsOf, stepFactOf } from './stepDraftStore';

/** 적던 것이 있나 — 카드가 «✍️ 적다 만 것 있음»을 그릴 때 보는 것과 같다(`key in drafts`) */
const hasDraft = (key: string) => key in useStepDraftStore.getState().drafts;

/**
 * ✍️ **적던 것 보관 — 팝업이 저장 없이 닫혀도 이어서 고친다**.
 * 못 잡는 것: 시트가 이 값으로 실제로 칩을 그리는지 — 화면 사진 · 폰 몫.
 */
const ROW = { qty: 20, memo: '' };
const t1 = stepFactOf({ status: 'PLANNED', occurred_at: null });
const t2 = stepFactOf({ status: 'DONE', occurred_at: '2026-10-22T01:00:00Z' });
const t9 = stepFactOf({ status: 'PLANNED', occurred_at: null, recorded_at: 'x' });

describe('✍️ 적던 것 보관', () => {
    beforeEach(() => useStepDraftStore.setState({ drafts: {} }));

    it('🔴 같은 행(recorded_at)이면 적던 것을 돌려준다 — 닫았다 다시 열면 이어서', () => {
        const k = draftKeyOf('c1', 'CALL_PICKUP');
        syncDraft(k, t1, ROW, { qty: 30, memo: '경비실' });
        expect(draftFor(k, t1)).toEqual({ qty: 30, memo: '경비실' });
        expect(hasDraft(k)).toBe(true);
    });
    it('🔴 정차 배지(저장 시각만 바뀜)는 칸의 사실을 안 바꿔 적던 것이 그대로', () => {
        expect(stepFactOf({ status: 'PLANNED', occurred_at: null, recorded_at: 'a' })).toBe(stepFactOf({ status: 'PLANNED', occurred_at: null, recorded_at: 'b' }));
        const k = draftKeyOf('c1', 'LOADED');
        syncDraft(k, t1, ROW, { qty: 30, memo: '' });
        expect(draftFor(k, stepFactOf({ status: 'PLANNED', occurred_at: null, recorded_at: 'b' }))).toEqual({ qty: 30, memo: '' });
    });
    it('🔴 칸의 사실이 바뀌면(저장됨 · 남이 저장 · 되돌림) 적던 것을 버린다', () => {
        const k = draftKeyOf('c1', 'CALL_PICKUP');
        syncDraft(k, t1, ROW, { qty: 30, memo: '' });
        expect(draftFor(k, t2)).toBeNull();
        expect(hasDraft(k)).toBe(false);
    });
    it('🔴 서버 값과 같으면 적던 것이 아니다 — 열어 보기만 해서는 «적다 만 것»이 안 생긴다', () => {
        const k = draftKeyOf('c1', 'ARRIVE_PICKUP');
        syncDraft(k, t1, ROW, { ...ROW });
        expect(hasDraft(k)).toBe(false);
        syncDraft(k, t1, ROW, { qty: 21, memo: '' });
        syncDraft(k, t1, ROW, { ...ROW });   // 고쳤다가 되돌림
        expect(hasDraft(k)).toBe(false);
    });
    it('🔴 콜마다 따로 — 두 콜이 같은 단계를 적어도 섞이지 않고, 한 콜을 고쳐도 다른 콜은 그대로', () => {
        syncDraft(draftKeyOf('c1', 'CALL_DROPOFF'), t1, ROW, { qty: 11, memo: 'c1' });
        syncDraft(draftKeyOf('c2', 'CALL_DROPOFF'), t9, ROW, { qty: 22, memo: 'c2' });
        syncDraft(draftKeyOf('c1', 'CALL_DROPOFF'), t1, ROW, { qty: 12, memo: 'c1' });
        expect(draftFor(draftKeyOf('c1', 'CALL_DROPOFF'), t1)).toEqual({ qty: 12, memo: 'c1' });
        expect(draftFor(draftKeyOf('c2', 'CALL_DROPOFF'), t9)).toEqual({ qty: 22, memo: 'c2' });
    });
    it('콜이 목록에서 빠지면 그 콜의 적던 것을 모두 버린다 · 남의 콜은 그대로', () => {
        syncDraft(draftKeyOf('c1', 'CALL_PICKUP'), t1, ROW, { qty: 1, memo: '' });
        syncDraft(draftKeyOf('c1', 'LOADED'), t1, ROW, { qty: 2, memo: '' });
        syncDraft(draftKeyOf('c2', 'LOADED'), t1, ROW, { qty: 3, memo: '' });
        dropDraftsOf('c1');
        expect(Object.keys(useStepDraftStore.getState().drafts)).toEqual(['c2:LOADED']);
    });
});
