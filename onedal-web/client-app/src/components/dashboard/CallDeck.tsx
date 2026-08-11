import { useEffect, useRef, useState } from 'react';
import type { SecuredOrder } from '@onedal/shared';

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
}

export default function CallDeck({ orders, renderCard }: Props) {
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
            {orders.length > 1 && (
                <div className="flex items-center justify-between px-4 pt-2">
                    <span className="text-[11px] font-bold text-text-muted">
                        진행 중 {orders.length}건 · {cur + 1}번째
                    </span>
                    <div className="flex gap-1">
                        <button
                            type="button" aria-label="이전 콜"
                            disabled={cur === 0} onClick={() => goTo(cur - 1)}
                            className="w-8 h-7 rounded-md border border-border bg-surface-alt text-text-primary text-sm font-black disabled:opacity-35"
                        >‹</button>
                        <button
                            type="button" aria-label="다음 콜"
                            disabled={cur >= orders.length - 1} onClick={() => goTo(cur + 1)}
                            className="w-8 h-7 rounded-md border border-border bg-surface-alt text-text-primary text-sm font-black disabled:opacity-35"
                        >›</button>
                    </div>
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

            {orders.length > 1 && (
                <div className="flex gap-1 justify-center py-2">
                    {orders.map((o, i) => (
                        <button
                            key={o.id} type="button" aria-label={`${i + 1}번째 콜`}
                            onClick={() => goTo(i)}
                            className={`h-1.5 rounded-full transition-all ${
                                i === cur ? 'w-4 bg-info' : 'w-1.5 bg-surface-hover'
                            }`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
