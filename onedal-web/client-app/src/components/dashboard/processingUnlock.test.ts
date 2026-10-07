import { describe, it, expect } from 'vitest';
import { listenDecisionFailure } from '../../hooks/useProcessingLock';

/**
 * 🔓 **결재 버튼의 «처리 중...» 잠금은 결재가 실패로 돌아와도 풀린다** (`hooks/useProcessingLock` — 목록 · 판정석이 같이 쓴다 · D3 P6-02).
 * 콜 자료가 바뀌면 풀리지만, 서버가 실패로 답하면(결재 응답 success:false · 처리 실패 handler-error) 자료가 그대로라
 * 잠금이 남아 KEEP · 거절 버튼이 눌리지 않는다 — 실패 응답에서도 푼다.
 * 못 잡는 것: 훅이 이 함수를 효과에서 부르는 한 줄(관제웹 검사는 DOM 없이 돈다) · 자료가 바뀔 때 푸는 효과.
 */
function fakeSocket() {
    const hs = new Map<string, Set<(p: any) => void>>();
    return {
        on: (ev: string, h: (p: any) => void) => { if (!hs.has(ev)) hs.set(ev, new Set()); hs.get(ev)!.add(h); },
        off: (ev: string, h: (p: any) => void) => { hs.get(ev)?.delete(h); },
        fire: (ev: string, p: unknown) => hs.get(ev)?.forEach(h => h(p)),
        count: (ev: string) => hs.get(ev)?.size ?? 0,
    };
}

describe('결재 잠금 풀기', () => {
    it('🔴 결재 응답 실패 · 결재 처리 실패면 푼다', () => {
        const s = fakeSocket(); let n = 0;
        listenDecisionFailure(s, () => { n++; });
        s.fire('decision-ack', { success: false });
        s.fire('handler-error', { event: 'decision' });
        expect(n).toBe(2);
    });
    it('대조 — 결재 성공 · 다른 처리의 실패는 안 푼다(성공은 콜 자료가 바뀌어 풀린다)', () => {
        const s = fakeSocket(); let n = 0;
        listenDecisionFailure(s, () => { n++; });
        s.fire('decision-ack', { success: true });
        s.fire('handler-error', { event: 'mode' });
        expect(n).toBe(0);
    });
    it('🔴 끊으면 둘 다 더 듣지 않는다(부품이 내려갈 때 남지 않게)', () => {
        const s = fakeSocket();
        const off = listenDecisionFailure(s, () => {});
        expect([s.count('decision-ack'), s.count('handler-error')]).toEqual([1, 1]);
        off();
        expect([s.count('decision-ack'), s.count('handler-error')]).toEqual([0, 0]);
    });
});
