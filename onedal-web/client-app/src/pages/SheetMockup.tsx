import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { MAP_THEME_COLORS } from '../styles/themes';
import { callNodeFill, callNodeStroke, callNodeText } from '../styles/callPalette';
import PinnedRouteCanvas from '../components/dashboard/PinnedRouteCanvas';
import StageSheet, { type SheetSnap } from '../components/stage/StageSheet';
import { sheetTransition, snapOnJudging, snapAfterJudging } from '../components/stage/sheetTransition';
import NaviQr, { naviQrText, type QrKind } from '../components/dashboard/NaviQr';
import { sheetStatus, sheetStatusLine, textWidth } from '../lib/sheetStatus';
import StepSheetMock from '../components/dashboard/StepSheetMock';
import { pushClock, gapTone } from '../lib/pushedTime';
import { MOCK_PLANS, CONE_DEMO, QUAD_DEMO, QUAD_SIHEUNG, QUAD_LEG2, BOLT_STEPS, BOLT_STEPS_30, RING_DEMO, scenarioPlan, splitStops, myLocationAt, routeHolderOf, reaskedPlan, reaskCost, type Call } from './mockPlans';
import { buildNet, buildFirstLegDemo, WAIT_PRESET, GONJIAM_DROP, GONJIAM_CALL_PATH, DONGWON_DROP, DONGWON_CALL_PATH, BORAM_DROP, BORAM_CALL_PATH, ICHEON_DROP, ICHEON_CALL_PATH, type NetParams, type NetResult } from '@onedal/shared';
import { SCENARIO, SEAT_CALLS } from './scenario';
import { ROUTE_PRIORITIES, PRIORITY_SAMPLE, isPriorityLocked, type RoutePriority } from '../lib/routePriority';
import JudgmentSeat from '../components/dashboard/JudgmentSeat';

/**
 * 🪗 **시트 아코디언 목업 — 앱 안에서, 앱의 재료로** (기사님 요청)
 *
 * 기사님: *"지금 디자인 딱 좋은데.. 지금꺼 잘 저장해두고 최대한 똑같이
 * 우리프로젝트에 목업으로 만들어줘."*
 *
 * ── 원본 ──
 * 와이어프레임(아코디언)을 **앱의 재료(Tailwind + 테마 토큰)** 로 다시 지은 것이다.
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
 * ── 이 목업이 참이라고 보는 전제 ──
 * 🔴 **원천은 조작판 맨 아래에 화면으로 적어 둔 목록이다** —
 *    문서에만 적으면 목업을 보는 자리에서는 안 읽힌다. 전제가 안 적혀 있으면
 *    목업이 한 경우(예: **3콜**)에 굳어도 아무도 모른다 (기사님).
 *    전제가 틀린 것이 보이면 **그 목록이 먼저 고쳐지고** 그다음에 이 화면이 고쳐진다.
 */

/* ═════════════════════════════════════════════
   앱의 다른 세 영역 — 헤더 · 폰 · 필터
   실제 컴포넌트(Header · DeviceControlPanel · OrderFilterStatus)의 생김새를
   **같은 토큰으로** 옮긴 것이다. 값은 실물 캡처에서 가져온 고정값.
   ═════════════════════════════════════════════ */

/** 🚚 헤더 — 로고 자리가 «내 차 상황»이다 (기사님) */
/**
 * 🧑‍✈️ **헤더가 답하는 것 — 「내 지금 상태」** (기사님)
 *
 * 기사님: *"머리 부분은 **내 현상태**를 표현하고 싶었어. 로그인도 있고 **내 설정을
 * 불러오는 것**도 있고 내 차도, 내 차의 상황도.. 서버랑의 통신도.."*
 *
 * ── 다섯을 말씀하셨다 — 실물에서 비는 칸을 함께 적는다 ──
 * | 로그인 | 아바타 | ✅ |
 * | **설정을 불러왔나** | ⚙️ / ⚠️ | 🔴 **없다** — `GET /settings` 가 `.catch(()=>{})` 로 조용히 삼킨다 (`VehicleStatusPanel`) |
 * | 내 차 | `1t` | ✅ |
 * | 내 차 상황 | 상차·예약 · 적재 · 확신도 | ✅ |
 * | 서버 통신 | 점 + 시계 | ✅ (시계는 **서버 시계**다) |
 *
 * 🔴 **차 이름은 테마 버튼이 아니다** (기사님 확정) — «내 차»라는 뜻과 «테마»라는 손이
 *    **한 칸에 겹치면 안 된다.** 목업에서는 **차를 누르면 설정창**이다 —
 *    자주 보는 것이 자리를 갖고, 가끔 만지는 것은 그 안으로 들어간다.
 *    ⚠️ 실물은 테마를 **서랍 발**에 둔다 (`Drawer`).
 *
 * 🔴 **괄호 안 차종 목록을 넣지 않는다.** `예약 3건 (다마스, 다마스, 다마스)` 는
 *    그것만 **34칸**인데 폰 한 줄이 56칸이다 (실측 — 가장 바쁠 때 60칸).
 *    그 목록은 **콜 목록이 이미 말하고 있다** (규칙 ③).
 */
interface HeaderState {
    /** 🚚 차종 — `user_settings.vehicle_type` */
    car: string;
    /** 📦 상차한 콜 수 · 예약(아직 안 실은) 콜 수 — `liveCalls` 에서 파생 */
    loaded: number;
    reserved: number;
    /** 📦 적재 — `filter.slotsUsed` / 라면박스 100 */
    slots: number;
    /** 적재 확신도 — 추정 · 신고 · 확정 */
    confidence: '추정' | '신고' | '확정';
    /** ⚙️ 설정을 불러왔나 — 정상이면 **안 그린다** */
    settings: 'ok' | 'loading' | 'failed';
    /** 🔌 서버와 이어져 있나 */
    online: boolean;
    clock: string;
    /** 🔔 알람이 울리고 있나 */
    ringing?: boolean;
}

const HEADER_NORMAL: HeaderState = {
    car: '1t', loaded: 0, reserved: 0, slots: 0, confidence: '추정',
    settings: 'ok', online: true, clock: '14:17:22',
};

/**
 * 🎬 **헤더 상황** — 눌러 보고 폭이 터지는 자리를 찾는다.
 * 🔴 실측: 평소 20칸 · **가장 바쁠 때 60칸 > 56칸**.
 */
const HEADER_CASES: Array<{ k: string; t: string; why: string; over: Partial<HeaderState> }> = [
    { k: '평소', t: '평소 — 콜 없음', why: '앉아서 기다리는 중. 20칸', over: {} },
    { k: '예약', t: '예약만 3건', why: '잡았고 아직 상차 전', over: { reserved: 3, slots: 30 } },
    { k: '섞임', t: '상차2 · 예약1', why: '실물이 34칸을 쓰던 자리 — 건수만 남겼다', over: { loaded: 2, reserved: 1, slots: 70, confidence: '신고' } },
    { k: '가득', t: '📦 적재 가득', why: '90/100 — 더 못 싣는다', over: { loaded: 3, reserved: 1, slots: 90, confidence: '확정' } },
    { k: '설정중', t: '⚙️ 설정 불러오는 중', why: '로그인 직후. 차종이 아직 기본값일 수 있다', over: { settings: 'loading' } },
    { k: '설정실패', t: '⚠️ 설정 못 읽음', why: '🔴 지금은 조용히 삼킨다 — 틀린 차종으로 필터가 돈다', over: { settings: 'failed' } },
    { k: '끊김', t: '📵 서버 끊김', why: '시계 자리가 «연결끊김»이 된다', over: { online: false } },
    { k: '알람', t: '🔔 알람이 운다', why: 'STOP SOUND 가 10칸을 밀고 들어온다', over: { ringing: true, reserved: 1, slots: 20 } },
    { k: '최악', t: '🔴 다 겹쳤다', why: '섞임 + 알람 + 설정 실패 — 실물이라면 60칸', over: { loaded: 2, reserved: 1, slots: 88, confidence: '신고', ringing: true, settings: 'failed' } },
];

function MockHeader({ st, onCar }: { st: HeaderState; onCar: () => void }) {
    const busy = st.loaded + st.reserved;
    return (
        <header className="shrink-0 bg-bg-base/95 backdrop-blur-sm border-b border-border-card px-3 py-2.5">
            <div className="flex items-center gap-1.5">
                {/* 🚚 내 차 + 내 차 상황 — 누르면 **설정창** (테마는 그 안에) */}
                <button type="button" onClick={onCar}
                    className="min-w-0 flex items-baseline gap-1.5 text-left active:scale-95 transition-transform">
                    <span className="shrink-0 text-[17px] font-black text-text-primary">{st.car}</span>
                    {busy === 0 ? (
                        <span className="text-[12.5px] font-bold text-text-muted whitespace-nowrap">예약 0건</span>
                    ) : (
                        <span className="text-[12.5px] font-bold whitespace-nowrap">
                            {st.loaded > 0 && <span className="text-success">상차 {st.loaded}</span>}
                            {st.loaded > 0 && st.reserved > 0 && <span className="opacity-40 mx-1">·</span>}
                            {st.reserved > 0 && <span className="text-info">예약 {st.reserved}</span>}
                        </span>
                    )}
                    {busy > 0 && (
                        <>
                            {/* 📦 적재 — 지금은 필터 줄에 있다. 여기로 «옮기면» 두 곳이 안 그린다 */}
                            <span className={`shrink-0 text-[12px] font-black tabular-nums ${
                                st.slots >= 85 ? 'text-warning' : 'text-text-muted'}`}>📦{st.slots}/100</span>
                            <span className={`shrink-0 text-[10px] font-black px-1 py-0.5 rounded ${
                                st.confidence === '확정' ? 'bg-success/15 text-success'
                                : st.confidence === '신고' ? 'bg-info/15 text-info'
                                : 'bg-warning/15 text-warning'}`}>{st.confidence}</span>
                        </>
                    )}
                </button>

                <span className="flex-1 min-w-0" />

                {/* ⚙️ 설정을 불러왔나 — **정상이면 안 그린다** (이상할 때만 자리를 쓴다) */}
                {st.settings !== 'ok' && (
                    <span className={`shrink-0 text-[11.5px] font-black px-1.5 py-0.5 rounded border whitespace-nowrap ${
                        st.settings === 'failed'
                            ? 'border-danger/50 bg-danger/10 text-danger'
                            : 'border-border-card bg-surface-alt/50 text-text-muted'}`}>
                        {st.settings === 'failed' ? '⚠️ 설정 못 읽음' : '⚙️ 불러오는 중'}
                    </span>
                )}

                {st.ringing && (
                    <button type="button"
                        className="shrink-0 h-7 px-2 rounded-md bg-danger text-white text-[10px] font-black tracking-tighter">
                        STOP SOUND
                    </button>
                )}

                {/* 🔌 서버와 이어져 있나 + 시계 */}
                <div className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full ${
                    st.online ? 'bg-surface' : 'bg-danger/10'}`}>
                    {/* 🔴 실물은 여기에 animate-pulse 가 있다 — 목업에서는 일부러 넣지 않는다.
                        지금 볼 것은 생김새이지 깜빡임이 아니다 */}
                    <span className={`w-1.5 h-1.5 rounded-full ${st.online ? 'bg-success' : 'bg-danger'}`} />
                    <span className="text-xs font-mono font-bold text-text-muted tracking-wide tabular-nums">
                        {st.online ? st.clock : '연결끊김'}
                    </span>
                </div>

                {/* 🧑 로그인 — 누르면 설정창 */}
                <button type="button" onClick={onCar}
                    className="shrink-0 w-7 h-7 rounded-full border border-border-card bg-info grid place-items-center text-white text-xs font-bold">
                    알
                </button>
            </div>
        </header>
    );
}

/** 📱 폰 영역 — 스캔폰 한 대의 상태 한 줄 + 모드 셋 */
/** 📱 폰 한 대가 들고 있는 것 — 여럿이라 «줄»과 «한 대»를 가른다 */
interface DeviceOne {
    id: string; name: string; net: string | null; screen: string; seenAt: string;
    mode: string;
    /** 🎯 지금 무엇을 찾나 — 국면·모드에서 **파생**된다 */
    filterBadge: string;
    quiet?: boolean; stuck?: boolean; dead?: boolean; blind?: boolean;
}

/**
 * 📱 **폰이 몇 대인가** — 배차망마다 스캔폰이 하나씩 붙는다 (인성·24시·픽커).
 *
 * 🔴 **폰이 늘면 물음이 바뀐다** — 한 대일 때는 «이 폰이 일하나»지만
 *    여러 대면 «**어느 폰이 문제인가**»다. 정상인 것은 볼 이유가 없다.
 */
const DEVICE_SETS: Record<string, DeviceOne[]> = {
    '1대': [
        { id: 'a', name: 'A24', net: '인성', screen: '콜리스트', seenAt: '13:19', mode: '자동', filterBadge: '첫짐' },
    ],
    '2대': [
        { id: 'a', name: 'A24', net: '인성', screen: '콜리스트', seenAt: '13:19', mode: '자동', filterBadge: '첫짐' },
        { id: 'b', name: 'B12', net: '픽커', screen: '홈', seenAt: '13:19', mode: '알람', filterBadge: '합짐' },
    ],
    '3대': [
        { id: 'a', name: 'A24', net: '인성', screen: '콜리스트', seenAt: '13:19', mode: '자동', filterBadge: '첫짐' },
        { id: 'b', name: 'B12', net: '픽커', screen: '홈', seenAt: '13:19', mode: '알람', filterBadge: '합짐' },
        { id: 'c', name: 'C7', net: '24시', screen: '콜리스트', seenAt: '13:18', mode: '자동', filterBadge: '첫짐', quiet: true },
    ],
    '2대 · 하나 끊김': [
        { id: 'a', name: 'A24', net: '인성', screen: '콜리스트', seenAt: '13:19', mode: '자동', filterBadge: '첫짐' },
        { id: 'b', name: 'B12', net: null, screen: '접근성 꺼짐', seenAt: '12:58', mode: '알람', filterBadge: '합짐', dead: true },
    ],
};

/**
 * 📱 **폰이 처할 수 있는 상황들** (기사님: *"상황별로 버튼을 만들어
 *    눌러 보게 만들어 줄 수 있어?"*).
 *
 * 🔴 **한 곳에 둔다** — 버튼도 폰 줄도 여기를 본다. 두 벌이면 «버튼은 있는데 화면이
 *    안 바뀌는» 자리가 생긴다 (규칙 ③).
 * 🔴 값은 **실측 목록**에서 왔다 — 지어낸 조합이 아니다.
 */
const DEVICE_CASES: Array<{ k: string; t: string; why: string; over: Record<string, unknown> }> = [
    { k: '평소', t: '평소', why: '늘 보이는 것만 — 접근성은 폰 이름의 색이라 0칸', over: {} },
    { k: '짧게', t: '가장 짧게', why: '픽커 홈. 이보다 짧을 수 없다', over: { name: 'A1', net: '픽커', screen: '홈' } },
    { k: '조용', t: '⏱️ 조용하다', why: '30초 넘게 말이 없다 — ⏱️ 만 붙는다', over: { quiet: true } },
    { k: '안잡힘', t: '🔴 안 잡힌다', why: '통과 0 — 성적표가 그때만 자리를 얻는다', over: { stuck: true } },
    { k: '눈가림', t: '👁️ 눈이 가렸다', why: '화면은 켜져 있는데 접근성이 막혀 못 읽는다 (15초 유예 뒤)', over: { blind: true } },
    { k: '화면꺼짐', t: '💤 화면 꺼짐', why: '배차망·화면명이 함께 사라진다 — 배지가 이것 하나뿐', over: { net: null, screen: '💤 화면 꺼짐' } },
    { k: '두절', t: '📵 통신 두절', why: '이름이 붉게 깜빡이고 왜 끊겼는지가 화면 이름 대신 온다', over: { dead: true, net: null, screen: '연결 끊김', seenAt: '13:02' } },
    { k: '접근성', t: '📵 접근성 꺼짐', why: '끊긴 까닭을 들었을 때 — 하실 일이 다르다', over: { dead: true, net: null, screen: '접근성 꺼짐', seenAt: '12:58' } },
    { k: '가장길게', t: '🔴 가장 길게', why: '알 수 없는 화면 + 조용 + 성적표. 동시에 참이기 어렵다 — 화면을 모르면 스캔도 못 한다',
      over: { name: '1234', net: '픽커', screen: '알수 없는 화면', quiet: true, stuck: true } },
];

/** 📏 그 상황에서 한 줄이 몇 칸인가 — 폰 한 줄은 56칸 */
function caseWidth(over: Record<string, unknown>): number {
    return textWidth([
        (over.name as string) ?? 'A24',
        `${over.net === null ? '' : ((over.net as string) ?? '인성')}${(over.screen as string) ?? '콜리스트'}`,
        (over.seenAt as string) ?? '13:19',
        over.quiet ? '⏱️' : '', over.blind ? '👁️' : '',
        over.stuck ? '본 42 · 통과 0 요금12' : '', '자동',
    ].filter(Boolean).join(' '));
}

/**
 * 📱 **폰 한 대 = 한 줄** (기사님 확정 — *"폰 하나당 한 줄씩 해줘"*)
 *
 * 🔴 **가로로 흘리지 않는다.** 폰 셋을 옆으로 이으면 ≈73칸이라 넘치고,
 *    넘친 것을 **가로 스크롤**로 두면 *"폰 상황을 볼 수가 없다"* — 밀려난 폰은
 *    **없는 것과 같다.** 관제의 물음이 «어느 폰이 문제인가»인데 그 폰이 화면 밖이면
 *    답을 못 한다. **세로로 쌓으면 몇 대든 전부 한눈에 든다.**
 *
 * 한 줄의 짜임: **이름(누르면 열린다)** · 배지 · 👁️ · 시각 · ⏱️ · 성적표 ―――― 모드
 * **모드는 오른쪽 끝에 고정**한다 — 폰마다 자리가 같아야 눈이 안 헤맨다.
 *
 * 🔴 **접힌 넷도 폰마다 하나씩**이라 그 폰 줄 **바로 아래**에 편다.
 *    한군데 몰아 두면 «누구 것인지»를 다시 읽어야 한다.
 */
const MODES = ['자동', '알람', '직접'];
/**
 * 📐 **모드 버튼 치수** — 레이어를 열어도 «선택된 것»이 **닫혔을 때 그 자리**에 오게 한다.
 *
 * 🔴 기사님 지적: *"버튼 모음에 레이어 박스가 있어서 기존 버튼과 위치가 다르다."*
 *    레이어의 오른쪽 끝만 맞추면 **선택된 것이 왼쪽으로 밀려난다** — 눌렀더니
 *    방금 본 배지가 딴 데로 간다.
 * 🔴 **폭이 정해져야 산수가 된다.** 자동·알람·직접이 모두 두 글자라 한 칸으로 고정했다.
 *    닫힌 버튼도 같은 폭이라 레이어가 열려도 **그 칸이 그대로 덮인다.**
 */
const MODE_W = 48;            // 버튼 한 칸
const MODE_PAD = 5;           // 레이어 안쪽 여백 p-1(4) + 테두리(1)

/**
 * 🔴 **레이어는 «그걸 눌렀다»는 자리다** (기사님)
 *
 * *"버튼 레이어는 그걸 눌렀다는 거고, **순서를 바꿔서** 정렬하면 될 것 같은데."*
 *
 * 셋을 다 만족시켜야 한다 —
 * | 가 | 배지 자리가 **폰마다 같다** | 눈으로 훑는다 |
 * | 나 | 열어도 **선택된 것이 안 움직인다** | 방금 본 글자가 제자리 |
 * | 다 | 레이어가 **화면 안에 있다** | 누를 수 있다 |
 *
 * 순서를 고정한 채 레이어를 **선택 순번만큼 밀면** 「자동」에서 104px 이
 * 화면 밖으로 나간다. 버튼이 이미 오른쪽 끝이라 **밀 자리가 없다.**
 *
 * 기사님 해법이 그 매듭을 푼다 — **순서를 바꾸면 밀 필요가 없다.**
 * **선택된 것을 끝에 두고** 레이어는 그 자리에 붙인 채 **나머지가 왼쪽으로 펴진다.**
 * ⚠️ 기사님은 «왼쪽 정렬»이라 하셨는데, 버튼이 **오른쪽 끝**이라 오른쪽으로 펴면
 *    90px 이 또 나간다. **같은 발상을 좌우만 뒤집어** 붙인다.
 *
 * 👉 셋이 다 선다.
 */

function DeviceOneRow({ d, mode, pending, open, more, onPick, onOpen, onMore }: {
    d: DeviceOne; mode: string; pending: string | null; open: boolean; more: boolean;
    onPick: (m: string) => void; onOpen: (v: boolean) => void; onMore: (v: boolean) => void;
}) {
    return (
        /**
          * 🔴 **한 대가 한 덩어리다** (기사님: *"폰이 덩어리감이 없어
          *    한 줄 더보기 하면 어디가 어딘지 모르겠어"*).
          *
          * 줄 사이에 선을 긋고 바탕을 엇갈리는 것으로는 모자라다 — 접힌 줄을 펴는 순간
          * **두 줄이 이웃 폰과 섞인다.** 테두리로 **묶어야** 편 줄이 누구 것인지 보인다.
          */
        <div className="rounded-lg border border-border-card bg-surface-alt/30 overflow-hidden">
            <div className="flex items-center gap-1.5 px-2.5 py-1">
                {/**
                  * 🔴 **이름이 곧 손잡이다** (기사님: *"폰 이름을 클릭하면
                  *    하단 열림하면 「⋯」 은 필요 없을 것 같다.. **공간을 아껴야 해**"*).
                  *    「⋯」 는 «여기를 누르세요»만 말하는 칸이라 두지 않는다 — 이름이 이미 그 폰을
                  *    가리키므로 **한 칸을 통째로 아낀다.**
                  * 🔴 열려 있음은 **이름 색과 밑줄**이 말한다 — 새 칸을 안 쓴다.
                  */}
                <button type="button" onClick={() => onMore(!more)}
                    className={`shrink-0 text-[14px] font-black ${
                        d.dead ? 'text-danger animate-pulse' : d.blind ? 'text-text-muted' : 'text-success'} ${
                        more ? 'underline underline-offset-2' : ''}`}>{d.name}</button>
                <span className={`shrink-0 px-1.5 rounded border text-[13px] whitespace-nowrap ${
                    d.dead ? 'border-border bg-surface-alt/40 text-text-muted' : 'border-border-card text-text-primary'}`}>
                    {d.net && <span className="text-info font-black mr-1">{d.net}</span>}{d.screen}
                </span>
                {/**
                  * 🔴 **필터 배지는 접지 않고 줄에 둔다** (기사님: *"합짐 첫짐
                  *    이것만 위로 올려줘"*). 자리는 **화면명 바로 뒤 · 시각 앞**이다
                  *    (기사님이 순서까지 지정하셨다) — «어느 화면에서 **무엇을** 찾나»가
                  *    한 문장으로 이어지고, 시각부터는 «언제·어떤가»로 갈린다.
                  */}
                {d.blind && <span className="shrink-0 text-[12.5px]" title="접근성이 막혀 못 읽는다">👁️</span>}
                <span className="shrink-0 px-1.5 rounded border border-info/40 bg-info/10
                                 text-[12.5px] font-extrabold text-info">{d.filterBadge}</span>
                <span className="shrink-0 text-[12.5px] text-text-muted tabular-nums">{d.seenAt}</span>
                {d.quiet && <span className="shrink-0 text-[12.5px]" title="30초 넘게 말이 없다">⏱️</span>}
                {d.stuck && (
                    <span className="min-w-0 truncate text-[11.5px] font-bold text-warning tabular-nums">
                        본 42 · 통과 0 <b>요금12</b>
                    </span>
                )}

                {/* 오른쪽 끝 — 폰마다 자리가 같다 */}
                <span className="flex-1" />

                {/* 🎛️ 모드는 **폰마다 하나씩** — 픽커만 대기로 두고 싶을 때가 있다 */}
                <span className="shrink-0 relative">
                    <button type="button" onClick={() => onOpen(!open)}
                        style={{ width: MODE_W }}
                        className={`relative py-0.5 rounded-md text-[13px] font-black border transition-opacity ${
                            pending ? 'opacity-40' : ''} bg-warning/15 border-warning/45 text-warning`}>
                        {mode}
                    </button>
                    {pending && (
                        <span className="absolute inset-0 grid place-items-center pointer-events-none">
                            <span className="w-3.5 h-3.5 rounded-full border-2 border-warning/30 border-t-warning animate-spin" />
                        </span>
                    )}
                    {open && (
                        /* 🔴 오른쪽 끝을 맞추고 **왼쪽으로** 펴진다 — 화면 밖으로 안 나간다 */
                        <span style={{ right: -MODE_PAD }}
                            className="absolute top-1/2 -translate-y-1/2 z-30 flex gap-1 p-1 rounded-lg
                                       bg-surface border border-border shadow-lg">
                            {[...MODES.filter(m => m !== mode), mode].map(m => (
                                <button key={m} type="button" onClick={() => onPick(m)} style={{ width: MODE_W }}
                                    className={`py-0.5 rounded-md text-[13px] font-black border whitespace-nowrap ${
                                        m === mode ? 'bg-warning/15 border-warning/45 text-warning'
                                                   : 'bg-surface-alt/40 border-border-card text-text-primary hover:border-warning/45'}`}>
                                    {m}
                                </button>
                            ))}
                        </span>
                    )}
                </span>

            </div>

            {/* 접힌 셋 — **그 폰 카드 안**에 편다. 선 하나로 «같은 폰의 아랫단»임을 말한다 */}
            {more && (
                <div className="flex items-center gap-2 px-2.5 py-1 border-t border-border-card
                                bg-surface/40 text-[12px] text-text-muted tabular-nums flex-wrap">
                    <span className="px-1.5 rounded border border-border bg-surface-alt font-bold">대기</span>
                    <span>수집1234 수락5</span>
                    {/**
                      * 🔴 **빌드 번호 대신 «취소 한도»를 둔다** (기사님).
                      *    `(49)` 는 버전명이 이미 답하는 것이라 자리를 두 번 쓴다.
                      *    배차망 **취소 10회**는 걸리면 그 폰이 **그날 일을 못 하는** 한도다
                      *    — 누적 안에 `취소2` 로 묻으면 한도가 안 보인다.
                      */}
                    <span className="px-1.5 rounded border border-warning/40 bg-warning/10 font-extrabold text-warning">
                        취소 2/10
                    </span>
                    <span className="opacity-70">2.9.1-hello</span>
                </div>
            )}
        </div>
    );
}

/**
 * 📱 **폰 영역 — 자리값 하는 것만 늘 보인다** (엄선 확정)
 *
 * ── 관제가 답해야 하는 물음은 셋이다 ──
 * | 폰이 살아 있나 | 마지막 보고 시각 · 조용한가 · 접근성(폰 이름 색) |
 * | 지금 어디 있나 | 배지 (배차망 + 화면명) |
 * | **왜 하나도 안 잡나** | 성적표 — **안 잡힐 때만** |
 * 여기에 손이 닿는 **모드** 하나가 붙는다.
 *
 * 🔴 **한 줄에 다 넣으면 116칸인데 폰 한 줄은 56칸이다** (실측).
 *    그래서 셋을 접는다 — 누적(20칸) · 버전(16) · 작업 단계(13).
 *    필터 배지(9)는 기사님 지시로 줄에 둔다.
 * 🔴 **`👀`(잘 돈다)를 안 그린다** (기사님 확정) — 이상할 때만 자리를 쓴다.
 * 🔴 **성적표는 통과가 0일 때만** — 잘 잡히면 볼 이유가 없다.
 *
 * 🔴 **폰이 여럿이면 세로로 쌓는다** — 가로로 밀면 밀려난 폰을 못 본다.
 *    값은 **높이**로 치른다: 한 대 26px · 세 대 78px.
 */
function MockDevicePanel({ devices, modeOf, pendingOf, openId, onPick, onOpen, moreId, onMore }: {
    devices: DeviceOne[];
    modeOf: (id: string) => string; pendingOf: (id: string) => string | null;
    openId: string | null; onPick: (id: string, m: string) => void; onOpen: (id: string | null) => void;
    moreId: string | null; onMore: (id: string | null) => void;
}) {
    return (
        <div className="shrink-0 border-b border-border-card px-2 py-1.5 space-y-1">
            {devices.map(d => (
                <DeviceOneRow key={d.id} d={d}
                    mode={modeOf(d.id)} pending={pendingOf(d.id)}
                    open={openId === d.id} more={moreId === d.id}
                    onOpen={(v) => onOpen(v ? d.id : null)}
                    onMore={(v) => onMore(v ? d.id : null)}
                    onPick={(m) => onPick(d.id, m)} />
            ))}
        </div>
    );
}


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
        /* 🔴 **카드 여백을 두지 않는다** (기사님: *"그리드가 안 맞아서 불편해 보여"*).
           `mx-3` 카드에 안쪽 `px-[18px]` 을 더하면 글이 30px 에서 시작해, 헤더(12px)·폰(12px)과
           **세로선이 셋으로 갈린다.** 위쪽 영역은 전부 같은 자리에서 시작한다. */
        <div className="shrink-0 border-b border-border-card flex flex-col"
            style={{ background: 'linear-gradient(180deg, var(--color-surface-alt), var(--color-surface))', height: 150 }}>
            {/* 머리글 — 방향 문장부터 (국면명은 아래 버튼이 말한다 — 두 번 적지 않는다) */}
            <div className="flex items-center gap-2 px-3 flex-1 text-[14px] border-b border-border-card">
                <span className="font-bold truncate text-text-muted">
                    여기서 <b className="text-text-primary">10km</b> → <b className="text-text-primary">서울 1km</b>
                </span>
                <span className="ml-auto shrink-0 font-black text-[14px] text-info">합짐 탐색중</span>
                <span className="shrink-0 text-sm text-text-muted">⚙️</span>
            </div>
            {/* 지표 — 순서 고정 💰 금액 · 📍 지역 · 📦 적재.
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

/* 🎬 **3콜·4콜·5콜 세 경우는 [mockPlans.ts] 에 있다** — 정거장·경로선·궤적·콜 목록.
   조작판에서 갈아 끼운다. 한 곳에서만 만든다 (규칙 ③). */

/** 6단계 — 한 장에 «그 단계에서 할 일 하나»만 둔다 */
/**
 * 🌱 **6단계 — 실물 단계 시트를 그대로 쓴다** (기사님:
 *    *"콜의 스텝의 모든 요소를 목업으로 가져와"*).
 *
 * 🔴 **목업용 스텝을 따로 그리지 않는다** — 지도·심사석과 같은 원칙이다 (규칙 ③).
 *    `StepSheetMock` 은 이미 여섯 단계가 다 살아 있다: 적재 단위·개수·방법·보호·후작업·
 *    성질·도착 사유·약속 격자·계획 대 실측까지.
 * 🔴 **`orderId` 를 안 준다** — 그러면 저장이 안 나가고 **그리기만** 한다.
 *    목업에서 누른 것이 실제 콜을 건드리면 안 된다.
 *
 * `step` 은 실물이 갈래를 나누는 코드다 — 통화/도착/완료와 상차/하차가 여기서 갈린다.
 */
const STEPS = [
    { k: '상차지 통화', side: 'p', kind: 'call',   step: 'CALL_PICKUP' },
    { k: '상차지 도착', side: 'p', kind: 'arrive', step: 'ARRIVE_PICKUP' },
    { k: '상차 완료',   side: 'p', kind: 'load',   step: 'LOADED' },
    { k: '하차지 통화', side: 'd', kind: 'call',   step: 'CALL_DROPOFF' },
    { k: '하차지 도착', side: 'd', kind: 'arrive', step: 'ARRIVE_DROPOFF' },
    { k: '하차 완료',   side: 'd', kind: 'unload', step: 'DELIVERED' },
] as const;

/* ── 작은 부품 — 원본의 생김새를 토큰으로 옮긴 것 ── */




/**
 * 🎨 **시각이 «달라졌음»을 색으로 말한다**.
 *
 * 펼친 칸에는 상차·하차 줄이 없다(타이틀과 중복) — **바뀌기 전 시각과 차이**를 적을 자리가 없다.
 * 🔴 바뀌기 전 시각은 **지나간 값**이라 안 보여도 된다. 남은 것은 «달라졌나»뿐이고
 *    그것은 **색이 답한다** — 밀리면 노랑, 당겨지면 초록, 그대로면 무채색.
 * 🔴 몇 분인지는 심사 중이면 **심사석 위 한 줄**이 이미 말한다 (규칙 ③ — 두 번 안 적는다).
 */
function clockTone(gap?: string): string {
    const tone = gapTone(parseFloat(gap ?? '') || 0);
    return tone === 'bad' ? 'text-warning' : tone === 'good' ? 'text-success' : 'text-text-muted';
}

/**
 * 🌱 **한 스텝 장 — 실물 단계 시트를 그대로 쓴다** (기사님)
 *
 * 🔴 **목업용 스텝을 따로 그리지 않는다.** 칩 몇 개로 흉내 내기에는
 *    실물(`StepSheetMock`)에 훨씬 많은 것이 이미 살아 있다 —
 *    적재 단위·개수·방법·🔒보호·🧹후작업·성질 딱지·도착 사유·약속 격자·
 *    **계획 대 실측**(«14분 예측 → 19분 실제»)까지.
 *    흉내를 유지하면 목업에서 정한 것이 실물과 갈라진다 (규칙 ③).
 *
 * 🔴 **`orderId` 를 안 준다** — 그러면 저장이 소켓으로 안 나가고 **그리기만** 한다.
 *    목업에서 누른 것이 실제 콜을 건드리면 안 된다.
 * 🔴 **`row` 는 실주행 실측에서 온다** — 지어낸 값을 넣지 않는다 (규칙 ④).
 *    아직 신고가 없는 칸은 **비운다** — 그러면 실물이 «아직 안 정해졌다»로 그린다.
 */
function PaneBody({ call, si, onMock }: { call: Call; si: number; onMock?: (what: string) => void }) {
    const st = STEPS[si];
    const [nm, addr, tel] = call.site[st.side];
    const promise = call.stops[st.side === 'p' ? 0 : 1];
    /** 🕒 목업은 «오늘»이 없다 — 09-03 그날의 시각을 ISO 로 만든다 */
    const iso = (hhmm: string) => {
        const m = hhmm.match(/(\d{1,2}):(\d{2})/);
        return m ? `2026-09-03T${m[1].padStart(2, '0')}:${m[2]}:00+09:00` : undefined;
    };
    return (
        <StepSheetMock
            view={{
                step: st.step,
                label: st.k,
                born: true,
                row: {
                    status: si < call.now ? 'DONE' : 'PLANNED',
                    occurred_at: call.stamp[si] ? iso(call.stamp[si]) : null,
                    source: call.stamp[si]?.includes('자동') ? 'AUTO' : call.stamp[si] ? 'MANUAL' : null,
                    predicted_at: iso(promise.now),
                    promised_arrival_at: iso(promise.now),
                    /* 📦 배차망이 말한 품목만 있다 — 신고(단위·개수·방법)는 아직 없다.
                       비워 두면 실물이 «아직 안 정해졌다»로 그린다 (규칙 ④) */
                    planned_source: call.item ? 'MEMO' : null,
                },
            }}
            place={{ name: nm, address: addr, phone: tel }}
            prevName={st.side === 'd' ? call.p : null}
            /* 🎛️ **목업에서만 눌린다** — 저장은 안 나간다(`orderId` 를 안 주므로).
               「눌러도 아무 일 없는」 화면을 만들지 않는다 (기사님 2026-09-05) */
            onMock={onMock}
        />
    );
}


function CallItem({ call, i, open, onToggle, rainbow, visitedNos, fit, push, onMock }: {
    call: Call; i: number; open: boolean; onToggle: () => void; rainbow: boolean;
    visitedNos: Set<number>;
    /** 🎛️ 목업에서만 — 스텝 버튼을 눌렀을 때 (저장은 안 나간다) */
    onMock?: (what: string) => void;
    /**
     * ⏱️ **심사 중인 콜이 앞에 끼면 이 콜이 몇 분 밀리나** (기사님 «심사 중에 미리»).
     *    🔴 **아직 안 잡은 콜 때문에 바뀌는 값**이라, 화면이 «바뀌기 전 시각 → 바뀐 시각»을
     *       나란히 적어 **무엇이 달라지는지**를 그대로 보인다.
     */
    push?: number;
    /**
     * 📏 **시트가 «내용만큼» 설 때** — 펼친 칸이 `flex-1`(= `flex:1 1 0%`)이면
     *    남는 공간이 없어 **높이 0 으로 찌부러진다.** 그때는 내용만큼(`flex:1 1 auto`) 서야 한다.
     */
    fit?: boolean;
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
     * 그래야 «저 동그라미가 목록의 몇 번 줄인가»를 눈으로 잇는다 (기사님 지적).
     */
    const node = (n: number, kind: 'p' | 'd') => rainbow ? (
        /* 🔍 지도는 12px 마커가 좋다 하셨고, **목록은 좀 작아도 된다** (기사님).
           🔴 `leading-none` 이 핵심이다 — 물려받은 줄 높이(1.6)가 숫자를 아래로 밀어
              동그라미 가운데를 벗어난다. 기사님이 `line-height: initial` 로 찾으신 그 자리인데,
              **전역 유틸리티(.text-[14px])를 덮지 않고** 이 자리에만 준다 (다른 화면이 조용히 바뀐다). */
        <span className="shrink-0 w-[20px] h-[20px] rounded-full grid place-items-center text-[12.5px] font-black leading-none"
            style={(() => {
                /* 🔴 **목록 인덱스가 아니라 `callNo` 로 칠한다**.
                   인덱스로 칠했더니 시나리오 판에서 **지도와 목록이 다른 색**이 됐다
                   (기사님: *"지금 색이 지도랑 리스트가 같지 않아"*). 지도·상태바가 쓰는
                   입력과 같아야 «같은 콜»이 눈으로 이어진다 (규칙 ③ · ⑤-3). */
                const fill = callNodeFill(call.callNo, kind === 'p' ? 'pickup' : 'dropoff', theme);
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
        <div className={`flex flex-col min-h-0 ${open ? (fit ? 'flex-auto' : 'flex-1') : 'flex-none'}`}>
            {/* ── 헤더: 접혀도 늘 보인다. 눌러서 토글 ── */}
            <button
                type="button" onClick={onToggle} aria-expanded={open}
                className={`shrink-0 h-[38px] w-full flex items-center gap-1.5 px-2.5 rounded-[9px] border text-left transition-colors ${open
                    ? 'bg-info/15 border-info/55'
                    : 'bg-surface-alt/40 border-border-card hover:border-border-hover'}`}
            >
                {/* 🔴 ▶ 아이콘은 두지 않는다 (기사님: *"공간이 부족하다"*).
                    열렸는지는 **바탕색·번호색**이 이미 말한다 — 같은 것을 두 번 그리지 않는다. */}
                <span className={`shrink-0 w-3 text-[13.5px] font-black tabular-nums ${open ? 'text-info' : 'text-text-muted'}`}>{i + 1}</span>
                {/* 🔴 **열을 고정한다** (기사님: *"일단 라인에 맞춰야 할 것 같아"*).
                    예전에는 시각이 있는 콜·없는 콜에 따라 화살표와 시각이 **줄마다 다른 자리**에
                    있었다 — 달리면서 훑을 때 눈이 매번 다시 찾아야 했다.
                    지명·시각 칸을 **폭 고정**으로 두면 세 줄이 한 표처럼 읽힌다.
                    시각 칸은 비어도 자리를 지킨다 — 그게 열을 만드는 값이다. */}
                <span className="flex-1 min-w-0 flex items-center gap-1 text-[13.5px] font-bold text-text-primary">
                    {node(call.nodes[0], 'p')}
                    <span className="w-[4em] shrink-0 truncate">{call.p}</span>
                    <span className="w-[3.5em] shrink-0 text-[12px] tabular-nums text-right">
                        {push ? <span className="text-warning">{pushClock(call.headAt[0], push)}</span>
                              : <span className={clockTone(call.stops[0].gap)}>{call.headAt[0]}</span>}
                    </span>
                    <span className="shrink-0 text-text-muted/70 px-0.5">→</span>
                    {node(call.nodes[1], 'd')}
                    <span className="w-[4em] shrink-0 truncate">{call.d}</span>
                    <span className="w-[3.5em] shrink-0 text-[12px] tabular-nums text-right">
                        {push ? <span className="text-warning">{pushClock(call.headAt[1], push)}</span>
                              : <span className={clockTone(call.stops[1].gap)}>{call.headAt[1]}</span>}
                    </span>
                </span>
                <span className="shrink-0 flex gap-[2px]" aria-hidden>
                    {STEPS.map((_, k) => (
                        <span key={k} className={`block w-[7px] h-[5px] rounded-full ${k < call.now ? 'bg-success' : k === call.now ? 'bg-info' : 'bg-surface-hover'}`} />
                    ))}
                </span>
            </button>

            {/* ── 펼친 칸 = 위·아래 두 덩어리 ── */}
            {open && (
                /**
                 * 🔴 **넘친 것이 밖으로 그려지지 않게 한다** (기사님 실물:
                 *    *"시트 반만 열기에서만 겹침이 발생해"*).
                 *    펼친 칸이 `overflow` 없이 열려 있으면, 자리가 모자랄 때 내용이 상자를 넘어
                 *    **다음 콜 헤더 위에 올라탄다.**
                 * 🟢 다만 **잘라 감추지 않고 스크롤**한다 — 위 덩어리는 다 보여야 하고,
                 *    모자라면 손으로 내려 보는 것이 «없는 것»보다 낫다 (규칙 ④).
                 */
                <div className={`${fit ? 'flex-auto max-h-[46vh]' : 'flex-1 min-h-0'} mt-1.5 flex flex-col overflow-y-auto rounded-b-[10px] border border-t-0 border-border-card bg-bg-base`}>

                    {/**
                     * 위 — 콜 전체를 아우르는 것. 스텝이 넘어가도 안 바뀐다.
                     * 🔴 **절대 안 줄어든다** (기사님: *"위 덩어리는 내용이 다 보여야 해.
                     *    반만 열었다는 건 전체적으로 어떤 콜이 있는지 보기 위함"*).
                     *    반만 여는 목적이 «어떤 콜이 있나»라서 여기가 잘리면 그 목적이 무너진다.
                     *    ⚠️ 좁을 때 여기를 줄이면 정작 볼 것이 사라진다.
                     * 🔴 자리가 모자라면 **펼친 칸이 세로로 스크롤**한다 — 잘라서 감추지 않는다 (규칙 ④).
                     */}
                    <div className="shrink-0 px-3 pt-2.5 pb-3 border-b border-border-card">
                        <div className="flex items-center gap-1.5 flex-wrap text-[11.5px] text-text-muted">
                            <span>{call.no}.</span>
                            <span>{call.grabbed}</span>
                            {/* 🚚 **이 콜이 부르는 차종** — 단가가 여기서 나온다 (내 차종은 폴백일 뿐) */}
                            <span className="px-1.5 rounded-[5px] text-[11px] font-black border
                                             bg-surface-alt border-border-card text-text-primary">{call.vehicle}</span>
                            {/* 💸 **콜마다 다른 값이다** — 한 값(「23%」)으로 박으면 어느 콜을 펼쳐도 같아진다 */}
                            <span>수수료 {call.commission}</span>
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

                        {/**
                          * 🔴 **상차·하차 줄을 두지 않는다** (기사님: *"타이틀하고 중복인 것
                         *    같은데 이걸 지우고 타이틀에 다 표현할 수 있지?"*).
                         *
                         * 타이틀이 이미 «① 석수동 ~14:17 → ③ 구로동 ~15:31» 을 다 그린다.
                         * 그 줄에만 있을 것은 **바뀌기 전 시각(취소선)과 차이(-4분)** 둘뿐인데:
                         *   · 바뀌기 전 시각은 **지나간 값**이다 — 지금 몇 시인지만 알면 된다
                         *   · 차이는 **색**이 말한다 (밀리면 노랑·당겨지면 초록).
                         *     몇 분인지는 심사 중이면 심사석 위 한 줄이 이미 말한다
                          */}
                        <div className="mt-2.5 flex gap-1.5 flex-wrap text-[11px] font-black">
                            {/**
                              * 📦 **짐을 칩으로** (기사님) — 적요 문장 속에 묻히면 안 보인다.
                              * 🔴 이것은 **배차망이 말한 품목**(`itemDescription`)이지 적재 계산의
                              *    근거가 아니다. 그것은 통화·신고로 채워지는 `CargoReport` 이고
                              *    헤더의 `📦 90/100` 이 그 결과다 — **신고가 오면 그것이 이긴다.**
                              * 🔴 없으면 안 그린다 — 적요에서 짜내지 않는다 (규칙 ④).
                              */}
                            {call.item && (
                                <span className="px-2 py-1 rounded-md border bg-surface-alt/60 border-border-card text-text-primary">
                                    📦 {call.item}
                                </span>
                            )}
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
                     * 🔴 **양보하지 않는다** — 최소 높이를 지키고, 자리가 모자라면 펼친 칸이 스크롤한다.
                     *    반만 열었을 때는 위 덩어리가 먼저 보이고 스텝은 **아래로 밀린다** —
                     *    그때 보시려는 건 «어떤 콜이 있나»이지 «지금 할 일»이 아니다.
                     *    스텝이 필요하면 시트를 **전체로** 올린다.
                     */}
                    <div className="shrink-0 flex-1 min-h-[220px] flex flex-col">
                        {/* 🔴 **점은 가운데 고정** (기사님: *"단어에 따라 스와이프
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
                                    <PaneBody call={call} si={k} onMock={onMock} />
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
    /** 🪟 콜이 없으니 «나」가 곧 한 줄이다 — 지도가 가장 넓게 열린다 */
    const [snap, setSnap] = useState<SheetSnap>('list');
    /**
     * 📏 **시트가 실제로 덮는 높이** — 지도 위 버튼(경로 방침 · QR 코드)이 이걸 본다.
     *
     * 🔴 `aboveSheet(snap)` 은 «snap 이 정한 높이»를 답한다. 시트가 «내용만큼» 서면
     *    **그 값과 실제가 갈라져** 버튼들이 엉뚱한 자리에 뜬다
     *    (기사님). 시트가 재서 알려 주는 값 하나만 본다 (규칙 ③).
     */
    const [sheetPx, setSheetPx] = useState(0);
    const aboveSheetPx = `${sheetPx + 12}px`;
    /** 🎯 필터 영역 — 안 A(펼침 150px) ↔ 안 B(접힘 38px). 비교해서 고른다 */
    const [filterCompact, setFilterCompact] = useState(true);   // ⓑ 가 기본이라 필터도 접힌 채로 연다
    /** 🌈 콜 색표 — 색상=콜 · 채도=상차/하차 · 테두리=다녀왔나 (기사님 안) */
    const [rainbow, setRainbow] = useState(true);
    /**
     * 📱 **모드는 왕복이다** — 관제가 바꿔도 **앱이 가져가야 참이 된다**
     *    그래서 값이 둘이다:
     *      `deviceMode`  앱이 마지막으로 «나 이거다»라고 말한 것 — **화면이 그리는 값**
     *      `modePending` 관제가 보냈고 **아직 대답을 못 들은 것**
     * 🔴 보낸 값을 미리 그리면 화면이 «벌써 됐다»고 거짓말한다.
     */
    /** 🔴 **폰마다 하나씩** — 픽커만 대기로 두고 싶을 때가 있다 */
    const [deviceModes, setDeviceModes] = useState<Record<string, string>>({});
    const [modePendings, setModePendings] = useState<Record<string, string>>({});
    const [modeOpenId, setModeOpenId] = useState<string | null>(null);
    /** 📂 접힌 셋 (작업 단계·누적·취소 한도·버전) — 폰 이름을 누르면 열린다 */
    const [deviceMore, setDeviceMore] = useState<string | null>(null);
    /**
     * 📱 **지금 어느 상황인가** — 값은 `DEVICE_CASES` 한 곳에서 온다 (규칙 ③).
     *    조작판 버튼이 이것만 바꾸면 폰 줄이 따라온다.
     */
    /** 🧑‍✈️ 헤더가 지금 무슨 상황인가 */
    const [headerCase, setHeaderCase] = useState('평소');
    const header: HeaderState = {
        ...HEADER_NORMAL,
        ...(HEADER_CASES.find(c => c.k === headerCase)?.over ?? {}),
    };

    const [deviceCase, setDeviceCase] = useState('평소');
    const deviceOver = DEVICE_CASES.find(c => c.k === deviceCase)?.over ?? {};
    /** 📱 지금 폰이 몇 대인가 */
    const [deviceSet, setDeviceSet] = useState('1대');
    /**
     * 🔴 **상황은 «첫 폰»에만 덮는다** — 폰 수와 무관하다. 그래야 «2대인데 하나가
     *    끊겼다» 같은 것을 상황 버튼 하나로 볼 수 있다 (손잡이를 둘로 두지 않는다).
     */
    const devices = (DEVICE_SETS[deviceSet] ?? DEVICE_SETS['1대'])
        .map((d, i) => (i === 0 ? { ...d, ...deviceOver } : d)) as DeviceOne[];
    /**
     * 🔴 **몇 콜짜리인가** — 3콜은 **상한이 아니다** (기사님:
     * *"최대한 많이 합짐하면 매출이 많아진다"*).
     * 콜이 넷이면 정거장 8개, 다섯이면 10개다 — **QR 이 몇 번인지도, 아코디언이 넘치는지도
     * 콜 수를 갈아 끼워야 보인다.**
     */
    /**
     * 🎬 **시나리오 단계** — 기사님이 적어 주신 한 사이클 (scenario.ts).
     *
     * 🔴 **켜지면 시나리오가 콜 수·국면·QR 을 다 정한다** — 손잡이가 둘이면 갈라진다 (규칙 ③).
     *    끄면 콜 수(3·4·5콜)를 손으로 고르는 자리가 된다.
     */
    /**
     * 🎬 **처음 열면 「① 콜 대기」다** (기사님:
     *    *"처음 새로고침 하면 모든 콜이 없는 걸로 시작하면 좋겠고"*).
     *
     * 🔴 이 목업은 **한 사이클을 보는 자리**다. 콜 셋이 이미 놓인 채로 열리면
     *    «어떻게 거기까지 갔는지»가 통째로 빠진다 — 그 흐름이 이 화면의 전부다.
     *    빈 화면에서 시작해 콜이 하나씩 붙는 것을 보는 것이 맞다.
     */
    /**
     * 🔗 **장면을 주소로 고른다** — `?step=12`.
     * 🔴 화면을 **찍어서 대조**하려면 손으로 조작판을 누를 수가 없다. 링크로 열리면
     *    같은 장면을 목업·실물 양쪽에서 나란히 띄울 수 있다 (이식의 유일한 판정 수단).
     * 🟢 덤: 기사님께 «12번 장면 보세요» 를 **링크로** 드릴 수 있다.
     */
    const [stepNo, setStepNo] = useState<number | null>(() => {
        const q = new URLSearchParams(window.location.search).get('step');
        const n = q == null ? NaN : Number(q);
        return Number.isFinite(n) && SCENARIO.some(x => x.no === n) ? n : 1;
    });
    const step = stepNo != null ? SCENARIO.find(x => x.no === stepNo) ?? null : null;
    /**
     * ▶️ **저절로 흘러가게** (기사님: *"처음에 콜이 없다가 하나씩 생기면 좋겠는데"*).
     *
     * 🔴 단계를 손으로 누르면 «콜이 붙는 순간»이 안 보인다 — 누른 사람은 다음 화면을
     *    이미 알고 보기 때문이다. 저절로 넘어가야 **빈 화면에 콜이 하나 생기고, 또 하나가
     *    끼어들어 번호가 밀리는 것**이 눈에 들어온다.
     */
    const [playing, setPlaying] = useState(false);
    const [planSize, setPlanSize] = useState<3 | 4 | 5 | 7>(3);
    /** 🔺 첫 콜 그물을 지도에 겹쳐 본다 (기사님) */
    const [cone, setCone] = useState<'off' | 'tri' | 'quad' | 'siheung' | 'leg2' | 'custom'>('off');
    /**
     * 🕸️ 그물 셋업 — 각도·지름 넷을 인풋으로 받아 동선을 실시간 계산한다 (기사님).
     * 기본값은 ⏳ 대기 프리셋(«여주를 목적지로 느긋하게»)이고, 그린 결과(사각형·통과 동·표)는
     * customNet 하나에서 나온다 — 지도와 표가 같은 계산을 본다 (규칙 ③).
     */
    const [netParams, setNetParams] = useState<NetParams>(WAIT_PRESET);
    const [customNet, setCustomNet] = useState<NetResult | null>(null);
    /**
     * 어느 꼭짓점 경우인가 — 대기(초월→여주) · 첫 콜 뒤(곤지암성당→여주) · 둘째 콜 뒤(동원대→여주) ·
     * 셋째 콜 뒤(보람여주→여주, 그물이 닫힌다) · 첫짐이 목적지 그 자체인 두 경우(hole·detour)
     */
    const [netPair, setNetPair] = useState<'yeoju' | 'gonjiam' | 'dongwon' | 'boram' | 'icheon' | 'hole' | 'detour'>('yeoju');
    /** 🚚 볼트 하루 — 콜 잡은 순서대로 마름모를 다시 그린다 (−1 = 끔) */
    const [boltStep, setBoltStep] = useState(-1);
    /** 🎚️ 출발지 각도 — 100°(여유) ↔ 30°(급함) */
    const [tight, setTight] = useState(false);
    /** 🖊️ 그리기 — 인풋 값으로 그물을 계산해 지도에 겹친다. 볼트 재생과는 배타라 그쪽을 끈다 */
    const drawNet = (p: NetParams, pair: 'yeoju' | 'gonjiam' | 'dongwon' | 'boram' | 'icheon' | 'hole' | 'detour' = netPair) => {
        setNetPair(pair); setNetParams(p);
        // 콜을 쥔 경우의 출발 꼭짓점은 현위치가 아니라 «경로의 마지막 하차지»다 (기사님 확정)
        const net = pair === 'hole' || pair === 'detour' ? buildFirstLegDemo(pair === 'detour')
            : buildNet(p, pair === 'gonjiam' ? GONJIAM_DROP : pair === 'dongwon' ? DONGWON_DROP : pair === 'boram' ? BORAM_DROP : pair === 'icheon' ? ICHEON_DROP : undefined);
        // 콜을 쥔 경우는 잡은 콜들의 경로를 함께 그린다 — 그물이 어느 콜에서 나왔는지 보인다
        setCustomNet(
            pair === 'gonjiam' ? { ...net, callPath: GONJIAM_CALL_PATH }
                : pair === 'dongwon' ? { ...net, callPath: DONGWON_CALL_PATH }
                : pair === 'boram' ? { ...net, callPath: BORAM_CALL_PATH }
                : pair === 'icheon' ? { ...net, callPath: ICHEON_CALL_PATH } : net);
        setCone('custom'); setBoltStep(-1);
    };
    /**
     * ⟳ **다시 물었나** — 눌렀을 때 «순서가 춤추는 것»을 보여 주기 위한 것이다
     * — 분만 늘리면 **좋아지는 것처럼만** 보인다.
     */
    const [reasked, setReasked] = useState(false);
    /**
     * 🛣️ **고른 경로 방침** (기사님: *"경로를 바꿔본다가 구현되어 있지 않아
     * 어떻게 경로를 바꿔보지?"*). 실물에는 지도 좌상단에 있는데, 그 버튼은 `PinnedRoute` 가
     * 그리고 목업은 `PinnedRouteCanvas` 를 직접 쓰므로 여기서 따로 든다.
     */
    const [priority, setPriority] = useState<RoutePriority>('RECOMMEND');
    /**
     * 🪧 **판정보드를 어디에 둘까 — 두 안** (기사님이 받으신 의견에서).
     *
     *   ⓐ **필터 자리**(위) — 늘 보이지만 엄지에서 멀다
     *   ⓑ **콜 영역**(시트 맨 아래 · 기사님 안) —
     *      «시트 상태바 + 지금 가진 콜 + 판정» 이 위에서 아래로 놓이고, **시트는 딱 그만큼만
     *      열린다.** 판정이 **맨 아래**라 엄지에 가장 가깝고, 콜 목록 바로 밑이라
     *      KEEP 하면 **바로 위로 올라가는 것**이 보인다. 여백이 없어 남는 자리는 전부 지도다.
     *      시트가 내려가 있을 때 심사가 오면 시트가 「나」까지 올라온다.
     *
     * ⚠️ **시트 위** 붙박이는 두지 않는다 — 판정은 **맨 아래**라야 콜 목록 바로 밑이라
     *    KEEP 하면 **바로 위로 올라가는 것**이 보이고, 엄지에 가장 가깝다.
     */
    /** 🔴 **기본은 ⓑ 콜 영역**이다 (기사님) — 기사님 안이 기본값이 된다 */
    const [seatPlace, setSeatPlace] = useState<'filter' | 'sheet'>('sheet');
    /**
     * 🚚 **지금 어느 국면인가** — 목업이 «정차 중»에만 머물면 안 된다
     * (기사님: *"운행 이벤트 시늉에서 주행중일때, 출발 할때가 없어"*).
     *
     * 🔴 **주행 중이 이 제품의 본 화면이다** — 기사님은 그때 **손을 못 쓴다**.
     *    목업이 그 화면을 보여 줘야 «먼발치 1~2초에 읽히는가»를
     *    **확인할 수 있다.**
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
    /** 🔴 콜 수를 바꾸면 정거장 수가 달라진다 — 넘치는 구간을 붙들고 있으면 «없는 정거장»을 가리킨다 */
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
     * (기사님: *"이게 최선의 UI 인 거야?"*).
     *   ⓐ 덮개 — 버튼을 누르면 화면을 덮고 **크게**. 탭 2번(열고·닫고)
     *   ⓑ 늘 띄우기 — 지도 구석에 **작게 항상**. 탭 0번. 대신 작아서 못 읽을 수 있다
     */
    const [qrStyle, setQrStyle] = useState<'sheet' | 'always'>('sheet');
    const [qrOpenRaw, setQrOpenRaw] = useState(false);
    /**
     * 🧭 카카오내비로 고정한다. 덮개에 「카카오맵으로 바꾸기」를 두지 않는다
     * (기사님: *"카카오맵으로 는 모두 필요 없다"*).
     * ⚠️ 되돌아갈 길이 사라진 것은 아니다 — 카카오내비가 별로면 **여기 한 글자**를
     *    `'map'` 으로 바꿔 같은 자리에서 견줘 본다.
     */
    const qrKind: QrKind = 'navi';
    /**
     * 🔴 **QR 안에서 정거장을 앞뒤로 넘긴다 — 「보는 것」이지 「찍는 것」이 아니다.**
     *
     * 왜 필요한가: 터널·기지국 좌표로 **도착 감지가 실패하면** QR 이 **이미 다녀온 곳**을
     * 가리킬 수 있다. 그때 손으로 다음 것을 봐야 한다.
     *
     * 🔴 **도착을 찍게 하지 않는다.** 그건 장부에 남는 큰 결정이라 시트의 스텝에서 한다
     *    (규칙 ⑥ 시퀀스를 압축하지 않는다). 여기서는 **QR 만** 바꾼다 —
     *    장부는 도착 감지나 손으로 찍을 때 따로 맞춰진다.
     * 🟢 덤: «다음 다음»을 미리 보고 싶을 때도 쓸모 있다.
     */
    const [qrPeek, setQrPeek] = useState(0);          // 0 = 다음 정거장
    /**
     * 🔴 **한 번에 몇 곳을 보낼까** (기사님 지적:
     * *"매번 내비를 찍는 것이 기사에게 너무 부담스러울 것 같아"*).
     *
     * 「한 구간씩」은 **가정 ①②③(경유지로 안내하나·지나면 넘어가나·
     * 재탐색이 순서를 지키나)을 피하는 길**이지만 동작이 많다.
     * **QR 로 확인할 수 있다** — `via_list` 가 먹히는 것은 확인했다.
     *
     * | | 6정거장이면 | 동작 |
     * | 한 곳씩 | 6번 | 관제폰 6 + 카메라 6 = **12** |
     * | 경유 3개씩 | **2번** | 4 |
     */
    const [qrSpan, setQrSpan] = useState<1 | 4>(4);   // 4 = 경유3 + 도착1 (기본) · 1 = 다음 한 곳
    /**
     * 🟢 **기본이 4곳이다** — 카카오내비 지도에 **물방울 「경유 1·2·3」이
     *    모두 찍히는 것**을 확인했다. 12동작이 4동작이 된다.
     * ⚠️ **주행 중에 지키는지는 아직 모른다** — 안 지키면 「다음 한 곳」으로 되돌린다.
     *    두 모양이 다 있으므로 되돌리는 것은 단추 하나다.
     */

    /**
     * ⟳ **경로 새로 받기** (기사님: *"관제앱에 새로 고침 버튼이 있어야 하겠어"* ·
     * *"새로 고침은 **지도의 경로** 이야기였어"*).
     *
     * 🔴 **«이탈» 때문이 아니라 «늙어서» 필요하다.** 실측으로 같은 구간이 30분 만에
     *    104분/1,900원 → 114분/3,800원이 됐다. **벗어나지 않아도 낡는다.**
     * 🔴 그리고 경로는 **필터의 경유 지역을 먹인다** — 낡으면 엉뚱한 동네에서 콜을 모은다.
     *    지금은 **하차 완료 때만** 갱신되어 실주행에서 **최대 67분** 안 바뀌었다.
     * ⚠️ 목업이라 진짜로 안 부른다 — **무엇이 달라 보이는지**만 보여 준다.
     */
    /** 🔴 키는 `.env` 에서 온다 — 코드에 안 적는다. 없으면 카카오맵 QR 로 떨어진다 */
    const NAVI_KEY = import.meta.env.VITE_KAKAO_JS_KEY as string | undefined;
    /**
     * 🔴 **여기에 `window.location.origin` 을 넣으면 안 된다** — 목업은 `localhost:3000`
     *    이라 콘솔에 등록한 주소와 달라 카카오가 거부한다.
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
    const autoSlice = remaining.slice(
        Math.min(qrPeek, Math.max(0, remaining.length - 1)),
        Math.min(qrPeek, Math.max(0, remaining.length - 1)) + qrSpan,
    );
    /**
     * 🔴 **덮개가 안 뜨는 장면에도 「QR 코드」 버튼은 살아 있다**.
     *
     * `step.qr` 이 없다고 담을 곳도 비우면 「⑥ 출발 전 — 합짐 대기」에서
     * **버튼이 통째로 사라진다.** 기사님: *"첫짐만 잡고 출발할 수 있으니까
     * qr은 첫짐 잡은 경로를 가리키는 큐알 버튼이 있어야 해."*
     *
     * 그래서 «덮개가 열린 장면»에서만 시나리오가 정하고, 그 밖에는 **남은 정거장에서
     * 저절로** 잡는다 — 콜을 잡은 뒤라면 언제든 떠나실 수 있어야 한다 (규칙 ①).
     */
    const qrSlice = step?.qr
        ? step.qr.map(nm => plan.stops.find(st => st.name === nm)).filter(Boolean) as typeof plan.stops
        : autoSlice;
    const toNaviStop = (p: typeof plan.stops[number]) =>
        (typeof p?.x === 'number' && typeof p?.y === 'number')
            ? { name: `${p.name} ${p.type}`, x: p.x, y: p.y } : null;
    const qrStop = toNaviStop(qrSlice[qrSlice.length - 1]);
    const qrVia = qrSlice.slice(0, -1).map(toNaviStop).filter(Boolean) as { name: string; x: number; y: number }[];
    const qrArgs = { stop: qrStop, via: qrVia, here: myLocation, kind: qrKind,
                     naviKey: NAVI_KEY, naviOrigin: NAVI_ORIGIN };
    /**
     * 🔢 **이 경우를 끝까지 가려면 QR 을 몇 번 찍나** — 한 곳에서 센다 (규칙 ③).
     *
     * 🔴 「6정거장이면 2번」처럼 **글로 박으면** 3콜에서만 참이라
     *    4·5콜을 열면 화면이 조용히 거짓말을 한다.
     *    **남은 정거장에서 세어** 콜 수가 바뀌면 숫자도 따라 바뀐다.
     * 동작 = 관제폰에서 띄우기 N + 개인폰 카메라 N.
     */
    const tripsFor = (span: number) => Math.max(1, Math.ceil(remaining.length / span));
    const qrTrips = tripsFor(qrSpan);
    const qrReady = naviQrText(qrArgs) != null;
    /** 🔴 시나리오가 켜져 있으면 «이 장면에 QR 이 떠 있나»도 시나리오가 정한다 */
    const qrOpen = step ? (step.qr != null && qrReady) : qrOpenRaw;
    const setQrOpen = (v: boolean) => { if (!step) setQrOpenRaw(v); };

    /**
     * 🖥️ **지금 화면이 어떤 상태인가 — 한 곳에서 만든다** (규칙 ③)
     *
     * 🔴 **조각마다 짐작하면 엉킨다** (기사님: *"뭘 고치면 뭐가 안 되고… 구조적으로 뭐가
     *    문제인지 봐 달라"*). 화면 조각들이 «심사 중인가»를 **각자 짐작**하면 이렇게 된다:
     *
     *    | 상태바   | 정거장이 없다 → 「이번 사이클 끝」   | ❌ 심사 중인데 |
     *    | 빈 상태  | 콜이 0 → 「아직 잡은 콜이 없습니다」 | ❌ 판정이 떠 있는데 |
     *    | QR 경고  | 목적지가 없다 → 「키를 확인하세요」  | ❌ 키는 멀쩡한데 |
     *    | 판정     | `step.seat` 를 본다                | ✅ 혼자만 안다 |
     *
     *    조각마다 «없다»의 뜻이 달라, 하나를 고치면 다른 하나가 틀린다.
     *    **사실을 여기서 한 번 정하고 모두가 그것을 읽는다.**
     */
    const screen = {
        /** 🪧 심사석에 콜이 올라와 있나 */
        judging: !!step?.seat,
        /** 📋 이미 잡은 콜 수 */
        held: CALLS.length,
        /** 💤 **정말 아무 일도 없나** — 잡은 것도 없고 심사 중도 아니다 */
        idle: CALLS.length === 0 && !step?.seat,
        /** 🔑 카카오 키가 있나 — «갈 곳이 없다»와 다른 사실이다 */
        hasNaviKey: !!NAVI_KEY,
    };

    const bar = sheetStatus({
        /* 🔴 «없다»의 두 뜻을 갈라 넘긴다 — 안 넘기면 상태바가 「이번 사이클 끝」이라
           말한다 (갈 곳이 없으니). 대기와 심사는 «끝»이 아니다. */
        idle: screen.idle,
        judging: screen.judging,
        moving,   // 🔴 조작판의 국면에서 온다 — 실물은 GPS 가 말한다
        next: nextStop ? {
            visitNo: nextStop.no!, name: nextStop.name, callNo: nextStop.callNo,
            stop: nextStop.type as '상차' | '하차',
        } : null,
        /**
         * ⏱️ **계획이 준 구간 분** — 카카오 `sections[i].duration` 실측이다.
         *    「⟳ 경로」를 누르면 순서가 바뀌면서 이 값도 **통째로 갈린다** (지어낸 증감이 아니다).
         * 🔴 실물에서는 GPS 마다 «선 위 남은 거리»를 다시 재서 줄어든다.
         *    지금 상태바는 «카카오에 물어본 그 순간부터의 누적»이라 30분을 달려도 안 변한다.
         */
        driveMinutes: nextStop ? (plan.legMinutes[nextStop.no!] ?? null) : null,
    });
    const visitedNos = new Set(visited.map(v => v.no));
    const [log, setLog] = useState('헤더를 누르거나 아래 «운행 이벤트»를 눌러 보세요.');

    /**
     * 🎬 **다음 장면으로** — 재생 타이머도, 「다음 ▶」도, 심사석의 KEEP 도 여기로 온다.
     *    세 곳이 각자 넘기면 그 자리에서 갈라진다 (규칙 ③).
     */
    const goStep = (no: number, why?: string) => {
        const n = SCENARIO.find(x => x.no === no);
        if (!n) { setPlaying(false); return; }
        setStepNo(n.no); setOpenIdx(-1); setQrPeek(0);
        /**
         * 🔴 **시트 높이를 건드리지 않는다** (기사님:
         *    *"지도가 위아래로 움직이는 것이 불편해"*).
         *
         * 장면마다 높이를 갈아 끼우면 넘길 때마다 지도가
         * 뛴다. **시트 높이는 기사님이 정하는 것**이지 시나리오가 정할 것이 아니다
         * (규칙 ③ — 손잡이가 둘이면 갈라진다). 기사님이 둔 높이 그대로 장면만 바뀐다.
         *
         * 🟢 그래도 심사는 놓치지 않는다 — ⓐ 는 필터 자리(위)라 시트와 무관하고,
         *    ⓑ 는 심사가 들어오면 시트가 **「나」까지 올라온다** (아래 `snapOnJudging`).
         */
        setLog(`${why ? `${why} → ` : ''}${n.title} — ${n.what}`);
    };

    /**
     * ▶️ 재생 — 4초마다 한 칸. 🔴 **타이머 id 를 붙들어 반드시 치운다** (좀비 타이머 · 규칙 ②).
     *    마지막 장면에 닿으면 **스스로 멈춘다** — 처음으로 되감지 않는다 (한 사이클이니까).
     */
    useEffect(() => {
        if (!playing || stepNo == null) return;
        if (stepNo >= SCENARIO.length) { setPlaying(false); return; }
        /* 🔴 **심사 장면에서는 저절로 안 넘어간다** — 거기서 누르는 것이 기사님 몫이기
           때문이다 (규칙 ① 콜의 주인은 기사님이다). 재생이 대신 눌러 버리면 «색만 보고
           1~2초에 누른다»는 이 제품의 핵심을 목업이 건너뛰게 된다. */
        if (SCENARIO.find(x => x.no === stepNo)?.seat) return;
        const t = setTimeout(() => goStep(stepNo + 1), 4000);
        return () => clearTimeout(t);
    }, [playing, stepNo]);

    /**
     * 🪧 **심사가 들어오면 시트가 「나」까지 올라온다** (기사님).
     *
     * 🔴 「가」는 상태바만 보이는 높이(72px)라 **판정이 들어갈 자리가 없다.** 그대로 두면
     *    주행 중에 합짐 심사가 와도 화면에 아무것도 안 뜨고, **30초가 흘러 자동 취소된다.**
     * 🔴 **«지도가 뛰지 않게» 하는 규칙의 예외다** — 이건 이유가 있는 움직임이다.
     *    «지금 봐야 할 것이 생겼다»는 신호이고, 끝나면 제자리로 돌아간다.
     * 🔴 타이머가 아니라 **판정이 있고 없음**을 따른다 — 시간이 아니라 사실을 본다.
     */
    const raisedFrom = useRef<SheetSnap | null>(null);
    useEffect(() => {
        if (screen.judging) {
            const next = snapOnJudging(snap);
            if (next !== snap) { raisedFrom.current = snap; setSnap(next); }
        } else if (raisedFrom.current) {
            const back = snapAfterJudging(snap, raisedFrom.current);
            raisedFrom.current = null;
            if (back !== snap) setSnap(back);
        }
        // 🔴 `snap` 은 일부러 뺀다 — 올린 뒤 기사님이 손으로 옮기신 것을 되돌리면 안 된다
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [screen.judging]);

    /** 열리는 것은 하나 — 이미 열린 것을 누르면 접는다 (i 가 -1 이면 전부 접기) */
    /**
     * 🪟 **높이를 바꾸는 길은 여기 하나다** (기사님:
     *    *"이 화면은 있을 수 없는 경우의 수다"*).
     *
     * 🔴 시트를 끌 때와 조작판에서 누를 때가 **각자** 높이를 정하면, 한쪽이
     *    전이 규칙을 **건너뛰어** «시트는 100% 인데 아코디언이 다 닫혀
     *    아래가 텅 빈» 화면이 나온다 — «다»의 정의에 «하나 열린»이 들어 있으니
     *    그런 상태는 **정의상 없어야 한다** (규칙 ③ — 손잡이가 둘이면 갈라진다).
     */
    /**
     * 🔢 **콜 번호로 목록 자리를 찾는다**.
     *
     * 🔴 **`callNo - 1` 로 빼지 않는다.** 목록은 **잡은 순서**라(기사님)
     *    뺄셈은 **다른 콜을 연다** —
     *    시나리오 3콜 목록은 [첫콜(2), 합짐1(3), 합짐2(1)] 이라 `2 - 1 = 1` 이 합짐1 이다.
     */
    const idxOfCall = (callNo?: number | null) =>
        callNo == null ? -1 : CALLS.findIndex(c => c.callNo === callNo);

    const changeSnap = (next: SheetSnap, why?: string) => {
        const r = sheetTransition(next, {
            openIdx, callCount: CALLS.length,
            preferIdx: nextStop ? idxOfCall(nextStop.callNo) : undefined,
        });
        setSnap(r.snap); setOpenIdx(r.openIdx);
        if (why) setLog(why);
    };

    const open = (i: number, why?: string) => {
        const next = i === openIdx ? -1 : i;
        setOpenIdx(next);
        /**
         * 🪟 **여는 것이 곧 «다», 닫는 것이 곧 «나»다** (기사님 정의).
         *
         * | 다 | 지도 자리까지 다 쓰고 **하나만 열린** 상태 |
         * | 나 | 상태바 + 타이틀 전부 (+ 판정) |
         *
         * 🔴 여기서 높이를 정하는 것은 **곁다리가 아니다** — «열었다»가 곧 «다 보겠다»는
         *    뜻이라, 높이가 그 행동의 결과다. («지도가 뛰지 않게» 하는 규칙의 예외다.)
         * ⚠️ 엿보기(가)에 계셨다면 안 올린다 — 주행 중이라 지도를 덮으면 안 된다.
         */
        if (snap !== 'peek') {
            const r = sheetTransition(next >= 0 ? 'full' : 'list',
                { openIdx: next, callCount: CALLS.length, preferIdx: next });
            setSnap(r.snap);
        }
        if (!why) return;
        const closed = openIdx >= 0 ? `${openIdx + 1}번 접고 ` : '';
        setLog(next < 0
            ? `${why} → ${closed}전부 접힘 — 헤더 세 줄만 남습니다.`
            : `${why} → ${closed}${next + 1}번 ${CALLS[next].p}→${CALLS[next].d} 를 «${STEPS[CALLS[next].now].k}» 단계로 엽니다.`);
    };

    return (
        /**
         * 🖥️ **넓은 화면에서는 좌우로 나눈다** (기사님).
         *    폰 쪽은 **붙박이(sticky)** 로 두고 조작판만 스크롤한다 — 조작판 아래쪽 버튼을
         *    누르면서도 **화면이 어떻게 바뀌는지 계속 보인다.** 시나리오를 한 칸씩 넘기며
         *    보는 자리라 그것이 이 화면의 전부다.
         * ⚠️ 좁은 화면(폰)에서는 **위아래**다 — `lg:` 밖의 클래스가 그 모양을 정한다.
         */
        <div className="min-h-dvh bg-bg-base text-text-primary flex flex-col items-center
                        lg:flex-row lg:items-start lg:justify-center lg:gap-6 lg:px-6">
            {/* 폰 폭으로 묶는다 — 실제 폰에서는 화면을 꽉 채운다.
                조작판은 좁은 화면에서 **아래**, 넓은 화면에서 **오른쪽**이다
                (기사님 *"아냐 거기 좋아"* · *"pc에서는 우측에"*) */}
            <div className="w-full max-w-[400px] h-dvh flex flex-col shrink-0 lg:sticky lg:top-0">

                <MockHeader st={header} onCar={() => setLog(
                    '⚙️ 설정창을 엽니다 — **테마 변경이 그 안에 있습니다.** '
                    + '헤더에서 아이콘을 뺐습니다: 원래도 아이콘은 없고 «차 이름»이 곧 테마 버튼이었는데, '
                    + '«내 차»라는 뜻과 «테마»라는 손이 한 칸에 겹쳐 있었습니다.')} />
                <MockDevicePanel
                    devices={devices}
                    modeOf={(id) => deviceModes[id] ?? devices.find(d => d.id === id)?.mode ?? '자동'}
                    pendingOf={(id) => modePendings[id] ?? null}
                    openId={modeOpenId} onOpen={setModeOpenId}
                    moreId={deviceMore} onMore={setDeviceMore}
                    onPick={(id, m) => {
                        setModeOpenId(null);
                        const now = deviceModes[id] ?? devices.find(d => d.id === id)?.mode ?? '자동';
                        if (m === now) return;
                        setModePendings(p => ({ ...p, [id]: m }));
                        setLog(`📱 ${devices.find(d => d.id === id)?.name} 을 «${m}» 으로 바꾸라고 보냈습니다 — `
                             + `스캔폰이 가져갈 때까지 «적용중»입니다. 아래 「📱 앱이 받았다」를 누르면 그때 바뀝니다.`);
                    }} />

                {/**
                  * 🪧 **심사석은 필터 자리를 빌려 쓴다** — 실물과 같은 자리다
                  *    (`JudgmentSeat` 머리주석 · 기사님 확정).
                  * 🔴 **목업용으로 다시 그리지 않고 실물 컴포넌트를 그대로 쓴다** (규칙 ③).
                  *    자료만 먹인다 — 그래야 여기서 정한 것이 실물과 안 갈라진다.
                  * 🔴 KEEP·거절을 **실제로 누르실 수 있다.** 누르면 다음 장면으로 넘어간다 —
                  *    기사님이 *"첫짐킵을 추가해주면 좋겠어"* 하신 그 손이다.
                  */}
                {step?.seat && seatPlace === 'filter' ? (
                    <div className="shrink-0">
                        <JudgmentSeat
                            route={SEAT_CALLS[step.seat] as never}
                            /* 🔴 `grabbed` 는 **이미 확정한 콜 수**다 — 심사 중인 이 콜은 아직 안 센다.
                               그래서 그대로 넘긴다(호칭이 「노선 후보콜 / 노선 합짐1 후보콜」로 갈린다). */
                            confirmedActive={step.grabbed}
                            onDecision={(_id, action) => {
                                setPlaying(false);
                                if (action === 'ORDER_CONFIRMED') {
                                    goStep(step.no + 1, '🟢 KEEP 을 누르셨습니다');
                                } else {
                                    setLog('❌ 거절하셨습니다 — 목업이라 여기서 멈춥니다. 실물이라면 이 콜이 사라지고 다시 대기로 돌아갑니다.');
                                }
                            }}
                        />
                    </div>
                ) : (
                    <MockFilterPanel compact={filterCompact} onExpand={() => setFilterCompact(false)} />
                )}

                {/* ══ 무대 — 지도가 배경이고 시트가 그 위에 뜬다 (실제 StageView 와 같은 모양) ══ */}
                <section className="relative flex-1 min-h-0">
                    <div className="absolute inset-0">
                        <PinnedRouteCanvas
                            fill
                            /* 🪟 시트가 올라온 만큼 지도가 위로 비켜 준다 — 반쯤 열면 둘을 같이 본다 (기사님) */
                            /* 🗺️ 지도는 «시트»를 모른다 — **아래가 얼마나 가려졌나**만 받는다 */
                            occludedPx={sheetPx}
                            rainbowNodes={rainbow}
                            unifiedRoutePoints={remaining}
                            visitedTrail={visited}
                            routeHolder={routeHolderOf(plan)}
                            coneOverlay={boltStep >= 0 ? (tight ? BOLT_STEPS_30 : BOLT_STEPS)[boltStep]
                                : cone === 'off' ? null
                                : cone === 'siheung' ? QUAD_SIHEUNG
                                : cone === 'leg2' ? QUAD_LEG2
                                : cone === 'custom' ? customNet
                                : { ...(cone === 'tri' ? CONE_DEMO : QUAD_DEMO), circles: RING_DEMO }}
                            drivenTrail={plan.drivenTrail}
                            liveRoute={[]}
                            myLocation={myLocation}
                        >
                            {/**
                              * 🗺️ **아래 두 귀퉁이** (기사님 재배치):
                              *   **좌하단** 경로 방침(내비추천·큰길 우선·최단거리) ·
                              *   **우하단** 「QR 코드」 — 왼쪽과 같은 치수다.
                              *   위쪽은 지도 관련이 남는다 — 우상단 「⟳ 경로」.
                              */}
                            {/**
                              * 🛣️ **경로 방침 — 실물과 같은 좌상단** (`PinnedRoute` 의 그 자리).
                              *
                              * 🔴 **잠금 규칙은 `lib/routePriority` 하나에서 온다** (규칙 ③) —
                              *    콜이 2건 이상이고 심사 중이 아니면 **고른 것만 남는다.**
                              *    기사님: *"합짐 잡기 전까지 바꿀 수 있어야 해."*
                              * 🔴 값은 **실주행 실측**이다 — 지어내지 않았다.
                              */}
                            {plan.stops.length > 0 && (() => {
                                /* 🔴 **심사 중인 콜도 센다** — 합짐은 «첫짐 경로 위에서 산출된» 콜이라,
                                   심사 중에 경로를 바꾸면 자기를 불러온 근거가 사라진다 (기사님) */
                                const locked = isPriorityLocked(plan.calls + (step?.seat ? 1 : 0));
                                return (
                                    /* 🔴 **좌하단** (기사님). 시트 바로 위에 붙는다 —
                                       높이는 `StageSheet` 가 원천이다 (규칙 ③) */
                                    <div className="absolute left-3 z-10 flex flex-col gap-1.5 items-start"
                                         style={{ bottom: aboveSheetPx }}>
                                        {/**
                                          * 🔴 **못 바꿀 때는 버튼이 아니라 글자다** (기사님:
                                          *    *"내비 경로 관련 버튼은 변경이 불가능할 때 그 자리에
                                          *    text 로 표현한다"*).
                                          * 🔴 눌리지 않는 버튼은 **누르게 만든다** — 눌러 보고서야
                                          *    «안 되는구나»를 안다. 글자는 처음부터 안 부른다.
                                          *    무엇이 골라져 있는지는 그대로 보인다.
                                          */}
                                        {locked && (
                                            <span className="px-2.5 h-8 grid place-items-center rounded-md
                                                             text-[11.5px] font-black whitespace-nowrap
                                                             text-text-muted bg-surface-alt/60 backdrop-blur-sm">
                                                {ROUTE_PRIORITIES.find(b => b.key === priority)?.naviLabel}
                                            </span>
                                        )}
                                        {!locked && ROUTE_PRIORITIES.map(b => (
                                            <button key={b.key} type="button"
                                                onClick={() => {
                                                    setPriority(b.key);
                                                    const v = PRIORITY_SAMPLE[b.key];
                                                    setLog(`🛣️ 「${b.long}」 으로 다시 받았습니다 — ${v.km}km / ${v.min}분 / 통행료 ${v.toll.toLocaleString()}원. `
                                                        + (b.key === 'TIME'
                                                            ? '🔴 이 구간에서는 추천과 값이 같습니다 — 09-03 여덟 구간 중 일곱이 그랬습니다 (경로.md §2-2).'
                                                            : b.key === 'DISTANCE'
                                                            ? '2.7km 짧지만 7분 더 걸립니다.'
                                                            : '기본값입니다.')); }}
                                                className={`px-2.5 h-8 rounded-md text-[11.5px] font-black border backdrop-blur-sm
                                                            whitespace-nowrap transition-all ${
                                                    priority === b.key
                                                        ? 'bg-info/90 text-white border-info'
                                                        : 'bg-surface-alt/80 text-text-primary border-border hover:bg-surface-hover'}`}>
                                                {b.naviLabel}
                                            </button>
                                        ))}
                                        {/* 🔴 «잠겼다»는 **버튼 하나만 남은 것으로 이미 보인다** —
                                            글자를 덧붙이지 않는다 (기사님 2026-09-05).
                                            실물도 그렇게 한다 (`PinnedRoute` — 고른 것만 남기고 끝). */}
                                    </div>
                                );
                            })()}

                            {/**
                              * ⟳ **경로 새로 받기** — 위는 지도 관련이라 우상단 줌 아래에 둔다.
                              * 🔴 **초기화(⟲)와 다른 일이다** — 초기화는 «보기를 되돌린다»,
                              *    이건 «카카오에 다시 물어 경로를 받는다». 그래서 **글씨로 적는다.**
                              */}
                            {/* 🔴 **시나리오가 켜져 있으면 안 그린다** — 경로를 정하는 손잡이가
                                둘이 되면 갈라진다 (규칙 ③). 「다시 물은 순서」를 안 받아 둔
                                경우(콜 0·1·2개)에서도 안 그린다 — 보여 줄 값이 없다 (규칙 ④). */}
                            {!step && cost && (
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
                            )}

                            {/**
                              * 🔴 **다시 물으면 무엇이 달라지는지 그 자리에서 말한다.**
                              *    «자동으로 다시 부를 것인가»의 답은 **얼마나
                              *    나빠지는지를 보고** 나온다.
                              */}
                            {reasked && cost && (
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
                                    className="absolute right-3 z-10 flex items-center gap-1 rounded-md px-2.5 h-8
                                               text-[11.5px] font-black text-white whitespace-nowrap
                                               active:scale-95 transition-transform"
                                    /* 🔼 **우하단** (기사님) · 시트 바로 위에 —
                                       높이는 StageSheet 가 원천이다 (규칙 ③).
                                       🔴 **치수는 왼쪽 방침 버튼과 같다** — 아래 두 귀퉁이가
                                          한 짝으로 읽혀야 한다 (기사님) */
                                    style={{ bottom: aboveSheetPx, background: 'linear-gradient(180deg,#5b8cff,#3f6fe0)', boxShadow: '0 4px 12px rgba(79,141,249,.35)' }}>
                                    {/**
                                      * 🔴 **「QR 코드」다** (기사님 재정정).
                                      *    «출발하기»가 아니다 —
                                      *    **주행 중에도 있는 버튼**이라 «출발»이 말이 안 된다
                                      *    (*"주행중인데 출발하기 버튼이 있으니 이상하다"*).
                                      *    이 버튼이 늘 하는 일은 하나다 — **QR 을 띄운다.**
                                      *    어디로 가는지는 **덮개를 열면 그 두 줄이 말한다.**
                                      */}
                                    🧭 QR 코드
                                </button>
                            )}

                            {/* ⓑ **늘 띄우기** — 누를 필요가 없다. 도착하면 그냥 개인폰을 들이댄다 */}
                            {qrStyle === 'always' && qrReady && (
                                <button type="button"
                                    onClick={() => { setQrOpen(true); setLog('🔍 작아서 안 찍히면 눌러서 크게 볼 수 있습니다.'); }}
                                    className="absolute right-3 z-10 flex flex-col items-center gap-0.5 rounded-xl bg-white p-1.5
                                               active:scale-95 transition-transform shadow-lg"
                                    style={{ bottom: aboveSheetPx }}>
                                    <NaviQr {...qrArgs} size={78} />
                                    <span className="text-[9px] font-black text-black leading-none pb-0.5">
                                        {nextStop?.no} {nextStop?.name}
                                    </span>
                                </button>
                            )}

                            {/**
                              * 🔳 **QR 덮개 — 세 줄이면 끝난다** (기사님:
                              *    *"qr레이어가 떠 너무 많은 정보가 있는 거 같아. 그냥
                              *    「여수동 상차 / 구로동 하차 / 카메라로 찍어 네비를 켜세요」
                              *    이렇게 나오면 될 듯"*).
                              *
                              * 🔴 **여기는 찍으라고 띄우는 화면이다.** 배지·경고·주소 원문·모드
                              *    토글은 전부 **읽을 일이 없는 것**이라 두지 않는다.
                              *    두는 것은 셋뿐 — **어디를 거쳐 어디로 가나 · QR · 무엇을 하라**.
                              * 🔴 «몇 곳 담았나»도 안 적는다 — **줄 자체가 곧 그 답**이다
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

                                    {/**
                                      * ① 어디를 거쳐 어디로 가나 — **두 줄이다** (기사님).
                                      * 🔴 **거쳐 가는 곳은 작게, 목적지는 크게.** 한 줄에 다 적으면
                                      *    눈이 «어디로 가는가»를 매번 찾아야 한다 — 목적지가 중요하다.
                                      */}
                                    <div className="text-center">
                                        {qrVia.length > 0 && (
                                            <p className="text-[13px] font-bold text-white/55 leading-snug mb-1">
                                                {qrVia.map(v => v.name).join(' → ')}
                                            </p>
                                        )}
                                        <p className="text-[24px] font-black text-white leading-tight">{qrStop?.name}</p>
                                    </div>

                                    {/* ② QR */}
                                    <NaviQr {...qrArgs} size={210} />

                                    {/* ③ 무엇을 하라 */}
                                    <p className="text-[15px] font-black text-white/85">카메라로 찍어 네비를 켜세요</p>

                                </div>
                            )}

                            {/* 🔴 키가 없으면 **버튼을 아예 안 보인다** — 깨진 QR 을 띄우느니 없는 게 낫다 (규칙 ④) */}
                            {/* 🔴 **«키가 없다»와 «갈 곳이 없다»는 다른 사실이다.**
                                갈 곳이 없을 때까지 이 경고를 띄우면 멀쩡한 키를 의심하게 된다. */}
                            {!screen.hasNaviKey && (
                                <div className="absolute right-3 z-10 rounded-xl bg-warning/15 border border-warning/40 px-3 py-2
                                                text-[11px] font-bold text-warning leading-snug max-w-[190px]"
                                     style={{ bottom: aboveSheetPx }}>
                                    🔑 QR 을 못 만듭니다 —<br /><code>.env</code> 의 <b>VITE_KAKAO_JS_KEY</b> 를 확인하세요
                                </div>
                            )}

                        </PinnedRouteCanvas>
                    </div>

                    {/* ── 3단 시트 — **진짜 컴포넌트**. 손잡이를 끌거나 눌러서 가↔나↔다 ── */}
                    <StageSheet snap={snap} onSnapChange={(next) => changeSnap(next)}
                        onHeightChange={setSheetPx}
                        /* 🔴 위 라인을 빼 둔다 (기사님) — 심사석이 이미
                           자기 테두리를 갖고 있어 줄이 하나 더 그어지면 칸이 둘로 보인다 */
                        bottomBox={step?.seat && seatPlace === 'sheet' ? (
                            <>
                            {/**
                              * ⏱️ **«잡으면 이만큼 밀린다»를 한 줄로** (기사님 확정).
                              * 🔴 위 목록의 시각이 왜 노랗게 바뀌었는지를 이 줄이 말한다 —
                              *    안 적으면 «시각이 저 혼자 바뀐» 것으로 읽힌다.
                              */}
                            {step.pushMinutes ? (
                                <p className="mx-2.5 mb-1 px-2 py-1 rounded-[6px] text-[11.5px] font-bold leading-snug
                                              bg-warning/12 border border-warning/35 text-warning">
                                    ⏱️ 잡으면 앞에 끼어 <b>뒤가 {step.pushMinutes}분 밀립니다</b> — 위 시각이 그 결과입니다
                                </p>
                            ) : null}
                            <JudgmentSeat
                                /* 📐 콜 목록과 **같은 간격** — 위 6 · 좌우 10 · 아래 10.
                                   아코디언 그릇의 `gap-1.5 px-2.5 pb-2.5` 와 같은 값이다 */
                                inset="6px 10px 10px"
                                route={SEAT_CALLS[step.seat] as never}
                                confirmedActive={step.grabbed}
                                onDecision={(_id, action) => {
                                    setPlaying(false);
                                    if (action === 'ORDER_CONFIRMED') goStep(step.no + 1, '🟢 판정 영역에서 KEEP');
                                    else setLog('❌ 거절하셨습니다 — 목업이라 여기서 멈춥니다.');
                                }}
                            />
                            </>
                        ) : undefined}
                        peekBar={
                            /**
                             * 🔴 **상태바는 언제나 이 한 줄이다** (기사님:
                             *    *"기존에 있던 거 넣어줘. 상태바의 높이도 항상 일정했으면 좋겠어"*).
                             *
                             * 심사 중에 여기를 «한 줄 심사석»(색·점수·거절/KEEP)으로 바꾸면
                             * **줄의 높이가 장면마다 달라지고**, 늘 같은 자리에서 같은 것을
                             * 읽던 눈이 매번 다시 맞춰야 한다. 심사는 **판정 영역**이 맡는다 —
                             * 이 줄은 «지금 어디로 가는가»만 말한다 (규칙 ⑤-4 ⑤ — 한 자리가
                             * 두 질문을 답하지 않는다).
                             */

                            /**
                             * 🎬 **시트 상태바** (용어집 확정) — 읽는 줄.
                             *    그 안에서 누르는 부분이 «시트 상태바의 버튼»이다.
                             *
                             * 🔴 「다음 정거장」 버튼은 지도 위에 따로 두지 않고 **여기 하나다.**
                             *    같은 말을 두 곳에서 하면 갈라진다 (규칙 ③).
                             * 🔴 **자리와 기능은 함께 간다** — 자리만 옮기고 일을 흘리면 손이 갈 데가
                             *    없어진다.
                             * 🔴 «다녀온 곳»은 안 적는다 — 아코디언의 진행 점과 지도의 흰 링이
                             *    이미 말한다. 이 줄은 **지금 할 일**만 말한다.
                             * 🟢 주행 중에는 시트가 내려가 있어 이 줄이 **화면 맨 아래** — 엄지에 가깝다.
                             */
                            <button type="button"
                                onClick={() => {
                                    if (!nextStop) return;
                                    /**
                                     * 🔴 **이 줄을 누른 것은 «열어서 보겠다»는 뜻이다** — 주행 중
                                     *    (엿보기)에도 올라간다. 자동으로 안 올리는 것과 다르다:
                                     *    자동은 지도를 뺏는 것이고, 이건 **손이 시킨 것**이다.
                                     * 🔴 «다»로 가는 길은 `changeSnap` 하나뿐이다 — 여는 것까지
                                     *    그 안에서 함께 정해진다 (규칙 ③).
                                     */
                                    changeSnap('full',
                                        `시트 상태바의 버튼을 눌렀습니다 → 시트를 올리고 ${nextStop.callNo}번 콜을 «${STEPS[CALLS[idxOfCall(nextStop.callNo)]?.now ?? 0].k}» 단계로 엽니다.`);
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
                         * 🔴 헤더는 `shrink-0`(각 콜 안에서), 펼친 칸만 남는 자리를 먹는다.
                         *    그릇이 넘치면 시트가 세로로 스크롤되어 «헤더가 늘 보인다»가 깨진다.
                         */}
                        {/* 📏 «내용만큼» 모드에서는 `h-full` 을 빼야 한다 —
                            부모 높이가 내용에서 나오는데 자식이 부모를 채우려 들면 서로를 문다 */}
                        <div className={`flex flex-col gap-1.5 px-2.5 pt-1 pb-2.5 overflow-hidden ${
                            snap === 'list' ? '' : 'h-full'}`}>
                            {/**
                              * 🪧 **안 ⓑ — 후보콜이 목록 맨 위에 얹힌다.**
                              * 🔴 합짐은 «기존 콜들 사이에 끼는 것»이다. 목록 위에 얹히는 모양이
                              *    그 일과 맞는다 — **잡으면 어디에 끼는지가 같은 화면에서 보인다.**
                              */}
                            {/**
                              * 🈳 **빈 상태** (기사님 확정 · 관행을 따른다).
                              * 🔴 시트는 콜이 없어도 올라간다 — 막아 두면 끌었는데 아무 일이
                              *    없어 고장처럼 보인다. 대신 **«아직 없다»고 말해 준다.**
                              * 🔴 «기다리는 중»이라고 적는 것이 중요하다 — 빈 화면은 «고장»과
                              *    «일이 없음»을 구별해 주지 않는다.
                              */}
                            {/* 🔴 **시트에 뭐라도 있으면 사라진다** (기사님).
                                판정이 떠 있는데 «없습니다»라고 하면 화면이 거짓말을 한다. */}
                            {screen.idle && (
                                <div className="shrink-0 py-6 text-center text-[13px] font-black text-text-muted">
                                    아직 잡은 콜이 없습니다
                                </div>
                            )}
                            {CALLS.map((call, i) => (
                                <CallItem key={call.no} call={call} i={i} rainbow={rainbow} visitedNos={visitedNos}
                                    fit={snap === 'list'}
                                    /* ⏱️ 심사 중인 콜이 앞에 끼면 **이미 잡은 콜들이** 밀린다 —
                                       잡기 전에 보여야 «감수하고 KEEP» 이 판단이 된다 */
                                    push={step?.seat ? step.pushMinutes : undefined}
                                    onMock={(what) => setLog(`🎛️ 「${what}」 을 눌렀습니다 — 목업이라 **저장은 안 나갑니다.** 실물에서는 이 자리에서 장부에 적힙니다.`)}
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
                  * 🎬 **한 사이클 시나리오** (기사님이 통째로 적어 주신 것).
                  *
                  * 🔴 **장면 하나하나**만으로는 모자라다. 어려운 것은
                  *    장면이 아니라 **차례**다 — 콜이 붙을 때마다 번호가 밀리고, QR 이 담는 곳이
                  *    달라지고, 방침 버튼이 잠긴다. **순서대로 못 보면 확인할 수가 없다.**
                  * 🔴 켜지면 **시나리오가 콜 수·국면·QR 을 다 정한다** (규칙 ③).
                  */}
                <h2 className="text-[12.5px] font-black tracking-wide text-info mb-1">🎬 한 사이클 시나리오</h2>
                <p className="text-[11.5px] text-text-muted mb-2">
                    기사님이 적어 주신 순서 그대로입니다 — 누르면 화면이 그 장면이 됩니다.
                    켜져 있는 동안은 <b className="text-text-primary">시나리오가 판·국면·QR 을 정합니다.</b>
                </p>
                <div className="flex gap-1.5 flex-wrap">
                    <button type="button"
                        onClick={() => {
                            if (playing) { setPlaying(false); setLog('⏸ 멈췄습니다 — 「다음 ▶」으로 손수 넘기실 수 있습니다.'); return; }
                            setPlaying(true); setReasked(false);
                            goStep(SCENARIO[0].no, '▶️ 처음부터 재생합니다 (4초에 한 칸 · 시트 높이는 안 건드립니다)');
                        }}
                        className={`px-3 py-2 rounded-[9px] border text-[12.5px] font-black ${playing
                            ? 'bg-warning/15 border-warning/55 text-warning'
                            : 'bg-info/15 border-info/55 text-info hover:border-info'}`}>
                        {playing ? '⏸ 멈춤' : '▶️ 처음부터 재생'}
                    </button>
                    <button type="button"
                        onClick={() => { setStepNo(null); setPlaying(false); setLog('시나리오를 껐습니다 — 판과 국면을 손으로 고르는 자리로 돌아옵니다.'); }}
                        className={`px-3 py-2 rounded-[9px] border text-[12.5px] font-black ${stepNo == null
                            ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-surface text-text-primary hover:border-info'}`}>
                        ✋ 끄기
                    </button>
                    {SCENARIO.map(sc => (
                        <button key={sc.no} type="button"
                            onClick={() => { setPlaying(false); setReasked(false); setPriority('RECOMMEND'); goStep(sc.no); }}
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
                                onClick={() => { setPlaying(false); goStep(step.no - 1); }}
                                className="px-2.5 py-1 rounded-[7px] border border-border-hover bg-surface text-[12px] font-black disabled:opacity-30">◀ 앞</button>
                            <button type="button" disabled={step.no >= SCENARIO.length}
                                onClick={() => { setPlaying(false); goStep(step.no + 1); }}
                                className="px-2.5 py-1 rounded-[7px] border border-info/50 bg-info/10 text-info text-[12px] font-black disabled:opacity-30">다음 ▶</button>
                        </div>
                    </div>
                )}

                <h2 className="mt-7 pt-5 border-t border-border-card text-[12.5px] font-black tracking-wide text-info mb-2">🕸️ 그물 셋업 — 동선을 손으로 그린다</h2>
                <div className="flex gap-2 flex-wrap items-end">
                    {([['srcDiamKm', '출발지 지름㎞'], ['srcAngleDeg', '출발지 각도°'], ['dstAngleDeg', '목적지 각도°'], ['dstDiamKm', '목적지 지름㎞']] as const).map(([key, label]) => (
                        <label key={key} className="flex flex-col gap-1 text-[11px] font-bold text-text-muted">
                            {label}
                            <input type="number" inputMode="numeric" value={netParams[key]} min={0} max={key.endsWith('AngleDeg') ? 170 : 120}
                                onChange={e => setNetParams({ ...netParams, [key]: Number(e.target.value) })}
                                className="w-[76px] px-2 py-1.5 rounded-[7px] border border-border-hover bg-surface text-[13px] font-black text-text-primary" />
                        </label>
                    ))}
                    <button type="button" onClick={() => drawNet(netParams)}
                        className="px-3 py-2 rounded-[9px] border border-info/50 bg-info/10 text-info text-[12.5px] font-black">🖊️ 그리기</button>
                </div>
                <div className="mt-2 flex gap-1.5 flex-wrap">
                    <button type="button" onClick={() => drawNet(WAIT_PRESET, 'yeoju')}
                        className={`px-3 py-2 rounded-[9px] border text-[12.5px] font-black ${cone === 'custom' && netPair === 'yeoju'
                            ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-surface text-text-primary hover:border-info'}`}>
                        ⏳ 대기 — 여주 느긋하게{cone === 'custom' && netPair === 'yeoju' && customNet ? ` · ${customNet.count}동` : ''}
                    </button>
                    <button type="button" onClick={() => drawNet(netParams, 'gonjiam')}
                        className={`px-3 py-2 rounded-[9px] border text-[12.5px] font-black ${cone === 'custom' && netPair === 'gonjiam'
                            ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-surface text-text-primary hover:border-info'}`}>
                        🛍️ 곤지암성당 하차 → 여주{cone === 'custom' && netPair === 'gonjiam' && customNet ? ` · ${customNet.count}동` : ''}
                    </button>
                    <button type="button" onClick={() => drawNet(netParams, 'dongwon')}
                        className={`px-3 py-2 rounded-[9px] border text-[12.5px] font-black ${cone === 'custom' && netPair === 'dongwon'
                            ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-surface text-text-primary hover:border-info'}`}>
                        🏫 동원대 하차 → 여주{cone === 'custom' && netPair === 'dongwon' && customNet ? ` · ${customNet.count}동` : ''}
                    </button>
                    <button type="button" onClick={() => drawNet(netParams, 'boram')}
                        className={`px-3 py-2 rounded-[9px] border text-[12.5px] font-black ${cone === 'custom' && netPair === 'boram'
                            ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-surface text-text-primary hover:border-info'}`}>
                        🕯️ 보람여주 하차 → 여주{cone === 'custom' && netPair === 'boram' && customNet ? ` · ${customNet.count}동` : ''}
                    </button>
                    <button type="button" onClick={() => drawNet(netParams, 'icheon')}
                        className={`px-3 py-2 rounded-[9px] border text-[12.5px] font-black ${cone === 'custom' && netPair === 'icheon'
                            ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-surface text-text-primary hover:border-info'}`}>
                        🏥 이천병원 하차 → 여주{cone === 'custom' && netPair === 'icheon' && customNet ? ` · ${customNet.count}동` : ''}
                    </button>
                    <button type="button" onClick={() => drawNet(netParams, 'hole')}
                        className={`px-3 py-2 rounded-[9px] border text-[12.5px] font-black ${cone === 'custom' && netPair === 'hole'
                            ? 'bg-warning/15 border-warning/55 text-warning' : 'border-border-hover bg-surface text-text-primary hover:border-warning'}`}>
                        🕳️ 첫짐이 여주행 — 사각형만{cone === 'custom' && netPair === 'hole' && customNet ? ` · ${customNet.count}동` : ''}
                    </button>
                    <button type="button" onClick={() => drawNet(netParams, 'detour')}
                        className={`px-3 py-2 rounded-[9px] border text-[12.5px] font-black ${cone === 'custom' && netPair === 'detour'
                            ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-surface text-text-primary hover:border-info'}`}>
                        🛣️ 첫짐이 여주행 — 길을 합침{cone === 'custom' && netPair === 'detour' && customNet ? ` · ${customNet.count}동` : ''}
                    </button>
                </div>
                {cone === 'custom' && customNet && (
                    <div className="mt-2 overflow-x-auto">
                        <table className="w-full text-[12px]">
                            <thead><tr className="text-text-muted">
                                <th className="text-left py-1 pr-2 font-black whitespace-nowrap">시군구</th>
                                <th className="text-left py-1 font-black">동선에 드는 읍면동 · 모두 {customNet.count}동</th>
                            </tr></thead>
                            <tbody>
                                {customNet.groups.map(g => (
                                    <tr key={g.region} className="border-t border-border-card align-top">
                                        <td className="py-1.5 pr-2 whitespace-nowrap font-black text-text-primary">{g.region} <span className="text-info">{g.names.length}</span></td>
                                        <td className="py-1.5 leading-relaxed text-text-muted">{g.names.join(' · ')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <p className="mt-2 text-[12px] leading-relaxed text-text-muted">
                    초월(집) → 여주 시내 32.4km. 각도·지름을 넣고 <b className="text-text-primary">그리기</b> —
                    사각형(두 각도) + 꼭짓점 원(각도와 무관하게 담는다) · 서울 제외.
                    ⏳ <b className="text-text-primary">대기</b> = «여주를 목적지로 느긋하게»(기사님 2026-09-07) —
                    출발지 100° · 목적지 50° · 원 15km → 48동 (출발지 30°로 조이면 38동).<br />
                    🔴 대기 판에서 <b className="text-text-primary">부발읍이 1° 차이로 빠집니다</b> — 목적지각 26° &gt; ±25°,
                    여주 시내에서 12.3km 라 원(7.5km)에도 안 듭니다. 가남·대신·북내도 같은 이유 —
                    <b className="text-text-primary">짧은 동선에서는 목적지 쪽 그물이 좁습니다</b>. 목적지 각도나 지름을 키워 보면 들어옵니다<br />
                    🛍️ <b className="text-text-primary">곤지암성당 하차 → 여주</b> — 모다아울렛→곤지암성당 콜을 잡은 상태의 그물입니다.
                    🔴 출발 꼭짓점은 현위치(모다아울렛)가 아니라 <b className="text-text-primary">경로의 하차지(곤지암성당)</b> —
                    기사님: <b className="text-text-primary">«하차지에서 여주를 잇는 사각형이 되야지»</b> (2026-09-07 · 좌표는 카카오 실측).
                    27.3km · 43동. 그리고 초월 판에서 1° 차이로 빠지던 <b className="text-text-primary">부발읍이 이 판에서는 듭니다</b>(목적지각 19°) —
                    꼭짓점이 하차지로 옮겨지며 축이 부발 줄기 위로 온 것입니다. 각도를 안 건드리고 풀렸습니다<br />
                    🏫 <b className="text-text-primary">동원대 하차 → 여주</b> — 둘째 콜(한국도로공사 경기광주지사→동원대학교)을 잡은 뒤.
                    22.1km · 40동. <b className="text-text-primary">그물이 닫힙니다: 48 → 43 → 40동</b>, 광주는 곤지암읍 하나만 남고
                    <b className="text-text-primary"> 지나온 초월읍(집)이 빠집니다</b>(출발지각 152°).
                    곤지암읍은 각도로는 뒤(131°)인데 동원대에서 4.3km 라 <b className="text-text-primary">출발지 원이 담습니다</b> —
                    «꼭짓점 자신은 각도를 잴 수 없다, 원이 그 답»의 실측입니다<br />
                    🕯️ <b className="text-text-primary">보람여주 하차 → 여주</b> — 셋째 콜(르노 정비사업소→보람여주장례식장, 세종대왕면)을 잡은 뒤.
                    하차지가 여주 시내에서 <b className="text-text-primary">3.9km</b> — 목적지 원 안입니다. 그물은 <b className="text-text-primary">25동, 전부 여주</b>:
                    <b className="text-text-primary"> 48 → 43 → 40 → 25 — 하루가 스스로 끝납니다</b>. 부발·곤지암도 이 판부터 지나온 곳이 되어 빠집니다.
                    경로 색: ① 장미 · ② 보라 · <b className="text-text-primary">③ 청록</b><br />
                    🏥 <b className="text-text-primary">이천병원 하차 → 여주</b> — 넷째 콜(세종대왕면 행정복지센터→이천병원).
                    상차는 보람여주 옆 3.2km 인데 하차가 여주 <b className="text-text-primary">반대편 서쪽</b>이라,
                    마지막 하차지가 이천병원이 되며 <b className="text-text-primary">닫혔던 그물(25동)이 43동으로 다시 열립니다</b> —
                    하차지가 그물을 이끈다는 것이 거꾸로도 참입니다. 경로 색 <b className="text-text-primary">④ 주황</b><br />
                    🕳️🛣️ <b className="text-text-primary">첫짐이 여주행이면?</b> — 첫짐 자체가 초월→여주라면, 하차지 = 목적지라서
                    <b className="text-text-primary"> 사각형이 점으로 쪼그라들고 여주 원만 남습니다</b>. 🕳️ 를 누르면 그 구멍이 보입니다 —
                    내가 지나갈 곤지암·이천 길이 그물에서 통째로 사라집니다(25동, 전부 여주).
                    🛣️ 를 누르면 <b className="text-text-primary">길 양옆 ±5km(경유)</b> 를 합친 모습입니다 — 곤지암·신둔·백사가 돌아옵니다(31동).
                    <b className="text-text-primary">콜을 쥔 뒤의 그물은 «길 주변 + 사각형» 둘을 합쳐야 완성</b>입니다.
                    (길은 직선 근사 — 부발이 직선에서 5.4km 라 여기선 빠지지만, 실제 도로는 부발을 지나므로 실물에서는 담깁니다)
                </p>

                <h2 className="mt-7 pt-5 border-t border-border-card text-[12.5px] font-black tracking-wide text-info mb-2">🔺 첫 콜 그물 — 어디까지 볼 것인가</h2>
                <div className="flex gap-1.5 flex-wrap">
                    {([['off', '🔺 끄기', 0], ['tri', '▲ 삼각형', CONE_DEMO.pass.length], ['quad', '🔷 파주', QUAD_DEMO.pass.length], ['siheung', '🔶 시흥', QUAD_SIHEUNG.pass.length], ['leg2', '🟣 용인→시흥', QUAD_LEG2.pass.length]] as const).map(([k, label, n]) => (
                        <button key={k} type="button" onClick={() => setCone(k)}
                            className={`px-3 py-2 rounded-[9px] border text-[12.5px] font-black ${cone === k
                                ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-surface text-text-primary hover:border-info'}`}>
                            {label}{n ? ` · ${n}동` : ''}
                        </button>
                    ))}
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-text-muted">
                    초월(집) → 파주 · 파주에서 본 반각 <b className="text-text-primary">±50°</b>. 🔵 든 곳 · 🔴 빠진 곳<br />
                    <b className="text-text-primary">▲ 삼각형</b> — 꼭짓점이 파주. 초월 너머로 <b className="text-text-primary">열려 있다</b>. 용인 ✅ 시흥 ❌<br />
                    <b className="text-text-primary">🔷 마름모</b> — 초월에서도 같은 각도로 잘라 <b className="text-text-primary">뒤가 막힌다</b>. 대신 <b className="text-text-primary">용인이 빠진다</b><br />
                    🔴 용인은 파주에서 18°인데 초월에서 70° 다 — 초월에서 23km 밖에 안 떨어져 조금만 옆이어도 각도가 커진다.<br />
                    ⭕ <b className="text-text-primary">노란 점선 원</b> — 두 꼭짓점 각각 <b className="text-text-primary">지름 15km</b><br />
                    🔶 <b className="text-text-primary">시흥</b> — 목적지만 바꾼 판. <b className="text-text-primary">정반대가 됩니다</b> —
                    파주 판에서 버렸던 용인·안양이 들어오고, 담았던 파주·남양주·의정부가 빠집니다.
                    <b className="text-text-primary">목적지를 정한다 = 무엇을 버린다</b><br />
                    🟣 <b className="text-text-primary">용인→시흥</b> — 첫 콜(초월→용인)을 잡은 뒤. 꼭짓점이 <b className="text-text-primary">용인으로 옮겨집니다</b>.
                    한 콜 잡았을 뿐인데 그물이 549 → {QUAD_LEG2.pass.length}동으로 줄어듭니다 — 길이 짧아졌기 때문입니다
                </p>

                <h2 className="mt-7 pt-5 border-t border-border-card text-[12.5px] font-black tracking-wide text-info mb-2">🚚 볼트 하루 — 잡을 때마다 다시 그린다</h2>
                <div className="flex gap-1.5 flex-wrap">
                    <button type="button" onClick={() => setBoltStep(-1)}
                        className={`px-3 py-2 rounded-[9px] border text-[12.5px] font-black ${boltStep < 0
                            ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-surface text-text-primary hover:border-info'}`}>끄기</button>
                    <button type="button" onClick={() => setTight(v => !v)}
                        className={`px-3 py-2 rounded-[9px] border text-[12.5px] font-black ${tight
                            ? 'bg-warning/15 border-warning/55 text-warning' : 'border-border-hover bg-surface text-text-primary hover:border-warning'}`}>
                        {tight ? '🎚️ 출발지 30° (급함)' : '🎚️ 출발지 100° (여유)'}
                    </button>
                    {(tight ? BOLT_STEPS_30 : BOLT_STEPS).map((s, i) => (
                        <button key={i} type="button" onClick={() => setBoltStep(i)}
                            className={`px-3 py-2 rounded-[9px] border text-[12.5px] font-black ${boltStep === i
                                ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-surface text-text-primary hover:border-info'}`}>
                            {s.where} · {s.passCount}동
                        </button>
                    ))}
                </div>
                {boltStep >= 0 && (
                    <p className="mt-2 text-[12px] leading-relaxed text-warning">
                        {(tight ? BOLT_STEPS_30 : BOLT_STEPS)[boltStep].at} · <b>{(tight ? BOLT_STEPS_30 : BOLT_STEPS)[boltStep].where}</b> 에서 집(김포)까지 <b>{(tight ? BOLT_STEPS_30 : BOLT_STEPS)[boltStep].baseKm}km</b> ·
                        그물 <b>{(tight ? BOLT_STEPS_30 : BOLT_STEPS)[boltStep].passCount}동</b> · 이때 잡은 콜 → <b>{(tight ? BOLT_STEPS_30 : BOLT_STEPS)[boltStep].got}</b> · 출발지 각도 <b>{tight ? '30°' : '100°'}</b>
                    </p>
                )}
                <p className="mt-2 text-[12px] leading-relaxed text-text-muted">
                    그날 볼트의 목적지는 <b className="text-text-primary">집(김포) 하나</b>였습니다(2일차 = 복귀).
                    콜을 잡을 때마다 «지금 자리 → 김포» 로 마름모를 다시 그린 것입니다.<br />
                    🔴 <b className="text-text-primary">그물이 저절로 닫힙니다</b> — 1,180 → 559동.
                    집이 가까워질수록 작아지고, 마지막엔 목적지 둘레만 남습니다. <b className="text-text-primary">하루가 스스로 끝납니다.</b><br />
                    🎚️ <b className="text-text-primary">출발지 각도</b> — 여유 100° ↔ 급함 30°. 성남에서 <b className="text-text-primary">756 → 466동</b> 으로 조여집니다.
                    두 각도는 다른 질문입니다: <b className="text-text-primary">출발지 = 얼마나 돌아도 되나</b> · <b className="text-text-primary">목적지 = 둘레를 얼마나 볼까</b>
                </p>

                <h2 className="mt-7 pt-5 border-t border-border-card text-[12.5px] font-black tracking-wide text-info mb-2">몇 콜을 잡은 판인가</h2>
                <div className="flex gap-1.5 flex-wrap">
                    {([3, 4, 5, 7] as const).map(n => (
                        <button key={n} type="button"
                            onClick={() => { setPlanSize(n); setStepNo(null); setPlaying(false);
                                setVisitedCount(1); setOpenIdx(-1); setQrPeek(0); setReasked(false);
                                setLog(`${n}콜 판 — 정거장 ${MOCK_PLANS[n].stops.length}개 · ${MOCK_PLANS[n].totalKm}km / ${MOCK_PLANS[n].totalMin}분. ${MOCK_PLANS[n].source}`); }}
                            className={`px-3 py-2 rounded-[9px] border text-[12.5px] font-black ${planSize === n
                                ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-surface text-text-primary hover:border-info'}`}>
                            {n === 7 ? '🚚 볼트 하루' : `${n}콜`} · 정거장 {MOCK_PLANS[n].stops.length}
                        </button>
                    ))}
                </div>
                {planSize === 7 && (
                    <p className="mt-2 text-[12px] leading-relaxed text-warning">
                        🚚 <b>남의 하루입니다</b> — 볼트 2026-08-10 실측(7콜 · 306,400원 · 대전→인천 278km).
                        <b className="text-text-primary"> 좌표는 «동 주민센터»로 물은 값</b>이고 번지는 표에 없습니다.
                        하차 넷(5·6·9·10)은 <b className="text-text-primary">시각을 몰라</b> 지리 순서로 놓았습니다 — 실측이 아닙니다.
                    </p>
                )}
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
                  * 🎬 **한 절이다** (기사님: *"지금 어느 국면인가 와 운행 이벤트
                  *    시늉은 같은거라 같이 나란히 있으면 될 거 같은데?"*).
                  *
                  * 🔴 **둘 다 «지금 무슨 상황인가»를 고르는 버튼**이다. 이벤트를 눌러도
                  *    국면이 함께 바뀌니 두 벌이면 갈라진다 (규칙 ③). 버튼 하나가 곧 한 장면이다.
                  * 🔴 문구는 **다음 정거장에서 파생**시킨다 — 「2번 콜 도착」처럼 박아 두면
                  *    콜 수나 구간을 바꿨을 때 화면이 조용히 거짓말을 한다.
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
                                /* 🔴 **시나리오를 끈다** — 켜져 있으면 국면을 시나리오가 정해
                                   (`moving = step.phase === '주행'`) 이 버튼이 **먹통이 된다.**
                                   콜 수 버튼과 같은 이유다 — 한 축을 두 곳에서 정하지 않는다 (규칙 ③) */
                                setStepNo(null); setPlaying(false);
                                setScene(k);
                                /* 🔴 «출발»은 **QR 을 찍는 순간**이다 — 결재를 마치고 나서면서
                                   관제폰이 QR 을 띄우고 개인폰 카메라로 찍는다 (경로.md §4-0-1).
                                   그래서 여기서만 덮개가 열린다. 달리기 시작하면 닫힌다. */
                                if (k === '출발') { setPhase('주행'); changeSnap('peek'); setQrOpen(qrReady); }
                                if (k === '주행') { setPhase('주행'); changeSnap('peek'); setQrOpen(false); }
                                if (k === '접근') { setPhase('주행'); setQrOpen(false); if (nextStop) open(idxOfCall(nextStop.callNo)); }
                                if (k === '도착') { setPhase('정차'); setQrOpen(false); if (nextStop) open(idxOfCall(nextStop.callNo)); }
                                if (k === '통화') { setPhase('정차'); setQrOpen(false); open(0); }
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
                            /* 🔴 시나리오가 켜져 있으면 «다녀온 곳»도 시나리오가 정한다 —
                               끄지 않으면 이 버튼이 먹통이다 (규칙 ③) */
                            onClick={() => { setStepNo(null); setPlaying(false); setVisitedCount(i + 1); setLog(`「현구간」은 ${st.no}~${plan.stops[i + 1]!.no} — ${st.name} → ${plan.stops[i + 1]!.name} 입니다.`); }}
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

                {/* ⟳ **«자동으로 다시 부를 것인가»(Q8)를 판단하실 재료**.
                    🔴 시나리오가 켜져 있으면 안 보인다 — 경로를 정하는 곳이 둘이면 갈라진다 */}
                {!step && cost && (<>
                <h2 className="mt-6 text-[12.5px] font-black tracking-wide text-info mb-2">⟳ 다시 물으면 어떻게 되나 <span className="text-text-muted font-bold">(Q8)</span></h2>
                <button type="button"
                    onClick={() => { setReasked(r => !r); setOpenIdx(-1); setQrPeek(0);
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
                                const c = reaskCost(MOCK_PLANS[n])!;   // 3·4·5콜 계획은 언제나 있다
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
                </>)}

                {/**
                  * 🧑‍✈️ **헤더 — 「내 지금 상태」** (기사님)
                  *
                  * 값과 폭은 `HEADER_CASES` 한 곳에서 온다 — 버튼과 화면이 갈라지지 않게 (규칙 ③).
                  */}
                <h2 className="mt-6 text-[12.5px] font-black tracking-wide text-info mb-1">🧑‍✈️ 헤더 — 상황을 눌러 본다</h2>
                <p className="text-[12px] text-text-muted mb-2 leading-relaxed">
                    기사님이 <b className="text-text-primary">다섯</b>을 말씀하셨습니다 — 로그인 · <b className="text-text-primary">설정을 불러오는 것</b> ·
                    내 차 · 내 차 상황 · 서버 통신. 그중 <b className="text-text-primary">「설정을 불러왔나」가 통째로 빈칸</b>이었습니다.
                </p>
                <div className="flex gap-1.5 flex-wrap">
                    {HEADER_CASES.map(c => (
                        <button key={c.k} type="button"
                            onClick={() => { setHeaderCase(c.k); setLog(`🧑‍✈️ ${c.t} — ${c.why}`); }}
                            className={`px-2.5 py-2 rounded-[9px] border text-[12px] font-black ${headerCase === c.k
                                ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-surface text-text-primary hover:border-info'}`}>
                            {c.t}
                        </button>
                    ))}
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-text-muted">
                    🔴 <b className="text-text-primary">실물은 가장 바쁠 때 60칸</b>인데 폰 한 줄은 56칸입니다 (헤더.md §1 실측).
                    터지는 것은 <b className="text-text-primary">괄호 안 차종 목록</b> 하나 때문입니다 —
                    <code className="text-text-primary">예약 3건 (다마스, 다마스, 다마스)</code> 가 그것만 27칸입니다.
                    <br />· <b className="text-text-primary">그 목록을 지웠습니다</b> — 콜 목록이 이미 말하고 있습니다 (규칙 ③)
                    <br />· 대신 <b className="text-text-primary">📦 적재</b>와 <b className="text-text-primary">확신도</b>를 올렸습니다.
                    ⚠️ 지금 필터 줄에도 있으므로 <b className="text-text-primary">올리는 것이 아니라 «옮기는» 것</b>이라야 합니다 — 별도 판입니다
                    <br />🔴 <b className="text-text-primary">테마 아이콘을 뺐습니다.</b> 차 이름을 누르면 설정창이고 테마는 그 안입니다
                    <br />🔴 <b className="text-text-primary">설정 배지는 정상이면 안 그립니다</b> — 이상할 때만 자리를 씁니다
                    <br />⚠️ <b className="text-text-primary">시계는 「폰 시계」입니다</b>(<code>new Date()</code>). 서버 연결 점 옆에 있어
                    «서버가 말한 시각»으로 읽히는데, 판정은 <b className="text-text-primary">서버 시각</b> 기준입니다
                </p>

                {/**
                  * 📱 **상황을 눌러 본다** (기사님).
                  *
                  * 🔴 나란히 아홉 줄을 늘어놓기도 해 봤는데, **진짜 화면에서 보는 것**이 낫다 —
                  *    조작판은 560px 이라 거기서 멀쩡해도 폰(400px)에서는 넘친다.
                  *    누르면 **맨 위 폰 줄**이 그 상황이 된다.
                  * 🔴 값과 폭은 `DEVICE_CASES` 한 곳에서 온다 — 버튼과 화면이 갈라지지 않게 (규칙 ③).
                  */}
                <h2 className="mt-6 text-[12.5px] font-black tracking-wide text-info mb-1">📱 폰 줄 — 상황을 눌러 본다</h2>
                <p className="text-[11.5px] text-text-muted mb-2">
                    누르면 <b className="text-text-primary">맨 위 폰 줄</b>이 그 상황이 됩니다.
                    괄호 안은 그때의 <b className="text-text-primary">한 줄 폭</b> — 폰 한 줄은 <b className="text-text-primary">56칸</b>입니다.
                </p>
                <div className="flex gap-1.5 flex-wrap">
                    {DEVICE_CASES.map(c => {
                        const n = caseWidth(c.over);
                        return (
                            <button key={c.k} type="button"
                                onClick={() => { setDeviceCase(c.k); setLog(`📱 ${c.t} — ${c.why} (한 줄 ${n}칸 / 56칸)`); }}
                                className={`px-2.5 py-2 rounded-[9px] border text-[12px] font-black ${deviceCase === c.k
                                    ? 'bg-info/15 border-info/55 text-info'
                                    : 'border-border-hover bg-surface text-text-primary hover:border-info'}`}>
                                {c.t} <span className={`font-bold tabular-nums ${n > 56 ? 'text-danger' : 'text-text-muted'}`}>({n})</span>
                            </button>
                        );
                    })}
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-text-muted">
                    🔴 <b className="text-text-primary">「가장 길게」가 그 선에 가장 가깝습니다</b> —
                    다만 알 수 없는 화면인데 성적표가 온다는 것은 <b className="text-text-primary">동시에 참이기 어렵습니다</b>
                    (화면을 모르면 스캔도 못 하니까요).
                    <br />· <b className="text-text-primary">💤 화면 꺼짐 · 📵 통신 두절</b>에서는 배차망이 사라져 오히려 짧아집니다
                    <br />· <b className="text-text-primary">👁️ 눈 가림</b>은 화면이 켜져 있는데 못 읽는 것이라 배지는 그대로입니다
                </p>

                <h2 className="mt-6 text-[12.5px] font-black tracking-wide text-info mb-2">📱 폰이 몇 대인가</h2>
                <div className="flex gap-1.5 flex-wrap">
                    {Object.keys(DEVICE_SETS).map(k => (
                        <button key={k} type="button"
                            onClick={() => { setDeviceSet(k); setModeOpenId(null);
                                const n = DEVICE_SETS[k].length;
                                setLog(`📱 ${k} — 폰 하나가 한 덩어리입니다. ${n}대면 ${n * 34 + 8}px 를 씁니다.`); }}
                            className={`px-3 py-2 rounded-[9px] border text-[12.5px] font-black ${deviceSet === k
                                ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-surface text-text-primary hover:border-info'}`}>
                            {k}
                        </button>
                    ))}
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-text-muted">
                    🔴 <b className="text-text-primary">폰 하나가 한 줄</b>입니다 (기사님 확정 2026-09-05).
                    <br />처음엔 가로로 이었는데 3대면 ≈73칸이라 넘쳤고, 밀려난 폰은 <b className="text-text-primary">없는 것과 같았습니다</b>.
                    관제의 물음이 «어느 폰이 문제인가»인데 그 폰이 화면 밖이면 답을 못 합니다.
                    <br />· 값은 <b className="text-text-primary">높이</b>로 치릅니다 — 한 대 34px · <b className="text-text-primary">세 대 110px</b>
                    <br />· <b className="text-text-primary">모드는 오른쪽 끝 고정</b>입니다 — 폰마다 자리가 같아야 눈이 안 헤맵니다
                    <br />· 세로로 쌓으니 <b className="text-text-primary">폭이 남아 글씨를 키웠습니다</b> (이름 14px · 배지 13px)
                    <br />· <b className="text-text-primary">한 대가 한 덩어리(카드)</b>입니다 — 펴면 <b className="text-text-primary">그 카드 안</b>에 들어갑니다
                    <br />· 모드를 열면 <b className="text-text-primary">선택된 칸이 닫혔을 때 그 자리에 그대로 얹힙니다</b> — 눌러도 배지가 안 움직입니다
                    <br />🔴 <b className="text-text-primary">모드는 폰마다 하나씩</b>입니다 —
                    픽커만 대기로 두고 싶을 때가 있으니 «셋 다 바꾸기»로 묶지 않았습니다.
                    <br />· <b className="text-text-primary">폰 이름을 누르면</b> 접힌 셋이 그 카드 안에 펴집니다 —
                    「⋯」 를 없앴습니다 («여기를 누르세요»만 말하는 칸이라 공간만 먹었습니다). 한 번에 한 대만 열립니다.
                </p>

                <h2 className="mt-6 text-[12.5px] font-black tracking-wide text-info mb-2">📱 모드 — 앱이 받는 순간</h2>
                <div className="flex gap-1.5 flex-wrap">
                    {devices.map(d => (
                        <button key={d.id} type="button" disabled={!modePendings[d.id]}
                            onClick={() => {
                                const m = modePendings[d.id];
                                setDeviceModes(v => ({ ...v, [d.id]: m }));
                                setModePendings(v => { const n = { ...v }; delete n[d.id]; return n; });
                                setLog(`📱 ${d.name} 이 «${m}» 을 가져갔습니다 — 이제 그것이 참입니다.`);
                            }}
                            className="px-3 py-2 rounded-[9px] border border-border-hover bg-surface text-[12.5px] font-black
                                       hover:border-info disabled:opacity-30">
                            📱 {d.name} 이 받았다
                        </button>
                    ))}
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-text-muted">
                    🔴 <b className="text-text-primary">모드는 왕복입니다</b> — 관제 → 앱 → 관제.
                    <b className="text-text-primary"> 앱이 가져가야 참이 됩니다.</b>
                    고르면 <b className="text-text-primary">이전 값이 딤드되고 그 위에 로딩</b>이 돕니다 —
                    새 값을 미리 그리면 화면이 «벌써 됐다»고 거짓말합니다.
                    <br />🔴 실물에서는 <b className="text-text-primary">10초가 지나면 버튼이 다시 눌립니다</b> —
                    로딩은 계속 돌되 손이 묶이지 않습니다.
                </p>

                <h2 className="mt-6 text-[12.5px] font-black tracking-wide text-info mb-2">🌈 콜 색표 — 예전 색과 비교</h2>
                <div className="flex gap-1.5 flex-wrap">
                    {([[true, '새 색표 (색상=콜)'], [false, '예전 (초록=상차·로즈=하차)']] as [boolean, string][]).map(([k, t]) => (
                        <button key={t} type="button"
                            onClick={() => { setRainbow(k); setLog(`${t} — 지도와 목록을 같이 보세요. 같은 색이 같은 콜입니다.`); }}
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

                {/* 🧭 **QR 두 안** — 기사님이 눈으로 고르실 자리 */}
                <h2 className="mt-6 text-[12.5px] font-black tracking-wide text-info mb-2">🧭 내비 QR — 두 안 비교</h2>
                <div className="grid grid-cols-2 gap-2">
                    {([['sheet', 'ⓐ 눌러서 크게'], ['always', 'ⓑ 늘 작게 떠 있게']] as const).map(([k, t]) => (
                        <button key={k} type="button"
                            onClick={() => { setQrStyle(k); setQrOpen(false);
                                setLog(k === 'sheet'
                                    ? 'ⓐ 지도 우하단 「QR 코드」를 누르면 QR 이 화면을 덮습니다 — 큽니다. 탭 2번(열고·닫고).'
                                    : 'ⓑ 지도 우하단에 QR 이 늘 떠 있습니다 — 누를 필요가 없습니다. 대신 작아서 안 찍힐 수 있습니다.'); }}
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

                {/**
                  * 🔍 **주소 원문은 여기 접어 둔다** (기사님: *"이 코드가 필요한가?
                  *    지워도 될 것 같은데"*). 찍는 화면에 둘 이유는 없다 — 카카오가 QR 을 거부할 때
                  *    원인(등록 주소 불일치)을 눈으로 찾는 도구다.
                  * 🔴 그래도 아주 없애지는 않는다 — QR 이 안 열리면 **이것이 유일한 단서**다.
                  *    조작판은 실물에 없는 자리라 여기서는 군더더기가 아니다.
                  */}
                {qrReady && (
                    <details className="mt-2">
                        <summary className="text-[11.5px] font-bold text-text-muted cursor-pointer select-none">
                            🔍 QR 안에 실제로 들어간 주소 (안 열릴 때만 봅니다)
                        </summary>
                        <p className="mt-1 text-[9px] leading-snug text-text-muted break-all select-all">
                            {naviQrText(qrArgs)}
                        </p>
                    </details>
                )}

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

                {/* 🪧 **판정보드 자리** — 기사님이 받으신 의견에서 */}
                <h2 className="mt-6 text-[12.5px] font-black tracking-wide text-info mb-2">🪧 판정보드 자리 — 두 안 비교</h2>
                <div className="grid grid-cols-2 gap-2">
                    {([['filter', 'ⓐ 필터 자리 — 지금 실물'], ['sheet', 'ⓑ 콜 영역 — 기사님 안']] as const).map(([k, t]) => (
                        <button key={k} type="button"
                            onClick={() => {
                                setSeatPlace(k);
                                setFilterCompact(k === 'sheet');
                                const judging = SCENARIO.find(x => x.seat);
                                if (!step?.seat && judging) goStep(judging.no);
                                setLog(k === 'filter'
                                    ? 'ⓐ 심사석이 필터 자리(위)에 뜹니다 — 기사님 확정 0831. 늘 보이지만 엄지에서 멉니다.'
                                    : 'ⓑ 판정이 시트 맨 아래에 붙습니다 — 콜 목록 바로 밑이라 KEEP 하면 바로 위로 올라갑니다. 필터도 함께 접었습니다.'); }}
                            className={`px-3 py-2 rounded-[9px] border text-[12.5px] font-black ${seatPlace === k
                                ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-surface text-text-primary hover:border-info'}`}>
                            {t}
                        </button>
                    ))}
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-text-muted">
                    🟢 <b className="text-text-primary">ⓑ 가 기사님 안입니다</b> — 위에서 아래로
                    <b className="text-text-primary"> 시트 상태바 → 지금 가진 콜 → 판정</b>이 놓이고,
                    시트는 <b className="text-text-primary">딱 그만큼만</b> 열립니다. 여백이 없어 남는 자리는 전부 지도입니다.
                    <br />· 판정이 <b className="text-text-primary">맨 아래</b>라 엄지에 가장 가깝고, 자리가 늘 같습니다
                    <br />· 콜 목록 바로 밑이라 KEEP 하면 <b className="text-text-primary">바로 위로 올라가는 것</b>이 보입니다
                    <br />· 콜이 하나면 낮게, 셋이면 높게 — <b className="text-text-primary">지도가 위아래로 덜 움직입니다</b>
                    <br />🔴 걱정하신 <b className="text-text-primary">높이 계산은 부담이 아니었습니다</b> —
                    시트가 «내용만큼» 서고, 넘치면 목록만 그 안에서 스크롤합니다. 상태바와 판정은 붙박이라 안 밀립니다.
                    <br />⚠️ 심사 중에는 <b className="text-text-primary">지도가 그만큼 줄어듭니다.</b>
                    30초짜리라 견딜 만하다고 보지만 <b className="text-text-primary">실주행에서 봐야 압니다.</b>
                    <br /><br />🔴 <b className="text-text-primary">한 줄 심사석</b>도 ⓑ 에 남겼습니다 —
                    <i>"심사가 매번 한 곳에서 노출되었으면 좋겠어. 그 자리에서 항상 나타난다는 것이 중요해."</i>
                    <b className="text-text-primary"> 자리가 고정되면 «어디에 떴나»를 찾는 시간이 0</b>이 됩니다.
                    KEEP 하면 <b className="text-text-primary">바로 아래 목록으로 들어가는 것</b>이 손짓으로 보이고,
                    시트 위라 <b className="text-text-primary">주행 중에도 보입니다</b> — ⓑ 가 두 단으로 풀려던 위험이 그냥 없어집니다.
                    <br />🔴 걱정하신 <b className="text-text-primary">높이 계산은 부담이 아니었습니다</b> —
                    시트가 자기 안에서 붙박이 높이를 재서 그만큼 낮게 섭니다. 바깥은 «얹을 것»만 넘기고 숫자를 모릅니다.
                    <br />⚠️ 다만 심사 중에는 <b className="text-text-primary">지도가 그만큼 줄어듭니다.</b>
                    30초짜리라 견딜 만하다고 보지만 <b className="text-text-primary">실주행에서 봐야 압니다.</b>
                    <br /><br />🔴 <b className="text-text-primary">ⓑ 의 위험은 «주행 중엔 시트가 내려가 있다»</b> 입니다 —
                    심사는 30초짜리라 못 보면 자동 취소되고, 시트를 저절로 올리면 운전 중에 지도를 덮습니다.
                    그래서 <b className="text-text-primary">두 단</b>으로 나눴습니다:
                    <br />· 내려가 있을 때 — <b className="text-text-primary">상태바 한 줄</b>(색·점수·시급·거절/KEEP). 지도를 안 덮습니다
                    <br />· 올리면 — 심사석 전체(사유·근거·게이트)
                    <br />근거는 기사님 말씀입니다 — <i>"KEEP 버튼의 내용보다는 파란색, 녹색이면 바로 잡을 거야."</i>
                    색과 점수만 보고 1~2초에 누르신다면 <b className="text-text-primary">한 줄이면 충분합니다.</b>
                    <br />⚠️ 심사석이 «필터 자리를 빌려 쓴다»는 <b className="text-text-primary">기사님이 0831 에 정하신 것</b>입니다 —
                    뒤집기 전에 그때 이유를 확인해 주십시오.
                </p>

                <h2 className="mt-6 text-[12.5px] font-black tracking-wide text-info mb-2">필터 영역 — 두 안 비교</h2>
                <div className="flex gap-1.5 flex-wrap">
                    {([[false, '안 A · 펼침 150px'], [true, '안 B · 접힘 38px']] as [boolean, string][]).map(([k, t]) => (
                        <button key={t} type="button"
                            onClick={() => { setFilterCompact(k); setLog(`${t} — 지도 높이가 ${k ? '112px 더 큽니다' : '기본입니다'}. 시트를 내려 보시면 차이가 큽니다.`); }}
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

                {/* 🔴 **높이를 바꾸는 곳은 여기 하나다** (기사님:
                    *"지도가 위아래로 움직이는 것이 불편해"*). 다른 버튼이 곁다리로
                    시트를 올리고 내리면 누를 때마다 지도가 뛴다.
                    ⚠️ 「운행 한 바퀴」의 국면만 예외다 — «주행 중 = 지도만 보인다»가
                       그 국면의 뜻 자체라서 높이가 곧 그 장면이다. */}
                <h2 className="mt-6 text-[12.5px] font-black tracking-wide text-info mb-2">시트 높이 — 여기서만 바뀝니다</h2>
                <div className="flex gap-1.5 flex-wrap">
                    {([['peek', '가 · 상태바만'], ['list', '나 · 목록만큼'], ['full', '다 · 다 쓰기']] as [SheetSnap, string][]).map(([k, t]) => (
                        <button key={k} type="button"
                            onClick={() => changeSnap(k, `시트를 «${t}» 로 옮겼습니다 — 지도가 그만큼 비켜 줍니다.`)}
                            className={`px-3 py-2 rounded-[9px] border text-[12.5px] font-black ${snap === k
                                ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-surface text-text-primary hover:border-info'}`}>
                            {t}
                        </button>
                    ))}
                </div>
                <p className="mt-2.5 pt-2.5 border-t border-border-card text-[12px] leading-relaxed text-text-muted tabular-nums">{log}</p>

                {/**
                  * 🔴 **목업을 시작할 때 전제를 적고 번호를 가리킨다**.
                  *    기사님: *"값어치는 «지금 맞추는 것»이 아니라 «다음에 내가 틀린 전제로
                  *    판을 짜기 전에 여기서 걸리는 것»이다."*
                  * 🔴 **화면에 적는 이유** — 문서에만 적으면 목업을 보는 자리에서는 안 읽힌다.
                  *    전제가 안 적혀 있으면 목업이 한 경우(예: 3콜)에 굳어도 모른다.
                  */}
                <h2 className="mt-7 pt-5 border-t border-border-card text-[12.5px] font-black tracking-wide text-info mb-1">
                    이 목업이 참이라고 보는 전제
                </h2>
                <p className="text-[11.5px] text-text-muted mb-2.5">
                    원천은 <b className="text-text-primary">이 목록</b>입니다.
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
                </ul>
            </div>
        </div>
    );
}
