import { describe, it, expect } from 'vitest';
import type { JoinMeReply } from '@onedal/shared';
import {
    AGREEMENT_ITEMS, JOIN_STEPS, APP_STEPS, EMPTY_INFO,
    allRequiredAgreed, infoComplete, canProceed, nextOf, prevOf, stepFromQuery, toggleNetwork, agreementsFor, gateDecision,
} from './joinFlow';

/** 📝 가입 단계 흐름 — 동의를 다 안 하면 못 넘어가고, 필수 칸이 비면 못 넘어가고, 단계는 순서대로만 · 로그인 뒤 문지기는 문이 안 되면 통과 */
describe('가입 단계 흐름', () => {
    const allAgreed = Object.fromEntries(AGREEMENT_ITEMS.map(i => [i.key, true]));

    it('필수 동의가 하나라도 빠지면 다음으로 못 간다', () => {
        for (const item of AGREEMENT_ITEMS.filter(i => i.required)) {
            const one = { ...allAgreed, [item.key]: false };
            expect(allRequiredAgreed(one)).toBe(false);
            expect(canProceed('agree', { agreed: one, info: EMPTY_INFO })).toBe(false);
        }
        expect(canProceed('agree', { agreed: allAgreed, info: EMPTY_INFO })).toBe(true);
    });

    it('가입 정보는 연락처 · 배차망이 있어야 한다 — 차종 · 지역 · 유튜브 칸은 없다', () => {
        const full = { phone: '010-0000-0000', dispatchNetworks: ['insung' as const] };
        expect(infoComplete(full)).toBe(true);
        expect(infoComplete({ ...full, phone: ' ' })).toBe(false);
        expect(infoComplete({ ...full, dispatchNetworks: [] })).toBe(false);
        expect(Object.keys(EMPTY_INFO).sort()).toEqual(['dispatchNetworks', 'phone']);
        expect(canProceed('info', { agreed: allAgreed, info: full })).toBe(true);
    });

    it('단계는 순서대로 — 끝에서는 다음이 없고 처음에서는 이전이 없다', () => {
        expect(nextOf(JOIN_STEPS, 'agree')).toBe('info');
        expect(nextOf(JOIN_STEPS, 'info')).toBe('done');
        expect(nextOf(JOIN_STEPS, 'done')).toBeNull();
        expect(prevOf(JOIN_STEPS, 'agree')).toBeNull();
        expect(prevOf(APP_STEPS, 'pair')).toBe('install');
    });

    it('주소의 step 이 없거나 모르는 값이면 첫 단계다 — 다른 단계를 대신 보이지 않는다', () => {
        expect(stepFromQuery(JOIN_STEPS, null)).toBe('agree');
        expect(stepFromQuery(JOIN_STEPS, 'nope')).toBe('agree');
        expect(stepFromQuery(JOIN_STEPS, 'info')).toBe('info');
        expect(stepFromQuery(APP_STEPS, 'pair')).toBe('pair');
    });

    it('배차망은 여러 개 고를 수 있고 다시 누르면 빠진다', () => {
        expect(toggleNetwork([], 'insung')).toEqual(['insung']);
        expect(toggleNetwork(['insung'], 'hwamul24')).toEqual(['insung', 'hwamul24']);
        expect(toggleNetwork(['insung', 'hwamul24'], 'insung')).toEqual(['hwamul24']);
    });

    it('서버로 보내는 동의는 글이 있는 종류의 판만 — 글이 없으면 보내지 않는다(글이 비어도 흐름이 돈다)', () => {
        const c = { kind: 'terms' as const, title: '약관', body: '…', version: 3, updatedAt: '' };
        expect(agreementsFor({ terms: c, privacy: null })).toEqual([{ kind: 'terms', version: 3 }]);
        expect(agreementsFor({})).toEqual([]);
    });
});

describe('🚪 로그인 뒤 문지기(gateDecision)', () => {
    const me = (p: Partial<JoinMeReply>): JoinMeReply => ({
        approvedAt: '2026-09-01T00:00:00Z', suspendedAt: null, suspendAfterActive: false, withdrawnAt: null, paidUntil: null,
        blocked: false, info: null, agreed: [], reconsent: [], ...p,
    });
    it('🔴 문이 안 되면(옛 서버 · 장애 · 회원 줄 없음) 통과 — 기사님 운행을 막지 않는다', () => {
        expect(gateDecision(null, true)).toBe('ok');
        expect(gateDecision(null, false)).toBe('ok');
        expect(gateDecision(me({ blocked: true }), true)).toBe('ok');
    });
    it('승인 전은 승인 대기 · 막힘은 멈춤 · 탈퇴는 멈춤', () => {
        expect(gateDecision(me({ approvedAt: null, blocked: true }), false)).toBe('pending');
        expect(gateDecision(me({ blocked: true, suspendedAt: '2026-09-30T00:00:00Z' }), false)).toBe('blocked');
        expect(gateDecision(me({ withdrawnAt: '2026-09-30T00:00:00Z', blocked: true }), false)).toBe('blocked');
        expect(gateDecision(me({}), false)).toBe('ok');
    });
    it('🔴 다시 동의할 글이 있어도 화면을 옮기지 않는다(ok) — 띠 한 줄은 me.reconsent 사실로 따로 그린다', () => {
        expect(gateDecision(me({ reconsent: ['terms'] }), false)).toBe('ok');
    });
});
