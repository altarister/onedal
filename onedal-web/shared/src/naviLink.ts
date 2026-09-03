/**
 * 🧭 **내비 링크 — 개인 폰으로 보내는 카카오맵 경로** (기사님 기획 2026-08-19 · 형식 확인 2026-09-03)
 *
 * 기사님: *"내비게이션만 볼 내 개인 폰에서 받아서 링크를 클릭해 내비를 작동하려는 기획이야.
 * 그래야 이 폰으로는 관제웹을 계속 트래킹할 수 있으니까."*
 *
 * ── 폰 셋의 역할 ──
 * | A24 | 스캔폰 — 인성·픽커 화면을 읽는다 |
 * | S23 | 관제폰 — 지도·판정색·결재·GPS 트래킹. **KEEP 을 여기서 누른다** |
 * | 아이폰 | 내비만 — **아무것도 안 깐다.** 링크를 누르면 카카오맵이 열린다 |
 *
 * ── 형식 (카카오 공식 문서 2026-09-03 확인) ──
 * ```
 * kakaomap://route?sp=출발위도,출발경도&vp=경유1&vp2=경유2&…&ep=도착위도,도착경도&by=car
 * ```
 * · 경유지는 `vp`·`vp2`~`vp5` **최대 5개** (대중교통은 경유지 불가)
 * · **좌표만으로 된다** — 이름이 필요 없다
 * · iOS 도 같은 스킴이고, 사파리에서 눌러도 앱이 열린다 (미설치면 앱스토어로)
 *
 * 🔴 **차례가 «위도,경도»다.** 우리 DB·카카오 API 는 `x=경도 · y=위도` 라 **뒤집어** 넣는다.
 *    섞으면 엉뚱한 나라를 안내한다 — 그래서 이 변환을 여기 한 곳에만 둔다 (규칙 ③).
 * 🔴 **카톡으로는 못 보낸다** — 카톡은 폰 한 대에 한 계정이라 «나에게 보내기»는 관제폰에서만
 *    보인다. 2026-08-19 기획 B 의 «카카오 로그인 연동» 보다 앞에 이 벽이 있다.
 */

/** 카카오맵이 받는 경유지 최대 개수 (`vp`·`vp2`~`vp5`) */
export const KAKAO_MAX_VIA = 5;

/** 링크에 넣을 한 점 — DB 와 같은 차례(x=경도 · y=위도) */
export interface NaviPoint {
    x: number;
    y: number;
}

/** 카카오가 읽는 «위도,경도» 한 조각으로 뒤집는다 */
const pair = (p: NaviPoint) => `${p.y},${p.x}`;

/**
 * 🧭 **경로 링크를 만든다.** 만들 수 없으면 `null` — 빈 경로로 내비를 켜지 않는다 (규칙 ④).
 *
 * @param origin 지금 위치. 없으면 «어디서부터»가 없으므로 만들지 않는다
 * @param stops  남은 정거장을 **방문 순서대로**. 마지막이 도착지, 그 앞이 경유지
 *
 * ⚠️ 경유지가 5개를 넘으면 **앞에서부터 끊는다.** 가까운 곳부터 가면 되고, 도착하면 남은
 *    경로를 다시 보내면 된다. 뒤를 버리는 것이 아니라 **나중에 이어 보내는 것**이다.
 */
export function buildKakaoRouteUrl(origin: NaviPoint | null | undefined, stops: NaviPoint[]): string | null {
    if (!origin || stops.length === 0) return null;

    // 경유 5 + 도착 1 = 최대 6곳까지 한 번에 보낸다
    const send = stops.slice(0, KAKAO_MAX_VIA + 1);
    const end = send[send.length - 1];
    const vias = send.slice(0, -1);

    const parts = [`sp=${pair(origin)}`];
    // 첫 경유지는 번호가 없다 — `vp`, 그 다음부터 `vp2`…
    vias.forEach((v, i) => parts.push(`${i === 0 ? 'vp' : `vp${i + 1}`}=${pair(v)}`));
    parts.push(`ep=${pair(end)}`, 'by=car');
    return `kakaomap://route?${parts.join('&')}`;
}

/** 한 번에 다 못 보내고 끊겼는가 — 화면이 «남은 곳은 도착 후 다시»를 알릴 수 있게 */
export function isRouteTruncated(stops: NaviPoint[]): boolean {
    return stops.length > KAKAO_MAX_VIA + 1;
}
