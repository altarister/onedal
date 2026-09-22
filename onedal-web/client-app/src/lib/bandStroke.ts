/**
 * 🌈 **콜 띠의 두께와 자리 — 콜 수에 맞춰 정한다** (기사님 지시: *"콜이 5개까지 늘어난다는 걸 가정하고
 * 두께를 콜의 비율로 가져가야 할 것 같다"*).
 *
 * 콜마다 선 하나를 진행 방향의 직각으로 밀어 나란히 긋는다. 콜이 늘면 선도 느니,
 * 두께와 간격을 함께 줄여 **전체 폭**(맨 왼쪽 선 ~ 맨 오른쪽 선)이 한도를 넘지 않게 한다.
 *
 * 🔴 전체 폭이 넘치면 경로가 **굵은 띠 하나**로 뭉쳐 보여 길이 어디로 가는지 안 읽힌다.
 * 🔴 두께에는 바닥을 둔다 — 얇아지기만 하면 먼발치 1~2초에 안 보인다 (규칙 ⑤-3).
 */

/** 나란한 선 전체가 차지할 수 있는 최대 폭 (화면 픽셀) */
export const BAND_SPREAD_PX = 12;
/** 콜이 적을 때의 간격 — 이보다 넓히지 않는다 */
const MAX_GAP_PX = 3;
/** 아무리 콜이 많아도 이보다 얇게 긋지 않는다 (기본 선 두께의 배수) */
const MIN_WIDTH_SCALE = 0.5;

export function bandStrokeOf(count: number, index: number): { widthScale: number; shiftPx: number } {
    const n = Math.max(1, count);
    const gap = n <= 1 ? 0 : Math.min(MAX_GAP_PX, BAND_SPREAD_PX / (n - 1));
    const shiftPx = (index - (n - 1) / 2) * gap;
    /* 콜 둘까지는 0.9 · 그 뒤로는 하나 늘 때마다 0.1 씩 얇게, 바닥은 0.5 */
    const widthScale = Math.max(MIN_WIDTH_SCALE, 0.9 - Math.max(0, n - 2) * 0.1);
    return { widthScale, shiftPx };
}
