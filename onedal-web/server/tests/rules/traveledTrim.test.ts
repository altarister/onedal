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
 * 예전 구현은 이동할 때마다 **회랑을 통째로 다시 그렸고**(실측 173ms), 그 비용 때문에
 * 2km 마다만 돌렸다. 게다가 `getActivePolyline` 이 죽어 있어 **한 번도 실행되지 않았다.**
 * 지금은 회랑을 만들 때 동마다 진행도를 같이 기록하고, 이동 시에는 숫자만 비교한다(0.14ms).
 */
describe('지나온 구간 제거 — 다시 그리지 않고 숫자만 비교한다', () => {

    it('🔴 진행도는 회랑과 **같이** 나온다 (따로 만들면 갈라진다)', () => {
        // getCorridorRegions 가 progressKm 을 함께 반환한다
        expect(geo).toMatch(/progressKm/);
        const fn = geo.slice(geo.indexOf('export function getCorridorRegions'));
        const body = fn.slice(0, fn.indexOf('\nexport '));
        expect(body).toMatch(/progressKm\[regionName\]/);
        // 교차 검사 루프 안에서 계산한다 — 따로 도는 두 번째 루프가 아니다
        expect(body).toMatch(/booleanIntersects[\s\S]{0,900}progressKm/);
    });

    it('진행도는 부팅 때 캐시한 centroid/bbox 를 쓴다 (여기서 다시 만들지 않는다)', () => {
        const fn = geo.slice(geo.indexOf('export function getCorridorRegions'));
        const body = fn.slice(0, fn.indexOf('\nexport '));
        expect(body).toMatch(/feature as any\)\.centroid/);
        expect(body).not.toMatch(/turf\.centroid\(/);
    });

    it('🔴 넓은 동은 **늦게** 뺀다 — 일찍 빼면 잡을 수 있는 콜을 버린다', () => {
        const fn = geo.slice(geo.indexOf('export function getCorridorRegions'));
        const body = fn.slice(0, fn.indexOf('\nexport '));
        // 중심점 + 동의 크기만큼 여유
        expect(body).toMatch(/const pad = fb \?/);
        expect(body).toMatch(/at \+ pad/);
        // 같은 이름의 동이 여럿이면 가장 늦은 것을 남긴다
        expect(body).toMatch(/val > prev/);
    });

    it('🔴 죽어 있던 getActivePolyline 을 되살렸다 (subCalls 는 세션에 없다)', () => {
        const fn = geo.slice(geo.indexOf('export function getActivePolyline'));
        const body = fn.slice(0, fn.indexOf('\n}'));
        expect(body).toMatch(/getActiveCalls\(session\)/);
        expect(body).not.toMatch(/subCalls/);
        expect(body).not.toMatch(/mainCallState/);
    });

    it('회랑을 만드는 자리는 **모두** 진행도를 같이 기억한다', () => {
        // 키워드만 갱신하고 진행도를 두면, 옛 경로 기준으로 멀쩡한 동이 사라진다
        for (const src of [fm, engine]) {
            const calls = (src.match(/getCorridorRegions\(/g) || []).length;
            if (calls === 0) continue;
            expect(src).toMatch(/rememberCorridorProgress/);
        }
    });

    it('🔴 제거 **로직**은 한 곳(applyTraveledTrim)뿐이고, 부르는 곳은 둘이다', () => {
        // ① 파생 계산의 끝 — 회랑을 다시 그리는 길이 여럿인데(경로 갱신·반경 변경·국면 전환)
        //    어느 길로 오든 다시 그리면 지나온 동이 되살아난다
        const derive = fm.slice(fm.indexOf('function recalculateDerivedFields'), fm.indexOf('export function trimTraveled'));
        expect(derive).toMatch(/applyTraveledTrim\(session\)/);
        // ② GPS 전용 통로
        const gps = fm.slice(fm.indexOf('export function trimTraveled'), fm.indexOf('export function rememberCorridorProgress'));
        expect(gps).toMatch(/applyTraveledTrim\(session\)/);
        // 그 둘뿐이다 — 세 번째가 생기면 순서에 따라 결과가 달라진다
        expect((fm.match(/applyTraveledTrim\(session\)/g) || []).length).toBe(2);
    });
});

/**
 * 안전 쪽으로 기운 규칙 — **일찍 빼면 잡을 수 있는 콜을 버린다.**
 */
describe('지나온 구간 제거 — 일찍 빼지 않는다', () => {

    const fn = fm.slice(fm.indexOf('export function applyTraveledTrim'), fm.indexOf('export function refreshCorridorIfNeeded') > 0 ? fm.indexOf('export function refreshCorridorIfNeeded') : undefined);
    const body = fn.slice(0, fn.indexOf('\n}\n') + 2);

    it('운행 중일 때만 뺀다 (첫짐·합짐은 아직 안 달렸다)', () => {
        expect(body).toMatch(/dispatchPhase !== 'DELIVERING'/);
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
        expect(reset).toMatch(/corridorProgressKm = null/);
    });
});

/**
 * 🔴 **같은 일을 하는 두 번째 구현을 남기지 않는다.**
 * 회랑 계산은 이 레포에서 이미 4벌로 갈라진 적이 있다.
 */
describe('옛 방식은 지웠다', () => {

    it('trimCorridorByProgress(회랑 통째 재계산)는 더 이상 없다', () => {
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
 * 도시를 안 고른 채 운행하면 **0.5km 마다 회랑이 통째로 지워진다.**
 * 빈 필터는 "제한 없음"이 아니라 **고장**이라 사냥이 조용히 멈춘다.
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
        const fn = fm.slice(fm.indexOf('export function trimTraveled'), fm.indexOf('export function rememberCorridorProgress'));
        expect(fn).not.toMatch(/recalculateDerivedFields/);
        expect(fn).not.toMatch(/updateActiveFilter/);
        expect(fn).toMatch(/broadcastFilter/);
    });
});
