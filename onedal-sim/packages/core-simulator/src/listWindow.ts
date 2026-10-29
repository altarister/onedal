/**
 * 🪟 **스크롤 칸 안에 온전히 보이는 줄 범위** `[first, last)` — 배차망을 모르는 순수 함수(목록이 있는 배차망 화면이 함께 쓴다).
 *
 * 웹뷰는 스크롤 칸이 가린 줄도 제 위치 그대로 원달앱에 넘기고, 화면 끝을 넘은 줄은 높이 0 으로 한 줄에 겹쳐 넘긴다.
 * 실물 배차망 앱은 보이는 줄만 넘기므로 시뮬레이터도 보이는 줄만 그린다. 반쯤 가린 맨 아래 줄은 안 그린다.
 * 칸 높이를 모르면(`viewportHeight` 0 — 서버 렌더 · 검사) 전부 그린다.
 */
export function visibleRowRange(scrollTop: number, viewportHeight: number, count: number, rowHeight: number): [number, number] {
  if (viewportHeight <= 0) return [0, count];
  const first = Math.min(count, Math.ceil(scrollTop / rowHeight));
  const last = Math.min(count, Math.max(first, Math.floor((scrollTop + viewportHeight) / rowHeight)));
  return [first, last];
}
