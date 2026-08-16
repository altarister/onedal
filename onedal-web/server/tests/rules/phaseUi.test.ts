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
 * 🔴 국면별 필터 설정 — 관제웹 (docs/필터_재설계_명세.md §2-4)
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
        expect(fn).toMatch(/destinationKeywords = regions\.destinationKeywords/);
        expect(fn).toMatch(/destinationGroups = regions\.destinationGroups/);
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
        // dispatchEngine 에 남은 getDetourRegions 호출은 syncDetourFilter(지나온 구간 잘라내기)
        // 하나뿐이다. 그건 "경로가 바뀌었을 때"의 자동 갱신이라 목적이 다르다 —
        // 늘어나면(2개 이상) 경유 계산이 또 갈라지기 시작한 것이다.
        const engine = codeOnly(read(join(SERVER, 'services/dispatchEngine.ts')));
        expect((engine.match(/getDetourRegions\(/g) || []).length).toBe(1);
    });
});
