import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🕸️ **필터 목록은 그물 한 벌이 만든다 — 모든 때에** (전수표 1단계 · 기사님 확정 2026-09-14).
 *
 * «7지점 한 바퀴»에서 06 콜(중리동 → 초월읍)이 도착지 축을 통과했다. 이천 **시 경계**에서 10km 넓힌
 * 옛 계산(turf)이 초월읍을 담았다 — 그물이면 빠진다(중심 18km). 옛 계산이 돌던 때:
 *   · 서버 부팅 · 마지막 콜이 끝나 0건 → `rebuildDestinationKeywords` → `getCityRegionsWithRadius`
 *   · KEEP · 경로 재계산 · 재탐색 · 귀가콜 → `syncDetourFilter` → `recalculateDetourFilter`
 *   · 합짐 중 반경 변경 → 소켓이 옛 계산을 먼저 하고 그물이 덮음
 * 그물(`netKeywordsOf`)은 필터 값을 만질 때만 돌았다 (로그: 옛 29회 ↔ 그물 28회).
 *
 * 결정:
 *   · 라인은 **KEEP 순간 경로로 얼린다** — 하차·취소·재탐색으로 다시 안 잰다 (#18)
 *   · 지나온 동은 **GPS 진행도**로 뺀다 — 그물 라인과 같은 셈(`progressAlongKm`) (#19)
 */
const read = (rel: string) => readFileSync(join(__dirname, '../../src', rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const fm = read('state/filterManager.ts');
const de = read('services/dispatchEngine.ts');
const sh = read('socket/socketHandlers.ts');
const body = (src: string, head: string) => {
    const i = src.indexOf(head);
    expect(i).toBeGreaterThan(-1);
    const next = src.slice(i + head.length).search(/\n(export )?(async )?(function|const) /);
    return src.slice(i, next < 0 ? undefined : i + head.length + next);
};

describe('🕸️ 필터 목록 — 그물 한 벌 (1단계)', () => {
    it('🔴 KEEP·경로 재계산(syncDetourFilter)이 옛 계산을 안 부르고 그물 한 곳을 부른다', () => {
        const b = body(de, 'export const syncDetourFilter');
        expect(b).toMatch(/rebuildNetFilter\(userId, io\)/);
        expect(b).not.toMatch(/recalculateDetourFilter\(|getDetourRegions\(|getCityRegionsWithRadius\(/);
    });

    it('🔴 부팅·콜 0건(rebuildDestinationKeywords)이 시 경계 버퍼를 안 쓰고 그물 한 곳을 부른다', () => {
        const b = body(de, 'export function rebuildDestinationKeywords');
        expect(b).toMatch(/rebuildNetFilter\(userId, io\)/);
        expect(b).not.toMatch(/getCityRegionsWithRadius\(/);
    });

    it('🔴 합짐 중 반경 변경도 옛 계산을 안 거친다 — 소켓·refreshDetourIfNeeded', () => {
        expect(body(fm, 'function refreshDetourIfNeeded')).not.toMatch(/recalculateDetourFilter\(/);
        expect(sh).not.toMatch(/recalculateDetourFilter\(/);
    });

    it('🔴 그물이 진행도를 함께 낸다 — 목록과 진행도가 한 벌 (netKeywordsOf 가 progressKm 을 돌려준다)', () => {
        expect(body(fm, 'function netKeywordsOf')).toMatch(/progressKm/);
    });

    it('🔴 라인은 KEEP 순간에 얼린다 — 경로 재계산(하차·취소)은 라인을 안 바꾼다', () => {
        const keep = body(de, 'export async function handleDecision');
        expect(keep).toMatch(/session\.filterLine = getActivePolyline\(session\)[\s\S]{0,40}syncDetourFilter\(userId, io\)/);
        expect(body(de, 'export async function recalculateActiveKakaoRoute')).not.toMatch(/filterLine\s*=/);
        /* 사이클이 끝나면 비운다 — 어제 경로가 다음 첫짐에 살아나지 않게 */
        expect(fm).toMatch(/session\.filterLine = null/);
    });

    it('🔴 지나온 동은 얼린 라인 위 GPS 진행도로 뺀다 — 그물과 같은 셈', () => {
        const trim = body(fm, 'export function applyTraveledTrim');
        expect(trim).toMatch(/filterLineOf\(session\)/);
        expect(trim).toMatch(/progressAlongKm\(/);
        expect(trim).not.toMatch(/progressAlongPolyline\(/);
    });
});

/**
 * 🗺️ **지도도 같은 것을 그린다** (전수표 #19 지도 · #60 · 2026-09-14).
 *
 * 서버는 얼린 라인 위 GPS 진행도로 지나온 동을 앱 목록에서 뺀다. 옛 지도(`useCallNet` · 2026-09-15 걷음)는 그걸 몰라
 * **지나온 동을 계속 점으로 찍고**(`departed: false`), 라인 띠도 통째로 칠했다 — 화면과 판정이 다른 말을 한다.
 *   · 동 점 = 서버가 앱에 내린 지역명 목록과 겹치는 것만 (새 칸 없이 이미 오는 `destinationKeywords`)
 *   · 라인 띠 = 이동 중이면 내 진행도 뒤는 안 긋는다 (목업 `MapMockup.tsx:2575`)
 */
describe('🗺️ 지도 — 지나온 곳을 판정과 같게', () => {
    const client = (rel: string) => readFileSync(join(__dirname, '../../../client-app/src', rel), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    it('🔴 지도는 동 점을 안 찍는다 — 옛 그물 레이어를 걷었다 (2026-09-15)', () => {
        expect(client('components/stage/StageView.tsx')).not.toMatch(/useCallNet|serverKeywords/);
    });
    it('🔴 이동 중이면 하차 띠를 현위치부터 긋는다 — 뒤는 평평하게 자른다 (2026-09-15 «뒤를 자르는 Cap»)', () => {
        const stage = client('components/stage/StageView.tsx');
        expect(stage).toMatch(/dropoffDeparted[\s\S]{0,120}lineFromPoint\(/);
        expect(client('components/dashboard/PinnedRouteCanvas.tsx')).toMatch(/clipAhead\(oc, l\.points, l\.km\)/);
    });
});

/**
 * 🧩 **앱이 지역명만 보기 때문에 목업과 달라지는 두 곳** (기사님 결정 2026-09-14 «나» · 7지점 두 번째 바퀴).
 *
 *   03 곤지암→관고 — 실제 상차지(곤지암성당)는 경로에서 2.15km 로 띠(2.73km) 안인데 **곤지암읍 동 중심점**은 5.36km →
 *                    목록에 안 들어가 «경로 밖». 목업은 상차지 좌표로 재지만 앱은 동 이름뿐이다 →
 *                    **동 경계가 띠에 걸치면 넣는다** (옛 계산 방식 · 앱은 넉넉하게 올린다 규칙 ⑤)
 *   05 사음동→중리동 — 사음동은 목적지 영역 안이라 목록에 있지만 순서표는 경로 영역 동만 → «경로 밖».
 *                    필터는 방향을 안 본다(같은 날 결정) → **목록에 든 동은 순서표에 다 넣고, 모르면 null**(앱: 순서 미상 → 통과)
 */
describe('🧩 앱은 지역명만 본다 — 동을 넉넉하게', () => {
    const { buildAppOrderKm } = require('../../src/state/filterManager');
    it('🔴 목록에 있는데 경로 위가 아닌 동도 순서표에 null 로 나간다 (05 사음동)', () => {
        const s = {
            myOrders: [{ id: 'o1', status: 'ORDER_CONFIRMED' }],
            detourOrderKm: { 신둔면: 10.0 },
            detourFlat: ['신둔면'],
            activeFilter: { destinationKeywords: ['신둔면', '사음동'] },
        } as any;
        const out = buildAppOrderKm(s);
        expect(out.신둔면).toBe(10.0);
        expect(out).toHaveProperty('사음동');
        expect(out.사음동).toBeNull();
    });
    it('🔴 경로 영역은 동 경계가 띠에 걸치면 넣는다 — 그물 목록에 더한다 (03 곤지암읍)', () => {
        const net = body(fm, 'function netKeywordsOf');
        expect(net).toMatch(/getDetourRegions\(/);
    });
});

/**
 * 🧭 **지나온 곳 빼기가 목적지 쪽 동을 먹었다** («7지점» 세 번째 바퀴 · 2026-09-14 20:49:47).
 *
 *   ① 서버가 부팅 때 지난 바퀴 끝 위치(신둔 · 20:33:52 · 16분 묵음)를 되살렸고, 01 KEEP 순간 그 위치로
 *      새 경로의 19.2km 까지를 «지나왔다»며 21 → 10곳으로 뺐다. 새 위치는 20:50:14 에야 왔다
 *      → 빼기는 **지금 위치(`originOf` · 묵었거나 집 주소로 대신한 것 아님)**로만 한다
 *   ② «경계가 걸치면 넣기»(#121 후속)가 그물이 이미 넣은 목적지 영역 동(관고동·사음동)에도 순서를 붙여 빼기에 걸렸다.
 *      목업 규칙: 목적지·마름모로 든 동은 «아직 안 간 곳»이라 진행도가 없다(`callNet.lineZoneOf` `onlyByLine`)
 *      → 걸쳐서 **새로 들어온 동에만** 순서를 붙인다
 */
describe('🧭 지나온 곳 빼기 — 지금 위치로, 경로 영역 동만', () => {
    it('🔴 빼기는 지금 위치로만 — 묵었거나 집 주소로 대신한 위치면 안 뺀다', () => {
        const trim = body(fm, 'export function applyTraveledTrim');
        expect(trim).toMatch(/originOf\(session\b/);
        expect(trim).toMatch(/isFallback/);
        expect(trim).not.toMatch(/const gps = session\.lastFix/);
    });
    it('🔴 걸쳐서 더한 순서는 그물이 이미 넣은 동에 안 붙는다', () => {
        const net = body(fm, 'function netKeywordsOf');
        expect(net).toMatch(/inNet\.has\(name\)/);
    });
});

/**
 * 🧩 **필터 영역을 서버 목록으로 — 2단계** (기사님 확정 · 전수표 #29 #77).
 *
 *   · 출발 전(`session.departedAt` 없음)이면 내 영역을 그물에 넘긴다 — 출발하면 안 넘긴다
 *   · 관내는 목적지 원 안만 — 각도를 360° 로 바꿔 마름모를 원으로 만들던 우회를 걷는다
 *     (21:16:32 여주·용인 처인까지 35곳)
 *   · 출발하는 순간 목록을 다시 만든다 — 지나온 곳 빼기는 진행도 있는 동만 빼니 내 영역은 못 뺀다
 *   · 지도(«상차» · «하차» 레이어)도 같은 두 값으로 그린다
 */
describe('🧩 필터 영역 — 출발 전 내 영역 · 관내 목적지 원 (2단계)', () => {
    const client = (rel: string) => readFileSync(join(__dirname, '../../../client-app/src', rel), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    it('🔴 서버 그물은 조각이 넣으라 할 때만 현위치 영역을 쓴다 · 관내를 따로 재지 않는다 — 가까이 온 목적지는 목적지 원에 걸친 동 (2026-09-15 개정)', () => {
        const net = body(fm, 'function netKeywordsOf');
        expect(net).toMatch(/me: part\.withMe && me/);
        expect(net).toMatch(/if \(part\.nearGoal\)/);
        expect(net).toMatch(/regionsTouchingCircleGrouped\(/);
        expect(net).not.toMatch(/localMode/);
        expect(net).not.toMatch(/isLocalPhase\(/);
        expect(net).not.toMatch(/360/);
    });
    it('🔴 출발하는 순간 목록을 다시 만든다', () => {
        expect(body(fm, 'export function updateActiveFilter')).toMatch(/rebuildNetFilter\(userId, io\)/);
    });
    it('🔴 지도도 같은 두 값으로 그린다', () => {
        const stage = client('components/stage/StageView.tsx');
        /* 🔴 «출발했나»는 목적지 묶음이 아니라 **조각**이 본다 — 지도도 서버와 같은 사실을 쓴다 (설계서 ⑥) */
        expect(stage).toMatch(/const departed = filter\?\.dispatchPhase === 'DELIVERING'/);
        expect(stage).toMatch(/pickupPartsOf\(\{\s*\n?\s*departed,/);
        expect(stage).not.toMatch(/localMode/);
    });
});

/**
 * 🚀 **주행이 감지되면 출발이다** (전수표 #2 · 목업 `MapMockup.tsx` 의 `if (driving) setDeparted(true)`).
 *
 * 실물은 «🚀 지금 출발» 버튼만 출발을 켰다 — «7지점» 네 바퀴 내내 서버 로그에 `🚀 [출발]` 이 0번이라
 * 국면이 «콜 쥠»에 머물렀다. 운전 중에는 누를 수 없다(기사님: 먼발치 1~2초 · 무입력에도 일이 되게).
 * 출발이 안 켜지면 필터 영역이 «출발 전»에 머물러 내 영역이 바퀴 내내 남는다.
 */
describe('🚀 출발 — 주행 감지로 켠다', () => {
    const client = (rel: string) => readFileSync(join(__dirname, '../../../client-app/src', rel), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    it('🔴 관제웹 무대가 주행 신호로 출발(DRIVING)을 보낸다 — 콜을 쥐고 출발 전일 때만', () => {
        const stage = client('components/stage/StageView.tsx');
        expect(stage).toMatch(/drive !== 'drive'[\s\S]{0,160}GATHERING[\s\S]{0,200}updateFilter\(\{ driverAction: 'DRIVING' \}\)/);
    });
});

/**
 * 🏠 **복귀 대기 — 목적지가 둘이다** (전수표 3단계 · #4 #5 #6 #15 #30 #70 #71 #75 · 기사님 확정 2026-09-09).
 *
 *   | 상태 | 살아 있는 목적지 |
 *   |---|---|
 *   | 복귀 끔 | 목적지 |
 *   | 복귀 켬 · 복귀콜 없음 | **목적지 ∪ 집** — 그동안 관내콜을 진행한다 |
 *   | 복귀 켬 · 복귀콜 잡음 | 집 하나 — 목적지 콜은 뜨면 안 된다 |
 *
 * 실물은 복귀를 켜는 순간 목적지가 집 하나로 바뀌었다(`goalCityOf`) — 복귀 대기 동안 목적지 콜이 안 떴다.
 * 규칙은 `callNet.activeGoals` 한 곳이다. «복귀콜을 잡았나»는 **콜의 판**(확정 순간 통과한 목적지 · 둘 다면 집)으로 안다.
 */
describe('🏠 복귀 대기 — 목적지 둘 (3단계)', () => {
    const client = (rel: string) => readFileSync(join(__dirname, '../../../client-app/src', rel), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    it('🔴 살아 있는 목적지는 activeGoals 한 곳이 정한다 — 복귀콜을 잡았나는 콜의 판(goalCity) · 취소한 콜은 안 센다', () => {
        /* 🔴 목적지는 «필터값 ∪ 마지막으로 KEEP 한 콜의 목표값» 한 곳이 정한다 (shared `goalZonesOf`).
              `myOrders` 는 KEEP 차례로 쌓이므로 끝이 곧 마지막 콜이다 */
        const g = body(fm, 'export function goalCitiesOf');
        expect(g).toMatch(/goalZonesNow\(session, userId/);
        expect(g).not.toMatch(/activeGoals\(/);
        const now = body(fm, 'function goalZonesNow');
        expect(now).toMatch(/filterCity: goalCityOf\(session, userId\)/);
        expect(now).toMatch(/session\.myOrders\[session\.myOrders\.length - 1\]/);
        /* 🔄 #131 — «복귀를 켠 뒤에 잡은 콜»로 센다. 아침 복귀콜이 저녁 복귀를 «잡음»으로 못 만드는 것은 켠 시각이 막는다 */
        const calls = body(fm, 'export function homeCallsOf');
        expect(calls).toMatch(/boardOf\(o\)/);
        expect(calls).toMatch(/isHomeCallSince\(/);
        expect(calls).not.toMatch(/deckOfCycle\(/);
        expect(body(fm, 'function boardOf')).toMatch(/o\.goalCity/);
    });
    it('🔴 하차 목록은 살아 있는 목적지마다 조각을 만들어 합친다 — 먼 목적지는 상차 목록 동을 뺀다 (2026-09-15 개정)', () => {
        const n = body(fm, 'function netOfGoals');
        expect(n).toMatch(/goalZonesNow\(session, userId/);
        expect(n).toMatch(/planArrivalStops\(/);
        expect(n).toMatch(/lastDropOf\(/);
        expect(n).toMatch(/dropoffPartsOf\(/);
        /* 🔄 코드 리뷰 2026-09-15 — 상차 목록은 시 · 군 · 구와 짝지어 뺀다 (`activeFilter.pickupGroups`) */
        expect(n).toMatch(/mergeDropoffGroups\(parts, session\.activeFilter\.pickupGroups/);
        expect(fm).not.toMatch(/session\.activeFilter\.localMode = /);
    });
    it('🔴 상차 목록을 먼저 만들고 하차 목록을 만든다 · 0.5km 마다 상차 목록이나 가까이 옴이 바뀌면 하차 목록도 (2026-09-15)', () => {
        const r = body(fm, 'export function rebuildNetFilter');
        const pick = r.indexOf('rebuildPickupList(session, userId)');
        expect(pick).toBeGreaterThan(-1);
        expect(pick).toBeLessThan(r.indexOf('netFilterOf(session, userId)'));
        expect(body(fm, 'export function maybeRebuildPickupList')).toMatch(/rebuildNetFilter\(userId, io, true\)/);
        expect(body(fm, 'export function rebuildPickupList')).toMatch(/pickupNearKey/);
    });
    it('🔴 확정 순간 그때의 «필터값»을 콜의 목표값으로 적는다 — 좌표로 되짚지 않는다', () => {
        expect(body(de, 'export async function handleDecision')).toMatch(/goalCity = goalCityOf\(session, userId\)/);
        expect(fm).not.toMatch(/function goalOfCall/);
    });
    it('🔴 지도는 목적지마다 하차 조각을 그리고 마커를 찍는다 · 콜 카드에 판', () => {
        /* 🔴 지도는 서버가 낸 목적지 목록을 받아 쓴다 — 다시 계산하지 않는다 */
        const stage = client('components/stage/StageView.tsx');
        expect(stage).toMatch(/filter\?\.goalCities/);
        expect(stage).toMatch(/goals: dropoffParts\.map\(/);
        expect(client('components/dashboard/PinnedRouteCanvas.tsx')).toMatch(/dropoffArea\.goals/);
        expect(client('components/dashboard/CallDeck.tsx')).toMatch(/o\.goalCity/);
    });
});

/**
 * 🧵 **필터 값을 바꿔도 콜을 쥐었으면 경로 영역이 남는다** (3단계 확인 안내를 쓰다 찾음).
 *
 * `recalculateDerivedFields` 의 지리 재계산 분기(복귀 켜기 · 각도 · 마름모반경 · 현위반경 · 제외 지역)가
 * 목록을 **라인 없이**(`null`) 다시 만들었다. 뒤따라 라인으로 다시 만드는 길이 없어서(`refreshDetourIfNeeded` 는
 * 라인반경만 본다) 다음 KEEP·하차까지 **경로 영역이 빠진 목록**이 폰에 갔다 — 복귀를 켜는 순간 가는 길의 동이 사라진다.
 * → 이 분기도 얼린 라인(`filterLineOf`)으로 만들고 진행도를 함께 기억한다 (`rebuildNetFilter` 와 같은 모양).
 */
describe('🧵 지리 재계산 분기도 얼린 라인으로', () => {
    it('🔴 콜을 쥐었으면 라인을 넘기고 진행도를 기억한다 — null 로 다시 만들지 않는다', () => {
        const i = fm.indexOf('needsGeoRecalc) {');
        expect(i).toBeGreaterThan(-1);
        const branch = fm.slice(i, i + 1400);
        expect(branch).not.toMatch(/netOfGoals\(session, userId, null\)/);
        expect(branch).toMatch(/filterLineOf\(session\)/);
        expect(branch).toMatch(/rememberDetourProgress\(/);
    });
});
