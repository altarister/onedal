import { useEffect, useMemo, useState } from 'react';
import { deckOfCycle, type SecuredOrder } from '@onedal/shared';
import { useTheme } from '../../contexts/ThemeContext';
import { getAddressLabel } from '../../lib/routeUtils';
import { callsInView, countsByView, FINISHED_TABS, type CallView } from '../../lib/finishedCalls';

/**
 * ☰ **왼쪽 서랍 — 끝난 콜이 사는 자리** (기사님 확정)
 *
 * ── 왜 생겼나 ──
 *
 * 새 화면(지도 배경 + 3단 시트)에는 옛 화면의 **탭 줄**이 없다. 그 탭이
 * «완료됨 · 취소 · 방출»을 보는 유일한 자리였다. 현황판에도 같은 목록이 있지만
 * 곁 패널은 폭 1018px 이상에서만 떠서 **폰에서는 안 보인다** (`useSidePanelRoom`).
 *
 * 기사님: *"header영역에 버튼 하나 만들고 그걸 클릭하면 팝업으로"* ·
 *         *"왼쪽에서 나오는 서랍 좋아 … 기준 레이아웃이 되는거니 구조적으로 잘 생각하고"* ·
 *         *"예전처럼 탭 셋으로"*
 *
 * 생김새를 정한 자리는 `/mockup/drawer` 다 (`pages/DrawerMockup.tsx`).
 *
 * ── 규칙 ──
 *
 * 🔴 **거르는 규칙은 `lib/finishedCalls` 한 벌**이다 — 옛 화면 탭도 같은 것을 부른다 (규칙 ③).
 * 🔴 **끝난 콜은 콜 카드로 그리지 않는다.** `PinnedRouteCard` 에는 결재 버튼과 단계 시트가
 *    들어 있어 끝난 콜에는 맞지 않다 — 한 줄 요약만 그린다.
 * 🔴 **곁 패널(현황판)은 덮지 않는다.** 서랍은 관제 영역 안에서만 깔린다 —
 *    현황판은 곁에서 지켜보는 판이라 가리면 지금 무슨 일이 일어나는지를 놓친다.
 *    (그래서 이 컴포넌트는 `absolute` 이고, 자리를 잡는 것은 감싸는 쪽이다)
 */

type Props = {
    open: boolean;
    onClose: () => void;
    activeRoute: SecuredOrder[];
};

type FinishedTab = Exclude<CallView, 'ACTIVE' | 'ALL'>;

const won = (n?: number | null) =>
    n == null ? '—' : `${(n / 10000).toFixed(1)}만`;

/** 끝난 시각 — 없으면 «—». 🔴 0 이나 지금 시각으로 지어내지 않는다 (규칙 ④) */
const clockOf = (c: SecuredOrder): string => {
    const raw = c.terminatedAt ?? c.capturedAt;
    if (!raw) return '—';
    const d = new Date(raw);
    return Number.isNaN(d.getTime())
        ? '—'
        : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** 왜 끝났나 — 한 마디. 상태값을 그대로 보이면 기사님이 읽을 말이 아니다 */
const whyOf = (c: SecuredOrder): string => {
    switch (c.status) {
        case 'SAFE_CANCEL': return '안전취소';
        case 'ORDER_RELEASED_BY_ME': return '내가 방출';
        case 'ORDER_RELEASED_BY_OFFICE': return '사무실이 뺌';
        case 'ORDER_DELIVERED': return '하차 완료';
        default: return c.status ?? '—';
    }
};

export default function Drawer({ open, onClose, activeRoute }: Props) {
    const { theme, setTheme } = useTheme();
    const [tab, setTab] = useState<FinishedTab>('COMPLETED');

    /** 🔴 `deckOfCycle` 은 순수 함수다 — 무거운 파생 훅을 여기서 또 부르지 않는다 */
    const cycleDeckIds = useMemo(
        () => new Set(deckOfCycle(activeRoute ?? []).map(c => c.id)),
        [activeRoute],
    );
    const counts = useMemo(() => countsByView(activeRoute ?? [], cycleDeckIds), [activeRoute, cycleDeckIds]);
    const rows = useMemo(() => callsInView(activeRoute ?? [], tab, cycleDeckIds), [activeRoute, tab, cycleDeckIds]);

    /** ⌨️ Esc 로도 닫는다 — 열려 있을 때만 듣는다 */
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    return (
        <>
            {/* 바깥 — 눌러서 닫는다. 🔴 닫혀 있을 때는 누름을 안 받는다(pointer-events-none) */}
            <div
                onClick={onClose}
                aria-hidden
                className={`absolute inset-0 z-40 bg-black/50 transition-opacity duration-200
                            ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            />
            <aside
                aria-hidden={!open}
                className={`absolute left-0 top-0 bottom-0 z-50 w-[280px] max-w-[85%]
                            bg-surface border-r border-border-card shadow-2xl
                            flex flex-col transition-transform duration-200
                            ${open ? 'translate-x-0' : '-translate-x-full'}`}
            >
                <div className="flex items-center justify-between px-4 py-3 border-b border-border-card">
                    <span className="text-[13px] font-black text-text-primary">📋 끝난 콜</span>
                    <button onClick={onClose} aria-label="닫기"
                        className="w-7 h-7 flex items-center justify-center rounded-lg
                                   text-text-muted hover:text-text-primary active:scale-95 transition">
                        ✕
                    </button>
                </div>

                {/* 탭 셋 — 기사님 «예전처럼 탭 셋으로» */}
                <div className="flex border-b border-border-card">
                    {FINISHED_TABS.map(t => (
                        <button key={t.key} onClick={() => setTab(t.key)}
                            className={`flex-1 py-2 text-[11px] font-bold transition-colors
                                        ${tab === t.key
                                            ? 'text-text-primary border-b-2 border-info'
                                            : 'text-text-muted hover:text-text-primary'}`}>
                            {t.label} {counts[t.key]}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto">
                    {rows.length === 0 && (
                        <div className="px-4 py-6 text-[12px] text-text-muted">— 없다</div>
                    )}
                    {rows.map(c => (
                        <div key={c.id} className="px-4 py-2.5 border-b border-border-card">
                            <div className="flex items-baseline justify-between gap-2">
                                <span className="text-[13px] font-bold text-text-primary truncate">
                                    {FINISHED_TABS.find(t => t.key === tab)?.mark}{' '}
                                    {getAddressLabel(c.pickup) || '—'} → {getAddressLabel(c.dropoff) || '—'}
                                </span>
                                <span className="text-[12px] font-bold tabular-nums text-text-muted shrink-0">
                                    {won(c.fare)}
                                </span>
                            </div>
                            <div className="flex items-baseline justify-between gap-2 mt-0.5">
                                <span className="text-[10px] text-text-muted">{whyOf(c)}</span>
                                <span className="text-[10px] tabular-nums text-text-muted">{clockOf(c)}</span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* 발 — 앞으로 늘어날 자리 */}
                <div className="border-t border-border-card px-4 py-3">
                    {/**
                      * 🌓 **화면 밝기는 «고르는» 것이다 — 누를 때마다 뒤집히지 않는다.**
                      *    🔴 여기가 밝기를 바꾸는 **유일한 자리**다(설정 창에는 없다).
                      *       🔴 헤더 로고에 두지 않는다 — 내 차 상태를 보려다 눌러 화면이 뒤집힌다.
                      *    🔴 토글이면 «지금 무엇인지»를 화면이 말하지 않아, 누르기 전에는 알 수 없다.
                      *       둘을 나란히 놓고 지금 것을 눌러 둔 채로 보인다 (먼발치에서 1~2초에 읽힌다).
                      */}
                    <div className="text-[10px] font-bold text-text-muted mb-1.5">화면 밝기</div>
                    <div className="flex gap-1.5">
                        {([
                            { key: 'light', label: '🌞 밝게' },
                            { key: 'dark', label: '🌙 어둡게' },
                        ] as const).map(t => (
                            <button key={t.key} onClick={() => setTheme(t.key)}
                                aria-pressed={theme === t.key}
                                className={`flex-1 h-9 rounded-lg text-[12px] font-bold transition-colors border
                                            ${theme === t.key
                                                ? 'bg-info text-white border-info'
                                                : 'bg-surface-alt text-text-muted border-border-card hover:text-text-primary'}`}>
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>
            </aside>
        </>
    );
}
