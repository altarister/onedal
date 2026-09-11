import { readFileSync } from "fs";
import { join } from "path";

const CLIENT = join(__dirname, "../../../client-app/src");
const SERVER = join(__dirname, "../../src");

const read = (abs: string) => readFileSync(abs, "utf8");
/** 주석을 걷어낸 코드만 — 주석의 역사 기록에 걸리지 않게 */
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const modal = codeOnly(read(join(CLIENT, "components/dashboard/OrderFilterModal.tsx")));
const hook = codeOnly(read(join(CLIENT, "hooks/useFilterConfig.ts")));
const fm = codeOnly(read(join(SERVER, "state/filterManager.ts")));
const handlers = codeOnly(read(join(SERVER, "socket/socketHandlers.ts")));

/**
 * 🔴 국면별 필터 설정 — 관제웹 (docs/지금/필터.md §3)
 *
 * 기사님: *"모든 탭마다 키를 가지고 있고 **탭마다 디스플레이만 달리해서** 숨기고 노출하면 될 듯."*
 *
 * 이 화면에서 가장 위험한 것은 **표시 규칙을 화면이 또 갖는 것**이다.
 * `PHASE_FIELDS` 와 화면의 `if (tab === ...)` 가 갈라지면, 표에는 보인다고 적혀 있는데
 * 화면에는 없는 칸이 생긴다 — 그리고 아무도 모른다.
 */
describe('국면별 설정 — 화면은 표를 읽는다', () => {

    it('🔴 필드 표시는 PHASE_FIELDS 에서 읽는다 (화면이 규칙을 또 갖지 않는다)', () => {
        expect(modal).toMatch(/PHASE_FIELDS\[tab\]/);
        expect(modal).toMatch(/mode === 'hidden'/);
        expect(modal).toMatch(/mode === 'auto'/);
    });

    it('🔴 탭 목록·라벨은 shared 에서 온다 (여기에 또 적으면 한쪽만 고쳐진다)', () => {
        expect(modal).toMatch(/const TABS = PHASE_KEYS/);
        expect(modal).toMatch(/PHASE_LABEL\[key\]/);
        // 다섯 국면을 손으로 나열한 배열이 남아 있지 않다
        expect(modal).not.toMatch(/key:\s*'first',\s*label:/);
    });

    it('🔴 "지금 국면" 판정은 resolvePhaseKey 하나로 한다', () => {
        expect(modal).toMatch(/resolvePhaseKey\(/);
        // 예전처럼 isSharedMode·driverAction 으로 국면을 직접 유추하지 않는다
        expect(modal).not.toMatch(/driverAction === 'DRIVING' \? 'drive'/);
    });

    it('🔴 폼은 국면별 저장값에서 채운다 (평면 필터에서 채우면 다섯 탭이 같은 값이 된다)', () => {
        expect(modal).toMatch(/if \(phaseSettings\) setForms\(mapToForm\(phaseSettings\)\)/);
    });

    it('🔴 고친 탭만 저장한다 — 저장 버튼 하나가 다섯 국면을 덮지 않는다', () => {
        const save = modal.slice(modal.indexOf('const handleSave'), modal.indexOf('const isSharedMode'));
        expect(save).toMatch(/for \(const key of dirtyTabs\)/);
        expect(save).toMatch(/savePhase\(key,/);
    });

    it('빈 입력은 0 이 아니라 **이전 값**이다 (0 이면 "제한 없음"으로 뒤집힌다)', () => {
        const toSettings = modal.slice(modal.indexOf('const toSettings'), modal.indexOf('const mapToForm'));
        expect(toSettings).toMatch(/Number\.isFinite\(n\) \? n : fallback/);
    });

    it('국면 저장은 전용 통로로 간다 — 평면(update-filter)으로 보내면 어느 탭인지 사라진다', () => {
        expect(hook).toMatch(/socket\.emit\("save-phase-settings", \{ phase, settings, saveAsDefault \}\)/);
        expect(handlers).toMatch(/safeOn\(socket, "save-phase-settings"/);
    });

    it('🔴 서버는 모르는 국면 키를 받으면 무시한다 (엉뚱한 자리에 저장하지 않는다)', () => {
        const h = handlers.slice(handlers.indexOf('"save-phase-settings"'));
        expect(h.slice(0, 600)).toMatch(/PHASE_KEYS\.includes/);
    });

    it('filter-init / filter-updated 가 국면 설정을 함께 싣는다 (화면이 채울 근거)', () => {
        expect(fm).toMatch(/phaseSettings: session\.phaseSettings/);
        expect(handlers).toMatch(/phaseSettings: session\.phaseSettings/);
    });
});

/**
 * 📐 **마름모의 모양은 국면 밖 한 벌이다** (이식 C3-2 · 2026-09-11 · 명세 §3).
 *
 * 🔴 **하루 만에 자리를 옮겼다.** 아침(C3-1)에는 국면 행에 파고 «첫짐에서 상속»으로 가렸다.
 *    그런데 다섯 행에 값이 계속 써지는 구조가 남아, 기사님이 첫짐을 120°/140°/35km 로
 *    저장하신 직후 **합짐 행에는 110/110/25 가 앉아 있었다** — 화면은 「자동 · 첫짐에서 120°」
 *    라고 적으면서. 상속으로 가리는 대신 **자리를 하나로** 만든 이유다 (규칙 ③).
 *
 * 근거는 기사님 확정 2026-09-09: *"모두 꺼내 두고 노선이면 라인값을 사용하고 동선이면
 * 사용 안 하면 되니까."* — 다섯 벌이 하던 일은 «값을 여러 벌 두는 것»이 아니라
 * **«지금 안 쓰는 칸을 감추는 것»**이었고, 감추는 일은 `PHASE_FIELDS` 가 계속 한다.
 */
describe('마름모 모양 — 국면 밖 한 벌', () => {

    const { PHASE_FIELDS, PHASE_KEYS, FILTER_FIELDS, QUAD_FIELDS,
            DEFAULT_QUAD_SHAPE, QUAD_SHAPE_KEYS } = require("@onedal/shared");

    it('🔴 국면 그릇에 마름모가 없다 — 있으면 국면마다 다른 값이 앉는다', () => {
        for (const phase of PHASE_KEYS) {
            for (const f of QUAD_SHAPE_KEYS) {
                expect(`${phase}: ${f}`).toBe(`${phase}: ${PHASE_FIELDS[phase][f] === undefined ? f : '국면 그릇에 남아 있다'}`);
            }
        }
        // 국면 표(FILTER_FIELDS)에도 없다 — 그 표가 `user_filter_phases` 의 컬럼을 만든다
        for (const f of QUAD_SHAPE_KEYS) {
            expect(FILTER_FIELDS.find((x: any) => x.path === f)).toBeUndefined();
        }
    });

    it('🔴 마름모는 제 표(QUAD_FIELDS)를 갖는다 — 라벨·단위·범위의 원천 하나', () => {
        expect(QUAD_FIELDS.map((f: any) => f.path).sort()).toEqual([...QUAD_SHAPE_KEYS].sort());
        expect(QUAD_FIELDS.map((f: any) => f.col)).toEqual(['src_angle_deg', 'dst_angle_deg', 'quad_radius_km']);
        // 각도는 ° · 반경은 km — 화면이 단위를 또 적지 않게
        expect(QUAD_FIELDS.find((f: any) => f.path === 'srcAngleDeg').unit).toBe('°');
        expect(QUAD_FIELDS.find((f: any) => f.path === 'quadRadiusKm').unit).toBe('km');
        expect(DEFAULT_QUAD_SHAPE).toEqual({ srcAngleDeg: 110, dstAngleDeg: 110, quadRadiusKm: 25 });
    });

    it('🔴 «첫짐에서 상속»은 없어졌다 — 자리가 하나면 상속할 것이 없다', () => {
        const shared = require("@onedal/shared");
        expect(shared.quadShapeOf).toBeUndefined();
        const stage = codeOnly(read(join(CLIENT, 'components/stage/StageView.tsx')));
        expect(stage).not.toMatch(/quadShapeOf/);
        expect(modal).not.toMatch(/quadShapeOf/);
    });

    it('🔴 지도는 평면 필터에서 모양을 읽는다 (국면 그릇을 안 본다)', () => {
        const stage = codeOnly(read(join(CLIENT, 'components/stage/StageView.tsx')));
        expect(stage).toMatch(/filter\?\.srcAngleDeg/);
        expect(stage).not.toMatch(/phaseSettings\[/);
    });

    it('🔴 화면의 마름모 칸은 국면 탭 **밖**에 산다 (탭 안이면 «이 국면의 값»으로 읽힌다)', () => {
        // 국면 그리드가 그리는 목록에 없다
        const geo = modal.slice(modal.indexOf('const GEO_FIELDS'), modal.indexOf('const GEO_FIELDS') + 400);
        for (const f of QUAD_SHAPE_KEYS) expect(geo).not.toContain(`'${f}'`);
        // 대신 제 표로 그린다
        expect(modal).toMatch(/QUAD_FIELDS\.map/);
    });

    /**
     * 🔴 **`savePhase` 에 섞으면 다시 국면마다 한 벌씩 앉는다** — 그게 아침에 갈라진 이유다.
     *    값 이름을 여기서 또 적지 않고 `quadShapeFrom` 으로 통째 넘긴다 (규칙 ③).
     */
    it('🔴 저장은 평면 통로로 간다 — 국면 저장(savePhase)에 섞지 않는다', () => {
        const save = modal.slice(modal.indexOf('const handleSave'), modal.indexOf('const isSharedMode'));
        expect(save).toMatch(/if \(quadDirty\) updateFilter\(quadShapeFrom\(quadForm\)/);
        // 국면 저장 고리 안에 마름모가 섞여 있지 않다
        const loop = save.slice(save.indexOf('for (const key of dirtyTabs)'), save.indexOf('if (quadDirty)'));
        for (const f of QUAD_SHAPE_KEYS) expect(loop).not.toContain(f);
    });

    it('🔴 DB 자리는 user_filters 다 — 표에서 컬럼을 뽑는다 (손 나열 금지)', () => {
        const db = codeOnly(read(join(SERVER, 'db.ts')));
        expect(db).toMatch(/QUAD_FIELDS\.map/);
        expect(db).not.toMatch(/src_angle_deg\s+INTEGER/);
    });

    /**
     * 🔴 **단위를 화면이 또 갖지 않는다** (규칙 ③).
     * 숫자 칸은 오래 `KM` 이 박혀 있었다 — 칸이 전부 km 였으니 맞는 말이었다.
     * 각도가 들어오면서 틀린 말이 됐다: 출발각 110 옆에 **KM** 이 붙었다.
     */
    it('🔴 칸 옆 단위는 표에서 읽는다 — 두 그리드 어디에도 KM 을 박지 않는다', () => {
        const geoGrid = modal.slice(modal.indexOf('GEO_FIELDS.map'), modal.indexOf("shown.pickupRadiusKm === 'input'"));
        expect(geoGrid).not.toMatch(/>KM</);
        /* 🔴 `QUAD_FIELDS.map` 은 폼 초기화에도 나온다 — **그리는 쪽**을 집는다 */
        const quadGrid = modal.slice(modal.indexOf('QUAD_FIELDS.map(f => ('));
        expect(quadGrid.slice(0, 1200)).not.toMatch(/>KM</);
        // 각 그리드가 제 표의 unit 을 읽는다
        expect(geoGrid).toMatch(/FILTER_FIELDS\.find/);
        expect(quadGrid.slice(0, 1200)).toMatch(/f\.unit/);
    });
});

/**
 * 🔴 **국면 전환의 입구는 하나다** (명세 §4-2).
 *
 * 팝업 탭 안에 `🏘️ 이 동네에서 찾기로 전환` · `🏠 복귀행으로 전환` 을 넣었다가 뺐다.
 * 명세가 이미 *"팝업에서 삭제된 것 … 🚀 출발·🏠 복귀 전환 버튼(→ 메인)"* 이라고
 * 정해 뒀는데 어긴 것이다. 실제 해악도 둘이었다.
 *   ① 요약줄 버튼에는 confirm 이 있는데 팝업 버튼에는 없어서, 기사님이
 *      *"필터가 쉽게 바뀌면 오작동"* 이라며 넣은 확인 절차를 우회했다
 *   ② 전환 버튼이 `onClose()` 를 불러 **저장 안 한 값을 조용히 버렸다** —
 *      반경을 고치고 전환하면 화면의 숫자와 실제 콜 잡기 기준이 달라진다
 */
describe('국면 전환 — 입구는 요약줄 하나', () => {

    const status = codeOnly(read(join(CLIENT, 'components/dashboard/OrderFilterStatus.tsx')));

    it('🔴 필터 팝업은 국면을 전환하지 않는다', () => {
        expect(modal).not.toMatch(/set-call-target/);
    });

    it('요약줄만 전환한다 — 그리고 확인창을 띄운다', () => {
        expect(status).toMatch(/set-call-target/);
        expect(status).toMatch(/confirm\(/);
    });

    it('귀가콜은 전환이 아니라 오더 생성이라 팝업에 남는다', () => {
        // 뺄 거면 다른 입구를 먼저 만들어야 한다 — 지금은 여기가 유일하다
        expect(modal).toMatch(/create-home-return/);
    });
});

/**
 * 🔴 **반경의 원천은 국면 설정 하나다.**
 *
 * 2026-08-14 `pnpm scenario` 가 잡은 결함: 첫짐 하차 7km 를 저장해 두고 관내에 갔다 오면
 * **평소값 1km 로 덮여 있었다.** `setCallTarget` 가 `baseFilter.destinationRadiusKm` 를
 * 같이 실어 보냈고, 그 값은 `changes` 에 있으므로 "기사님이 방금 고친 값" 으로 보호까지 받았다.
 * 원천이 둘이면 늘 이렇게 끝난다.
 */
describe('국면 전환 — 반경은 국면 설정만이 정한다', () => {

    const engine = codeOnly(read(join(SERVER, 'services/dispatchEngine.ts')));
    const fn = engine.slice(engine.indexOf('export async function setCallTarget'));
    const body = fn.slice(0, fn.indexOf('\nexport '));

    it('🔴 setCallTarget 는 destinationRadiusKm 를 보내지 않는다', () => {
        expect(body).not.toMatch(/destinationRadiusKm:/);
        expect(body).not.toMatch(/baseFilter\.destinationRadiusKm/);
    });

    it('국면 전환은 "어디로 가는가"만 정한다 (도시 · callTarget)', () => {
        expect(body).toMatch(/callTarget: phase/);
        expect(body).toMatch(/destinationCity: city!/);
    });

    it('첫짐으로 돌아갈 때의 도시는 첫짐 국면이 기억한 것이 먼저다', () => {
        expect(body).toMatch(/phaseSettings\.first\.destinationCity/);
    });

    it('🔴 반경이 바뀌면 지역 목록도 다시 그린다 (안 그리면 옛 목록으로 거른다)', () => {
        const apply = fm.slice(fm.indexOf('function applyPhaseSettingsIfChanged'), fm.indexOf('export function savePhaseSettings'));
        expect(apply).toMatch(/geoChanged/);
        expect(apply).toMatch(/recalculateDerivedFields\(session, \{/);
        // 재진입은 금지 — 파생 계산만 다시 부른다
        expect(apply).not.toMatch(/updateActiveFilter\(/);
    });
});

/**
 * 🔴 경유은 **반경이 바뀌면 다시 그려야 한다.**
 *
 * 숫자만 바꾸고 지역 목록을 그대로 두면 "경유 5km" 라고 적힌 채 옛 1km 목록으로 거른다.
 * 조용히 틀리는 종류라 눈치채기까지 오래 걸린다.
 */
describe('경유 갱신 — 구현은 하나여야 한다', () => {

    it('국면 저장·국면 전환 둘 다 경유을 다시 그린다', () => {
        const save = fm.slice(fm.indexOf('export function savePhaseSettings'), fm.indexOf('export const recalculateDetourFilter'));
        expect(save).toMatch(/refreshDetourIfNeeded/);

        const apply = fm.slice(fm.indexOf('function applyPhaseSettingsIfChanged'));
        expect(apply.slice(0, 2000)).toMatch(/refreshDetourIfNeeded/);
    });

    it('반경이 그대로면 다시 그리지 않는다 (지리 연산은 CPU ~7초짜리다)', () => {
        const fn = fm.slice(fm.indexOf('function refreshDetourIfNeeded'), fm.indexOf('function applyPhaseSettingsIfChanged'));
        expect(fn).toMatch(/before\.detourRadiusKm/);
        expect(fn).toMatch(/return/);
    });

    it('🔴 경로가 없으면 아무것도 넣지 않는다 (없는 값을 지어내지 않는다)', () => {
        const fn = fm.slice(fm.indexOf('function refreshDetourIfNeeded'), fm.indexOf('function applyPhaseSettingsIfChanged'));
        expect(fn).toMatch(/if \(!regions\) return/);
    });

    it('🔴 셋을 한 벌로 넣는다 — 별칭이 빠지면 앱의 2단계 필터가 조용히 꺼진다', () => {
        const fn = fm.slice(fm.indexOf('function refreshDetourIfNeeded'), fm.indexOf('function applyPhaseSettingsIfChanged'));
        /* 🚫 앞 둘은 제외를 뺀 `kept` 에서 온다 (이식 C2) — 셋이 **함께** 들어간다는 것이 요점이다 */
        expect(fn).toMatch(/destinationKeywords = kept\.flat/);
        expect(fn).toMatch(/destinationGroups = kept\.grouped/);
        expect(fn).toMatch(/customCityFilters = regions\.customCityFilters/);
    });

    it('🔴 recalculateDetourFilter 의 구현은 하나다 — dispatchEngine 은 다시 내보내기만 한다', () => {
        const engine = codeOnly(read(join(SERVER, 'services/dispatchEngine.ts')));
        expect(engine).toMatch(/export \{ recalculateDetourFilter \} from "\.\.\/state\/filterManager"/);
        expect(engine).not.toMatch(/export const recalculateDetourFilter/);
        // 부르는 쪽(소켓·설정 라우트)은 여전히 하나의 구현을 본다
        expect(handlers).toMatch(/recalculateDetourFilter\(/);
    });

    it('경유을 부르는 자리가 늘어나도 계산은 filterManager 한 곳이다', () => {
        /**
         * 🔴 **0 이다** (2026-08-25). 예전엔 `syncDetourFilter` 가 자기 몫으로 하나를
         *    들고 있었고, 이 검사도 *"하나뿐"* 으로 그걸 허용했다. 그러다 도착 목표
         *    상속을 넣자 **한쪽만 고쳐졌고**, 출발하는 순간 다른 쪽이 돌면서
         *    131개 → **27개** 로 되돌렸다 (실측 12:35:50).
         *    "목적이 다르니 하나는 괜찮다"가 정확히 갈라짐의 시작이었다.
         */
        const engine = codeOnly(read(join(SERVER, 'services/dispatchEngine.ts')));
        expect((engine.match(/getDetourRegions\(/g) || []).length).toBe(0);
    });
});

/**
 * 🚫 **제외 지역 — 국면 밖 한 벌** (이식 C2 · 2026-09-11 · 명세 §3).
 *
 * *"거긴 안 간다"* 는 그 지역이지 그 국면의 사정이 아니다. 마름모와 같은 자리에 산다.
 * 걸러지는 곳은 **`destinationKeywords` 를 만들 때** — 그래서 앱은 제외를 몰라도 된다.
 */
describe('제외 지역 — 국면 밖 한 벌, 빼는 자리는 하나', () => {

    const fm2 = codeOnly(read(join(SERVER, 'state/filterManager.ts')));

    it('🔴 DB 자리는 user_filters 다 (국면 행이 아니다)', () => {
        const db = codeOnly(read(join(SERVER, 'db.ts')));
        const table = db.slice(db.indexOf('CREATE TABLE IF NOT EXISTS user_filters'), db.indexOf('CREATE TABLE IF NOT EXISTS user_filter_phases'));
        expect(table).toMatch(/excluded_regions/);
        const { FILTER_FIELDS } = require("@onedal/shared");
        expect(FILTER_FIELDS.find((f: any) => f.col === 'excluded_regions')).toBeUndefined();
    });

    it('🔴 평면 DTO 에 칸이 있다 — 관제웹이 읽고 고칠 자리', () => {
        const dto = codeOnly(readFileSync(join(__dirname, '../../../shared/src/index.ts'), 'utf8'));
        expect(dto).toMatch(/excludedRegions\?: string\[\]/);
    });

    /**
     * 🔴 **빼는 자리가 둘이면 갈라진다.** 서버는 지역 목록을 두 길로 만든다 —
     *    도시 둘레(`getCityRegionsWithRadius`)와 경로 주변(`getDetourRegions`).
     *    둘 다 `pruneExcludedRegions` 를 거쳐야 한다. 한쪽만 거치면
     *    «첫짐에선 빠지는데 합짐에선 들어온다» 가 된다.
     */
    it('🔴 두 파생 길이 모두 pruneExcludedRegions 를 거친다', () => {
        expect((fm2.match(/pruneExcludedRegions\(/g) || []).length).toBeGreaterThanOrEqual(2);
    });

    it('🔴 판별 규칙을 서버가 또 쓰지 않는다 (shared 함수 하나로만)', () => {
        // `S|`·`R|`·`D|` 키 문법을 서버가 직접 뜯어보면 그 순간 규칙이 두 벌이다
        expect(fm2).not.toMatch(/startsWith\('[SRD]\|'\)/);
        expect(fm2).not.toMatch(/`D\|\$\{/);
    });

    /**
     * 🔴 **제외를 고쳐도 목록이 안 줄면 화면이 거짓말한다** (2026-09-11 실측).
     *
     * 지리 연산은 무거워서 «도시·반경이 바뀔 때만» 다시 돈다. 제외 지역은 그 조건에 없어서,
     * 서울을 통째로 빼고 저장했는데 **「도착목표 298개 동」이 그대로였다.** DB 에는 남았고
     * 화면 칩도 생겼는데 판정이 쓰는 목록만 옛것이었다 — 규칙 ⑤-4 ④ 가 금지하는 모양이다.
     */
    it('🔴 제외 지역이 바뀌면 지역 목록을 다시 만든다 — 두 길 모두', () => {
        // ① 도시 둘레 (첫짐)
        const geoCond = fm2.slice(fm2.indexOf('const needsGeoRecalc'), fm2.indexOf('const needsGeoRecalc') + 500);
        expect(geoCond).toMatch(/'excludedRegions' in changes/);
        // ② 경로 주변 (합짐) — 반경만 보면 «첫짐엔 빠지는데 합짐엔 들어온다» 가 된다
        const detour = fm2.slice(fm2.indexOf('function refreshDetourIfNeeded'), fm2.indexOf('function applyPhaseSettingsIfChanged'));
        expect(detour).toMatch(/exBefore === exNow/);
    });

    it('🔴 화면에 고칠 자리가 있다 — 그릇만 파고 안 띄우면 기사님은 못 고치신다', () => {
        // 3단(도·시군구·읍면동) 전부 — 도 층이 없으면 서울을 빼려고 구 25개를 눌러야 한다
        expect(modal).toMatch(/sidoList\(\)/);
        expect(modal).toMatch(/sggList\(exSido\)/);
        expect(modal).toMatch(/dongList\(exSgg\)/);
        // 지금 무엇이 빠져 있나는 늘 보인다 (레이어를 열어야 알면 화면이 거짓말한다)
        expect(modal).toMatch(/excludedLabel\(k\)/);
    });

    /**
     * 🔴 **고르기 칸은 목업과 같은 부품이다** — 손맛이 갈리면 두 화면이 다른 물건이 된다.
     *    `JudgmentSeat` 을 목업이 **부르는** 것과 같은 이유다 (규칙 ③).
     */
    it('🔴 PickLayer 는 한 벌 — 실물도 목업도 같은 파일을 부른다', () => {
        expect(modal).toMatch(/from "\.\.\/ui\/PickLayer"/);
        const lab = codeOnly(read(join(CLIENT, 'pages/MapMockup.tsx')));
        expect(lab).toMatch(/from '\.\.\/components\/ui\/PickLayer'/);
        // 목업 안에 사본이 남아 있지 않다
        expect(lab).not.toMatch(/function PickLayer\(/);
        expect(lab).not.toMatch(/function useCloseOnOutside\(/);
    });

    it('제외 지역은 앱에 안 내려간다 — 서버가 목록에서 이미 뺐다 (명세 §3)', () => {
        const scrap = codeOnly(read(join(SERVER, 'routes/scrap.ts')));
        const strip = scrap.slice(scrap.indexOf('...appFilter } = session.activeFilter') - 600, scrap.indexOf('...appFilter } = session.activeFilter'));
        expect(strip).toMatch(/excludedRegions/);
    });
});

/**
 * 🕸️ **그물 계산은 한 벌이다** (이식 C1-2 · 2026-09-11 · 명세 §5).
 *
 * 기사님 확정: **«실험실 것으로 통일»**. 그 전까지 서버는 제 계산(`geoService` 의 turf
 * 폴리곤 버퍼)을 따로 썼고 **화면과 판정이 다른 답을 냈다** — 파주 조건 일치율 11%.
 * 「화면은 든다는데 판정은 탈락」이 거기서 났다 (규칙 ⑤-3 — 색이 곧 결정).
 *
 * 🔴 **`destinationKeywords` 는 «하차지가 내 그물 안인가» 하나를 답한다**
 *    (앱 `InsungParser.kt` 의 `anyHit(pureDropoffText, …)`). 실험실의 `dropIn` 과 같은
 *    질문이라 맞물린다 (규칙 ⑤-4 ⑤ — 읽는 곳을 먼저 확정했다).
 */
describe('그물 계산 — 서버도 실험실 것을 쓴다 (이식 C1-2)', () => {

    const fm3 = codeOnly(read(join(SERVER, 'state/filterManager.ts')));

    it('🔴 서버가 shared 의 그물 계산을 부른다', () => {
        expect(fm3).toMatch(/netForGoal\(/);
        expect(fm3).toMatch(/cityCenter\(/);
    });

    /**
     * 🔴 **내 위치를 모르면 옛 방식으로 물러선다** — 첫짐 그물은 내 위치가 꼭짓점이라
     *    없으면 못 그린다. **빈 목록은 «제한 없음»이 아니라 고장**이다 (규칙 ④).
     */
    it('🔴 내 위치가 없으면 도시 둘레로 물러선다 (비우지 않는다)', () => {
        const fn = fm3.slice(fm3.indexOf('function netKeywordsOf'), fm3.indexOf('function netKeywordsOf') + 1400);
        expect(fn).toMatch(/driverLocation/);
        expect(fn).toMatch(/getCityRegionsWithRadius/);   // 물러설 자리
    });

    it('🔴 마름모 모양은 평면 필터에서 온다 — 화면이 그리는 그 값이다', () => {
        const fn = fm3.slice(fm3.indexOf('function netKeywordsOf'), fm3.indexOf('function netKeywordsOf') + 1400);
        expect(fn).toMatch(/quadShapeFrom\(/);
    });

    it('🔴 제외 지역은 여전히 pruneExcludedRegions 한 곳이 뺀다', () => {
        // 그물로 바꿔도 빼는 자리는 안 늘어난다 (규칙 ③)
        expect((fm3.match(/pruneExcludedRegions\(/g) || []).length).toBeGreaterThanOrEqual(2);
    });
});
