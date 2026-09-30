import { describe, it, expect } from 'vitest';
import {
    AGREEMENT_ITEMS, JOIN_STEPS, APP_STEPS, EMPTY_INFO,
    allRequiredAgreed, infoComplete, canProceed, nextOf, prevOf, stepFromQuery, toggleNetwork,
} from './joinFlow';

/** 📝 가입 단계 흐름 — 동의를 다 안 하면 못 넘어가고, 필수 칸이 비면 못 넘어가고, 단계는 순서대로만 */
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

    it('가입 정보는 차종 · 연락처 · 배차망 · 지역이 있어야 하고 유튜브 채널명은 비어도 된다', () => {
        const full = { vehicle: '1t', phone: '010-0000-0000', networks: ['인성'], region: '광주 · 이천', youtubeChannel: '' };
        expect(infoComplete(full)).toBe(true);
        expect(infoComplete({ ...full, vehicle: '' })).toBe(false);
        expect(infoComplete({ ...full, phone: ' ' })).toBe(false);
        expect(infoComplete({ ...full, networks: [] })).toBe(false);
        expect(infoComplete({ ...full, region: '' })).toBe(false);
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
        expect(toggleNetwork([], '인성')).toEqual(['인성']);
        expect(toggleNetwork(['인성'], '화물24시')).toEqual(['인성', '화물24시']);
        expect(toggleNetwork(['인성', '화물24시'], '인성')).toEqual(['화물24시']);
    });
});
