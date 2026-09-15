import { readFileSync } from "fs";
import { join } from "path";

const read = (rel: string) => readFileSync(join(__dirname, "../../src", rel), "utf8");
const CLIENT = join(__dirname, "../../../client-app/src");
const readClient = (rel: string) => readFileSync(join(CLIENT, rel), "utf8");
const codeOnly = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/**
 * 📐 **반경 자동 맞춤 — 서버와 화면이 같은 함수를 본다** (이식 C4-12 · 2026-09-12).
 *
 * 계산 자체는 `shared/src/autoRadius.test.ts` 가 잠근다(7건). 여기서 보는 것은
 * **«그 함수를 실제로 부르는가»** 와 **«둘이 같은 것을 부르는가»** 다 —
 * 계산이 두 벌이면 «지도는 든다는데 판정은 탈락»이 된다 (규칙 ③).
 */
describe('반경 자동 맞춤 — 서버 (C4-12)', () => {
    const fm = codeOnly(read('state/filterManager.ts'));

    it('🔴 서버가 shared 의 계산을 부른다 — 제 손으로 비례식을 쓰지 않는다', () => {
        expect(fm).toMatch(/autoRadii/);
    });

    it('🔴 자동일 때만 손댄다 — 수동이면 기사님 값 그대로', () => {
        /* ⚠️ `autoRadii` 첫 등장은 **import 줄**이다 — 괄호가 붙은 «부르는 자리»를 찾는다 */
        const i = fm.indexOf('autoRadii(');
        expect(i).toBeGreaterThan(-1);
        /* 앞뒤로 «자동인가»를 묻는 자리가 있어야 한다 */
        const around = fm.slice(Math.max(0, i - 600), i + 400);
        expect(around).toMatch(/radiusAuto/);
    });

    /**
     * 🔴 **거리는 하루에 한 번 잰다 — 달리는 동안 다시 재지 않는다** (기사님 확정 2026-09-14 · 필터.md §10-1 ③).
     *
     * 예전엔 «합짐이면 마지막 하차지 → 목적지» 로 **그물을 만들 때마다** 다시 쟀다.
     * «7지점 한 바퀴»에서 중리동(이천 1.2km)에 닿자 배율 0.03 — 목적 원 10km → 0.3km,
     * 관내 판단도 안 켜져 도착지 목록이 1곳이 됐다. 기사님: *"그럼 나중에 관내콜을 할 수가 없다."*
     */
    it('🔴 들고 있는 거리를 먼저 쓰고, 없을 때만 «내 위치 → 목적지»로 잰다', () => {
        const i = fm.indexOf('autoRadii(');
        const around = fm.slice(Math.max(0, i - 900), i + 200);
        expect(around).toMatch(/heldRadiusDistanceKm\(\s*session\.activeFilter\.radiusDistanceKm/);
        /* 마지막 하차지(라인 끝)로 거리를 재지 않는다 — 합짐이면 목적지 근처에서 반경이 사라진다 */
        expect(around).not.toMatch(/quadStart/);
    });

    it('🔴 기사님이 목적지를 바꾸면 들고 있던 거리를 비운다 — 다른 목적지의 거리를 쓰지 않는다', () => {
        expect(fm).toMatch(/'destinationCity' in changes[\s\S]{0,200}radiusDistanceKm\s*=\s*undefined/);
    });

    it('🔴 «다시 구하기»(radiusDistanceKm: null)를 받으면 그물을 다시 그린다', () => {
        const i = fm.indexOf('const needsGeoRecalc');
        const body = fm.slice(i, fm.indexOf(';', i));
        expect(body).toMatch(/'radiusDistanceKm' in changes/);
    });

    /**
     * 🔴 **모드를 바꾸면 그물을 다시 그려야 한다** (2026-09-12 실측에서 바로 드러났다).
     *
     * 화면에서 「자동」을 눌렀는데 **반경도 읍면동 수도 꿈쩍하지 않았다**(10/15/6 · 164동).
     * `needsGeoRecalc` 조건에 `radiusAuto`·`radiusBaseKm` 이 없어 **파생이 안 돌았다** —
     * 제외지역을 그 조건에 넣기 전에 났던 사고와 **같은 모양**이다(그때는 서울을 뺐는데
     * 「298개 동」이 그대로였다 · 규칙 ⑤-4 ④ «화면이 조용히 거짓말한다»).
     */
    it('🔴 자동을 켜고 끄면 그물을 다시 그린다', () => {
        const i = fm.indexOf('const needsGeoRecalc');
        expect(i).toBeGreaterThan(-1);
        const body = fm.slice(i, fm.indexOf(';', i));
        expect(body).toMatch(/'radiusAuto' in changes/);
        expect(body).toMatch(/'radiusBaseKm' in changes/);
    });

    it('🔴 반경 넷을 DB 에 쓰지 않는다 — 파생이다 (규칙 ③)', () => {
        const db = codeOnly(read('db.ts'));
        expect(db).toMatch(/radius_auto/);
        expect(db).toMatch(/radius_base_km/);
        /* 저장되는 것은 모드와 기준 둘뿐이다 */
        expect(db).not.toMatch(/auto_pickup_radius|auto_quad_radius/);
    });
});

/**
 * 🖥️ **화면 — 손잡이는 그대로 두고 위에 토글 하나** (C4-12 · 규칙 ⑤-4 ④).
 *
 * 🔴 **자동일 때도 숫자는 보인다. 흐리게만 둔다** (기사님 2026-09-09: *"모두 꺼내 두고"*).
 *    감추면 «이 값이 어디 갔나»가 되고, 그냥 두면 «지금 쓰이는 값»으로 읽힌다.
 */
describe('반경 자동 맞춤 — 화면 (C4-12)', () => {
    const modal = readClient('components/dashboard/OrderFilterModal.tsx');

    it('🔴 [자동 | 수동] 토글이 있다', () => {
        expect(modal).toMatch(/자동/);
        expect(modal).toMatch(/수동/);
        expect(modal).toMatch(/radiusAuto/);
    });

    /**
     * 🔴 **[↻ 다시 구하기] 는 토글이 아니라 한 번 누르는 동작이다** (기사님 확정 2026-09-14).
     *    토글 셋째 칸으로 넣으면 «재설정 모드»에 들어가 있는 것처럼 읽힌다.
     *    누르면 들고 있던 거리를 비운다(`radiusDistanceKm: null`) — 서버가 지금 위치로 다시 잰다.
     */
    it('🔴 자동이면 «무엇으로 정했나» 줄과 [↻ 다시 구하기] 가 있다', () => {
        expect(modal).toMatch(/다시 구하기/);
        expect(codeOnly(modal)).toMatch(/radiusDistanceKm:\s*null/);
    });

    it('🔴 자동이면 반경 손잡이가 흐려진다 — 감추지 않는다', () => {
        /* ⚠️ `KNOB_FIELDS` 첫 등장은 **선언부**다 — 손잡이를 만드는 «쓰는 자리»를 본다 */
        const i = modal.indexOf('KNOB_FIELDS.map(');
        expect(i).toBeGreaterThan(-1);
        const body = modal.slice(i, i + 1800);
        expect(body).toMatch(/dim:/);
        expect(body).toMatch(/radiusAuto/);
        expect(body).not.toMatch(/hidden/);
    });

    /**
     * 🔴 **곱하는 자리는 한 곳뿐이다** (2026-09-12 실측에서 잡았다).
     *
     * 서버가 반경을 3.9/5.9/2.4 로 줄였는데 **요약줄은 164동 그대로였다** —
     * 지도(옛 `useCallNet`)가 여전히 **원값**을 보고 그렸기 때문이다.
     * «지도는 든다는데 판정은 탈락»이 되기 직전이었다 (규칙 ③).
     */
    it('🔴 지도와 필터가 «같은 함수»로 반경을 구한다', () => {
        const stage = readClient('components/stage/StageView.tsx');
        expect(stage).toMatch(/effectiveRadii\(/);
        expect(modal).toMatch(/effectiveRadii\(/);
        /* 배율을 제 손으로 곱하는 자리가 남아 있으면 안 된다 */
        expect(codeOnly(stage)).not.toMatch(/radiusScale\s*\*|\*\s*radiusScale/);
        expect(codeOnly(modal)).not.toMatch(/radiusScale\s*\*|\*\s*radiusScale/);
    });

    /**
     * 🔴 **마름모반경도 함께 흐려진다** (2026-09-12 실측에서 잡았다).
     *    반경 셋(`KNOB_FIELDS`)만 고쳤더니 **서버와 지도는 6.2km 로 줄였는데
     *    마름모 칸만 25km 라고 적고 있었다.** 각도 둘은 그대로 만질 수 있어야 한다.
     */
    it('🔴 마름모반경도 자동을 따른다 — 각도 둘은 아니다', () => {
        /* ⚠️ `QUAD_FIELDS.map(` 은 세 곳이다(초기화·채우기·손잡이) — **손잡이 자리**를 집는다 */
        const i = modal.indexOf('knobs={QUAD_FIELDS.map(');
        expect(i).toBeGreaterThan(-1);
        const body = modal.slice(i, i + 1600);
        expect(body).toMatch(/quadRadiusKm/);
        expect(body).toMatch(/radiusAuto/);
        expect(body).toMatch(/dim:/);
    });

    it('🔴 자동이면 손으로 못 민다 — 화면과 값이 갈라지지 않게', () => {
        const i = modal.indexOf('KNOB_FIELDS.map(');
        const body = modal.slice(i, i + 1800);
        /* `set`·`onCommit` 이 자동일 때 막혀야 한다 */
        expect(body).toMatch(/radiusAuto \?|!radiusAuto/);
    });
});
