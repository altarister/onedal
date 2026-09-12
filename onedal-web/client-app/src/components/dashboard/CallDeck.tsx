import { Fragment, useEffect, useRef, useState } from 'react';
import type { SecuredOrder } from '@onedal/shared';
import { deriveCallStep, CALL_STEPS, deriveCallTiming, derivationInputsOf, isEvaluating } from '@onedal/shared';
import type { RouteTimelineEntry } from '@onedal/shared';
import { pickAutoFocus, scrollSettle } from '../../lib/deckFocus';
import { getAddressLabel, hhmm } from '../../lib/routeUtils';
import { useTheme } from '../../contexts/ThemeContext';
import { MAP_THEME_COLORS } from '../../styles/themes';
/* 🌈 지도와 **같은 색표**를 읽는다 — 두 벌이면 지도와 목록이 다른 말을 한다 (규칙 ③) */
import { callNodeFill, callNodeStroke, callNodeText, stopBoxBg, callTextColor, PROMISE_CALLED } from '../../styles/callPalette';
import type { CallRecords } from '../../hooks/records';
import { EMPTY_RECORDS } from '../../hooks/records';
import { useJudgmentStore } from '../../stores/judgmentStore';

/**
 * [Phase 8.5] 진행 중인 콜 덱 — **모드가 둘**이고, 각각 기사님 결정이다.
 *
 * | 모드 | 어디서 | 결정 |
 * |---|---|---|
 * | 스와이프 (기본) | 옛 화면 (토글 꺼짐) | *"합짐이 여러 건일 때는 스와이프"* (2026-08) |
 * | 아코디언 (`accordion`) | 🎭 무대 시트 | *"헤더는 무조건 노출, 컨텐츠만 스크롤"* (2026-09-03 · S23 실주행 캡처) |
 *
 * 갈아탄 까닭: 폰 시트에서 콜 목록 밑에 이어지는 스텝이 «어느 콜의 것인지» 안 보였다.
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
     * 정거장마다 **경유번호** (기사님 2026-08-19) — 지도 핀이 쓰는 것과 같은 값이다.
     * 각자 계산하면 지도와 다른 번호를 말하게 된다 (규칙 ③).
     */
    visitOrderMap: Map<string, { pickupIdx: number; dropoffIdx: number }>;
    /**
     * 🗺️ 경로 타임라인 — **PinnedRoute 가 만든 것을 그대로 받는다** (규칙 ③).
     * 🔴 예전엔 여기서 routeStops + 옛 장부(callRecords)로 **한 벌 더** 파생했다.
     *    옛 장부에는 KEEP 의 계획 짐값이 없어 정차가 미확인 15분으로 잡혔고,
     *    덱 줄(~15:46)과 버퍼 칩·데드라인(15:37)이 **다른 정차의 시각**을 말했다
     *    (2026-08-21 리허설 13 실측). 파생은 한 곳, 여기는 그리기만 한다.
     */
    timeline: RouteTimelineEntry[];
    /** 🛰️ 근접/도착한 정거장의 콜 — 이 값이 바뀌면 그 카드로 넘어간다 (기사님 2026-08-19) */
    gpsFocus?: { orderId: string; tick: number } | null;
    /**
     * 🔢 **몇 번 콜인가** — 세는 곳은 파생 한 곳이다 (`useRouteDerivations`).
     *    지도 마커와 **같은 입력**이라야 «색 = 번호»가 성립한다 (규칙 ③ · ⑤-3).
     */
    callNoOf?: (orderId: string) => number | null;
    /**
     * 🪗 **열린 줄 — 밖에서 정한다** (기사님 정의 2026-09-05).
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
     * 🪗 **아코디언 모드** (기사님 확정 2026-09-03 실주행 뒤 · S23 캡처와 함께):
     * *"시트에 콜리스트 3개 아래로 관련된 스텝이 보이고 있는데.. 그러니까 뭘 보고 있는지
     * 어려워. 아코디언으로 만들고, 아코디언 헤더는 무조건 화면에 노출하고,
     * 컨텐츠 영역에 스크롤할 수 있게 하는 것이 어떨까?"*
     *
     * · 요약 줄(콜 한 줄)이 **헤더**다 — 시트가 100% 고정이라 접혀도 늘 보인다
     * · 가로 스와이프 트랙 대신 **고른 콜 하나**를 세로로 그린다 — 스크롤이 콜 경계를
     *   안 넘으니 «지금 뭘 보고 있는지»가 안 헷갈린다
     * · 줄 그리는 코드는 두 모드가 **한 벌**을 쓴다 (규칙 ③ — 갈라지면 다른 말을 한다)
     *
     * ⚠️ 옛 화면(토글 꺼짐)은 스와이프 덱 그대로다 — 기사님 지적은 «폰 시트»에 대한 것이다.
     */
    accordion?: boolean;
}

export default function CallDeck({ orders, renderCard, records, visitOrderMap, timeline, gpsFocus, accordion, callNoOf, openIdx, onOpenIdx, fit }: Props) {
    const trackRef = useRef<HTMLDivElement>(null);

    /**
     * 보고 있는 카드를 **인덱스가 아니라 orderId 로** 기억한다.
     *
     * 🔴 2026-08-12 — 예전 정렬이 `평가중 먼저 → 최신순` 이라 새 콜이 맨 앞에 끼어들었고,
     *    인덱스로 기억하니 보던 카드가 0번에서 1번으로 밀려도 덱은 계속 "0번"을 보여줬다.
     *    **통화 중에 카드가 저절로 바뀌었다.**
     *
     *    지금은 정렬을 시간순으로 고정해서(PinnedRoute) 순서 자체가 안 흔들린다.
     *    그래도 id 로 기억하는 것은 유지한다 — 콜이 끝나 중간에서 빠질 때
     *    인덱스는 여전히 어긋나고, 그때 어느 카드를 보고 있었는지는 id 만 안다.
     */
    const { theme } = useTheme();          // 🎨 격자 칸의 콜 색은 테마를 탄다
    const [curId, setCurId] = useState<string | null>(null);
    const idx = orders.findIndex(o => o.id === curId);
    /* 🪗 밖에서 정해 주면 그것이 이긴다 — 여는 일과 높이를 한 손이 정한다 */
    const controlled = openIdx != null;
    const cur = controlled ? openIdx : (idx >= 0 ? idx : 0);
    /** 🪗 **전부 닫힘** — 「나」의 정의다. 타이틀만 보이고 카드는 하나도 안 열린다 */
    const noneOpen = cur < 0;

    /**
     * 프로그램이 스크롤을 미는 중인 목표 인덱스.
     *
     * 🔴 2026-08-12 — 이게 없어서 **요약 줄을 누르면 하이라이트가 왔다갔다** 했다.
     *    줄을 누르면 `setCurId(목표)` 로 하이라이트가 먼저 옮겨가는데,
     *    이어지는 부드러운 스크롤 **도중에** `onScroll` 이 계속 발동한다.
     *    애니메이션 초반의 `scrollLeft` 는 아직 출발지 쪽이라
     *    `Math.round(scrollLeft / width)` 가 **이전 인덱스**를 내놓고,
     *    그 값으로 `curId` 를 되돌려 버렸다. (기사님: *"이전으로 왔다갔다"*)
     *
     *    미는 동안에는 위치를 갱신하지 않고, 목표에 닿으면 잠금을 푼다.
     */
    const pendingIdx = useRef<number | null>(null);
    const pendingTimer = useRef<number | null>(null);

    const releasePending = () => {
        pendingIdx.current = null;
        if (pendingTimer.current !== null) {
            clearTimeout(pendingTimer.current);
            pendingTimer.current = null;
        }
    };
    useEffect(() => releasePending, []);

    const scrollToIndex = (i: number, smooth = true) => {
        if (accordion) return;   // 🪗 아코디언엔 가로 트랙이 없다 — 불변식을 주석이 아니라 코드로 못박는다
        const el = trackRef.current;
        if (!el || !el.clientWidth) return;
        const already = Math.round(el.scrollLeft / el.clientWidth) === i;
        el.scrollTo({ left: i * el.clientWidth, behavior: smooth ? 'smooth' : 'auto' });

        // 즉시 이동이거나 이미 그 자리면 잠글 이유가 없다 (잠그면 풀 계기가 없다)
        if (!smooth || already) { releasePending(); return; }

        pendingIdx.current = i;
        if (pendingTimer.current !== null) clearTimeout(pendingTimer.current);
        // 애니메이션이 목표에 딱 안 떨어질 수 있다. 잠금이 영원히 남아 스와이프가
        // 먹통이 되는 일이 없도록 반드시 풀어 준다
        pendingTimer.current = window.setTimeout(releasePending, 900);
    };

    /** 명시적 이동 — 요약 줄 클릭과 자동 이동만 쓴다. 사용자의 스와이프는 절대 여기 안 온다 */
    const goTo = (i: number) => {
        /* 🪗 **«전부 닫힘»(-1)을 막지 않는다** — 0 으로 끌어올리면 같은 줄을 다시 눌러도
           안 닫히고, 손으로 「나」(타이틀만)로 돌아갈 길이 없어진다 (기사님 0905) */
        const next = i < 0 ? -1 : Math.min(orders.length - 1, i);
        if (controlled && onOpenIdx) { onOpenIdx(next); return; }
        scrollToIndex(next);
        setCurId(orders[next]?.id ?? null);
    };

    /**
     * 스와이프하면 **어느 카드를 보고 있는지만** 갱신한다. 스크롤은 건드리지 않는다.
     *
     * 🔴 2026-08-12 — 여기서 갱신한 값을 보고 `useEffect([idx])` 가 곧바로 하드 스크롤을 걸었다.
     *    손가락이 미는 중에 코드가 같은 축을 잡아채니 관성과 스냅이 죽었다.
     *    (기사님: *"스와이프 오작동한다"*) 그 effect 를 없앴다 —
     *    **스크롤을 옮기는 것은 명시적 이동과 목록 변경뿐이다.**
     */
    const onScroll = () => {
        if (accordion) return;
        const el = trackRef.current;
        if (!el || !el.clientWidth) return;
        const i = Math.round(el.scrollLeft / el.clientWidth);

        // 프로그램이 미는 중이면 하이라이트를 흔들지 않는다 — 도착했을 때만 잠금을 푼다
        const verdict = scrollSettle(pendingIdx.current, i);
        if (verdict === 'arrived') { releasePending(); return; }
        if (verdict === 'ignore') return;

        const id = orders[i]?.id;
        if (id && id !== curId) setCurId(id);
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
            scrollToIndex(last, false);
        } else {
            // 위치가 달라졌을 때만 따라 옮긴다. 같으면 손대지 않는다
            const el = trackRef.current;
            const at = el && el.clientWidth ? Math.round(el.scrollLeft / el.clientWidth) : i;
            if (at !== i) scrollToIndex(i, false);
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
     * 🛰️ **다가가는 정거장의 콜로 화면이 따라간다** (기사님 2026-08-19).
     * 평가중 자동 이동과 달리 운행 중의 전환이다 — 이때 기사님 손은 핸들에 있고,
     * 다음에 볼 카드는 언제나 지금 다가가는 정거장의 것이다.
     */
    useEffect(() => {
        if (!gpsFocus) return;
        const i = orders.findIndex(o => o.id === gpsFocus.orderId);
        if (i >= 0) { setCurId(gpsFocus.orderId); scrollToIndex(i); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gpsFocus?.tick]);

    const seenIds = useRef<Set<string> | null>(null);
    useEffect(() => {
        const target = pickAutoFocus(seenIds.current, orders);
        seenIds.current ??= new Set();
        orders.forEach(o => seenIds.current!.add(o.id));
        if (!target) return;
        // `[idx]` effect 를 없앴으므로 스크롤도 여기서 직접 옮긴다
        const i = orders.findIndex(o => o.id === target);
        if (i >= 0) { setCurId(target); scrollToIndex(i); }
    }, [orders]);

    if (orders.length === 0) return null;

    /**
     * 🪗 **아코디언 헤더 한 줄의 높이** — 위·아래로 붙이는 계산의 **원천 하나** (규칙 ③).
     * 이 값이 곧 «몇 px 위에 붙는가»라서, 줄 높이를 CSS 로만 바꾸면 층이 어긋난다.
     */
    const ROW_H = 32;
    /**
     * 🪧 **타이틀의 모양 — 되돌릴 자리** (2026-09-11 · 이식 A2 · 낱말 계약의 「바꾼다」).
     *
     *   `'격자'` 지도 실험실 모양 — `[번호][지명][약속][±][예상]` ×2 (기사님: *"그냥 목업처럼 해"*)
     *   `'옛줄'` 0905 모양 — 번호 + `StopMark`(기호 ▲▼) ×2 + 6단계 점
     *
     * 🔴 **옛 줄을 지우지 않았다.** 저번 이식(`f7aaa36`→`8de47d6`)에서 «목업에 없으니 내린다»로
     *    읽고 지웠다가 11분 만에 되살린 일이 있다. 이 글자 하나를 바꾸면 통째로 돌아온다.
     */
    const TITLE_STYLE = '격자' as '격자' | '옛줄';

    /**
     * 콜 한 줄(요약 줄)을 만든다 — **두 모드가 이 함수 하나를 쓴다.**
     * 스와이프에서는 위에 모아 놓고, 아코디언에서는 **내용 사이사이에 끼워** 넣는다.
     *
     * 🪗 아코디언에서는 줄이 **밀리지 않는다** — 시트가 100% 고정이고 스크롤은
     *    펼친 판 안에서만 일어나기 때문이다. 그래서 세 줄이 늘 제자리에 있고,
     *    내용은 **자기 헤더 바로 밑**에 온다 (기사님 설계 2026-09-03).
     */
    const rowOf = (o: SecuredOrder, i: number) => {

            const r = records.get(o.id) ?? EMPTY_RECORDS;
            const p = deriveCallStep(r.milestones, r.reports);
            const vo = visitOrderMap.get(o.id);
            // 타임라인에 있으면 그것이 약속이다. 없으면(경로 밖 — 심사 중 후보 등)
            // 콜별 파생으로 폴백 — 시각이 아예 사라지는 것보다는 혼자 간 값이 낫다
            const tle = (stop: 'pickup' | 'dropoff') =>
                timeline.find(e => e.orderId === o.id && e.stopType === stop);
            const jd = derivationInputsOf(useJudgmentStore.getState().judgment);
            const fallback = timeline.length ? null : deriveCallTiming(o, r.reports, r.milestones, Date.now(), jd.rules, jd.unk);
            const promiseOf = (stop: 'pickup' | 'dropoff') => tle(stop)?.promisedUntil
                ?? (stop === 'pickup' ? fallback?.pickupPromisedArrivalAt : fallback?.dropoffPromisedArrivalAt)
                ?? null;
            /** ⚠️ 못 지키는 약속 — 경로가 바뀌었거나 앞 약속이 늦춰진 것 */
            const lateOf = (stop: 'pickup' | 'dropoff') => tle(stop)?.lateMinutes ?? 0;
            /** ⏱️ 앞 정거장 실측이 밀어낸 분 — 「+5분」 (경로 밖 후보는 0) */
            const shiftOf = (stop: 'pickup' | 'dropoff') => tle(stop)?.dwellShiftMinutes ?? 0;
            const confirmed = (stop: 'pickup' | 'dropoff') => tle(stop)?.promiseConfirmed
                ?? r.reports.some(rep =>
                    rep.stopType === stop && rep.kind === 'DECLARED' && rep.promisedArrivalAt);
            const isCur = i === cur;
            /**
             * 🪗 **줄이 붙는 자리** — 고른 콜 «위»는 위쪽에, «아래»는 아래쪽에 층으로 붙는다.
             * 그래야 내용을 스크롤해도 **모든 줄이 화면에 남는다** (기사님: *"무조건 화면에 노출"*).
             * 붙는 줄은 내용 위에 뜨므로 **불투명 바닥**이 필수다 — 없으면 글자가 비쳐 겹친다.
             */
            /**
             * 🔴 **붙이지(sticky) 않는다** (기사님 실물 2026-09-04: *"여기 겹침이 발생했어"*).
             *
             *    처음엔 «시트 전체가 스크롤되니 헤더를 층으로 붙이자»고 만들었다. 그런데
             *    기사님 설계는 **시트가 100% 고정이고 펼친 판 안에서만 스크롤**하는 것이라,
             *    헤더는 **애초에 밀리지 않는다** — 붙일 이유가 없다.
             *    붙여 두니 오히려 펼친 판 위로 **떠올라 단계 줄과 겹쳤다.**
             *
             *    🟢 높이만 고정한다 — 그래야 접힘/펼침에 줄 높이가 안 흔들린다.
             */
            const stick: React.CSSProperties | undefined = accordion ? { height: ROW_H } : undefined;
            return (
                <button
                    key={o.id}
                    type="button"
                    onClick={() => goTo(i)}
                    aria-current={isCur}
                    style={stick}
                    /**
                     * 📏 **껍데기를 목업에 맞춘다** (기사님 2026-09-12: *"마진 패딩이 있어서
                     *    **좌우 영역을 손해** 보고 있어. 시트 스타일을 가져올 수 없나?"*).
                     *
                     * 🔴 격자 칸은 이미 목업과 한 벌인데(`callPalette`·같은 `gridTemplateColumns`)
                     *    **바깥이 달랐다** — `px-2.5`(10px) + `gap-1.5`(6px) + 테두리(2px)로
                     *    한 줄에서 **16px** 을 더 먹었다. 400px 폰에서는 지명 두 자다.
                     *    목업은 `px-1.5` 에 테두리가 없다.
                     * 🔴 **배경은 남긴다** — 아코디언에서 줄이 붙박이라 **불투명 바닥**이 없으면
                     *    아래 글자가 비쳐 겹친다 (기사님 0903 설계). 테두리만 걷는다.
                     * 🔴 «지금 고른 콜»은 **왼쪽 굵은 띠**로 말한다 — 테두리는 사방을 먹지만
                     *    띠는 2px 한 변이다.
                     */
                    className={`w-full flex items-center px-1.5 rounded-md text-left transition-colors border-l-2 ${
                        accordion ? 'shrink-0' : 'py-1.5'
                    } ${
                        isCur ? (accordion ? 'bg-info/20 border-info' : 'bg-info/10 border-info')
                              : (accordion ? 'bg-surface border-transparent' : 'bg-surface-alt/30 border-transparent')
                    }`}
                >
                    {TITLE_STYLE === '격자' && <>
                    {/**
                      * 🧮 **격자 — 칸마다 뜻이 정해져 자리가 곧 이름이다** (기사님 2026-09-11: *"그냥 목업처럼 해"*).
                      *    원천은 `docs/지금/시각_표시.md` 의 「개정 2026-09-11」 절이다.
                      *
                      *    `[번호][지명][약속][±][예상]` × 상·하차, 가운데 10px 틈으로 가른다.
                      * 🔴 **0905 의 「안 C」(기호 ▲▼)는 폐기됐다** — 기사님이 실험실에서
                      *    «약속 → ± → 예상»이 **한 문장으로 읽힌다**고 확정했다
                      *    (*"22:14에 도착해야 하는데 +24가 걸려서 22:37에 도착 예정"*).
                      * 🔴 **화살표(→)도 뺐다** — 10px 틈이 그 일을 한다. 글자는 칸을 먹는다.
                      */}
                    <span className="grid items-center flex-1 min-w-0 text-[11.5px] font-black tabular-nums"
                        style={{ gridTemplateColumns: '15px minmax(0,1fr) 41px 28px 41px 10px 15px minmax(0,1fr) 41px 28px 41px' }}>
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
                                    <span className={`rounded-l-md pl-1 py-0.5 text-[12px] ${gone ? 'text-text-muted' : ''}`}
                                        style={{ background: box, ...(gone ? null : { color: callTextColor(no, stop, theme) }) }}>
                                        {seq ?? '?'}
                                    </span>
                                    <span className={`truncate px-1 py-0.5 ${gone ? 'text-text-muted' : 'text-text-primary'}`}
                                        style={{ background: box }}>
                                        {getAddressLabel(stop === 'pickup' ? o.pickup : o.dropoff)}
                                    </span>
                                    {/* ☎️ 통화로 정한 약속은 **보라** — 글자를 더하면 격자가 깨진다 (폭 0인 신호) */}
                                    <span className="text-right px-1 py-0.5"
                                        style={{ background: box, color: confirmed(stop) ? PROMISE_CALLED : 'var(--color-text-muted)' }}>
                                        {/**
                                          * 🔴 **없으면 «--:--» 다 — 빈칸으로 두지 않는다** (기사님 2026-09-12:
                                          *    *"값이 없을 때 **잘려 보일 때**가 있어"*).
                                          *    칸마다 콜 색 띠가 깔리는데 글자가 없으면 **띠만 길게 남아**
                                          *    «무언가 잘렸다»로 읽힌다. 오른쪽 «예상» 칸은 이미 `--:--` 를 쓴다 —
                                          *    같은 줄에서 한 칸만 비면 그게 더 어색하다.
                                          * 🟢 규칙 ⑤-2 그대로다 — **모르면 모른다고 적는다.**
                                          */}
                                        {promised ? hhmm(promised) : '--:--'}
                                    </span>
                                    {/* ± — **늦음만 노랑**이다. 초록·빨강은 판정 색과 겨루므로 안 쓴다 (§4) */}
                                    <span className={`text-right px-1 py-0.5 ${diff != null && diff > 0 && !gone ? 'text-warning' : 'text-text-muted'}`}
                                        style={{ background: box }}>
                                        {diff == null ? '' : diff > 0 ? `+${diff}` : `${diff}`}
                                    </span>
                                    <span className={`text-right rounded-r-md pr-1 py-0.5 ${gone ? 'text-text-muted' : ''}`}
                                        style={{ background: box }}>
                                        {real != null ? hhmm(new Date(real).toISOString()) : '--:--'}
                                    </span>
                                </Fragment>
                            );
                        })}
                    </span>

                    {/**
                      * 🔵 **6단계 점 — 내려 뒀다** (2026-09-11 · 이식 A2).
                      *
                      * 🔴 **지운 것이 아니다.** 기사님이 *"그냥 목업처럼 해"* 라 하셨고 지도 실험실
                      *    타이틀에는 점이 없다. 400px 에서 격자만으로도 꽉 차서 점을 같은 줄에 두면
                      *    **지명이 잘린다** (실측). 그래서 **플래그 뒤로 내렸다** — 한 줄이면 돌아온다.
                      * 🟢 6단계는 **펼친 카드 안에도 그대로 있다** (`PinnedRouteCard` 스텝 판) —
                      *    사라진 정보가 아니라 **자리를 옮긴 것**이다.
                      */}
                    </>}
                    {/* 🪧 **옛 줄 (0905)** — `TITLE_STYLE` 을 `'옛줄'` 로 바꾸면 이것이 그려진다.
                        기호(▲▼)로 «틀어졌나»만 말하고, 오른쪽에 6단계 점이 붙는다. */}
                    {TITLE_STYLE === '옛줄' && <>
                        <span className={`w-3 text-[13.5px] font-black shrink-0 tabular-nums ${
                            isCur ? 'text-info' : 'text-text-muted'
                        }`}>{i + 1}</span>
                        <span className="text-[13.5px] font-bold text-text-primary truncate min-w-0 flex-1">
                            <StopMark at={vo?.pickupIdx} kind="pickup" evaluating={isEvaluating(o.status)}
                                callNo={callNoOf?.(o.id)} visited={confirmed('pickup')}
                                time={promiseOf('pickup')} confirmed={confirmed('pickup')}
                                late={lateOf('pickup')} shift={shiftOf('pickup')}
                                name={getAddressLabel(o.pickup)} />
                            <span className="text-text-muted font-normal mx-1">→</span>
                            <StopMark at={vo?.dropoffIdx} kind="dropoff" evaluating={isEvaluating(o.status)}
                                callNo={callNoOf?.(o.id)} visited={confirmed('dropoff')}
                                time={promiseOf('dropoff')} confirmed={confirmed('dropoff')}
                                late={lateOf('dropoff')} shift={shiftOf('dropoff')}
                                name={getAddressLabel(o.dropoff)} />
                        </span>
                        <span className="flex gap-[2px] shrink-0" aria-hidden>
                            {CALL_STEPS.map((st, k) => (
                                <span key={st.id} className={`block h-[5px] w-[7px] rounded-full ${
                                    k === p.index ? 'bg-info'
                                    : p.done[k] ? 'bg-success'
                                    : k < p.index ? 'bg-success/35'
                                    : st.optional ? 'ring-1 ring-inset ring-border'
                                    : 'bg-surface-hover'
                                }`} />
                            ))}
                        </span>
                    </>}
                </button>
            );
    };

    // 🗺️ 시각의 원천은 "지금 경로" 하나다 (기사님 동의 2026-08-19) — 타임라인은
    //    PinnedRoute 가 새 장부(stepRecords)로 만든 것을 prop 으로 받는다 (Props 주석)
    return (
        /* 📏 **아코디언은 시트가 준 자리를 그대로 쓴다** (기사님 0905 «타이틀이 화면 밖으로»).
              감싸개가 auto 로 서면 안쪽 `flex-1` 이 기댈 곳이 없어 내용대로 자란다 —
              그러면 콜 줄이 위로 밀려 나간다. 사슬은 **한 칸도 끊기면 안 된다.**
           ⚠️ 아코디언이 아닐 때(옛 화면)는 그대로 auto 다 — 거기는 문서 스크롤이 정상이다. */
        <div className={`flex flex-col ${accordion ? 'flex-1 min-h-0' : ''}`}>
            {/* ══ 콜 요약 줄 — **스와이프하지 않아도 보인다** ══
                기사님: *"2개 있다면 각각 어디까지 진행되고 있는지 모두 스와이핑해야만 보인다.
                그건 문제가 있다. 스와이프 영역 위에 콜마다의 진행 상황이 노출되어야
                **폰에 손대지 않고** 아직 전화하지 않은 부분이 어디인지 인지할 수 있을 것 같다."*

                그래서 위치만 알려주던 `진행 중 2건 · 1번째` 를 없애고
                **콜마다 한 줄**을 둔다. 줄을 누르면 그 카드로 넘어간다.
                아직 통화 안 한 콜은 📞 로 눈에 띄게 — 그게 손대기 전에 알아야 할 것이다.

                🔴 2026-08-12 — 예전엔 2건부터 나타났다. 기사님: *"첫 콜이 들어올 때 상태 영역이
                없다가 합짐이 생기면 2줄로 노출된다. 콜이 들어오면 디폴트로 표시되어야 할 것 같다."*
                영역이 생겼다 없어지면 화면이 튀고, 무엇보다 **첫 콜에서도 지금 뭘 해야 하는지**를
                같은 자리에서 봐야 한다. **1건이든 2건이든 줄의 생김새는 같다.** */}
            {accordion ? (
                /* 🪗 **아코디언** — 줄 · 그 콜의 내용 · 줄 · … 로 **끼워** 그린다.
                   내용이 자기 헤더 바로 밑에 오므로 «이건 누구 것인가»가 안 생긴다.
                   (기사님 확정 2026-09-03: *"아코디언 헤더는 무조건 화면에 노출하고
                    컨텐츠 영역에 스크롤할 수 있게"*) */
                /**
                 * 🪗 **그릇은 시트 높이를 그대로 쓰고 넘치지 않는다** (기사님 확정 09-03).
                 *    넘치면 시트가 통째로 길어져 **헤더도, 맨 아래 판정석도 화면 밖으로 나간다.**
                 */
                <div className={`flex flex-col gap-1.5 px-2.5 pt-1 pb-2.5 overflow-hidden min-h-0 ${fit ? "" : "flex-1"}`}>
                    {orders.map((o, i) => {
                        const open = !noneOpen && i === cur;
                        return (
                        /* 🔴 닫힌 콜은 **자기 높이만**(flex-none) · 펼친 콜이 남는 자리를 다 먹는다 */
                        <div key={o.id} className={`flex flex-col min-h-0 ${
                            open ? (fit ? 'flex-auto' : 'flex-1') : 'flex-none'}`}>
                            {rowOf(o, i)}
                            {/* 🔴 접힌 콜도 **마운트한 채** 숨긴다 — 언마운트하면 통화 중 적던
                                단위·수량이 날아가고 카드가 서버에 단계를 다시 청한다 (버그 대장 #95)
                                🟢 **잘라 감추지 않고 스크롤한다** — 모자라면 손으로 내려 보는 것이
                                   «없는 것»보다 낫다 (규칙 ④) */}
                            <div hidden={!open}
                                 /* 📏 **flex 상자로 둔다** — 카드가 «판만큼» 서야 위 덩어리는
                                    고정되고 **단계만 스크롤**한다 (목업 동작 · 재서 잡았다) */
                                 className={`${fit ? 'flex-auto max-h-[46vh]' : 'flex-1 min-h-0'} mt-1.5 flex flex-col overflow-y-auto`}>
                                {renderCard(o)}
                            </div>
                        </div>
                        );
                    })}
                </div>
            ) : (
                <>
                    {/* ══ 콜 요약 줄 — **스와이프하지 않아도 보인다** ══
                        기사님: *"2개 있다면 각각 어디까지 진행되고 있는지 모두 스와이핑해야만
                        보인다. 그건 문제가 있다."* — 그래서 줄을 덱 **위**에 모아 둔다. */}
                    <div className="flex flex-col gap-1 px-3 pt-2 pb-1">
                        {orders.map((o, i) => rowOf(o, i))}
                    </div>
                    <div
                        ref={trackRef}
                        onScroll={onScroll}
                        /* 손가락이 닿는 순간 프로그램 이동을 포기한다.
                           안 그러면 애니메이션이 끝날 때까지(최대 0.9초) 스와이프가 먹힌다 —
                           손이 항상 코드보다 우선이다 */
                        onPointerDown={releasePending}
                        onTouchStart={releasePending}
                        className="flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                        /* 🔴 scrollBehavior:'smooth' 를 CSS 로 걸면 `behavior:'auto'` 가 무시되어
                           위치 복구까지 애니메이션이 되고, 스와이프 중이면 그게 손가락과 부딪힌다. */
                        style={{ overscrollBehaviorX: 'contain' }}
                    >
                        {orders.map(o => (
                            <div key={o.id} className="shrink-0 w-full snap-center">
                                {renderCard(o)}
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* 하단 페이저 점은 없앴다 — 위 요약 줄이 위치(번호·테두리)와 진행을 함께 보여주므로
                같은 정보를 두 번 그리며 세로만 잡아먹었다. 폰 한 화면이 목표다. */}
        </div>
    );
}

/**
 * `⑶ 03:45` — 이 정거장을 **몇 번째로, 몇 시까지 가기로 했는가**.
 *
 * 번호는 **지도 핀과 같은 색·테두리**다 (기사님 2026-08-19) — 상차 초록 · 하차 로즈 ·
 * 심사 중 호박색, 테두리와 글자색까지 `MAP_THEME_COLORS` 를 그대로 쓴다.
 * 색을 여기서 따로 정하면 지도와 요약 줄이 다른 말을 하게 된다 (규칙 ③).
 *
 * 시각은 약속이다. 통화로 확정한 약속은 그대로, **통화 전 추정에는 `~` 를 붙인다** —
 * 표시 없이 값만 쓰면 규칙 ④(지어내지 않는다) 위반이다.
 * 번호도 시각도 없으면 아무것도 그리지 않는다 (`(3 --:--)` 를 만들지 않는다).
 */
function StopMark({ at, time, confirmed, kind, evaluating, name, late = 0, shift = 0, callNo, visited }: {
    at?: number; time?: string | null; confirmed?: boolean;
    /**
     * 🌈 **몇 번 콜인가** — 동그라미 색이 이걸로 정해진다 (09-04 색표 · 이식 0905).
     * 🔴 정거장 번호(`at`)와 **다른 값**이다. 목록 자리로 칠하면 심사 중인 콜이 앞에
     *    있을 때 **지도와 색이 어긋난다** (덱은 심사 콜을 뺀다).
     */
    callNo?: number | null;
    /** 👣 다녀왔나 — 테두리가 «완료 동그라미»(흰 링)가 된다 */
    visited?: boolean;
    kind: 'pickup' | 'dropoff'; evaluating?: boolean; name: string; late?: number;
    /**
     * ⏱️ **앞 정거장이 예측과 달라 이 시각이 밀린 분** — 접힌 줄에서는 **기호로만** 말한다.
     *
     * 기사님 확정 2026-08-30 (안 C · docs/지금/시각_표시.md):
     * 달리면서 필요한 답은 **«틀어졌나» 하나**다. 몇 분인지는 통화하려고 카드를 펼칠 때
     * 필요하고, 거기서는 `3:15 → 3:20 (+5)` 로 전부 적는다 (안 A).
     *
     * 🔴 **색을 쓰지 않는다.** 지도가 이미 상차=초록·하차=빨강을 쓰고 판정이 🔵🟢🟡🔴 을
     *    쓴다 — 여기에 초록·빨강을 더하면 **무엇의 색인지 헷갈린다** (규칙 ⑤-3).
     * 🔴 `0` 이면 안 그린다 — 예측대로 가고 있다는 뜻이라 적을 말이 없다.
     */
    shift?: number;
}) {
    const { theme } = useTheme();
    const c = MAP_THEME_COLORS[theme];
    return (
        <span className="inline-flex items-center gap-1 align-middle">
            {!!at && (
                <span
                    className="inline-flex items-center justify-center w-[20px] h-[20px] rounded-full text-[12.5px] font-black leading-none shrink-0"
                    style={{
                        ...(evaluating || !callNo ? {
                            /* 🔴 번호를 모르면 **색을 지어내지 않는다** (규칙 ④) — 옛 초록으로
                               칠하면 «1번 콜»로 읽힌다. 중립으로 둔다 */
                            backgroundColor: evaluating ? c.nodeEvaluating : c.nodeStrokeRegular,
                            border: `1.5px solid ${evaluating ? c.nodeStrokeEvaluating : c.nodeStrokeRegular}`,
                            color: c.textBody,
                        } : (() => {
                            /* 🌈 **지도와 같은 색표** (`callPalette`) — 색상=콜 · 밝기=상차/하차 ·
                               테두리=다녀왔나. 그래야 «저 동그라미가 목록의 몇 번 줄인가»가 이어진다
                               (기사님 09-03: *"지도 아이콘 색과 콜 리스트가 괴리가 크다"*) */
                            const fill = callNodeFill(callNo, kind, theme);
                            return {
                                backgroundColor: fill,
                                border: `1.5px solid ${callNodeStroke(!!visited, fill)}`,
                                color: callNodeText(kind, theme),
                            };
                        })()),
                    }}
                >{at}</span>
            )}
            {/**
              * 📐 **열을 고정한다** (기사님 2026-09-04: *"일단 라인에 맞춰야 할 것 같아"*).
              *    지명이 내용만큼 늘어나면 **줄마다 시각의 자리가 달라져**, 달리면서 훑을 때
              *    눈이 매번 다시 찾는다. 폭을 고정하면 세 줄이 **한 표**처럼 읽힌다.
              * 🔴 **잘릴 것은 지명이다** — 못 읽어도 «어느 줄»은 번호·색이 답한다.
              *    시각을 자르면 답이 없다.
              */}
            <span className="w-[4em] shrink-0 truncate">{name}</span>
            {/**
              * 📐 **시각 칸은 비어도 자리를 지킨다.** 그게 열을 만드는 값이다 —
              *    시각 없는 콜에서 칸이 사라지면 **아래 줄이 통째로 당겨진다.**
              * ⚠️ `min-w` 다 — 지각·밀림이 붙는 드문 줄만 넓어지고 평소 줄은 다 같다.
              */}
            <span className={`min-w-[3.5em] shrink-0 text-[12px] font-bold tabular-nums text-right ${
                late > 0 ? 'text-danger' : 'text-text-muted'
            }`}>
                {time ? (confirmed ? hhmm(time) : `~${hhmm(time)}`) : ''}
                {/* ⚠️ 못 지키는 약속 — 색만으로는 이유를 모르니 분을 적는다 */}
                {late > 0 && <span className="ml-0.5">⚠️{late}분</span>}
                {shift !== 0 && (
                    <span className="ml-0.5 opacity-80"
                          title={`앞 정거장이 예측과 달라 ${Math.abs(shift)}분 ${shift > 0 ? '밀렸습니다' : '당겨졌습니다'} — 몇 분인지는 카드를 펼치면 나옵니다`}>
                        {shift > 0 ? '▲' : '▼'}
                    </span>
                )}
            </span>
        </span>
    );
}
