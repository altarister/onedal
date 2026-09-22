/**
 * 🎲 씨앗 있는 난수 — 같은 씨앗이면 늘 같은 수열 (검사 전용)
 *
 * 시뮬레이터는 콜·화면에 `Math.random` 을 쓴다. 검사가 «같은 입력이면 같은 콜·화면이 나오는가»를 보려면
 * 같은 난수를 넣어야 한다. mulberry32 — 짧고 JS 만으로 도는 표준 생성기다.
 */
export function seededRandom(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** 🕘 검사가 쓰는 «지금» — 콜 시각·화면 날짜가 이 시각에서 나온다 */
export const FIXED_NOW = new Date('2026-09-14T09:00:00+09:00');
