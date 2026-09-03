import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { MAP_THEME_COLORS } from '../styles/themes';
import { callNodeFill, callNodeStroke, callNodeText } from '../styles/callPalette';
import PinnedRouteCanvas, { type RoutePoint } from '../components/dashboard/PinnedRouteCanvas';
import StageSheet, { type SheetSnap } from '../components/stage/StageSheet';

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
 * ⚠️ **기능은 없다.** 값은 전부 2026-09-03 실주행 캡처의 고정값이고, 서버·소켓·GPS 를
 *    쓰지 않는다. 디자인만 보는 자리다.
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

/**
 * 🗺️ **지도 — 진짜 컴포넌트를 그대로 쓴다** (기사님 요청 2026-09-04)
 *
 * 🔴 목업용 지도를 따로 그리지 않는다. 그러면 «두 벌»이 되어 목업에서 정한 것이
 *    실물과 달라진다 (규칙 ③). `PinnedRouteCanvas` 에 **고정 좌표만** 먹인다 —
 *    투영·마커·경로선·줌·팬이 전부 실물 그대로다.
 *
 * ⚠️ 그래서 **핀치 줌이 한쪽으로 쏠리는 것**(기사님 2026-09-03 지적)도 여기서 재현된다.
 *    고칠 때 이 화면에서 확인하면 된다.
 *
 * 좌표는 2026-09-03 실주행 그 지점들이다.
 */
const MAP_STOPS: RoutePoint[] = [
    /* callNo = 몇 번 «콜»인가 (색상) · no = 몇 번째 «정거장»인가 (번호) — 다른 값이다 */
    { type: '상차', name: '초월읍', isEvaluating: false, x: 127.2945, y: 37.3766, no: 1, routeId: 'c10', callNo: 1, visited: true },
    { type: '상차', name: '여수동', isEvaluating: false, x: 127.1387, y: 37.4218, no: 2, routeId: 'c12', callNo: 2 },
    { type: '상차', name: '석수동', isEvaluating: false, x: 126.9048, y: 37.4128, no: 3, routeId: 'c13', callNo: 3 },
    { type: '하차', name: '가산동', isEvaluating: false, x: 126.8829, y: 37.4682, no: 4, routeId: 'c12', callNo: 2 },
    { type: '하차', name: '구로동', isEvaluating: false, x: 126.8885, y: 37.5023, no: 5, routeId: 'c13', callNo: 3 },
    { type: '하차', name: '방화동', isEvaluating: false, x: 126.8130, y: 37.5735, no: 6, routeId: 'c10', callNo: 1 },
];
/** 👣 이미 다녀온 정거장 번호 — 지도와 목록이 **같은 값**을 본다 (규칙 ③) */
const VISITED_STOPS = new Set(MAP_STOPS.filter(p => p.visited).map(p => p.no!));
const MY_LOCATION = { x: 127.2945, y: 37.3766 };   // 초월읍 — 1번 상차지에 도착해 정차 중

/* ─────────────────────────────────────────────
   콜 자료 — 2026-09-03 실주행 캡처의 실제 값
   ───────────────────────────────────────────── */
type Stop = { kind: string; place: string; was: string | null; now: string; gap: string };
type Call = {
    no: number; grabbed: string; fare: string; rush: boolean;
    color: { tone: 'honey' | 'normal'; text: string };
    nodes: [number, number]; p: string; d: string; headAt: [string, string];
    stops: [Stop, Stop];
    buf: { tone: 'ok' | 'bad' | 'plain'; text: string }[];
    memo: string;
    site: { p: [string, string, string]; d: [string, string, string] };
    now: number; stamp: string[];
};

const CALLS: Call[] = [
    {
        no: 10, grabbed: '09:41:08', fare: '9.0만원', rush: false,
        color: { tone: 'honey', text: '꿀 91' },
        nodes: [1, 6], p: '초월읍', d: '방화동', headAt: ['', '~02:32'],
        stops: [
            { kind: '상차', place: '초월읍', was: null, now: '10:01', gap: '완료' },
            { kind: '하차', place: '방화동', was: '02:36', now: '~02:32', gap: '-4분' },
        ],
        buf: [{ tone: 'ok', text: '경유버퍼 +108분~' }, { tone: 'plain', text: '데드라인 02:32' }],
        memo: '적요 : 라면박스 20개 / *카고 입니다. 세금계산서필. 현위치 → 상차지 0.4KM. 상차지 → 하차지 52.8KM',
        site: {
            p: ['초월 스타벅스 경기광주초월역DT점', '경기 광주시 초월읍 경충대로', '031-798-1234'],
            d: ['강서개화장례식장 · 지층', '서울 강서구 양천로 35', '02-2666-4114'],
        },
        now: 3, stamp: ['09:52 직접', '09:58 자동', '10:01 자동', '', '', ''],
    },
    {
        no: 12, grabbed: '13:50:11', fare: '4.5만원', rush: true,
        color: { tone: 'honey', text: '꿀 88' },
        nodes: [2, 4], p: '여수동', d: '가산동', headAt: ['~17:54', ''],
        stops: [
            { kind: '상차', place: '여수동', was: '17:58', now: '~17:54', gap: '-4분' },
            { kind: '하차', place: '가산동', was: '19:13', now: '~19:09', gap: '-4분' },
        ],
        buf: [
            { tone: 'ok', text: '상차버퍼 +167분~' },
            { tone: 'ok', text: '경유버퍼 +42분~' },
            { tone: 'plain', text: '데드라인 19:09' },
        ],
        memo: '적요 : 쇼핑백 2개 / *카고 입니다. 마스크 카톤쇼핑백 2개. 현위치 → 상차지 6.5KM. 상차지 → 하차지 29.3KM',
        site: {
            p: ['성남시 택시쉼터', '경기 성남시 중원구 여수동', '031-729-8100'],
            d: ['서서울도시고속도로 서부간선영업소', '서울 금천구 가산동', '02-2101-7000'],
        },
        now: 0, stamp: ['', '', '', '', '', ''],
    },
    {
        no: 13, grabbed: '13:57:40', fare: '3.5만원', rush: false,
        color: { tone: 'normal', text: '보통 53' },
        nodes: [3, 5], p: '석수동', d: '구로동', headAt: ['~14:17', ''],
        stops: [
            { kind: '상차', place: '석수동', was: null, now: '~14:17', gap: '' },
            { kind: '하차', place: '구로동', was: null, now: '~15:31', gap: '' },
        ],
        buf: [{ tone: 'bad', text: '상차버퍼 -60분~' }, { tone: 'plain', text: '데드라인 15:31' }],
        memo: '적요 : 라면박스 12개 / 안양석유주유소 사무실. 현위치 → 상차지 34.9KM',
        site: {
            p: ['안양석유주유소', '경기 안양시 만안구 석수동', '031-471-2233'],
            d: ['진일텍푸라', '서울 구로구 경인로53길 111', '02-2618-4400'],
        },
        now: 0, stamp: ['', '', '', '', '', ''],
    },
];

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
function CallItem({ call, i, open, onToggle, rainbow }: {
    call: Call; i: number; open: boolean; onToggle: () => void; rainbow: boolean;
}) {
    const { theme } = useTheme();
    const c = MAP_THEME_COLORS[theme];
    const trackRef = useRef<HTMLDivElement>(null);
    const [at, setAt] = useState(call.now);
    /** 👣 이미 다녀온 정거장 — 지도의 `visited` 와 같은 값이어야 한다 */
    const visitedStops = VISITED_STOPS;

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
                <div className="flex-1 min-h-0 mt-1.5 flex flex-col rounded-b-[10px] border border-t-0 border-border-card bg-bg-base">

                    {/* 위 — 콜 전체를 아우르는 것. 스텝이 넘어가도 안 바뀐다 */}
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

                    {/* 아래 — 스텝. 좌우로 스와이프한다 */}
                    <div className="flex-1 min-h-0 flex flex-col">
                        <div className="shrink-0 flex items-center gap-1.5 px-3 py-2 border-b border-border-card">
                            <span className="text-[12.5px] font-black text-text-primary">{STEPS[at].k}</span>
                            <span className="flex gap-1">
                                {STEPS.map((s, k) => (
                                    <button key={k} type="button" onClick={() => goStep(k)} aria-label={s.k}
                                        className={`w-4 h-1.5 rounded-full transition-colors ${k === at ? 'bg-info' : k < call.now ? 'bg-success' : 'bg-surface-hover'}`} />
                                ))}
                            </span>
                            <span className="ml-auto text-[11px] text-text-muted tabular-nums">{at + 1}/6</span>
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
    const [openIdx, setOpenIdx] = useState<number>(-1);
    /** 🪟 시트 높이 — 실물과 같은 3단 (peek 72px · half 58% · full 100%) */
    const [snap, setSnap] = useState<SheetSnap>('full');
    /** 🎯 필터 영역 — 안 A(펼침 150px) ↔ 안 B(접힘 38px). 비교해서 고른다 */
    const [filterCompact, setFilterCompact] = useState(false);
    /** 🌈 콜 색표 — 색상=콜 · 채도=상차/하차 · 테두리=다녀왔나 (기사님 안 2026-09-04) */
    const [rainbow, setRainbow] = useState(true);
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
        <div className="min-h-dvh bg-bg-base text-text-primary flex flex-col items-center">
            {/* 폰 폭으로 묶는다 — 실제 폰에서는 화면을 꽉 채운다.
                조작판은 **아래**에 둔다 (기사님 2026-09-04: *"아냐 거기 좋아"*) */}
            <div className="w-full max-w-[400px] h-dvh flex flex-col">

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
                            unifiedRoutePoints={MAP_STOPS}
                            liveRoute={[]}
                            myLocation={MY_LOCATION}
                        >
                            {/* 🏷️ 다음 정거장 이름표 — 실물과 같은 자리 */}
                            <div className="absolute left-3 top-3 z-10 rounded-xl border px-3 py-2 tabular-nums"
                                style={{ background: 'color-mix(in srgb, var(--color-surface) 92%, transparent)', borderColor: 'var(--color-info)', backdropFilter: 'blur(3px)' }}>
                                <div className="text-[14px] font-black text-info">2. 여수동 · ~30분</div>
                                <div className="text-[11px] font-bold text-text-muted">2번 콜 · 상차 · 정차 중</div>
                            </div>
                        </PinnedRouteCanvas>
                    </div>

                    {/* ── 3단 시트 — **진짜 컴포넌트**. 손잡이를 끌거나 눌러서 peek↔half↔full ── */}
                    <StageSheet snap={snap} onSnapChange={setSnap}
                        peekBar={<>🏁 1 초월읍 도착 · 정차 중 <span className="font-semibold text-text-muted">— 다음 2 여수동 ~30분</span></>}>
                        <div className="h-full flex flex-col gap-1.5 px-2.5 pt-1 pb-2.5">
                            {CALLS.map((call, i) => (
                                <CallItem key={call.no} call={call} i={i} rainbow={rainbow}
                                    open={openIdx === i} onToggle={() => open(i, '헤더를 눌렀습니다')} />
                            ))}
                        </div>
                    </StageSheet>
                </section>
            </div>

            {/* ── 목업 조작판 — 실제 화면에는 없다 ── */}
            <div className="w-full max-w-[560px] px-4 py-5 border-t border-border-card">
                <h2 className="text-[15px] font-black text-text-primary mb-1">🎛️ 목업 조작판</h2>
                <p className="text-[12px] text-text-muted mb-5">실제 화면에는 없습니다 — 여기서 눌러 보며 비교하는 자리입니다.</p>

                <h2 className="text-[12.5px] font-black tracking-wide text-info mb-2">운행 이벤트 시늉</h2>
                <div className="flex gap-1.5 flex-wrap">
                    {[
                        { i: 1, t: '🏁 2번 콜 상차지 도착' },
                        { i: 2, t: '🛰️ 3번 콜 2km 접근' },
                        { i: 0, t: '📞 1번 콜 하차 통화 때' },
                    ].map(b => (
                        <button key={b.i} type="button" onClick={() => open(b.i, `${b.t} 이벤트`)}
                            className="px-3 py-2 rounded-[9px] border border-border-hover bg-surface text-[12.5px] font-black hover:border-info">
                            {b.t}
                        </button>
                    ))}
                    <button type="button" onClick={() => { setOpenIdx(-1); setLog('전부 접기 → 헤더 세 줄만 남습니다.'); }}
                        className="px-3 py-2 rounded-[9px] border border-border-hover bg-surface text-[12.5px] font-black hover:border-info">
                        ✋ 전부 접기
                    </button>
                </div>

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
