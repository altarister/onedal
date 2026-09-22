import { initGeoService, regionsTouchingNetGrouped, getDetourRegions } from '../../src/services/geoService';
import { netForGoal, cityCenter, quadShapeFrom } from '@onedal/shared';

/**
 * 🔵 **먼 목적지의 하차 조각도 «걸친 동»을 넣는다 — 실제 지도로** (기사님 2026-09-15 «영역에 지역이 걸치고 있으면 들어가는거야»).
 *
 * 그물(`netForGoal`)은 동을 **중심점 하나**로 본다 — 원 · 마름모 가장자리에 걸쳤는데 중심이 밖인 넓은 읍 · 면이 빠졌다
 * (인천 조건 실측 45곳). 걸침은 상차 목록과 같은 식이다 (`geoService.regionsTouchingAreaGrouped` — 격자 점 ∪ 동 꼭짓점).
 * 좌표는 이천 왕복 시나리오 실값 · 반경은 그때 자동 반경이 준 값.
 */
const MODA = { lng: 127.312587, lat: 37.363298, name: '내 위치' };        // 모다아울렛 (초월읍)
const TERMINAL = { lng: 127.446936, lat: 37.277421, name: '종착지' };    // 이천터미널 (중리동)
const SINDUN = { lng: 127.40410, lat: 37.30574 };                         // HD현대 신둔
const shape = quadShapeFrom(null);
const params = { srcAngleDeg: shape.srcAngleDeg, dstAngleDeg: shape.dstAngleDeg, quadRadiusKm: 15.9, srcDiamKm: 4.55 * 2, dstDiamKm: 4.55 * 2 };
const ICHEON = { ...cityCenter('이천시'), name: '이천시' };

beforeAll(() => { initGeoService(); });

const namesOf = (g: Record<string, string[]>) => new Set(Object.values(g).flat());

describe('🔵 먼 목적지 조각 — 걸친 동', () => {
    it('🔴 콜 없음(현위치 원 ∪ 마름모 ∪ 목적지 원): 중심점으로 든 동은 전부 들고 · 가장자리에 걸친 동이 더 든다', () => {
        const centroid = new Set(netForGoal(ICHEON, { line: null, lineRadiusKm: 2.73, lastDrop: null, params, anchor: MODA, me: MODA }).pass.map(d => d.name));
        const touch = namesOf(regionsTouchingNetGrouped({ goal: ICHEON, anchor: MODA, me: MODA, line: null, lastDrop: null, params, lineRadiusKm: 2.73 }));
        for (const n of centroid) expect(touch.has(n)).toBe(true);
        expect(touch.size).toBeGreaterThan(centroid.size);
    });

    it('🔴 운행 뒤(라인 ∪ 종착지→목적지 마름모 ∪ 목적지 원 · 현위치 원 없음): 중심점 목록을 품고 더 넓다', () => {
        const line: Array<[number, number]> = [[MODA.lng, MODA.lat], [SINDUN.lng, SINDUN.lat], [TERMINAL.lng, TERMINAL.lat]];
        const centroid = new Set(netForGoal(ICHEON, { line, lineRadiusKm: 2.73, lastDrop: TERMINAL, params, anchor: MODA, me: null }).pass.map(d => d.name));
        const touch = namesOf(regionsTouchingNetGrouped({ goal: ICHEON, anchor: MODA, me: null, line, lastDrop: TERMINAL, params, lineRadiusKm: 2.73 }));
        for (const n of centroid) expect(touch.has(n)).toBe(true);
        expect(touch.size).toBeGreaterThanOrEqual(centroid.size);
    });

    it('🔴 중심점 그물과 걸친 동이 같은 시 · 군 · 구 이름을 쓴다 — 다르면 상차 목록 빼기(«시 + 동»)가 조용히 안 먹힌다 (코드 리뷰 2026-09-15)', () => {
        const net = netForGoal(ICHEON, { line: null, lineRadiusKm: 2.73, lastDrop: null, params, anchor: MODA, me: MODA });
        const touch = regionsTouchingNetGrouped({ goal: ICHEON, anchor: MODA, me: MODA, line: null, lastDrop: null, params, lineRadiusKm: 2.73 });
        const touchKeys = new Set(Object.entries(touch).flatMap(([region, names]) => names.map(n => `${region}|${n}`)));
        const touchNames = namesOf(touch);
        const mismatched = net.pass.filter(d => touchNames.has(d.name) && !touchKeys.has(`${d.region}|${d.name}`)).map(d => `${d.region}|${d.name}`);
        expect(mismatched).toEqual([]);
    });

    it('시 · 군 · 구로 묶어 낸다 — 시 별칭(`cityAliases`)이 이 이름으로 만들어진다', () => {
        const g = regionsTouchingNetGrouped({ goal: ICHEON, anchor: MODA, me: MODA, line: null, lastDrop: null, params, lineRadiusKm: 2.73 });
        expect(Object.keys(g).some(k => k.includes('이천'))).toBe(true);
    });
});

/**
 * 🔴 **경유 띠의 끝도 딱 잘린다 — 둥근 캡이 아니다** (기사님 지적).
 *
 * 하차 목록은 그물·걸친 동을 구한 **뒤에** `getDetourRegions` 로 「띠에 걸친 동」을 한 번 더 더한다
 * (`filterManager.netKeywordsOf`). 그런데 그것은 turf 버퍼라 **끝이 둥글다** — 라인 시작(출발 자리)
 * 뒤로 띠 반경만큼 반원이 붙어, 앞에서 `lineZoneOf` 로 잘라낸 뒤쪽 동이 여기서 **다시 들어왔다.**
 * 그래서 「도척 상차 → 경안동 하차」 같은 역방향 콜이 통과했다.
 *
 * 🔴 띠 계산이 두 벌이면 한쪽만 고쳐진다 — 두 길이 **같은 자름**(`aheadOf`·`isAheadOf`)을 봐야 한다.
 */
describe('🔵 경유 띠 — 라인 시작 뒤는 안 담는다', () => {
    /** 광주 시내 — 모다아울렛(라인 시작)에서 **가는 방향 반대**(서쪽) 5~7km. 띠 반경 안이라 캡 모양만이 가른다 */
    const BEHIND = ['경안동', '쌍령동', '태전동', '탄벌동', '역동'];

    it('🔴 가는 방향 반대에 있는 동은 띠에 안 든다 — 띠 안이어도', () => {
        const line = [
            { x: MODA.lng, y: MODA.lat }, { x: SINDUN.lng, y: SINDUN.lat }, { x: TERMINAL.lng, y: TERMINAL.lat },
        ];
        const r = getDetourRegions(line, 16);
        expect(r).not.toBeNull();
        const names = new Set(Object.values(r!.grouped).flat());
        /* 앞쪽(가는 길)은 들어야 한다 — 자름이 너무 세면 이 줄이 먼저 깨진다 */
        expect(names.has('신둔면')).toBe(true);
        expect(BEHIND.filter(n => names.has(n))).toEqual([]);
    });
});

/**
 * ✂️ **하차 조각은 현위치 원을 도려낸다 — 통째로 든 동만** (기사님 그림).
 *
 * 기사님: *"내 주위에 녹색이 있고, 파랑과 접경에 보라색 지역이 있고, 그 이후 목적지 방향으로 파란 점."*
 * 곧 **원 안은 상차만**, 경계에 걸친 동만 «둘 다», 그 밖이 하차다.
 *
 * 🔴 라인이 없을 때는 그물이 이미 도려낸다(`callNet.makeInNet` 의 `excludeSrc`). 라인이 생기면
 *    `lineZoneOf` 와 이 띠 계산으로 갈라지는데 둘 다 도려내기가 없어, **운행 중에만** 상차가
 *    하차에 통째로 잠겼다 — 실측에서 상차 9곳이 전부 «둘 다»였고 «상차만»이 0곳이었다.
 * 🔴 걸친 동까지 버리지 않는다 — «싣고 조금 앞에 내리는» 가까운 콜이 통째로 막힌다 (규칙 ⑤).
 */
describe('🔵 경유 띠 — 내 위치 원 안은 담지 않는다', () => {
    const line = [
        { x: MODA.lng, y: MODA.lat }, { x: SINDUN.lng, y: SINDUN.lat }, { x: TERMINAL.lng, y: TERMINAL.lat },
    ];

    it('🔴 내 위치 원에 통째로 든 동은 경유가 아니다 — 원 밖 가는 길은 그대로 남는다', () => {
        const all = getDetourRegions(line, 16);
        const cut = getDetourRegions(line, 16, undefined, { lng: MODA.lng, lat: MODA.lat, km: 12 });
        expect(all).not.toBeNull();
        expect(cut).not.toBeNull();
        const A = new Set(Object.values(all!.grouped).flat());
        const B = new Set(Object.values(cut!.grouped).flat());
        /* 내 위치가 선 동(초월읍)은 도려내기 전에는 들고, 도려내면 빠진다 */
        expect(A.has('초월읍')).toBe(true);
        expect(B.has('초월읍')).toBe(false);
        /* 🔴 가는 길은 살아 있어야 한다 — 도려내기가 앞을 먹으면 이 줄이 먼저 깨진다 */
        expect(B.has('신둔면')).toBe(true);
        /* 도려낸 목록은 안 도려낸 목록의 부분집합이다 — 빼기만 한다 */
        expect([...B].every(n => A.has(n))).toBe(true);
    });

    it('원이 작아 동이 통째로 안 들면 아무것도 안 뺀다 — 경계에 걸친 동은 남긴다', () => {
        const all = getDetourRegions(line, 16);
        const cut = getDetourRegions(line, 16, undefined, { lng: MODA.lng, lat: MODA.lat, km: 8 });
        const A = new Set(Object.values(all!.grouped).flat());
        const B = new Set(Object.values(cut!.grouped).flat());
        expect(B.size).toBe(A.size);
    });
});
