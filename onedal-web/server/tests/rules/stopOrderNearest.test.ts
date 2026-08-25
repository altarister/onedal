import { planArrivalStops } from '../../src/services/routeComposer';

/**
 * 🧭 **상차를 전부 앞에 몰지 않는다 — 지나가는 길목부터 들른다** (기사님 실측 2026-08-25)
 *
 * 기사님: *"경로가 이상하다.."*
 *
 * ── 실측 (2026-08-25 14:07:53) ──
 *   기사님 위치에서  **곤지암 하차 4.0km** · **가남 29.9km**
 *   그런데 순서는  ⑴ 가남상차 ⑵ 가남하차 ⑶ 세종대왕면하차 **⑷ 곤지암하차(94분)**
 *   → 4km 앞의 하차지를 두고 **30km 동쪽으로 갔다가 되돌아오는** 경로가 나왔다.
 *
 * 🔴 **뿌리는 `planArrivalStops` 의 마지막 줄이다.**
 *
 *       return [...sortedPickups, ...sortedDropoffs];   // 상차를 전부 앞, 하차를 전부 뒤
 *
 *    새 콜(가남 상차)이 붙자 «상차 먼저» 규칙이 차를 30km 동쪽으로 끌고 갔고,
 *    하차 정렬의 기준점(`currentLoc`)이 **가남**이 되면서 4km 앞이던 곤지암이
 *    맨 뒤로 밀렸다.
 *
 * ⚠️ **적재 순서 때문에 상차가 먼저인 것이 아니다.** 하차는 «이미 실은 짐»을 내리는 것이라
 *    언제 해도 되고, 오히려 지나가는 길에 내리는 것이 싸다. 반대로 **상차가 하차보다
 *    먼저여야 하는 것은 같은 콜 안에서뿐**이다 (제 짐을 싣기 전에 내릴 수는 없다).
 *
 * → 상차·하차를 한 통에 넣고 가까운 순으로 돌되, **같은 콜은 상차가 하차보다 앞**이라는
 *   것만 지킨다.
 */
describe('정거장 순서 — 지나가는 길목부터', () => {
    /** 서→동 일직선: 태전(9.5) · 곤지암(21.4) · 가남(48.5) */
    const 태전 = { x: 127.1707, y: 37.4046 };
    const 곤지암 = { x: 127.3366, y: 37.3648 };
    const 가남 = { x: 127.5768, y: 37.2302 };
    const 세종대왕면 = { x: 127.5853, y: 37.2911 };

    const call = (id: string, p: any, d: any, over: object = {}) => ({
        id, status: 'ORDER_CONFIRMED',
        pickupX: p.x, pickupY: p.y, dropoffX: d.x, dropoffY: d.y,
        ...over,
    }) as any;

    it('🔴 4km 앞 하차지를 두고 30km 동쪽 상차지로 먼저 가지 않는다', () => {
        // 현위치: 곤지암 4km 앞 (태전·곤지암 사이)
        const here = { x: 127.2961, y: 37.3803 };

        const stops = planArrivalStops([
            // ② 태전 → 곤지암 — 상차는 이미 다녀왔고 곤지암 하차만 남았다
            call('B', 태전, 곤지암, { arrivedPickupAt: '2026-08-25T05:07:41.000Z' }),
            // ⑧ 가남 → 세종대왕면 — 방금 잡은 콜. 상차지가 30km 동쪽이다
            call('H', 가남, 세종대왕면),
        ], here);

        const seq = stops.map(s => `${s.orderId}:${s.stopType}`);
        // 4km 앞 곤지암 하차가 맨 앞이어야 한다
        expect(seq[0]).toBe('B:dropoff');
        expect(seq).toEqual(['B:dropoff', 'H:pickup', 'H:dropoff']);
    });

    it('🔴 같은 콜은 상차가 하차보다 앞이다 (제 짐을 싣기 전에 내릴 수 없다)', () => {
        const here = { x: 127.5900, y: 37.2400 };   // 세종대왕면 쪽에서 출발
        const stops = planArrivalStops([call('H', 가남, 세종대왕면)], here);
        const seq = stops.map(s => `${s.orderId}:${s.stopType}`);
        expect(seq.indexOf('H:pickup')).toBeLessThan(seq.indexOf('H:dropoff'));
    });

    it('다녀온 정거장은 여전히 빠진다', () => {
        const here = { x: 127.2961, y: 37.3803 };
        const stops = planArrivalStops([
            call('B', 태전, 곤지암, {
                arrivedPickupAt: '2026-08-25T05:07:41.000Z',
                arrivedDropoffAt: '2026-08-25T05:09:17.000Z',
            }),
        ], here);
        expect(stops).toEqual([]);
    });
});
