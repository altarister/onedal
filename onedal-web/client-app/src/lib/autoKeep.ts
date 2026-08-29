import { logRoadmapEvent } from './roadmapLogger';

/**
 * 🤖 **자동 결재 — 리허설을 «사람 없이» 돌려 보는 개발 전용 손** (2026-08-29)
 *
 * 기사님: *"임시짝을 만들지 말고 localhost:3000 에 스크립트를 넣어서 직접 킵해서 로그 남겨.
 * 내가 화면은 보고 있을게."*
 *
 * 리허설(`pnpm rehearsal`)은 앱폰 역할만 한다 — 결재는 사람이 이 화면에서 누른다.
 * 검증하려면 그 누르는 쪽이 필요한데, **별도 소켓 클라이언트를 띄우면 화면 밖에서
 * 벌어져 기사님이 볼 수가 없다.** 그래서 관제웹 자신이 누르게 한다.
 *
 * 🔴 **콜의 주인은 기사님이다** (규칙 ①). 그래서 세 겹으로 막는다:
 *   ① `import.meta.env.DEV` — 실 빌드에는 **코드가 들어가지도 않는다**
 *   ② URL 에 `?autokeep=1` 이 있어야 켜진다 — 켜는 것은 매번 명시적이다
 *   ③ 화면 좌상단에 **빨간 배지**를 띄운다 — 켜진 줄 모르고 쓰는 일이 없게
 *
 * 누른 것은 `logRoadmapEvent` 로 남는다 → 서버 로그 파일까지 간다 (`POST /api/logs`).
 */

export type AutoKeepAction = 'ORDER_CONFIRMED' | 'SAFE_CANCEL';

/** 켜져 있나 — 개발 빌드 + URL 플래그, 둘 다여야 한다 */
export function autoKeepEnabled(): boolean {
    if (!import.meta.env.DEV) return false;
    try {
        return new URLSearchParams(window.location.search).get('autokeep') === '1';
    } catch {
        return false;
    }
}

/**
 * 몇 번째 콜까지 «상차 완료»까지 눌러 줄 것인가.
 * `?autokeep=1&loaded=1` → 첫 콜만 상차 완료 (리허설 17번 조건).
 */
export function autoKeepLoadedCount(): number {
    try {
        const n = Number(new URLSearchParams(window.location.search).get('loaded'));
        return Number.isFinite(n) && n > 0 ? n : 0;
    } catch {
        return 0;
    }
}

/** 화면에 «켜져 있다»를 못박는 배지 — 모르고 쓰는 것을 막는다 */
export function mountAutoKeepBadge(): void {
    if (!autoKeepEnabled() || document.getElementById('autokeep-badge')) return;
    const el = document.createElement('div');
    el.id = 'autokeep-badge';
    el.textContent = `🤖 자동 결재 ON — 뜨는 콜을 자동으로 KEEP 합니다`;
    el.style.cssText = [
        'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:99999',
        'background:#dc2626', 'color:#fff', 'font-weight:700', 'font-size:12px',
        'text-align:center', 'padding:4px 8px', 'letter-spacing:0.02em',
    ].join(';');
    document.body.appendChild(el);
}

/** 결재 한 번 — 무엇을 왜 눌렀는지 로그에 남긴다 (서버 파일까지 간다) */
export function logAutoKeep(orderId: string, action: AutoKeepAction, why: string): void {
    logRoadmapEvent('웹', `🤖 [자동 결재] ${action} — ${why} (${orderId.slice(-8)})`, '관제대시보드');
}
