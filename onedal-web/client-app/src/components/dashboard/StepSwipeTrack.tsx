import { useEffect, useRef } from 'react';
import { reportedPaneOf, PANE_SNAP_TOLERANCE_PX } from './paneReport';

/**
 * 🌱 **여섯 단계를 «가로로 넘기는» 트랙** (기사님: *"스텝도 시트처럼 보이게"*)
 *
 * ⚠️ **한 번에 하나만 보인다** (기사님 확정: *"영역이 길어지면 스크롤해야 하니 한 번에 하나"*) —
 *    고르는 손짓은 «누르기»와 «넘기기» 둘이다.
 *
 * 🔴 **애니메이션을 얹지 않는다** — 넘어가는 부드러움은 `scroll-snap` 이 하고,
 *    그건 손이 멈추면 끝난다 (끝없는 애니메이션은 초당 100회 재그리기를 부른다).
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

    /**
     * 🎯 보는 장이 바뀌면 따라간다 (점을 눌렀을 때·도착이 열었을 때).
     *    이미 그 자리면 아무 일도 안 난다.
     *
     * 🔴 **«스르륵»(`smooth`)을 쓰지 않고 바로 옮긴다** (기사님 확정).
     *    애니메이션이 돌면 **중간 자리**가 생기고, 그 자리의 스크롤 이벤트가 아래
     *    `onScroll` 을 통해 **옛 번호를 부모에게 알린다.** 부모는 그 말을 믿고 장을
     *    되돌리고, 둘이 서로를 밀며 엉뚱한 장에서 멈춘다 — **자기 이동이 자기 알림을 덮는다.**
     *
     *    파일 머리의 *"애니메이션을 얹지 않는다"* 와 같은 규칙이다 — 아래 «열릴 때»도 `auto` 다.
     *    ⚠️ 손으로 넘기는 부드러움은 그대로다 — 그건 `scroll-snap` 이 한다.
     */
    useEffect(() => {
        const t = ref.current;
        if (!t?.clientWidth) return;
        const want = shownIdx * t.clientWidth;
        if (Math.abs(t.scrollLeft - want) < PANE_SNAP_TOLERANCE_PX) return;
        t.scrollTo({ left: want });
    }, [shownIdx]);

    /**
     * 🔴 **낡은 값에 갇히지 않게 ref 로 든다**.
     *
     * 아래 감시자는 딱 한 번만 붙어야 하는데(재구독하면 «열린 순간»을 놓친다) 그 안에서
     * `shownIdx` 를 그냥 읽으면 **첫 렌더 값에 갇힌다** — 열리는 순간 늘 «0번 장»으로
     * 데려간다.
     * ⚠️ `exhaustive-deps` 는 꺼 둔 규칙이라 **기계가 안 잡는다** — 이 자리를 늘 의심한다.
     */
    const shownRef = useRef(shownIdx);
    useEffect(() => { shownRef.current = shownIdx; }, [shownIdx]);

    /**
     * 👀 폭이 0 → 있음으로 바뀌는 순간이 «열렸다»다 — 그때 지금 할 단계로 데려간다.
     *    ⚠️ 감시자는 **한 번만** 붙는다 (재구독하면 «열린 순간»을 놓친다). 그래서 안에서
     *       `shownIdx` 를 **ref 로** 읽는다 — 위 참조.
     */
    useEffect(() => {
        const t = ref.current;
        if (!t || typeof ResizeObserver === 'undefined') return;
        let wasHidden = true;
        const ob = new ResizeObserver(() => {
            const w = t.clientWidth;
            if (w && wasHidden) t.scrollTo({ left: shownRef.current * w });
            wasHidden = !w;
        });
        ob.observe(t);
        return () => ob.disconnect();
    }, []);

    return (
        <div
            ref={ref}
            /**
             * 👆 **손으로 넘긴 것만 알린다** — 판단은 `paneReport` 한 곳이다 (규칙 ③).
             *    🔴 스크롤 이벤트는 «누가 움직였나»를 말해 주지 않으므로, 원인이 아니라
             *       **자리**로 가른다 — 장 경계에 붙었으면 «멈춘 것», 사이면 «움직이는 중».
             */
            onScroll={e => {
                const t = e.currentTarget;
                const k = reportedPaneOf(t.scrollLeft, t.clientWidth, count, shownIdx);
                if (k != null) onShow(k);
            }}
            /**
             * 📏 **트랙이 높이를 스스로 정한다**.
             *
             * 🔴 제약이 없으면 **가장 긴 장의 높이**만큼 트랙이 늘어난다 —
             *    «카드 전체»가 스크롤된다. 스크롤은 **장 안에서** 한다.
             * 🟢 **남는 자리를 먹는다**(`flex-1`) — 최소 높이는 **부모**가 정한다(220px).
             *    자리가 모자라면 **장이 스스로 스크롤**한다 (잘라 감추지 않는다 · 규칙 ④).
             * ⚠️ 여기에 `max-h` 를 박으면 «가장 긴 장»이 그 값까지 늘어나 카드가 길어지고,
             *    본문과 장이 **둘 다** 스크롤된다 (스크롤 막대가 두 개가 된다).
             */
            className="flex flex-1 min-h-0 overflow-x-auto overflow-y-hidden snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ overscrollBehaviorX: 'contain' }}
        >
            {Array.from({ length: count }, (_, k) => renderPane(k))}
        </div>
    );
}
