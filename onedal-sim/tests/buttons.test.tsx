// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { InseongCallDetailScreen, InseongOngoingDetailScreen } from '@altari/ui-simulators';
import { callA } from './fixtures';

/**
 * 👆 **인성 버튼을 눌렀을 때 무엇이 불리나** (2026-09-14 · docs/지금/시뮬레이터_화면과_버튼.md §1-3 · §4)
 *
 * 화면 글자 스냅숏은 **글자**만 본다 — 누른 뒤 무엇이 일어나는지는 못 본다. 그래서 따로 누른다.
 *
 * 기사님 (2026-09-14): *"탁송은 아무 일도 하지 않는다. 확정이 콜을 내 것으로 확정하는 거야"* ·
 * 확정(10)이 0 이 되면 리스트로 · 확정 전 상세의 취소도 리스트로 · 탁송은 다른 기능(아직 모른다).
 * 🔴 시뮬레이터는 탁송을 확정 전에는 «수락», 확정 페이지에서는 «배송 완료(잡은 콜에서 지움)»로 지어내 쓰고 있었다.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const mount = (el: ReactElement) => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => { root!.render(el); });
    return host;
};
afterEach(() => {
    act(() => { root?.unmount(); });
    host?.remove();
    root = null; host = null;
    vi.useRealTimers();
});
const button = (h: HTMLElement, label: RegExp) => {
    const found = [...h.querySelectorAll('button')].filter(b => label.test((b.textContent ?? '').trim()));
    if (found.length !== 1) throw new Error(`버튼 «${label}» 가 ${found.length}개다 — 하나여야 한다`);
    return found[0];
};
const press = (b: HTMLButtonElement) => act(() => { b.click(); });

describe('인성 상세 (확정 전)', () => {
    const setup = () => {
        const onAccept = vi.fn(); const onClose = vi.fn();
        const h = mount(<InseongCallDetailScreen call={callA} feedback={null} isConfirmed={false} onClose={onClose} onAccept={onAccept} />);
        return { h, onAccept, onClose };
    };

    it('「확정(10)」 — 콜을 내 것으로 (수락)', () => {
        const { h, onAccept, onClose } = setup();
        press(button(h, /^확정\(\d+\)$/));
        expect(onAccept).toHaveBeenCalledWith(callA);
        expect(onClose).not.toHaveBeenCalled();
    });

    it('「취소」 — 리스트로 (수락하지 않는다)', () => {
        const { h, onAccept, onClose } = setup();
        press(button(h, /^취소$/));
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onAccept).not.toHaveBeenCalled();
    });

    it('🔴 「탁송」 — 아무 일도 안 한다 (실물 기능을 모른다 · 지어내지 않는다)', () => {
        const { h, onAccept, onClose } = setup();
        press(button(h, /^탁송$/));
        expect(onAccept).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
    });

    it('10초 동안 안 누르면 리스트로 — 다른 기사가 가져갈 수 있는 페이지다', () => {
        vi.useFakeTimers();
        const { onAccept, onClose } = setup();
        for (let s = 0; s < 11; s++) act(() => { vi.advanceTimersByTime(1000); });
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onAccept).not.toHaveBeenCalled();
    });
});

describe('인성 확정 페이지', () => {
    const setup = () => {
        const onClose = vi.fn(); const onCancel = vi.fn(); const onConfirm = vi.fn();
        // 옛 «탁송 = 배송 완료» 가 부르던 onConfirm 도 넘겨 본다 — 불리면 안 된다
        const props = { call: callA, onClose, onCancel, onConfirm } as unknown as Parameters<typeof InseongOngoingDetailScreen>[0];
        const h = mount(<InseongOngoingDetailScreen {...props} />);
        return { h, onClose, onCancel, onConfirm };
    };

    it('「닫기」 — 리스트로 (원달앱의 KEEP)', () => {
        const { h, onClose, onCancel } = setup();
        press(button(h, /^닫기$/));
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onCancel).not.toHaveBeenCalled();
    });

    it('위쪽 「취소」 — 잡은 콜에서 뺀다 (원달앱의 취소)', () => {
        const { h, onCancel } = setup();
        press(button(h, /^취소$/));
        expect(onCancel).toHaveBeenCalledWith(callA);
    });

    it('🔴 「탁송」 — 아무 일도 안 한다 (잡은 콜을 지우지 않는다)', () => {
        const { h, onClose, onCancel, onConfirm } = setup();
        press(button(h, /^탁송$/));
        expect(onConfirm).not.toHaveBeenCalled();
        expect(onCancel).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
    });
});
