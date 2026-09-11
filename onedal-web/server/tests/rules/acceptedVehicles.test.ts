import { readFileSync } from "fs";
import { join } from "path";
import { APP_FILTER_KEYS } from "@onedal/shared";

const read = (rel: string) => readFileSync(join(__dirname, "../../src", rel), "utf8");
const CLIENT = join(__dirname, "../../../client-app/src");
const readClient = (rel: string) => readFileSync(join(CLIENT, rel), "utf8");
const codeOnly = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/**
 * 🚚 **받을 짐 — 「고른 것」과 「막힌 것」을 나눈다** (이식 C4-6b · 2026-09-12).
 *
 * 기사님: *"내 차가 1톤이지만 **라보 다마스 짐만 받겠다** … 합짐을 위해 필요."*
 * 규칙 ⑤-4 다섯은 계획서 §C4-6b 에 확정돼 있다.
 *
 * 🔴 **왜 나누나** — 지금 `allowedVehicleTypes` 한 칸이 **두 사실을 답한다** (규칙 ⑤-4 ⑤):
 *
 *    | 묻는 것 | 누가 정하나 | 언제 바뀌나 |
 *    |---|---|---|
 *    | «나는 어떤 짐을 **받겠다**고 했나» | **기사님** | 필터에서 고칠 때만 |
 *    | «지금 짐 때문에 어떤 것이 **막혔나**» | **서버** | 콜을 잡고 내릴 때마다 |
 *
 *    겹쳐 두면 **기사님이 고른 것이 짐 한 번에 지워진다.** 실제로 그 사고가 있었다 —
 *    경유가 갱신될 때마다 용량 제한이 풀려 *"라보 2개를 싣고도 1t 콜을 잡으러 가는"*
 *    상태가 됐다 (2026-08-10 스모크).
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
     *    `if (!changes.allowedVehicleTypes)` 에 걸려 **제 계산을 통째로 건너뛴다**
     *    (2026-08-10 사고). 화면이 보내는 것은 `acceptedVehicleTypes` 뿐이다.
     */
    it('🔴 화면은 «고른 것»만 보낸다', () => {
        const modal = codeOnly(readClient('components/dashboard/OrderFilterModal.tsx'));
        expect(modal).toMatch(/acceptedVehicleTypes/);
        expect(modal).not.toMatch(/updateFilter\([^)]*allowedVehicleTypes/);
    });

    /** 🔴 ④ 화면 — 감추지 않고 **막힌 것을 보여 준다** (규칙 ⑤-2) */
    it('🔴 용량으로 막힌 차종은 흐리게 남는다 — 감추지 않는다', () => {
        const modal = readClient('components/dashboard/OrderFilterModal.tsx');
        const i = modal.indexOf('🚚 받을 짐');
        expect(i).toBeGreaterThan(-1);
        const body = modal.slice(i, i + 2200);
        /* 「왜 이 콜이 안 올라오나」가 화면에서 읽혀야 한다 */
        expect(body).toMatch(/allowedVehicleTypes/);
        expect(body).toMatch(/line-through|opacity/);
    });
});
