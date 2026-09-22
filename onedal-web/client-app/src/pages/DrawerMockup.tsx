import { useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';

/**
 * ☰ **왼쪽 서랍 목업 — 끝난 콜을 관제에서 빼서 여기로** (기사님 확정)
 *
 * ── 왜 필요한가 ──
 *
 * 새 화면(지도 배경 + 3단 시트)에는 **탭 줄**이 없다 — 폰에서 «완료됨 · 취소 · 방출»을 보는
 * 자리는 서랍뿐이다. 현황판에도 같은 목록이 있지만 곁 패널은 폭 1018px
 * 이상에서만 떠서 **폰에서는 안 보인다** (`useSidePanelRoom`).
 *
 * 기사님: *"관제에서 빼서 일단 현황판으로 완전 분리 가능한가?"* →
 *         *"header영역에 버튼 하나 만들고 그걸 클릭하면 팝업으로"* →
 *         *"왼쪽에서 나오는 서랍 좋아 근데 이건 기준 레이아웃 기준이 되는거니,
 *           구조적으로 잘 생각하고 만들어야 해"* · *"예전처럼 탭 셋으로"*
 *
 * ── 이 파일의 자리 ──
 *
 * 🔴 **목업이다. 고정값만 그리고 서버·소켓·GPS 를 안 쓴다** (`/mockup/sheet` 와 같은 규약).
 *    실물(`components/layout/Drawer`)은 `activeRoute` 에서 오는 진짜 콜을 쓰고, 탭 거르는 규칙은
 *    **순수 함수 한 벌**(`lib/finishedCalls`)이다 (규칙 ③ — 두 벌 금지).
 * 🔴 **색은 테마 토큰만 쓴다** — 원본 와이어프레임의 색을 그대로 옮기면
 *    밝은 테마에서 글자가 안 보인다.
 */

type Tab = 'COMPLETED' | 'CANCELED' | 'RELEASED';

type FinishedCall = {
    id: string;
    kind: Tab;
    pickup: string;
    dropoff: string;
    at: string;
    fare: number;
    /** 왜 끝났나 — 한 마디 */
    why: string;
};

/** 🔴 고정값이다 — 실물에서는 `activeRoute` 의 종료 콜이 들어온다 */
const FINISHED: FinishedCall[] = [
    { id: 'a', kind: 'COMPLETED', pickup: '문래동', dropoff: '상갈동', at: '12:15', fare: 35000, why: '하차 완료' },
    { id: 'b', kind: 'COMPLETED', pickup: '가산동', dropoff: '진위면', at: '11:03', fare: 30000, why: '하차 완료' },
    { id: 'c', kind: 'COMPLETED', pickup: '역삼동', dropoff: '평창동', at: '10:40', fare: 28000, why: '하차 완료' },
    { id: 'd', kind: 'COMPLETED', pickup: '구로동', dropoff: '오포읍', at: '09:52', fare: 41000, why: '하차 완료' },
    { id: 'e', kind: 'CANCELED', pickup: '송정동', dropoff: '고덕동', at: '14:22', fare: 32000, why: '안전취소 (30초 안)' },
    { id: 'f', kind: 'RELEASED', pickup: '양평동', dropoff: '안중읍', at: '13:40', fare: 38000, why: '내가 방출' },
];

const TABS: { key: Tab; label: string; mark: string }[] = [
    { key: 'COMPLETED', label: '완료됨', mark: '✅' },
    { key: 'CANCELED', label: '취소', mark: '❌' },
    { key: 'RELEASED', label: '방출', mark: '↩️' },
];

/** 진행 중 콜 — 시트에 그릴 고정값 */
const LIVE = [
    { id: 'p', name: '이천 합짐1콜', fare: '3.2만', at: '14:40', tone: 'text-info' },
    { id: 'q', name: '곤지암 합짐2콜', fare: '2.8만', at: '15:10', tone: 'text-success' },
];

const won = (n: number) => `${(n / 10000).toFixed(1)}만`;

export default function DrawerMockup() {
    const { theme, toggleTheme, setTheme } = useTheme();
    /**
     * 🔗 **주소로 상태를 연다** (`?open=1&tab=CANCELED&wide=1`).
     *    화면을 찍어 두고 보려면 «열린 그림»이 필요하고, 기사님께 링크로 한 장면을 바로 열어 드릴 수 있다.
     */
    const q = new URLSearchParams(window.location.search);
    const [open, setOpen] = useState(q.get('open') === '1');
    const [tab, setTab] = useState<Tab>((q.get('tab') as Tab) || 'COMPLETED');
    /** 🖥️ 곁 패널(현황판)이 붙은 넓은 화면을 흉내 낸다 — 서랍이 거기까지 덮지 않는 것을 본다 */
    const [wide, setWide] = useState(q.get('wide') === '1');

    const rows = FINISHED.filter(c => c.kind === tab);
    const countOf = (k: Tab) => FINISHED.filter(c => c.kind === k).length;

    return (
        <div className="min-h-dvh bg-bg-base text-text-primary p-4">
            {/* ── 조작 줄 — 목업에만 있다 ── */}
            <div className="max-w-5xl mx-auto mb-4 flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-black mr-2">☰ 서랍 목업</h1>
                <button onClick={() => setOpen(v => !v)}
                    className="h-8 px-3 rounded-lg bg-info text-white text-xs font-bold">
                    {open ? '서랍 닫기' : '서랍 열기'}
                </button>
                <button onClick={() => setWide(v => !v)}
                    className="h-8 px-3 rounded-lg bg-surface border border-border-card text-xs font-bold">
                    {wide ? '📱 폰 폭으로' : '🖥️ 현황판 붙은 폭으로'}
                </button>
                <button onClick={toggleTheme}
                    className="h-8 px-3 rounded-lg bg-surface border border-border-card text-xs font-bold">
                    {theme === 'dark' ? '🌞 밝게' : '🌓 어둡게'}
                </button>
                <span className="text-[11px] text-text-muted ml-1">
                    고정값만 그린다 · 서버·소켓·GPS 를 안 쓴다
                </span>
            </div>

            {/* ── 화면 흉내 ── */}
            <div className="max-w-5xl mx-auto flex gap-3">
                {/* 관제 영역 */}
                <div className={`relative overflow-hidden rounded-2xl border border-border-card bg-bg-base shadow-soft
                                 flex flex-col
                                 ${wide ? 'w-[42rem] shrink-0' : 'w-full max-w-[420px] mx-auto'}`}
                     style={{ height: 640 }}>

                    {/* 헤더 — ☰ 를 로고에서 떼어 앉힌다 */}
                    <header className="flex items-center justify-between px-3 py-2.5 border-b border-border-card bg-bg-base/95">
                        <div className="flex items-center gap-3">
                            {/* 🔴 로고와 12px 떨어뜨린다 — 로고는 테마 전환 버튼이라 붙이면 오탭한다 */}
                            <button onClick={() => setOpen(true)} aria-label="메뉴 열기"
                                className="shrink-0 w-9 h-9 -ml-1 flex items-center justify-center rounded-lg
                                           text-text-primary active:scale-95 transition-transform">
                                <span className="text-xl leading-none">☰</span>
                            </button>
                            <span className="flex items-baseline gap-1.5 whitespace-nowrap">
                                <span className="text-[17px] font-black">1t</span>
                                <span className="text-[12.5px] font-bold text-info">예약 2</span>
                                <span className="text-[12px] font-black tabular-nums text-text-muted">📦45/100</span>
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface">
                                <span className="w-1.5 h-1.5 rounded-full bg-success" />
                                <span className="text-xs font-mono font-bold text-text-muted">14:22</span>
                            </span>
                            <span className="w-7 h-7 rounded-full bg-info text-white text-xs font-bold
                                             flex items-center justify-center">김</span>
                        </div>
                    </header>

                    {/* 지도 자리 — 🔴 새 화면은 지도가 배경으로 꽉 차고 시트가 그 위에 뜬다 */}
                    <div className="relative flex-1 min-h-0 bg-surface-alt">
                        <div className="absolute inset-0 flex items-center justify-center text-text-muted text-sm font-bold">
                            지 도 (배경)
                        </div>
                        <span className="absolute left-[22%] top-[38%] text-lg">📍</span>
                        <span className="absolute right-[26%] bottom-[30%] text-lg">📍</span>
                    </div>

                    {/* 시트 */}
                    <div className="absolute left-0 right-0 bottom-0 z-10 rounded-t-2xl bg-surface border-t border-border-card
                                    shadow-[0_-4px_20px_rgba(0,0,0,0.15)] px-4 pt-2 pb-4"
                         style={{ height: 230 }}>
                        <div className="w-10 h-1 rounded-full bg-text-muted/40 mx-auto mb-3" />
                        <div className="text-[11px] font-bold text-text-muted mb-2">진행 중</div>
                        {LIVE.map(c => (
                            <div key={c.id} className="flex items-center justify-between py-2 border-b border-border-card last:border-0">
                                <span className={`text-[13px] font-bold ${c.tone}`}>{c.name}</span>
                                <span className="text-[12px] tabular-nums text-text-muted">{c.fare} · {c.at}</span>
                            </div>
                        ))}
                    </div>

                    {/* ══ 서랍 ══ */}
                    {/* 바깥 — 눌러서 닫는다. 🔴 관제 영역 안에서만 어둡게 한다 (현황판은 안 덮는다) */}
                    <div onClick={() => setOpen(false)}
                         className={`absolute inset-0 z-40 bg-black/50 transition-opacity duration-200
                                     ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} />
                    <aside
                        className={`absolute left-0 top-0 bottom-0 z-50 w-[280px] bg-surface border-r border-border-card
                                    shadow-2xl flex flex-col transition-transform duration-200
                                    ${open ? 'translate-x-0' : '-translate-x-full'}`}>
                        {/* 서랍 머리 */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-border-card">
                            <span className="text-[13px] font-black">📋 끝난 콜</span>
                            <button onClick={() => setOpen(false)} aria-label="닫기"
                                className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted active:scale-95">
                                ✕
                            </button>
                        </div>

                        {/* 탭 셋 — 기사님 «예전처럼 탭 셋으로» */}
                        <div className="flex border-b border-border-card">
                            {TABS.map(t => (
                                <button key={t.key} onClick={() => setTab(t.key)}
                                    className={`flex-1 py-2 text-[11px] font-bold transition-colors
                                                ${tab === t.key
                                                    ? 'text-text-primary border-b-2 border-info'
                                                    : 'text-text-muted hover:text-text-primary'}`}>
                                    {t.label} {countOf(t.key)}
                                </button>
                            ))}
                        </div>

                        {/* 목록 — 🔴 콜 카드가 아니라 한 줄 요약이다.
                            끝난 콜에는 결재 버튼·단계 시트가 필요 없다 (PinnedRouteCard 1,388줄을 여기 끌어오지 않는다) */}
                        <div className="flex-1 overflow-y-auto">
                            {rows.length === 0 && (
                                <div className="px-4 py-6 text-[12px] text-text-muted">— 없다</div>
                            )}
                            {rows.map(c => (
                                <div key={c.id} className="px-4 py-2.5 border-b border-border-card">
                                    <div className="flex items-baseline justify-between gap-2">
                                        <span className="text-[13px] font-bold truncate">
                                            {TABS.find(t => t.key === c.kind)!.mark} {c.pickup} → {c.dropoff}
                                        </span>
                                        <span className="text-[12px] font-bold tabular-nums text-text-muted shrink-0">
                                            {won(c.fare)}
                                        </span>
                                    </div>
                                    <div className="flex items-baseline justify-between gap-2 mt-0.5">
                                        <span className="text-[10px] text-text-muted">{c.why}</span>
                                        <span className="text-[10px] tabular-nums text-text-muted">{c.at}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* 서랍 발 — 🌓 밝기는 «고르는» 것이다 (실물 `Drawer` 와 같은 모양) */}
                        <div className="border-t border-border-card px-4 py-3">
                            <div className="text-[10px] font-bold text-text-muted mb-1.5">화면 밝기</div>
                            <div className="flex gap-1.5">
                                {([{ key: 'light', label: '🌞 밝게' }, { key: 'dark', label: '🌙 어둡게' }] as const).map(t => (
                                    <button key={t.key} onClick={() => setTheme(t.key)}
                                        aria-pressed={theme === t.key}
                                        className={`flex-1 h-9 rounded-lg text-[12px] font-bold transition-colors border
                                                    ${theme === t.key
                                                        ? 'bg-info text-white border-info'
                                                        : 'bg-surface-alt text-text-muted border-border-card'}`}>
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </aside>
                </div>

                {/* 현황판 자리 — 넓은 화면일 때만. 🔴 서랍이 여기를 안 덮는 것을 보이려고 둔다 */}
                {wide && (
                    <div className="flex-1 min-w-0 rounded-2xl border border-border-card bg-surface p-3" style={{ height: 640 }}>
                        <div className="text-[12px] font-black mb-2">현황판 (곁 패널)</div>
                        {['📋 콜 리스트', '🛰️ GPS', '📱 앱', '🎛️ 필터'].map(k => (
                            <div key={k} className="px-3 py-2 mb-2 rounded-lg bg-bg-base text-[11px] font-bold text-text-muted">
                                {k}
                            </div>
                        ))}
                        <p className="text-[10px] text-text-muted mt-3 leading-relaxed">
                            🔴 서랍은 여기를 덮지 않는다 — 곁에서 지켜보는 판이라
                            가리면 «지금 무슨 일이 일어나는지»를 놓친다.
                        </p>
                    </div>
                )}
            </div>

            {/* ── 무엇을 보고 판단하나 ── */}
            <div className="max-w-5xl mx-auto mt-4 rounded-xl border border-border-card bg-surface p-4">
                <div className="text-[12px] font-black mb-2">이 목업이 묻는 것</div>
                <ul className="text-[11px] text-text-muted space-y-1 leading-relaxed">
                    <li>· ☰ 가 로고와 충분히 떨어졌나 — 운전 중 잘못 눌러 테마가 바뀌지 않겠나</li>
                    <li>· 탭 셋(완료됨·취소·방출)이 옛 화면과 같은 감각인가</li>
                    <li>· 한 줄 요약에 필요한 것이 다 있나 — 상차→하차 · 왜 끝났나 · 시각 · 요금</li>
                    <li>· 서랍 폭 280px 이 폰에서 적당한가</li>
                    <li>· 넓은 화면에서 현황판을 안 덮는 것이 맞나</li>
                </ul>
            </div>
        </div>
    );
}
