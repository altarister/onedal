import { useEffect, useRef } from 'react';

/**
 * 🌱 **여섯 단계를 «가로로 넘기는» 트랙** (기사님 2026-09-05: *"스텝도 시트처럼 보이게"*)
 *
 * ⚠️ 2026-08-21 확정(*"영역이 길어지면 스크롤해야 하니 한 번에 하나"*)은 그대로다 —
 *    **여전히 한 번에 하나**이고, 고르는 손짓만 «누르기»에서 «넘기기»로 늘었다.
 *
 * 🔴 **애니메이션을 얹지 않는다** — 넘어가는 부드러움은 `scroll-snap` 이 하고,
 *    그건 손이 멈추면 끝난다 (초당 100회 재그리기의 원인은 끝없는 애니메이션이었다).
 *
 * 🔴 **접힌 카드는 폭이 0 이다** — 아코디언이 `hidden` 으로 감추므로, 열리기 전에
 *    `scrollTo` 를 불러 봐야 아무 일도 안 난다. 그래서 «보이게 된 순간»을 본다.
 *
 * 🔴 **왜 부품인가** — 부모의 깊은 IIFE 안에 ref 를 두면 `lint:gate` 가
 *    «렌더 중 ref 접근»으로 잡는다. 스크롤을 아는 것은 이 상자 하나다 (규칙 ③).
 */
export default function StepSwipeTrack({ count, shownIdx, onShow, renderPane }: {
    count: number;
    /**
     * 지금 보이는 장 — 점·숫자는 부모가 그린다 (여기는 «넘기는 일»만 안다).
     * 🔴 **부모가 명령하지 않는다.** 점을 누르면 부모는 이 값만 바꾸고 트랙이 따라간다 —
     *    손으로 넘긴 것과 눌러서 넘긴 것이 **같은 길**을 지난다 (규칙 ③).
     */
    shownIdx: number;
    /** 손으로 넘겼다 — 부모가 그 장을 «보는 곳»으로 삼는다 */
    onShow: (k: number) => void;
    renderPane: (k: number) => React.ReactNode;
}) {
    const ref = useRef<HTMLDivElement>(null);

    /** 🎯 보는 장이 바뀌면 따라간다 (점을 눌렀을 때). 이미 그 자리면 아무 일도 안 난다 */
    useEffect(() => {
        const t = ref.current;
        if (!t?.clientWidth) return;
        const want = shownIdx * t.clientWidth;
        if (Math.abs(t.scrollLeft - want) < 4) return;
        t.scrollTo({ left: want, behavior: 'smooth' });
    }, [shownIdx]);

    /**
     * 👀 폭이 0 → 있음으로 바뀌는 순간이 «열렸다»다 — 그때 지금 할 단계로 데려간다.
     * 🔴 열릴 때는 `auto` 다 — 접혀 있던 판이 스르륵 넘어가는 것을 보여 줄 이유가 없다.
     */
    useEffect(() => {
        const t = ref.current;
        if (!t || typeof ResizeObserver === 'undefined') return;
        let wasHidden = true;
        const ob = new ResizeObserver(() => {
            const w = t.clientWidth;
            if (w && wasHidden) t.scrollTo({ left: shownIdx * w, behavior: 'auto' });
            wasHidden = !w;
        });
        ob.observe(t);
        return () => ob.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div
            ref={ref}
            onScroll={e => {
                const t = e.currentTarget;
                if (!t.clientWidth) return;
                const k = Math.round(t.scrollLeft / t.clientWidth);
                if (k !== shownIdx) onShow(k);
            }}
            className="flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ overscrollBehaviorX: 'contain' }}
        >
            {Array.from({ length: count }, (_, k) => renderPane(k))}
        </div>
    );
}
