/**
 * 🪗 **접었다 펴는 자리 — 접는 방식은 여기에만 산다.**
 *
 * 화면에서 무엇을 숨길 때 **그냥 없애면 «어디로 갔나»를 잃는다** (기사님 지적) —
 * 다시 여는 길이 안 보인다. 위로 밀려 올라가며 접히면 내려오는 길도 같이 보인다.
 *
 * 🔴 **높이를 전환하지 않는다.** 높이가 바뀌면 브라우저가 전환 내내 매 프레임 레이아웃을
 *    다시 잡아 폰에서 더덕인다 (시트에서 겪은 그것 · 버그 대장 참조).
 *    `grid-template-rows: 1fr ↔ 0fr` 는 레이아웃을 **한 번만** 잡고, 올라가는 모양은
 *    `transform`·`opacity` 가 맡는다 — 나머지는 GPU 합성뿐이다.
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
    return (
        <div className="grid" style={{ gridTemplateRows: open ? '1fr' : '0fr', transition: `grid-template-rows ${ms}ms ease-out` }}>
            {/* 🔴 그리드 칸을 넘는 것을 잘라야 «0fr» 이 실제로 접힌다 */}
            <div className="overflow-hidden">
                <div style={{
                    transform: open ? 'translateY(0)' : 'translateY(-8px)',
                    opacity: open ? 1 : 0,
                    transition: `transform ${ms}ms ease-out, opacity ${ms}ms ease-out`,
                }}>
                    {children}
                </div>
            </div>
        </div>
    );
}
