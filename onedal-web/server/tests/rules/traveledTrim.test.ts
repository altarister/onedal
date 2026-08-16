import { readFileSync } from "fs";
import { join } from "path";

const SERVER = join(__dirname, "../../src");
const read = (rel: string) => readFileSync(join(SERVER, rel), "utf8");
/** 주석을 걷어낸 코드만 — 주석의 역사 기록에 걸리지 않게 */
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const geo = codeOnly(read("services/geoService.ts"));
const fm = codeOnly(read("state/filterManager.ts"));
const engine = codeOnly(read("services/dispatchEngine.ts"));

/**
 * 🔴 **지나온 구간은 필터에서 뺀다** (2026-08-14 기사님 확정)
 *
 * 기사님: *"성남을 지난 지금, 이미 지나온 광주시·성남시 콜을 계속 잡을까?
 * — 자동으로 제외. 뒤로 안 돌아가니까. 앞쪽(송파·강남)만 남는다. 이것이 맞아."*
 *
 * 예전 구현은 이동할 때마다 **경유을 통째로 다시 그렸고**(실측 173ms), 그 비용 때문에
 * 2km 마다만 돌렸다. 게다가 `getActivePolyline` 이 죽어 있어 **한 번도 실행되지 않았다.**
 * 지금은 경유을 만들 때 동마다 진행도를 같이 기록하고, 이동 시에는 숫자만 비교한다(0.14ms).
 */
describe('지나온 구간 제거 — 다시 그리지 않고 숫자만 비교한다', () => {

    it('🔴 진행도는 경유과 **같이** 나온다 (따로 만들면 갈라진다)', () => {
        // getDetourRegions 가 progressKm 을 함께 반환한다
        expect(geo).toMatch(/progressKm/);
        const fn = geo.slice(geo.indexOf('export function getDetourRegions'));
        const body = fn.slice(0, fn.indexOf('\nexport '));
        expect(body).toMatch(/progressKm\[regionName\]/);
        // 교차 검사 루프 안에서 계산한다 — 따로 도는 두 번째 루프가 아니다
        expect(body).toMatch(/booleanIntersects[\s\S]{0,900}progressKm/);
    });

    it('진행도는 부팅 때 캐시한 centroid/bbox 를 쓴다 (여기서 다시 만들지 않는다)', () => {
        const fn = geo.slice(geo.indexOf('export function getDetourRegions'));
        const body = fn.slice(0, fn.indexOf('\nexport '));
        expect(body).toMatch(/feature as any\)\.centroid/);
        expect(body).not.toMatch(/turf\.centroid\(/);
    });

    it('🔴 넓은 동은 **늦게** 뺀다 — 일찍 빼면 잡을 수 있는 콜을 버린다', () => {
        const fn = geo.slice(geo.indexOf('export function getDetourRegions'));
        const body = fn.slice(0, fn.indexOf('\nexport '));
        // 중심점 + 동의 크기만큼 여유
        expect(body).toMatch(/const pad = fb \?/);
        expect(body).toMatch(/at \+ pad/);
        // 같은 이름의 동이 여럿이면 가장 늦은 것을 남긴다
        expect(body).toMatch(/val > prev/);
    });

    it('🔴 하차지 주변 동은 트림에서 빼지 않는다 — 도착이 가까울수록 필요한 콜이다', () => {
        // 하차지 반경은 *경로* 조건이 아니라 *목적지* 조건이다.
        // 진행도로 자르면 도착 직전에 그 동네가 먼저 사라진다 (실측: 경유이 1개까지 줄었다)
        const fn = geo.slice(geo.indexOf('export function getDetourRegions'));
        const body = fn.slice(0, fn.indexOf('\nexport '));
        expect(body).toMatch(/const destCenter =/);
        expect(body).toMatch(/inDest \? Infinity : at \+ pad/);
    });

    it('하차지 원의 중심은 **경로의 마지막 점**이다 (버퍼 합병이 쓰는 좌표와 같아야 한다)', () => {
        const fn = geo.slice(geo.indexOf('export function getDetourRegions'));
        const body = fn.slice(0, fn.indexOf('\nexport '));
        expect(body).toMatch(/destCenter[\s\S]{0,120}lineCoords\[lineCoords\.length - 1\]/);
    });

    it('🔴 죽어 있던 getActivePolyline 을 되살렸다 (subCalls 는 세션에 없다)', () => {
        const fn = geo.slice(geo.indexOf('export function getActivePolyline'));
        const body = fn.slice(0, fn.indexOf('\n}'));
        expect(body).toMatch(/getActiveCalls\(session\)/);
        expect(body).not.toMatch(/subCalls/);
        expect(body).not.toMatch(/mainCallState/);
    });

    it('🔴 쌍둥이 죽은 함수 getLastDropoffCoord 도 되살렸다 (500m 도착 감지가 안 돌고 있었다)', () => {
        const fn = geo.slice(geo.indexOf('export function getLastDropoffCoord'));
        const body = fn.slice(0, fn.indexOf('\n}'));
        expect(body).toMatch(/getActiveCalls\(session\)/);
        expect(body).not.toMatch(/subCalls/);
        expect(body).not.toMatch(/mainCallState/);
        // 기준은 경로의 마지막 점 — "도착했다"와 "도착지 주변이다"가 어긋나면 안 된다
        expect(body).toMatch(/poly\[poly\.length - 1\]/);
    });

    it('경유을 만드는 자리는 **모두** 진행도를 같이 기억한다', () => {
        // 키워드만 갱신하고 진행도를 두면, 옛 경로 기준으로 멀쩡한 동이 사라진다
        for (const src of [fm, engine]) {
            const calls = (src.match(/getDetourRegions\(/g) || []).length;
            if (calls === 0) continue;
            expect(src).toMatch(/rememberDetourProgress/);
        }
    });

    it('🔴 제거 **로직**은 한 곳(applyTraveledTrim)뿐이고, 부르는 곳은 둘이다', () => {
        // ① 파생 계산의 끝 — 경유을 다시 그리는 길이 여럿인데(경로 갱신·반경 변경·국면 전환)
        //    어느 길로 오든 다시 그리면 지나온 동이 되살아난다
        const derive = fm.slice(fm.indexOf('function recalculateDerivedFields'), fm.indexOf('export function trimTraveled'));
        expect(derive).toMatch(/applyTraveledTrim\(session\)/);
        // ② GPS 전용 통로
        const gps = fm.slice(fm.indexOf('export function trimTraveled'), fm.indexOf('export function rememberDetourProgress'));
        expect(gps).toMatch(/applyTraveledTrim\(session\)/);
        // 그 둘뿐이다 — 세 번째가 생기면 순서에 따라 결과가 달라진다
        expect((fm.match(/applyTraveledTrim\(session\)/g) || []).length).toBe(2);
    });
});

/**
 * 안전 쪽으로 기운 규칙 — **일찍 빼면 잡을 수 있는 콜을 버린다.**
 */
describe('지나온 구간 제거 — 일찍 빼지 않는다', () => {

    const fn = fm.slice(fm.indexOf('export function applyTraveledTrim'), fm.indexOf('export function refreshDetourIfNeeded') > 0 ? fm.indexOf('export function refreshDetourIfNeeded') : undefined);
    const body = fn.slice(0, fn.indexOf('\n}\n') + 2);

    it('🔴 국면을 보지 않는다 — 지나온 동네는 합짐이든 운행중이든 지난 동네다', () => {
        // 2026-08-14 정정: 처음엔 DELIVERING 일 때만 돌렸는데, 도착 감지가 국면을
        // GATHERING 으로 떨어뜨리자 **달리는 중인데 제거가 멈췄다.**
        // 조건은 데이터에 맡긴다 — 진행도 · 경로 · GPS 가 있으면 돈다
        expect(body).not.toMatch(/dispatchPhase/);
        expect(body).toMatch(/const progress = session\.detourProgressKm/);
        expect(body).toMatch(/if \(!polyline \|\| !gps\) return false/);
    });

    it('🔴 진행도를 모르는 동은 남긴다', () => {
        expect(body).toMatch(/progress\[d\] === undefined \|\| progress\[d\] >= at/);
    });

    it('🔴 전부 빠지면 아무것도 안 한다 — 빈 필터는 "제한 없음"이 아니라 고장이다', () => {
        expect(body).toMatch(/kept\.size === 0\) return false/);
    });

    it('🔴 동·시 묶음·별칭을 한 벌로 줄인다 (별칭이 남으면 앱의 2단계 필터가 어긋난다)', () => {
        expect(body).toMatch(/destinationKeywords =/);
        expect(body).toMatch(/destinationGroups =/);
        expect(body).toMatch(/customCityFilters =/);
        expect(body).toMatch(/cityAliases\(parent\)/);
    });

    it('사이클이 끝나면(STANDBY) 진행도를 지운다 — 다음 운행에 옛 기준이 남지 않게', () => {
        const at = fm.indexOf('if (isTransitionToEmpty)');
        const reset = fm.slice(at, fm.indexOf('} else {', at));   // ⚠️ 시작 위치를 주지 않으면 앞쪽 '} else {' 를 물어 빈 조각이 된다
        expect(reset).toMatch(/detourProgressKm = null/);
    });
});

/**
 * 🔴 **같은 일을 하는 두 번째 구현을 남기지 않는다.**
 * 경유 계산은 이 레포에서 이미 4벌로 갈라진 적이 있다.
 */
describe('옛 방식은 지웠다', () => {

    it('trimCorridorByProgress(경유 통째 재계산)는 더 이상 없다', () => {
        expect(geo).not.toMatch(/export function trimCorridorByProgress/);
        // 부르던 곳도 없다
        expect(codeOnly(read('routes/scrap.ts'))).not.toMatch(/trimCorridorByProgress/);
    });

    it('GPS 이동은 방아쇠만 당긴다 — 제거 로직을 여기서 다시 쓰지 않는다', () => {
        const move = geo.slice(geo.indexOf('const isDelivering'));
        const body = move.slice(0, move.indexOf('도착 감지') > 0 ? move.indexOf('도착 감지') : 1500);
        expect(body).not.toMatch(/destinationKeywords/);
        expect(body).toMatch(/trimTraveledCb\(userId\)/);
    });
});

/**
 * 🔴 **GPS 경로는 필터 변경 통로를 쓰지 않는다.**
 *
 * 2026-08-14 에 `applyFilterCb(userId, {})` 로 파생 재계산을 트리거했다가 되돌렸다.
 * `recalculateDerivedFields` 안에 *"도착 도시가 비어 있으면 키워드를 지운다"* 는 가지가 있어,
 * 도시를 안 고른 채 운행하면 **0.5km 마다 경유이 통째로 지워진다.**
 * 빈 필터는 "제한 없음"이 아니라 **고장**이라 콜 잡기가 조용히 멈춘다.
 */
describe('GPS 경로는 전용 통로로 간다', () => {

    const handlers = codeOnly(read('socket/socketHandlers.ts'));

    it('🔴 지나온 구간 제거가 빈 변경({})으로 파생 재계산을 트리거하지 않는다', () => {
        const move = geo.slice(geo.indexOf('const isDelivering'));
        const body = move.slice(0, move.indexOf('도착 감지'));
        expect(body).not.toMatch(/applyFilterCb\(userId, \{\}\)/);
    });

    it('전용 콜백을 따로 받는다 (필터 변경과 인자가 다르다)', () => {
        expect(geo).toMatch(/trimTraveledCb\?: \(uid: string\) => void/);
        expect(handlers).toMatch(/trimTraveled\(uid, io\)/);
    });

    it('전용 통로는 파생 재계산을 거치지 않는다 (허용 차종·적재 칸을 다시 셀 이유가 없다)', () => {
        const fn = fm.slice(fm.indexOf('export function trimTraveled'), fm.indexOf('export function rememberDetourProgress'));
        expect(fn).not.toMatch(/recalculateDerivedFields/);
        expect(fn).not.toMatch(/updateActiveFilter/);
        expect(fn).toMatch(/broadcastFilter/);
    });
});

/**
 * 🔴 **"운행 중"은 정류장에서 풀리지 않는다** (2026-08-14 기사님 신고)
 *
 * 기사님: *"이동중인데 필터 값이 변경되지 않았어."*
 *
 * 도착 감지가 `driverAction = UNLOADING` 을 켜자 `dispatchPhase` 가 GATHERING 으로 떨어졌고,
 * **증상 넷이 한꺼번에** 나왔다 — 지나온 구간 제거 정지 · 우회 0 이 풀려 경유이 넓어짐 ·
 * 🚀 출발 버튼 재등장 · 요약줄이 "대기". 전부 판정 한 줄에서 나왔다.
 */
describe('운행 중 — 출발한 사실에서 나온다', () => {

    const store = codeOnly(read('state/userSessionStore.ts'));
    const client = codeOnly(readFileSync(join(__dirname, '../../../client-app/src/components/dashboard/PinnedRoute.tsx'), 'utf8'));

    it('🔴 출발 사실을 세션에 새긴다 (driverAction 으로 대신하지 않는다)', () => {
        expect(store).toMatch(/departedAt: number \| null/);
        const apply = fm.slice(fm.indexOf('export function updateActiveFilter'));
        expect(apply).toMatch(/changes\.driverAction === 'DRIVING' && !session\.departedAt/);
        expect(apply).toMatch(/session\.departedAt = Date\.now\(\)/);
    });

    it('🔴 국면 판정이 driverAction 을 보지 않는다 — 정류장마다 바뀌는 값이다', () => {
        const line = fm.slice(fm.indexOf('const derivedPhase ='), fm.indexOf('const derivedPhase =') + 120);
        expect(line).toMatch(/deriveDispatchPhase\(activeCount, !!session\.departedAt\)/);
        expect(line).not.toMatch(/driverAction/);
    });

    it('사이클이 끝나면 출발 사실도 지운다 (콜 0건 · STANDBY 복귀 · 자정)', () => {
        expect((fm.match(/departedAt = null/g) || []).length).toBeGreaterThanOrEqual(3);
    });

    it('🔴 🚀 버튼은 국면을 보고 나타난다 — driverAction 을 보면 정류장마다 다시 뜬다', () => {
        expect(client).toMatch(/filter\.dispatchPhase !== 'DELIVERING'/);
        expect(client).not.toMatch(/filter\.driverAction !== 'DRIVING'/);
    });

    it('🚀 버튼이 우회 반경을 직접 정하지 않는다 (운행중 국면 설정이 준다)', () => {
        const onClick = client.slice(client.indexOf("updateFilter({ driverAction: 'DRIVING'"));
        expect(onClick.slice(0, 80)).not.toMatch(/detourRadiusKm/);
    });
});
