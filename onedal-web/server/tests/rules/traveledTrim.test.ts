import { readFileSync } from "fs";
import { join } from "path";

const SERVER = join(__dirname, "../../src");
const read = (rel: string) => readFileSync(join(SERVER, rel), "utf8");
/** 주석을 걷어낸 코드만 — 주석이 예로 든 글자에 걸리지 않게 */
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const geo = codeOnly(read("services/geoService.ts"));
const fm = codeOnly(read("state/filterManager.ts"));
const engine = codeOnly(read("services/dispatchEngine.ts"));

/**
 * 🔴 **지나온 구간은 필터에서 뺀다** (기사님 확정)
 *
 * 기사님: *"성남을 지난 지금, 이미 지나온 광주시·성남시 콜을 계속 잡을까?
 * — 자동으로 제외. 뒤로 안 돌아가니까. 앞쪽(송파·강남)만 남는다. 이것이 맞아."*
 *
 * 이동할 때마다 **경유를 통째로 다시 그리면** 비싸다(실측 173ms).
 * 그래서 경유를 만들 때 동마다 진행도를 같이 기록하고, 이동 시에는 숫자만 비교한다(0.14ms).
 */
describe('지나온 구간 제거 — 다시 그리지 않고 숫자만 비교한다', () => {

    it('🔴 제거 **로직**은 한 곳(applyTraveledTrim)뿐이고, 부르는 곳은 둘이다', () => {
        // ① 파생 계산의 끝 · ② GPS 전용 통로 — 두 길이 실제로 빼는지는 filterListRules 가 동작으로 문다
        // 그 둘뿐이다 — 세 번째가 생기면 순서에 따라 결과가 달라진다
        expect((fm.match(/applyTraveledTrim\(session\)/g) || []).length).toBe(2);
    });
});

/**
 * 안전 쪽으로 기운 규칙 — **일찍 빼면 잡을 수 있는 콜을 버린다.**
 */
describe('지나온 구간 제거 — 일찍 빼지 않는다', () => {

    it('사이클이 끝나면(STANDBY) 진행도를 지운다 — 다음 운행에 옛 기준이 남지 않게', () => {
        const at = fm.indexOf('if (isTransitionToEmpty)');
        const reset = fm.slice(at, fm.indexOf('} else {', at));   // ⚠️ 시작 위치를 주지 않으면 앞쪽 '} else {' 를 물어 빈 조각이 된다
        expect(reset).toMatch(/detourProgressKm = null/);
    });
});

/**
 * 🔴 **같은 일을 하는 두 번째 구현을 남기지 않는다.**
 * 경유 계산을 두 벌 두면 한쪽만 고쳐져 갈라진다.
 */
describe('옛 방식은 지웠다', () => {

    it('trimCorridorByProgress(경유 통째 재계산)는 더 이상 없다', () => {
        expect(geo).not.toMatch(/export function trimCorridorByProgress/);
        // 부르는 곳도 없다
        expect(codeOnly(read('routes/scrap.ts'))).not.toMatch(/trimCorridorByProgress/);
    });
});

/**
 * 🔴 **GPS 경로는 필터 변경 통로를 쓰지 않는다.**
 *
 * `applyFilterCb(userId, {})` 로 파생 재계산을 트리거하지 않고 전용 통로(`trimTraveled`)를 쓴다.
 * `recalculateDerivedFields` 안에 *"도착 도시가 비어 있으면 키워드를 지운다"* 는 가지가 있어,
 * 도시를 안 고른 채 운행하면 **0.5km 마다 경유이 통째로 지워진다.**
 * 빈 필터는 "제한 없음"이 아니라 **고장**이라 콜 잡기가 조용히 멈춘다.
 */
describe('GPS 경로는 전용 통로로 간다', () => {

    const handlers = codeOnly(read('socket/socketHandlers.ts'));

    it('전용 콜백을 따로 받는다 (필터 변경과 인자가 다르다)', () => {
        /* GPS 틱이 전용 통로(trimTraveledCb)를 부르는지는 geoRules «지나온 곳 빼기»가 동작으로 문다 */
        expect(handlers).toMatch(/trimTraveled\(uid, io\)/);
    });
});

/**
 * 🔴 **"운행 중"은 정류장에서 풀리지 않는다** (기사님 신고)
 *
 * 기사님: *"이동중인데 필터 값이 변경되지 않았어."*
 *
 * 도착 감지가 `driverAction = UNLOADING` 을 켤 때 `dispatchPhase` 가 GATHERING 으로 떨어지면
 * **증상 넷이 한꺼번에** 난다 — 지나온 구간 제거 정지 · 우회 0 이 풀려 경유가 넓어짐 ·
 * 🚀 출발 버튼 재등장 · 요약줄이 "대기". 전부 판정 한 줄에서 나온다.
 */
describe('운행 중 — 출발한 사실에서 나온다', () => {

    const store = codeOnly(read('state/userSessionStore.ts'));
    const client = codeOnly(readFileSync(join(__dirname, '../../../client-app/src/components/stage/StageView.tsx'), 'utf8'));

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

    /**
     * 🔴 **«🚀 지금 출발» 버튼 블록만 본다.** 같은 `updateFilter({ driverAction: 'DRIVING' })` 를
     *    **자동 주행 감지**도 부르고 그쪽이 파일에서 먼저 나온다 — 첫 등장을 집으면
     *    버튼은 한 글자도 안 물면서 초록불이 된다.
     */
    const departButton = () => {
        const i = client.indexOf("dispatchPhase !== 'DELIVERING'");
        return i < 0 ? '' : client.slice(i, i + 900);
    };

    it('🚀 버튼이 우회 반경을 직접 정하지 않는다 (운행중 국면 설정이 준다)', () => {
        const b = departButton();
        // 🔴 먼저 «정말 그 버튼을 집었나» — 빈 문자열은 무엇이든 통과시킨다
        expect(b).toMatch(/updateFilter\(\{ driverAction: 'DRIVING'/);
        expect(b).not.toMatch(/detourRadiusKm/);
    });
});
