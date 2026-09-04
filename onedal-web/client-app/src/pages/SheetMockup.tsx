import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { MAP_THEME_COLORS } from '../styles/themes';
import { callNodeFill, callNodeStroke, callNodeText } from '../styles/callPalette';
import PinnedRouteCanvas from '../components/dashboard/PinnedRouteCanvas';
import StageSheet, { aboveSheet, type SheetSnap } from '../components/stage/StageSheet';
import NaviQr, { naviQrText, type QrKind } from '../components/dashboard/NaviQr';
import { sheetStatus, sheetStatusLine } from '../lib/sheetStatus';
import { MOCK_PLANS, scenarioPlan, splitStops, myLocationAt, routeHolderOf, reaskedPlan, reaskCost, type Call } from './mockPlans';
import { SCENARIO } from './scenario';

/**
 * 🪗 **시트 아코디언 목업 — 앱 안에서, 앱의 재료로** (기사님 요청 2026-09-04)
 *
 * 기사님: *"지금 디자인 딱 좋은데.. 지금꺼 잘 저장해두고 최대한 똑같이
 * 우리프로젝트에 목업으로 만들어줘."*
 *
 * ── 원본 ──
 * 생김새의 원본은 [docs/기획/화면개편/wireframe-v25-accordion.html] 이다. **그 파일은 손대지 않는다.**
 * 여기는 그것을 **앱의 재료(Tailwind + 테마 토큰)** 로 다시 지은 것이다.
 *
 * ── 왜 앱 안에 짓나 ──
 * 🔴 원본은 색을 직접 박아 넣어서(`#4f8df9`) **어두운 테마 하나만** 그린다.
 *    그대로 옮기면 **밝은 테마에서 글이 안 보이는** 그 사고를 그대로 심는다
 *    (기사님: *"지금도 테마부분에 글이 안보이고 그런 문제들이 있어서"*).
 *    여기서는 모든 색이 토큰(`bg-surface`·`text-text-primary`·`text-info`…)이라
 *    **두 테마가 저절로 갈린다** — 오른쪽 위 버튼으로 그 자리에서 확인한다.
 * 🟢 그리고 확정되면 이식이 **번역이 아니라 옮기기**가 된다 — 같은 클래스, 같은 토큰.
 *
 * ⚠️ **기능은 없다.** 서버·소켓·GPS 를 쓰지 않는다. 디자인만 보는 자리다.
 *
 * ── 이 판이 참이라고 보는 전제 ──
 * 🔴 **원천은 [docs/지금/전제_점검표.md] 다.** 조작판 맨 아래에 **화면에도 적어 두었다** —
 *    문서에만 적으면 목업을 보는 자리에서는 안 읽힌다. 이 목업이 오래 **3콜에 박혀 있던 것**도
 *    전제가 어디에도 안 적혀 있었기 때문이다 (점검표 5부 · 기사님 2026-09-04).
 *    전제가 틀린 것이 보이면 **점검표가 먼저 고쳐지고** 그다음에 이 화면이 고쳐진다.
 */

/* ═════════════════════════════════════════════
   앱의 다른 세 영역 — 헤더 · 폰 · 필터
   실제 컴포넌트(Header · DeviceControlPanel · OrderFilterStatus)의 생김새를
   **같은 토큰으로** 옮긴 것이다. 값은 2026-09-03 캡처 고정값.
   ═════════════════════════════════════════════ */

/** 🚚 헤더 — 로고 자리가 «내 차 상황»이다 (기사님 0831: 로고는 테마 전환 역할뿐) */
function MockHeader() {
    const { theme, toggleTheme } = useTheme();
    return (
        <header className="shrink-0 bg-bg-base/95 backdrop-blur-sm border-b border-border-card px-3 py-2.5">
            <div className="flex items-center justify-between">
                <button type="button" onClick={toggleTheme} className="text-left active:scale-95 transition-transform">
                    <span className="flex items-baseline gap-1.5 whitespace-nowrap">
                        <span className="text-[17px] font-black text-text-primary">1t</span>
                        <span className="text-[12.5px] font-bold text-info">예약 3건 (다마스, 다마스, 다마스)</span>
                        <span className="text-[10px] font-black px-1 py-0.5 rounded bg-warning/15 text-warning">추정</span>
                    </span>
                </button>
                <div className="flex gap-2 items-center">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface shadow-soft">
                        {/* 🔴 실물은 여기에 animate-pulse 가 있다 — 그것이 초당 100회 재그리기의 원인 중 하나다.
                            목업에서는 **일부러 뺐다**. 지금 이 판에서 볼 것은 생김새이지 깜빡임이 아니다 */}
                        <span className="w-1.5 h-1.5 rounded-full bg-success" />
                        <span className="text-xs font-mono font-bold text-text-muted tracking-wide tabular-nums">14:17:22</span>
                    </div>
                    <span className="w-7 h-7 rounded-full border border-border-card bg-info grid place-items-center text-white text-xs font-bold">알</span>
                    <button type="button" onClick={toggleTheme}
                        className="px-2 py-1 rounded-lg border border-border-card bg-surface-alt/40 text-[11.5px] font-black text-text-muted">
                        {theme === 'dark' ? '☀️' : '🌙'}
                    </button>
                </div>
            </div>
        </header>
    );
}

/** 📱 폰 영역 — 스캔폰 한 대의 상태 한 줄 + 모드 셋 */
function MockDevicePanel() {
    return (
        <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 border-b border-border-card">
            {/* 🔴 왼쪽 묶음이 **먼저 줄어든다** — 모드(자동/알람/직접)는 손으로 누르는 것이라
                잘리면 안 된다. 예전에는 이 줄이 통째로 넘쳐 «직접»이 화면 밖으로 나갔다 */}
            <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-hidden">
                <span className="shrink-0 text-[12px] font-black text-success">A24</span>
                <span className="shrink-0 px-1.5 rounded border border-border-card text-[11.5px] text-text-primary whitespace-nowrap">
                    <span className="text-info font-black mr-1">인성</span>콜 리스트
                </span>
                <span className="shrink-0 px-1.5 rounded border border-info/40 bg-info/10 text-[11.5px] font-extrabold text-info">합짐</span>
                <span className="shrink-0 px-1.5 rounded border border-border bg-surface-alt text-[11.5px] font-bold text-text-muted">대기</span>
                <span className="text-[10px] text-text-muted opacity-70 tabular-nums truncate">2.9.1-hello (49)</span>
            </div>
            <span className="shrink-0 flex gap-1">
                {[['자동', true], ['알람', false], ['직접', false]].map(([m, on]) => (
                    <span key={m as string} className={`px-2 py-0.5 rounded-md text-[11.5px] font-black border ${on
                        ? 'bg-warning/15 border-warning/45 text-warning'
                        : 'bg-surface-alt/40 border-border-card text-text-muted'}`}>{m}</span>
                ))}
            </span>
        </div>
    );
}

/**
 * 🎯 필터 영역 — **두 안을 나란히 두고 고른다** (기사님과 비교 중 2026-09-04)
 *
 * | | 자리 | 국면 바꾸기 |
 * |---|---|---|
 * | **안 A** 펼침 | 150px — 화면의 18% | 한 번에 누른다 |
 * | **안 B** 접힘 | **38px** — 지도가 112px 커진다 | 줄을 눌러 펼친 뒤 (두 번) |
 *
 * 🔴 고를 잣대: **국면 버튼을 하루에 몇 번 누르나** 대 **지도를 얼마나 크게 보고 싶나.**
 *    기사님 09-03: *"줌이 한계가 있어서 여기가 어디인지 보고 싶은데 볼 수가 없었어."*
 *    — 그 답의 절반이 여기 있다.
 */
function MockFilterPanel({ compact, onExpand }: { compact: boolean; onExpand: () => void }) {
    if (compact) return (
        /* ── 안 B · 접힘 — 한 줄. 누르면 펼쳐진다 ── */
        <button type="button" onClick={onExpand}
            className="shrink-0 h-[38px] w-full flex items-center gap-2 px-3 border-b border-border-card text-left
                       bg-surface-alt/30 hover:bg-surface-hover/40 transition-colors">
            <span className="shrink-0 text-[13px] font-black text-info">🎯 노선</span>
            <span className="shrink-0 opacity-40">·</span>
            <span className="flex-1 min-w-0 truncate text-[12.5px] font-bold text-text-muted">
                여기서 <b className="text-text-primary">10km</b> → <b className="text-text-primary">서울 1km</b>
                <span className="mx-1.5 opacity-40">·</span>
                <b className="text-text-primary tabular-nums">📦 90/100</b>
            </span>
            <span className="shrink-0 text-sm text-text-muted">⚙️</span>
        </button>
    );
    return <MockFilterPanelFull />;
}

/** 🎯 안 A · 펼침 — 국면 문장 · 지표 · 국면 버튼 셋 */
function MockFilterPanelFull() {
    const PHASES = [
        { k: 'DEST', icon: '🎯', name: '노선', on: true },
        { k: 'LOCAL', icon: '🏘️', name: '관내', on: false },
        { k: 'HOME', icon: '🏠', name: '복귀', on: false },
    ];
    return (
        /* 🔴 **카드 여백을 없앴다** (기사님 2026-09-04: *"그리드가 안 맞아서 불편해 보여"*).
           `mx-3` 카드 + 안쪽 `px-[18px]` 이라 글이 30px 에서 시작해, 헤더(12px)·폰(12px)과
           **세로선이 셋으로 갈렸다.** 이제 위쪽 영역이 전부 같은 자리에서 시작한다. */
        <div className="shrink-0 border-b border-border-card flex flex-col"
            style={{ background: 'linear-gradient(180deg, var(--color-surface-alt), var(--color-surface))', height: 150 }}>
            {/* 머리글 — 방향 문장부터 (국면명은 아래 버튼이 말한다 · 중복 제거 0831) */}
            <div className="flex items-center gap-2 px-3 flex-1 text-[14px] border-b border-border-card">
                <span className="font-bold truncate text-text-muted">
                    여기서 <b className="text-text-primary">10km</b> → <b className="text-text-primary">서울 1km</b>
                </span>
                <span className="ml-auto shrink-0 font-black text-[14px] text-info">합짐 탐색중</span>
                <span className="shrink-0 text-sm text-text-muted">⚙️</span>
            </div>
            {/* 지표 — 순서 고정 💰 금액 · 📍 지역 · 📦 적재 (명세 §4-1).
                🔴 한 줄에 안 들어가 «📦 90/» 에서 잘렸다 — 괄호 요율을 접고 간격을 좁혔다 */}
            <div className="flex items-center gap-1.5 px-3 flex-1 text-[12.5px] font-medium text-text-muted tabular-nums border-b border-border-card overflow-hidden">
                <span className="shrink-0">💰 -10%</span>
                <span className="mx-0.5 opacity-40 shrink-0">·</span>
                <span className="shrink-0">📍 464개 동</span>
                <span className="mx-0.5 opacity-40 shrink-0">·</span>
                <span className="shrink-0">📦 90/100박스</span>
                <span className="opacity-60 truncate">(1t ≥ 693원/km)</span>
            </div>
            {/* 국면 버튼 — 지금 것은 안 눌린다 */}
            <div className="grid grid-cols-3 gap-2 px-3 pt-2 pb-2.5 flex-1">
                {PHASES.map(p => (
                    <button key={p.k} type="button" disabled={p.on}
                        className={`rounded-[10px] text-[13.5px] font-black border transition-all ${p.on
                            ? 'bg-info/15 border-info/55 text-info shadow-[0_0_14px_rgba(96,165,250,.18)] cursor-default'
                            : 'text-text-muted border-border bg-surface-alt/40 hover:bg-surface-hover hover:text-text-primary active:scale-95'}`}>
                        {p.icon} {p.name}
                    </button>
                ))}
            </div>
        </div>
    );
}

/* 🎬 **판 셋(3콜·4콜·5콜)은 [mockPlans.ts] 에 있다** — 정거장·경로선·궤적·콜 목록.
   조작판에서 갈아 끼운다. 한 곳에서만 만든다 (규칙 ③). */

/** 6단계 — 한 장에 «그 단계에서 할 일 하나»만 둔다 */
const STEPS = [
    { k: '상차지 통화', side: 'p', kind: 'call' },
    { k: '상차지 도착', side: 'p', kind: 'arrive' },
    { k: '상차 완료', side: 'p', kind: 'load' },
    { k: '하차지 통화', side: 'd', kind: 'call' },
    { k: '하차지 도착', side: 'd', kind: 'arrive' },
    { k: '하차 완료', side: 'd', kind: 'unload' },
] as const;

/* ── 작은 부품 — 원본의 생김새를 토큰으로 옮긴 것 ── */

function Pick({ on, children }: { on?: boolean; children: React.ReactNode }) {
    return (
        <span className={`px-2.5 py-1.5 rounded-lg border text-[12.5px] font-black ${on
            ? 'bg-info/20 border-info/50 text-info'
            : 'bg-surface-alt/40 border-border-card text-text-muted'}`}>{children}</span>
    );
}

function Label({ children }: { children: React.ReactNode }) {
    return <div className="mt-3 mb-1.5 text-[11px] font-black tracking-wide text-text-muted">{children}</div>;
}

function Site({ nm, addr, tel }: { nm: string; addr: string; tel: string }) {
    return (
        <div className="p-2.5 rounded-xl border border-success/35 bg-success/10">
            <b className="block text-[13.5px] font-black text-text-primary">{nm}</b>
            <span className="text-[11.5px] text-text-muted">{addr}</span>
            <span className="block mt-1.5 text-[13px] font-black text-success tabular-nums">📞 {tel}</span>
        </div>
    );
}

/** 한 스텝 장 — 단계 성격에 따라 몸통이 다르다 */
function PaneBody({ call, si }: { call: Call; si: number }) {
    const st = STEPS[si];
    const [nm, addr, tel] = call.site[st.side];
    const promise = call.stops[st.side === 'p' ? 0 : 1];

    if (st.kind === 'call') return (
        <>
            <Site nm={nm} addr={addr} tel={tel} />
            <Label>약속</Label>
            <div className="flex gap-1.5 flex-wrap">
                <Pick on>{promise.now}</Pick><Pick>15분 뒤</Pick><Pick>30분 뒤</Pick><Pick>직접</Pick>
            </div>
            <Label>단위 · 수량</Label>
            <div className="flex gap-1.5 flex-wrap">
                <Pick>파레트</Pick><Pick on>라면박스</Pick><Pick>마대</Pick><Pick>서류봉투</Pick>
            </div>
            <div className="flex gap-1.5 flex-wrap mt-1.5">
                <Pick on>20</Pick><Pick>30</Pick><Pick>40</Pick><Pick>50</Pick>
            </div>
            <div className="mt-3 flex gap-1.5">
                <b className="flex-1 text-center py-2.5 rounded-[10px] text-[13.5px] font-black border bg-info/20 border-info/60 text-info">통화 기록</b>
                <b className="flex-1 text-center py-2.5 rounded-[10px] text-[13.5px] font-black border bg-surface-alt/40 border-border-card text-text-muted">건너뜀</b>
            </div>
        </>
    );

    if (st.kind === 'arrive') return (
        <>
            <Site nm={nm} addr={addr} tel={tel} />
            <p className="mt-3 text-[11.5px] leading-relaxed text-text-muted">
                GPS 가 잡으면 저절로 찍힙니다 — 못 잡으면 여기서 찍습니다 (터널·지하차도에서는 못 잡습니다).
            </p>
            <div className="mt-3 flex">
                <b className="flex-1 text-center py-2.5 rounded-[10px] text-[13.5px] font-black border bg-info/20 border-info/60 text-info">도착 찍기</b>
            </div>
        </>
    );

    if (st.kind === 'load') return (
        <>
            <Label>상차 방법</Label>
            <div className="flex gap-1.5 flex-wrap"><Pick>지게차</Pick><Pick on>수작업</Pick></div>
            <Label>실은 양</Label>
            <div className="flex gap-1.5 flex-wrap"><Pick on>라면박스 20</Pick><Pick>고침</Pick></div>
            <div className="mt-3 flex">
                <b className="flex-1 text-center py-2.5 rounded-[10px] text-[13.5px] font-black border bg-info/20 border-info/60 text-info">상차 완료</b>
            </div>
            <p className="mt-3 text-[11.5px] leading-relaxed text-text-muted">
                지나치면 도착·완료가 순서대로 저절로 찍힙니다 (300m 들어왔다 400m 벗어날 때).
            </p>
        </>
    );

    return (
        <>
            <Label>하차 방법</Label>
            <div className="flex gap-1.5 flex-wrap"><Pick>지게차</Pick><Pick on>수작업</Pick></div>
            <Label>후작업</Label>
            <div className="flex gap-1.5 flex-wrap"><Pick>정리 1분</Pick><Pick on>검수 60분</Pick><Pick>합 1분</Pick></div>
            <Label>하차 문제</Label>
            <div className="flex gap-1.5 flex-wrap"><Pick>검수 지연</Pick><Pick>인수 거부</Pick><Pick>기타</Pick></div>
            <div className="mt-3 flex gap-1.5">
                <b className="flex-1 text-center py-2.5 rounded-[10px] text-[13.5px] font-black border bg-info/20 border-info/60 text-info">하차 완료</b>
                <b className="flex-1 text-center py-2.5 rounded-[10px] text-[13.5px] font-black border bg-surface-alt/40 border-border-card text-text-muted">취소</b>
            </div>
        </>
    );
}

/** 🪗 한 콜 — 헤더(접힘) + 펼친 판(위 덩어리 · 아래 스텝 스와이프) */
function CallItem({ call, i, open, onToggle, rainbow, visitedNos }: {
    call: Call; i: number; open: boolean; onToggle: () => void; rainbow: boolean;
    visitedNos: Set<number>;
}) {
    const { theme } = useTheme();
    const c = MAP_THEME_COLORS[theme];
    const trackRef = useRef<HTMLDivElement>(null);
    const [at, setAt] = useState(call.now);
    /** 👣 이미 다녀온 정거장 — 지도가 보는 값과 **같은 곳**에서 온다 (규칙 ③) */
    const visitedStops = visitedNos;

    /** 열면 «지금 할 단계»로 바로 간다 — 스와이프해서 찾게 하지 않는다 */
    useEffect(() => {
        if (!open) return;
        const t = trackRef.current;
        if (!t) return;
        requestAnimationFrame(() => {
            t.scrollTo({ left: call.now * t.clientWidth, behavior: 'auto' });
            setAt(call.now);
        });
    }, [open, call.now]);

    const goStep = (k: number) => {
        const t = trackRef.current;
        if (!t?.clientWidth) return;
        t.scrollTo({ left: k * t.clientWidth, behavior: 'smooth' });
        setAt(k);
    };

    /**
     * 🌈 정거장 동그라미 — **지도와 같은 색표를 쓴다** (`callPalette`).
     * 그래야 «저 동그라미가 목록의 몇 번 줄인가»를 눈으로 잇는다 (기사님 09-03 지적).
     */
    const node = (n: number, kind: 'p' | 'd') => rainbow ? (
        /* 🔍 지도는 12px 마커가 좋다 하셨고, **목록은 좀 작아도 된다** (기사님 2026-09-04).
           🔴 `leading-none` 이 핵심이다 — 물려받은 줄 높이(1.6)가 숫자를 아래로 밀어
              동그라미 가운데를 벗어난다. 기사님이 `line-height: initial` 로 찾으신 그 자리인데,
              **전역 유틸리티(.text-[14px])를 덮지 않고** 이 자리에만 준다 (다른 화면이 조용히 바뀐다). */
        <span className="shrink-0 w-[20px] h-[20px] rounded-full grid place-items-center text-[12.5px] font-black leading-none"
            style={(() => {
                const fill = callNodeFill(i + 1, kind === 'p' ? 'pickup' : 'dropoff', theme);
                return {
                    background: fill,
                    color: callNodeText(kind === 'p' ? 'pickup' : 'dropoff', theme),
                    /* 🖊️ 다녀온 곳에 «동그라미를 친다» — 안 간 곳은 바탕색이라 링이 안 보인다 */
                    boxShadow: `0 0 0 1px ${callNodeStroke(visitedStops.has(n), fill)}`,
                };
            })()}>{n}</span>
    ) : (
        <span className="shrink-0 w-[18px] h-[18px] rounded-full grid place-items-center text-[10.5px] font-black leading-none"
            style={{ background: kind === 'p' ? c.nodePickup : c.nodeDropoff, color: c.textBody }}>{n}</span>
    );

    return (
        /* 🔴 닫힌 콜은 자기 높이만(flex-none) · 펼친 콜이 남는 자리를 다 먹는다(flex-1).
           헤더 자체는 아래에서 `shrink-0` 이라 어느 쪽에서도 안 줄어든다 */
        <div className={`flex flex-col min-h-0 ${open ? 'flex-1' : 'flex-none'}`}>
            {/* ── 헤더: 접혀도 늘 보인다. 눌러서 토글 ── */}
            <button
                type="button" onClick={onToggle} aria-expanded={open}
                className={`shrink-0 h-[38px] w-full flex items-center gap-1.5 px-2.5 rounded-[9px] border text-left transition-colors ${open
                    ? 'bg-info/15 border-info/55'
                    : 'bg-surface-alt/40 border-border-card hover:border-border-hover'}`}
            >
                {/* 🔴 ▶ 아이콘은 뺐다 (기사님 2026-09-04: *"공간이 부족하다"*).
                    열렸는지는 **바탕색·번호색**이 이미 말한다 — 같은 것을 두 번 그리지 않는다. */}
                <span className={`shrink-0 w-3 text-[13.5px] font-black tabular-nums ${open ? 'text-info' : 'text-text-muted'}`}>{i + 1}</span>
                {/* 🔴 **열을 고정한다** (기사님 2026-09-04: *"일단 라인에 맞춰야 할 것 같아"*).
                    예전에는 시각이 있는 콜·없는 콜에 따라 화살표와 시각이 **줄마다 다른 자리**에
                    있었다 — 달리면서 훑을 때 눈이 매번 다시 찾아야 했다.
                    지명·시각 칸을 **폭 고정**으로 두면 세 줄이 한 표처럼 읽힌다.
                    시각 칸은 비어도 자리를 지킨다 — 그게 열을 만드는 값이다. */}
                <span className="flex-1 min-w-0 flex items-center gap-1 text-[13.5px] font-bold text-text-primary">
                    {node(call.nodes[0], 'p')}
                    <span className="w-[4em] shrink-0 truncate">{call.p}</span>
                    <span className="w-[3.5em] shrink-0 text-[12px] text-text-muted tabular-nums text-right">{call.headAt[0]}</span>
                    <span className="shrink-0 text-text-muted/70 px-0.5">→</span>
                    {node(call.nodes[1], 'd')}
                    <span className="w-[4em] shrink-0 truncate">{call.d}</span>
                    <span className="w-[3.5em] shrink-0 text-[12px] text-text-muted tabular-nums text-right">{call.headAt[1]}</span>
                </span>
                <span className="shrink-0 flex gap-[2px]" aria-hidden>
                    {STEPS.map((_, k) => (
                        <span key={k} className={`block w-[7px] h-[5px] rounded-full ${k < call.now ? 'bg-success' : k === call.now ? 'bg-info' : 'bg-surface-hover'}`} />
                    ))}
                </span>
            </button>

            {/* ── 펼친 판 = 위·아래 두 덩어리 ── */}
            {open && (
                /**
                 * 🔴 **넘친 것이 밖으로 그려지지 않게 한다** (기사님 실물 2026-09-04:
                 *    *"시트 반만 열기에서만 겹침이 발생해"*).
                 *    판이 `overflow` 없이 열려 있어, 자리가 모자라면 내용이 상자를 넘어
                 *    **다음 콜 헤더 위에 올라탔다.**
                 * 🟢 다만 **잘라 감추지 않고 스크롤**한다 — 위 덩어리는 다 보여야 하고,
                 *    모자라면 손으로 내려 보는 것이 «없는 것»보다 낫다 (규칙 ④).
                 */
                <div className="flex-1 min-h-0 mt-1.5 flex flex-col overflow-y-auto rounded-b-[10px] border border-t-0 border-border-card bg-bg-base">

                    {/**
                     * 위 — 콜 전체를 아우르는 것. 스텝이 넘어가도 안 바뀐다.
                     * 🔴 **절대 안 줄어든다** (기사님 2026-09-04: *"위 덩어리는 내용이 다 보여야 해.
                     *    반만 열었다는 건 전체적으로 어떤 콜이 있는지 보기 위함"*).
                     *    반만 여는 목적이 «어떤 콜이 있나»라서 여기가 잘리면 그 목적이 무너진다.
                     *    ⚠️ 한 번 거꾸로 잡았다 — 좁을 때 여기를 줄였더니 정작 볼 것이 사라졌다.
                     * 🔴 자리가 모자라면 **판이 세로로 스크롤**한다 — 잘라서 감추지 않는다 (규칙 ④).
                     */}
                    <div className="shrink-0 px-3 pt-2.5 pb-3 border-b border-border-card">
                        <div className="flex items-center gap-1.5 flex-wrap text-[11.5px] text-text-muted">
                            <span>{call.no}.</span>
                            <span>콜잡은시간 {call.grabbed}</span>
                            <span>수수료 23%</span>
                            {call.rush && <span className="px-1.5 rounded-[5px] text-[11px] font-black border bg-warning/15 border-warning/40 text-warning">급송</span>}
                            <span className={`px-1.5 rounded-[5px] text-[11px] font-black border ${call.color.tone === 'honey'
                                ? 'bg-info/15 border-info/40 text-info'
                                : 'bg-success/15 border-success/40 text-success'}`}>{call.color.text}</span>
                            <span className="ml-auto text-[17px] font-black text-text-primary tabular-nums">{call.fare}</span>
                        </div>

                        {/**
                          * 🔴 **실측이 아닌 칸이 있으면 카드가 스스로 말한다** (규칙 ⑤-2).
                          *    값만 있고 표시가 없으면 **숫자가 거짓말을 한다** — 그게 규칙 ④ 위반이다.
                          */}
                        {call.mock && (
                            <p className="mt-1.5 px-2 py-1 rounded-[6px] bg-warning/12 border border-warning/35
                                          text-[11px] font-bold text-warning leading-snug">
                                🧪 시늉 — {call.mock}
                            </p>
                        )}

                        <dl className="mt-2 grid grid-cols-[auto_auto_1fr] gap-x-2.5 gap-y-0.5 text-[13px] items-baseline">
                            {call.stops.map(s => (
                                <div key={s.kind} className="contents">
                                    <dt className="font-bold text-text-muted">{s.kind}</dt>
                                    <dd className="text-text-primary">{s.place}</dd>
                                    <dd>
                                        {s.was && <><span className="line-through tabular-nums text-text-muted/60">{s.was}</span>{' → '}</>}
                                        <span className="font-black tabular-nums text-text-primary">{s.now}</span>
                                        {s.gap && <span className="ml-1 text-[11.5px] text-success">{s.gap}</span>}
                                    </dd>
                                </div>
                            ))}
                        </dl>

                        <div className="mt-2.5 flex gap-1.5 flex-wrap text-[11px] font-black">
                            {call.buf.map(b => (
                                <b key={b.text} className={`px-1.5 py-0.5 rounded-md border ${b.tone === 'ok' ? 'bg-success/12 border-success/40 text-success'
                                    : b.tone === 'bad' ? 'bg-danger/12 border-danger/40 text-danger'
                                        : 'bg-surface-alt/40 border-border-card text-text-primary'}`}>{b.text}</b>
                            ))}
                        </div>

                        <p className="mt-2.5 text-[11.5px] leading-relaxed text-text-muted">{call.memo}</p>
                    </div>

                    {/**
                     * 아래 — 스텝. 좌우로 스와이프한다.
                     * 🔴 **양보하지 않는다** — 최소 높이를 지키고, 자리가 모자라면 판이 스크롤한다.
                     *    반만 열었을 때는 위 덩어리가 먼저 보이고 스텝은 **아래로 밀린다** —
                     *    그때 보시려는 건 «어떤 콜이 있나»이지 «지금 할 일»이 아니다.
                     *    스텝이 필요하면 시트를 **전체로** 올린다.
                     */}
                    <div className="shrink-0 flex-1 min-h-[220px] flex flex-col">
                        {/* 🔴 **점은 가운데 고정** (기사님 2026-09-04: *"단어에 따라 스와이프
                            네비게이션이 덜컹거려. 그냥 가운데 정렬하면 어떨까?"*).
                            단계 이름 길이가 달라(「상차지 통화」 ↔ 「상차 완료」) 점이 좌우로 밀렸다.
                            양옆을 `1fr` 로 같게 잡으면 가운데 칸은 이름 길이와 무관하게 제자리다. */}
                        <div className="shrink-0 grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 px-3 py-2 border-b border-border-card">
                            <span className="text-[12.5px] font-black text-text-primary truncate">{STEPS[at].k}</span>
                            <span className="flex gap-1 justify-self-center">
                                {STEPS.map((s, k) => (
                                    <button key={k} type="button" onClick={() => goStep(k)} aria-label={s.k}
                                        className={`w-4 h-1.5 rounded-full transition-colors ${k === at ? 'bg-info' : k < call.now ? 'bg-success' : 'bg-surface-hover'}`} />
                                ))}
                            </span>
                            <span className="justify-self-end text-[11px] text-text-muted tabular-nums">{at + 1}/6</span>
                        </div>

                        {/* 🔴 애니메이션을 얹지 않는다 — 넘어가는 부드러움은 scroll-snap 이 하고,
                            그건 손이 멈추면 끝난다 (초당 100회 재그리기의 원인은 끝없는 애니메이션이었다) */}
                        <div
                            ref={trackRef}
                            onScroll={e => {
                                const t = e.currentTarget;
                                if (t.clientWidth) setAt(Math.round(t.scrollLeft / t.clientWidth));
                            }}
                            className="flex-1 min-h-0 flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                            style={{ overscrollBehaviorX: 'contain' }}
                        >
                            {STEPS.map((s, k) => (
                                <section key={k} aria-label={s.k}
                                    className="shrink-0 w-full min-w-0 snap-center overflow-y-auto px-3 pt-2.5 pb-4">
                                    <h3 className="mb-2 flex items-center gap-1.5 text-[13.5px] font-black text-text-primary">
                                        {k + 1}. {s.k}
                                        <em className={`not-italic px-1.5 py-0.5 rounded-[5px] text-[11px] font-black border ${k < call.now ? 'bg-success/12 border-success/40 text-success'
                                            : k === call.now ? 'bg-info/15 border-info/50 text-info'
                                                : 'border-border-card text-text-muted'}`}>
                                            {k < call.now ? `마쳤습니다 · ${call.stamp[k]}` : k === call.now ? '지금 할 것' : '아직'}
                                        </em>
                                    </h3>
                                    <PaneBody call={call} si={k} />
                                </section>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function SheetMockup() {
    const { theme } = useTheme();
    const [openIdx, setOpenIdx] = useState<number>(-1);
    /** 🪟 시트 높이 — 실물과 같은 3단 (peek 72px · half 58% · full 100%) */
    const [snap, setSnap] = useState<SheetSnap>('full');
    /** 🎯 필터 영역 — 안 A(펼침 150px) ↔ 안 B(접힘 38px). 비교해서 고른다 */
    const [filterCompact, setFilterCompact] = useState(false);
    /** 🌈 콜 색표 — 색상=콜 · 채도=상차/하차 · 테두리=다녀왔나 (기사님 안 2026-09-04) */
    const [rainbow, setRainbow] = useState(true);
    /**
     * 🔴 **몇 콜 판인가** — 3콜은 **상한이 아니다** (전제 점검표 1부 ① · 기사님 2026-09-04:
     * *"최대한 많이 합짐하면 매출이 많아진다"*).
     * 콜이 넷이면 정거장 8개, 다섯이면 10개다 — **QR 이 몇 번인지도, 아코디언이 넘치는지도
     * 판을 갈아 끼워야 보인다.**
     */
    /**
     * 🎬 **시나리오 단계** — 기사님이 2026-09-05 에 적어 주신 한 사이클 (scenario.ts).
     *
     * 🔴 **켜지면 시나리오가 판·국면·QR 을 다 정한다** — 손잡이가 둘이면 갈라진다 (규칙 ③).
     *    끄면 예전처럼 판(3·4·5콜)을 손으로 고르는 자리로 돌아온다.
     */
    const [stepNo, setStepNo] = useState<number | null>(null);
    const step = stepNo != null ? SCENARIO.find(x => x.no === stepNo) ?? null : null;
    const [planSize, setPlanSize] = useState<3 | 4 | 5>(3);
    /**
     * ⟳ **다시 물었나** — 눌렀을 때 «순서가 춤추는 것»을 보여 주기 위한 것이다
     * (전제 점검표 3부 Q8). 전에는 분만 늘어서 **좋아지는 것처럼만** 보였다.
     */
    const [reasked, setReasked] = useState(false);
    /**
     * 🚚 **지금 어느 국면인가** — 목업이 오래 «정차 중»에 고정돼 있었다
     * (기사님 2026-09-04: *"운행 이벤트 시늉에서 주행중일때, 출발 할때가 없어"*).
     *
     * 🔴 **주행 중이 이 제품의 본 화면이다** — 기사님은 그때 **손을 못 쓴다**(전제 점검표 #31).
     *    그런데 목업이 그 화면을 못 보여 주고 있었으니, «먼발치 1~2초에 읽히는가»를
     *    **아무도 확인한 적이 없다.**
     */
    const [phase, setPhase] = useState<'주행' | '정차'>('정차');
    const moving = step ? step.phase === '주행' : phase === '주행';
    /** 🎬 조작판에서 **마지막으로 누른 장면** — 어느 버튼이 눌려 있나를 보여 준다 */
    const [scene, setScene] = useState<'출발' | '주행' | '접근' | '도착' | '통화' | null>(null);
    const basePlan = step ? scenarioPlan(step.grabbed) : MOCK_PLANS[planSize];
    const plan = (reasked && !step) ? reaskedPlan(basePlan) : basePlan;
    const cost = reaskCost(basePlan);
    const CALLS = plan.callList;
    /** 🎛️ 어디까지 다녀왔나 — 구간(다녀온 마지막 → 다음)을 바꿔 가며 본다 */
    const [visitedCount, setVisitedCount] = useState(1);
    /** 🔴 판을 바꾸면 정거장 수가 달라진다 — 넘치는 구간을 붙들고 있으면 «없는 정거장»을 가리킨다 */
    const safeVisited = Math.min(step ? step.visited : visitedCount, Math.max(0, plan.stops.length - 1));
    const { visited, remaining } = splitStops(plan, safeVisited);
    const myLocation = myLocationAt(plan, safeVisited);
    const nextStop = remaining[0];
    /**
     * 🎬 **시트 상태바 한 줄** — 무엇을 적을지는 `sheetStatus` 한 곳이 정한다 (규칙 ③).
     *    화면에 흩어 두면 «한 줄에 드는가»를 검사할 수가 없다 (`lib/sheetStatus.test.ts`).
     */
    /**
     * 🧭 **QR 을 어떤 모양으로 띄울까** — 기사님이 눈으로 고르시라고 **둘 다** 만들었다
     * (기사님 2026-09-04: *"이게 최선의 UI 인 거야?"* — 나도 확신이 없었다).
     *   ⓐ 덮개 — 버튼을 누르면 화면을 덮고 **크게**. 탭 2번(열고·닫고)
     *   ⓑ 늘 띄우기 — 지도 구석에 **작게 항상**. 탭 0번. 대신 작아서 못 읽을 수 있다
     */
    const [qrStyle, setQrStyle] = useState<'sheet' | 'always'>('sheet');
    const [qrOpenRaw, setQrOpenRaw] = useState(false);
    const [qrKind, setQrKind] = useState<QrKind>('navi');
    /**
     * 🔴 **QR 안에서 정거장을 앞뒤로 넘긴다 — 「보는 것」이지 「찍는 것」이 아니다.**
     *
     * 왜 필요한가: 터널·기지국 좌표로 **도착 감지가 실패하면** QR 이 **이미 다녀온 곳**을
     * 가리킨다 (09-03 에 실제로 흔들렸다). 그때 손으로 다음 것을 봐야 한다.
     *
     * 🔴 **도착을 찍게 하지 않는다.** 그건 장부에 남는 큰 결정이라 시트의 스텝에서 한다
     *    (규칙 ⑥ 시퀀스를 압축하지 않는다). 여기서는 **QR 만** 바꾼다 —
     *    장부는 도착 감지나 손으로 찍을 때 따로 맞춰진다.
     * 🟢 덤: «다음 다음»을 미리 보고 싶을 때도 쓸모 있다.
     */
    const [qrPeek, setQrPeek] = useState(0);          // 0 = 다음 정거장
    /**
     * 🔴 **한 번에 몇 곳을 보낼까** (기사님 지적 2026-09-04:
     * *"매번 내비를 찍는 것이 기사에게 너무 부담스러울 것 같아"*).
     *
     * 내가 「한 구간씩」을 밀어붙인 것은 **가정 ①②③(경유지로 안내하나·지나면 넘어가나·
     * 재탐색이 순서를 지키나)을 피하려고**였다. 확인할 방법이 없어서 피한 것이다.
     * **이제 QR 로 확인할 수 있다** — `via_list` 가 먹히는 것은 이미 봤다.
     *
     * | | 6정거장이면 | 동작 |
     * | 한 곳씩 | 6번 | 관제폰 6 + 카메라 6 = **12** |
     * | 경유 3개씩 | **2번** | 4 |
     */
    const [qrSpan, setQrSpan] = useState<1 | 4>(4);   // 4 = 경유3 + 도착1 (기본) · 1 = 다음 한 곳
    /**
     * 🟢 **기본이 4곳이다** — 2026-09-04 에 카카오내비 지도에 **물방울 「경유 1·2·3」이
     *    모두 찍히는 것**을 확인했다 (49km / 53분). 12동작이 4동작이 된다.
     * ⚠️ **주행 중에 지키는지는 아직 모른다** — 안 지키면 「다음 한 곳」으로 되돌린다.
     *    두 모양이 다 있으므로 되돌리는 것은 단추 하나다.
     */

    /**
     * ⟳ **경로 새로 받기** (09-03 요청 F-① — *"관제앱에 새로 고침 버튼이 있어야 하겠어"*,
     * 뒤에 *"새로 고침은 **지도의 경로** 이야기였어"* 로 좁혀졌다).
     *
     * 🔴 **«이탈» 때문이 아니라 «늙어서» 필요하다.** 실측으로 같은 구간이 30분 만에
     *    104분/1,900원 → 114분/3,800원이 됐다. **벗어나지 않아도 낡는다.**
     * 🔴 그리고 경로는 **필터의 경유 지역을 먹인다** — 낡으면 엉뚱한 동네에서 콜을 모은다.
     *    지금은 **하차 완료 때만** 갱신되어 09-03 실측 **최대 67분** 안 바뀌었다.
     * ⚠️ 목업이라 진짜로 안 부른다 — **무엇이 달라 보이는지**만 보여 준다.
     */
    /** 🔴 키는 `.env` 에서 온다 — 코드에 안 적는다. 없으면 카카오맵 QR 로 떨어진다 */
    const NAVI_KEY = import.meta.env.VITE_KAKAO_JS_KEY as string | undefined;
    /**
     * 🔴 **여기에 `window.location.origin` 을 넣으면 안 된다** — 목업은 `localhost:3000`
     *    이라 콘솔에 등록한 주소와 달라 카카오가 거부한다 (2026-09-04 실측).
     *    **등록한 주소를 고정으로 넘긴다.**
     */
    const NAVI_ORIGIN = (import.meta.env.VITE_KAKAO_JS_ORIGIN as string | undefined)
        ?? 'https://1dal.altari.com';
    /**
     * 🧭 이번에 보낼 정거장들 — `qrPeek` 만큼 밀고 `qrSpan` 만큼 자른다.
     * **마지막이 도착지, 앞의 것들이 경유지**다 (카카오내비 경유지는 최대 3개).
     */
    /**
     * 🧭 이번에 보낼 정거장들.
     * 🔴 시나리오가 켜져 있으면 **시나리오가 정한다** — 손잡이가 둘이면 갈라진다 (규칙 ③).
     */
    const qrSlice = step
        ? (step.qr ?? []).map(nm => plan.stops.find(st => st.name === nm)).filter(Boolean) as typeof plan.stops
        : remaining.slice(
            Math.min(qrPeek, Math.max(0, remaining.length - 1)),
            Math.min(qrPeek, Math.max(0, remaining.length - 1)) + qrSpan,
        );
    const toNaviStop = (p: typeof plan.stops[number]) =>
        (typeof p?.x === 'number' && typeof p?.y === 'number')
            ? { name: `${p.name} ${p.type}`, x: p.x, y: p.y } : null;
    const qrStop = toNaviStop(qrSlice[qrSlice.length - 1]);
    const qrVia = qrSlice.slice(0, -1).map(toNaviStop).filter(Boolean) as { name: string; x: number; y: number }[];
    const qrArgs = { stop: qrStop, via: qrVia, here: myLocation, kind: qrKind,
                     naviKey: NAVI_KEY, naviOrigin: NAVI_ORIGIN };
    /**
     * 🔢 **이 판을 끝까지 가려면 QR 을 몇 번 찍나** — 한 곳에서 센다 (규칙 ③).
     *
     * 🔴 전에는 「6정거장이면 2번」이라고 **글로 박혀 있었다.** 3콜 판에서만 참인 말이라
     *    4·5콜 판을 열면 화면이 조용히 거짓말을 했다 (전제 점검표 1부 ①).
     *    이제 **남은 정거장에서 세어** 판이 바뀌면 숫자도 따라 바뀐다.
     * 동작 = 관제폰에서 띄우기 N + 개인폰 카메라 N.
     */
    const tripsFor = (span: number) => Math.max(1, Math.ceil(remaining.length / span));
    const qrTrips = tripsFor(qrSpan);
    const qrReady = naviQrText(qrArgs) != null;
    /** 🔴 시나리오가 켜져 있으면 «이 장면에 QR 이 떠 있나»도 시나리오가 정한다 */
    const qrOpen = step ? (step.qr != null && qrReady) : qrOpenRaw;
    const setQrOpen = (v: boolean) => { if (!step) setQrOpenRaw(v); };

    const bar = sheetStatus({
        moving,   // 🔴 조작판의 국면에서 온다 — 실물은 GPS 가 말한다
        next: nextStop ? {
            visitNo: nextStop.no!, name: nextStop.name, callNo: nextStop.callNo,
            stop: nextStop.type as '상차' | '하차',
        } : null,
        /**
         * ⏱️ **판이 준 구간 분** — 카카오 `sections[i].duration` 실측이다.
         *    「⟳ 경로」를 누르면 순서가 바뀌면서 이 값도 **통째로 갈린다** (지어낸 증감이 아니다).
         * 🔴 실물에서는 GPS 마다 «선 위 남은 거리»를 다시 재서 줄어든다 (경로.md §5-3).
         *    지금 상태바는 «카카오에 물어본 그 순간부터의 누적»이라 30분을 달려도 안 변한다.
         */
        driveMinutes: nextStop ? (plan.legMinutes[nextStop.no!] ?? null) : null,
    });
    const visitedNos = new Set(visited.map(v => v.no));
    const [log, setLog] = useState('헤더를 누르거나 아래 «운행 이벤트»를 눌러 보세요.');

    /** 열리는 것은 하나 — 이미 열린 것을 누르면 접는다 (i 가 -1 이면 전부 접기) */
    const open = (i: number, why?: string) => {
        const next = i === openIdx ? -1 : i;
        setOpenIdx(next);
        if (!why) return;
        const closed = openIdx >= 0 ? `${openIdx + 1}번 접고 ` : '';
        setLog(next < 0
            ? `${why} → ${closed}전부 접힘 — 헤더 세 줄만 남습니다.`
            : `${why} → ${closed}${next + 1}번 ${CALLS[next].p}→${CALLS[next].d} 를 «${STEPS[CALLS[next].now].k}» 단계로 엽니다.`);
    };

    return (
        /**
         * 🖥️ **넓은 화면에서는 좌우로 나눈다** (기사님 2026-09-05).
         *    폰 쪽은 **붙박이(sticky)** 로 두고 조작판만 스크롤한다 — 조작판 아래쪽 버튼을
         *    누르면서도 **화면이 어떻게 바뀌는지 계속 보인다.** 시나리오를 한 칸씩 넘기며
         *    보는 자리라 그것이 이 화면의 전부다.
         * ⚠️ 좁은 화면(폰)에서는 예전 그대로 **위아래**다 — `lg:` 밖의 클래스는 안 건드렸다.
         */
        <div className="min-h-dvh bg-bg-base text-text-primary flex flex-col items-center
                        lg:flex-row lg:items-start lg:justify-center lg:gap-6 lg:px-6">
            {/* 폰 폭으로 묶는다 — 실제 폰에서는 화면을 꽉 채운다.
                조작판은 좁은 화면에서 **아래**, 넓은 화면에서 **오른쪽**이다
                (기사님 2026-09-04 *"아냐 거기 좋아"* · 2026-09-05 *"pc에서는 우측에"*) */}
            <div className="w-full max-w-[400px] h-dvh flex flex-col shrink-0 lg:sticky lg:top-0">

                <MockHeader />
                <MockDevicePanel />
                <MockFilterPanel compact={filterCompact} onExpand={() => setFilterCompact(false)} />

                {/* ══ 무대 — 지도가 배경이고 시트가 그 위에 뜬다 (실제 StageView 와 같은 모양) ══ */}
                <section className="relative flex-1 min-h-0">
                    <div className="absolute inset-0">
                        <PinnedRouteCanvas
                            fill
                            /* 🪟 시트가 올라온 만큼 지도가 위로 비켜 준다 — 반쯤 열면 둘을 같이 본다 (기사님 0901) */
                            sheetSnap={snap}
                            rainbowNodes={rainbow}
                            unifiedRoutePoints={remaining}
                            visitedTrail={visited}
                            routeHolder={routeHolderOf(plan)}
                            drivenTrail={plan.drivenTrail}
                            liveRoute={[]}
                            myLocation={myLocation}
                        >
                            {/**
                              * 🗺️ **아래쪽은 «콜 관련»** (기사님 확정 2026-09-04:
                              * *"위쪽은 지도 관련 아래쪽은 콜 관련 버튼이 있는 거지"*).
                              *   좌하단 내비 연동 · 우하단 지금 갈 곳.
                              */}
                            {/**
                              * ⟳ **경로 새로 받기** — 위는 지도 관련이라 우상단 줌 아래에 둔다.
                              * 🔴 **초기화(⟲)와 다른 일이다** — 초기화는 «보기를 되돌린다»,
                              *    이건 «카카오에 다시 물어 경로를 받는다». 그래서 **글씨로 적는다.**
                              */}
                            <button type="button"
                                onClick={() => {
                                    const on = !reasked; setReasked(on); setOpenIdx(-1); setQrPeek(0);
                                    setLog(on
                                        ? `⟳ 다시 물었습니다 — 정거장 순서가 «${reaskedPlan(basePlan).stops.map(st => st.name).join(' → ')}» 로 바뀌었습니다. `
                                          + `${cost.asIs} → ${cost.reasked} (${cost.km >= 0 ? '+' : ''}${cost.km}km / ${cost.min >= 0 ? '+' : ''}${cost.min}분). `
                                          + `지도 선·번호·콜 목록이 **함께** 바뀝니다 — 합짐 뒤라면 화주와 한 약속이 흔들립니다.`
                                        : '⟳ 원래 순서로 되돌렸습니다.'); }}
                                className="absolute top-[118px] right-3 z-10 flex items-center gap-1 rounded-md
                                           bg-surface-alt/80 hover:bg-surface-hover border border-border backdrop-blur-sm
                                           px-2 h-8 text-[11px] font-black text-text-primary opacity-80 hover:opacity-100 transition-all">
                                {reasked ? '⟲ 되돌리기' : '⟳ 경로'}
                            </button>

                            {/**
                              * 🔴 **다시 물으면 무엇이 달라지는지 그 자리에서 말한다.**
                              *    Q8 은 «자동으로 다시 부를 것인가»인데, 그 답은 **얼마나
                              *    나빠지는지를 보고** 나오는 것이다 (전제 점검표 3부 Q8).
                              */}
                            {reasked && (
                                <div className={`absolute top-[154px] right-3 z-10 max-w-[228px] rounded-lg px-2.5 py-2
                                                 border backdrop-blur-sm text-[11px] font-bold leading-snug ${
                                    cost.km > 5 ? 'bg-danger/20 border-danger/50 text-danger'
                                                : 'bg-surface-alt/85 border-border text-text-primary'}`}>
                                    <b className="text-[12px]">순서가 바뀌었습니다</b><br />
                                    <span className="tabular-nums opacity-80">{cost.asIs} → {cost.reasked}</span><br />
                                    <span className="tabular-nums font-black">
                                        {cost.km >= 0 ? '+' : ''}{cost.km}km · {cost.min >= 0 ? '+' : ''}{cost.min}분
                                    </span>
                                    <span className="block mt-1 font-semibold opacity-75">
                                        {cost.km > 5
                                            ? '합짐 뒤라면 화주와 한 약속이 흔들립니다'
                                            : '이 판에서는 손해가 작습니다 — 판마다 다릅니다'}
                                    </span>
                                </div>
                            )}

                            {/* ⓐ **덮개** — 누르면 화면을 덮고 크게 */}
                            {qrStyle === 'sheet' && qrReady && (
                                <button type="button"
                                    onClick={() => { setQrOpen(true); setLog(`🧭 QR 을 띄웠습니다 — 개인폰 카메라로 찍으면 «${qrStop?.name}» 으로 카카오내비가 열립니다.`); }}
                                    className="absolute left-3 z-10 flex items-center gap-1.5 rounded-xl px-3 py-2.5
                                               text-[13px] font-black text-white active:scale-95 transition-transform"
                                    /* 🔼 시트 바로 위에 — 높이는 StageSheet 가 원천이다 (규칙 ③) */
                                    style={{ bottom: aboveSheet(snap), background: 'linear-gradient(180deg,#5b8cff,#3f6fe0)', boxShadow: '0 6px 18px rgba(79,141,249,.4)' }}>
                                    {/**
                                      * 🔴 **「출발하기」 한 마디다** (기사님 2026-09-05).
                                      *    전에는 「다음 2 여수동 외 3 · 앞으로 3번」이었는데,
                                      *    한 줄에 **서로 다른 3 이 둘** 들어 있어 기사님이
                                      *    *"어디서든 뒤 3개의 경로를 포함해서…?"* 로 읽으셨다.
                                      *    담긴 곳은 **덮개를 열면 그 줄이 말한다** — 버튼은 «누르면 뭐가 되나»만 말한다.
                                      */}
                                    🧭 출발하기
                                </button>
                            )}

                            {/* ⓑ **늘 띄우기** — 누를 필요가 없다. 도착하면 그냥 개인폰을 들이댄다 */}
                            {qrStyle === 'always' && qrReady && (
                                <button type="button"
                                    onClick={() => { setQrOpen(true); setLog('🔍 작아서 안 찍히면 눌러서 크게 볼 수 있습니다.'); }}
                                    className="absolute left-3 z-10 flex flex-col items-center gap-0.5 rounded-xl bg-white p-1.5
                                               active:scale-95 transition-transform shadow-lg"
                                    style={{ bottom: aboveSheet(snap) }}>
                                    <NaviQr {...qrArgs} size={78} />
                                    <span className="text-[9px] font-black text-black leading-none pb-0.5">
                                        {nextStop?.no} {nextStop?.name}
                                    </span>
                                </button>
                            )}

                            {/**
                              * 🔳 **QR 덮개 — 세 줄이면 끝난다** (기사님 2026-09-05:
                              *    *"qr레이어가 떠 너무 많은 정보가 있는 거 같아. 그냥
                              *    「여수동 상차 / 구로동 하차 / 카메라로 찍어 네비를 켜세요」
                              *    이렇게 나오면 될 듯"*).
                              *
                              * 🔴 **여기는 찍으라고 띄우는 화면이다.** 배지·경고·주소 원문·모드
                              *    토글이 다 얹혀 있었는데, 그건 전부 **읽을 일이 없는 것**이었다.
                              *    남긴 것은 셋뿐 — **어디를 거쳐 어디로 가나 · QR · 무엇을 하라**.
                              * 🔴 «몇 곳 담았나»도 뺐다 — **줄 자체가 곧 그 답**이다
                              *    (「여수동 상차 → 석수동 상차 → 가산동 하차 / 구로동 하차」).
                              * ⚠️ 목업에서만 쓰는 도구(주소 원문·카카오맵 전환·앞뒤 넘기기)는
                              *    **맨 아래 작게** 접어 두었다 — 실물 화면에는 안 나간다.
                              */}
                            {qrOpen && qrReady && (
                                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4
                                                bg-black/85 backdrop-blur-sm px-6"
                                     onClick={() => { setQrOpen(false); setQrPeek(0); }}>
                                    <button type="button"
                                        onClick={(e) => { e.stopPropagation(); setQrOpen(false); setQrPeek(0); }}
                                        className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/15 text-white text-[17px] font-black">✕</button>

                                    {/* ① 어디를 거쳐 어디로 가나 — 경유는 →, 도착지는 / 뒤에 */}
                                    <p className="text-center text-[17px] font-black text-white leading-relaxed">
                                        {qrVia.map(v => v.name).join(' → ')}
                                        {qrVia.length > 0 && <span className="text-white/45"> / </span>}
                                        <span>{qrStop?.name}</span>
                                    </p>

                                    {/* ② QR */}
                                    <NaviQr {...qrArgs} size={210} />

                                    {/* ③ 무엇을 하라 */}
                                    <p className="text-[15px] font-black text-white/85">카메라로 찍어 네비를 켜세요</p>

                                    {/* ── 여기부터는 목업 도구 — 실물에는 없다 ── */}
                                    <div className="mt-1 flex flex-col items-center gap-1.5 opacity-45 hover:opacity-100 transition-opacity"
                                         onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center gap-2">
                                            <button type="button" disabled={!!step || qrPeek === 0}
                                                onClick={() => { setQrPeek(n => Math.max(0, n - 1)); setLog('◀ 앞 정거장 QR — 장부는 안 건드립니다.'); }}
                                                className="w-7 h-7 rounded-full bg-white/15 text-white text-[13px] font-black disabled:opacity-25">◀</button>
                                            <span className="min-w-[92px] text-center text-[11px] font-bold text-white/60 tabular-nums">
                                                {step ? '시나리오가 정함' : qrPeek === 0 ? '다음 정거장' : `${qrPeek}칸 뒤`}
                                            </span>
                                            <button type="button" disabled={!!step || qrPeek >= remaining.length - 1}
                                                onClick={() => { setQrPeek(n => Math.min(remaining.length - 1, n + 1)); setLog('▶ 다음 정거장 QR — 도착 감지가 늦어도 이걸로 갑니다.'); }}
                                                className="w-7 h-7 rounded-full bg-white/15 text-white text-[13px] font-black disabled:opacity-25">▶</button>
                                            <button type="button"
                                                onClick={() => { const k = qrKind === 'navi' ? 'map' : 'navi'; setQrKind(k); setLog(`${k === 'navi' ? '🧭 카카오내비' : '🗺️ 카카오맵'} QR 로 바꿨습니다.`); }}
                                                className="ml-1 text-[11px] font-bold text-white/70 underline underline-offset-2">
                                                {qrKind === 'navi' ? '카카오맵으로' : '카카오내비로'}
                                            </button>
                                        </div>
                                        <p className="max-w-[80%] text-[8px] leading-snug text-white/30 break-all text-center select-all">
                                            {naviQrText(qrArgs)}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* 🔴 키가 없으면 **버튼을 아예 안 보인다** — 깨진 QR 을 띄우느니 없는 게 낫다 (규칙 ④) */}
                            {!qrReady && (
                                <div className="absolute left-3 z-10 rounded-xl bg-warning/15 border border-warning/40 px-3 py-2
                                                text-[11px] font-bold text-warning leading-snug max-w-[190px]"
                                     style={{ bottom: aboveSheet(snap) }}>
                                    🔑 QR 을 못 만듭니다 —<br /><code>.env</code> 의 <b>VITE_KAKAO_JS_KEY</b> 를 확인하세요
                                </div>
                            )}

                        </PinnedRouteCanvas>
                    </div>

                    {/* ── 3단 시트 — **진짜 컴포넌트**. 손잡이를 끌거나 눌러서 peek↔half↔full ── */}
                    <StageSheet snap={snap} onSnapChange={setSnap}
                        peekBar={
                            /**
                             * 🎬 **시트 상태바** (용어집 확정 2026-09-04) — 읽는 줄.
                             *    그 안에서 누르는 부분이 «시트 상태바의 버튼»이다.
                             *
                             * 🔴 지도 위에 같은 말을 하던 「다음 정거장 버튼」을 **여기로 합쳤다.**
                             *    같은 말을 두 곳에서 하면 갈라진다 (규칙 ③).
                             * 🔴 **기능도 함께 옮겼다** — 자리만 옮기고 일을 흘리면 손이 갈 데가
                             *    없어진다 (2026-09-04 에 한 번 그랬다 · 095d091 로 되돌림).
                             * 🔴 «다녀온 곳»은 안 적는다 — 아코디언의 진행 점과 지도의 흰 링이
                             *    이미 말한다. 이 줄은 **지금 할 일**만 말한다.
                             * 🟢 주행 중에는 시트가 내려가 있어 이 줄이 **화면 맨 아래** — 엄지에 가깝다.
                             */
                            <button type="button"
                                onClick={() => {
                                    if (!nextStop) return;
                                    setSnap('full');
                                    open(nextStop.callNo! - 1);
                                    setLog(`시트 상태바의 버튼을 눌렀습니다 → 시트를 올리고 ${nextStop.callNo}번 콜을 «${STEPS[CALLS[nextStop.callNo! - 1].now].k}» 단계로 엽니다.`);
                                }}
                                className="w-full flex items-center gap-1.5 text-left min-h-[30px] active:opacity-70 transition-opacity">
                                <span className="shrink-0">{bar.mark}</span>
                                {nextStop ? (
                                    <>
                                        {/* 🔢 번호는 **지도 핀과 같은 색** — 이 줄의 ⑤와 지도의 ⑤가 이어진다 */}
                                        <span className="shrink-0 w-[19px] h-[19px] rounded-full grid place-items-center text-[12px] font-black leading-none"
                                            style={rainbow ? {
                                                background: callNodeFill(nextStop.callNo!, nextStop.type === '상차' ? 'pickup' : 'dropoff', theme),
                                                color: callNodeText('pickup', theme),
                                            } : { background: 'var(--color-info)', color: '#fff' }}>
                                            {nextStop.no}
                                        </span>
                                        <span className="shrink-0">{bar.name}</span>
                                        {bar.lead && <span className="shrink-0 text-text-muted font-semibold">{bar.lead}</span>}
                                        <span className="ml-auto shrink-0 text-text-muted font-semibold truncate">{bar.tail}</span>
                                        <span className="shrink-0 text-text-muted">›</span>
                                    </>
                                ) : <span className="text-text-muted font-semibold">· {bar.notice}</span>}
                            </button>
                        }>
                        {/**
                         * 🪗 아코디언 그릇 — 시트 높이를 그대로 쓰고 **넘치지 않는다.**
                         * 🔴 헤더는 `shrink-0`(각 콜 안에서), 펼친 판만 남는 자리를 먹는다.
                         *    그릇이 넘치면 시트가 세로로 스크롤되어 «헤더가 늘 보인다»가 깨진다.
                         */}
                        <div className="h-full flex flex-col gap-1.5 px-2.5 pt-1 pb-2.5 overflow-hidden">
                            {CALLS.map((call, i) => (
                                <CallItem key={call.no} call={call} i={i} rainbow={rainbow} visitedNos={visitedNos}
                                    open={openIdx === i} onToggle={() => open(i, '헤더를 눌렀습니다')} />
                            ))}
                        </div>
                    </StageSheet>
                </section>
            </div>

            {/* ── 목업 조작판 — 실제 화면에는 없다 ── */}
            {/* 🖥️ 넓은 화면에서는 오른쪽 칸 — 여기만 스크롤한다 */}
            <div className="w-full max-w-[560px] px-4 py-5 border-t border-border-card
                            lg:border-t-0 lg:border-l lg:h-dvh lg:overflow-y-auto lg:py-6">
                <h2 className="text-[15px] font-black text-text-primary mb-1">🎛️ 목업 조작판</h2>
                <p className="text-[12px] text-text-muted mb-5">실제 화면에는 없습니다 — 여기서 눌러 보며 비교하는 자리입니다.</p>

                {/**
                  * 🎬 **한 사이클 시나리오** (기사님이 2026-09-05 에 통째로 적어 주신 것).
                  *
                  * 🔴 이 목업이 지금까지 **장면 하나하나**만 보여 줬다. 그런데 어려운 것은
                  *    장면이 아니라 **차례**다 — 콜이 붙을 때마다 번호가 밀리고, QR 이 담는 곳이
                  *    달라지고, 방침 버튼이 잠긴다. **순서대로 못 보면 확인할 수가 없다.**
                  * 🔴 켜지면 **시나리오가 판·국면·QR 을 다 정한다** (규칙 ③).
                  */}
                <h2 className="text-[12.5px] font-black tracking-wide text-info mb-1">🎬 한 사이클 시나리오</h2>
                <p className="text-[11.5px] text-text-muted mb-2">
                    기사님이 적어 주신 순서 그대로입니다 — 누르면 화면이 그 장면이 됩니다.
                    켜져 있는 동안은 <b className="text-text-primary">시나리오가 판·국면·QR 을 정합니다.</b>
                </p>
                <div className="flex gap-1.5 flex-wrap">
                    <button type="button"
                        onClick={() => { setStepNo(null); setLog('시나리오를 껐습니다 — 판과 국면을 손으로 고르는 자리로 돌아옵니다.'); }}
                        className={`px-3 py-2 rounded-[9px] border text-[12.5px] font-black ${stepNo == null
                            ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-surface text-text-primary hover:border-info'}`}>
                        ✋ 끄기
                    </button>
                    {SCENARIO.map(sc => (
                        <button key={sc.no} type="button"
                            onClick={() => { setStepNo(sc.no); setOpenIdx(-1); setQrPeek(0); setReasked(false);
                                setSnap(sc.qr ? 'peek' : sc.phase === '정차' ? 'full' : sc.phase === '심사' ? 'half' : 'peek');
                                setLog(`${sc.title} — ${sc.what}${sc.gap ? `  🔴 아직 없는 것: ${sc.gap}` : ''}`); }}
                            className={`px-2.5 py-2 rounded-[9px] border text-[12px] font-black ${stepNo === sc.no
                                ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-surface text-text-primary hover:border-info'}`}>
                            {sc.title}
                        </button>
                    ))}
                </div>
                {step && (
                    <div className="mt-2.5 rounded-[10px] border border-info/35 bg-info/8 px-3 py-2.5">
                        <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-black mb-1.5">
                            <span className="px-1.5 py-0.5 rounded-[5px] bg-surface-alt text-text-primary">잡은 콜 {step.grabbed}</span>
                            <span className="px-1.5 py-0.5 rounded-[5px] bg-surface-alt text-text-primary">다녀온 곳 {step.visited}</span>
                            <span className="px-1.5 py-0.5 rounded-[5px] bg-surface-alt text-text-primary">{step.phase}</span>
                            {step.color && <span className={`px-1.5 py-0.5 rounded-[5px] ${
                                step.color === '꿀' ? 'bg-info/25 text-info'
                                : step.color === '보통' ? 'bg-success/25 text-success' : 'bg-warning/25 text-warning'}`}>
                                {step.color === '꿀' ? '🔵' : step.color === '보통' ? '🟢' : '🟡'} {step.color}
                            </span>}
                            {step.priorityLocked
                                ? <span className="px-1.5 py-0.5 rounded-[5px] bg-surface-alt text-text-muted">🔒 방침 잠김</span>
                                : <span className="px-1.5 py-0.5 rounded-[5px] bg-surface-alt text-text-muted">🔓 방침 바꿀 수 있음</span>}
                            {step.qr && <span className="px-1.5 py-0.5 rounded-[5px] bg-surface-alt text-text-primary">🧭 QR {step.qr.length}곳</span>}
                        </div>
                        <p className="text-[12px] leading-relaxed text-text-primary">{step.what}</p>
                        {/* 🔴 «되어야 할 모습»과 «지금 코드»가 다른 자리는 그 장면에서 바로 말한다 */}
                        {step.gap && (
                            <p className="mt-1.5 px-2 py-1 rounded-[6px] bg-warning/12 border border-warning/35
                                          text-[11.5px] font-bold text-warning leading-snug">
                                🔴 아직 코드에 없습니다 — {step.gap}
                            </p>
                        )}
                        <div className="mt-2 flex gap-1.5">
                            <button type="button" disabled={step.no <= 1}
                                onClick={() => setStepNo(step.no - 1)}
                                className="px-2.5 py-1 rounded-[7px] border border-border-hover bg-surface text-[12px] font-black disabled:opacity-30">◀ 앞</button>
                            <button type="button" disabled={step.no >= SCENARIO.length}
                                onClick={() => { const n = SCENARIO.find(x => x.no === step.no + 1)!;
                                    setStepNo(n.no); setOpenIdx(-1);
                                    setSnap(n.qr ? 'peek' : n.phase === '정차' ? 'full' : n.phase === '심사' ? 'half' : 'peek');
                                    setLog(`${n.title} — ${n.what}`); }}
                                className="px-2.5 py-1 rounded-[7px] border border-info/50 bg-info/10 text-info text-[12px] font-black disabled:opacity-30">다음 ▶</button>
                        </div>
                    </div>
                )}

                <h2 className="mt-7 pt-5 border-t border-border-card text-[12.5px] font-black tracking-wide text-info mb-2">몇 콜을 잡은 판인가</h2>
                <div className="flex gap-1.5 flex-wrap">
                    {([3, 4, 5] as const).map(n => (
                        <button key={n} type="button"
                            onClick={() => { setPlanSize(n); setVisitedCount(1); setOpenIdx(-1); setQrPeek(0); setReasked(false); setSnap('half');
                                setLog(`${n}콜 판 — 정거장 ${MOCK_PLANS[n].stops.length}개 · ${MOCK_PLANS[n].totalKm}km / ${MOCK_PLANS[n].totalMin}분. ${MOCK_PLANS[n].source}`); }}
                            className={`px-3 py-2 rounded-[9px] border text-[12.5px] font-black ${planSize === n
                                ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-surface text-text-primary hover:border-info'}`}>
                            {n}콜 · 정거장 {MOCK_PLANS[n].stops.length}
                        </button>
                    ))}
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-text-muted">
                    🔴 <b className="text-text-primary">3콜은 상한이 아닙니다</b> — 시간과 공간이 되면 더 잡습니다
                    (전제 점검표 1부 ①). 콜이 늘면 <b className="text-text-primary">아코디언이 몇 줄인지</b>,
                    <b className="text-text-primary"> QR 을 몇 번 찍는지</b>가 달라집니다.
                    <br /><span className="text-text-primary">지금 판:</span> {plan.source}
                    {plan.drivenTrail.length === 0 && <span className="block mt-1 text-warning font-bold">
                        ⚠️ 이 판은 <b>달린 적이 없어</b> 지도에 «내가 간 길»(궤적)이 없습니다 — 없는 것을 그리지 않습니다.
                    </span>}
                </p>

                {/**
                  * 🎬 **한 절로 합쳤다** (기사님 2026-09-04: *"지금 어느 국면인가 와 운행 이벤트
                  *    시늉은 같은거라 같이 나란히 있으면 될 거 같은데?"*).
                  *
                  * 🔴 맞다 — **둘 다 «지금 무슨 상황인가»를 고르는 버튼**이었다. 이벤트를 눌러도
                  *    국면이 함께 바뀌니 두 벌이면 갈라진다 (규칙 ③). 버튼 하나가 곧 한 장면이다.
                  * 🔴 문구는 **다음 정거장에서 파생**시킨다 — 「2번 콜 도착」처럼 박아 두면
                  *    판이나 구간을 바꿨을 때 화면이 조용히 거짓말을 한다.
                  */}
                <h2 className="text-[12.5px] font-black tracking-wide text-info mb-2">운행 한 바퀴 — 지금 무슨 상황인가</h2>
                <div className="flex gap-1.5 flex-wrap">
                    {([
                        ['출발', `🚚 출발`,
                            'QR 을 띄워 개인폰으로 찍는 순간입니다 — 이때만 폰 둘을 만집니다. 시트는 내려갑니다.'],
                        ['주행', `▶ 주행 중`,
                            '달리는 중 — 손이 갈 데가 없습니다. 상태바 한 줄만 먼발치에서 읽힙니다.'],
                        ['접근', `🛰️ ${nextStop?.no ?? ''} ${nextStop?.name ?? ''} 2km 앞`,
                            '곧 도착합니다 — 시트를 반쯤 올려 그 콜을 미리 봅니다. 아직 달리는 중입니다.'],
                        ['도착', `🏁 ${nextStop?.no ?? ''} ${nextStop?.name ?? ''} 도착`,
                            '멈춰 섰습니다 — 이때만 시트를 올려 결재합니다.'],
                        ['통화', `📞 1번 콜 하차 통화`,
                            '정차 중에 화주와 통화합니다 — KEEP 직후 바로 거는 그 전화입니다.'],
                    ] as const).map(([k, t, why]) => (
                        <button key={k} type="button"
                            onClick={() => {
                                setScene(k);
                                /* 🔴 «출발»은 **QR 을 찍는 순간**이다 — 결재를 마치고 나서면서
                                   관제폰이 QR 을 띄우고 개인폰 카메라로 찍는다 (경로.md §4-0-1).
                                   그래서 여기서만 덮개가 열린다. 달리기 시작하면 닫힌다. */
                                if (k === '출발') { setPhase('주행'); setSnap('peek'); setOpenIdx(-1); setQrOpen(qrReady); }
                                if (k === '주행') { setPhase('주행'); setSnap('peek'); setOpenIdx(-1); setQrOpen(false); }
                                if (k === '접근') { setPhase('주행'); setSnap('half'); setQrOpen(false); if (nextStop) open(nextStop.callNo! - 1); }
                                if (k === '도착') { setPhase('정차'); setSnap('full'); setQrOpen(false); if (nextStop) open(nextStop.callNo! - 1); }
                                if (k === '통화') { setPhase('정차'); setSnap('full'); setQrOpen(false); open(0); }
                                setLog(`${t} — ${why}`);
                            }}
                            className={`px-3 py-2 rounded-[9px] border text-[12.5px] font-black ${scene === k
                                ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-surface text-text-primary hover:border-info'}`}>
                            {t}
                        </button>
                    ))}
                    <button type="button" onClick={() => { setOpenIdx(-1); setLog('전부 접기 → 헤더 줄만 남습니다.'); }}
                        className="px-3 py-2 rounded-[9px] border border-border-hover bg-surface text-[12.5px] font-black hover:border-info">
                        ✋ 전부 접기
                    </button>
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-text-muted">
                    🔴 <b className="text-text-primary">주행 중이 이 제품의 본 화면입니다</b> — 그때 기사님은
                    <b className="text-text-primary"> 손을 못 씁니다</b>(점검표 #31). 시트를 내린 채로
                    <b className="text-text-primary"> 맨 아래 한 줄</b>만 보고 «지금 어디로 가는가»가 읽혀야 합니다.
                    <br />🔴 <b className="text-text-primary">도착하면 상태바가 ⏸ 로 돌아와야 합니다</b> —
                    멈췄는데 ▶ 로 남아 있으면 화면이 거짓말을 합니다. 그래서 버튼 하나가 국면까지 함께 정합니다.
                    <span className="block mt-1 text-text-primary font-bold tabular-nums">
                        지금 상태바: {sheetStatusLine(bar)}
                        {moving && <span className="text-warning"> — 먼발치에서 1~2초에 읽히십니까?</span>}
                    </span>
                </p>
                <h2 className="mt-6 text-[12.5px] font-black tracking-wide text-info mb-2">어느 구간을 볼까</h2>
                <div className="flex gap-1.5 flex-wrap">
                    {/* 🔴 라벨은 «어디까지 왔나»가 아니라 **«어느 구간을 볼까»** 로 적는다
                        (기사님 2026-09-04: *"버튼을 1~2 초월읍, 2~3 여수동, 이렇게 표현해줘"*).
                        누르는 목적이 «그 구간을 보는 것»이니 이름도 그렇게 불러야 한다 */}
                    {plan.stops.slice(0, -1).map((st, i) => (
                        <button key={st.no} type="button"
                            onClick={() => { setVisitedCount(i + 1); setSnap('peek'); setLog(`「현구간」은 ${st.no}~${plan.stops[i + 1]!.no} — ${st.name} → ${plan.stops[i + 1]!.name} 입니다.`); }}
                            className={`px-3 py-2 rounded-[9px] border text-[12.5px] font-black ${safeVisited === i + 1
                                ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-surface text-text-primary hover:border-info'}`}>
                            {st.no}~{plan.stops[i + 1]!.no} {st.name}
                        </button>
                    ))}
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-text-muted">
                    고른 구간까지 다녀온 것으로 칩니다 — 지도 왼쪽 위 <b className="text-text-primary">「현구간」</b> 버튼을 누르면
                    그 구간에 맞춰집니다. <b className="text-text-primary">4~5 가산동</b>은 거의 수직인 구간이라
                    «짧은 축이 화면을 줄이지 않는가»를 보기 좋습니다.
                </p>

                {/* ⟳ **Q8 을 판단하실 재료** — 전제 점검표 3부 (2026-09-04) */}
                <h2 className="mt-6 text-[12.5px] font-black tracking-wide text-info mb-2">⟳ 다시 물으면 어떻게 되나 <span className="text-text-muted font-bold">(Q8)</span></h2>
                <button type="button"
                    onClick={() => { setReasked(r => !r); setOpenIdx(-1); setQrPeek(0); setSnap('half');
                        setLog(reasked ? '⟲ 원래 순서로 되돌렸습니다.'
                            : `⟳ ${planSize}콜 판을 다시 물었습니다 — ${cost.asIs} → ${cost.reasked}. 지도의 번호와 콜 목록이 함께 바뀝니다.`); }}
                    className={`px-3 py-2 rounded-[9px] border text-[12.5px] font-black ${reasked
                        ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-surface text-text-primary hover:border-info'}`}>
                    {reasked ? '⟲ 원래 순서로' : '⟳ 다시 물어 보기'}
                </button>
                <p className="mt-2 text-[12px] leading-relaxed text-text-muted">
                    🔴 <b className="text-text-primary">전에는 이 버튼이 분만 늘렸습니다</b> — 좋아지는 것처럼만 보였습니다.
                    진짜 위험은 <b className="text-text-primary">정거장 순서가 뒤바뀌는 것</b>입니다
                    (09-01 한 판에 9번 · 09-03 +15km·+52분).
                    <br />아래는 <b className="text-text-primary">2026-09-04 에 카카오에 실제로 물은 값</b>입니다 —
                    같은 시각에 두 순서를 물어 비교했습니다.
                </p>
                <div className="mt-2 rounded-[9px] border border-border-card overflow-hidden">
                    <table className="w-full text-[12px] tabular-nums">
                        <thead className="bg-surface-alt/60 text-text-muted">
                            <tr><th className="text-left font-black px-2 py-1.5">판</th>
                                <th className="text-right font-black px-2">지금 순서</th>
                                <th className="text-right font-black px-2">다시 물으면</th>
                                <th className="text-right font-black px-2 pr-2.5">차이</th></tr>
                        </thead>
                        <tbody>
                            {([3, 4, 5] as const).map(n => {
                                const c = reaskCost(MOCK_PLANS[n]);
                                return (
                                    <tr key={n} className={`border-t border-border-card ${planSize === n ? 'bg-info/8' : ''}`}>
                                        <td className="px-2 py-1.5 font-black text-text-primary">{n}콜</td>
                                        <td className="px-2 text-right text-text-muted">{c.asIs}</td>
                                        <td className="px-2 text-right text-text-muted">{c.reasked}</td>
                                        <td className={`px-2 pr-2.5 text-right font-black ${c.km > 5 ? 'text-danger' : 'text-text-primary'}`}>
                                            {c.km >= 0 ? '+' : ''}{c.km}km · {c.min >= 0 ? '+' : ''}{c.min}분
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-text-muted">
                    🔴 <b className="text-text-primary">실측이 제 예상을 깼습니다</b> — 순서가 흔들리면 늘 나빠지는 줄 알았는데
                    <b className="text-text-primary"> 4콜 판에서는 2분이 줄었습니다</b>. 크게 나빠지는 것은 3콜 판(+15.6km)입니다.
                    <br />👉 그래서 Q8 의 답은 «재호출은 늘 위험하다»가 아니라
                    <b className="text-text-primary"> «얼마나 나빠지는지는 판마다 다르다»</b> 입니다.
                    <b className="text-text-primary"> 결론은 기사님이 내십니다.</b>
                </p>

                <h2 className="mt-6 text-[12.5px] font-black tracking-wide text-info mb-2">🌈 콜 색표 — 예전 색과 비교</h2>
                <div className="flex gap-1.5 flex-wrap">
                    {([[true, '새 색표 (색상=콜)'], [false, '예전 (초록=상차·로즈=하차)']] as [boolean, string][]).map(([k, t]) => (
                        <button key={t} type="button"
                            onClick={() => { setRainbow(k); setSnap('half'); setLog(`${t} — 지도와 목록을 같이 보세요. 같은 색이 같은 콜입니다.`); }}
                            className={`px-3 py-2 rounded-[9px] border text-[12.5px] font-black ${rainbow === k
                                ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-surface text-text-primary hover:border-info'}`}>
                            {t}
                        </button>
                    ))}
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-text-muted">
                    <b className="text-text-primary">색상</b>=몇 번 콜 · <b className="text-text-primary">채도</b>=상차(진함)/하차(흐림) ·
                    <b className="text-text-primary"> 테두리</b>=아직(흰색)/지나감(회색). 1번 상차지(초월읍)는 다녀와서 테두리가 회색입니다.
                </p>

                {/* 🧭 **QR 두 안** — 기사님이 눈으로 고르실 자리 (2026-09-04) */}
                <h2 className="mt-6 text-[12.5px] font-black tracking-wide text-info mb-2">🧭 내비 QR — 두 안 비교</h2>
                <div className="grid grid-cols-2 gap-2">
                    {([['sheet', 'ⓐ 눌러서 크게'], ['always', 'ⓑ 늘 작게 떠 있게']] as const).map(([k, t]) => (
                        <button key={k} type="button"
                            onClick={() => { setQrStyle(k); setQrOpen(false); setSnap('peek');
                                setLog(k === 'sheet'
                                    ? 'ⓐ 지도 좌하단 버튼을 누르면 QR 이 화면을 덮습니다 — 큽니다. 탭 2번(열고·닫고).'
                                    : 'ⓑ 지도 좌하단에 QR 이 늘 떠 있습니다 — 누를 필요가 없습니다. 대신 작아서 안 찍힐 수 있습니다.'); }}
                            className={`px-3 py-2 rounded-[9px] border text-[12.5px] font-black ${qrStyle === k
                                ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-surface text-text-primary hover:border-info'}`}>
                            {t}
                        </button>
                    ))}
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-text-muted">
                    🔴 <b className="text-text-primary">진짜 QR 입니다</b> — 개인폰 카메라로 찍어 보세요.
                    카카오내비가 «{qrStop?.name ?? '다음 정거장'}» 으로 열려야 맞습니다.
                    덮개 안의 <b className="text-text-primary">「카카오맵으로 바꾸기」</b>로 되돌아갈 길도 볼 수 있습니다.
                    {!NAVI_KEY && <span className="block mt-1 text-warning font-bold">
                        ⚠️ <code>.env</code> 에 <b>VITE_KAKAO_JS_KEY</b> 가 안 보입니다 — 개발 서버를 다시 띄워야 읽힙니다.
                    </span>}
                </p>

                <h2 className="mt-5 text-[12.5px] font-black tracking-wide text-info mb-2">한 번에 몇 곳을 보낼까</h2>
                <div className="grid grid-cols-2 gap-2">
                    {([[1, '다음 한 곳'], [4, '경유 3개 + 도착']] as const).map(([n, t]) => (
                        <button key={n} type="button"
                            onClick={() => { setQrSpan(n); setQrPeek(0); setQrOpen(true);
                                const t = tripsFor(n);
                                setLog(n === 1
                                    ? `한 곳씩 — 남은 정거장 ${remaining.length}곳이면 ${t}번 찍습니다 (관제폰 ${t} + 카메라 ${t} = ${t * 2}동작).`
                                    : `경유 3개 + 도착 1 — 남은 ${remaining.length}곳을 ${t}번에 담습니다 (${t * 2}동작). 🔴 카카오내비가 주행 중에 경유지를 지키는지 봐야 합니다.`); }}
                            className={`px-3 py-2 rounded-[9px] border text-[12.5px] font-black ${qrSpan === n
                                ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-surface text-text-primary hover:border-info'}`}>
                            {t}
                        </button>
                    ))}
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-text-muted">
                    🔴 <b className="text-text-primary">판정 기준은 「물방울」입니다</b> — 목록에 이름이 남는 것만으로는
                    <b className="text-text-primary"> 안 들릅니다</b>. 지도에 <b className="text-text-primary">물방울 「경유 1·2·3」</b> 이 찍혀야 인식된 것입니다.
                    <br />① 물방울이 뜨는가(지금) · ② <b className="text-text-primary">주행 중에 지키는가</b>(나가실 때).
                    <br />🔢 <b className="text-text-primary">지금 판({planSize}콜 · 남은 {remaining.length}곳)</b>이면 —
                    한 곳씩 <b className="text-text-primary">{tripsFor(1) * 2}동작</b> ↔
                    경유 3개씩 <b className="text-text-primary">{tripsFor(4) * 2}동작</b>.
                    <b className="text-text-primary"> 콜이 늘수록 벌어집니다.</b>
                    <br />🧭 지금 고른 것({qrSpan === 1 ? '한 곳씩' : '경유 3개씩'})으로는
                    <b className="text-text-primary"> {qrTrips}번</b> 찍습니다.
                </p>

                <h2 className="mt-6 text-[12.5px] font-black tracking-wide text-info mb-2">필터 영역 — 두 안 비교</h2>
                <div className="flex gap-1.5 flex-wrap">
                    {([[false, '안 A · 펼침 150px'], [true, '안 B · 접힘 38px']] as [boolean, string][]).map(([k, t]) => (
                        <button key={t} type="button"
                            onClick={() => { setFilterCompact(k); setSnap('peek'); setLog(`${t} — 시트를 내려 지도를 봅니다. 지도 높이가 ${k ? '112px 더 큽니다' : '기본입니다'}.`); }}
                            className={`px-3 py-2 rounded-[9px] border text-[12.5px] font-black ${filterCompact === k
                                ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-surface text-text-primary hover:border-info'}`}>
                            {t}
                        </button>
                    ))}
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-text-muted">
                    누르면 <b className="text-text-primary">시트가 내려가</b> 지도가 드러납니다 — 두 안의 차이는 «지도가 얼마나 큰가»입니다.
                    접힌 줄을 누르면 다시 펼쳐집니다.
                </p>

                <h2 className="mt-6 text-[12.5px] font-black tracking-wide text-info mb-2">시트 높이 (손잡이를 끌거나 눌러도 됩니다)</h2>
                <div className="flex gap-1.5 flex-wrap">
                    {([['peek', '엿보기 72px'], ['half', '반 58%'], ['full', '전체 100%']] as [SheetSnap, string][]).map(([k, t]) => (
                        <button key={k} type="button"
                            onClick={() => { setSnap(k); setLog(`시트를 «${t}» 로 올렸습니다 — 지도가 그만큼 비켜 줍니다.`); }}
                            className={`px-3 py-2 rounded-[9px] border text-[12.5px] font-black ${snap === k
                                ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-surface text-text-primary hover:border-info'}`}>
                            {t}
                        </button>
                    ))}
                </div>
                <p className="mt-2.5 pt-2.5 border-t border-border-card text-[12px] leading-relaxed text-text-muted tabular-nums">{log}</p>

                {/**
                  * 🔴 **판을 시작할 때 전제를 적고 번호를 가리킨다** (전제 점검표 5부 · 2026-09-04).
                  *    기사님: *"값어치는 «지금 맞추는 것»이 아니라 «다음에 내가 틀린 전제로
                  *    판을 짜기 전에 여기서 걸리는 것»이다."*
                  * 🔴 **화면에 적는 이유** — 문서에만 적으면 목업을 보는 자리에서는 안 읽힌다.
                  *    이 목업이 3콜에 박혀 있던 것도 «전제가 어디에도 안 적혀» 있었기 때문이다.
                  */}
                <h2 className="mt-7 pt-5 border-t border-border-card text-[12.5px] font-black tracking-wide text-info mb-1">
                    이 목업이 참이라고 보는 전제
                </h2>
                <p className="text-[11.5px] text-text-muted mb-2.5">
                    원천은 <b className="text-text-primary">docs/지금/전제_점검표.md</b> 입니다.
                    틀린 것이 보이면 <b className="text-text-primary">여기가 먼저 고쳐지고</b> 그다음에 화면이 고쳐집니다.
                </p>
                <ul className="space-y-1 text-[12px] leading-relaxed">
                    {[
                        ['✅', '3콜은 상한이 아니다 — 시간·공간이 되면 더 잡는다', '1부 ① · #4', '판 셋(3·4·5콜)이 여기서 나왔다'],
                        ['✅', '어떤 콜이건 판정색은 낸다 (30초 자동 판결만 직접콜에 안 건다)', '1부 ③ · #11', '카드마다 색이 있다'],
                        ['✅', '모르는 값은 일반값으로 계산하고 «미확인»으로 표시한다', 'CLAUDE.md ⑤-2', '얹은 두 콜의 「🧪 시늉」 배지'],
                        ['✅', '운전 중에는 입력을 못 한다 — 먼발치 1~2초에 읽혀야 한다', '#31', '시트 상태바 한 줄 · 색만 보고 누른다'],
                        ['✅', '폰 셋 — 개인폰(내비) · 관제폰(관제앱) · 스캔폰(원달앱)', '#35', 'QR 은 관제폰이 띄우고 개인폰이 찍는다'],
                        ['✅', '경유지가 먹혔는지는 「물방울」로 판정한다', '경로.md §4-1', '목록에 이름만 남으면 안 들른다'],
                        ['⏳', 'Q8 — 벗어나면 카카오에 다시 물을 것인가', '3부 · 미결', '⟳ 버튼이 그 대가를 실측으로 보여 준다'],
                        ['⏳', '카카오내비가 주행 중에 경유지 순서를 지키는가', '경로.md §4-1 ②③', '주행에서만 보인다 — 안 되면 「한 곳씩」으로 되돌린다'],
                        ['🔴', '6콜은 «목표»지 «구조»가 아니다', '#5', '시스템이 6콜을 채우도록 밀어붙이지 않는다'],
                    ].map(([mark, what, ref, how]) => (
                        <li key={what} className="flex gap-1.5">
                            <span className="shrink-0">{mark}</span>
                            <span className="min-w-0">
                                <b className="text-text-primary">{what}</b>
                                <span className="text-text-muted"> — {how}</span>
                                <span className="ml-1 text-[11px] text-info/80 font-bold">［{ref}］</span>
                            </span>
                        </li>
                    ))}
                </ul>

                <h2 className="mt-6 text-[12.5px] font-black tracking-wide text-warning mb-2">이 목업이 아직 못 보여 주는 것</h2>
                <ul className="pl-5 list-disc text-[12px] leading-relaxed text-text-muted">
                    <li><b className="text-text-primary">시스템이 뒤채우는 모습</b> — 안 눌러도 상차지통화·도착이 순차 완료되는 것
                        (전제 점검표 #8). 지금은 단계 점이 고정값이다</li>
                    <li><b className="text-text-primary">4·5콜 판의 궤적</b> — 그 판으로 달린 적이 없다. 없는 것을 그리지 않는다</li>
                    <li><b className="text-text-primary">판정 점수</b> — 얹은 두 콜은 «보통 —» 이다. 판정은 서버가 내는 것이라 목업이 지어내지 않는다</li>
                    <li><b className="text-text-primary">살아 있는 남은 분</b> — 지금 값은 카카오에 물은 순간의 것이다 (경로.md §5-3 「뺄셈」이 그 판)</li>
                </ul>

                <h2 className="mt-6 text-[12.5px] font-black tracking-wide text-info mb-2">이 목업이 원본과 다른 점</h2>
                <ul className="pl-5 list-disc text-[12.5px] leading-relaxed text-text-muted">
                    <li><b className="text-text-primary">색이 전부 앱 토큰</b>이다 — 그래서 위 «밝게/어둡게»로 <b className="text-text-primary">두 테마를 그 자리에서</b> 본다</li>
                    <li>상차·하차 동그라미는 <b className="text-text-primary">지도 핀과 같은 색</b>을 쓴다 (<code>MAP_THEME_COLORS</code>)</li>
                    <li>확정되면 이식이 <b className="text-text-primary">번역이 아니라 옮기기</b>가 된다 — 같은 클래스, 같은 토큰</li>
                    <li>생김새의 원본은 <code>docs/기획/화면개편/wireframe-v25-accordion.html</code> — 그 파일은 손대지 않는다</li>
                </ul>
            </div>
        </div>
    );
}
