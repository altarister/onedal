import { useEffect, useRef, useState } from 'react';
import type { SecuredOrder } from '@onedal/shared';
import { deriveCallStep, CALL_STEPS } from '@onedal/shared';
import { pickAutoFocus } from '../../lib/deckFocus';
import { getAddressLabel } from '../../lib/routeUtils';
import type { CallRecords } from '../../hooks/useCallProgress';
import { EMPTY_RECORDS } from '../../hooks/useCallProgress';

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
}

export default function CallDeck({ orders, renderCard, records }: Props) {
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

    const scrollToIndex = (i: number, smooth = true) => {
        const el = trackRef.current;
        if (!el || !el.clientWidth) return;
        el.scrollTo({ left: i * el.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
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
     * 새로 들어온 **평가중(데스밸리) 콜로 자동 이동**한다.
     *
     * 기사님: *"추가 합짐이 나오면 전화 중이라도 콜을 잡을지 말지를 내가 인지해야 하니까
     * 최근으로 스와이프해 줘야 할 것 같아."*
     *
     * ⚠️ 평가중 콜에만 건다. 30초 안에 결재해야 하는 것이 그 콜이기 때문이다.
     *    확정만 된 콜까지 화면을 뺏으면 **통화 중 입력을 방해**한다 —
     *    단위·시각을 고르는 중에 넘어가면 엉뚱한 카드의 칩을 누르게 된다.
     *    (카드는 사라지지 않으므로 입력값 자체는 남는다. 문제는 손이 가는 자리다)
     */
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

    return (
        <div className="flex flex-col">
            {/* ══ 콜별 진행 요약 — **스와이프하지 않아도 보인다** ══
                기사님: *"2개 있다면 각각 어디까지 진행되고 있는지 모두 스와이핑해야만 보인다.
                그건 문제가 있다. 스와이프 영역 위에 콜마다의 진행 상황이 노출되어야
                **폰에 손대지 않고** 아직 전화하지 않은 부분이 어디인지 인지할 수 있을 것 같다."*

                그래서 위치만 알려주던 `진행 중 2건 · 1번째` 를 없애고
                **콜마다 한 줄**을 둔다. 줄을 누르면 그 카드로 넘어간다.
                아직 통화 안 한 콜은 📞 로 눈에 띄게 — 그게 손대기 전에 알아야 할 것이다.

                🔴 2026-08-12 — 예전엔 2건부터 나타났다. 기사님: *"첫 콜이 들어올 때 상태 영역이
                없다가 합짐이 생기면 2줄로 노출된다. 콜이 들어오면 디폴트로 표시되어야 할 것 같다."*
                영역이 생겼다 없어지면 화면이 튀고, 무엇보다 **첫 콜에서도 지금 뭘 해야 하는지**를
                같은 자리에서 봐야 한다. 1건일 때는 경로를 빼서 카드 헤더와 겹치지 않게 한다. */}
            {orders.length > 0 && (
                <div className="flex flex-col gap-1 px-3 pt-2 pb-1">
                    {orders.map((o, i) => {
                        const r = records.get(o.id) ?? EMPTY_RECORDS;
                        const p = deriveCallStep(r.milestones, r.reports);
                        const isCur = i === cur;
                        const isCallStep = !!p.current?.id.startsWith('CALL_');
                        const multi = orders.length > 1;
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
                                {/* 1건이면 번호도 경로도 필요 없다 — 바로 아래 카드 헤더가 이미 말한다 */}
                                {multi && (
                                    <>
                                        <span className={`text-[11px] font-black shrink-0 tabular-nums ${
                                            isCur ? 'text-info' : 'text-text-muted'
                                        }`}>{i + 1}</span>
                                        <span className="text-[11px] font-bold text-text-primary truncate min-w-0 flex-1">
                                            {getAddressLabel(o.pickup)}
                                            <span className="text-text-muted font-normal mx-0.5">→</span>
                                            {getAddressLabel(o.dropoff)}
                                        </span>
                                    </>
                                )}
                                {!multi && <span className="text-[10px] font-black text-text-muted shrink-0">진행</span>}

                                {/* 6단계를 한눈에 — 카드 안 진행 점과 같은 규칙 */}
                                <span className={`flex gap-0.5 ${multi ? 'shrink-0' : 'flex-1'}`} aria-hidden>
                                    {CALL_STEPS.map((st, k) => (
                                        <span key={st.id} className={`block h-1 rounded-full ${multi ? 'w-2.5' : 'flex-1'} ${
                                            k === p.index ? 'bg-info'
                                            : p.done[k] ? 'bg-success'
                                            : k < p.index ? 'bg-success/35'
                                            : st.optional ? 'ring-1 ring-inset ring-border'
                                            : 'bg-surface-hover'
                                        }`} />
                                    ))}
                                </span>

                                <span className={`text-[10px] font-black shrink-0 w-[72px] text-right ${
                                    p.allDone ? 'text-success' : isCallStep ? 'text-info' : 'text-text-muted'
                                }`}>
                                    {p.allDone ? '운행 완료' : `${isCallStep ? '📞 ' : ''}${p.current?.label}`}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}

            <div
                ref={trackRef}
                onScroll={onScroll}
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
