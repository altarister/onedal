/**
 * 🔔 **듣는 함수 묶음 — 순수** (예시 쪽 다시 그리기 · 메뉴 숫자 즉시 갱신이 같이 쓴다).
 *    🔴 정리는 «자기 함수 하나»만 지운다 — 묶음을 통째로 비우면 아직 떠 있는 다른 부품이 그 뒤 소식을 못 받는다(`opsListeners` 검사).
 */
export function createListeners() {
    const set = new Set<() => void>();
    return {
        /** 듣기 시작 — 돌려주는 함수가 그 듣기 하나만 지운다 */
        add(fn: () => void): () => void { set.add(fn); return () => { set.delete(fn); }; },
        notify(): void { set.forEach(l => l()); },
        get size(): number { return set.size; },
    };
}
