// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

/**
 * 👀 **미리보기 칸은 눌러도 결재가 안 나간다** (기사님: *"미리보기는 스캔앱이 주도하는 콜이라 보여지는 것뿐 — 관제앱에서 닫지 않는다"*).
 * 닫히는 것은 스캔폰이 알린 사실(상세 이탈 · 수락 · 끊김)뿐이다 — 서버 clearPreview.
 * 🔴 소스를 안 읽는다 — 결재석을 실제로 그리고 그 칸을 눌러 `onDecision` 이 불리나 본다.
 * 못 잡는 것: 서버가 폰 신호로 미리보기를 닫는지(서버 jest previewCleanup) · 폰에서 칸이 사라지는지(폰 시험 07be27).
 */
vi.mock('../../lib/socket', () => {
    const noop = () => {};
    const socket = { on: noop, off: noop, emit: noop, connected: false, connect: noop, disconnect: noop, auth: {}, io: { on: noop, off: noop } };
    return { socket, ensureSocketConnected: noop };
});

const PREVIEW = {
    id: 'pv1', type: 'AUTO', status: 'ORDER_AWAITING_DECISION', isPreview: true, targetApp: 'kakaopicker',
    pickup: '경기 성남시 수정구 신촌동', dropoff: '서울 광진구 자양2동', fare: 10830,
    capturedAt: '2026-10-22T07:51:39.000Z', timestamp: '2026-10-22T07:51:39.000Z',
    judgment: { color: '보통', score: 8, axes: [] },
};

describe('👀 결재석 미리보기 칸 — 누르기', () => {
    let host: HTMLDivElement;
    let root: ReturnType<typeof createRoot>;
    beforeEach(() => {
        (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
        host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
        vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    });
    afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

    it('🔴 미리보기 칸을 눌러도 onDecision 이 안 불린다 — 칸도 그대로 남는다', async () => {
        const { ThemeProvider } = await import('@onedal/ui/theme');
        const { default: JudgmentSeat } = await import('./JudgmentSeat');
        const onDecision = vi.fn();
        act(() => root.render(
            <ThemeProvider><JudgmentSeat route={PREVIEW as never} confirmedActive={0} onDecision={onDecision} processingId={null} setProcessingId={() => {}} /></ThemeProvider>,
        ));
        const line = [...host.querySelectorAll('div')].find(d => d.textContent === '👀 미리보기 — 폰에서 수락 · 넘기기를 하시면 바뀝니다');
        expect(line).toBeTruthy();
        act(() => { line!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        act(() => { line!.parentElement!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
        expect(onDecision).not.toHaveBeenCalled();
        expect(host.textContent).toContain('폰에서 수락 · 넘기기를 하시면 바뀝니다');
    });
});
