import { readFileSync } from "fs";
import { join } from "path";

const CLIENT = join(__dirname, "../../../client-app/src");
const SERVER = join(__dirname, "../../src");

const read = (abs: string) => readFileSync(abs, "utf8");
/** 주석을 뺀 코드만 — 주석이 설명하려고 적은 이름에 검사가 걸리지 않게 */
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const modal = codeOnly(read(join(CLIENT, "components/dashboard/OrderFilterModal.tsx")));
const hook = codeOnly(read(join(CLIENT, "hooks/useFilterConfig.ts")));
const fm = codeOnly(read(join(SERVER, "state/filterManager.ts")));
const engine = codeOnly(read(join(SERVER, "services/dispatchEngine.ts")));
const handlers = codeOnly(read(join(SERVER, "socket/socketHandlers.ts")));

/**
 * 🔴 필터 설정 — 관제웹
 *
 * 이 화면에서 가장 위험한 것은 **표시 규칙을 화면이 또 갖는 것**이다.
 * «지금 이 칸이 쓰이나»를 화면이 상태와 따로 판단하면, 쓰이는 칸이 흐려지거나
 * 안 쓰이는 칸이 또렷해진다 — 그리고 아무도 모른다.
 */
describe('국면별 설정 — 화면은 표를 읽는다', () => {

    /**
     * 🔴 **국면 탭을 두지 않는다 — 칸을 다 꺼내 둔다** (기사님 확정 *"그 기준은 바꿔"*).
     *
     * 기사님: *"모두 꺼내 두고 노선이면 라인값을 사용하고 동선이면 사용 안 하면 되니까"*.
     * 국면마다 칸을 감추면 «이 값이 어디 갔나»가 된다 — 다 꺼내 두고 안 쓰는 칸만 흐리게 한다.
     */
    it('🔴 국면 탭이 없다 — 다섯 탭을 그리지 않는다', () => {
        expect(modal).not.toMatch(/const TABS = PHASE_KEYS/);
        expect(modal).not.toMatch(/TABS\.map\(/);
        expect(modal).not.toMatch(/setTab\(/);
    });

    /**
     * 🔴 **«안 쓰이는 칸»은 감추지 않고 흐리게 한다** (기사님 *"모두 꺼내 두고"*).
     *
     * «지금 이 칸이 쓰이나»는 상태에서 파생한다(`inUse`). 감추면 «이 값이 어디 갔나»가 되고,
     * 그냥 두면 «지금 쓰이는 값»으로 읽힌다 — 흐리게 해서 둘 다 피한다.
     */
    it('🔴 «안 쓰이는 칸»을 감추지 않는다 — 흐리게만 한다', () => {
        expect(modal).not.toMatch(/mode === 'hidden'/);
        expect(modal).not.toMatch(/PHASE_FIELDS/);
        // «지금 이 칸이 쓰이나»를 상태에서 파생해 dim 으로 보낸다
        expect(modal).toMatch(/const inUse = \(path/);
        expect(modal).toMatch(/dim: !inUse\(path\)/);
    });

    /**
     * 🔴 **늘 참인 말은 화면에 안 적는다** (기사님 판단: 머리줄 넷을 짚으시며
     *    *"이것이 필요한건지 판단해"*).
     *
     *   · «필터 설정»    요약줄을 눌러 연 것이라 **자명하다**
     *   · «오늘 콜 잡기» 아래 저장 버튼 둘(서버 저장·되돌리기)이 **더 정확히** 말한다
     *   · «합짐 중»      **요약줄이 이미** «합짐 탐색중»이라고 말한다 — 열면 또 적는 중복
     *
     * 🔴 «지금 무엇을 하나»는 **요약줄이 말한다** (기사님이 남기라 하신 둘 중 하나).
     *    한 화면에 같은 말이 두 번 있으면 그게 거짓말이 될 자리를 만든다 (규칙 ③).
     */
    it('🔴 머리줄에 늘 참인 말이 없다 (요약줄이 이미 말한다)', () => {
        expect(modal).not.toMatch(/필터 설정/);
        expect(modal).not.toMatch(/오늘 콜 잡기/);
        expect(modal).not.toMatch(/\{PHASE_LABEL\[tab\]\} 중/);
        // 다섯 국면을 손으로 나열한 배열도 없다
        expect(modal).not.toMatch(/key:\s*'first',\s*label:/);
    });

    /**
     * 🔴 **필터 화면에 닫는 ✕ 가 없다** (기사님: *"팝업이 아니니 x 버튼은 지워"*).
     *
     * ✕ 는 «이건 팝업이다»라고 말하는 표시라, 팝업이 아닌 화면에서는 **화면이 거짓말을 하는 자리**가 된다.
     *
     * 🔴 **닫는 길은 지킨다** — 요약줄이 토글이라 다시 누르면 접힌다. 검사가 무는 것은 «✕ 가 있나»가 아니라
     *    «접을 수 있나»다. 요약줄의 토글이 그 답이라 `Dashboard` 쪽을 본다.
     */
    it('🔴 필터 판에 닫는 ✕ 가 없다 — 팝업이 아니다', () => {
        const closeBtn = modal.slice(modal.indexOf('onClick={onClose}'));
        expect(modal).not.toMatch(/onClick=\{onClose\} title="접기"/);
        /* ✕ 자체는 다른 뜻으로 산다 (막힌 차종·제외 칩) — 「닫기 버튼」만 없어야 한다 */
        expect(closeBtn.slice(0, 200)).not.toMatch(/>\s*✕\s*</);
    });

    it('🔴 접는 길은 남아 있다 — 요약줄이 토글이다', () => {
        const dash = codeOnly(read(join(CLIENT, "pages/Dashboard.tsx")));
        expect(dash).toMatch(/onOpenFilter=\{\(\) => setIsFilterOpen\(o => !o\)\}/);
    });

    /** 🔴 폼이 하나다 — 국면마다 따로 두면 그것이 곧 다섯 벌이다 */
    it('🔴 값은 한 벌이다 — 국면별 폼 묶음이 없다', () => {
        expect(modal).not.toMatch(/const \[forms, setForms\]/);
        expect(modal).not.toMatch(/forms\[tab\]/);
        expect(modal).not.toMatch(/dirtyTabs/);
    });

    /**
     * 🔴 **값 다섯은 평면 통로(`updateFilter`) 하나로 한 곳에 한 번 간다** — 행이 하나라
     *    `destinationCity` 도 따로 다루지 않는다.
     */
    it('🔴 값 다섯은 평면 통로 하나로 간다', () => {
        const save = modal.slice(modal.indexOf('const handleSave'), modal.indexOf('const slotsUsed'));
        expect(save).toMatch(/updateFilter\(toValues\(cur,/);
        expect(save).not.toMatch(/savePhase/);
        expect(save).not.toMatch(/PHASE_KEYS/);
    });

    it('빈 입력은 0 이 아니라 **이전 값**이다 (0 이면 "제한 없음"으로 뒤집힌다)', () => {
        const toValues = modal.slice(modal.indexOf('const toValues'), modal.indexOf('const TARGET_HINT'));
        expect(toValues).toMatch(/Number\.isFinite\(n\) \? n : prev\[spec\.path\]/);
    });

    /**
     * 🔴 **값이 가는 길은 하나다** — 국면 전용 통로(`save-phase-settings`)를 두지 않고 평면(`update-filter`) 하나로 간다.
     *    탭도 국면별 값도 없으니 «어느 국면인지»를 실어 보낼 것이 없다.
     */
    it('🔄 국면 전용 통로가 없다 — 평면 하나로 간다', () => {
        expect(hook).not.toMatch(/save-phase-settings/);
        expect(handlers).not.toMatch(/safeOn\(socket, "save-phase-settings"/);
        expect(hook).toMatch(/socket\.emit\("update-filter"/);
    });

    it('🔄 filter-init 이 국면 설정을 더는 싣지 않는다 (값은 평면에 있다)', () => {
        expect(fm).not.toMatch(/phaseSettings: session\.phaseSettings/);
        expect(handlers).not.toMatch(/phaseSettings: session\.phaseSettings/);
    });
});

/**
 * 📐 **마름모의 모양은 국면 밖 한 벌이다**.
 *
 * 🔴 **자리가 하나라야 한다.** 국면 행마다 모양을 두고 «첫짐에서 상속»으로 가리면, 다섯 행에 값이
 *    계속 써져 첫짐을 120°/140°/35km 로 저장해도 합짐 행에는 110/110/25 가 남는다 —
 *    화면은 「자동 · 첫짐에서 120°」라고 적으면서 (규칙 ③).
 *
 * 근거는 기사님 확정: *"모두 꺼내 두고 노선이면 라인값을 사용하고 동선이면
 * 사용 안 하면 되니까."* — 칸을 감추지 않고 **상태에서 파생해 흐리게** 한다
 * (라인반경은 노선일 때만 · 자동이면 반경 넷).
 */
describe('마름모 모양 — 국면 밖 한 벌', () => {

    const { FILTER_FIELDS, QUAD_FIELDS,
            DEFAULT_QUAD_SHAPE, QUAD_SHAPE_KEYS } = require("@onedal/shared");

    /**
     * 🔴 **마름모는 값 표와 섞이지 않는다.** 둘은 같은 `user_filters`
     *    행에 살지만 **표가 다르다** — 마름모는 `QUAD_FIELDS`, 값 다섯은 `FILTER_FIELDS`.
     */
    it('🔴 값 표에 마름모가 없다 — 섞이면 한 표가 두 가지를 답한다', () => {
        for (const f of QUAD_SHAPE_KEYS) {
            expect(`${f}: ${FILTER_FIELDS.find((x: any) => x.path === f) ? '값 표에 있다' : '없다'}`)
                .toBe(`${f}: 없다`);
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
        /* «상차» · «하차» 레이어는 서버와 같은 `quadShapeFrom(filter)` 로 모양을 읽는다 */
        expect(stage).toMatch(/quadShapeFrom\(filter\b/);
        expect(stage).not.toMatch(/phaseSettings\[/);
    });

    /**
     * 🔴 **마름모는 제 표(`QUAD_FIELDS`)로만 그려진다** — 값 묶음(`FILTER_FIELDS`)에 섞이면
     *    다시 한 표가 두 가지를 답한다.
     */
    it('🔴 화면의 마름모는 제 표(QUAD_FIELDS)로만 그린다', () => {
        expect(modal).toMatch(/QUAD_FIELDS\.map/);
        // 값 묶음(FILTER_FIELDS)에 마름모가 섞이지 않는다
        const { FILTER_FIELDS } = require("@onedal/shared");
        for (const f of QUAD_SHAPE_KEYS) {
            expect(FILTER_FIELDS.some((x: any) => x.path === f)).toBe(false);
        }
    });

    /**
     * 🔴 **`savePhase` 에 섞으면 다시 국면마다 한 벌씩 앉아** 한 벌이 여러 벌로 갈라진다.
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
     * 칸 옆에 `KM` 을 박아 두면 각도 칸에도 붙는다 — 출발각 110 옆에 **KM** 이 붙는 식이다.
     */
    it('🔴 칸 옆 단위는 표에서 읽는다 — 화면 어디에도 KM 을 박지 않는다', () => {
        expect(modal).not.toMatch(/>KM</);
        // 두 묶음 다 제 표의 unit 을 넘긴다 (KnobGrid 가 그걸 그린다)
        expect(modal).toMatch(/unit: f\.unit/);
    });
});

/**
 * 🎚️ **숫자 입력칸을 두지 않는다 — 누르면 슬라이더가 «레이어»로 뜬다**.
 *
 * 기사님 (목업에서 이 부품을 만들며):
 *   · *"**클릭하면 슬라이더가 보이는 건 어때?**"*
 *   · *"**밀리는 것 없이 레이어로** 처리하는 것이 좋을 것 같아"*
 *   · *"한 줄에 3개도 넣을 수 있을 듯"*
 *   · 🔴 *"**커서 확인하고 숫자 지우고 입력하고 힘들어.**"*
 *
 * 🔴 **`type="number"` 칸 대신 `KnobGrid` 를 부른다** — 숫자 칸은 기사님이 «폰에서 나쁘다»고
 *    못박은 모양이다. 필터 화면에는 숫자 입력칸이 **하나도** 없다 (마름모 셋 · 값 칸 모두).
 */
describe('마름모 칸 — 숫자판이 아니라 슬라이더 레이어 (C4-1)', () => {

    const { QUAD_FIELDS } = require("@onedal/shared");
    const knob = codeOnly(read(join(CLIENT, 'components/ui/KnobGrid.tsx')));
    const lab = codeOnly(read(join(CLIENT, 'pages/MapMockup.tsx')));

    /**
     * 🔴 **한 벌이다** — `PickLayer`·`JudgmentSeat` 과 같은 이유. 손맛이 갈리면
     *    기사님이 목업에서 맞춰 둔 것이 실물에서 다른 물건이 된다 (규칙 ③).
     */
    it('🔴 KnobGrid 는 한 벌 — 실물도 목업도 같은 파일을 부른다', () => {
        expect(modal).toMatch(/from "\.\.\/ui\/KnobGrid"/);
        expect(lab).toMatch(/from '\.\.\/components\/ui\/KnobGrid'/);
        // 목업 안에 사본이 남아 있지 않다
        expect(lab).not.toMatch(/function KnobGrid\(/);
    });

    /**
     * 🔴 기사님이 «힘들어»라고 하신 숫자 입력칸은 **필터 화면에 하나도 없다** —
     *    마름모 셋 · 값 칸 모두 `KnobGrid` 다.
     */
    it('🔴 필터 화면에 숫자 입력칸이 하나도 없다 — 전부 KnobGrid 로 그린다', () => {
        expect(modal).not.toMatch(/type="number"/);
        expect(modal).toMatch(/<KnobGrid/);
        // 라벨·단위·범위는 여전히 표 하나에서 온다 (규칙 ③)
        expect(modal).toMatch(/QUAD_FIELDS\.map/);
        expect(modal).toMatch(/FILTER_FIELDS/);
    });

    /**
     * 🔴 **감추지 않고 흐리게 둔다** (기사님: *"모두 꺼내 두고 노선이면
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
     * 🔴 **손가락으로 크게 옮기고 ± 로 한 칸씩 다듬는다** (기사님).
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
     * 🔴 **펼쳐도 아래가 안 밀린다** (기사님 *"밀리는 것 없이 레이어로"*).
     *    아래로 밀면 폰에서 보던 자리가 사라진다. 그리고 레이어는 **셀이 아니라 묶음 전체 폭**을
     *    쓴다 — 셀(1/3) 안에 슬라이더를 넣으면 좁아서 못 끈다.
     */
    it('🔴 레이어가 겹쳐 뜬다 — 아래를 밀지 않고, 묶음 전체 폭을 쓴다', () => {
        expect(knob).toMatch(/absolute/);
        expect(knob).toMatch(/inset-x-0/);   // 셀이 아니라 묶음 전체 폭
        expect(knob).toMatch(/relative/);    // 겹칠 기준이 제 안에 있다
    });

    /**
     * 🔴 **닫는 길 셋** (기사님 *"닫히는 것도 해줘"* · *"지금 오작동하는 거 같아"*):
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
 * 🎯 **목적지 — 도를 고르고 시를 고른다**.
 *
 * 기사님 확정: *"**선택이 어려우니 도를 선택하고 시를 선택하게 할까?**"*
 *
 * `<select>` 하나에 전국 시·군을 `optgroup` 으로 넣으면 폰에서 그 목록을 스크롤해 하나를
 * 집어야 한다 — **운전 중에는 불가능하다** (운전 중에는 입력을 못 한다).
 *
 * 🔴 **복귀 칸은 목적지 칸에 넣지 않는다 — 목업과 실물이 다른 물건이다.**
 *    기사님: *"복귀도 목적지와 같은 뎁스니까 목적지 옆에 있는 것이 맞을 것 같아."*
 *    목업의 복귀 토글(`homeOn`)은 **목적지를 하나 더 얹는 것**이라 되돌리기가 공짜다.
 *    실물의 복귀는 **`callTarget` 전환**이고, 입구는 저장 줄의 «↩️ 복귀» 버튼 하나다.
 *    이 비대칭은 결정이다 — «목업에 있으니 넣자»로 지우지 않는다.
 */
/**
 * 🚫 **빼는 곳도 「어디로」와 같은 형식이다** (기사님 2026-09-23:
 *    *"지금 어디로의 ui 가 좋은것 같다. 필터의 빼는 곳도 같은 ui형식을 넣으면 좋겠다.
 *    지금은 경기 통째로 .. 이런 버튼이 불필요하게 있는것 같아."*)
 */
describe('🚫 빼는 곳 — 「어디로」와 한 형식', () => {

    it('🔴 «통째로 제외» 버튼이 없다 — 「전체」는 목록 맨 앞 항목이다', () => {
        expect(modal).not.toMatch(/통째로 제외/);
        expect(modal).toMatch(/optionLabel=\{v => v === ALL_KEY \? '전체'/);
    });

    it('🔴 켜짐 판단을 화면이 직접 하지 않는다 — excludePick 하나가 센다', () => {
        /* 화면이 키를 직접 뒤지면 «전체가 풀리는» 규칙이 화면마다 갈라진다 */
        expect(modal).toMatch(/excludedSggsOf\(exDraft, exSido/);
        expect(modal).toMatch(/excludedDongsOf\(exDraft, exSido/);
        expect(modal).not.toMatch(/exDraft\.includes\(`R\|/);
        expect(modal).not.toMatch(/exDraft\.includes\(`D\|/);
    });

    it('🔴 빼기는 여럿을 고른다 — 시·군·구 · 읍·면·동 칸이 열린 채 남는다', () => {
        const ex = modal.slice(modal.indexOf('⛔ 시·도'));
        expect(ex.match(/keepOpen/g)?.length).toBeGreaterThanOrEqual(2);
    });
});

describe('목적지 — 도 · 시 2단 (C4-2)', () => {

    it('🔴 <select> 가 사라졌다 — 목업과 같은 고르기 칸을 쓴다', () => {
        expect(modal).not.toMatch(/<select/);
        expect(modal).toMatch(/<PickLayer label="🎯 시·도"/);
    });

    /**
     * 🔴 **도 목록·시 목록의 원천은 `cityGroups` 하나다** (규칙 ⑤-4 ⑤ — 읽는 곳이 둘이면
     *    각자 다른 질문을 답하고 있는 것이다).
     *
     * ⚠️ 이 화면에는 **비슷하게 생긴 다른 목록**이 있다 — 제외 지역이 쓰는
     *    `sidoList()`/`sggList()` 는 **지도 데이터(행정동)** 다. 목적지는 «서버가 콜을
     *    검색할 수 있는 시»라 답이 달라야 한다. 섞으면 화면이 저장된 시(`파주`)를 못 찾고
     *    **첫 항목(용인시)** 을 그려 기사님이 필터를 용인으로 잘못 아신다.
     */
    it('🔴 도·시 목록은 cityGroups 에서 온다 (지도 데이터가 아니다)', () => {
        const dst = modal.slice(modal.indexOf('🎯 시·도'), modal.indexOf('🎯 시·도') + 2000);
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

    /**
     * 🏷️ **보이는 이름만 짧게, 값은 그대로** (기사님 2026-09-23:
     *    *"서울을 누르고 들어오면 서울 강남구 … 등 모든 버튼 라벨에 서울이 붙는다. 중복이다.
     *    벨류는 유지 하고 라벨에 서울은 모두 빼도 될듯"*).
     *
     * 🔴 목록(`options`)을 꾸며서 넘기면 **고른 값이 꾸민 글자로 저장되어** 지도가 그 이름을
     *    못 찾는다 — 「강남구」 홀로는 서울인지 대전인지도 모른다. 그래서 `optionLabel` 로
     *    **그리는 글자만** 바꾼다.
     */
    it('🔴 시·군·구는 이미 고른 시·도 이름을 떼고 보인다 — 값은 건드리지 않는다', () => {
        expect(modal).toMatch(/optionLabel=\{shortCity\}/);
        /* 목록 자체를 꾸미지 않는다 */
        expect(modal).toMatch(/options=\{citiesOf\(dstSido\)\}/);
        /* 고른 값은 그대로 저장된다 */
        expect(modal).toMatch(/onPick=\{\(v\) => pickField\('destinationCity', v\)\}/);
    });

    it('🔴 시 전체는 «전체» 로 부른다 — 시·도 이름을 떼면 빈칸이 된다', () => {
        expect(modal).toMatch(/v === dstSido \? '전체'/);
    });

    /** 🔴 도를 옮기면 시도 그 도의 것으로 따라간다 — 안 그러면 «경기 + 김포시»가 남는다 */
    it('🔴 도를 바꾸면 시가 그 도의 것으로 따라간다', () => {
        const dst = modal.slice(modal.indexOf('🎯 시·도'), modal.indexOf('🎯 시·도') + 2000);
        expect(dst).toMatch(/citiesOf\(/);
    });
});

/**
 * 🏷️ **이름도 목업 것으로, 그리고 한 벌로**.
 *
 * 기사님: *"**목업에 만들어둔 명칭도 그대로 사용해.**"*
 * 같은 손잡이를 두 화면이 다르게 부르면(목업 «현위반경 · 목적반경» · 실물 «상차 반경 · 하차지 주변»)
 * 기사님이 두 물건으로 읽는다.
 *
 * 🔴 **이름은 국면마다 다르지 않다** — 값이 한 벌인데 이름만 국면마다 다르면
 *    (첫짐 «도착 반경» · 나머지 «하차지 주변») **화면이 상황마다 다른 말을 한다.**
 *    같은 숫자를 가리키는 말은 하나여야 한다 (규칙 ③).
 */
describe('손잡이 이름 — 목업 것으로 한 벌 (C4-7)', () => {

    const { FILTER_FIELDS, QUAD_FIELDS } = require("@onedal/shared");
    /** 라벨의 원천은 `FILTER_FIELDS` 하나다 */
    const labelOf = (path: string) => FILTER_FIELDS.find((f: any) => f.path === path)?.label;

    it('🔴 반경 이름이 목업 그대로다 — 현위반경 · 목적반경 · 라인반경', () => {
        expect(labelOf('pickupRadiusKm')).toBe('현위반경');
        expect(labelOf('destinationRadiusKm')).toBe('목적반경');
        expect(labelOf('detourRadiusKm')).toBe('라인반경');
        expect(QUAD_FIELDS.find((f: any) => f.path === 'quadRadiusKm').label).toBe('마름모반경');
    });

    it('🔴 목적지도 목업 이름이다', () => {
        expect(labelOf('destinationCity')).toBe('목적지');
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
 * 🥣 **그릇도 한 벌 — 값 다섯은 평면(`user_filters`) 한 곳에 산다**.
 *
 * 기사님: *"**개선되어 중복인건 그냥 삭제** 할꺼야."*
 *
 * 국면 행마다 그릇을 두면 **저장할 때마다 같은 값을 여러 번 쓰고**, 🔴 **이름이 두 벌이 된다** —
 * 국면 표와 평면(앱 피기백)이 같은 값을 다르게 부른다:
 *      `detour_allow_km`   ↔ `detourRadiusKm`
 *      `dropoff_radius_km` ↔ `destinationRadiusKm`
 *      `discount_pct`      ↔ `callDiscountPct`
 *    그 사이를 잇는 다리가 필요해진다. **그릇이 하나면 이을 것이 없다.**
 *    앱이 읽는 이름은 못 바꾸니 **평면 이름이 이긴다** (규칙 ③).
 */
describe('값 그릇 — 한 벌 (C3-3b)', () => {

    const db2 = codeOnly(read(join(SERVER, 'db.ts')));

    /** 🔴 값 다섯이 **평면 한 곳**에 산다 — 앱이 읽는 이름 그대로 */
    it('🔴 평면(user_filters)에 값 칸 다섯이 있다', () => {
        /* 🔴 컬럼 이름은 **표에서 뽑는다** — db.ts 에 손으로 나열하지 않는다 (규칙 ③) */
        expect(db2).toMatch(/const FILTER_VALUE_COLS[\s\S]{0,200}FILTER_FIELDS\.map/);
        expect(db2).toMatch(/ensureColumns\('user_filters', \{[\s\S]{0,200}FILTER_VALUE_COLS/);
        const { FILTER_FIELDS } = require("@onedal/shared");
        expect(FILTER_FIELDS.map((f: any) => f.col)).toEqual(
            ['destination_city', 'pickup_radius_km', 'detour_radius_km',
             'destination_radius_km', 'call_discount_pct']);
    });

    /** 🔴 국면 다섯 행이 없다 — 같은 값을 다섯 번 쓰던 자리다 */
    it('🔴 user_filter_phases 가 없다', () => {
        expect(db2).not.toMatch(/user_filter_phases/);
        expect(fm).not.toMatch(/user_filter_phases/);
    });

    /**
     * 🔴 **이름을 잇는 다리가 없다** — 그릇이 하나면 이을 것이 없다.
     *    `applyPhaseToFilter` 같은 함수는 **두 벌 이름 사이**를 옮기는 일이라, 있으면 두 벌이 살아 있다는 뜻이다.
     */
    it('🔴 이름을 잇던 함수들이 사라졌다', () => {
        const shared = require("@onedal/shared");
        for (const fn of ['applyPhaseToFilter', 'phaseFromFlat', 'phaseOfRow', 'phaseRowOf',
                          'normalizePhaseSettings', 'phaseStoreDiff', 'DEFAULT_PHASE_SETTINGS',
                          'PHASE_FIELDS', 'PHASE_FIELD_LABEL']) {
            expect(`${fn}: ${shared[fn] === undefined ? '없다' : '있다'}`).toBe(`${fn}: 없다`);
        }
    });

    /**
     * 🔴 **라벨도 한 곳이다** — 이름을 드는 표가 둘이면 갈라진다. 표가 하나면 라벨도 하나다 (규칙 ③).
     */
    it('🔴 라벨의 원천은 FILTER_FIELDS 하나다', () => {
        const { FILTER_FIELDS } = require("@onedal/shared");
        for (const f of FILTER_FIELDS) expect(typeof f.label).toBe('string');
        expect(modal).toMatch(/FILTER_FIELDS/);
        expect(modal).not.toMatch(/PHASE_FIELD_LABEL/);
    });

    /** 🔴 화면도 평면 통로 하나만 쓴다 — 국면 전용 통로가 없다 */
    it('🔴 국면 전용 저장 통로가 없다', () => {
        expect(modal).not.toMatch(/savePhase/);
        expect(hook).not.toMatch(/save-phase-settings/);
        expect(handlers).not.toMatch(/save-phase-settings/);
    });

    /**
     * 🔴 **«지금 무엇을 하나»는 남는다** (기사님이 남기라 하신 둘 중 하나).
     *    국면마다 다른 «값»이 없는 것이지 «지금 대기인지 콜 쥠인지 주행인지»가 없는 게 아니다.
     */
    it('🔴 «지금 무엇을 하나»(dispatchPhase)는 그대로다', () => {
        const shared = require("@onedal/shared");
        expect(typeof shared.deriveDispatchPhase).toBe('function');
        /* 문구를 고르는 장치도 남는다 — 값이 사라진 것이지 «지금 무엇을 하나»가 사라진 게 아니다 */
        expect(typeof shared.resolvePhaseKey).toBe('function');
        expect(shared.PHASE_LABEL).toBeDefined();
    });

    /** 🔴 관내는 파생이라 국면 키에도 `'local'` 이 없다 */
    it('🔴 국면 키에 local 이 없다', () => {
        const { PHASE_KEYS } = require("@onedal/shared");
        expect(PHASE_KEYS).toEqual(['first', 'merge', 'drive', 'home']);
    });
});

/**
 * 🏘️ **관내 — 목업처럼, 목적지를 안 잃는 파생**.
 *
 * 기사님: *"우린 집으로 갈건지 말껀지만 있어"* — 관내는 «고르는 것»이 아니라 파생이다.
 *
 * 🔴 **관내와 목적지 설정은 다른 일이다**:
 *      목적지를 「성남시」로  →  성남시를 **향하는** 콜 (**방향을 본다**)
 *      관내                  →  성남시 **안에서 끝나는** 콜 (**방향을 안 본다**)
 *    기사님이 이미 정하신 규칙이다 — *"관내콜은 거리로 하지 말자.
 *    그냥 상차지와 하차지가 같은 시도에 있으면."*
 *
 * 🔴 **목적지를 잃지 않는다.** 관내로 가느라 `destinationCity` 를 지금 시로 바꾸면(김포시 → 성남시)
 *    파생이 **기사님이 정한 목적지를 저절로 바꾼다.** 목적지는 그대로 두고 **재는 법만** 바꾼다.
 */
describe('관내 — 목적지를 안 잃는 파생 (C4-8b)', () => {

    /** 🔴 ② 값 — 판정은 shared 하나가 한다. 서버가 제 규칙을 또 세우지 않는다 (규칙 ③) */
    it('🔴 관내를 따로 재지 않는다 — «목적지 가까이 옴»(part.near)이 가른다 (2026-09-15 개정)', () => {
        const net = fm.slice(fm.indexOf('function netKeywordsOf'), fm.indexOf('function netKeywordsOf') + 6000);
        expect(net).toMatch(/part\.near/);
        expect(net).not.toMatch(/isLocalPhase\(/);
        expect(net).not.toMatch(/const localMode/);
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
     * 🔴 그리고 **목적지를 안 건드린다**.
     */
    it('🔴 그물이 목적지를 안 건드린다 — 관내라고 city 를 갈아치우지 않는다', () => {
        expect(fm).not.toMatch(/activeFilter\.localMode = /);
        // 관내라고 `city` 를 갈아치우지 않는다 — 넘어온 목적지를 그대로 쓴다
        const net = fm.slice(fm.indexOf('function netKeywordsOf'), fm.indexOf('function netKeywordsOf') + 3000);
        expect(net).not.toMatch(/city = /);
    });

    /**
     * 🔴 **방향을 안 본다** (기사님: *"관내콜은 거리로 하지 말자. 그냥 상차지와 하차지가
     *    같은 시도에 있으면"*). 관내 그물은 **목적지 원 안만**이다 (`callNet.judgeTwoStage` 의 local 과
     *    같은 원). 각도를 360° 로 바꿔 마름모를 원으로 만들면 그 원이 **마름모반경**이라 이천 관내에
     *    여주·용인 처인까지 든다. 라인(경로 양옆)은 동선일 때 끈다(`routeMode === false ? null : line`).
     */
    it('🔴 관내면 목적지 원 안만 — 각도 360° 우회를 안 쓴다', () => {
        const net = fm.slice(fm.indexOf('function netKeywordsOf'), fm.indexOf('function netKeywordsOf') + 4000);
        expect(net).not.toMatch(/local: /);
        expect(net).not.toMatch(/AngleDeg: 360/);
        expect(net).toMatch(/session\.activeFilter\.routeMode === false \? null : line/);
    });

    /**
     * 🔴 **관내로 가는 길은 하나(파생)다** — 손으로 바꾸는 길(`setCallTarget('LOCAL')`)을 두지 않는다.
     *
     * 기사님: *"개선되어 중복인건 그냥 삭제 할꺼야."*
     * **같은 일을 하는 길이 둘이면 언젠가 갈라진다** (경유 4벌 · 상태목록 3벌 · 시별칭).
     *
     * `callTarget` 은 **DB 에 없고**(메모리뿐) **앱(Kotlin)이 안 읽으므로**, `'DEST' | 'HOME'` 둘만 두어도
     * 남는 값이 없다.
     */
    it('🔴 고르는 국면은 둘뿐이다 — 노선 ↔ 복귀', () => {
        const shared = require("@onedal/shared");
        /* 타입은 런타임에 없으니 «그 값을 쓰는 코드»가 없는지로 본다 */
        const idx = codeOnly(read(join(CLIENT, '../../shared/src/index.ts')));
        expect(idx).toMatch(/export type CallTarget = 'DEST' \| 'HOME';/);
        expect(shared.CALL_TARGET_LABEL.LOCAL).toBeUndefined();
    });

    /** 🔴 관내로 가는 길이 **파생 하나**다 — 손으로 바꾸던 길이 없다 */
    it('🔴 옛 LOCAL 전환 길이 없다', () => {
        expect(modal).not.toMatch(/'LOCAL'/);
        expect(engine).not.toMatch(/'LOCAL'/);
        const ph = codeOnly(read(join(CLIENT, '../../shared/src/phases.ts')));
        expect(ph).not.toMatch(/=== 'LOCAL'/);
    });
});

/**
 * 💾 **저장은 두 갈래 — 메모리와 서버**.
 *
 * 기사님: *"오늘만, 계속, 평소값 **이것이 말이 안 되는것 같다**. **서버저장과
 * 메모리 저장** 뭐 이렇게만 있으면 될 것 같은데.. 목업처럼 사용자가 드레그 하면
 * **실시간으로 선택영역이 바뀌는거** 보여주고 **그냥 닫으면 앱메모리에 자동저장** 되는거지."*
 *
 * 🔴 **서버의 저장은 둘이다** — `activeFilter`(메모리) · `baseFilter`(DB).
 *    버튼도 둘(💾 서버 저장 · ↩︎ 되돌리기)이다 — 되돌리기를 셋째 저장처럼 부르면 헷갈린다.
 */
describe('저장 — 메모리와 서버 둘 (C4-10)', () => {

    const knob2 = codeOnly(read(join(CLIENT, 'components/ui/KnobGrid.tsx')));

    it('🔴 버튼이 둘이다 — 💾 서버 저장 · ↩︎ 되돌리기', () => {
        expect(modal).toMatch(/💾 서버 저장/);
        expect(modal).toMatch(/↩︎ 되돌리기/);
        /* 저장이 셋인 것처럼 부르는 이름이 없다 */
        expect(modal).not.toMatch(/오늘만/);
        expect(modal).not.toMatch(/평소값/);
        expect(modal).not.toMatch(/📌 계속/);
    });

    /** 🔴 값을 만지면 **바로** 메모리로 — 따로 누를 것이 없다 (기사님: *"그냥 닫으면"*) */
    it('🔴 값을 만지면 바로 메모리에 들어간다', () => {
        const commit = modal.slice(modal.indexOf('const commitValues'), modal.indexOf('const commitValues') + 600);
        expect(commit).toMatch(/updateFilter\(/);
        expect(commit).not.toMatch(/saveAsDefault/);   // 메모리는 DB 까지 안 간다
    });

    /**
     * 🔴 **슬라이더는 손가락을 뗄 때 한 번만 보낸다.**
     *
     * `input[type=range]` 의 `onChange` 는 **끄는 동안 픽셀마다** 발화한다. 실물은 값이
     * 바뀔 때마다 **서버가 경유 지역을 다시 그린다**(지리 연산 수 초) — 목업은 로컬이라
     * 괜찮지만 여기선 매 틱 그물 재계산으로 폭주한다.
     */
    it('🔴 슬라이더는 끄는 동안이 아니라 «뗄 때» 보낸다', () => {
        expect(knob2).toMatch(/onPointerUp/);
        expect(knob2).toMatch(/onCommit/);
        /* ± 는 한 칸이라 누르는 즉시 보내도 폭주가 없다 */
        /* 🔴 **값을 인자로 나른다** — `set` 과 같은 클릭 안에서 부르므로
              인자 없이 부르면 받는 쪽이 **한 칸 뒤처진 값**을 읽는다 */
        expect(knob2).toMatch(/onCommit\?\.\(v\)/);
        expect(knob2).toMatch(/onCommit\?: \(v: number\) => void/);
    });

    /**
     * 🔴 **«아직 서버에 없다»는 파생이다** — 손으로 든 깃발(`dirty`)을 두지 않는다.
     *    깃발은 켜고 끄는 것을 잊는 순간 거짓말을 한다 (규칙 ③).
     */
    it('🔴 «서버와 다르다»를 손으로 들지 않는다', () => {
        expect(modal).not.toMatch(/setDirty\(/);
        expect(modal).toMatch(/const unsaved/);
    });
});

/**
 * 🎚️ **끄는 동안 영역이 바뀐다 — 화면과 서버를 두 갈래로**.
 *
 * 기사님: *"값을 조절할때 움직일때 **영역을 바꿔 주면 좋겠어**.
 * 그래야 그걸 보고 **한번에 조절** 하니까."*
 *
 * 🔴 **지도는 서버를 안 기다린다** — 영역 도형은 클라가 필터 값에서 바로 그리므로
 *    (`quadShapeFrom(filter)`) 낙관적 `setFilter` 만으로 그 자리에서 다시 그려진다.
 *    소켓으로 보내면 서버가 경유 지역을 다시 그려(지리 연산 수 초) 폭주한다.
 * 🔴 그러니 갈라야 하는 것은 «언제 그리나»가 아니라 **«언제 소켓으로 보내나»** 다.
 *    끄는 동안은 `previewFilter`(화면만), 뗄 때 `updateFilter`(서버로).
 */
describe('끄는 동안 영역이 바뀐다 (C4-11)', () => {
    const hook = read(join(CLIENT, 'hooks/useFilterConfig.ts'));

    it('🔴 «화면만» 통로가 따로 있다 — 소켓을 안 탄다', () => {
        expect(hook).toMatch(/previewFilter/);
        /* 그 함수 안에는 emit 이 없어야 한다 — **그 블록만 잘라** 본다 */
        const i = hook.indexOf('const previewFilter');
        expect(i).toBeGreaterThan(-1);
        const body = hook.slice(i, hook.indexOf('};', i));
        expect(body).toMatch(/setFilter\(/);
        expect(body).not.toMatch(/socket\.emit/);
    });

    it('🔴 슬라이더는 끄는 동안 «화면만» 을 부른다', () => {
        const i = modal.indexOf('const previewValues');
        expect(i).toBeGreaterThan(-1);
        /* ⚠️ **함수 끝까지만** 자른다 — 글자 수로 자르면 **다음 함수를 문다**
              (실측: 400자에 `commitValues` 가 딸려 와 거짓 빨간불이 났다) */
        const body = modal.slice(i, modal.indexOf('\n    };', i));
        expect(body).toMatch(/previewFilter\(/);
        /* 끄는 동안 서버로 보내면 폭주한다 */
        expect(body).not.toMatch(/updateFilter\(/);
    });

    it('🔴 «뗄 때» 는 여전히 서버로 간다 — 새로고침에 안 사라진다', () => {
        const i = modal.indexOf('const commitValues');
        const body = modal.slice(i, modal.indexOf('\n    };', i));
        expect(body).toMatch(/updateFilter\(/);
    });

    it('🔴 손잡이가 «끄는 동안»과 «뗄 때» 를 둘 다 받는다', () => {
        const knob = codeOnly(read(join(CLIENT, 'components/ui/KnobGrid.tsx')));
        expect(knob).toMatch(/onPreview\?: \(v: number\) => void/);
        /* onChange 는 화면만 · onPointerUp 은 서버로 */
        expect(knob).toMatch(/onChange=\{e => \{[^}]*onPreview/);
    });
});

/**
 * 🧾 **요약줄의 «N 읍면동» 은 원달앱에 내려간 하차 목록 수다**.
 *
 * 지도는 영역 도형만 그리고 동을 세지 않는다 — 그래서 숫자는 서버 목록(`destinationKeywords`)
 * 하나에서 온다 (규칙 ③).
 */
describe('요약줄 «N 읍면동» — 서버 하차 목록 수 (2026-09-15)', () => {
    const status = read(join(CLIENT, 'components/dashboard/OrderFilterStatus.tsx'));
    const store = read(join(CLIENT, 'stores/filterStore.ts'));

    it('🔴 옛 그물 수 칸이 없다 · 요약줄은 destinationKeywords 를 센다', () => {
        expect(store).not.toMatch(/netCount/);
        const i = status.indexOf('const regionCount');
        expect(i).toBeGreaterThan(-1);
        const line = status.slice(i, status.indexOf(';', i));
        expect(line).toMatch(/destinationKeywords/);
        expect(line).not.toMatch(/netCount/);
    });

    /**
     * 🔴 **화면 맞춤은 영역을 감싼 «흔들리지 않는 네모»를 본다** — 막는 것: 영역이 화면 밖으로 잘림 · 달리는 동안 «전체» 화면이 줄었다 늘었다 함 (#150).
     *    마름모를 그대로 넣으면 300m 눈금 · «가까이 옴»으로 확대가 매번 다시 잡히고, 빼면 영역이 잘린다 — 네모는 `stickyFitBox` 가 쥔다.
     */
    it('🔴 화면 맞춤에 영역 네모를 넣되 흔들리지 않는 네모로 — 마름모 점을 그대로 넣지 않는다', () => {
        const canvas = codeOnly(read(join(CLIENT, 'components/dashboard/PinnedRouteCanvas.tsx')));
        const i = canvas.indexOf('const allCoords');
        const fit = canvas.slice(i, canvas.indexOf('if (allCoords.length === 0)', i));
        expect(fit).toMatch(/stickyFitBox\(fitBoxRef\.current, areaBoxOf\(/);
        expect(fit).not.toMatch(/for \(const q of dropoffArea\.quads\)/);
        expect(fit).toMatch(/dropoffArea\.goals/);
    });

    it('🔴 옛 «그물» 레이어 · 훅이 없다 — 지도는 «상차» · «하차» 레이어만', () => {
        expect(require('fs').existsSync(join(CLIENT, 'hooks/useCallNet.ts'))).toBe(false);
        const canvas = codeOnly(read(join(CLIENT, 'components/dashboard/PinnedRouteCanvas.tsx')));   // 주석에 적힌 netOverlay 설명은 세지 않는다
        expect(canvas).not.toMatch(/netOverlay/);
        expect(canvas).not.toMatch(/\['net', '그물'\]/);
    });
});

/**
 * 📥 **필터를 열면 폼이 «지금 값»으로 채워진다**.
 *
 * 🔴 **블록을 잘라 지울 때 이 `useEffect` 가 딸려 사라지기 쉽다** — «다음 const 까지»로 자르면
 *    그 사이에 낀 블록이 함께 지워진다.
 *
 * 🔴 **없으면 무엇이 터지나**: 폼이 `DEFAULT_FILTER_VALUES` 로 서고(목적지 **빈칸**),
 *    슬라이더를 하나만 만져도 `toValues` 가 그 빈 목적지를 그대로 실어 보낸다
 *    (`toValues` 의 «이전 값 그대로» 보호는 **숫자에만** 걸린다 — `spec.text` 는 통과).
 *    기사님이 맞춰 두신 목적지(파주시)가 **메모리에서 사라진다.**
 *
 * 🔴 **그래서 검사는 «있나»가 아니라 «무엇을 채우나»를 본다** — 한 줄만 살아남고
 *    나머지가 빠져도 초록이 되면 이 사고를 못 잡는다.
 */
describe('필터를 열면 폼이 지금 값으로 채워진다 (#108)', () => {
    it('🔴 모달이 열릴 때 filter 로 폼을 채우는 자리가 있다', () => {
        expect(modal).toMatch(/isOpen && filter/);
        expect(modal).toMatch(/setForm\(toForm\(filterValuesFrom\(filter as any\)\)\)/);
    });

    it('🔴 값 다섯뿐 아니라 마름모·제외지역·제외단어까지 함께 채운다', () => {
        const i = modal.indexOf('if (isOpen && filter)');
        expect(i).toBeGreaterThan(-1);
        /* **그 블록만** 본다 — 파일 전체를 훑으면 다른 자리의 같은 글자에 걸려 거짓 초록이 된다 */
        const body = modal.slice(i, modal.indexOf('\n    }, [isOpen', i));
        expect(body).toMatch(/fillQuad\(filter\)/);
        expect(body).toMatch(/setExDraft\(filter\.excludedRegions/);
        expect(body).toMatch(/setBlacklist\(/);
    });

    it('🔴 «담아 두는» 깃발 셋을 함께 끈다 — 열자마자 «변경됨»이면 거짓말이다', () => {
        const i = modal.indexOf('if (isOpen && filter)');
        const body = modal.slice(i, modal.indexOf('\n    }, [isOpen', i));
        expect(body).toMatch(/setQuadDirty\(false\)/);
        expect(body).toMatch(/setExDirty\(false\)/);
        expect(body).toMatch(/setBlacklistDirty\(false\)/);
    });
});

/**
 * 🧾 **요약줄이 «몇 개 동이 걸리나»를 말한다 — 지역 카드는 두지 않는다**.
 *
 * 기사님: *"이건 **지도의 영역으로 표시 되는거라 없어져도 될꺼 같고**
 * 필터 상태바에 「노선행 · 여기서 10km → 파주시 15km · **200읍면동**」 이렇게 표현해 주면
 * 될듯 한데."*
 *
 * 🔴 **값을 만지면 지도가 그 자리에서 바뀐다** — 그러니 「🔍 지금 값으로 미리보기」 버튼이
 *    할 일이 없다. 동 수 카드와 시·군·구 칩도 **지도가 이미 그리는 것을 글자로 또
 *    적는 것**이라 두지 않는다. 시군구별 내역이 필요하면 현황판의 「🗂️ 영역 — 시군구별」 칸에 있다.
 */
describe('요약줄 — 몇 개 동이 걸리나 (C4-9)', () => {

    const status = codeOnly(read(join(CLIENT, 'components/dashboard/OrderFilterStatus.tsx')));

    it('🔴 요약줄이 읍면동 수를 말한다', () => {
        expect(status).toMatch(/읍면동/);
        expect(status).toMatch(/destinationKeywords/);
    });

    /** 🔴 노선·동선을 바꾸면 요약줄도 바뀐다 — 필터 창과 같은 값(`filter.routeMode`)을 읽는다 */
    it('🔴 요약줄이 노선·동선을 말한다', () => {
        expect(status).toMatch(/filter\.routeMode/);
        expect(status).toMatch(/동선/);
    });

    /**
     * 🔴 **적재는 맨 위 헤더에 이미 있다** (`1t 예약 3 📦 90/100`) — 두 번 적을 자리가 아니다.
     *    한 화면에 같은 말이 두 번 있으면 그게 거짓말이 될 자리를 만든다 (규칙 ③).
     */
    it('🔴 요약줄에 적재가 없다 (헤더와 중복)', () => {
        expect(status).not.toMatch(/TRUCK_CAPACITY_SLOTS/);
        expect(status).not.toMatch(/slotsUsed/);
    });

    /** 🔴 지도가 그리는 것을 글자로 또 적지 않는다 */
    it('🔴 필터에 지역 카드와 미리보기가 없다', () => {
        expect(modal).not.toMatch(/미리보기/);
        expect(modal).not.toMatch(/previewRegions/);
        expect(modal).not.toMatch(/previewCount/);
        expect(modal).not.toMatch(/REGION_CARD/);
    });
});

/**
 * 🗂️ **디자인을 목업처럼 — 순서와 3칸 격자**.
 *
 * 기사님 지시: *"**디자인은 목업처럼 해주면 되고**"* (목업 왼쪽 패널 스크린샷과 함께).
 * 원본은 `MapMockup.tsx` 의 왼쪽 패널이다.
 */
describe('필터 디자인 — 목업 순서 (C4-6)', () => {

    /** 🔴 기사님: *"적재는 상태값이니 필요 없고"* — 요약줄이 이미 `📦 90/100` 을 말한다 */
    it('🔴 적재 패널이 없다 (상태값이라 손잡이가 아니다)', () => {
        expect(modal).not.toMatch(/📦 적재/);            // 조작판 제목
        expect(modal).not.toMatch(/i < slotsUsed/);      // 칸 막대 그래프
        expect(modal).not.toMatch(/만재로 추정/);         // 추정 안내
        /**
         * ⚠️ `capacityConfidence` 는 맨 아래 🩺 **모니터**에 남아 있다 — 그건 손잡이가 아니라
         *    «지금 앱에 내려가 있는 값»을 그대로 비추는 **확인창**이라 걷을 것에 안 든다.
         *    그래서 **개수가 아니라 «자리»로** 본다: 조작판 구역(저장 버튼 앞)에 없으면 된다.
         */
        /* ⚠️ 기준점은 «💾 서버 저장» — 조작판 구역이 그 버튼 앞에서 끝난다 (저장은 둘뿐이다) */
        const body = modal.slice(0, modal.indexOf('💾 서버 저장'));
        expect(body).not.toMatch(/capacityConfidence/);
    });

    /**
     * 🔴 **콜할인율도 같은 고르기 칸이다** (기사님: *"이 부분도 디자인에 맞춰
     *    이쁘게 바꿔줘"*). 차종별 하한표는 **레이어 «안»**에 있다 —
     *    늘 펴 두면 폰에서 필터가 화면을 다 먹는다.
     * ⚠️ 하한표는 레이어 안에서 읽을 수 있게 둔다 (기사님: *"읽을 수 있게 통로를 열어 줘야지"*).
     */
    it('🔴 콜할인율이 고르기 칸 하나다 — 단가표는 레이어 안', () => {
        expect(modal).toMatch(/<PickLayer label="💰 콜할인율"/);
        // 버튼 다섯을 늘 펴 두는 격자가 없다
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
     *    목록만 남기면 **기능이 준다**. 기사님: *"제외 단어는 입력이 필요하다."*
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
     */
    it('🔴 순서가 목업 그대로다 — 목적지 → 그물 → 반경 → 값 → 제외지역', () => {
        const at = (re: RegExp) => { const m = modal.match(re); return m ? modal.indexOf(m[0]) : -1; };
        /**
         * 🔴 **복귀 토글은 저장 줄에 있다 — 순서 줄에서는 뺀다.**
         *
         * 고르는 것은 «집으로 갈지 말지» 하나다(`homeOn`). 목적지 줄 «안»에 두면 그 행이
         * **접힌 채로** 열려 «펼치기 → 누르기» 두 겹이 된다 — 운행 중 가장 자주 만지는 스위치라
         * 가장 얕아야 한다. 저장 줄은 스크롤 밖에 늘 붙어 있어
         * **필터를 열면 바로 보이고 한 번에 눌린다.**
         * ⚠️ 모달 **밖**에는 두지 않는다 — 지도 위에 있으면 운전 중 스쳐서 켜진다.
         */
        const 국면 = at(/const homeOn = /);
        const 저장줄 = at(/data-save-bar/);
        const 노선동선 = at(/🛣️ 노선/);
        const 목적지 = at(/<PickLayer label="🎯 시·도"/);
        /* 🔴 `QUAD_FIELDS.map` 은 폼 초기화에도 나온다 — **그리는 쪽**을 집는다 */
        const 그물 = at(/knobs=\{QUAD_FIELDS\.map/);
        const 반경 = at(/KNOB_FIELDS\.map/);
        const 값 = at(/<PickLayer label="💰 콜할인율"/);
        const 제외지역 = at(/<PickLayer label="⛔ 시·도"/);
        for (const [name, v] of Object.entries({ 국면, 저장줄, 노선동선, 목적지, 그물, 반경, 값, 제외지역 })) {
            expect(`${name}: ${v >= 0 ? '있다' : '없다'}`).toBe(`${name}: 있다`);
        }
        const order = [노선동선, 목적지, 그물, 반경, 값, 제외지역];
        expect(order.join(' < ')).toBe([...order].sort((a, b) => a - b).join(' < '));
        /* ↩️ 복귀는 저장 줄 «안»이다 — 접히는 행에 두면 다시 두 겹이 된다 */
        expect(`복귀가 저장 줄 안: ${국면 > 저장줄 ? '맞다' : '아니다'}`).toBe('복귀가 저장 줄 안: 맞다');
    });
});

/**
 * 🪗 **필터는 팝업이 아니다 — 한 줄과 열림뿐이다**.
 *
 * 기사님 (목업을 만들며 그 **이유**를 통째로 말씀하셨다):
 * > *"실 프로젝트에서 **필터를 한 줄로 하고 열리고 닫히고** 하는데, **열려 있을 때 또 팝업이
 * >   뜬다. 그 UI 가 별로다. 팝업을 삭제하고 한 줄과 열림만 있으면 될 것 같아서** 이걸 하고
 * >   있는 거야. 핸드폰 UI 로 편하게 입력이 가능해야 — **작은 면적에 필요한 것만 잘
 * >   디스플레이**하고 싶다."*
 *
 * 🔴 **층은 둘이다** — 한 줄, 그리고 그 자리에서 열리는 필터. 전면 팝업을 셋째 층으로 얹으면
 *    ⚙️ 를 누를 때 이미 펼쳐 놓은 것 위로 또 덮는다.
 *
 * ⚠️ **«팝업»과 «레이어»는 다른 물건이다.** 쓰지 않는 것은 화면을 덮는 `Dialog` 이고,
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
     * 🔴 **안 열렸으면 만들지 않는다.** `Dialog` 처럼 닫혀 있어도 자식을 살려 두면
     *    소켓 구독과 도시 목록 요청이 내내 돈다. 제자리 열림은 **훅 뒤에서** 끊는다
     *    (훅 순서는 지켜야 하므로 `return null` 은 훅을 다 부른 뒤다).
     */
    it('🔴 닫혀 있으면 본문을 만들지 않는다', () => {
        expect(modal).toMatch(/if \(!isOpen\) return null;/);
    });

    /** 🔴 닫는 길이 있다 — `onClose` 로 한 줄로 돌아간다 */
    it('🔴 닫는 길이 있다', () => {
        const panel = modal.slice(modal.indexOf('if (!isOpen) return null'));
        expect(panel).toMatch(/onClose/);
    });
});

/**
 * 🔴 **국면 전환의 입구는 하나다** — 필터 안 «↩️ 복귀» 버튼(`goPhase`).
 *
 * 입구가 둘이면 둘이 다르게 돈다 — 한쪽만 확인 절차를 갖거나, 한쪽이 `onClose()` 를 불러
 * **저장 안 한 값을 조용히 버린다.** 반경을 고치고 전환하면 화면의 숫자와 실제 콜 잡기 기준이 달라진다.
 */
describe('국면 전환 — 입구는 하나, 확인창을 거친다', () => {

    const status = codeOnly(read(join(CLIENT, 'components/dashboard/OrderFilterStatus.tsx')));
    const dash2 = codeOnly(read(join(CLIENT, 'pages/Dashboard.tsx')));

    /**
     * 🔴 **잣대는 «어디에 있나»가 아니라 «무엇을 막나»다.**
     *
     * 입구는 필터 안 «↩️ 복귀» 버튼 하나다 (기사님: *"지금은 열림에 열림이 두번이야. **한줄에 열림 하나만 있으면 되.**"*).
     * 확인창 없이 바로 바꾼다 (기사님: *"복귀를 클릭하면 알럿창 뜨는데 그거 필요 없겠다"*) — 입구가 하나라
     * 다른 입구가 확인 절차를 우회할 일이 없다 (아래 «쏘는 곳이 한 곳뿐»).
     * 🔴 막는 것은 **전환이 `onClose()` 를 불러 저장 안 한 값을 버리는 것**이다.
     */
    /**
     * 🏠 **복귀는 색만이 아니라 글자로도 말한다** (기사님 2026-09-23:
     *    *"여기서 복귀 켬 하면 색만 변하는데 복귀 첫짐 탐색중 으로 텍스트도 같이 바꿔줘"*).
     *
     * 🔴 운전 중에는 먼발치에서 1~2초에 읽혀야 한다 — 주황색 하나로는 «복귀 중인가»를 못 읽는다.
     */
    it('🔴 복귀면 상태 줄에 «복귀» 가 붙는다 — 색만 바뀌지 않는다', () => {
        expect(status).toMatch(/phase === 'HOME' \? '복귀 ' : ''/);
        /* 🔴 하차 대기에는 안 붙는다 — 지금 하는 일이지 어디로 가는 길인가가 아니다 */
        const i = status.indexOf("'하차 대기'");
        expect(i).toBeGreaterThan(-1);
        expect(status.slice(i, i + 40)).not.toMatch(/복귀/);
    });

    it('🔴 국면 전환은 확인창 없이 바로 쏜다 (기사님 2026-09-15)', () => {
        const go = modal.slice(modal.indexOf('const goPhase'), modal.indexOf('const goPhase') + 900);
        expect(go).not.toMatch(/confirm\(/);
        expect(go).toMatch(/set-call-target/);
    });

    /** 🔴 **전환이 열린 필터를 닫지 않는다** — 저장 안 한 값이 조용히 사라지면 안 된다 */
    it('🔴 전환이 필터를 닫지 않는다 (저장 안 한 값을 버리지 않는다)', () => {
        const go = modal.slice(modal.indexOf('const goPhase'), modal.indexOf('const goPhase') + 900);
        expect(go).not.toMatch(/onClose\(\)/);
    });

    /** 🔴 **입구는 하나다** — 두 곳에서 쏘면 둘이 다르게 돈다 (한쪽만 확인을 갖거나 값을 버린다) */
    it('🔴 국면을 쏘는 곳이 한 곳뿐이다', () => {
        expect(status).not.toMatch(/set-call-target/);
        expect((modal.match(/set-call-target/g) || []).length).toBe(1);
    });

    /**
     * 🔴 **열림은 하나다** (기사님: *"한줄에 열림 하나만 있으면 되"*).
     *    요약줄은 **늘 한 줄**이고, 열리는 것은 필터뿐이다.
     */
    /**
     * 🔴 **고르는 것은 «집으로 갈지 말지» 하나다** (기사님 확정:
     *    *"[🧭 국면 🎯 노선행] **우린 집으로 갈건지 말껀지만 있어**"*).
     *
     * 기사님이 고르시는 것은 `homeOn`(↩️ 복귀 켬/끔) **하나**이고, `callTarget` 은 그것의 **파생**이다:
     *
     *     callTarget = homeOn ? 'HOME' : 'DEST'
     *
     * 관내는 고르는 것이 아니라 «목적지 가까이 옴»에서 파생한다 (위 관내 검사).
     */
    it('🔴 필터에서 고르는 것은 «집으로 갈지 말지» 하나다', () => {
        expect(modal).toMatch(/↩️ 복귀/);
        // 셋 중 고르는 칸이 없다
        expect(modal).not.toMatch(/<PickLayer label="🧭 국면"/);
        expect(modal).not.toMatch(/TARGET_SHORT/);
    });

    /**
     * 🔴 **관내 표시는 없다** (기사님) — 관내는 국면이 아니라
     *    *"그쪽에 도착했으니 다른 곳을 정하지 않았으면 그곳에서 일 있으면 하자"* 이다.
     *    따로 재지 않으니 «지금 관내로 재고 있다»고 말할 것도 없다 (목적지 가까이 옴 `filterArea.withNearness`).
     */
    it('🔴 필터 판에 관내 표시가 없다', () => {
        expect(modal).not.toMatch(/🏘️/);
    });

    /**
     * 🔴 **노선 ↔ 동선 토글은 필터에 있다** (기사님 지시:
     *    *"노선 동선 버튼도 지도에서 필터로 이사와야해"*). **목업과 같은 자리다** —
     *    필터 맨 위, 목적지 줄 바로 위.
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

    it('🔴 집으로 가는 콜을 서버가 지어내는 입구가 없다 — 배차망에서 뜨는 진짜 콜을 잡는다', () => {
        /* 복귀는 목적지 한 칸이 느는 것일 뿐이다 (기사님 확정) —
           목적지행 첫콜을 잡는 것과 다르지 않으니 운임 0원 가상 오더를 만들 자리가 없다 */
        expect(modal).not.toMatch(/create-home-return/);
        expect(modal).not.toMatch(/귀가콜/);
        expect(engine).not.toMatch(/createHomeReturn/);
        expect(handlers).not.toMatch(/home-return/);
    });
});

/**
 * 🔴 **국면 전환은 반경을 보내지 않는다 — 반경의 원천은 필터 값 하나다.**
 *
 * `setCallTarget` 가 `baseFilter.destinationRadiusKm` 를 같이 실어 보내면, 그 값이 `changes` 에 있어
 * "기사님이 방금 고친 값" 으로 보호까지 받아 저장해 둔 반경(첫짐 하차 7km)이 평소값(1km)으로 덮인다.
 * 원천이 둘이면 늘 이렇게 끝난다.
 */
describe('국면 전환 — 반경은 국면 설정만이 정한다', () => {

    const fn = engine.slice(engine.indexOf('export async function setCallTarget'));
    const body = fn.slice(0, fn.indexOf('\nexport '));

    it('🔴 setCallTarget 는 destinationRadiusKm 를 보내지 않는다', () => {
        expect(body).not.toMatch(/destinationRadiusKm:/);
        expect(body).not.toMatch(/baseFilter\.destinationRadiusKm/);
    });

    /**
     * 🔴 **국면 전환은 도시를 안 보낸다.** `destinationCity` 를 실어 HOME 이면 집 시로 덮어쓰면,
     *    돌아올 때 `activeFilter || baseFilter` 가 이미 덮인 값에서 끝나 **목적지(파주)가 집 시(광주)로 굳는다.**
     *    그물이 향하는 시는 `filterManager.goalCityOf` 가 `callTarget` 에서 **파생**한다.
     *    «어디로 가는가»는 여기서만 정한다 — 그 답이 `callTarget` 하나다.
     */
    it('국면 전환은 "어디로 가는가"만 정한다 (callTarget 하나 — 도시는 파생이다)', () => {
        expect(body).toMatch(/callTarget: phase/);
        expect(body).not.toMatch(/destinationCity: city!/);
    });

    /** 값이 한 벌이라 돌아갈 도시는 오늘값이 먼저, 없으면 평소값이다 */
    it('🔄 돌아갈 때의 도시는 오늘값이 먼저, 없으면 평소값', () => {
        expect(body).toMatch(/session\.activeFilter\.destinationCity/);
        expect(body).toMatch(/session\.baseFilter\.destinationCity/);
    });

    /**
     * 🔴 **반경을 바꾸면 `updateActiveFilter` 가 `refreshDetourIfNeeded` 를 부른다** — 부르는 곳이 없으면
     *    반경을 바꿔도 지역 목록이 다시 그려지지 않아, «하차 0km» 라고 적힌 채
     *    **바뀌기 전 목록으로 거른다.**
     */
    it('🔴 반경이 바뀌면 지역 목록도 다시 그린다 (안 그리면 옛 목록으로 거른다)', () => {
        const upd = fm.slice(fm.indexOf('export function updateActiveFilter'));
        expect(upd).toMatch(/refreshDetourIfNeeded\(session, userId, before\)/);
        expect(upd).toMatch(/recalculateDerivedFields\(session, changes, userId\)/);
    });
});

/**
 * 🔴 경유은 **반경이 바뀌면 다시 그려야 한다.**
 *
 * 숫자만 바꾸고 지역 목록을 그대로 두면 "경유 5km" 라고 적힌 채 바뀌기 전 1km 목록으로 거른다.
 * 조용히 틀리는 종류라 눈치채기까지 오래 걸린다.
 */
describe('경유 갱신 — 구현은 하나여야 한다', () => {

    /**
     * 🔴 **값이 바뀌는 한 곳이 부른다** — 부르는 길이 둘이면 «한쪽만 고쳐지는» 일이 난다 (규칙 ③).
     */
    it('🔄 값이 바뀌면 경유를 다시 그린다 — 부르는 곳은 하나다', () => {
        expect(fm).toMatch(/refreshDetourIfNeeded\(session, userId, before\)/);
        expect((fm.match(/refreshDetourIfNeeded\(session/g) || []).length).toBe(1);
    });

    it('반경이 그대로면 다시 그리지 않는다 (지리 연산은 CPU ~7초짜리다)', () => {
        const fn = fm.slice(fm.indexOf('function refreshDetourIfNeeded'), fm.indexOf('function applyPhaseSettingsIfChanged'));
        expect(fn).toMatch(/before\.detourRadiusKm/);
        expect(fn).toMatch(/return/);
    });

    it('🔴 경로가 없으면 아무것도 넣지 않는다 (없는 값을 지어내지 않는다)', () => {
        const fn = fm.slice(fm.indexOf('function refreshDetourIfNeeded'), fm.indexOf('function applyPhaseSettingsIfChanged'));
        expect(fn).toMatch(/if \(!kept\?\.line\) return/);   // 라인이 없으면 안 넣는다
    });

    it('🔴 셋을 한 벌로 넣는다 — 별칭이 빠지면 앱의 2단계 필터가 조용히 꺼진다', () => {
        const fn = fm.slice(fm.indexOf('function refreshDetourIfNeeded'), fm.indexOf('function applyPhaseSettingsIfChanged'));
        /* 🚫 앞 둘은 제외를 뺀 `kept` 에서 온다 — 셋이 **함께** 들어간다는 것이 요점이다 */
        expect(fn).toMatch(/destinationKeywords = kept\.flat/);
        expect(fn).toMatch(/destinationGroups = kept\.grouped/);
        expect(fn).toMatch(/customCityFilters = kept\.aliases/);   // 별칭도 그물 목록의 시들에서 온다
    });

    it('🔴 recalculateDetourFilter 의 구현은 하나다 — dispatchEngine 은 다시 내보내기만 한다', () => {
            expect(engine).toMatch(/export \{ recalculateDetourFilter \} from "\.\.\/state\/filterManager"/);
        expect(engine).not.toMatch(/export const recalculateDetourFilter/);
        // 소켓은 이 계산을 직접 부르지 않는다 — 반경 변경은 refreshDetourIfNeeded 가 그물로 그린다
        expect(handlers).not.toMatch(/recalculateDetourFilter\(/);
    });

    it('경유을 부르는 자리가 늘어나도 계산은 filterManager 한 곳이다', () => {
        /**
         * 🔴 **0 이다** — dispatchEngine 은 지역 목록을 직접 계산하지 않는다.
         *    «목적이 다르니 하나는 괜찮다»로 한 벌을 따로 두면 조건을 더할 때 **한쪽만 고쳐지고**,
         *    출발하는 순간 다른 쪽이 돌면서 목록을 되돌린다.
         */
            expect((engine.match(/getDetourRegions\(/g) || []).length).toBe(0);
    });
});

/**
 * 🚫 **제외 지역 — 국면 밖 한 벌**.
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
        /* 목록을 만드는 길이 전부 netKeywordsOf 를 지나므로 빼는 자리는 **정확히 하나**다 */
        expect((fm2.match(/pruneExcludedRegions\(/g) || []).length).toBe(1);
    });

    /**
     * 🔓 **«손으로 고쳤다»고 목록을 얼리지 않는다** (기사님 실측 2026-09-23)
     *
     * 그전에는 `userOverrides && 콜 있음` 이면 하차 목록 갱신을 통째로 건너뛰었다.
     * 그 깃발을 켜는 것은 **「빼는 곳」과 「제외 단어」를 저장할 때뿐**인데, 빼신 곳은
     * 목록을 만들 때마다 `pruneExcludedRegions` 가 매번 걸러 주므로 얼릴 까닭이 없었다.
     *
     * 실측: 기사님이 «서울 전체»를 빼시자 하차 목록이 **913곳에 얼어붙어**, 목적지를
     * 김포로 바꾸셔도 이천 시절 동(가남읍·음성읍)이 라인반경 밖에 남았다. 상차 목록은
     * 이 잠금을 안 받아 계속 갱신되니 **상차와 하차가 다른 시점**을 보았다.
     * 기사님: *"서울은 내가 넣은것이 맞는데 내 의도와 완전 다르게 작동한거 아냐 버그지."*
     */
    it('🔴 목록 갱신을 건너뛰는 잠금이 없다 — 빼신 곳은 매번 걸러서 지킨다', () => {
        expect(fm2).not.toMatch(/userOverrides && getActiveCalls/);
        expect(fm2).not.toMatch(/경유 고정/);
        /* 🔴 그래도 빼는 자리는 그대로 하나다 (위 검사와 한 벌) */
        expect(fm2).toMatch(/pruneExcludedRegions\(/);
    });

    it('🔴 판별 규칙을 서버가 또 쓰지 않는다 (shared 함수 하나로만)', () => {
        // `S|`·`R|`·`D|` 키 문법을 서버가 직접 뜯어보면 그 순간 규칙이 두 벌이다
        expect(fm2).not.toMatch(/startsWith\('[SRD]\|'\)/);
        expect(fm2).not.toMatch(/`D\|\$\{/);
    });

    /**
     * 🔴 **제외를 고쳐도 목록이 안 줄면 화면이 거짓말한다**.
     *
     * 지리 연산은 무거워서 «도시·반경이 바뀔 때만» 다시 돈다. 제외 지역은 그 조건에 없어서,
     * 제외를 고칠 때 목록을 다시 안 만들면 서울을 통째로 빼고 저장해도 **「도착목표 N개 동」이 그대로다.**
     * DB 에는 남고 화면 칩도 생기는데 판정이 쓰는 목록만 바뀌기 전 것이다 — 규칙 ⑤-4 ④ 가 금지하는 모양이다.
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
     * 🔴 **서버는 `APP_FILTER_KEYS` 로 골라 싣는다** — 표에 없으면 안 간다.
     *    표 ↔ 앱(Kotlin) 대조는 `appFilterKeys.test.ts` 가 따로 잠근다.
     */
    it('제외 지역은 앱에 안 내려간다 — 서버가 목록에서 이미 뺐다 (명세 §3)', () => {
        const { APP_FILTER_KEYS } = require("@onedal/shared");
        expect((APP_FILTER_KEYS as readonly string[]).includes('excludedRegions')).toBe(false);
    });
});

/**
 * 🕸️ **그물 계산은 한 벌이다**.
 *
 * 기사님 확정: **«실험실 것으로 통일»**. 서버가 제 계산(`geoService` 의 turf 폴리곤 버퍼)을
 * 따로 쓰면 **화면과 판정이 다른 답을 낸다** — 「화면은 든다는데 판정은 탈락」
 * (규칙 ⑤-3 — 색이 곧 결정).
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
     * 🔴 **내 위치를 모르면 도시 둘레(`getCityRegionsWithRadius`)로 물러선다** — 첫짐 그물은 내 위치가 꼭짓점이라
     *    없으면 못 그린다. **빈 목록은 «제한 없음»이 아니라 고장**이다 (규칙 ④).
     */
    it('🔴 내 위치가 없으면 도시 둘레로 물러선다 (비우지 않는다)', () => {
        const fn = fm3.slice(fm3.indexOf('function netKeywordsOf'), fm3.indexOf('function netKeywordsOf') + 1400);
        expect(fn).toMatch(/origin/);
        expect(fn).toMatch(/getCityRegionsWithRadius/);   // 물러설 자리
    });

    it('🔴 마름모 모양은 평면 필터에서 온다 — 화면이 그리는 그 값이다', () => {
        const fn = fm3.slice(fm3.indexOf('function netKeywordsOf'), fm3.indexOf('function netKeywordsOf') + 1400);
        expect(fn).toMatch(/quadShapeFrom\(/);
    });

    /**
     * 🔴 **지도의 제외 지역** — 지도는 영역 도형만 그리고 동 점을 찍지 않는다.
     *    그래서 제외는 서버 목록(`pruneExcludedRegions` 한 곳)에만 산다 — 지도가 동 점을 찍으면
     *    제외도 따로 보여야 하고, 서버만 빼면 화면이 «든다»고 거짓말한다.
     */
    it('🔴 지도는 동 점을 안 찍는다 — 제외는 서버 목록 한 곳', () => {
        const stage = codeOnly(read(join(CLIENT, 'components/stage/StageView.tsx')));
        expect(stage).not.toMatch(/useCallNet/);
        expect(stage).not.toMatch(/netOverlay/);
    });

    it('🔴 제외 지역은 여전히 pruneExcludedRegions 한 곳이 뺀다', () => {
        // 그물로 바꿔도 빼는 자리는 안 늘어난다 (규칙 ③)
        /* 목록을 만드는 길이 전부 netKeywordsOf 를 지나므로 빼는 자리는 **정확히 하나**다 */
        expect((fm3.match(/pruneExcludedRegions\(/g) || []).length).toBe(1);
    });
});

/**
 * 📏 **「라인반경」은 「우회 허용」과 다른 값이다** (목업 이름 · 기사님 이름 확정: «라인 반경»).
 *
 * 라인반경은 길 중심선에서 **한쪽으로** 몇 km 까지 콜을 받나다. «우회 허용»(카카오가 재는
 * **총거리 증가분**)과 둘 다 km 라 한 이름으로 부르면 **조용히 섞인다.**
 *
 * 🔴 **화면이 하는 말과 값이 하는 일이 같아야 한다.** 이 값은 서버에서 **길 양옆 폭**(그물의 라인 띠 반경)으로
 *    쓰인다 — 화면이 *"카카오 총거리가 늘어나는 만큼(100km → 105km 면 5km)"* 이라고 설명하면
 *    기사님이 «5» 를 넣을 때 **화면이 말하는 뜻과 실제 동작이 다르다** — 규칙 ⑤-4 ④.
 */
describe('라인반경 — 화면이 하는 말과 값이 하는 일이 같아야 한다', () => {

    const { FILTER_FIELDS } = require("@onedal/shared");
    /* 칸 이름은 평면과 같은 `detourRadiusKm` 이다 */
    const f = FILTER_FIELDS.find((x: any) => x.path === 'detourRadiusKm');

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

    it('범위는 기사님이 정한 그대로다 — 1~40km (2026-09-23)', () => {
        /* 반경 셋(현위 · 목적 · 라인)이 같은 범위를 쓴다 — 같은 «반경»이라 눈금이 달라질 까닭이 없다 */
        expect(f.min).toBe(1);
        expect(f.max).toBe(40);
    });

    /**
     * 🔴 **라벨 표는 하나다** — 라벨 표가 둘이면 «두 곳이 다른 이름을 쓸» 위험이 생긴다.
     *    잠글 것은 «표가 하나인가»다.
     */
    it('🔄 라벨의 원천이 하나다 (국면 라벨 표가 없다)', () => {
        const shared = require("@onedal/shared");
        expect(shared.PHASE_FIELD_LABEL).toBeUndefined();
        expect(FILTER_FIELDS.filter((x: any) => x.label === '라인반경')).toHaveLength(1);
    });
});

/**
 * 🛣️ **노선 ↔ 🔷 동선 — 그물의 모양을 기사님이 고른다**.
 *
 * 콜을 쥐면 그물이 라인으로 바뀌어 현위치 원이 사라진다 — 토글이 있어야 기사님이 현위치 범위를
 * 되돌아볼 수 있다 (기사님 «현위치 범위가 안 보인다»).
 *
 * 🔴 **버튼이 바꾸는 것과 화면이 읽는 것이 다르다** (목업이 못박은 갈림):
 *      버튼      → `routeMode`   기사님이 «고른 것»
 *      화면·판정 → `lineOn = routeMode && 경로가 실제로 있나`
 *    단추만 보고 그리면 **노선을 누른 순간 라인이 없어도 마름모가 화면에서
 *    사라지는데 판정은 그 마름모로 한다** (기사님 지적).
 */
describe('노선 ↔ 동선 — 고른 것과 실제를 가른다 (이식)', () => {

    const stage = codeOnly(read(join(CLIENT, 'components/stage/StageView.tsx')));
    const dash3 = codeOnly(read(join(CLIENT, 'pages/Dashboard.tsx')));

    /**
     * ⚠️ **손잡이는 필터에 있다** (기사님 지시: *"노선 동선 버튼도 지도에서 필터로 이사와야해"*).
     *    **기사님이 고르는 값이지 파생이 아니다.** 지도는 받아서 그리기만 한다.
     */
    it('🔴 기사님이 고르는 손잡이가 있다 (파생이 아니다)', () => {
        /* 🔴 버튼 하나를 눌러 뒤집는다 — 시·도 · 시·군·구와 한 줄 3등분에 선다 (기사님 2026-09-23) */
        expect(modal).toMatch(/setRouteMode\(!routeMode\)/);
        expect(modal).toMatch(/동선/);
        expect(modal).toMatch(/노선/);
        // 지도는 받아서 **그리기만** 한다
        expect(stage).toMatch(/routeMode/);
    });

    it('🔴 동선이면 라인을 끈다 — 하차 영역이 마름모로 돌아온다', () => {
        expect(stage).toMatch(/const dropoffLine = routeMode/);
    });

    /**
     * 🔴 **직선으로 지어내지 않는다** (규칙 ④). 경로가 아직 없으면 마름모로 보되
     *    화면이 **그렇게 말해야 한다** — 안 그러면 «노선인데 마름모»가 조용한 거짓말이 된다.
     */
    it('🔴 노선인데 경로가 아직이면 화면이 그렇게 말한다', () => {
        expect(stage).toMatch(/경로를 기다립니다|경로 대기/);
    });

    /**
     * 🔴 **`localStorage` 에 기억하지 않는다** — 레이어(🧅)는 «보기»라 거기 남기지만
     *    이것은 **판정을 바꾸는 값**이다.
     *
     * 🔴 **필터 값(`filter.routeMode`)이다** — 화면 상태(`useState`)로 두면 서버가 이 값을 몰라
     *    동선을 골라도 판정·앱 목록은 계속 노선이다. 지도·서버·💾 가 같은 값을 보고, 되살아나는 것은
     *    `localStorage` 가 아니라 **기사님이 💾 로 저장한 서버 값**이다 (규칙 ③ — 원천 하나).
     */
    it('🔴 노선/동선은 필터 값이다 — localStorage 가 아니라 서버 값에서 온다', () => {
        expect(dash3).not.toMatch(/const \[routeMode, setRouteMode\] = useState/);
        expect(dash3).toMatch(/const routeMode = filter\?\.routeMode \?\? true/);
        expect(dash3).not.toMatch(/routeMode[^\n]*localStorage/);
    });
});
