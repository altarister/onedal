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

    useEffect(() => {
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        if (open) { setAlive(true); return; }
        /* 🔴 닫힐 때만 미룬다 — 접히는 동안 보여 주고, 끝나면 버린다 */
        timer.current = setTimeout(() => setAlive(false), ms);
        return () => { if (timer.current) clearTimeout(timer.current); };
    }, [open, ms]);

    return (
        <div className="grid" style={{ gridTemplateRows: open ? '1fr' : '0fr', transition: `grid-template-rows ${ms}ms ease-out` }}>
            {/* 🔴 그리드 칸을 넘는 것을 잘라야 «0fr» 이 실제로 접힌다 */}
            <div className="overflow-hidden">
                <div style={{
                    transform: open ? 'translateY(0)' : 'translateY(-8px)',
                    opacity: open ? 1 : 0,
                    transition: `transform ${ms}ms ease-out, opacity ${ms}ms ease-out`,
                }}>
                    {alive && children}
                </div>
            </div>
        </div>
    );
}
