import { describe, it, expect } from 'vitest';
import { GRACE_DAYS, opsMemberStatus } from './ops';

/** 회원 상태는 사실 칸에서만 — 서버는 blocked 만 읽고, 글은 화면 몫 (reviews/29 · 기한 지나면 자동 정지 · 14일 유예 · 탈퇴는 관리자 손) */
const base = { approvedAt: '2026-09-01T09:00:00.000Z', suspendedAt: null, suspendAfterActive: false, withdrawnAt: null, paidUntil: null };
const TODAY = '2026-10-01';

describe('회원 상태 — 사실 칸에서 글과 blocked 를 만든다', () => {
    it('승인되고 기한이 없으면 사용 중 · 안 막힘', () => {
        expect(opsMemberStatus(base, TODAY)).toEqual({ blocked: false, text: '사용 중', tone: 'ok' });
    });
    it('승인 전 · 정지 · 탈퇴는 막힘', () => {
        expect(opsMemberStatus({ ...base, approvedAt: null }, TODAY)).toMatchObject({ blocked: true, text: '승인 대기' });
        expect(opsMemberStatus({ ...base, suspendedAt: '2026-09-30T00:00:00Z' }, TODAY)).toMatchObject({ blocked: true, text: '정지' });
        expect(opsMemberStatus({ ...base, suspendedAt: '2026-09-30T00:00:00Z', suspendAfterActive: true }, TODAY)).toMatchObject({ blocked: true, text: '정지 (끝난 뒤)' });
        expect(opsMemberStatus({ ...base, withdrawnAt: '2026-09-30T00:00:00Z', suspendedAt: '2026-09-30T00:00:00Z' }, TODAY)).toMatchObject({ blocked: true, text: '탈퇴' });
    });
    it('🔴 기한이 어제면 자동 정지 — blocked 참 · «정지 · 유예 D+1»', () => {
        expect(opsMemberStatus({ ...base, paidUntil: '2026-09-30' }, TODAY)).toEqual({ blocked: true, text: '정지 · 유예 D+1', tone: 'bad', graceDay: 1 });
    });
    it('기한이 오늘이면 아직 사용 중', () => {
        expect(opsMemberStatus({ ...base, paidUntil: TODAY }, TODAY).blocked).toBe(false);
    });
    it(`유예 ${GRACE_DAYS}일을 넘기면 «탈퇴 처리 필요» — 탈퇴는 관리자 손이라 함수가 탈퇴로 바꾸지 않는다`, () => {
        const r = opsMemberStatus({ ...base, paidUntil: '2026-09-01' }, TODAY);
        expect(r.blocked).toBe(true);
        expect(r.text).toBe('정지 · 유예 끝 — 탈퇴 처리 필요');
        expect(r.graceDay).toBe(30);
    });
});
