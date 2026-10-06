import { describe, it, expect } from 'vitest';
import { phoneLinkBadgeOf, isModeApplying } from './index';

/**
 * 📶 **폰 칸 연결 배지 · 모드 «적용중»** (reviews/50 ①-4 · 기사님 «나: 값마다 한 길» · «가: 적용중 고침»).
 * 배지는 문제일 때만 하나 · 뿌리부터. 적용중은 «서버가 보내는 모드가 블루투스로 아직 안 닿음»만 — 일부러 내려간 알람은 배지가 말한다.
 * 못 잡는 것: 화면에 실제로 그려지는지(관제웹 소스 검사 · pnpm shot) · 원달앱이 그 칸을 실제로 싣는지(원달앱 검사).
 */
describe('📶 연결 배지 — 차례', () => {
    const all = { bleSameServer: false, nearbyPermitted: false, bleUnlinkedWhy: 'TOKEN_REVOKED', supplyLinked: false, filterStale: true, batteryExempt: false };
    it('🔴 뿌리부터 하나 — 다른 서버 > 허락 없음 > 연결 풀림 > 관제앱과 끊김 > 필터 옛 판 > 배터리', () => {
        const order = ['bleSameServer', 'nearbyPermitted', 'bleUnlinkedWhy', 'supplyLinked', 'filterStale', 'batteryExempt'] as const;
        const want = ['다른 서버를 봄', '블루투스 허락 없음', '폰 연결 풀림', '관제앱과 끊김 · 알람만', '필터 옛 판', '배터리 최적화 중'];
        let d: Record<string, unknown> = { ...all };
        order.forEach((k, i) => {
            expect(phoneLinkBadgeOf(d as any)?.text, k).toBe(want[i]);
            d = { ...d, [k]: k === 'bleUnlinkedWhy' ? null : k === 'filterStale' ? false : true };
        });
        expect(phoneLinkBadgeOf(d as any)).toBeNull();
    });
    it('🔴 블루투스 받기 전 원달앱(서버가 거절)이면 맨 앞 «원달앱 새로 깔기 필요»', () => {
        expect(phoneLinkBadgeOf({ appTooOld: true, bleSameServer: false })?.text).toBe('원달앱 새로 깔기 필요');
    });
    it('옛 원달앱(칸 없음)은 아무것도 안 그린다', () => {
        expect(phoneLinkBadgeOf({})).toBeNull();
    });
    it('관제앱과 끊김 · 필터 옛 판 설명에 «끄려면 로그아웃»', () => {
        expect(phoneLinkBadgeOf({ supplyLinked: false })?.hint).toContain('끄려면 로그아웃');
    });
});

describe('🎛️ 모드 «적용중» — 블루투스로 아직 안 닿음만', () => {
    it('🔴 새 원달앱 — 보냄 = 받음이면 아님 · 다르면 적용중 · 공급이 끊겼거나 꺼진 폰(sentMode 없음)이면 아님', () => {
        expect(isModeApplying({ suppliedMode: 'AUTO', sentMode: 'AUTO', supplyLinked: true, appliedMode: 'ALARM', mode: 'AUTO' })).toBe(false);
        expect(isModeApplying({ suppliedMode: 'ALARM', sentMode: 'AUTO', supplyLinked: true })).toBe(true);
        expect(isModeApplying({ suppliedMode: 'ALARM', sentMode: 'AUTO', supplyLinked: false })).toBe(false);
        expect(isModeApplying({ suppliedMode: 'ALARM', mode: 'AUTO', appliedMode: 'ALARM' })).toBe(false);
    });
    it('옛 원달앱(suppliedMode 없음)은 옛 셈 그대로 — 명령 ↔ 도는 모드', () => {
        expect(isModeApplying({ mode: 'AUTO', appliedMode: 'ALARM' })).toBe(true);
        expect(isModeApplying({ mode: 'AUTO', appliedMode: 'AUTO' })).toBe(false);
    });
});
