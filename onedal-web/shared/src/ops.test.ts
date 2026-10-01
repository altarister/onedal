import { describe, it, expect } from 'vitest';
import { GRACE_DAYS, accountBlocked, opsMemberStatus } from './ops';

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

    it('🔴 «끝난 뒤» 정지와 기한 지남은 진행 중 콜이 있으면 아직 막지 않는다 — 중간에 끊으면 안전취소가 멈춘다', () => {
        const after = { ...base, suspendedAt: '2026-10-01T01:00:00Z', suspendAfterActive: true };   // 오늘(한국 10시) 건 정지
        expect(accountBlocked(after, TODAY, true)).toBe(false);
        expect(accountBlocked(after, TODAY, false)).toBe(true);
        expect(opsMemberStatus(after, TODAY, true).text).toBe('정지 (진행 중 콜 끝난 뒤)');
        const expired = { ...base, paidUntil: '2026-09-30' };
        expect(accountBlocked(expired, TODAY, true)).toBe(false);
        expect(accountBlocked(expired, TODAY, false)).toBe(true);
    });
    it('즉시 정지 · 승인 전 · 탈퇴는 진행 중 콜이 있어도 막는다', () => {
        expect(accountBlocked({ ...base, suspendedAt: '2026-09-30T00:00:00Z' }, TODAY, true)).toBe(true);
        expect(accountBlocked({ ...base, approvedAt: null }, TODAY, true)).toBe(true);
        expect(accountBlocked({ ...base, withdrawnAt: '2026-09-30T00:00:00Z' }, TODAY, true)).toBe(true);
    });

    /**
     * 🔴 **봐주는 것은 그날까지** (기획 29 3단계 · 27 Q5 «결재 안 한 콜이 남아도 영업일이 바뀌면 멈춤» · onedal-69).
     *    진행 중 콜 하나로 «끝난 뒤 정지»가 끝없이 미뤄지지 않게 — 정지 건 한국 날이 지나면 콜이 있어도 막는다.
     *    유료 기한도 같은 상한 — 기한 다음 날까지만 진행 중 콜을 봐준다.
     */
    it('🔴 «끝난 뒤» 정지 — 같은 날 진행 중이면 통과 · 다음 날이면 진행 중이어도 막힘', () => {
        const yesterday = { ...base, suspendedAt: '2026-09-30T05:00:00Z', suspendAfterActive: true };
        expect(accountBlocked(yesterday, TODAY, true)).toBe(true);
        expect(opsMemberStatus(yesterday, TODAY, true).text).toBe('정지 (끝난 뒤)');
    });
    it('🔴 날은 한국 날로 — UTC 앞 10자가 어제여도 한국으로 오늘이면 같은 날 · 서버 지역 시각 글자도', () => {
        expect(accountBlocked({ ...base, suspendedAt: '2026-09-30T15:30:00Z', suspendAfterActive: true }, TODAY, true)).toBe(false);   // 한국 10-01 00:30
        expect(accountBlocked({ ...base, suspendedAt: '2026-10-01 00:30:00', suspendAfterActive: true }, TODAY, true)).toBe(false);    // SQLite localtime(한국)
        expect(accountBlocked({ ...base, suspendedAt: '2026-09-30 23:59:00', suspendAfterActive: true }, TODAY, true)).toBe(true);
    });
    it('🔴 유료 기한 — 기한 다음 날까지 진행 중이면 통과 · 그다음 날부터 진행 중이어도 막힘', () => {
        expect(accountBlocked({ ...base, paidUntil: '2026-09-30' }, TODAY, true)).toBe(false);
        expect(accountBlocked({ ...base, paidUntil: '2026-09-29' }, TODAY, true)).toBe(true);
    });
});
