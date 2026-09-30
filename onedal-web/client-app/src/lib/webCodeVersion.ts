import { logRoadmapEvent } from './roadmapLogger';

/**
 * 🖥️ **관제웹 코드 판** (기사님 «새로고침을 나에게 묻지 말고 너가 코드로 확인해» · onedal-1f «가»).
 * 소켓이 붙을 때마다 «판(뜰 때의 커밋) · 로드 시각 · 마지막 핫 교체(시각·파일)»를 서버 로그로 알린다 —
 * 개발 서버(3000)는 커밋이 뜬 뒤에 생기므로 핫 교체 시각·파일로 «그 창이 그 파일의 새 코드인가»를 가른다.
 * 🔄 훅을 가진 파일이 핫 교체되면 옛 상태가 남을 수 있어(«Should have a queue») 스스로 한 번 다시 읽는다 —
 *    판정 중 콜이 있거나 ⚪ 가 떠 있으면 미루고, 자리가 비면 그때 읽는다. 배포 빌드에는 핫 교체가 없어 이 길이 없다.
 */
declare const __WEB_COMMIT__: string;

type Hot = { at: Date; files: string[] };
const hhmmss = (d: Date) => [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');

export function codeVersionLine(v: { commit: string; loadedAt: Date; lastHot: Hot | null }): string {
    const hot = v.lastHot ? `${hhmmss(v.lastHot.at)} ${v.lastHot.files.join(', ')}` : '없음';
    return `🖥️ [관제웹 코드] 판 ${v.commit} · 로드 ${hhmmss(v.loadedAt)} · 마지막 핫 교체 ${hot}`;
}

/** 훅을 가진 파일인가 — 부품(.tsx)과 hooks/ 는 훅 모양이 바뀔 수 있다. 순수 lib(.ts)은 아니다 (바뀐 파일 이름으로 가른다) */
export function needsReload(paths: string[]): boolean {
    return paths.some(p => p.endsWith('.tsx') || p.includes('/hooks/'));
}

/** 다시 읽을 때 — 미룬 것이 있고 평가 자리가 비었으면 지금 · 차 있으면 미룬다 */
export function reloadDecision(s: { pending: boolean; seatBusy: boolean }): 'now' | 'defer' | 'none' {
    return !s.pending ? 'none' : s.seatBusy ? 'defer' : 'now';
}

const state = { loadedAt: new Date(), lastHot: null as Hot | null, pending: false, seatBusy: false };
const commit = typeof __WEB_COMMIT__ === 'string' ? __WEB_COMMIT__ : 'unknown';

/** 소켓이 붙을 때 한 줄 */
export function reportWebCode(): void {
    logRoadmapEvent('통신', '웹', codeVersionLine({ commit, loadedAt: state.loadedAt, lastHot: state.lastHot }), '관제대시보드');
}

function reloadIfDue(): void {
    const d = reloadDecision(state);
    if (d !== 'now') return;
    logRoadmapEvent('통신', '웹', `🖥️ [관제웹 코드] 훅 모양 바뀜 — 다시 읽음 (${state.lastHot?.files.join(', ') ?? ''})`, '관제대시보드');
    state.pending = false;
    setTimeout(() => location.reload(), 300);   // 로그가 서버로 갈 틈
}

/** 평가 자리(판정 중 콜 · ⚪)가 차 있나 — 무대가 알려 준다. 비는 순간 미룬 다시 읽기를 한다 */
export function setSeatBusyForReload(busy: boolean): void {
    state.seatBusy = busy;
    reloadIfDue();
}

/** 개발 서버에서만 — 핫 교체마다 한 줄 · 훅 파일이면 다시 읽기 예약 */
export function installWebCodeWatch(): void {
    const hot = (import.meta as unknown as { hot?: { on: (ev: string, cb: (p: { updates?: Array<{ path: string }> }) => void) => void } }).hot;
    if (!hot) return;
    hot.on('vite:afterUpdate', payload => {
        const paths = (payload.updates ?? []).map(u => u.path);
        if (paths.length === 0) return;
        state.lastHot = { at: new Date(), files: paths.map(p => p.split('/').pop() ?? p) };
        logRoadmapEvent('통신', '웹', `🖥️ [관제웹 코드] 핫 교체 ${state.lastHot.files.join(', ')} · ${hhmmss(state.lastHot.at)}`, '관제대시보드');
        if (needsReload(paths)) {
            state.pending = true;
            if (reloadDecision(state) === 'defer') logRoadmapEvent('통신', '웹', `🖥️ [관제웹 코드] 훅 모양 바뀜 — 평가 자리가 비면 다시 읽음`, '관제대시보드');
            reloadIfDue();
        }
    });
}
