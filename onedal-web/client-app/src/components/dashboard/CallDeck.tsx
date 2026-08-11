import { useEffect, useRef, useState } from 'react';
import type { SecuredOrder } from '@onedal/shared';
import { deriveCallStep, CALL_STEPS } from '@onedal/shared';
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
    const [cur, setCur] = useState(0);

    // 콜이 빠지거나(하차 완료) 늘어나도 위치가 범위를 벗어나지 않게
    useEffect(() => {
        if (cur > orders.length - 1) setCur(Math.max(0, orders.length - 1));
    }, [orders.length, cur]);

    const goTo = (i: number) => {
        const el = trackRef.current;
        if (!el) return;
        const next = Math.max(0, Math.min(orders.length - 1, i));
        el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
        setCur(next);
    };

    const onScroll = () => {
        const el = trackRef.current;
        if (!el || !el.clientWidth) return;
        const i = Math.round(el.scrollLeft / el.clientWidth);
        if (i !== cur) setCur(i);
    };

    if (orders.length === 0) return null;

    return (
        <div className="flex flex-col">
            {/* ══ 콜별 진행 요약 — **스와이프하지 않아도 보인다** ══
                기사님: *"2개 있다면 각각 어디까지 진행되고 있는지 모두 스와이핑해야만 보인다.
                그건 문제가 있다. 스와이프 영역 위에 콜마다의 진행 상황이 노출되어야
                **폰에 손대지 않고** 아직 전화하지 않은 부분이 어디인지 인지할 수 있을 것 같다."*

                그래서 위치만 알려주던 `진행 중 2건 · 1번째` 를 없애고
                **콜마다 한 줄**을 둔다. 줄을 누르면 그 카드로 넘어간다.
                아직 통화 안 한 콜은 📞 로 눈에 띄게 — 그게 손대기 전에 알아야 할 것이다. */}
            {orders.length > 1 && (
                <div className="flex flex-col gap-1 px-3 pt-2 pb-1">
                    {orders.map((o, i) => {
                        const r = records.get(o.id) ?? EMPTY_RECORDS;
                        const p = deriveCallStep(r.milestones, r.reports);
                        const isCur = i === cur;
                        const isCallStep = !!p.current?.id.startsWith('CALL_');
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
                                <span className={`text-[11px] font-black shrink-0 tabular-nums ${
                                    isCur ? 'text-info' : 'text-text-muted'
                                }`}>{i + 1}</span>

                                <span className="text-[11px] font-bold text-text-primary truncate min-w-0 flex-1">
                                    {getAddressLabel(o.pickup)}
                                    <span className="text-text-muted font-normal mx-0.5">→</span>
                                    {getAddressLabel(o.dropoff)}
                                </span>

                                {/* 6단계를 한눈에 — 카드 안 진행 점과 같은 규칙 */}
                                <span className="flex gap-0.5 shrink-0" aria-hidden>
                                    {CALL_STEPS.map((st, k) => (
                                        <span key={st.id} className={`block w-2.5 h-1 rounded-full ${
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
                style={{ overscrollBehaviorX: 'contain', scrollBehavior: 'smooth' }}
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
