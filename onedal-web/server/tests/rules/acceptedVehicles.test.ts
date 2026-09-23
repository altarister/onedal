import { readFileSync } from "fs";
import { join } from "path";
import { APP_FILTER_KEYS } from "@onedal/shared";

const read = (rel: string) => readFileSync(join(__dirname, "../../src", rel), "utf8");
const CLIENT = join(__dirname, "../../../client-app/src");
const readClient = (rel: string) => readFileSync(join(CLIENT, rel), "utf8");
const codeOnly = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/**
 * 🚚 **받을 짐 — 「고른 것」과 「막힌 것」을 나눈다**.
 *
 * 기사님: *"내 차가 1톤이지만 **라보 다마스 짐만 받겠다** … 합짐을 위해 필요."*
 *
 * 🔴 **왜 나누나** — 한 칸이 **두 사실을 답하면** 안 된다 (규칙 ⑤-4 ⑤):
 *
 *    | 묻는 것 | 누가 정하나 | 언제 바뀌나 |
 *    |---|---|---|
 *    | «나는 어떤 짐을 **받겠다**고 했나» | **기사님** | 필터에서 고칠 때만 |
 *    | «지금 짐 때문에 어떤 것이 **막혔나**» | **서버** | 콜을 잡고 내릴 때마다 |
 *
 *    겹쳐 두면 **기사님이 고른 것이 짐 한 번에 지워진다** — 경유가 갱신될 때마다 용량 제한이 풀려
 *    *"라보 2개를 싣고도 1t 콜을 잡으러 가는"* 상태가 된다. 그래서 고른 것은 `acceptedVehicleTypes` 에 두고,
 *    원달앱이 보는 `allowedVehicleTypes` 는 서버가 «고른 것 ∩ 실을 수 있는 것»으로 파생한다.
 */
describe('받을 짐 — 고른 것과 막힌 것 (C4-6b)', () => {

    /** 🔴 ① 스키마 — 고른 것만 DB 에 산다. 허용 목록은 지금도 앞으로도 **파생**이다 */
    it('🔴 «고른 것»은 DB 에 있고 «허용 목록»은 없다', () => {
        const db = codeOnly(read('db.ts'));
        expect(db).toMatch(/accepted_vehicle_types/);
        expect(db).not.toMatch(/allowed_vehicle_types/);
    });

    /** 🔴 ② 값 — 비었으면 «제한 없음». 새 칸이 생겨도 **아무것도 안 바뀌는 것**이 기본이다 */
    it('🔴 비어 있으면 제한 없음 — 지금 동작이 그대로 남는다', () => {
        const fm = codeOnly(read('state/filterManager.ts'));
        const i = fm.indexOf('acceptedVehicleTypes');
        expect(i).toBeGreaterThan(-1);
        const body = fm.slice(Math.max(0, i - 400), i + 900);
        /* 빈 목록을 «아무것도 못 받는다»로 읽으면 콜이 통째로 멈춘다 */
        expect(body).toMatch(/length/);
    });

    /** 🔴 ⑤ 읽는 곳 — 교집합을 만드는 자리는 한 곳뿐이다 (규칙 ③) */
    it('🔴 서버가 «고른 것 ∩ 실을 수 있는 것»을 낸다', () => {
        const fm = codeOnly(read('state/filterManager.ts'));
        const i = fm.indexOf('acceptedVehicleTypes');
        const body = fm.slice(Math.max(0, i - 400), i + 900);
        /* 두 재료가 같은 자리에서 만나야 한다 */
        expect(body).toMatch(/getRemainingCapacityTypesByPoints|getEligibleVehicleTypes/);
        expect(body).toMatch(/allowedVehicleTypes\s*=/);
    });

    /** 🔴 **앱 규격을 안 바꾼다** — 앱은 계속 `allowedVehicleTypes` 하나만 본다 */
    it('🔴 «고른 것»은 앱에 안 내려간다', () => {
        expect(APP_FILTER_KEYS).toContain('allowedVehicleTypes');
        expect(APP_FILTER_KEYS).not.toContain('acceptedVehicleTypes');
    });

    /**
     * 🔴 화면이 **허용 목록을 서버로 보내지 않는다.** 보내면 서버가
     *    `if (!changes.allowedVehicleTypes)` 에 걸려 **제 계산을 통째로 건너뛴다.**
     *    화면이 보내는 것은 `acceptedVehicleTypes` 뿐이다.
     */
    it('🔴 화면은 «고른 것»만 보낸다', () => {
        const modal = codeOnly(readClient('components/dashboard/OrderFilterModal.tsx'));
        expect(modal).toMatch(/acceptedVehicleTypes/);
        expect(modal).not.toMatch(/updateFilter\([^)]*allowedVehicleTypes/);
    });

    /**
     * 🔴 ④ 화면 — **목업 그대로다.**
     *
     * 목업(`MapMockup.tsx`)의 `PickLayer label="🚚 받을 짐"` 과 같은 부품·같은 자리를 쓴다 —
     * 콜할인율·받을 짐·제외 단어가 **3칸 한 줄**이며 값은 `1t·다` 로 짧다.
     * 따로 그리면 목업과 화면이 두 벌이 되어 손맛이 갈린다 (규칙 ③).
     */
    it('🔴 목업과 같은 부품·같은 자리 — PickLayer 3칸', () => {
        const modal = readClient('components/dashboard/OrderFilterModal.tsx');
        /* ⚠️ `🚚 받을 짐` 첫 등장은 **주석**이다 — `label=` 이 붙은 «그 칸»을 집는다 */
        const i = modal.indexOf('label="🚚 받을 짐"');
        expect(i).toBeGreaterThan(-1);
        /* 목업과 같은 부품이라야 손맛이 한 벌이다 (규칙 ③) */
        expect(modal.slice(Math.max(0, i - 200), i)).toMatch(/PickLayer/);
        expect(modal).toMatch(/grid-cols-3 gap-1/);
        /* 여럿 고르기 — 고른 뒤에도 레이어가 안 닫힌다 */
        const body = modal.slice(i, i + 1800);
        expect(body).toMatch(/keepOpen/);
        expect(body).toMatch(/selected=\{accepted\}/);
        /* 값은 짧은 이름으로 — 「1t·다」 */
        expect(body).toMatch(/VEHICLE_SHORT/);
    });

    /** 🔴 짧은 이름·차종 목록은 **목업과 한 벌**이다 (규칙 ③) */
    it('🔴 차종 표기가 두 벌이 아니다', () => {
        const mock = codeOnly(readClient('pages/MapMockup.tsx'));
        /* 목업이 제 손으로 또 적으면 손맛이 갈린다 */
        expect(mock).not.toMatch(/const VEHICLE_SHORT/);
        expect(mock).toMatch(/VEHICLE_PICKS/);
    });

    /**
     * 🔴 **열린 레이어가 아래 블록에 안 가린다** (실측).
     *
     * 레이어(`PickLayer`·`KnobGrid`)와 제외지역 블록(`relative z-20`)이 **같은 층이면 뒤에 오는 쪽이 이겨**
     * 「받을 짐」 레이어 안 하한표가 **제외지역 칸에 가려 반쯤 지워진다.** 그래서 레이어 둘은 `z-30`,
     * 제외지역 블록은 그보다 낮게 둔다. 콜할인율 레이어도 같은 자리다.
     */
    it('🔴 고르기 레이어가 제외지역 블록보다 위다', () => {
        const pick = readClient('components/ui/PickLayer.tsx');
        const knob = readClient('components/ui/KnobGrid.tsx');
        const modal = readClient('components/dashboard/OrderFilterModal.tsx');
        /* 레이어 둘은 같은 층이어야 한다 — 하나만 올리면 다른 하나가 또 가린다 */
        expect(pick).toMatch(/z-30/);
        expect(knob).toMatch(/z-30/);
        /* 제외지역 블록이 그보다 낮아야 한다 */
        /* 제외지역 블록의 첫 칸(«⛔ 시·도» 고르기)으로 블록 자리를 잡는다 */
        const i = modal.indexOf('<PickLayer label="⛔ 시·도"');
        expect(i).toBeGreaterThan(-1);
        expect(modal.slice(Math.max(0, i - 400), i)).not.toMatch(/z-3\d/);
    });

    /** 🔴 감추지 않고 **막힌 것을 보여 준다** (규칙 ⑤-2) */
    it('🔴 지금 못 받는 차종이 화면에 남는다 — 감추지 않는다', () => {
        const modal = readClient('components/dashboard/OrderFilterModal.tsx');
        const i = modal.indexOf('label="🚚 받을 짐"');
        const body = modal.slice(i, i + 1800);
        /* 「왜 이 콜이 안 올라오나」가 화면에서 읽혀야 한다 */
        expect(body).toMatch(/blockedNow/);
        expect(body).toMatch(/✕/);
    });
});
