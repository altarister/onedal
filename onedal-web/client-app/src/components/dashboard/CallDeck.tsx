import { Fragment, useEffect, useRef, useState } from 'react';
import type { SecuredOrder } from '@onedal/shared';
import { deriveCallTiming, derivationInputsOf } from '@onedal/shared';
import type { RouteTimelineEntry } from '@onedal/shared';
import { pickAutoFocus } from '../../lib/deckFocus';
import { getAddressLabel, hhmm } from '../../lib/routeUtils';
import { useTheme } from '../../contexts/ThemeContext';
/* 🌈 지도와 **같은 색표**를 읽는다 — 두 벌이면 지도와 목록이 다른 말을 한다 (규칙 ③) */
import { stopBoxBg, callTextColor, PROMISE_CALLED } from '../../styles/callPalette';
import type { CallRecords } from '../../hooks/records';
import { EMPTY_RECORDS } from '../../hooks/records';
import { useJudgmentStore } from '../../stores/judgmentStore';

/**
 * 진행 중인 콜 덱 — **모드가 둘**이고, 각각 기사님 결정이다.
 *
 * | 모드 | 어디서 | 결정 |
 * |---|---|---|
 * | 스와이프 | 🔴 **지금 부르는 곳이 없다** — PinnedRoute 가 늘 `accordion` 으로 부른다 (todo) | *"합짐이 여러 건일 때는 스와이프"* |
 * | 아코디언 (`accordion`) | 🎭 무대 시트 | *"헤더는 무조건 노출, 컨텐츠만 스크롤"* (S23 실주행 캡처) |
 *
 * 아코디언을 쓰는 까닭: 폰 시트에서 콜 목록 밑에 스텝을 잇대면 «어느 콜의 것인지» 안 보인다.
 * 두 모드는 요약 줄·카드를 **한 벌로** 그린다 — `sheetAccordion.test.ts` 가 잠근다.
 *
 * ⚠️ 세로로 스크롤되는 페이지 안에 가로 스크롤을 넣는 것이라
 *    `overscroll-behavior-x: contain` 이 없으면 iOS 에서 **뒤로가기 제스처**가 걸린다.
 *
 * 진행 상태는 카드가 각자 서버 기록에서 파생하므로(`deriveCallStep`),
 * 넘겼다 돌아와도 원래 단계 그대로다 — 덱은 위치만 기억한다.
 */
interface Props {
    orders: SecuredOrder[];
    renderCard: (order: SecuredOrder) => React.ReactNode;
    /** 콜별 서버 기록 — 요약 줄이 진행 단계를 파생하는 데 쓴다 */
    records: Map<string, CallRecords>;
    /**
     * 정거장마다 **경유번호** (기사님) — 지도 핀이 쓰는 것과 같은 값이다.
     * 각자 계산하면 지도와 다른 번호를 말하게 된다 (규칙 ③).
     */
    visitOrderMap: Map<string, { pickupIdx: number; dropoffIdx: number }>;
    /**
     * 🗺️ 경로 타임라인 — **PinnedRoute 가 만든 것을 그대로 받는다** (규칙 ③).
     * 🔴 여기서 **한 벌 더** 파생하면 덱 줄과 버퍼 칩·데드라인이 **다른 정차의 시각**을
     *    말한다. 파생은 한 곳, 여기는 그리기만 한다.
     */
    timeline: RouteTimelineEntry[];
    /** 🛰️ 근접/도착한 정거장의 콜 — 이 값이 바뀌면 그 카드로 넘어간다 (기사님) */
    gpsFocus?: { orderId: string; tick: number } | null;
    /**
     * 🔢 **몇 번 콜인가** — 세는 곳은 파생 한 곳이다 (`useRouteDerivations`).
     *    지도 마커와 **같은 입력**이라야 «색 = 번호»가 성립한다 (규칙 ③ · ⑤-3).
     */
    callNoOf?: (orderId: string) => number | null;
    /**
     * 🪗 **열린 줄 — 밖에서 정한다** (기사님 정의).
     *
     * 🔴 «열었다»가 곧 «다 보겠다»라 **높이가 그 행동의 결과다.** 그러니 여는 일과
     *    시트 높이를 **한 손이 함께** 정해야 한다 — 덱이 혼자 기억하면 둘이 갈린다 (규칙 ③).
     * 🔴 **`-1` 은 «전부 닫힘»이다** — 「나」(타이틀만 보이는 높이)의 정의가 그것이다.
     */
    /**
     * 📏 **시트가 «내용만큼» 서는가** (「나」 높이).
     * 🔴 그때는 `flex-1`(= `flex:1 1 0%`)이 **높이 0 으로 찌부러진다** — 남는 공간이라는
     *    것이 없기 때문이다. `flex-auto` + 상한이라야 한다 (목업이 찾은 값).
     * ⚠️ 아코디언이 혼자 짐작하지 않는다 — 높이를 정하는 무대가 알려 준다 (규칙 ③).
     */
    fit?: boolean;
    openIdx?: number | null;
    onOpenIdx?: (i: number) => void;
    /**
     * 🙈 **숨길 콜** — 배열에서 **빼지 않고** 이 집합으로 가린다 (기사님 지시).
     *
     * 🔴 아코디언은 **목록 자리(`openIdx`)로 열린다.** 배열을 걸러내면 그 자리가 다른 콜을
     *    가리킨다 — 화면규칙 L3 가 못박은 사고다. 그래서 자리를 안 건드린다.
     * 🔴 **언마운트하지 않는다** — 아래 «접힌 콜도 마운트한 채 숨긴다»(#95)와 같은 이유다.
     *    가리는 것은 **CSS** 로 한다.
     * ⚠️ `hidden` **속성**으로는 안 가려진다 — 이 줄의 그릇이 `flex` 라 UA 의 `display:none`
     *    을 이긴다. 그래서 클래스를 바꿔 가린다.
     */
    hiddenIds?: ReadonlySet<string>;
}

export default function CallDeck({ orders, renderCard, records, visitOrderMap, timeline, gpsFocus, callNoOf, openIdx, onOpenIdx, fit, hiddenIds }: Props) {
    /**
     * 🎯 **목적지(`goalCity`)가 둘 이상 섞였을 때만 하차지 옆에 목적지를 붙인다** (목업 콜 카드 «🎯 목적지»).
     *    복귀 대기에서 목적지 콜과 복귀콜이 섞이면 «어느 콜이 집으로 가는 콜인가»가 보여야 한다.
     *    목적지가 하나뿐이면 모든 줄이 같은 글자라 좁은 격자만 먹는다.
     */
    const showBoard = new Set(orders.map(x => x.goalCity).filter(Boolean)).size > 1;

    /**
     * 보고 있는 카드를 **인덱스가 아니라 orderId 로** 기억한다.
     *
     * 🔴 정렬은 시간순으로 고정이라(PinnedRoute) 새 콜이 앞에 끼어들지 않는다. 그래도
     *    콜이 끝나 중간에서 빠지면 인덱스는 어긋난다 — 인덱스로 기억하면 **통화 중에 보던
     *    카드가 저절로 바뀐다.** 그때 어느 카드를 보고 있었는지는 id 만 안다.
     */
    const { theme } = useTheme();          // 🎨 격자 칸의 콜 색은 테마를 탄다
    const [curId, setCurId] = useState<string | null>(null);
    const idx = orders.findIndex(o => o.id === curId);
    /* 🪗 밖에서 정해 주면 그것이 이긴다 — 여는 일과 높이를 한 손이 정한다 */
    const controlled = openIdx != null;
    const cur = controlled ? openIdx : (idx >= 0 ? idx : 0);
    /** 🪗 **전부 닫힘** — 「나」의 정의다. 타이틀만 보이고 카드는 하나도 안 열린다 */
    const noneOpen = cur < 0;

    
    /** 명시적 이동 — 요약 줄 클릭이 쓴다. 사용자의 스와이프는 절대 여기 안 온다 */
    const goTo = (i: number) => {
        /* 🪗 **«전부 닫힘»(-1)을 막지 않는다** — 0 으로 끌어올리면 같은 줄을 다시 눌러도
           안 닫히고, 손으로 「나」(타이틀만)로 돌아갈 길이 없어진다 (기사님) */
        const next = i < 0 ? -1 : Math.min(orders.length - 1, i);
        if (controlled && onOpenIdx) { onOpenIdx(next); return; }
        setCurId(orders[next]?.id ?? null);
    };

    
    /**
     * 목록 자체가 바뀌었을 때만 위치를 다시 맞춘다 (콜이 끝나 빠지는 경우 등).
     *
     * 순서는 시간순으로 고정이라 새 콜은 뒤에 붙기만 하고 기존 위치는 안 밀린다.
     * 그래서 여기가 하는 일은 사실상 **보던 콜이 사라졌을 때 복구**뿐이다.
     */
    const idsKey = orders.map(o => o.id).join(',');
    const prevKey = useRef<string | null>(null);
    useEffect(() => {
        if (prevKey.current === idsKey) return;
        prevKey.current = idsKey;
        if (orders.length === 0) return;

        const i = orders.findIndex(o => o.id === curId);
        if (i < 0) {
            // 보던 콜이 끝났다 — 가장 최근 콜로 (뒤에 붙으므로 마지막이 최신이다)
            const last = orders.length - 1;
            setCurId(orders[last].id);
        }
    }, [idsKey, orders, curId]);

    /**
     * 새로 들어온 **평가중(안전취소) 콜로 자동 이동**한다.
     *
     * 기사님: *"추가 합짐이 나오면 전화 중이라도 콜을 잡을지 말지를 내가 인지해야 하니까
     * 최근으로 스와이프해 줘야 할 것 같아."*
     *
     * ⚠️ 평가중 콜에만 건다. 30초 안에 결재해야 하는 것이 그 콜이기 때문이다.
     *    확정만 된 콜까지 화면을 뺏으면 **통화 중 입력을 방해**한다 —
     *    단위·시각을 고르는 중에 넘어가면 엉뚱한 카드의 칩을 누르게 된다.
     *    (카드는 사라지지 않으므로 입력값 자체는 남는다. 문제는 손이 가는 자리다)
     */
    /**
     * 🛰️ **다가가는 정거장의 콜로 화면이 따라간다** (기사님).
     * 평가중 자동 이동과 달리 운행 중의 전환이다 — 이때 기사님 손은 핸들에 있고,
     * 다음에 볼 카드는 언제나 지금 다가가는 정거장의 것이다.
     */
    useEffect(() => {
        if (!gpsFocus) return;
        const i = orders.findIndex(o => o.id === gpsFocus.orderId);
        if (i >= 0) setCurId(gpsFocus.orderId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gpsFocus?.tick]);

    const seenIds = useRef<Set<string> | null>(null);
    useEffect(() => {
        const target = pickAutoFocus(seenIds.current, orders);
        seenIds.current ??= new Set();
        orders.forEach(o => seenIds.current!.add(o.id));
        if (!target) return;
        const i = orders.findIndex(o => o.id === target);
        if (i >= 0) setCurId(target);
    }, [orders]);

    if (orders.length === 0) return null;

    /**
     * 🪗 **아코디언 헤더 한 줄의 높이** — 위·아래로 붙이는 계산의 **원천 하나** (규칙 ③).
     * 이 값이 곧 «몇 px 위에 붙는가»라서, 줄 높이를 CSS 로만 바꾸면 층이 어긋난다.
     */
    const ROW_H = 32;
    /**
     * 🪧 **타이틀의 모양 — 되돌릴 자리** (낱말 계약의 「바꾼다」).
     *
     *   `'격자'` 지도 실험실 모양 — `[번호][지명][약속][±][예상]` ×2 (기사님: *"그냥 목업처럼 해"*)
     *   `'옛줄'` 기호 모양 — 번호 + `StopMark`(기호 ▲▼) ×2 + 6단계 점
     *
     * 🔴 **`'옛줄'` 갈래는 목업에 없어도 남겨 둔다** — 이 글자 하나를 바꾸면 통째로 돌아온다.
     */

    /**
     * 콜 한 줄(요약 줄)을 만든다 — **두 모드가 이 함수 하나를 쓴다.**
     * 스와이프에서는 위에 모아 놓고, 아코디언에서는 **내용 사이사이에 끼워** 넣는다.
     *
     * 🪗 아코디언에서는 줄이 **밀리지 않는다** — 시트가 100% 고정이고 스크롤은
     *    펼친 카드 안에서만 일어나기 때문이다. 그래서 세 줄이 늘 제자리에 있고,
     *    내용은 **자기 헤더 바로 밑**에 온다 (기사님 설계).
     */
    const rowOf = (o: SecuredOrder, i: number) => {

            const r = records.get(o.id) ?? EMPTY_RECORDS;
            const vo = visitOrderMap.get(o.id);
            // 타임라인에 있으면 그것이 약속이다. 없으면(경로 밖 — 심사 중 후보 등)
            // 콜별 파생으로 폴백 — 시각이 아예 사라지는 것보다는 혼자 간 값이 낫다
            const tle = (stop: 'pickup' | 'dropoff') =>
                timeline.find(e => e.orderId === o.id && e.stopType === stop);
            const jd = derivationInputsOf(useJudgmentStore.getState().judgment);
            /**
             * 👣 **시간표에 없는 정거장이면 콜 자체의 약속** (기사님 실측: *"도착하면 값이 빠져서 빈칸으로 보여"*).
             * 🔴 다녀온 정거장은 시간표에서 빠진다 — 시간표가 통째로 빌 때만 폴백하면 약속이
             *    `--:--` 가 된다. 목업은 다녀온 정거장에도 약속을 남긴다.
             *    필요할 때 한 번만 계산한다 — 시간표에 다 있으면 안 부른다.
             */
            let fallbackMemo: ReturnType<typeof deriveCallTiming> | undefined;
            const fallbackOf = () => (fallbackMemo ??= deriveCallTiming(o, r.reports, r.milestones, Date.now(), jd.rules, jd.unk));
            const promiseOf = (stop: 'pickup' | 'dropoff') => tle(stop)?.promisedUntil
                ?? (stop === 'pickup' ? fallbackOf()?.pickupPromisedArrivalAt : fallbackOf()?.dropoffPromisedArrivalAt)
                ?? null;
            const confirmed = (stop: 'pickup' | 'dropoff') => tle(stop)?.promiseConfirmed
                ?? r.reports.some(rep =>
                    rep.stopType === stop && rep.kind === 'DECLARED' && rep.promisedArrivalAt);
            const isCur = i === cur;
            /**
             * 🪗 **줄은 붙이지(sticky) 않고 높이만 고정한다** (기사님: *"무조건 화면에 노출"* ·
             *    실물: *"여기 겹침이 발생했어"*).
             *
             *    시트가 100% 고정이고 스크롤은 **펼친 카드 안에서만** 일어나므로 헤더는
             *    애초에 밀리지 않는다. 붙이면 펼친 카드 위로 **떠올라 단계 줄과 겹친다.**
             *
             *    🟢 높이를 고정해야 접힘/펼침에 줄 높이가 안 흔들린다.
             */
            const stick: React.CSSProperties = { height: ROW_H };
            return (
                <button
                    key={o.id}
                    type="button"
                    onClick={() => goTo(i)}
                    aria-current={isCur}
                    style={stick}
                    /**
                     * 📏 **껍데기를 목업에 맞춘다** (기사님: *"마진 패딩이 있어서
                     *    **좌우 영역을 손해** 보고 있어. 시트 스타일을 가져올 수 없나?"*).
                     *
                     * 🔴 격자 칸은 이미 목업과 한 벌인데(`callPalette`·같은 `gridTemplateColumns`)
                     *    바깥도 목업처럼 `px-1.5` 에 테두리 없이 둔다 — `px-2.5`(10px) + `gap-1.5`(6px)
                     *    + 테두리(2px)면 한 줄에서 **16px** 을 더 먹는다. 400px 폰에서는 지명 두 자다.
                     * 🔴 **배경은 남긴다** — 아코디언에서 줄이 붙박이라 **불투명 바닥**이 없으면
                     *    아래 글자가 비쳐 겹친다 (기사님 설계). 테두리만 뺀다.
                     * 🔴 «지금 고른 콜»은 **왼쪽 굵은 띠**로 말한다 — 테두리는 사방을 먹지만
                     *    띠는 2px 한 변이다.
                     */
                    className={`w-full flex items-center px-1.5 rounded-md text-left transition-colors border-l-2 ${
                        isCur ? 'bg-info/20 border-info' : 'bg-surface border-transparent'
                    }`}
                >
                    <>
                    {/**
                      * 🧮 **격자 — 칸마다 뜻이 정해져 자리가 곧 이름이다** (기사님: *"그냥 목업처럼 해"*).
                      *    규약은 `timeDisplay.test.ts` 머리에 있고 그 검사가 문다.
                      *
                      *    `[번호][지명][약속][±][예상]` × 상·하차, 가운데 10px 틈으로 가른다.
                      * 🔴 **기호 ▲▼ 대신 약속·±·예상을 적는다** — 기사님이 실험실에서
                      *    «약속 → ± → 예상»이 **한 문장으로 읽힌다**고 확정했다
                      *    (*"22:14에 도착해야 하는데 +24가 걸려서 22:37에 도착 예정"*).
                      * 🔴 **화살표(→)는 쓰지 않는다** — 10px 틈이 그 일을 한다. 글자는 칸을 먹는다.
                      */}
                    {/**
                      * 🔴 **상차 묶음 · 하차 묶음이 제 껍데기를 가진다** (기사님 확정 · 화면 디자인).
                      *
                      * 옛 판은 **열한 칸이 한 격자의 형제**라, 배경과 둥근 모서리를 칸마다 다섯 번씩
                      * 발라 «한 덩어리»를 흉내 냈다(`rounded-l-md` … `rounded-r-md`).
                      * 이제 묶음마다 `<span>` 하나가 배경과 모서리를 **한 번씩** 든다.
                      *
                      * 🔴 **세로줄은 그대로다** — 안쪽 칸이 고정 픽셀(15·41·28·41)이고 늘어나는 것은
                      *    지명의 `1fr` 하나뿐이다. 바깥 두 칸이 `1fr` 로 같은 폭이니 콜이 넷이어도
                      *    약속은 약속끼리, 예상은 예상끼리 선다.
                      */}
                    <span className="grid items-center flex-1 min-w-0 text-[11.5px] font-black tabular-nums"
                        style={{ gridTemplateColumns: 'minmax(0,1fr) 10px minmax(0,1fr)' }}>
                        {(['pickup', 'dropoff'] as const).map(stop => {
                            const tl = tle(stop);
                            const seq = stop === 'pickup' ? vo?.pickupIdx : vo?.dropoffIdx;
                            /** 👣 지나갔나 — 지났으면 색을 죽인다 (시선을 안 뺏는다) */
                            const goneAt = stop === 'pickup' ? o.arrivedPickupAt : o.arrivedDropoffAt;
                            const gone = tl?.arrived === true || goneAt != null;
                            const promised = promiseOf(stop);
                            /** 🏁 마지막 칸은 **결론**이다 — 지났으면 도착(사실), 아직이면 예상 */
                            const real = gone ? (goneAt ? Date.parse(goneAt) : null) : (tl?.etaMs ?? null);
                            /** ± 는 **약속과 견준 값** 하나다 — 지났든 아니든 같은 셈법이다 (규칙 ③) */
                            const diff = real != null && promised != null
                                ? Math.round((real - Date.parse(promised)) / 60000) : null;
                            const no = callNoOf?.(o.id) ?? 1;
                            const box = stopBoxBg(no, stop, theme, gone);
                            return (
                                <Fragment key={stop}>
                                    {stop === 'dropoff' && <span />}
                                    {/* 📦🏁 **묶음 하나** — 배경과 둥근 모서리를 여기서 한 번만 든다 */}
                                    <span className="grid items-center min-w-0 rounded-md overflow-hidden"
                                        style={{ background: box, gridTemplateColumns: '15px minmax(0,1fr) 41px 28px 41px' }}>
                                    <span className={`pl-1 py-0.5 text-[12px] ${gone ? 'text-text-muted' : ''}`}
                                        style={gone ? undefined : { color: callTextColor(no, stop, theme) }}>
                                        {seq ?? '?'}
                                    </span>
                                    <span className={`truncate px-1 py-0.5 ${gone ? 'text-text-muted' : 'text-text-primary'}`}>
                                        {getAddressLabel(stop === 'pickup' ? o.pickup : o.dropoff)}
                                        {stop === 'dropoff' && showBoard && o.goalCity && <span className="ml-1 text-[9.5px] font-bold text-info">🎯{o.goalCity}</span>}
                                    </span>
                                    {/* ☎️ 통화로 정한 약속은 **보라** — 글자를 더하면 격자가 깨진다 (폭 0인 신호) */}
                                    <span className="text-right px-1 py-0.5"
                                        style={{ color: confirmed(stop) ? PROMISE_CALLED : 'var(--color-text-muted)' }}>
                                        {/**
                                          * 🔴 **없으면 «--:--» 다 — 빈칸으로 두지 않는다** (기사님:
                                          *    *"값이 없을 때 **잘려 보일 때**가 있어"*).
                                          *    칸마다 콜 색 띠가 깔리는데 글자가 없으면 **띠만 길게 남아**
                                          *    «무언가 잘렸다»로 읽힌다. 오른쪽 «예상» 칸은 이미 `--:--` 를 쓴다 —
                                          *    같은 줄에서 한 칸만 비면 그게 더 어색하다.
                                          * 🟢 규칙 ⑤-2 그대로다 — **모르면 모른다고 적는다.**
                                          */}
                                        {promised ? hhmm(promised) : '--:--'}
                                    </span>
                                    {/* ± — **늦음만 노랑**이다. 초록·빨강은 판정 색과 겨루므로 안 쓴다 (§4) */}
                                    <span className={`text-right px-1 py-0.5 ${diff != null && diff > 0 && !gone ? 'text-warning' : 'text-text-muted'}`}>
                                        {diff == null ? '' : diff > 0 ? `+${diff}` : `${diff}`}
                                    </span>
                                    <span className={`text-right pr-1 py-0.5 ${gone ? 'text-text-muted' : ''}`}>
                                        {real != null ? hhmm(new Date(real).toISOString()) : '--:--'}
                                    </span>
                                    </span>
                                </Fragment>
                            );
                        })}
                    </span>

                    {/**
                      * 🔵 **6단계 점 — 내려 뒀다**.
                      *
                      * 🔴 **지운 것이 아니다.** 기사님이 *"그냥 목업처럼 해"* 라 하셨고 지도 실험실
                      *    타이틀에는 점이 없다. 400px 에서 격자만으로도 꽉 차서 점을 같은 줄에 두면
                      *    **지명이 잘린다** (실측). 그래서 **플래그 뒤로 내렸다** — 한 줄이면 돌아온다.
                      * 🟢 6단계는 **펼친 카드 안에도 그대로 있다** (`PinnedRouteCard` 스텝 목록) —
                      *    사라진 정보가 아니라 **자리를 옮긴 것**이다.
                      */}
                    </>
                    
                </button>
            );
    };

    // 🗺️ 시각의 원천은 "지금 경로" 하나다 (기사님 동의) — 타임라인은
    //    PinnedRoute 가 새 장부(stepRecords)로 만든 것을 prop 으로 받는다 (Props 주석)
    return (
        /* 📏 **아코디언은 시트가 준 자리를 그대로 쓴다** (기사님 «타이틀이 화면 밖으로»).
              감싸개가 auto 로 서면 안쪽 `flex-1` 이 기댈 곳이 없어 내용대로 자란다 —
              그러면 콜 줄이 위로 밀려 나간다. 사슬은 **한 칸도 끊기면 안 된다.**
           ⚠️ 아코디언이 아닐 때(스와이프)는 그대로 auto 다 — 거기는 문서 스크롤이 정상이다. */
        <div className="flex flex-col flex-1 min-h-0">
            {/* ══ 콜 요약 줄 — **스와이프하지 않아도 보인다** ══
                기사님: *"2개 있다면 각각 어디까지 진행되고 있는지 모두 스와이핑해야만 보인다.
                그건 문제가 있다. 스와이프 영역 위에 콜마다의 진행 상황이 노출되어야
                **폰에 손대지 않고** 아직 전화하지 않은 부분이 어디인지 인지할 수 있을 것 같다."*

                그래서 **콜마다 한 줄**을 둔다. 줄을 누르면 그 카드로 넘어간다.
                아직 통화 안 한 콜은 📞 로 눈에 띄게 — 그게 손대기 전에 알아야 할 것이다.

                🔴 **1건부터 나타난다.** 기사님: *"콜이 들어오면 디폴트로 표시되어야 할 것 같다."*
                영역이 생겼다 없어지면 화면이 튀고, 무엇보다 **첫 콜에서도 지금 뭘 해야 하는지**를
                같은 자리에서 봐야 한다. **1건이든 2건이든 줄의 생김새는 같다.** */}
                {/**
                  * 🪗 **아코디언** — 줄 · 그 콜의 내용 · 줄 · … 로 **끼워** 그린다.
                  *    내용이 자기 헤더 바로 밑에 오므로 «이건 누구 것인가»가 안 생긴다.
                  *    (기사님 확정: *"아코디언 헤더는 무조건 화면에 노출하고
                  *     컨텐츠 영역에 스크롤할 수 있게"*)
                  * 🪗 **그릇은 시트 높이를 그대로 쓰고 넘치지 않는다** (기사님 확정).
                  *    넘치면 시트가 통째로 길어져 **헤더도, 맨 아래 판정석도 화면 밖으로 나간다.**
                  */}
                <div className={`flex flex-col gap-1.5 px-2.5 pt-1 pb-2.5 overflow-hidden min-h-0 ${fit ? "" : "flex-1"}`}>
                    {orders.map((o, i) => {
                        const open = !noneOpen && i === cur;
                        /* 🙈 지나간 콜 — **자리는 그대로 두고** 가린다 (`lib/pastCalls` 머리 참조) */
                        const veiled = hiddenIds?.has(o.id) ?? false;
                        return (
                        /* 🔴 닫힌 콜은 **자기 높이만**(flex-none) · 펼친 콜이 남는 자리를 다 먹는다 */
                        <div key={o.id} className={`${veiled ? 'hidden' : 'flex'} flex-col min-h-0 ${
                            open ? (fit ? 'flex-auto' : 'flex-1') : 'flex-none'}`}>
                            {rowOf(o, i)}
                            {/* 🔴 접힌 콜도 **마운트한 채** 숨긴다 — 언마운트하면 통화 중 적던
                                단위·수량이 날아가고 카드가 서버에 단계를 다시 청한다
                                🟢 **잘라 감추지 않고 스크롤한다** — 모자라면 손으로 내려 보는 것이
                                   «없는 것»보다 낫다 (규칙 ④) */}
                            <div hidden={!open}
                                 /* 📏 **flex 상자로 둔다** — 카드가 «열린 칸만큼» 서야 위 덩어리는
                                    고정되고 **단계만 스크롤**한다 (목업 동작 · 재서 잡았다) */
                                 className={`${fit ? 'flex-auto max-h-[46vh]' : 'flex-1 min-h-0'} mt-1.5 flex flex-col overflow-y-auto`}>
                                {renderCard(o)}
                            </div>
                        </div>
                        );
                    })}
                </div>
            {/* 하단 페이저 점은 두지 않는다 — 위 요약 줄이 위치(번호·테두리)와 진행을 함께 보여주므로
                같은 정보를 두 번 그리면 세로만 잡아먹는다. 폰 한 화면이 목표다. */}
        </div>
    );
}

