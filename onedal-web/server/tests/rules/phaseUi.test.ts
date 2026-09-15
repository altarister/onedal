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
    /**
     * 🔄 **개정 2026-09-11 — 표가 사라지고 «상태»가 답한다** (이식 C3-3b).
     *    `PHASE_FIELDS`(국면×칸 표시 규칙)는 값이 한 벌이 되며 없어졌다.
     *    지키는 뜻은 그대로다: **감추지 않고 흐리게** (기사님 2026-09-09 *"모두 꺼내 두고"*).
     */
    it('🔴 «안 쓰이는 칸»을 감추지 않는다 — 흐리게만 한다', () => {
        expect(modal).not.toMatch(/mode === 'hidden'/);
        expect(modal).not.toMatch(/PHASE_FIELDS/);
        // «지금 이 칸이 쓰이나»를 상태에서 파생해 dim 으로 보낸다
        expect(modal).toMatch(/const inUse = \(path/);
        expect(modal).toMatch(/dim: !inUse\(path\)/);
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
     *   · «오늘 콜 잡기» 아래 저장 버튼 둘(서버 저장·되돌리기)이 **더 정확히** 말한다
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

    /**
     * 🔴 **닫는 ✕ 를 걷었다** (기사님 2026-09-12: *"팝업이 아니니 x 버튼은 지워"*).
     *
     * 이 검사는 원래 반대를 물었다 — 머리줄을 걷을 때 *"바깥 누르기가 없으니 닫는 길은
     * 눈에 보여야 한다"* 는 이유로 ✕ 를 **남기라고** 잠갔다. 그런데 **닫는 길은 이미 있었다**:
     * 요약줄이 토글이라 다시 누르면 접힌다. ✕ 는 «이건 팝업이다»라고 말하는 표시라,
     * 팝업을 걷은 판(C4-3)에서는 **화면이 거짓말을 하는 자리**가 된다.
     *
     * 🔴 **닫는 길 자체는 계속 지킨다** — 검사가 무는 것은 «✕ 가 있나»가 아니라
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
     * 🔴 **저장은 다섯 행에 «같은 값»을 쓴다 — 그게 한 벌이다** (C3-3a 의 전환 모양).
     *
     *
     * 🔴 `destinationCity` 는 **첫짐에만** 간다. 실측해 보니 이미 첫짐 한 곳이 원천이고
     *    (나머지 넷은 `auto`/`override`), 합짐·주행중의 목적지는 서버가 경로에서 파생한다.
     *    다섯 행에 같이 쓰면 관내(`override`)가 그 값으로 덮여 자동 파생이 죽는다.
     */
    /**
     * 🔄 **개정 2026-09-11 — «다섯 행에 같은 값»에서 «한 곳에 한 번»으로** (이식 C3-3b).
     *    C3-3a 의 전환 모양(다섯 번 쓰기)이 그릇이 걷히며 끝났다.
     *    `destinationCity` 를 첫짐에만 쓰던 예외도 함께 사라졌다 — 행이 하나뿐이다.
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
     * 🔄 **개정 2026-09-11 — 국면 전용 통로가 사라졌다** (이식 C3-3b).
     *    *"합짐 탭에서 고친 값이 첫짐에 저장되면 안 된다"* 는 이유로 «어느 국면인지»를
     *    실어 보내던 길이다. 탭이 없어지고 값이 한 벌이 되며 실을 것이 없어졌다.
     *    🔴 지키는 뜻은 남는다 — **값이 가는 길은 하나여야 한다.**
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
 * 📐 **마름모의 모양은 국면 밖 한 벌이다** (이식 C3-2 · 2026-09-11 · 명세 §3).
 *
 * 🔴 **하루 만에 자리를 옮겼다.** 아침(C3-1)에는 국면 행에 파고 «첫짐에서 상속»으로 가렸다.
 *    그런데 다섯 행에 값이 계속 써지는 구조가 남아, 기사님이 첫짐을 120°/140°/35km 로
 *    저장하신 직후 **합짐 행에는 110/110/25 가 앉아 있었다** — 화면은 「자동 · 첫짐에서 120°」
 *    라고 적으면서. 상속으로 가리는 대신 **자리를 하나로** 만든 이유다 (규칙 ③).
 *
 * 근거는 기사님 확정 2026-09-09: *"모두 꺼내 두고 노선이면 라인값을 사용하고 동선이면
 * 사용 안 하면 되니까."* — 다섯 벌이 하던 일은 «값을 여러 벌 두는 것»이 아니라
 * **«지금 안 쓰는 칸을 감추는 것»**이었고, 지금은 감추지 않고 **상태에서 파생해 흐리게** 한다
 * (라인반경은 노선일 때만 · 자동이면 반경 넷).
 */
describe('마름모 모양 — 국면 밖 한 벌', () => {

    const { FILTER_FIELDS, QUAD_FIELDS,
            DEFAULT_QUAD_SHAPE, QUAD_SHAPE_KEYS } = require("@onedal/shared");

    /**
     * 🔄 **개정 2026-09-11 — 국면 그릇 자체가 사라졌다** (이식 C3-3b).
     *    지킬 것은 그대로다: **마름모는 값 표와 섞이지 않는다.** 둘은 같은 `user_filters`
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

    const { FILTER_FIELDS, QUAD_FIELDS } = require("@onedal/shared");
    /** 🔄 개정 2026-09-11 — 라벨의 원천이 `FILTER_FIELDS` 하나가 됐다 (이식 C3-3b) */
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
 * 🥣 **그릇도 한 벌로 — `user_filter_phases` 다섯 행을 걷는다** (이식 C3-3b · 2026-09-11).
 *
 * 기사님 2026-09-11: *"**개선되어 중복인건 그냥 삭제** 할꺼야."*
 *
 * C3-3a 가 **값**을 한 벌로 만들었다 (다섯 행에 같은 값을 쓴다). 그릇은 그대로 둔 탓에
 * 지금은 **저장할 때마다 같은 값을 다섯 번 쓴다.** 그것만이 아니다 —
 *
 * 🔴 **이름이 두 벌이다.** 국면 표와 평면(앱 피기백)이 같은 값을 다르게 부른다:
 *      `detour_allow_km`   ↔ `detourRadiusKm`
 *      `dropoff_radius_km` ↔ `destinationRadiusKm`
 *      `discount_pct`      ↔ `callDiscountPct`
 *    그 사이를 잇느라 `applyPhaseToFilter` 가 있었다. **그릇이 하나면 이을 것이 없다.**
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
     * 🔴 **이름을 잇던 다리가 사라진다** — 그릇이 하나면 이을 것이 없다.
     *    `applyPhaseToFilter` 는 `detour_allow_km` → `detourRadiusKm` 처럼
     *    **두 벌 이름 사이**를 옮기려고 있던 함수다.
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
     * 🔴 **라벨도 한 곳이다** — `PHASE_FIELD_LABEL` 과 `FILTER_FIELDS.label` 이 **둘 다**
     *    이름을 들고 있었다. 표가 하나면 라벨도 하나다 (규칙 ③).
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
     * 🔴 **«지금 무엇을 하나»는 남는다** (기사님 2026-09-09 가 남기라 하신 둘 중 하나).
     *    국면 «값»이 사라진 것이지 «지금 대기인지 콜 쥠인지 주행인지»가 사라진 게 아니다.
     */
    it('🔴 «지금 무엇을 하나»(dispatchPhase)는 그대로다', () => {
        const shared = require("@onedal/shared");
        expect(typeof shared.deriveDispatchPhase).toBe('function');
        /* 문구를 고르는 장치도 남는다 — 값이 사라진 것이지 «지금 무엇을 하나»가 사라진 게 아니다 */
        expect(typeof shared.resolvePhaseKey).toBe('function');
        expect(shared.PHASE_LABEL).toBeDefined();
    });

    /** 🔴 관내가 파생이 된 뒤로 국면 키에도 `'local'` 이 없다 (C4-8b-2 가 남긴 마지막 자리) */
    it('🔴 국면 키에 local 이 없다', () => {
        const { PHASE_KEYS } = require("@onedal/shared");
        expect(PHASE_KEYS).toEqual(['first', 'merge', 'drive', 'home']);
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
        /**
         * 서버가 «목적지 근처인가»를 제 손으로 다시 재지 않는다.
         *
         * ⚠️ **«그 판단을 내리는 줄»만 본다** (2026-09-12 좁힘). 전에는 함수 전체에
         *    `haversineKm(` 이 없기를 봤는데, C4-12 가 **다른 질문**을 답하려고 그 함수를
         *    부르자 빨간불이 났다 — 반경 자동이 재는 것은 «마름모 축이 몇 km 인가»이지
         *    «관내인가»가 아니다. 한 낱말을 금지하는 대신 **그 자리**를 지킨다.
         */
        const decide = net.slice(net.indexOf('const localMode'), net.indexOf(';', net.indexOf('const localMode')));
        expect(decide).toMatch(/isLocalPhase\(/);
        expect(decide).not.toMatch(/haversineKm\(/);
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
     *    같은 시도에 있으면"*). 🔄 2026-09-14 — 관내 그물은 **목적지 원 안만**이다 (전수표 #29 ·
     *    `callNet.judgeTwoStage` 의 local 과 같은 원). 예전엔 각도를 360° 로 바꿔 마름모를 원으로 만들었는데
     *    그 원이 **마름모반경**이라 이천 관내에 여주·용인 처인까지 35곳이 들었다 («7지점» 21:16:32).
     *    라인(경로 양옆)은 관내 그물(`netForGoal` 의 local)이 안 본다 — 동선만 라인을 끈다.
     */
    it('🔴 관내면 목적지 원 안만 — 각도 360° 우회를 안 쓴다', () => {
        const net = fm.slice(fm.indexOf('function netKeywordsOf'), fm.indexOf('function netKeywordsOf') + 4000);
        expect(net).toMatch(/local: localMode/);
        expect(net).not.toMatch(/AngleDeg: 360/);
        expect(net).toMatch(/session\.activeFilter\.routeMode === false \? null : line/);
    });

    /**
     * 🔴 **관내로 가는 길은 하나다** (이식 C4-8b-2 · 2026-09-11).
     *
     * 기사님 2026-09-11: *"개선되어 중복인건 그냥 삭제 할꺼야."*
     * C4-8b 가 파생을 만들었는데 옛 길(`setCallTarget('LOCAL')`)을 남겨 두었다 —
     * **같은 일을 하는 길이 둘이면 언젠가 갈라진다.** 이 레포가 여러 번 당한 모양이다
     * (경유 4벌 · 상태목록 3벌 · 시별칭).
     *
     * ⚠️ 걷어도 안전한 근거: `callTarget` 은 **DB 에 없다**(메모리뿐 · 실측 2026-09-11),
     *    그리고 **앱(Kotlin)이 안 읽는다**. 지울 때 남는 옛 값이 없다.
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
 * 💾 **저장은 두 갈래 — 메모리와 서버** (이식 C4-10 · 2026-09-12).
 *
 * 기사님 2026-09-11: *"오늘만, 계속, 평소값 **이것이 말이 안 되는것 같다**. **서버저장과
 * 메모리 저장** 뭐 이렇게만 있으면 될 것 같은데.. 목업처럼 사용자가 드레그 하면
 * **실시간으로 선택영역이 바뀌는거** 보여주고 **그냥 닫으면 앱메모리에 자동저장** 되는거지."*
 *
 * 🔴 **서버는 처음부터 둘뿐이었다** — `activeFilter`(메모리) · `baseFilter`(DB).
 *    「평소값 불러오기」는 세 번째 저장이 아니라 **되돌리기**였는데 이름이 셋이라 헷갈렸다.
 */
describe('저장 — 메모리와 서버 둘 (C4-10)', () => {

    const knob2 = codeOnly(read(join(CLIENT, 'components/ui/KnobGrid.tsx')));

    it('🔴 버튼이 둘이다 — 💾 서버 저장 · ↩︎ 되돌리기', () => {
        expect(modal).toMatch(/💾 서버 저장/);
        expect(modal).toMatch(/↩︎ 되돌리기/);
        /* 셋으로 갈려 있던 옛 이름이 없다 */
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
     * 괜찮았지만 여기선 폭주한다. 2026-09-11 에 매 틱 그물 재계산으로 느려진 일이 있었다.
     */
    it('🔴 슬라이더는 끄는 동안이 아니라 «뗄 때» 보낸다', () => {
        expect(knob2).toMatch(/onPointerUp/);
        expect(knob2).toMatch(/onCommit/);
        /* ± 는 한 칸이라 누르는 즉시 보내도 폭주가 없다 */
        /* 🔴 **값을 인자로 나른다** — `set` 과 같은 클릭 안에서 부르므로
              인자 없이 부르면 받는 쪽이 **한 칸 뒤처진 값**을 읽는다 (C4-10 실측) */
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
 * 🎚️ **끄는 동안 영역이 바뀐다 — 화면과 서버를 두 갈래로** (이식 C4-11 · 2026-09-12).
 *
 * 기사님 2026-09-12: *"값을 조절할때 움직일때 **영역을 바꿔 주면 좋겠어**.
 * 그래야 그걸 보고 **한번에 조절** 하니까."*
 *
 * 🔴 **C4-10 이 반대로 만들었던 것을 가른다.** 그때는 «서버가 경유 지역을 다시 그려
 *    폭주한다»를 걱정해 **손 뗄 때만** 보냈는데, 실측해 보니 **지도는 서버를 안 기다린다** —
 *    `useCallNet` 이 `netForGoal` 을 **클라에서** 부르고(실측 **0.9ms/회**), `updateFilter` 의
 *    낙관적 `setFilter` 만으로 그 자리에서 다시 그린다.
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
 * 🧾 **요약줄의 «N 읍면동» 은 지도와 같은 수다** (이식 C4-11b · 2026-09-12).
 *
 * 기사님 2026-09-12(질문에 답하시며): **«지도와 같은 수로 바꾼다»**.
 *
 * 🔴 **실측에서 잡혔다.** C4-11 로 끄는 동안 지도가 따라 움직이게 만들었는데
 *    요약줄 숫자는 **368 에서 꿈쩍도 안 했다** — 그 숫자만 `filter.destinationKeywords`
 *    (서버가 파생해 내려주는 목록)를 세고 있었기 때문이다. 같은 화면이 두 말을 한다.
 * 🔴 **계산은 한 번이다** (규칙 ③). 요약줄이 `useCallNet` 을 **또 부르지 않는다** —
 *    `myLocation` 은 `useRouteDerivations` 안의 상태라 훅을 또 부르면 **다른 인스턴스**가
 *    된다. 무대가 이미 계산한 값을 store 에 올리고 요약줄이 그것을 읽는다.
 * ⚠️ **지도가 안 떠 있으면 서버 값으로 물러선다** — 지어내지 않는다 (규칙 ④).
 */
describe('요약줄이 지도와 같은 수를 말한다 (C4-11b)', () => {
    const status = read(join(CLIENT, 'components/dashboard/OrderFilterStatus.tsx'));
    const store = read(join(CLIENT, 'stores/filterStore.ts'));
    const stage = read(join(CLIENT, 'components/stage/StageView.tsx'));

    it('🔴 그물 수를 담는 자리가 store 에 있다', () => {
        expect(store).toMatch(/netCount/);
        expect(store).toMatch(/setNetCount/);
    });

    it('🔴 무대가 제 계산을 거기에 올린다', () => {
        expect(stage).toMatch(/setNetCount\(/);
    });

    it('🔴 요약줄은 그 수를 먼저 보고, 없을 때만 서버 값으로 물러선다', () => {
        const i = status.indexOf('const regionCount');
        expect(i).toBeGreaterThan(-1);
        const line = status.slice(i, status.indexOf(';', i));
        expect(line).toMatch(/netCount/);
        /* 물러설 길이 남아 있어야 한다 — 지도가 안 떠 있는 판이 있다 */
        expect(line).toMatch(/destinationKeywords/);
    });
});

/**
 * 📥 **필터를 열면 폼이 «지금 값»으로 채워진다** (버그 대장 #108 · 2026-09-12).
 *
 * 🔴 **C4-9 에서 이 `useEffect` 가 통째로 사라졌다.** 미리보기 두 함수를 걷으며
 *    «다음 const 까지»로 잘랐는데 그 사이에 **이 블록이 끼어 있었다** —
 *    같은 병이 이 파일에서 **두 번째**다(그때는 `if (!filter)` 가드를 잃었다).
 *
 * 🔴 **무엇이 터졌나**: 폼이 `DEFAULT_FILTER_VALUES` 로 서고(목적지 **빈칸**),
 *    슬라이더를 하나만 만져도 `toValues` 가 그 빈 목적지를 그대로 실어 보낸다
 *    (`toValues` 의 «이전 값 그대로» 보호는 **숫자에만** 걸린다 — `spec.text` 는 통과).
 *    실측: 기사님이 맞춰 두신 **파주시가 메모리에서 사라졌다.**
 *
 * 🔴 **그래서 검사는 «있나»가 아니라 «무엇을 채우나»를 본다** — 한 줄만 살아남고
 *    나머지가 빠져도 초록이 되면 이 사고를 또 못 잡는다.
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
 * 🧾 **요약줄이 «몇 개 동이 걸리나»를 말한다 — 지역 카드를 걷는다** (이식 C4-9 · 2026-09-12).
 *
 * 기사님 2026-09-11: *"이건 **지도의 영역으로 표시 되는거라 없어져도 될꺼 같고**
 * 필터 상태바에 「노선행 · 여기서 10km → 파주시 15km · **200읍면동**」 이렇게 표현해 주면
 * 될듯 한데."*
 *
 * 🔴 **값을 만지면 지도가 그 자리에서 바뀐다** — 그러니 「🔍 지금 값으로 미리보기」 버튼이
 *    할 일이 없다. 「163개 동」 카드와 시·군·구 칩도 **지도가 이미 그리는 것을 글자로 또
 *    적는 것**이었다. 시군구별 내역이 필요하면 현황판의 「🗂️ 영역 — 시군구별」 칸에 있다.
 */
describe('요약줄 — 몇 개 동이 걸리나 (C4-9)', () => {

    const status = codeOnly(read(join(CLIENT, 'components/dashboard/OrderFilterStatus.tsx')));

    it('🔴 요약줄이 읍면동 수를 말한다', () => {
        expect(status).toMatch(/읍면동/);
        expect(status).toMatch(/destinationKeywords/);
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
        /* ⚠️ 기준점이 «🟢 오늘만»이었다 — C4-10 에서 그 버튼이 사라졌다 (저장은 둘뿐이다) */
        const body = modal.slice(0, modal.indexOf('💾 서버 저장'));
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
    /**
     * 🔄 **2026-09-15 개정 — 확인창을 걷었다** (기사님: *"복귀를 클릭하면 알럿창 뜨는데 그거 필요 없겠다"*).
     *    08-14 의 «쉽게 바뀌면 오작동»은 입구가 여럿이던 때의 걱정이었다 — 지금 입구는 필터 안 «↩️ 복귀» 버튼 하나다
     *    (아래 «쏘는 곳이 한 곳뿐»). 해악 ②(값을 버림)는 여전히 막는다.
     */
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

    /**
     * 🔄 **개정 2026-09-12 — 도시를 안 보낸다** (전수 조사 ①-1).
     *    예전엔 `destinationCity: city!` 를 실어 HOME 이면 **집 시로 덮어썼다.** 돌아올 때
     *    `activeFilter || baseFilter` 가 이미 덮인 값에서 끝나 **파주가 광주로 굳었다.**
     *    이제 그물이 향하는 시는 `filterManager.goalCityOf` 가 `callTarget` 에서 **파생**한다.
     *    «어디로 가는가»는 여전히 여기서만 정한다 — 다만 그 답이 `callTarget` 하나다.
     */
    it('국면 전환은 "어디로 가는가"만 정한다 (callTarget 하나 — 도시는 파생이다)', () => {
        expect(body).toMatch(/callTarget: phase/);
        expect(body).not.toMatch(/destinationCity: city!/);
    });

    /** 🔄 개정 2026-09-11 — 값이 한 벌이라 «첫짐 국면이 기억한 것»이 없다. 오늘값이 먼저다 */
    it('🔄 돌아갈 때의 도시는 오늘값이 먼저, 없으면 평소값', () => {
        expect(body).toMatch(/session\.activeFilter\.destinationCity/);
        expect(body).toMatch(/session\.baseFilter\.destinationCity/);
    });

    /**
     * 🔄 **개정 2026-09-11 — 자리가 옮겨졌다** (이식 C3-3b). 지키는 뜻은 그대로다.
     *
     * 🔴 **이 검사가 진짜를 잡았다.** 국면 고리 둘(`applyPhaseSettingsIfChanged` ·
     *    `savePhaseSettings`)을 걷으면서 **`refreshDetourIfNeeded` 를 부르는 곳이 같이
     *    사라졌다** — 반경을 바꿔도 지역 목록이 안 다시 그려질 뻔했다.
     *    안 그리면 «하차 0km» 라고 적힌 채 **옛 목록으로 거른다.**
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
 * 숫자만 바꾸고 지역 목록을 그대로 두면 "경유 5km" 라고 적힌 채 옛 1km 목록으로 거른다.
 * 조용히 틀리는 종류라 눈치채기까지 오래 걸린다.
 */
describe('경유 갱신 — 구현은 하나여야 한다', () => {

    /**
     * 🔄 **개정 2026-09-11 — 둘에서 «하나»로** (이식 C3-3b).
     *    국면 저장·국면 전환이 각자 부르던 것을, 값이 한 벌이 되며 **값이 바뀌는 한 곳**이 부른다.
     *    길이 하나면 «한쪽만 고쳐지는» 일이 없다 (규칙 ③).
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
        expect(fn).toMatch(/if \(!kept\?\.line\) return/);   // 🔄 2026-09-14 그물 한 벌 — 라인이 없으면 안 넣는다
    });

    it('🔴 셋을 한 벌로 넣는다 — 별칭이 빠지면 앱의 2단계 필터가 조용히 꺼진다', () => {
        const fn = fm.slice(fm.indexOf('function refreshDetourIfNeeded'), fm.indexOf('function applyPhaseSettingsIfChanged'));
        /* 🚫 앞 둘은 제외를 뺀 `kept` 에서 온다 (이식 C2) — 셋이 **함께** 들어간다는 것이 요점이다 */
        expect(fn).toMatch(/destinationKeywords = kept\.flat/);
        expect(fn).toMatch(/destinationGroups = kept\.grouped/);
        expect(fn).toMatch(/customCityFilters = kept\.aliases/);   // 🔄 2026-09-14 별칭도 그물 목록의 시들에서
    });

    it('🔴 recalculateDetourFilter 의 구현은 하나다 — dispatchEngine 은 다시 내보내기만 한다', () => {
            expect(engine).toMatch(/export \{ recalculateDetourFilter \} from "\.\.\/state\/filterManager"/);
        expect(engine).not.toMatch(/export const recalculateDetourFilter/);
        // 🔄 2026-09-14 (전수표 1단계) — 소켓은 옛 계산을 더 안 거친다. 반경 변경은 refreshDetourIfNeeded 가 그물로 그린다
        expect(handlers).not.toMatch(/recalculateDetourFilter\(/);
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
        /* 🔄 2026-09-14 (전수표 1단계) — 목록을 만드는 길이 전부 netKeywordsOf 를 지나므로 빼는 자리는 **정확히 하나**다 */
        expect((fm2.match(/pruneExcludedRegions\(/g) || []).length).toBe(1);
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
        expect(fn).toMatch(/origin/);
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
        /* 🔄 2026-09-14 (전수표 1단계) — 목록을 만드는 길이 전부 netKeywordsOf 를 지나므로 빼는 자리는 **정확히 하나**다 */
        expect((fm3.match(/pruneExcludedRegions\(/g) || []).length).toBe(1);
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
    /* 🔄 2026-09-11 — 칸 이름도 평면과 같아졌다 (`detourAllowKm` → `detourRadiusKm` · C3-3b) */
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

    it('범위는 목업과 같다 — 최대 50km', () => {
        expect(f.max).toBe(50);
    });

    /**
     * 🔄 **개정 2026-09-11 — 라벨 표가 하나가 됐다** (이식 C3-3b).
     *    `PHASE_FIELD_LABEL` 이 따로 있어서 «두 곳이 다른 이름을 쓸» 위험이 있었는데,
     *    **표를 하나로 합치며 그 위험 자체가 사라졌다.** 이제 잠글 것은 «표가 하나인가»다.
     */
    it('🔄 라벨의 원천이 하나다 (국면 라벨 표가 없다)', () => {
        const shared = require("@onedal/shared");
        expect(shared.PHASE_FIELD_LABEL).toBeUndefined();
        expect(FILTER_FIELDS.filter((x: any) => x.label === '라인반경')).toHaveLength(1);
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
     * 🔴 **`localStorage` 에 기억하지 않는다** — 레이어(🧅)는 «보기»라 거기 남기지만
     *    이것은 **판정을 바꾸는 값**이다.
     *
     * 🔄 **개정 2026-09-12** (전수 조사 ①-9): 예전엔 `Dashboard` 의 `useState(true)` 라
     *    «새로고침하면 노선으로 돌아간다»를 지켰는데, 그 탓에 **서버가 이 값을 몰라** 동선을
     *    골라도 판정·앱 목록은 계속 노선이었다. 이제 **필터 값**(`filter.routeMode`)이다 —
     *    지도·서버·💾 가 같은 값을 보고, 되살아나는 것은 `localStorage` 가 아니라
     *    **기사님이 💾 로 저장한 서버 값**이다 (규칙 ③ — 원천 하나).
     */
    it('🔴 노선/동선은 필터 값이다 — localStorage 가 아니라 서버 값에서 온다', () => {
        expect(dash3).not.toMatch(/const \[routeMode, setRouteMode\] = useState/);
        expect(dash3).toMatch(/const routeMode = filter\?\.routeMode \?\? true/);
        expect(dash3).not.toMatch(/routeMode[^\n]*localStorage/);
    });
});
