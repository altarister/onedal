import { useEffect, useRef, useState } from 'react';

/**
 * 🪗 **접었다 펴는 자리 — 접는 방식은 여기에만 산다.**
 *
 * 화면에서 무엇을 숨길 때 **그냥 없애면 «어디로 갔나»를 잃는다** (기사님 지적) —
 * 다시 여는 길이 안 보인다. 위로 밀려 올라가며 접히면 내려오는 길도 같이 보인다.
 * 반대로 **뿅 하고 나타나면 아래가 한 번에 찌그러진다** — 펴질 때도 같은 셈으로 내려온다.
 *
 * 🔴 **높이를 전환하지 않는다.** 높이가 바뀌면 브라우저가 전환 내내 매 프레임 레이아웃을
 *    다시 잡아 폰에서 더덕인다 (시트에서 겪은 그것). `grid-template-rows: 1fr ↔ 0fr` 로
 *    두고, 올라가는 모양은 `transform`·`opacity` 가 맡는다.
 *
 * 🔴 **닫힌 뒤에는 자식을 안 그린다 — 접히는 동안만 들고 있는다.**
 *    필터처럼 «닫히면 훅·구독이 안 돌게» 스스로 `return null` 하는 부품이 있다. 그냥 감싸면
 *    닫는 순간 내용이 사라져 **접히는 모습이 안 보인다.** 그렇다고 늘 그리면 닫아 둔 동안에도
 *    훅과 구독이 돈다. 그래서 여기서 **접히는 시간만큼만** 들고 있다가 버린다.
 *
 * 🔴 **쓰는 쪽은 «열렸나»만 말한다.** 접는 셈(그리드·transform·시간)을 쓰는 쪽에 적으면
 *    접을 자리가 늘 때마다 같은 다섯 줄이 베껴지고 곧 갈라진다 (규칙 ③).
 *
 * ```tsx
 * <Collapse open={!isFilterOpen}>
 *     <DeviceControlPanel />
 * </Collapse>
 * ```
 */
/**
 * 🪗 **지금 자식을 그릴까** — 열려 있거나, 닫히는 중이라 아직 접히고 있거나.
 *
 * 🔴 **닫힘이 끝나면 버린다.** 필터처럼 «닫히면 훅·구독이 안 돌게» 스스로 `return null` 하는
 *    부품을 감싸고 있어서, 늘 그리면 닫아 둔 동안에도 구독이 돈다.
 * 🔴 **접히는 동안에는 그린다.** 안 그리면 닫는 순간 내용이 사라져 접히는 모습이 안 보인다.
 */
export function collapseShows(open: boolean, closing: boolean): boolean {
    return open || closing;
}

/**
 * 🪗 **전환을 걸까** — 첫 그림에는 안 건다.
 *
 * 🔴 처음부터 닫혀 있는데 «방금 접힌 것»처럼 움직이면 화면이 거짓말한다.
 * @returns 첫 그림이면 `'none'`, 아니면 `transition` 에 넣을 값
 */
export function collapseMove(first: boolean, ms: number): string {
    return first ? 'none' : `${ms}ms ease-out`;
}

export default function Collapse({
    open,
    children,
    /** ⏱️ 접히고 펴지는 시간(ms) — 기본 200. 운전 중에 읽는 화면이라 길게 끌지 않는다 */
    ms = 200,
}: {
    open: boolean;
    children: React.ReactNode;
    ms?: number;
}) {
    /** 지금 그릴까 — 열려 있거나, 닫히는 중이라 아직 접히고 있거나 */
    const [alive, setAlive] = useState(open);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    /**
     * 🔴 **처음 그릴 때는 전환하지 않는다** — 화면이 처음 서는 순간 닫혀 있으면
     *    «방금 접힌 것»처럼 한 번 움직였다. 처음부터 닫힌 것과 방금 닫은 것은 다르다.
     */
    /* 🔴 **그릴 때 `ref` 를 읽지 않는다** — React 규칙이고(`lint:gate` 가 문다), 화면을 갈아끼울 때
       값이 어긋난다. 첫 그림인지는 **상태**로 들고 있다가 그린 뒤에 끈다. */
    const [first, setFirst] = useState(true);
    useEffect(() => { setFirst(false); }, []);
    /* 🪗 판단은 위 순수 함수에 있다 — 검사가 그것을 잠근다 (`collapse.test.ts`) */
    const move = collapseMove(first, ms);
    const shows = collapseShows(open, alive);

    useEffect(() => {
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        if (open) { setAlive(true); return; }
        /* 🔴 닫힐 때만 미룬다 — 접히는 동안 보여 주고, 끝나면 버린다 */
        timer.current = setTimeout(() => setAlive(false), ms);
        return () => { if (timer.current) clearTimeout(timer.current); };
    }, [open, ms]);

    return (
        <div className="grid" style={{
            gridTemplateRows: open ? '1fr' : '0fr',
            transition: move === 'none' ? 'none' : `grid-template-rows ${move}`,
        }}>
            {/* 🔴 그리드 칸을 넘는 것을 잘라야 «0fr» 이 실제로 접힌다 */}
            <div className="overflow-hidden">
                <div style={{
                    transform: open ? 'translateY(0)' : 'translateY(-8px)',
                    opacity: open ? 1 : 0,
                    transition: move === 'none' ? 'none' : `transform ${move}, opacity ${move}`,
                }}>
                    {shows && children}
                </div>
            </div>
        </div>
    );
}
