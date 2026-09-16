import { registerPlugin } from '@capacitor/core';
import { isNativeApp } from './serverTarget';
import { telHref } from './routeUtils';

/**
 * 📞 **전화 걸기 한 곳** — 화면마다 `tel:` 링크를 달던 것을 여기로 모았다.
 *
 * 🔴 관제앱에서는 **누르면 바로 걸린다** (`DirectCallPlugin` · `ACTION_CALL`).
 *    웹 브라우저에서는 그런 길이 없어 `tel:` 로 떨어진다 — 브라우저가 다이얼러를 연다.
 * 🔴 플러그인이 실패해도 **`tel:` 로 다시 시도한다** — 전화를 아예 못 거는 것이 더 큰 사고다.
 */
interface DirectCallPlugin {
    dial(options: { number: string }): Promise<{ direct: boolean }>;
}
const DirectCall = registerPlugin<DirectCallPlugin>('DirectCall');

/** 그 번호로 건다. 번호가 없으면 아무 일도 안 한다 */
export function callNow(phone?: string | null): void {
    const href = telHref(phone);
    if (!href) return;
    if (!isNativeApp()) {
        window.location.href = href;
        return;
    }
    DirectCall.dial({ number: href.slice('tel:'.length) }).catch(() => {
        window.location.href = href;
    });
}
