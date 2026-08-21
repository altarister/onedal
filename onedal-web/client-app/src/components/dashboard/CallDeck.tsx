import { useEffect, useRef, useState } from 'react';
import type { SecuredOrder } from '@onedal/shared';
import { deriveCallStep, CALL_STEPS, deriveCallTiming, derivationInputsOf, isEvaluating } from '@onedal/shared';
import type { RouteTimelineEntry } from '@onedal/shared';
import { pickAutoFocus, scrollSettle } from '../../lib/deckFocus';
import { getAddressLabel, hhmm } from '../../lib/routeUtils';
import { useTheme } from '../../contexts/ThemeContext';
import { MAP_THEME_COLORS } from '../../styles/themes';
import type { CallRecords } from '../../hooks/records';
import { EMPTY_RECORDS } from '../../hooks/records';
import { useJudgmentStore } from '../../stores/judgmentStore';

/**
 * [Phase 8.5] 진행 중인 콜을 **좌우로 넘기는** 덱.
 *
 * 기사님 결정: *"합짐이 여러 건일 때는 스와이프."*
 * 세로로 쌓으면 폰 한 화면을 금방 넘긴다. 가로로 넘기면 콜 하나가 언제나 화면을 가득 채운다.
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
}

export default function CallDeck({ orders, renderCard, records, visitOrderMap, timeline, gpsFocus }: Props) {
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
    const [curId, setCurId] = useState<string | null>(null);
    const idx = orders.findIndex(o => o.id === curId);
    const cur = idx >= 0 ? idx : 0;

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
        const next = Math.max(0, Math.min(orders.length - 1, i));
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

    // 🗺️ 시각의 원천은 "지금 경로" 하나다 (기사님 동의 2026-08-19) — 타임라인은
    //    PinnedRoute 가 새 장부(stepRecords)로 만든 것을 prop 으로 받는다 (Props 주석)
    return (
        <div className="flex flex-col">
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
            {orders.length > 0 && (
                <div className="flex flex-col gap-1 px-3 pt-2 pb-1">
                    {orders.map((o, i) => {
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
                        const confirmed = (stop: 'pickup' | 'dropoff') => tle(stop)?.promiseConfirmed
                            ?? r.reports.some(rep =>
                                rep.stopType === stop && rep.kind === 'DECLARED' && rep.promisedArrivalAt);
                        const isCur = i === cur;
                        return (
                            <button
                                key={o.id}
                                type="button"
                                onClick={() => goTo(i)}
                                aria-current={isCur}
                                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md border text-left transition-colors ${
                                    isCur ? 'bg-info/10 border-info/45' : 'bg-surface-alt/30 border-border/60'
                                }`}
                            >
                                {/* 🔴 2026-08-12 — 1건일 때 번호와 경로를 뺐다가 되돌렸다.
                                    "카드 헤더가 이미 경로를 말하니 중복"이라 봤는데, 기사님:
                                    *"진행과 하차지 통화로만 나오고 있는데 **어떤 콜이었는지 알 수 있는**
                                      이전 버전이 그 부분은 더 좋은 것 같아."*
                                    맞다. 이 줄은 **어느 콜인지 고르는 자리**라 이름이 없으면 고를 수가 없다.
                                    그리고 1건과 2건의 생김새가 다르면, 합짐이 붙는 순간 화면이 또 바뀐다 —
                                    영역을 항상 띄우기로 한 이유(화면이 튀지 않게)와 같은 이야기다. */}
                                {/* 🔍 크기: 기사님 2026-08-19 — "~(추정 물결)가 마이너스로 읽힐 만큼 작다. 키워 달라" */}
                                <span className={`text-[14px] font-black shrink-0 tabular-nums ${
                                    isCur ? 'text-info' : 'text-text-muted'
                                }`}>{i + 1}</span>
                                {/* 🔴 2026-08-19 — 정거장마다 **몇 번째로, 몇 시까지 가기로 했는가**.
                                    예전엔 여기에 `(87.2km·64분·1t)` 가 있었는데, 그건 이 콜 **혼자** 갔을 때의
                                    값이라 여러 콜을 엮은 지금 순서에 대해서는 아무 말도 못 한다. */}
                                {/* 순서: **⑴ 지명 시각** (기사님 2026-08-19) — 번호가 지명 앞에 와야
                                    "몇 번째로 어디" 로 읽힌다. 예전엔 지명 뒤에 붙어 시각과 엉겼다 */}
                                <span className="text-[14px] font-bold text-text-primary truncate min-w-0 flex-1">
                                    <StopMark at={vo?.pickupIdx} kind="pickup" evaluating={isEvaluating(o.status)}
                                        time={promiseOf('pickup')} confirmed={confirmed('pickup')}
                                        late={lateOf('pickup')} name={getAddressLabel(o.pickup)} />
                                    <span className="text-text-muted font-normal mx-1">→</span>
                                    <StopMark at={vo?.dropoffIdx} kind="dropoff" evaluating={isEvaluating(o.status)}
                                        time={promiseOf('dropoff')} confirmed={confirmed('dropoff')}
                                        late={lateOf('dropoff')} name={getAddressLabel(o.dropoff)} />
                                </span>

                                {/* 6단계를 한눈에 — 카드 안 진행 점과 같은 규칙 */}
                                <span className="flex gap-0.5 shrink-0" aria-hidden>
                                    {CALL_STEPS.map((st, k) => (
                                        <span key={st.id} className={`block h-1.5 w-3 rounded-full ${
                                            k === p.index ? 'bg-info'
                                            : p.done[k] ? 'bg-success'
                                            : k < p.index ? 'bg-success/35'
                                            : st.optional ? 'ring-1 ring-inset ring-border'
                                            : 'bg-surface-hover'
                                        }`} />
                                    ))}
                                </span>

                                {/* 🔴 금액은 여기서 뺐다 (기사님 2026-08-19) — 아래 `콜잡은시간` 줄
                                    오른쪽으로 옮겼다. 이 줄은 **어느 콜이 어디까지 갔나**를 보는 자리이고,
                                    폭을 비워야 경로명·시각이 잘리지 않는다. */}
                            </button>
                        );
                    })}
                </div>
            )}

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
                   위치 복구까지 애니메이션이 되고, 스와이프 중이면 그게 손가락과 부딪힌다.
                   부드러움이 필요한 곳(명시적 이동)에서만 옵션으로 준다. */
                style={{ overscrollBehaviorX: 'contain' }}
            >
                {orders.map(o => (
                    <div key={o.id} className="shrink-0 w-full snap-center">
                        {renderCard(o)}
                    </div>
                ))}
            </div>

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
function StopMark({ at, time, confirmed, kind, evaluating, name, late = 0 }: {
    at?: number; time?: string | null; confirmed?: boolean;
    kind: 'pickup' | 'dropoff'; evaluating?: boolean; name: string; late?: number;
}) {
    const { theme } = useTheme();
    const c = MAP_THEME_COLORS[theme];
    return (
        <span className="inline-flex items-center gap-1 align-middle">
            {!!at && (
                <span
                    className="inline-flex items-center justify-center w-[19px] h-[19px] rounded-full text-[11px] font-black leading-none shrink-0"
                    style={{
                        backgroundColor: evaluating ? c.nodeEvaluating : kind === 'pickup' ? c.nodePickup : c.nodeDropoff,
                        border: `1.5px solid ${evaluating ? c.nodeStrokeEvaluating : c.nodeStrokeRegular}`,
                        color: c.textBody,
                    }}
                >{at}</span>
            )}
            {/* 지각 표시가 붙으면 폭이 모자란다 — 잘릴 것은 지명이지 시각·경고가 아니다 */}
            <span className="truncate max-w-[5.5em]">{name}</span>
            {time && (
                /* ~ = 통화 전 추정. 12px 아래에서는 물결이 마이너스로 읽혔다 (기사님 2026-08-19) */
                <span className={`text-[13px] font-bold tabular-nums shrink-0 ${late > 0 ? 'text-danger' : 'text-text-muted'}`}>
                    {confirmed ? hhmm(time) : `~${hhmm(time)}`}
                    {/* ⚠️ 못 지키는 약속 — 색만으로는 이유를 모르니 분을 적는다 */}
                    {late > 0 && <span className="ml-0.5">⚠️{late}분</span>}
                </span>
            )}
        </span>
    );
}
