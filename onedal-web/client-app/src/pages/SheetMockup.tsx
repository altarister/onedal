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
    /* 🔴 **좌표를 지어내지 않았다** — 09-03 DB `geocode_cache` 의 실제 값이다 (규칙 ④).
       처음엔 내가 어림한 값을 넣었다가 석수동이 1.9km, 구로동이 1.4km 어긋나
       경로선 밖에 떨어져 보였다 (기사님 2026-09-04: *"석수동 위치가 생각과 좀 다르다"*).
       callNo = 몇 번 «콜»인가 (색상) · no = 몇 번째 «정거장»인가 (번호) — 다른 값이다 */
    { type: '상차', name: '초월읍', isEvaluating: false, x: 127.29823839640528, y: 37.374408707605994, no: 1, routeId: 'c10', callNo: 1, visited: true },
    { type: '상차', name: '여수동', isEvaluating: false, x: 127.122540815164, y: 37.422619533567, no: 2, routeId: 'c12', callNo: 2 },
    { type: '상차', name: '석수동', isEvaluating: false, x: 126.90476957579095, y: 37.429537468876326, no: 3, routeId: 'c13', callNo: 3 },
    { type: '하차', name: '가산동', isEvaluating: false, x: 126.883619010738, y: 37.4689667062309, no: 4, routeId: 'c12', callNo: 2 },
    { type: '하차', name: '구로동', isEvaluating: false, x: 126.874476183809, y: 37.5056847560909, no: 5, routeId: 'c13', callNo: 3 },
    { type: '하차', name: '방화동', isEvaluating: false, x: 126.807691849796, y: 37.5729712404467, no: 6, routeId: 'c10', callNo: 1 },
];
/**
 * 🛣️ **카카오가 준 진짜 경로선** — 2026-09-03 14:51 판, 3콜 합짐 (68.0km / 106분).
 *
 * 기사님(2026-09-04): *"여기에 카카오에서 받은 경로 라인이 없어."* — 맞다.
 * 목업이 `routeHolder` 를 안 넘겨서 안 그려지고 있었다(실물에는 있다).
 *
 * 🔴 **선을 지어내지 않았다** (규칙 ④). 그날 DB(`orders.routePolyline`)에 남은 939점을
 *    화면에 필요한 만큼(236점) 솎은 것이다 — 모양은 그날 그 길 그대로다.
 */
const ROUTE_POLYLINE: Array<{ x: number; y: number }> = ([
    [127.29431,37.37655], [127.29528,37.37669], [127.29521,37.37689], [127.29509,37.37733], [127.29419,37.37739], [127.29475,37.37757],
    [127.29556,37.37733], [127.29583,37.37719], [127.29605,37.3764], [127.2964,37.37563], [127.29681,37.37509], [127.29741,37.37449],
    [127.29808,37.374], [127.29931,37.37323], [127.29815,37.37397], [127.2984,37.37428], [127.29893,37.37503], [127.29816,37.37653],
    [127.29785,37.37726], [127.29782,37.37766], [127.2971,37.37786], [127.29668,37.37766], [127.29634,37.37759], [127.29606,37.37747],
    [127.29615,37.37726], [127.29617,37.37711], [127.29585,37.37711], [127.29564,37.37816], [127.29548,37.37884], [127.29526,37.37947],
    [127.29452,37.38078], [127.29325,37.38203], [127.29181,37.38327], [127.29056,37.38434], [127.28917,37.38555], [127.28785,37.38668],
    [127.28731,37.38719], [127.28511,37.39054], [127.28381,37.3918], [127.28237,37.39263], [127.28059,37.39339], [127.27786,37.39472],
    [127.27561,37.39667], [127.2744,37.39805], [127.27283,37.39987], [127.27218,37.40063], [127.27123,37.40175], [127.26948,37.40359],
    [127.26793,37.40475], [127.26621,37.40556], [127.26372,37.40595], [127.26142,37.40563], [127.25995,37.4051], [127.25596,37.40337],
    [127.25281,37.40196], [127.24964,37.40088], [127.24841,37.40082], [127.2443,37.40117], [127.24052,37.40168], [127.23761,37.40295],
    [127.2363,37.4036], [127.23122,37.40605], [127.2299,37.40656], [127.22789,37.40674], [127.22594,37.40617], [127.22492,37.40546],
    [127.22318,37.40383], [127.22223,37.40332], [127.22147,37.4031], [127.22072,37.40299], [127.21982,37.40298], [127.2179,37.40346],
    [127.21328,37.40542], [127.20913,37.40722], [127.20437,37.40955], [127.20187,37.41135], [127.19673,37.4151], [127.19121,37.4194],
    [127.18687,37.42319], [127.18449,37.42404], [127.18209,37.42417], [127.17647,37.42304], [127.17369,37.42271], [127.16584,37.42213],
    [127.15872,37.42164], [127.15615,37.42196], [127.15361,37.42334], [127.15049,37.42516], [127.14521,37.42615], [127.1387,37.42708],
    [127.13646,37.4273], [127.13074,37.42748], [127.12843,37.42752], [127.12814,37.42791], [127.12879,37.42829], [127.12911,37.42804],
    [127.12902,37.42651], [127.12869,37.42211], [127.12852,37.42177], [127.12784,37.42161], [127.12246,37.42184], [127.11908,37.422],
    [127.11638,37.42214], [127.11256,37.42237], [127.11077,37.42199], [127.10899,37.41911], [127.106,37.41356], [127.10327,37.40992],
    [127.10178,37.40881], [127.09502,37.40641], [127.0863,37.40312], [127.08089,37.40106], [127.07758,37.40045], [127.0716,37.39982],
    [127.06761,37.39843], [127.06183,37.3964], [127.05986,37.39626], [127.05494,37.39676], [127.04616,37.39752], [127.03911,37.39841],
    [127.03005,37.39983], [127.02467,37.3999], [127.01753,37.39888], [127.01427,37.39855], [127.0089,37.39867], [127.00494,37.39911],
    [127.00205,37.39979], [126.99752,37.40168], [126.99186,37.40427], [126.98809,37.40622], [126.97776,37.4116], [126.97397,37.41447],
    [126.96987,37.41637], [126.93341,37.43114], [126.92607,37.43155], [126.91906,37.43017], [126.91613,37.42898], [126.9142,37.42765],
    [126.91131,37.42531], [126.9092,37.42446], [126.90763,37.42452], [126.90722,37.42488], [126.90668,37.42515], [126.90572,37.426],
    [126.90485,37.42825], [126.90417,37.43075], [126.90317,37.43482], [126.90319,37.43741], [126.90329,37.43855], [126.90244,37.43874],
    [126.89926,37.4388], [126.89896,37.43927], [126.89819,37.44129], [126.89749,37.44274], [126.89534,37.44747], [126.89419,37.44961],
    [126.89371,37.45078], [126.89242,37.4536], [126.89157,37.4551], [126.89086,37.4562], [126.89077,37.4573], [126.89131,37.45916],
    [126.89032,37.46098], [126.88632,37.46563], [126.88463,37.46763], [126.88311,37.46933], [126.87946,37.47371], [126.87729,37.47622],
    [126.87619,37.47786], [126.87458,37.48113], [126.87369,37.48305], [126.87314,37.48449], [126.8725,37.4869], [126.87205,37.48937],
    [126.87141,37.49259], [126.87099,37.49484], [126.87098,37.49751], [126.87133,37.49945], [126.87353,37.50568], [126.87476,37.50829],
    [126.87647,37.51134], [126.87813,37.51455], [126.879,37.51683], [126.87967,37.51951], [126.88006,37.52202], [126.8805,37.52335],
    [126.88164,37.52534], [126.88295,37.52659], [126.88462,37.52765], [126.88816,37.52919], [126.89,37.53038], [126.89112,37.53178],
    [126.89166,37.5332], [126.89175,37.53487], [126.89139,37.53612], [126.89053,37.5379], [126.88985,37.53924], [126.88898,37.54118],
    [126.88778,37.54312], [126.88733,37.54395], [126.88717,37.54486], [126.88767,37.54632], [126.88819,37.54666], [126.88865,37.54655],
    [126.88877,37.54624], [126.88866,37.54595], [126.88813,37.54565], [126.88499,37.54696], [126.88318,37.54782], [126.88203,37.54854],
    [126.88114,37.54906], [126.8805,37.54946], [126.87928,37.5512], [126.87835,37.55292], [126.87874,37.55323], [126.87917,37.553],
    [126.87904,37.5528], [126.87784,37.55302], [126.87369,37.55557], [126.86272,37.56338], [126.84669,37.5727], [126.82485,37.58222],
    [126.822,37.58344], [126.82067,37.58462], [126.81966,37.58466], [126.81812,37.58386], [126.81704,37.58238], [126.81679,37.57959],
    [126.81682,37.57706], [126.81676,37.57543], [126.81675,37.57335], [126.81427,37.57344], [126.81228,37.57351], [126.81011,37.57316],
    [126.80887,37.57298], [126.80773,37.57281]
] as [number, number][]).map(([x, y]) => ({ x, y }));

/** 🧭 경로를 든 콜 — 캔버스는 여기서 선과 «심사 중인가»를 읽는다 */
const ROUTE_HOLDER = {
    id: 'c10', status: 'ORDER_CONFIRMED',
    routePolyline: ROUTE_POLYLINE,
    totalDistanceKm: 68.0, totalDurationMin: 106,
} as any;

/**
 * 👣 **내가 실제로 달린 자취** — 2026-09-03 14:55 출발 ~ 18:51 마지막 하차 (GPS 1,284점).
 *
 * 기사님(2026-09-04): *"카카오에서 받아온 걸 아래 두고 내가 간 걸 위에 두는 거지..
 * 그럼 얼마나 경로 이탈한 건지 한눈에 볼 수 있겠다."*
 *
 * 🔴 **튄 점을 뺐다**(25점) — 그날 터널에서 좌표가 9~10분씩 얼었다가 한 번에 따라잡았다
 *    (읽어보세요.md §4). 그대로 그리면 서울 밖으로 뻗는 직선이 생겨 «이탈»처럼 보인다.
 *    150km/h 넘게 이동한 것으로 계산되는 구간을 버렸다 — 궤적 거리도 그래서 68% 부풀었었다.
 * 🔴 선을 지어내지 않았다 (규칙 ④). 1,259점을 화면에 필요한 253점으로 솎았다.
 */
const DRIVEN_TRAIL: Array<{ x: number; y: number }> = ([
    [127.29926,37.37329], [127.29931,37.37326], [127.29931,37.37326], [127.29732,37.37466], [127.296,37.3768], [127.29544,37.37923],
    [127.29395,37.3815], [127.29264,37.38263], [127.29225,37.38298], [127.29015,37.3848], [127.28799,37.38663], [127.28632,37.38869],
    [127.28475,37.39099], [127.28403,37.39169], [127.28219,37.39275], [127.27934,37.39397], [127.27686,37.39549], [127.27502,37.39739],
    [127.27326,37.39944], [127.27148,37.40153], [127.26942,37.40369], [127.26705,37.40527], [127.26326,37.40595], [127.25967,37.40499],
    [127.25702,37.40382], [127.25434,37.40265], [127.2513,37.40132], [127.2483,37.40089], [127.24521,37.4011], [127.24228,37.40134],
    [127.24067,37.40163], [127.23827,37.40268], [127.23616,37.40369], [127.23405,37.4047], [127.23189,37.40574], [127.23031,37.40644],
    [127.22758,37.40673], [127.22625,37.40631], [127.22436,37.40497], [127.22201,37.40326], [127.21886,37.40316], [127.21624,37.40417],
    [127.21328,37.40543], [127.21046,37.40664], [127.20777,37.40778], [127.20503,37.40913], [127.20257,37.4109], [127.20032,37.41252],
    [127.19796,37.41422], [127.19561,37.4159], [127.1931,37.41769], [127.19105,37.41954], [127.18917,37.42147], [127.18634,37.42343],
    [127.18322,37.42418], [127.17994,37.42386], [127.17698,37.42317], [127.17433,37.42278], [127.17132,37.42258], [127.16813,37.42233],
    [127.16472,37.42209], [127.16144,37.42185], [127.15751,37.42168], [127.15454,37.42277], [127.15217,37.42431], [127.14933,37.42557],
    [127.14627,37.42604], [127.14316,37.4265], [127.1397,37.42699], [127.13605,37.42741], [127.13261,37.42757], [127.12933,37.42754],
    [127.12911,37.42778], [127.12875,37.42532], [127.12864,37.42298], [127.12681,37.42165], [127.12327,37.42184], [127.12007,37.42202],
    [127.11659,37.42221], [127.11353,37.42241], [127.1101,37.42248], [127.10951,37.42231], [127.11288,37.422], [127.11583,37.42189],
    [127.11586,37.42189], [127.11851,37.42177], [127.12196,37.42165], [127.1252,37.42147], [127.12747,37.42159], [127.12415,37.42172],
    [127.12082,37.42191], [127.11748,37.42214], [127.11434,37.42235], [127.11086,37.42247], [127.10783,37.42245], [127.10584,37.42237],
    [127.1078,37.42235], [127.10987,37.42234], [127.11315,37.42205], [127.11612,37.42199], [127.1195,37.4218], [127.1228,37.42162],
    [127.12634,37.42143], [127.12788,37.42135], [127.128,37.42162], [127.12472,37.42172], [127.12126,37.42191], [127.11803,37.42208],
    [127.11508,37.42224], [127.11184,37.42233], [127.10953,37.42095], [127.10883,37.41838], [127.10739,37.4155], [127.10591,37.41337],
    [127.10423,37.41102], [127.10165,37.4087], [127.09827,37.40742], [127.09462,37.40623], [127.09115,37.40512], [127.08805,37.40394],
    [127.08582,37.40281], [127.08461,37.40221], [127.08272,37.40146], [127.08074,37.40089], [127.07815,37.4005], [127.07562,37.40026],
    [127.07269,37.39998], [127.07059,37.3995], [127.06099,37.39638], [127.05974,37.39623], [127.05814,37.39627], [127.05608,37.39656],
    [127.05404,37.39679], [127.05155,37.397], [127.04872,37.3973], [127.01749,37.39885], [127.01544,37.39861], [127.01249,37.39847],
    [127.00873,37.39861], [127.00552,37.399], [127.00207,37.39975], [126.99928,37.40096], [126.99505,37.40276], [126.99251,37.40392],
    [126.98973,37.40533], [126.98677,37.40692], [126.98436,37.40817], [126.98129,37.40977], [126.97886,37.41104], [126.97645,37.41233],
    [126.97378,37.41418], [126.97073,37.41592], [126.96783,37.41719], [126.96905,37.41681], [126.91662,37.42924], [126.9139,37.42743],
    [126.91153,37.42549], [126.90883,37.42447], [126.90613,37.42551], [126.90492,37.42802], [126.90415,37.43049], [126.90414,37.43051],
    [126.90364,37.43264], [126.90312,37.43519], [126.90307,37.43672], [126.90311,37.43761], [126.9032,37.43854], [126.90031,37.43875],
    [126.89852,37.4404], [126.8974,37.44291], [126.89651,37.44469], [126.89586,37.44613], [126.89546,37.44697], [126.89486,37.4482],
    [126.89449,37.44892], [126.8941,37.44982], [126.89245,37.45356], [126.89194,37.45446], [126.89087,37.45616], [126.89082,37.45747],
    [126.89119,37.45985], [126.88946,37.46194], [126.88764,37.46401], [126.88593,37.4661], [126.88427,37.46809], [126.88439,37.46776],
    [126.88291,37.46817], [126.88472,37.46607], [126.89521,37.54152], [126.89382,37.54246], [126.89119,37.54395], [126.88856,37.54539],
    [126.88622,37.54666], [126.88347,37.54792], [126.8823,37.55016], [126.88349,37.55249], [126.88466,37.55482], [126.88548,37.55647],
    [126.88668,37.55884], [126.88799,37.56106], [126.88974,37.56331], [126.89155,37.56527], [126.89336,37.56727], [126.89145,37.56546],
    [126.88964,37.56345], [126.88785,37.56123], [126.88648,37.55892], [126.88524,37.55645], [126.88401,37.554], [126.88282,37.55164],
    [126.88182,37.54915], [126.8801,37.54999], [126.87882,37.55187], [126.87857,37.55286], [126.87589,37.55406], [126.87376,37.55562],
    [126.87173,37.55737], [126.86969,37.55911], [126.86724,37.56082], [126.86469,37.56227], [126.86165,37.56404], [126.85902,37.56555],
    [126.85637,37.56711], [126.85377,37.56862], [126.85115,37.57014], [126.84852,37.57167], [126.84593,37.57319], [126.84336,37.57468],
    [126.8408,37.57614], [126.83805,37.57741], [126.83537,37.5784], [126.83252,37.57945], [126.82931,37.58063], [126.82631,37.58171],
    [126.82347,37.5828], [126.82114,37.58441], [126.81804,37.58381], [126.81701,37.58131], [126.81664,37.5772], [126.81662,37.57463],
    [126.81524,37.57346], [126.81329,37.57352], [126.81327,37.57352], [126.81208,37.57352], [126.81207,37.57352], [126.81077,37.57331],
    [126.80876,37.57302], [126.80789,37.57395], [126.80685,37.57426], [126.80512,37.57271], [126.80482,37.57241], [126.80445,37.57243],
    [126.80443,37.57243]
] as [number, number][]).map(([x, y]) => ({ x, y }));

/**
 * 👣 **다녀온 정거장은 실물과 같은 방식으로 갈라 넘긴다** (2026-09-04 정정).
 *
 * 🔴 처음엔 여섯을 전부 `unifiedRoutePoints` 에 넣고 `visited` 표시만 달았다.
 *    그러면 지도가 «다음 정거장»을 `validPoints[0]` = **이미 다녀온 ①초월읍**으로 읽어,
 *    「구간」이 «초월읍 → 초월읍»으로 접혔다 (기사님: *"구간이 수정되지 않았어"*).
 *    실물은 다녀온 것을 `visitedTrail` 로, 남은 것을 `unifiedRoutePoints` 로 준다.
 */
const VISITED = MAP_STOPS.filter(p => p.visited).map(p => ({
    x: p.x!, y: p.y!, type: p.type as '상차' | '하차',
    orderId: p.routeId!, name: p.name, no: p.no!, callNo: p.callNo,
}));
const REMAINING = MAP_STOPS.filter(p => !p.visited);

/** 👣 이미 다녀온 정거장 번호 — 지도와 목록이 **같은 값**을 본다 (규칙 ③) */
const VISITED_STOPS = new Set(VISITED.map(p => p.no));
const MY_LOCATION = { x: 127.294001101745, y: 37.3771779756748 };   // 집(동광뷰엘) — geocode_cache 실측   // 초월읍 — 1번 상차지에 도착해 정차 중

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
                            unifiedRoutePoints={REMAINING}
                            visitedTrail={VISITED}
                            routeHolder={ROUTE_HOLDER}
                            drivenTrail={DRIVEN_TRAIL}
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
