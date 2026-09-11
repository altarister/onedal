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
const engine = codeOnly(read(join(SERVER, "services/dispatchEngine.ts")));
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

    /**
     * 🔴 **국면 탭을 걷었다** (이식 C3-3a · 기사님 확정 2026-09-11 저녁 *"그 기준은 바꿔"*).
     *
     * 보류의 근거는 «기사님이 국면마다 다르게 쓰신다»는 관찰이었는데, 기사님은 그 관찰이
     * 아니라 **기준 자체를 바꾸라**고 하셨다. 2026-09-09 에 목업이 먼저 간 길이다 —
     * *"이제 우리에게 국면이라는 것이 없어진 것 같은데.. 원칙이 바뀐 거 아냐?"*
     *
     * 🔴 **다섯 벌이 하던 일은 «값을 여러 벌 두는 것»이 아니라 «지금 안 쓰는 칸을 감추는
     *    것»이었다** (기사님 2026-09-09: *"모두 꺼내 두고 노선이면 라인값을 사용하고
     *    동선이면 사용 안 하면 되니까"*). 감추는 것을 그만두고 **다 꺼내 둔다.**
     */
    it('🔴 국면 탭이 없다 — 다섯 탭을 그리지 않는다', () => {
        expect(modal).not.toMatch(/const TABS = PHASE_KEYS/);
        expect(modal).not.toMatch(/TABS\.map\(/);
        expect(modal).not.toMatch(/setTab\(/);
    });

    /**
     * 🔴 **`PHASE_FIELDS` 는 남지만 하는 일이 바뀌었다** — «감춘다»에서 «흐리게 한다»로.
     *
     * 표 자체는 여전히 «그 상황에서 이 칸이 쓰이나»의 유일한 원천이다 (규칙 ③).
     * 달라진 것은 그 답으로 **무엇을 하느냐**다: 감추면 «이 값이 어디 갔나»가 되고,
     * 그냥 두면 «지금 쓰이는 값»으로 읽힌다. 목업은 흐리게 해서 둘 다 피한다.
     */
    it('🔴 «안 쓰이는 칸»을 감추지 않는다 — 표는 흐리게 하는 데만 쓴다', () => {
        expect(modal).not.toMatch(/mode === 'hidden'/);
        expect(modal).not.toMatch(/if \(mode === 'auto'\)/);
        // 표를 읽되, 그 답이 dim 으로 간다
        expect(modal).toMatch(/PHASE_FIELDS\[/);
        expect(modal).toMatch(/dim:/);
    });

    /**
     * 🔴 **«지금 무엇을 하나»는 남는다** (기사님 2026-09-09 가 남기라고 한 둘 중 하나).
     *    탭이 사라진 것은 «값이 국면마다 다르다»이지 «지금 뭘 하는지 몰라도 된다»가 아니다.
     */
    /**
     * 🔴 **늘 참인 말은 화면에 안 적는다** (기사님 판단 2026-09-11: 머리줄 넷을 짚으시며
     *    *"이것이 필요한건지 판단해"*).
     *
     *   · «필터 설정»    요약줄을 눌러 연 것이라 **자명하다**
     *   · «오늘 콜 잡기» 아래 저장 버튼 셋(평소값·오늘만·계속)이 **더 정확히** 말한다
     *   · «합짐 중»      **요약줄이 이미** «합짐 탐색중»이라고 말한다 — 열면 또 적는 중복
     *
     * 🔴 «지금 무엇을 하나»가 사라진 것이 아니다 — **요약줄이 그 일을 한다.**
     *    한 화면에 같은 말이 두 번 있으면 그게 거짓말이 될 자리를 만든다 (규칙 ③).
     */
    it('🔴 머리줄에 늘 참인 말이 없다 (요약줄이 이미 말한다)', () => {
        expect(modal).not.toMatch(/필터 설정/);
        expect(modal).not.toMatch(/오늘 콜 잡기/);
        expect(modal).not.toMatch(/\{PHASE_LABEL\[tab\]\} 중/);
        // 다섯 국면을 손으로 나열한 배열도 없다
        expect(modal).not.toMatch(/key:\s*'first',\s*label:/);
    });

    /** 🔴 닫는 길은 남는다 — 팝업이 아니라 «바깥 누르기»가 없다 */
    it('🔴 닫는 ✕ 가 남아 있다', () => {
        expect(modal).toMatch(/onClick=\{onClose\}/);
        expect(modal).toMatch(/✕/);
    });

    /** 🔴 폼이 하나다 — 국면마다 따로 두면 그것이 곧 다섯 벌이다 */
    it('🔴 값은 한 벌이다 — 국면별 폼 묶음이 없다', () => {
        expect(modal).not.toMatch(/const \[forms, setForms\]/);
        expect(modal).not.toMatch(/forms\[tab\]/);
        expect(modal).not.toMatch(/dirtyTabs/);
    });

    /**
     * 🔴 **저장은 다섯 행에 «같은 값»을 쓴다 — 그게 한 벌이다** (C3-3a 의 전환 모양).
     *
     * ⚠️ 그릇(`user_filter_phases` 다섯 행)은 **아직 그대로다.** 다섯이 늘 같은 값이면
     *    국면이 바뀌어도 평면 필터의 숫자 넷이 안 움직여 **동작이 한 벌과 같아진다.**
     *    행을 실제로 걷어내는 것은 C3-3b — 서버 19곳·검사 8개라 따로 선다.
     *
     * 🔴 `destinationCity` 는 **첫짐에만** 간다. 실측해 보니 이미 첫짐 한 곳이 원천이고
     *    (나머지 넷은 `auto`/`override`), 합짐·주행중의 목적지는 서버가 경로에서 파생한다.
     *    다섯 행에 같이 쓰면 관내(`override`)가 그 값으로 덮여 자동 파생이 죽는다.
     */
    it('🔴 저장은 다섯 국면 전부에 같은 값을 쓴다 (전환 단계 — 그릇은 C3-3b 에서)', () => {
        const save = modal.slice(modal.indexOf('const handleSave'), modal.indexOf('const slotsUsed'));
        expect(save).toMatch(/for \(const key of PHASE_KEYS\)/);
        expect(save).toMatch(/savePhase\(key,/);
        // 고친 탭만 고르던 옛 방식이 남아 있지 않다
        expect(save).not.toMatch(/dirtyTabs/);
    });

    it('🔴 목적지는 첫짐 행에만 간다 (관내의 자동 파생을 덮지 않게)', () => {
        const save = modal.slice(modal.indexOf('const handleSave'), modal.indexOf('const slotsUsed'));
        // 첫짐이 아닌 행은 **제 값을 그대로 지킨다** (서버가 파생한 것을 덮지 않는다)
        expect(save).toMatch(/key !== 'first'\) next\.destinationCity = prev\.destinationCity/);
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

    /**
     * ⚠️ **탭이 사라지며 이 검사의 뜻이 옮겨 갔다** (C3-3a). 전에는 «국면 그리드 목록에
     *    마름모가 없다»를 봤는데, 국면 그리드 자체가 없어졌다. 지금 지키는 것은
     *    **마름모가 제 표로만 그려진다**는 것이다 — 국면 값 묶음에 섞이면 다시 다섯 벌이 된다.
     */
    it('🔴 화면의 마름모는 제 표(QUAD_FIELDS)로만 그린다', () => {
        expect(modal).toMatch(/QUAD_FIELDS\.map/);
        // 국면 값 묶음(PHASE_FIELDS/FILTER_FIELDS)에 마름모가 섞이지 않았다
        const { FILTER_FIELDS } = require("@onedal/shared");
        for (const f of QUAD_SHAPE_KEYS) {
            expect(FILTER_FIELDS.some((x: any) => x.path === f)).toBe(false);
        }
    });

    /**
     * 🔴 **`savePhase` 에 섞으면 다시 국면마다 한 벌씩 앉는다** — 그게 아침에 갈라진 이유다.
     *    값 이름을 여기서 또 적지 않고 `quadShapeFrom` 으로 통째 넘긴다 (규칙 ③).
     */
    it('🔴 저장은 평면 통로로 간다 — 국면 저장(savePhase)에 섞지 않는다', () => {
        const save = modal.slice(modal.indexOf('const handleSave'), modal.indexOf('const slotsUsed'));
        expect(save).toMatch(/if \(quadDirty\) updateFilter\(quadShapeFrom\(quadForm\)/);
        // 국면 저장 고리 안에 마름모가 섞여 있지 않다
        const loop = save.slice(save.indexOf('for (const key of PHASE_KEYS)'), save.indexOf('if (quadDirty)'));
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
    it('🔴 칸 옆 단위는 표에서 읽는다 — 화면 어디에도 KM 을 박지 않는다', () => {
        expect(modal).not.toMatch(/>KM</);
        // 두 묶음 다 제 표의 unit 을 넘긴다 (KnobGrid 가 그걸 그린다)
        expect(modal).toMatch(/unit: f\.unit/);
    });
});

/**
 * 🎚️ **숫자 입력칸을 걷어낸다 — 누르면 슬라이더가 «레이어»로 뜬다** (이식 C4-1 · 2026-09-11).
 *
 * 기사님 2026-09-09 (목업에서 이 부품을 만들며):
 *   · *"**클릭하면 슬라이더가 보이는 건 어때?**"*
 *   · *"**밀리는 것 없이 레이어로** 처리하는 것이 좋을 것 같아"*
 *   · *"한 줄에 3개도 넣을 수 있을 듯"*
 *   · 🔴 *"**커서 확인하고 숫자 지우고 입력하고 힘들어.**"*
 *
 * 🔴 **내가 그 지시를 어긴 자리가 여기다.** 2026-09-11 오전에 마름모 셋을 파면서
 *    `type="number"` 로 만들었다 — 기사님이 두 달 전에 «폰에서 나쁘다»고 못박은 바로 그 모양이다.
 *    목업에는 이미 답(`KnobGrid`)이 있었는데 실물에 손으로 새 칸을 판 것이다.
 *
 * ✅ **C3-3a 에서 국면 칸 넷도 따라왔다** — 탭이 걷히며 값이 한 벌이 되었으므로
 *    이제 화면에 숫자 입력칸이 **하나도** 없다.
 */
describe('마름모 칸 — 숫자판이 아니라 슬라이더 레이어 (C4-1)', () => {

    const { QUAD_FIELDS } = require("@onedal/shared");
    const knob = codeOnly(read(join(CLIENT, 'components/ui/KnobGrid.tsx')));
    const lab = codeOnly(read(join(CLIENT, 'pages/MapMockup.tsx')));

    /**
     * 🔴 **한 벌이다** — `PickLayer`(C2-2)·`JudgmentSeat` 과 같은 이유. 손맛이 갈리면
     *    기사님이 목업에서 맞춰 둔 것이 실물에서 다른 물건이 된다 (규칙 ③).
     */
    it('🔴 KnobGrid 는 한 벌 — 실물도 목업도 같은 파일을 부른다', () => {
        expect(modal).toMatch(/from "\.\.\/ui\/KnobGrid"/);
        expect(lab).toMatch(/from '\.\.\/components\/ui\/KnobGrid'/);
        // 목업 안에 사본이 남아 있지 않다
        expect(lab).not.toMatch(/function KnobGrid\(/);
    });

    /**
     * 🔴 기사님이 «힘들어»라고 하신 그 칸이 **필터 화면에서 완전히 사라졌다**.
     *    C4-1 에서 마름모 셋, C3-3a 에서 국면 칸 넷.
     */
    it('🔴 필터 화면에 숫자 입력칸이 하나도 없다 — 전부 KnobGrid 로 그린다', () => {
        expect(modal).not.toMatch(/type="number"/);
        expect(modal).toMatch(/<KnobGrid/);
        // 라벨·단위·범위는 여전히 표 하나에서 온다 (규칙 ③)
        expect(modal).toMatch(/QUAD_FIELDS\.map/);
        expect(modal).toMatch(/FILTER_FIELDS/);
    });

    /**
     * 🔴 **감추지 않고 흐리게 둔다** (기사님 2026-09-09: *"모두 꺼내 두고 노선이면
     *    라인값을 사용하고 동선이면 사용 안 하면 되니까"*).
     *
     * 라인반경은 **콜을 쥐어 경로가 생긴 뒤에만** 쓰인다. 감추면 «이 값이 어디 갔나»가 되고,
     * 그냥 두면 «지금 쓰이는 값»으로 읽힌다 — 목업은 흐리게(`dim`) 해서 둘 다 피한다.
     */
    it('🔴 지금 안 쓰이는 칸은 감추지 않고 흐리게 둔다 (dim)', () => {
        expect(modal).toMatch(/dim:/);
        expect(knob).toMatch(/k\.dim \? 'opacity-50'/);
    });

    /**
     * 🔴 **손가락으로 크게 옮기고 ± 로 한 칸씩 다듬는다** (기사님 2026-09-09).
     *    슬라이더만 있으면 1° 를 맞출 수 없고, ± 만 있으면 110° 까지 백 번 눌러야 한다.
     */
    it('🔴 끄는 것(슬라이더)과 다듬는 것(±)이 둘 다 있다', () => {
        expect(knob).toMatch(/type="range"/);
        expect(knob).toMatch(/−/);          // 한 칸 내리기
        expect(knob).toMatch(/\+/);         // 한 칸 올리기
        // 숫자판을 띄우지 않는다
        expect(knob).not.toMatch(/type="number"/);
    });

    /**
     * 🔴 **펼쳐도 아래가 안 밀린다** (기사님 2026-09-09 *"밀리는 것 없이 레이어로"*).
     *    아래로 밀면 폰에서 보던 자리가 사라진다. 그리고 레이어는 **셀이 아니라 묶음 전체 폭**을
     *    쓴다 — 셀(1/3) 안에 슬라이더를 넣으면 좁아서 못 끈다.
     */
    it('🔴 레이어가 겹쳐 뜬다 — 아래를 밀지 않고, 묶음 전체 폭을 쓴다', () => {
        expect(knob).toMatch(/absolute/);
        expect(knob).toMatch(/inset-x-0/);   // 셀이 아니라 묶음 전체 폭
        expect(knob).toMatch(/relative/);    // 겹칠 기준이 제 안에 있다
    });

    /**
     * 🔴 **닫는 길 셋** (기사님 2026-09-09 *"닫히는 것도 해줘"* · *"지금 오작동하는 거 같아"*):
     *    ① 레이어의 «✕» ② 바깥 아무 데나 ③ Esc.
     *    레이어가 값 버튼을 덮으므로 «같은 버튼 다시 누르기»만으로는 못 닫는다.
     *    ②③ 은 `useCloseOnOutside` 한 곳이 한다 — 여기서 또 적지 않는다 (규칙 ③).
     */
    it('🔴 닫는 길이 셋이다 — ✕ · 바깥 · Esc', () => {
        expect(knob).toMatch(/✕/);
        expect(knob).toMatch(/useCloseOnOutside/);
        // 덮개(fixed inset-0)로 온 화면을 막지 않는다 — 다른 칸 클릭을 삼켰던 모양이다
        expect(knob).not.toMatch(/fixed inset-0/);
    });

    /**
     * 🔴 **한 칸이 얼마인가도 표가 정한다** (규칙 ③). 각도를 1° 씩 끌게 두면
     *    110° 까지 가는 데 화면을 백 번 훑어야 한다 — 목업은 10° 씩 간다.
     *    화면이 «각도면 10» 을 제 손으로 판단하면 표와 갈라진다.
     */
    it('🔴 step 은 표(QUAD_FIELDS)에서 온다 — 화면이 각도인지 따지지 않는다', () => {
        for (const f of QUAD_FIELDS) expect(typeof f.step).toBe('number');
        expect(QUAD_FIELDS.find((f: any) => f.path === 'srcAngleDeg').step).toBe(10);
        expect(QUAD_FIELDS.find((f: any) => f.path === 'quadRadiusKm').step).toBe(1);
        expect(modal).toMatch(/step: f\.step/);
        expect(modal).not.toMatch(/unit === '°' \? 10/);
    });

    /** 🔴 표의 `min`·`max` 를 넘겨 슬라이더가 표 밖으로 못 가게 한다 */
    it('🔴 슬라이더 범위도 표에서 온다', () => {
        expect(modal).toMatch(/min: f\.min/);
        expect(modal).toMatch(/max: f\.max/);
        expect(knob).toMatch(/min=\{/);
        expect(knob).toMatch(/max=\{/);
    });
});

/**
 * 🎯 **목적지 — 도를 고르고 시를 고른다** (이식 C4-2 · 2026-09-11).
 *
 * 기사님 확정 2026-09-09: *"**선택이 어려우니 도를 선택하고 시를 선택하게 할까?**"*
 *
 * 예전에는 `<select>` 하나에 전국 시·군이 `optgroup` 으로 들어 있었다. 폰에서 그 목록을
 * 스크롤해 하나를 집는 것이 **운전 중에는 불가능하다** (기억: 운전 중에는 입력을 못 한다).
 *
 * 🔴 **복귀 칸은 여기 안 넣는다 — 목업과 실물이 다른 물건이다.**
 *    기사님 2026-09-09: *"복귀도 목적지와 같은 뎁스니까 목적지 옆에 있는 것이 맞을 것 같아."*
 *    목업의 복귀 토글(`homeOn`)은 **목적지를 하나 더 얹는 것**이라 되돌리기가 공짜다.
 *    실물의 복귀는 둘 중 하나인데 **둘 다 무겁다**:
 *      · `callTarget` 전환  — 명세 §4-2 가 **팝업에서 금지**했다 (확인창이 있는 요약줄만)
 *                             기사님: *"필터가 쉽게 바뀌면 오작동"*
 *      · 귀가콜 오더 생성   — 집까지 가는 **가상 오더를 만든다.** 토글로 켰다 끌 것이 아니다
 *    그래서 «같은 뎁스»를 실물에서 어떻게 낼지는 **따로 선다** (C4-2b).
 *    이 비대칭은 결정이다 — «목업에 있으니 넣자»로 지우지 않는다.
 */
describe('목적지 — 도 · 시 2단 (C4-2)', () => {

    it('🔴 <select> 가 사라졌다 — 목업과 같은 고르기 칸을 쓴다', () => {
        expect(modal).not.toMatch(/<select/);
        expect(modal).toMatch(/<PickLayer label="🎯 도"/);
    });

    /**
     * 🔴 **도 목록·시 목록의 원천은 `cityGroups` 하나다** (규칙 ⑤-4 ⑤ — 읽는 곳이 둘이면
     *    각자 다른 질문을 답하고 있는 것이다).
     *
     * ⚠️ 이 화면에는 **비슷하게 생긴 다른 목록**이 있다 — 제외 지역이 쓰는
     *    `sidoList()`/`sggList()` 는 **지도 데이터(행정동)** 다. 목적지는 «서버가 콜을
     *    검색할 수 있는 시»라 답이 달라야 한다. 2026-08-12 에 화면이 `파주` 를 못 찾고
     *    **첫 항목(용인시)** 을 그려 기사님이 필터를 용인으로 알고 계셨던 그 자리다.
     */
    it('🔴 도·시 목록은 cityGroups 에서 온다 (지도 데이터가 아니다)', () => {
        const dst = modal.slice(modal.indexOf('🎯 도'), modal.indexOf('🎯 도') + 2000);
        expect(dst).toMatch(/cityGroups/);
        expect(dst).not.toMatch(/sidoList\(\)/);
        expect(dst).not.toMatch(/sggList\(/);
    });

    /**
     * 🔴 **저장된 값이 목록에 없으면 다른 것을 대신 보여주지 않는다** (관제웹 CLAUDE.md).
     *    `<select>` 는 값이 안 맞으면 첫 항목을 그려 **화면이 조용히 거짓말한다.**
     *    고르기 칸으로 바꿔도 그 위험은 그대로다 — 값을 그대로 적고 «목록에 없음»을 붙인다.
     */
    it('🔴 목록에 없는 저장값은 «목록에 없음»으로 드러낸다', () => {
        expect(modal).toMatch(/목록에 없음/);
        expect(modal).toMatch(/knownCities\.includes/);
    });

    /** 🔴 도를 옮기면 시도 그 도의 것으로 따라간다 — 안 그러면 «경기 + 김포시»가 남는다 */
    it('🔴 도를 바꾸면 시가 그 도의 것으로 따라간다', () => {
        const dst = modal.slice(modal.indexOf('🎯 도'), modal.indexOf('🎯 도') + 2000);
        expect(dst).toMatch(/citiesOf\(/);
    });
});

/**
 * 🏷️ **이름도 목업 것으로, 그리고 한 벌로** (이식 C4-7 · 2026-09-11).
 *
 * 기사님 2026-08-14: *"**목업에 만들어둔 명칭도 그대로 사용해.**"*
 * 그런데 반경 두 칸이 아직 실물 이름이었다 — 목업은 «현위반경 · 목적반경»인데
 * 실물은 «상차 반경 · 하차지 주변»이라, **같은 손잡이를 두 화면이 다르게 부른다.**
 *
 * 🔴 **이름이 국면마다 달랐던 것도 걷는다.** `PHASE_FIELD_LABEL_OVERRIDE` 는 첫짐에서만
 *    «도착 반경», 나머지는 «하차지 주변» 으로 부르던 표다. 값이 다섯 벌이던 때는 말이 됐다 —
 *    **지금은 값이 한 벌인데 이름만 다섯이면 화면이 상황마다 다른 말을 한다** (C3-3a 이후).
 *    같은 숫자를 가리키는 말은 하나여야 한다 (규칙 ③).
 */
describe('손잡이 이름 — 목업 것으로 한 벌 (C4-7)', () => {

    const { PHASE_FIELD_LABEL, QUAD_FIELDS } = require("@onedal/shared");

    it('🔴 반경 이름이 목업 그대로다 — 현위반경 · 목적반경 · 라인반경', () => {
        expect(PHASE_FIELD_LABEL.pickupRadiusKm).toBe('현위반경');
        expect(PHASE_FIELD_LABEL.dropoffRadiusKm).toBe('목적반경');
        expect(PHASE_FIELD_LABEL.detourAllowKm).toBe('라인반경');
        expect(QUAD_FIELDS.find((f: any) => f.path === 'quadRadiusKm').label).toBe('마름모반경');
    });

    it('🔴 목적지도 목업 이름이다', () => {
        expect(PHASE_FIELD_LABEL.destinationCity).toBe('목적지');
    });

    /** 🔴 값이 한 벌이면 이름도 한 벌이다 — 국면별 별칭표가 남아 있지 않다 */
    it('🔴 국면마다 다른 이름이 없다 (값이 한 벌인데 이름이 다섯이면 거짓말)', () => {
        const shared = require("@onedal/shared");
        expect(shared.PHASE_FIELD_LABEL_OVERRIDE).toBeUndefined();
        expect(shared.fieldLabel).toBeUndefined();
        expect(modal).not.toMatch(/fieldLabel\(/);
    });
});

/**
 * 🏘️ **관내 — 목업처럼, 목적지를 안 잃는 파생** (이식 C4-8b · 2026-09-11).
 *
 * 기사님 2026-09-11: *"우린 집으로 갈건지 말껀지만 있어"* → 관내를 «고르는 것»에서 뺐다.
 * 그러면 **들어가는 길이 없어지므로** 파생으로 만든다.
 *
 * 🔴 **관내와 목적지 설정은 다른 일이다** (내가 한 번 같다고 봤다가 되물림당했다):
 *      목적지를 「성남시」로  →  성남시를 **향하는** 콜 (**방향을 본다**)
 *      관내                  →  성남시 **안에서 끝나는** 콜 (**방향을 안 본다**)
 *    기사님이 이미 정하신 규칙이다 — *"관내콜은 거리로 하지 말자.
 *    그냥 상차지와 하차지가 같은 시도에 있으면."*
 *
 * 🔴 **목적지를 잃지 않는다.** 실물은 관내로 가느라 `destinationCity` 를 지금 시로
 *    **바꿨다**(김포시 → 성남시). 그래서 파생으로 두면 **기사님이 정한 목적지가 저절로
 *    바뀐다.** 목업은 목적지를 그대로 둔 채 **재는 법만** 바꾼다 — 그쪽이 맞다.
 */
describe('관내 — 목적지를 안 잃는 파생 (C4-8b)', () => {

    /** 🔴 ② 값 — 판정은 shared 하나가 한다. 서버가 제 규칙을 또 세우지 않는다 (규칙 ③) */
    it('🔴 관내 판정은 shared 의 isLocalPhase 하나로 한다', () => {
        /**
         * 🔴 **그물 «안»을 본다.** `isLocalPhase` 는 **import 줄에도** 있어서 파일 전체를
         *    훑으면 함수에서 빼도 초록불이다 (변이로 확인했다 — 이 레포가 반복해 당한 모양).
         */
        const net = fm.slice(fm.indexOf('function netKeywordsOf'), fm.indexOf('function netKeywordsOf') + 3000);
        expect(net).toMatch(/isLocalPhase\(/);
        // 서버가 «목적지 근처인가»를 제 손으로 다시 재지 않는다
        expect(net).not.toMatch(/haversineKm\(/);
    });

    /** 🔴 ① 스키마 — 파생값이라 **저장하지 않는다**. 저장하면 두 벌이 된다 */
    it('🔴 localMode 는 메모리에만 산다 (DB 에 안 쌓인다)', () => {
        const db = codeOnly(read(join(SERVER, 'db.ts')));
        expect(db).not.toMatch(/local_mode/);
        const shared = require("@onedal/shared");
        expect((shared.APP_FILTER_KEYS as readonly string[]).includes('localMode')).toBe(false);
    });

    /**
     * 🔴 ⑤ 읽는 곳 — **그물 한 곳뿐이다.** 둘이 되면 각자 다른 질문을 답하기 시작한다.
     * 🔴 그리고 **목적지를 안 건드린다** — 그게 실물과 목업이 갈리던 자리다.
     */
    it('🔴 그물이 관내를 읽는다 — 목적지는 안 건드린다', () => {
        expect(fm).toMatch(/localMode/);
        // 관내라고 `city` 를 갈아치우지 않는다 — 넘어온 목적지를 그대로 쓴다
        const net = fm.slice(fm.indexOf('function netKeywordsOf'), fm.indexOf('function netKeywordsOf') + 3000);
        expect(net).not.toMatch(/city = /);
    });

    /**
     * 🔴 **방향을 안 본다** (기사님: *"관내콜은 거리로 하지 말자. 그냥 상차지와 하차지가
     *    같은 시도에 있으면"*). 그물에서 «방향»은 마름모의 각도다 — 관내면 **360°**,
     *    곧 원이 된다. 라인(경로 양옆)도 안 쓴다 — 그것도 방향이다.
     */
    it('🔴 관내면 방향을 안 본다 — 각도 360° · 라인 없음', () => {
        const net = fm.slice(fm.indexOf('function netKeywordsOf'), fm.indexOf('function netKeywordsOf') + 3000);
        expect(net).toMatch(/srcAngleDeg: 360/);
        expect(net).toMatch(/dstAngleDeg: 360/);
        expect(net).toMatch(/localMode \? null : line/);
    });

    /**
     * ⚠️ **`callTarget` 의 `'LOCAL'` 은 아직 남아 있다** (C4-8b-2 로 미룬다).
     *    타입에서 걷으면 앱(Kotlin)·DB 까지 내려간다 — 이 판은 «관내로 들어가는 길»을
     *    되살리는 데까지다. 다만 **두 길이 같은 일을 하지는 않는다**:
     *    이제 관내는 그물이 판단하고, `setCallTarget('LOCAL')` 은 화면에서 못 부른다(C4-8a).
     */
    it('⚠️ 옛 LOCAL 전환은 화면에서 부르지 않는다 (타입 철거는 C4-8b-2)', () => {
        expect(modal).not.toMatch(/'LOCAL'/);
    });
});

/**
 * 🗂️ **디자인을 목업처럼 — 순서와 3칸 격자** (이식 C4-6 · 2026-09-11).
 *
 * 기사님 지시 2026-09-11: *"**디자인은 목업처럼 해주면 되고**"* (목업 왼쪽 패널 스크린샷과 함께).
 * 원본은 `MapMockup.tsx:3145~3402` 다.
 */
describe('필터 디자인 — 목업 순서 (C4-6)', () => {

    /** 🔴 기사님 2026-09-09: *"적재는 상태값이니 필요 없고"* — 요약줄이 이미 `📦 90/100` 을 말한다 */
    it('🔴 적재 패널이 없다 (상태값이라 손잡이가 아니다)', () => {
        expect(modal).not.toMatch(/📦 적재/);            // 조작판 제목
        expect(modal).not.toMatch(/i < slotsUsed/);      // 칸 막대 그래프
        expect(modal).not.toMatch(/만재로 추정/);         // 추정 안내
        /**
         * ⚠️ `capacityConfidence` 는 맨 아래 🩺 **모니터**에 남아 있다 — 그건 손잡이가 아니라
         *    «지금 앱에 내려가 있는 값»을 그대로 비추는 **확인창**이라 걷을 것에 안 든다.
         *    그래서 **개수가 아니라 «자리»로** 본다: 조작판 구역(저장 버튼 앞)에 없으면 된다.
         */
        const body = modal.slice(0, modal.indexOf('🟢 오늘만'));
        expect(body).not.toMatch(/capacityConfidence/);
    });

    /**
     * 🔴 **콜할인율도 같은 고르기 칸이다** (기사님 2026-09-09: *"이 부분도 디자인에 맞춰
     *    이쁘게 바꿔줘"*). 차종별 하한표는 **레이어 «안»**으로 들어갔다 —
     *    늘 펴 두면 폰에서 필터가 화면을 다 먹는다.
     * ⚠️ 없애지는 않았다 (기사님: *"읽을 수 있게 통로를 열어 줘야지"*).
     */
    it('🔴 콜할인율이 고르기 칸 하나다 — 단가표는 레이어 안', () => {
        expect(modal).toMatch(/<PickLayer label="💰 콜할인율"/);
        // 버튼 다섯을 늘 펴 두던 옛 격자가 없다
        expect(modal).not.toMatch(/CALL_DISCOUNT_STEPS\.filter/);
        /**
         * 🔴 **그 칸 «안»을 본다.** `RATE_TABLE_ORDER.map` 은 아래 🩺 모니터에도 있어서
         *    화면 전체를 훑으면 하한표를 통째로 지워도 초록불이다 (변이로 확인했다).
         */
        const dial = modal.slice(modal.indexOf('<PickLayer label="💰 콜할인율"'),
                                 modal.indexOf('<PickLayer label="🚫 제외 단어"'));
        expect(dial).toMatch(/RATE_TABLE_ORDER\.map/);
        expect(dial).toMatch(/FLOOR_TITLE\[tab\]/);
        expect(dial).toMatch(/foot=\{/);
    });

    /**
     * 🔴 **제외 단어를 1칸으로 접되 «자유 입력»을 없애지 않는다.**
     *    목업의 여섯 개는 목업이라 고정이고, 실물은 기사님이 **아무 말이나** 넣으실 수 있어야 한다 —
     *    목록만 남기면 **기능이 준다**. 기사님 2026-09-09: *"제외 단어는 입력이 필요하다."*
     * 🔴 그릇은 그대로 하나다 (쉼표 문자열) — 칩을 눌러도 손으로 쳐도 **같은 곳**에 쓴다 (규칙 ③).
     */
    it('🔴 제외 단어는 1칸이되 자유 입력이 살아 있다', () => {
        expect(modal).toMatch(/<PickLayer label="🚫 제외 단어"/);
        /**
         * 🔴 **그 칸 «안»을 본다.** `handleBlacklistChange` 는 **선언부**에도 있어서
         *    화면 전체를 훑으면 입력칸을 떼어 내도 초록불이다 (변이로 확인했다).
         */
        const words = modal.slice(modal.indexOf('<PickLayer label="🚫 제외 단어"'),
                                  modal.indexOf('제외 지역 — 탭 위다'));
        expect(words).toMatch(/onChange=\{handleBlacklistChange\}/);   // 손으로 치는 길
        expect(words).toMatch(/COMMON_EXCLUDED_WORDS/);                 // 자주 쓰는 것은 눌러서
        // 저장 그릇은 여전히 하나 — 목록은 거기서 파생된다
        expect(modal).toMatch(/const blacklistWords = blacklist\.split/);
    });

    /**
     * 🔴 **순서가 목업이다** — «어디로 가나»부터 정하고 «무엇을 뺄까»로 끝난다.
     *    전에는 제외 단어·제외 지역이 **맨 위**, 목적지·반경이 **맨 아래**라 거꾸로였다.
     */
    it('🔴 순서가 목업 그대로다 — 목적지 → 그물 → 반경 → 값 → 제외지역', () => {
        const at = (re: RegExp) => { const m = modal.match(re); return m ? modal.indexOf(m[0]) : -1; };
        /**
         * 🔴 **국면은 목적지 줄 «안»으로 들어갔다** (기사님 판단 2026-09-11).
         *    전에는 제 줄을 따로 썼는데 «🎯 노선»과 «🛣️ 노선»이 **두 줄에 같은 말**로 떠서
         *    헷갈렸다 — 하나는 «어디로 가나», 하나는 «어떻게 볼까»인데.
         *    기사님이 목업에서 정하신 자리가 그 답이다: *"복귀도 목적지와 같은 뎁스"*.
         */
        /* 국면 칸은 **복귀 토글**이 됐다 (기사님: *"우린 집으로 갈건지 말껀지만 있어"*) */
        const 국면 = at(/const homeOn = /);
        const 노선동선 = at(/🛣️ 노선/);
        const 목적지 = at(/<PickLayer label="🎯 도"/);
        /* 🔴 `QUAD_FIELDS.map` 은 폼 초기화에도 나온다 — **그리는 쪽**을 집는다 */
        const 그물 = at(/knobs=\{QUAD_FIELDS\.map/);
        const 반경 = at(/KNOB_FIELDS\.map/);
        const 값 = at(/<PickLayer label="💰 콜할인율"/);
        const 제외지역 = at(/<PickLayer label="⛔ 제외 도"/);
        for (const [name, v] of Object.entries({ 국면, 노선동선, 목적지, 그물, 반경, 값, 제외지역 })) {
            expect(`${name}: ${v >= 0 ? '있다' : '없다'}`).toBe(`${name}: 있다`);
        }
        // 국면은 목적지 줄 «안»이라 목적지 다음이다
        const order = [노선동선, 목적지, 국면, 그물, 반경, 값, 제외지역];
        expect(order.join(' < ')).toBe([...order].sort((a, b) => a - b).join(' < '));
    });
});

/**
 * 🪗 **팝업을 걷어냈다 — 한 줄과 열림만 남는다** (이식 C4-3 · 2026-09-11).
 *
 * 기사님 2026-09-09 (목업을 만들며 그 **이유**를 통째로 말씀하셨다):
 * > *"실 프로젝트에서 **필터를 한 줄로 하고 열리고 닫히고** 하는데, **열려 있을 때 또 팝업이
 * >   뜬다. 그 UI 가 별로다. 팝업을 삭제하고 한 줄과 열림만 있으면 될 것 같아서** 이걸 하고
 * >   있는 거야. 핸드폰 UI 로 편하게 입력이 가능해야 — **작은 면적에 필요한 것만 잘
 * >   디스플레이**하고 싶다."*
 *
 * 🔴 **층이 셋이었다**: 접힌 줄(38px) → 펼친 줄(158px) → **전면 팝업**.
 *    ⚙️ 를 누르면 이미 펼쳐 놓은 것 위로 팝업이 또 덮었다. 이제 **둘**이다 —
 *    한 줄, 그리고 그 자리에서 열리는 필터.
 *
 * ⚠️ **«팝업»과 «레이어»는 다른 물건이다.** 걷어내는 것은 화면을 덮는 `Dialog` 이고,
 *    `KnobGrid`·`PickLayer` 가 칸 위에 겹쳐 띄우는 레이어는 기사님이 직접 고르신 모양이라
 *    그대로 둔다 (*"밀리는 것 없이 레이어로 처리하는 것이 좋을 것 같아"*).
 */
describe('필터 — 팝업이 아니라 제자리에서 열린다 (C4-3)', () => {

    const dash = codeOnly(read(join(CLIENT, 'pages/Dashboard.tsx')));

    it('🔴 필터가 Dialog(전면 팝업)를 쓰지 않는다', () => {
        expect(modal).not.toMatch(/<Dialog/);
        expect(modal).not.toMatch(/DialogContent/);
        expect(modal).not.toMatch(/from "\.\.\/ui\/dialog"/);
    });

    /**
     * 🔴 **요약줄과 «형제»로 선다** — 덮지 않고 아래에 이어 붙는다.
     *    그래야 «한 줄 → 열림»이 한 흐름으로 읽힌다 (콜 아코디언과 같은 문법).
     */
    it('🔴 요약줄 바로 아래에서 열린다 (덮지 않는다)', () => {
        expect(dash).toMatch(/isFilterOpen/);
        // 화면을 덮는 자리(fixed 오버레이)로 띄우지 않는다
        const panel = modal.slice(modal.indexOf('if (!isOpen) return null'));
        expect(panel).not.toMatch(/fixed inset-0/);
    });

    /**
     * 🔴 **안 열렸으면 만들지 않는다.** `Dialog` 는 닫혀 있어도 자식이 살아 있었다 —
     *    소켓 구독과 도시 목록 요청이 내내 돌았다. 제자리 열림은 **훅 뒤에서** 끊는다
     *    (훅 순서는 지켜야 하므로 `return null` 은 훅을 다 부른 뒤다).
     */
    it('🔴 닫혀 있으면 본문을 만들지 않는다', () => {
        expect(modal).toMatch(/if \(!isOpen\) return null;/);
    });

    /** 🔴 닫는 길이 있다 — ✕ 로 한 줄로 돌아간다 */
    it('🔴 닫는 길이 있다', () => {
        const panel = modal.slice(modal.indexOf('if (!isOpen) return null'));
        expect(panel).toMatch(/onClose/);
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
describe('국면 전환 — 입구는 하나, 확인창을 거친다', () => {

    const status = codeOnly(read(join(CLIENT, 'components/dashboard/OrderFilterStatus.tsx')));
    const dash2 = codeOnly(read(join(CLIENT, 'pages/Dashboard.tsx')));

    /**
     * 🔴 **2026-09-11 에 «어디에 있나»에서 «무엇을 막나»로 잣대를 옮겼다** (이식 C4-5).
     *
     * 예전 검사는 *«필터 팝업은 국면을 전환하지 않는다»* 였다. 그런데 **팝업이 없어졌고**
     * (C4-3), 요약줄의 펼친 판도 걷었다 — 기사님 2026-09-11: *"지금은 열림에 열림이
     * 두번이야. **한줄에 열림 하나만 있으면 되.**"* 그래서 국면 버튼이 필터 안으로 들어왔다.
     *
     * ⚠️ 그렇다고 옛 검사가 틀렸던 것은 아니다. 그때 막은 **해악 둘**은 그대로 막아야 한다:
     *   ① 팝업 버튼에 `confirm` 이 없어 기사님이 넣으신 확인 절차를 **우회**했다
     *      (기사님: *"필터가 쉽게 바뀌면 오작동"*)
     *   ② 전환 버튼이 `onClose()` 를 불러 **저장 안 한 값을 조용히 버렸다**
     * 둘 다 «팝업이라서»가 아니라 «확인이 없고, 값을 버려서» 나쁜 것이다. 그걸 직접 잠근다.
     */
    /**
     * ⚠️ **모양이 버튼 셋에서 «고르기 칸 하나»로 바뀌었다** (2026-09-11) — 확인창은 그대로다.
     *    기사님 2026-08-14 가 막으려 하신 것은 «쉽게 바뀌는 것»이지 «버튼이 아닌 것»이 아니다.
     */
    it('🔴 국면 전환에는 확인창이 있다 (기사님 확정: 알럿으로 확인)', () => {
        const go = modal.slice(modal.indexOf('const goPhase'), modal.indexOf('const goPhase') + 900);
        expect(go).toMatch(/confirm\(/);
        expect(go).toMatch(/set-call-target/);
    });

    /** 🔴 **전환이 열린 필터를 닫지 않는다** — 저장 안 한 값이 조용히 사라지면 안 된다 */
    it('🔴 전환이 필터를 닫지 않는다 (저장 안 한 값을 버리지 않는다)', () => {
        const go = modal.slice(modal.indexOf('const goPhase'), modal.indexOf('const goPhase') + 900);
        expect(go).not.toMatch(/onClose\(\)/);
    });

    /** 🔴 **입구는 하나다** — 두 곳에서 쏘면 한쪽만 확인창을 갖게 된다 (그게 ① 사고였다) */
    it('🔴 국면을 쏘는 곳이 한 곳뿐이다', () => {
        expect(status).not.toMatch(/set-call-target/);
        expect((modal.match(/set-call-target/g) || []).length).toBe(1);
    });

    /**
     * 🔴 **열림은 하나다** (기사님 2026-09-11: *"한줄에 열림 하나만 있으면 되"*).
     *    요약줄은 **늘 한 줄**이고, 열리는 것은 필터뿐이다.
     */
    /**
     * 🔴 **고르는 것은 «집으로 갈지 말지» 하나다** (기사님 확정 2026-09-11:
     *    *"[🧭 국면 🎯 노선행] **우린 집으로 갈건지 말껀지만 있어**"*).
     *
     * 목업이 그 모양이다 — 기사님이 고르시는 것은 `homeOn`(↩️ 복귀 켬/끔) **하나**이고,
     * `callTarget` 은 **파생**이다 (`MapMockup.tsx:978`):
     *
     *     callTarget = homeOn ? 'HOME' : localMode ? 'LOCAL' : 'DEST'
     *
     * ⚠️ **관내는 이 판에서 «고르는 것»에서만 뺐다.** 실물의 `LOCAL` 과 목업의 `localMode` 는
     *    **다른 물건**이라 파생으로 바꾸는 것은 따로 선다:
     *      · 실물 `LOCAL`      — **목적지를 지금 있는 시로 바꾼다** (김포시 → 성남시)
     *      · 목업 `localMode`  — 목적지는 그대로, **재는 법**만 바꾼다 (방향 안 봄)
     *    목업이 맞고 실물이 낡았지만, 고치면 서버 판정까지 내려간다 (C4-8b).
     */
    it('🔴 필터에서 고르는 것은 «집으로 갈지 말지» 하나다', () => {
        expect(modal).toMatch(/↩️ 복귀/);
        // 셋 중 고르던 옛 칸이 없다
        expect(modal).not.toMatch(/<PickLayer label="🧭 국면"/);
        expect(modal).not.toMatch(/TARGET_SHORT/);
    });

    /**
     * 🔴 **관내는 보여만 준다** — 고를 수는 없어도 «지금 관내로 재고 있다»는 사실은
     *    화면이 말해야 한다. 안 그러면 판정이 달라진 이유를 알 길이 없다 (규칙 ⑤-4 ④).
     */
    it('🔴 지금 관내면 화면이 그렇게 말한다 (고르지는 못해도)', () => {
        expect(modal).toMatch(/🏘️/);
    });

    /**
     * 🔴 **노선 ↔ 동선 토글이 지도에서 필터로 왔다** (기사님 지시 2026-09-11:
     *    *"노선 동선 버튼도 지도에서 필터로 이사와야해"*). **목업이 그 자리다** —
     *    필터 맨 위, 목적지 줄 바로 위 (`MapMockup.tsx:3171`).
     *
     * 🔴 **상태는 `Dashboard` 가 쥔다** — 지도와 필터가 **같은 값**을 봐야 한다.
     *    한쪽이 제 상태를 들면 «필터는 동선인데 지도는 노선»이 된다 (규칙 ③).
     * ⚠️ 「⏳ 경로를 기다립니다」 안내는 지도에 남는다 — 그건 «지금 지도가 무엇을
     *    그리고 있나»라 지도 자리가 맞다.
     */
    it('🔴 노선/동선 토글은 필터에 있다 (지도에 없다)', () => {
        const stage = codeOnly(read(join(CLIENT, 'components/stage/StageView.tsx')));
        expect(modal).toMatch(/🛣️ 노선/);
        expect(modal).toMatch(/🔷 동선/);
        // 지도에는 버튼이 없다 — 제 상태도 안 든다
        expect(stage).not.toMatch(/setRouteMode\(on\)/);
        expect(stage).not.toMatch(/useState\(true\);\s*$/m);
        // 상태는 부모(Dashboard)가 쥐고 둘에게 내린다
        expect(dash2).toMatch(/routeMode/);
    });

    it('🔴 요약줄에 «펼친 판»이 없다 — 한 줄과 필터 열림, 둘뿐이다', () => {
        expect(status).not.toMatch(/compact/);
        expect(status).not.toMatch(/onExpand/);
        expect(status).not.toMatch(/onCollapse/);
        expect(dash2).not.toMatch(/filterCompact/);
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

    /**
     * 🔴 **2026-09-11 오후에 잣대가 바뀌었다** (이식 C5). 예전엔 «떼는 목록에 있나»를 봤는데,
     *    이제 서버는 `APP_FILTER_KEYS` 로 **골라 싣는다** — 표에 없으면 안 간다.
     *    표 ↔ 앱(Kotlin) 대조는 `appFilterKeys.test.ts` 가 따로 잠근다.
     */
    it('제외 지역은 앱에 안 내려간다 — 서버가 목록에서 이미 뺐다 (명세 §3)', () => {
        const { APP_FILTER_KEYS } = require("@onedal/shared");
        expect((APP_FILTER_KEYS as readonly string[]).includes('excludedRegions')).toBe(false);
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

    /**
     * 🔴 **지도도 제외를 봐야 한다** (2026-09-11 저녁 · 자리표 대조에서 나왔다).
     *
     * C2-2 로 제외 칸을 만들면서 **서버는 빼는데 지도는 안 빼는** 상태가 됐다 —
     * `useCallNet` 이 `excluded: []` 를 넘기고 있었고, 그 옆 주석은 *"실물에 아직 칸이
     * 없다"* 고 적혀 있었다(그 칸을 그날 오후에 팠는데도). **화면이 «든다»고 그려 놓고
     * 판정은 탈락시킨다** — 규칙 ⑤-3 이 가장 크게 치는 사고다.
     */
    it('🔴 지도 그물도 제외 지역을 본다 (서버만 빼면 화면이 거짓말한다)', () => {
        const hook = codeOnly(read(join(CLIENT, 'hooks/useCallNet.ts')));
        expect(hook).not.toMatch(/excluded:\s*\[\]/);
        expect(hook).toMatch(/excluded/);
        const stage = codeOnly(read(join(CLIENT, 'components/stage/StageView.tsx')));
        expect(stage).toMatch(/excludedRegions/);
    });

    it('🔴 제외 지역은 여전히 pruneExcludedRegions 한 곳이 뺀다', () => {
        // 그물로 바꿔도 빼는 자리는 안 늘어난다 (규칙 ③)
        expect((fm3.match(/pruneExcludedRegions\(/g) || []).length).toBeGreaterThanOrEqual(2);
    });
});

/**
 * 📏 **「라인반경」은 「우회 허용」과 다른 값이다** (이식 · 2026-09-11 · 목업 경고).
 *
 * 목업(`MapMockup.tsx`)이 그 자리에 **경고를 적어 뒀다**:
 *   *"📏 라인 반경 km — 길 중심선에서 **한쪽으로** 몇 km 까지 콜을 받나
 *     (기사님 이름 확정 2026-09-09: «라인 반경»).
 *     🔴 실물의 «우회 허용»(`detour_allow_km` — 카카오가 재는 **총거리 증가분**)과
 *     **다른 값이다.** 둘 다 km 라 한 이름으로 부르면 이식할 때 **조용히 섞인다.**"*
 *
 * 🔴 **정확히 그 사고가 실물에 나 있었다.** 화면은 *"카카오 총거리가 늘어나는 만큼
 *    (100km → 105km 면 5km)"* 이라 설명하는데, 그 값은 서버에서 **길 양옆 폭**
 *    (turf 버퍼 반경 · `netKeywordsOf` 의 `lineRadiusKm`)으로 쓰인다.
 *    기사님이 «5» 를 넣을 때 **화면이 말하는 뜻과 실제 동작이 다르다** — 규칙 ⑤-4 ④.
 *
 * ⚠️ **칸 이름(`detourAllowKm`)은 이 판에서 안 바꾼다** — DB 컬럼·평면 이름이 얽혀 있어
 *    별도 판이다. 지금 고치는 것은 **화면이 하는 말**이다. 값이 하는 일은 그대로다.
 */
describe('라인반경 — 화면이 하는 말과 값이 하는 일이 같아야 한다', () => {

    const { FILTER_FIELDS } = require("@onedal/shared");
    const f = FILTER_FIELDS.find((x: any) => x.path === 'detourAllowKm');

    it('🔴 라벨이 「라인반경」이다 (목업 이름 · 기사님 확정 2026-09-09)', () => {
        expect(f.label).toBe('라인반경');
    });

    it('🔴 설명이 «총거리 증가분» 이라고 말하지 않는다', () => {
        expect(f.why).not.toMatch(/총거리/);
        expect(f.why).toMatch(/길|라인|중심선/);
    });

    it('🔴 화면 문단도 «총거리가 늘어나는 만큼» 이라고 안 적는다', () => {
        expect(modal).not.toMatch(/총거리가 늘어나는 만큼/);
    });

    it('범위는 목업과 같다 — 최대 50km', () => {
        expect(f.max).toBe(50);
    });

    /** 🔴 국면 라벨 표도 같은 말을 해야 한다 — 두 곳이 다른 이름을 쓰면 그게 또 갈라짐이다 */
    it('국면 라벨 표도 「라인반경」이다', () => {
        const { PHASE_FIELD_LABEL } = require("@onedal/shared");
        expect(PHASE_FIELD_LABEL.detourAllowKm).toBe('라인반경');
    });
});

/**
 * 🛣️ **노선 ↔ 🔷 동선 — 그물의 모양을 기사님이 고른다** (이식 · 2026-09-11 · 명세 §5).
 *
 * 기사님이 «현위치 범위가 안 보인다» 하신 것의 답이다 — 콜을 쥐면 그물이 라인으로 바뀌어
 * 현위치 원이 사라지는데, 실물에는 **되돌아볼 길이 없었다.** 목업에는 그 토글이 있다.
 *
 * 🔴 **버튼이 바꾸는 것과 화면이 읽는 것이 다르다** (목업이 못박은 갈림):
 *      버튼      → `routeMode`   기사님이 «고른 것»
 *      화면·판정 → `lineOn = routeMode && 경로가 실제로 있나`
 *    예전 목업은 단추만 보고 그려서, **노선을 누르면 라인이 없어도 마름모가 화면에서
 *    사라졌는데 판정은 그 마름모로 하고 있었다** (기사님 지적 2026-09-09).
 */
describe('노선 ↔ 동선 — 고른 것과 실제를 가른다 (이식)', () => {

    const stage = codeOnly(read(join(CLIENT, 'components/stage/StageView.tsx')));
    const hook = codeOnly(read(join(CLIENT, 'hooks/useCallNet.ts')));
    const dash3 = codeOnly(read(join(CLIENT, 'pages/Dashboard.tsx')));

    /**
     * ⚠️ **손잡이가 지도에서 필터로 이사했다** (기사님 지시 2026-09-11:
     *    *"노선 동선 버튼도 지도에서 필터로 이사와야해"* · 목업 `MapMockup.tsx:3171`).
     *    검사의 뜻은 그대로다 — **기사님이 고르는 값이지 파생이 아니다.** 자리만 옮겼다.
     */
    it('🔴 기사님이 고르는 손잡이가 있다 (파생이 아니다)', () => {
        expect(modal).toMatch(/setRouteMode\(on\)/);
        expect(modal).toMatch(/동선/);
        expect(modal).toMatch(/노선/);
        // 지도는 받아서 **그리기만** 한다
        expect(stage).toMatch(/routeMode/);
    });

    it('🔴 동선이면 라인을 끈다 — 그물이 마름모로 돌아온다', () => {
        expect(hook).toMatch(/routeMode/);
    });

    /**
     * 🔴 **직선으로 지어내지 않는다** (규칙 ④). 경로가 아직 없으면 마름모로 보되
     *    화면이 **그렇게 말해야 한다** — 안 그러면 «노선인데 마름모»가 조용한 거짓말이 된다.
     */
    it('🔴 노선인데 경로가 아직이면 화면이 그렇게 말한다', () => {
        expect(stage).toMatch(/경로를 기다립니다|경로 대기/);
    });

    /**
     * 🔴 **기억하지 않는다** — 레이어(🧅)는 «보기»라 `localStorage` 에 남기지만
     *    이것은 **판정을 바꾸는 값**이다. 어제 상태가 오늘 되살아나면 안 된다 (규칙 ③).
     */
    it('🔴 새로고침하면 기본(노선)으로 돌아간다', () => {
        // 상태는 이제 부모(Dashboard)가 쥔다 — 지도와 필터가 같은 값을 봐야 하므로
        expect(dash3).toMatch(/const \[routeMode, setRouteMode\] = useState\(true\)/);
        const at = dash3.indexOf('const [routeMode');
        const decl = dash3.slice(at, dash3.indexOf('\n', at));
        expect(decl).not.toMatch(/localStorage/);
    });
});
