import { readFileSync } from "fs";
import { join } from "path";

const read = (rel: string) => readFileSync(join(__dirname, "../../src", rel), "utf8");
const CLIENT = join(__dirname, "../../../client-app/src");
const readClient = (rel: string) => readFileSync(join(CLIENT, rel), "utf8");
const codeOnly = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
/** 선언부부터 **그 함수가 닫히는 `\n    };`** 까지 — 글자 수로 자르면 다음 함수를 문다 */
const fnBody = (src: string, decl: string) => {
    const i = src.indexOf(decl);
    if (i < 0) return '';
    return src.slice(i, src.indexOf('\n    };', i));
};

/**
 * 🔍 **필터 이식 전수 조사에서 나온 구멍을 잠근다** (2026-09-12 · 기사님: *"잘 수정해줘"*).
 *
 * 조사 넷(칸 대조·연결·스타일·문서)이 **동작이 틀린 것 11건**을 찾았다. 그중 넷은
 * 오늘 이식(C4-10·C4-12·C4-6b)에서 생긴 것이다 — 컬럼은 팠는데 저장 UPDATE 에 줄을
 * 안 더해 **판 곳과 쓰는 곳이 갈라졌다.** 자정에 자동 모드와 받을 짐이 조용히 풀린다
 * (허용 차종이 풀린 2026-08-10 사고와 같은 모양).
 *
 * 이 파일은 단계마다 describe 를 하나씩 얹는다. 각 describe 머리에 조사 번호를 적는다.
 */

/* ══════════════════════════════════════════════════════════════════════════
 * 1단계 — 오늘 것의 저장 고리 (조사 ①-5·6·7)
 * ══════════════════════════════════════════════════════════════════════════ */
describe('1단계 · 오늘 판 값의 저장 고리 (조사 ①-5)', () => {
    const fm = codeOnly(read('state/filterManager.ts'));
    const us = codeOnly(read('state/userSessionStore.ts'));
    const modal = readClient('components/dashboard/OrderFilterModal.tsx');
    const modalCode = codeOnly(modal);

    it('🔴 💾 UPDATE 에 세 컬럼이 있다 — 판 곳과 쓰는 곳이 같다', () => {
        const i = fm.indexOf('const stmtUpdateFilter');
        expect(i).toBeGreaterThan(-1);
        const sql = fm.slice(i, fm.indexOf('`);', i));
        expect(sql).toMatch(/radius_auto = \?/);
        expect(sql).toMatch(/radius_base_km = \?/);
        expect(sql).toMatch(/accepted_vehicle_types = \?/);
    });

    it('🔴 세션 로드가 세 칸을 읽는다 — 재접속에 안 풀린다', () => {
        const i = us.indexOf('session.baseFilter = {');
        expect(i).toBeGreaterThan(-1);
        const body = us.slice(i, us.indexOf('} as AutoDispatchFilter', i));
        expect(body).toMatch(/radiusAuto/);
        expect(body).toMatch(/radiusBaseKm/);
        expect(body).toMatch(/acceptedVehicleTypes/);
    });

    it('🔴 💾 서버 저장 페이로드에 셋이 실린다', () => {
        const body = fnBody(modalCode, 'const handleSaveToServer');
        expect(body).toMatch(/radiusAuto/);
        expect(body).toMatch(/radiusBaseKm/);
        expect(body).toMatch(/acceptedVehicleTypes/);
    });

    it('🔴 «서버와 다름» 이 셋을 본다 — 바꿔도 «같음» 이면 거짓말이다', () => {
        const body = fnBody(modalCode, 'const unsaved');
        expect(body).toMatch(/radiusAuto/);
        expect(body).toMatch(/radiusBaseKm/);
        expect(body).toMatch(/acceptedVehicleTypes/);
    });

    it('🔴 ↩︎ 되돌리기가 셋을 되돌린다', () => {
        const body = fnBody(modalCode, 'const handleRevert');
        expect(body).toMatch(/radiusAuto/);
        expect(body).toMatch(/radiusBaseKm/);
        expect(body).toMatch(/acceptedVehicleTypes/);
        /* 되돌린 직후 💾 가 헛쓰기를 하지 않게 «담아 둔» 깃발도 내린다 */
        expect(body).toMatch(/setQuadDirty\(false\)/);
        expect(body).toMatch(/setExDirty\(false\)/);
        expect(body).toMatch(/setBlacklistDirty\(false\)/);
    });
});

describe('1단계 · 받을 짐이 목업과 같은 뜻이다 (조사 ①-6)', () => {
    const modal = readClient('components/dashboard/OrderFilterModal.tsx');
    const modalCode = codeOnly(modal);
    const pick = readClient('components/ui/PickLayer.tsx');

    it('🔴 «모두» 에서 하나를 누르면 **그것만** 받는다 — 목업 `MapMockup.tsx` 와 같다', () => {
        /**
         * 목업: `setVehicles(x => x.includes(v) ? x.filter(o => o !== v) : [...x, v])`
         * 빈 목록(=모두)에서 1t 을 누르면 [1t]. 실물이 «1t 만 뺀 넷»으로 만들었었다 — 반대.
         */
        const body = fnBody(modalCode, 'const toggleVehicle');
        expect(body).toMatch(/accepted\.includes\(v\)/);
        expect(body).not.toMatch(/VEHICLE_PICKS\]/);   // «전부에서 빼기» 흔적
    });

    it('🔴 옵션 문자열에 ✕ 를 안 붙인다 — 붙이면 `selected` 비교가 깨진다', () => {
        const i = modal.indexOf('label="🚚 받을 짐"');
        expect(i).toBeGreaterThan(-1);
        const body = modal.slice(i, i + 1800);
        expect(body).not.toMatch(/\? `\$\{v\} ✕`/);
        /* 표시는 부품의 `mark` 로 — 옵션 원문은 그대로 */
        expect(body).toMatch(/mark=/);
    });

    it('🔴 PickLayer 가 `mark` 를 받아 **원문 옆에** 그린다', () => {
        expect(pick).toMatch(/mark\?: /);
        const i = pick.indexOf('options.map(v =>');
        const body = pick.slice(i, i + 900);
        expect(body).toMatch(/mark\?\.\[v\]|mark\?\.\(v\)|mark\[v\]/);
    });
});

describe('1단계 · 기준 거리 칸 (조사 ①-7 · 기사님: "7번 칸을 만들어줘")', () => {
    const modal = readClient('components/dashboard/OrderFilterModal.tsx');

    it('🔴 반경 줄이 셋이다 — 현위·목적·라인 (기준거리는 ⚙️ 설정으로 갔다)', () => {
        /**
         * 🔄 **2026-09-12 — 넷에서 셋으로** (기사님 지시). 기준거리가 ⚙️ 설정 → 필터로
         *    옮겨 갔다. 남은 셋은 «오늘 조이는 값»이라 성격이 같고, 4칸 격자면 한 칸이 빈다.
         */
        /* ⚠️ 앞에 마름모 격자(QUAD_FIELDS)가 하나 더 있다 — **반경 쪽**을 집는다 */
        const i = modal.indexOf('knobs={[...KNOB_FIELDS');
        expect(i).toBeGreaterThan(-1);
        const open = modal.lastIndexOf('<KnobGrid', i);
        expect(modal.slice(open, i)).toMatch(/cols=\{3\}/);
        const body = modal.slice(i, i + 3000);
        expect(body).toMatch(/radiusAuto/);
    });

    /**
     * 🔄 **2026-09-12 — 기준거리가 필터에서 ⚙️ 설정 → 필터로 옮겼다** (기사님 지시).
     *
     * 🔴 필터의 반경 셋(현위·목적·라인)은 «오늘 조이는 값»이고 기준거리는 «한 번 정하면
     *    두는 값»이라 **층이 다르다.** 한 그리드에 섞여 있어 «자동이면 이것만 살고 나머지가
     *    흐려지는» 규칙이 생겼다 — 성격이 다른 값을 한 자리에 둬서 난 일이다.
     *
     * 기사님: *"자동 버튼 안에 들어가는 것이 어떨까? **'40km 기준 반경' | '수동'**"* —
     * 필터 화면은 이제 **말하기만** 하고, 고치는 자리는 설정 하나다.
     */
    it('🔴 자동 버튼이 «무엇을 기준으로»를 말한다 — 손잡이 칸은 없다', () => {
        expect(modal).toMatch(/km 기준 반경/);
        /* 일곱 번째 손잡이는 걷었다 — 고치는 자리가 둘이면 또 갈라진다 */
        expect(modal).not.toMatch(/key: 'radiusBaseKm'/);
    });

    it('🔴 고치는 자리는 ⚙️ 설정 → 필터 하나다 — 평소값으로 저장한다', () => {
        const tab = codeOnly(readClient('components/dashboard/settings/PricingSettingsTab.tsx'));
        expect(tab).toMatch(/radiusBaseKm/);
        /* 🔴 «오늘만»이 없다 — `saveAsDefault` 가 참이라야 평소값이 된다 */
        expect(tab).toMatch(/updateFilter\(\{ radiusBaseKm: v \}, true\)/);
    });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 2단계 — 즉시 반영을 한 벌로 (조사 ①-2·3·4·5)
 * ══════════════════════════════════════════════════════════════════════════ */
describe('2단계 · 배율이 아니라 «거리»를 싣는다 — 화면이 배율을 낸다', () => {
    /**
     * 1단계 실측: 기준거리를 끄는 동안 지도가 **안 따라왔다.** 배율(`radiusScale`)을 서버가
     * 재서 실어 보내니 화면은 기준거리를 바꿔도 배율을 다시 낼 수가 없었다.
     * 서버는 **재료(마름모 축 길이)** 만 싣고, 배율은 `shared` 한 함수가 어디서든 낸다 (규칙 ③).
     */
    const ix = codeOnly(readFileSync(join(__dirname, '../../../shared/src/index.ts'), 'utf8'));
    const ph = codeOnly(readFileSync(join(__dirname, '../../../shared/src/phases.ts'), 'utf8'));
    const fm = codeOnly(read('state/filterManager.ts'));

    it('🔴 DTO 는 거리를 싣고 배율은 안 싣는다', () => {
        expect(ix).toMatch(/radiusDistanceKm\?: number/);
        expect(ix).not.toMatch(/radiusScale\?: number/);
    });

    it('🔴 effectiveRadii 가 거리·기준으로 배율을 직접 낸다', () => {
        const i = ph.indexOf('export function effectiveRadii');
        /* ⚠️ 매개변수 타입이 `} | null` 로 닫혀 `\n}` 에서 끊긴다 — 다음 함수 선언까지 본다 */
        const body = ph.slice(i, ph.indexOf('\nexport function', i + 10));
        expect(body).toMatch(/radiusScaleOf\(/);
        expect(body).toMatch(/radiusDistanceKm/);
        expect(body).not.toMatch(/f\.radiusScale/);
    });

    it('🔴 서버는 거리를 싣는다 — 자동이든 수동이든 (수동→자동 미리보기가 그 자리에서 된다)', () => {
        expect(fm).toMatch(/session\.activeFilter\.radiusDistanceKm\s*=/);
        expect(fm).not.toMatch(/session\.activeFilter\.radiusScale\s*=/);
    });
});

describe('2단계 · 마름모·제외단어도 만지면 바로 (조사 ①-2)', () => {
    const modal = readClient('components/dashboard/OrderFilterModal.tsx');
    const modalCode = codeOnly(modal);

    it('🔴 마름모 셋을 끌면 지도가 따라오고 뗄 때 서버로 간다', () => {
        const i = modal.indexOf('knobs={QUAD_FIELDS.map(');
        expect(i).toBeGreaterThan(-1);
        const body = modal.slice(i, modal.indexOf('})} />', i));
        expect(body).toMatch(/onPreview:/);
        expect(body).toMatch(/previewFilter\(quadShapeFrom\(/);
        expect(body).toMatch(/onCommit:/);
        expect(body).toMatch(/updateFilter\(quadShapeFrom\(/);
    });

    it('🔴 제외 단어 칩을 누르면 바로 메모리로 간다', () => {
        const body = fnBody(modalCode, 'const setBlacklistWords');
        expect(body === '' ? modalCode.slice(modalCode.indexOf('const setBlacklistWords'), modalCode.indexOf('const setBlacklistWords') + 300) : body)
            .toMatch(/updateFilter\(\{ excludedKeywords/);
    });

    it('🔴 자유 입력칸은 **손을 뗄 때**(blur·Enter) 메모리로 — 글자마다 앱에 보내지 않는다', () => {
        expect(modalCode).toMatch(/const commitBlacklist/);
        const i = modal.indexOf('label="🚫 제외 단어"');
        const body = modal.slice(i, i + 2200);
        expect(body).toMatch(/onBlur=\{commitBlacklist\}/);
    });
});

describe('2단계 · 바꾸면 앱 목록도 다시 난다 (조사 ①-3)', () => {
    const fm = codeOnly(read('state/filterManager.ts'));
    it('🔴 needsGeoRecalc 에 그물 재료 넷이 있다', () => {
        const i = fm.indexOf('const needsGeoRecalc');
        const body = fm.slice(i, fm.indexOf(';', i));
        for (const k of ['pickupRadiusKm', 'srcAngleDeg', 'dstAngleDeg', 'quadRadiusKm'])
            expect(body).toMatch(new RegExp(`'${k}' in changes`));
    });
});

describe('2단계 · 줄인 반경이 앱·요약줄·지도 띠에 간다 — 세 벌을 한 벌로 (조사 ①-4·5)', () => {
    it('🔴 앱 피기백이 effectiveRadii 를 싣는다', () => {
        const sc = codeOnly(read('routes/scrap.ts'));
        const i = sc.indexOf('for (const k of APP_FILTER_KEYS)');
        expect(i).toBeGreaterThan(-1);
        expect(sc.slice(i, i + 700)).toMatch(/effectiveRadii\(/);
    });
    it('🔴 요약줄이 effectiveRadii 를 적는다', () => {
        const st = codeOnly(readClient('components/dashboard/OrderFilterStatus.tsx'));
        expect(st).toMatch(/effectiveRadii\(/);
        expect(st).not.toMatch(/filter\.pickupRadiusKm \?\? 0/);
    });
    it('🔴 지도 띠 굵기가 줄인 값이다', () => {
        const sv = codeOnly(readClient('components/stage/StageView.tsx'));
        expect(sv).toMatch(/lineRadiusKm: radii\.detourRadiusKm/);
        expect(sv).not.toMatch(/lineRadiusKm: filter\?\.detourRadiusKm/);
    });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 3단계 — 복귀 토글이 목적지를 안 잃는다 (조사 ①-1)
 * ══════════════════════════════════════════════════════════════════════════ */
describe('3단계 · 그물의 목적지는 «파생»이다 — 복귀를 켜도 기사님 목적지는 그대로 (조사 ①-1)', () => {
    /**
     * 조사가 잡은 것: HOME 으로 갈 때 `activeFilter.destinationCity` 를 **집 시로 덮어썼다.**
     * DEST 로 돌아올 때 `activeFilter.destinationCity || baseFilter…` 가 이미 덮인 값에서
     * 끝나 **파주시가 광주시로 굳었다.** 툴팁은 «끄면 원래 목적지로 돌아갑니다» — 거짓.
     *
     * 🔴 **저장하지 말고 파생시킨다** (규칙 ③). 목적지를 «기억했다 되돌리는» 대신,
     *    그물이 볼 목적지(`goalCity`)를 `callTarget` 에서 매번 낸다 —
     *    HOME 이면 집 시, 아니면 `destinationCity`. 기사님이 정한 값은 한 번도 안 바뀐다.
     *    목업이 그 모양이다 — 복귀를 켜면 목적지가 **바뀌는 게 아니라 얹힌다.**
     */
    const fm = codeOnly(read('state/filterManager.ts'));
    const de = codeOnly(read('services/dispatchEngine.ts'));
    const ix = codeOnly(readFileSync(join(__dirname, '../../../shared/src/index.ts'), 'utf8'));

    it('🔴 DTO 에 파생 `goalCity` 가 있다 — 읽기 전용', () => {
        expect(ix).toMatch(/goalCity\?: string/);
    });

    it('🔴 goalCityOf 한 곳이 목적지를 낸다', () => {
        expect(fm).toMatch(/export function goalCityOf\(/);
        const i = fm.indexOf('export function goalCityOf(');
        const body = fm.slice(i, fm.indexOf('\n}', i));
        expect(body).toMatch(/'HOME'/);
        expect(body).toMatch(/destinationCity/);
    });

    it('🔴 재계산·합짐·경유 조립이 전부 goalCityOf 를 본다 — destinationCity 를 직접 안 읽는다', () => {
        /* 첫짐 재계산 */
        const i = fm.indexOf('needsGeoRecalc) {');
        expect(i).toBeGreaterThan(-1);
        expect(fm.slice(i, i + 400)).toMatch(/goalCityOf\(/);
        /* 합짐 갱신 — 🔄 2026-09-14 목적지가 둘일 수 있다(복귀 대기 · 전수표 3단계). 목적지 목록도 파생 한 곳(`goalCitiesOf`)이다 */
        const j = fm.indexOf('function netOfGoals');
        expect(j).toBeGreaterThan(-1);
        const goalsBody = fm.slice(j, j + 900);
        expect(goalsBody).toMatch(/const goals = goalCitiesOf\(session, userId\)/);
        expect(goalsBody).toMatch(/netKeywordsOf\(session, userId, goal,/);
        const g = fm.indexOf('export function goalCitiesOf(');
        expect(fm.slice(g, fm.indexOf('\n}', g))).toMatch(/'HOME'/);
        /* 경유 ∪ 목적지 조립 */
        const k = fm.indexOf('const merged = unionRegions(');
        expect(fm.slice(k, k + 200)).toMatch(/goalCityOf\(/);
        /* 파생값을 세션에 남긴다 — 화면이 읽는다 */
        expect(fm).toMatch(/session\.activeFilter\.goalCity\s*=/);
    });

    it('🔴 타겟을 바꾸면 그물을 다시 그린다', () => {
        const i = fm.indexOf('const needsGeoRecalc');
        expect(fm.slice(i, fm.indexOf(';', i))).toMatch(/'callTarget' in changes/);
    });

    it('🔴 setCallTarget 이 destinationCity 를 안 보낸다 — 덮어쓰기가 사라진다', () => {
        const i = de.indexOf('callTarget: phase,');
        expect(i).toBeGreaterThan(-1);
        const body = de.slice(i - 200, i + 200);
        expect(body).not.toMatch(/destinationCity: city/);
        /* 빈 차 목록도 파생 목적지를 본다 — 🔄 2026-09-14 부팅·0건·KEEP 이 모두 netFilterOf 한 곳을 지난다 */
        const j = fm.indexOf('function netFilterOf');
        expect(j).toBeGreaterThan(-1);
        /* 🔄 2026-09-14 — 목적지 목록(`goalCitiesOf` · 복귀 대기면 둘)을 `netOfGoals` 가 돈다 */
        expect(fm.slice(j, j + 400)).toMatch(/netOfGoals\(/);
    });

    it('🔴 앱·지도·요약줄이 «그물의 목적지»를 본다', () => {
        const sc = codeOnly(read('routes/scrap.ts'));
        expect(sc).toMatch(/appFilter\.destinationCity\s*=.*goalCity/);
        const sv = codeOnly(readClient('components/stage/StageView.tsx'));
        expect(sv).toMatch(/destinationCity: filter\?\.goalCity \?\? filter\?\.destinationCity/);
        const st = codeOnly(readClient('components/dashboard/OrderFilterStatus.tsx'));
        expect(st).toMatch(/goalCity/);
    });
});

describe('3단계 · 집이 있는 시는 «좌표»로 뽑는다 — 주소 글자에 기대지 않는다', () => {
    /**
     * 실측(2026-09-12): 복귀 토글이 서버에 두 번 닿았는데 «완료» 줄이 없었다 — 집 주소에서
     * 「시」로 끝나는 조각을 못 찾아 거부됐다. 실측 계정의 주소가 `경기 광주 초월 …` 였는데,
     * **기사님 실제 주소도 `경기도 광주 초월 동광뷰엘`** 이라 같은 모양이다 — 기사님도 복귀를
     * 못 켜는 상태였다. 사람이 적는 주소는 «광주시»라고 안 적는다.
     * 🔴 집에는 **좌표**가 있다(`home_x/home_y`). `nearestDong` 이 좌표에서 «경기 광주시»를 낸다 —
     *    그물이 이미 쓰는 그 표(`DONG_CENTROIDS`)다. 주소 글자는 좌표가 없을 때의 물러섬이다.
     */
    const fm = codeOnly(read('state/filterManager.ts'));
    const de = codeOnly(read('services/dispatchEngine.ts'));

    it('🔴 homeCityOf 한 곳이 좌표로 시를 낸다', () => {
        expect(fm).toMatch(/export function homeCityOf\(/);
        const i = fm.indexOf('export function homeCityOf(');
        const body = fm.slice(i, fm.indexOf('\n}', i));
        expect(body).toMatch(/nearestDong\(/);
        expect(body).toMatch(/home_x|\.x\b/);
    });

    it('🔴 goalCityOf 와 setCallTarget 이 그것을 쓴다 — 주소를 각자 자르지 않는다', () => {
        const i = fm.indexOf('export function goalCityOf(');
        expect(fm.slice(i, fm.indexOf('\n}', i))).toMatch(/homeCityOf\(/);
        const j = de.indexOf('export async function setCallTarget');
        const body = de.slice(j, de.indexOf('\nexport ', j + 10));
        expect(body).toMatch(/homeCityOf\(/);
        expect(body).not.toMatch(/split\(\/\\s\+\/\)\.find/);
    });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 4단계 — 안 가져온 것 (조사 ②)
 * ══════════════════════════════════════════════════════════════════════════ */
describe('4단계 · ⛔ 제외 칩 줄 — 목업 그대로 (조사 ② · MapMockup.tsx:3288~3346)', () => {
    /**
     * 목업(기사님 2026-09-09 *"결과물을 첫 줄만 보여 주고 클릭하면 다"*):
     *   · 닫히면 **한 줄** «⛔ 제외 N곳 · 잘린 목록 · ▾ 전부», 펼치면 칩 + «▴ 접기»
     *   · **닫힌 줄에서는 못 지운다** — 잘린 글을 누르다 실수로 되살아나면 안 된다
     *   · 펼친 줄에 **💾 저장(N곳)** · **↩︎ 되돌리기** — 고친 것은 저장을 눌러야 그물에 든다
     *   · 다 지웠어도 줄은 남는다 — «제외한 곳이 없습니다 — 저장하면 전국이 그물에 듭니다»
     * 실물은 늘 전체 칩만 펼쳤다 — 폰에서 여덟 줄이 화면을 먹고, 실수 삭제 방지도 없었다.
     */
    const modal = readClient('components/dashboard/OrderFilterModal.tsx');

    it('🔴 닫히면 한 줄 — ▾ 전부 / 펼치면 ▴ 접기', () => {
        expect(modal).toMatch(/exListOpen/);
        expect(modal).toMatch(/▾ 전부/);
        expect(modal).toMatch(/▴ 접기/);
    });

    it('🔴 닫힌 줄에서는 못 지운다 — 펼쳐야 ✕ 가 달린 칩이다', () => {
        const i = modal.indexOf('▾ 전부');
        /* 접힌 줄 블록(«▾ 전부» 앞뒤 600자)에 되살리기(toggleEx)가 없어야 한다 */
        expect(modal.slice(i - 600, i + 200)).not.toMatch(/toggleEx\(/);
    });

    it('🔴 인라인 💾 저장이 «그물(메모리)»에 넣는다 — 전역 💾 서버 저장과 다른 일이다', () => {
        expect(modal).toMatch(/const applyExcluded/);
        const body = fnBody(codeOnly(modal), 'const applyExcluded');
        expect(body).toMatch(/updateFilter\(\{ excludedRegions: exDraft/);
        /* 인라인 되돌리기는 «지금 그물»로 — 서버 값이 아니다 */
        expect(modal).toMatch(/setExDraft\(filter\?\.excludedRegions/);
    });

    it('🔴 다 지웠어도 줄은 남는다', () => {
        expect(modal).toMatch(/제외한 곳이 없습니다 — 저장하면 전국이 그물에 듭니다/);
    });
});

describe('4단계 · 목적지 설명줄 · 경로 대기 문구 · 저장 안내 (조사 ②)', () => {
    const modal = readClient('components/dashboard/OrderFilterModal.tsx');
    const store = readClient('stores/filterStore.ts');
    const stage = readClient('components/stage/StageView.tsx');

    it('🔴 «🎯 목적지 X · 운행 대기 · 🛣️ 노선» 한 줄이 있다 (목업 MapMockup.tsx:3104)', () => {
        const i = modal.indexOf('🎯 목적지 <b');
        expect(i).toBeGreaterThan(-1);
        const body = modal.slice(i, i + 500);
        expect(body).toMatch(/goalCity/);
        expect(body).toMatch(/routeMode \? '🛣️ 노선' : '🔷 동선'/);
        /* 실물에 없는 «마름모 N개»는 지어내지 않는다 (규칙 ④) */
        expect(body).not.toMatch(/마름모 \{/);
    });

    it('🔴 «⏳ 카카오 경로를 기다립니다» — 콜은 잡았는데 라인이 없을 때만', () => {
        /* 무대만 아는 «라인으로 쟀나»를 store 로 올린다 — 모달이 제 손으로 다시 재지 않는다 */
        expect(store).toMatch(/netUsedLine: boolean \| null/);
        expect(stage).toMatch(/setNetUsedLine\(/);
        expect(modal).toMatch(/⏳ 카카오 경로를 기다립니다/);
        const i = modal.indexOf('⏳ 카카오 경로를 기다립니다');
        expect(modal.slice(i - 400, i)).toMatch(/netUsedLine === false/);
    });

    it('🔴 저장 안내가 참이다 — 제외 지역만 💾 를 눌러야 그물에 든다', () => {
        expect(modal).toMatch(/값을 만지면 <b>바로 적용<\/b>된다.*제외 지역/);
    });
});

describe('4단계 · 지도가 제외지역을 실제로 뺀다 — 키 안의 | 를 구분자로 쓰지 않는다', () => {
    /**
     * 실측(2026-09-12): 광주시를 통째로 뺐더니 **서버는 173 → 148**(«제외로 25개 뺌»)인데
     * **지도 수는 176 그대로**였다. `useCallNet` 이 의존성용으로 `excludedRegions.join('|')` 를
     * 만들고 안에서 `split('|')` 로 되푸는데, 키가 `R|광주시`·`S|서울` 처럼 **`|` 를 품고 있어**
     * `["R","광주시"]` 로 깨졌다 — 지도는 제외를 **한 번도 제대로 적용한 적이 없었다.**
     * 요약줄이 지도 수를 쓰기 시작해서야(C4-11b) 서버와 다른 숫자로 드러났다.
     */
    it('🔴 useCallNet 은 제외 목록을 JSON 으로 굳히고 그대로 되푼다', () => {
        const cn = codeOnly(readClient('hooks/useCallNet.ts'));
        expect(cn).not.toMatch(/excludedRegions \?\? \[\]\)\.join\('\|'\)/);
        expect(cn).not.toMatch(/excludedKey\.split\('\|'\)/);
        expect(cn).toMatch(/JSON\.stringify\(i\.excludedRegions/);
        expect(cn).toMatch(/JSON\.parse\(excludedKey\)/);
    });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 5단계 — 이전부터 끊긴 것 (조사 ①-8·9·10·11)
 * ══════════════════════════════════════════════════════════════════════════ */
describe('5단계 · 관내를 지도도 안다 (조사 ①-8)', () => {
    /**
     * 서버는 관내면 관내 그물로 재는데(`filterManager` C4-8b) 지도(`useCallNet`)는
     * 그 분기가 없었다 → 관내 동안 요약줄 «N 읍면동»이 서버와 달랐다. 같은 함수를 부르면서
     * **입력이 달랐다** — 규칙 ③은 «계산»만이 아니라 «입력»도 한 곳이어야 한다.
     * 🔄 2026-09-14 — 관내 그물은 목적지 원 안만(`netForGoal` 의 `local`) · 각도 360° 우회는 걷었다 (전수표 #29).
     */
    const cn = codeOnly(readClient('hooks/useCallNet.ts'));
    const sv = codeOnly(readClient('components/stage/StageView.tsx'));
    it('🔴 useCallNet 이 localMode 를 받아 서버와 같은 관내 그물(local)로 잰다', () => {
        expect(cn).toMatch(/localMode\?: boolean/);
        expect(cn).toMatch(/local: !!localMode/);
        expect(cn).not.toMatch(/localMode \? 360/);
    });
    it('🔴 무대가 서버 파생값을 그대로 넘긴다', () => {
        expect(sv).toMatch(/localMode: filter\?\.localMode/);
    });
});

describe('5단계 · 노선/동선은 필터 값이다 — 서버도 알고 저장도 된다 (조사 ①-9)', () => {
    /**
     * `routeMode` 는 `Dashboard.tsx` 의 `useState(true)` 하나뿐이었다. 서버는 그 개념이 없어
     * «동선»을 골라도 **판정·앱 목록은 계속 노선**이었고, 새로고침하면 노선으로 돌아갔다.
     * 목업이 그 모양이다 — 노선/동선은 그물의 모양을 정하는 **필터 값**이다.
     */
    const ix = codeOnly(readFileSync(join(__dirname, '../../../shared/src/index.ts'), 'utf8'));
    const fm = codeOnly(read('state/filterManager.ts'));
    const db = codeOnly(read('db.ts'));
    const us = codeOnly(read('state/userSessionStore.ts'));
    const dash = codeOnly(readClient('pages/Dashboard.tsx'));
    const modal = codeOnly(readClient('components/dashboard/OrderFilterModal.tsx'));

    it('🔴 DTO·DB·저장·로드에 routeMode 가 있다', () => {
        expect(ix).toMatch(/routeMode\?: boolean/);
        expect(db).toMatch(/route_mode/);
        const i = fm.indexOf('const stmtUpdateFilter');
        expect(fm.slice(i, fm.indexOf('`);', i))).toMatch(/route_mode = \?/);
        const j = us.indexOf('session.baseFilter = {');
        expect(us.slice(j, us.indexOf('} as AutoDispatchFilter', j))).toMatch(/routeMode/);
    });
    it('🔴 서버 그물이 동선이면 라인을 안 쓴다 · 바꾸면 다시 그린다', () => {
        const i = fm.indexOf('const net = netForGoal(goal, {');
        expect(fm.slice(i, i + 400)).toMatch(/routeMode === false/);
        const k = fm.indexOf('const needsGeoRecalc');
        expect(fm.slice(k, fm.indexOf(';', k))).toMatch(/'routeMode' in changes/);
    });
    it('🔴 화면은 필터 값을 읽는다 — useState 가 아니다', () => {
        expect(dash).not.toMatch(/const \[routeMode, setRouteMode\] = useState/);
        expect(dash).toMatch(/filter\?\.routeMode \?\? true/);
    });
    it('🔴 💾·되돌리기·«서버와 다름» 이 routeMode 를 본다', () => {
        expect(fnBody(modal, 'const handleSaveToServer')).toMatch(/routeMode/);
        expect(fnBody(modal, 'const handleRevert')).toMatch(/routeMode/);
        expect(fnBody(modal, 'const unsaved')).toMatch(/routeMode/);
    });
    it('🔴 앱에는 안 내려간다 — 앱은 그물 결과(동 목록)만 본다', async () => {
        const { APP_FILTER_KEYS } = await import('@onedal/shared');
        expect(APP_FILTER_KEYS).not.toContain('routeMode');
    });
});

describe('5단계 · 레이어 열림은 한 벌 (조사 ①-10) · 죽은 도구 (조사 ①-11)', () => {
    it('🔴 exOpen 이 없다 — 제외 레이어도 openKnob 하나가 연다', () => {
        const modal = codeOnly(readClient('components/dashboard/OrderFilterModal.tsx'));
        expect(modal).not.toMatch(/exOpen/);
        expect(modal).toMatch(/openKnob === 'exSido'/);
    });
    it('🔴 filter-show.ts 가 없어진 표를 안 읽는다', () => {
        const fs = readFileSync(join(__dirname, '../../filter-show.ts'), 'utf8');
        expect(fs).not.toMatch(/FROM user_filter_phases/);
        expect(fs).toMatch(/FROM user_filters/);
    });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 6단계 — 스타일 (조사 ③) : 부품 안은 같다. 갈라진 건 칸 바깥이다
 * ══════════════════════════════════════════════════════════════════════════ */
describe('6단계 · 칸 바깥 스타일을 목업 어휘로 (조사 ③)', () => {
    const modal = readClient('components/dashboard/OrderFilterModal.tsx');
    const knob = readClient('components/ui/KnobGrid.tsx');

    it('🔴 섹션 사이 간격이 0 이 아니다 — 목업 aside 는 gap-2', () => {
        const i = modal.indexOf('custom-scrollbar relative z-10">');
        expect(i).toBeGreaterThan(-1);
        /* 주석 한 줄이 끼어 있다 — 그 다음 여는 태그를 본다 */
        expect(modal.slice(i, i + 400)).toMatch(/<div className="space-y-2">/);
    });

    it('🔴 머리말 규격이 하나다 — 10.5px · font-black · muted (목업 FilterPanel)', () => {
        for (const h of ['📐 그물의 모양', '📐 반경', '🚫 제외 지역'])
            expect(modal).toMatch(new RegExp(`text-\\[10\\.5px\\] font-black [^"]*">${h}`));
        /* 목업은 9.5 / 10.5 / 11 / 13 / 14 만 쓴다 — 9px·10px 이 섞이지 않는다 (머리말·보조문구) */
        expect(modal).not.toMatch(/text-\[9px\]/);
    });

    it('🔴 [자동|수동] 이 다른 토글과 같은 어휘다 — 솔리드 fill · text-white 가 아니다', () => {
        expect(modal).not.toMatch(/'bg-info text-white'/);
        expect(modal).toMatch(/bg-info\/15 border-info\/55 text-info/);
    });

    it('🔴 같은 버튼에 같은 토큰 — 통째 제외·노선/동선 꺼짐', () => {
        expect(modal).not.toMatch(/'border-border bg-surface text-text-muted hover:border-danger'/);
        expect(modal).not.toMatch(/bg-surface-alt\/40 text-text-muted hover:bg-surface-hover/);
    });

    it('🔴 공용 부품에 hex 가 없다 — 테마 토큰으로', () => {
        expect(knob).not.toMatch(/accent-\[#/);
        expect(knob).toMatch(/accent-info/);
    });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 8단계 — 모의 주행을 손으로 켠다 (기사님 2026-09-12)
 * ══════════════════════════════════════════════════════════════════════════ */
describe('8단계 · 모의 주행 — 현황판이 켜고 끈다', () => {
    /**
     * 기사님: *"경로가 생기면 현황판도 알게 될 거고 그때 **버튼을 활성화해서 클릭**하도록
     * 하면 될 듯 싶은데?"* · *"이건 그냥 **테스트용** 모의 주행이야 — 라이브에서는 폰의 GPS를 쓸 거야."*
     *
     * 🔴 예전엔 조건이 맞으면 **저절로** 시작했다 (개발빌드 + 출발 + 경로 + 실GPS 15초 부재).
     *    끄는 길이 없어 «그만 보고 싶은데 계속 도는» 상태가 됐고, 속도는 주소창 `?speed=` 뿐이었다.
     * 🔴 **테스트용이라 서버까지 GPS 를 보낸다** — 폰 GPS 자리를 대신하니 그것이 하던 일
     *    (도착·마일스톤·경로 갱신)을 그대로 밟아야 테스트가 된다. 라이브 차단은 `import.meta.env.DEV`.
     * ⚠️ 목업의 **모의 시계는 안 가져온다** — 목업은 서버를 안 밟기에 성립하는 것이고,
     *    서버를 밟는 주행에 넣으면 화면 시각과 서버 시각이 갈라져 약속·버퍼가 어긋난다.
     */
    const store = readClient('stores/mockDriveStore.ts');
    const gps = codeOnly(readClient('hooks/useMasterGps.ts'));
    const bridge = readClient('statusboard/bridge.ts');

    it('🔴 스토어가 «켤 수 있나 · 도나 · 얼마나 빠르게» 를 든다', () => {
        for (const k of ['available', 'running', 'speed'])
            expect(store).toMatch(new RegExp(`${k}:`));
        for (const f of ['setAvailable', 'start', 'stop', 'setSpeed'])
            expect(store).toMatch(new RegExp(`${f}`));
    });

    it('🔴 «켤 수 있나» 는 관제웹이 올린다 — 현황판이 경로를 제 손으로 다시 보지 않는다', () => {
        expect(gps).toMatch(/st\.setAvailable/);
        /* 개발 빌드 + 경로가 있을 때만 켤 수 있다 — «켤 수 있나»를 정하는 줄을 본다 */
        const i = gps.indexOf('const canMock =');
        expect(i).toBeGreaterThan(-1);
        const decl = gps.slice(i, gps.indexOf(';', i));
        expect(decl).toMatch(/SIMULATOR_AVAILABLE/);
        expect(decl).toMatch(/activePolyline/);
        /* 그 값을 스토어로 올린다 */
        expect(gps).toMatch(/setMockAvailable\(canMock\)/);
    });

    it('🔴 **손으로 눌러야 돈다** — 저절로 시작하지 않는다', () => {
        const i = gps.indexOf('const useMock =');
        expect(i).toBeGreaterThan(-1);
        const decl = gps.slice(i, gps.indexOf(';', i));
        expect(decl).toMatch(/mockRunning/);
    });

    it('🔴 속도는 스토어가 정한다 — 주소창이 아니라', () => {
        expect(gps).toMatch(/speedMultiplier: mockSpeed/);
        /* 주소창은 스토어의 **첫값**으로만 산다 — 훅이 매번 읽지 않는다 */
        expect(gps).not.toMatch(/mockSpeedMultiplier\(\)/);
    });

    it('🔴 현황판이 다리로만 닿는다 — 안쪽을 직접 부르지 않는다', () => {
        expect(bridge).toMatch(/useMockDriveStore/);
    });

    it('🔴 라이브에서는 없다 — 개발 빌드 게이트가 그대로다', () => {
        expect(gps).toMatch(/SIMULATOR_AVAILABLE = import\.meta\.env\.DEV|const SIMULATOR_AVAILABLE/);
    });
});

describe('8단계 · 상차지까지도 모의 주행으로 간다 (현황판 답신 · 기사님 "출발을 해야 상차를 하지")', () => {
    /**
     * 🔴 **순환이었다.** 현황판이 버튼을 붙였는데 켤 수가 없었다 —
     *
     * ```
     * 모의 주행을 켜려면   →  dispatchPhase === 'DELIVERING'
     * DELIVERING 이 되려면 →  상차를 마쳐야 하고
     * 상차를 하려면        →  상차지까지 가야 하는데
     * 가는 것이            →  모의 주행
     * ```
     *
     * 기사님이 그 자리에서 짚으셨다: *"시작 버튼 왜 안풀려?"* → *"출발을 해야 상차를 하지"*.
     * **테스트에서 가장 필요한 구간(콜 잡고 → 상차지까지)이 정확히 막혀 있었다.**
     *
     * 🔴 막는 것이 **두 곳**이었다 (현황판은 앞의 하나만 봤다):
     *   ① 관제웹 `canMock` 의 `isDriving`
     *   ② 서버 `dropOffDutyMockLocation` — DELIVERING 이 아니면 **가짜 좌표를 걷어낸다**
     *      → 클라만 고치면 좌표가 서버에서 지워져 아무 일도 안 난다
     *
     * 🔴 **STANDBY(빈 차)에서는 여전히 걷어낸다.** 그 장치의 원래 목적이다 —
     *    2026-08-14 에 시뮬이 파주에서 멈춘 뒤 가상 좌표가 남아 다음 콜 경로가
     *    «파주 → 광주 → 파주» 156km 로 그려졌다. 빈 차인데 가짜가 남으면 안 된다.
     *    콜을 쥔 뒤(GATHERING·DELIVERING)는 **실제로 움직이는 중**이라 지우면 안 된다.
     */
    const gps = codeOnly(readClient('hooks/useMasterGps.ts'));
    const geo = codeOnly(read('services/geoService.ts'));

    it('🔴 경로가 있으면 국면과 무관하게 켤 수 있다 — 상차지로 갈 수 있어야 한다', () => {
        const i = gps.indexOf('const canMock =');
        const decl = gps.slice(i, gps.indexOf(';', i));
        expect(decl).toMatch(/SIMULATOR_AVAILABLE/);
        expect(decl).toMatch(/activePolyline/);
        expect(decl).not.toMatch(/isDriving/);
    });

    it('🔴 서버가 콜을 쥔 동안에는 가짜 좌표를 기점으로 쓴다 — 빈 차일 때만 집으로 물러난다', () => {
        /**
         * 🔄 **2026-09-12 개편 — «걷어낸다»가 «고른다»로 바뀌었다** (기사님 지시).
         *    전에는 조건이 어긋나면 세션의 좌표를 **지웠고**(`dropOffDutyMockLocation`),
         *    지우는 손이 넷이라 그중 하나를 놓쳐 사고가 났다. 지금은 `originOf` 가
         *    **물을 때마다 고르므로** 지우는 손이 없다 — 그래서 검사도 «고르는 자리»를 본다.
         */
        const i = geo.indexOf('export function originOf');
        expect(i).toBeGreaterThan(-1);
        const body = geo.slice(i, geo.indexOf('\n}', i));
        expect(body).toMatch(/GATHERING/);
        expect(body).toMatch(/DELIVERING/);
        /* 빈 차(STANDBY)에서는 집 주소가 대신한다 — 2026-08-14 사고 */
        expect(body).toMatch(/getHomeLocation/);
        expect(body).toMatch(/isFallback: true/);
    });
});

describe('8단계 · 궤적이 카카오 길을 따라간다 (기사님 "궤적이 엉망이야")', () => {
    /**
     * 기사님 2026-09-12: *"궤적이 엉망이야. **카카오 궤적이 아닌 것 같아.** 목업에서는
     * 지나간 자리를 그려줄 건데 이렇게 그리면 안 되지"* · *"목업에서는 이쁘게 나왔어"* ·
     * *"진짜 GPS로 찍은 건 아니지만 말이지."*
     *
     * 🔴 **원인 둘** (목업과 견줘 찾았다):
     *   ① **그릇** — 목업은 구간 배열(`Pt[][]`)이라 2km 넘게 튀면 **끊고 새 구간**을 연다.
     *      실물은 한 줄이라 **점프가 그대로 직선**으로 남았다. 모의 주행은 정거장에서
     *      도로 밖 좌표를 그대로 찍는데(물류센터 601m), 구간을 안 끊으니 **정거장마다
     *      도로 밖으로 튀었다 돌아오는 직선 둘**이 남았다.
     *   ② **걸음** — 목업은 거리로 보간해 폴리라인 점을 **다 밟는다**. 실물은 `idx += 15` 로
     *      **15개씩 건너뛰어** 카카오 곡선이 직선으로 펴졌다.
     *
     * 🔴 가짜 좌표라도 **그럴듯한 자취**여야 한다 — 목업이 경로선과 궤적을 겹쳐 두는 이유가
     *    *"경로와 지나간 길의 오차를 확인하기 위해"* 라서, 궤적이 엉뚱하면 그 목적이 사라진다.
     */
    const store = readClient('stores/drivenTrailStore.ts');
    const canvas = codeOnly(readClient('components/dashboard/PinnedRouteCanvas.tsx'));
    const sim = codeOnly(readClient('hooks/simStep.ts'));
    /** 👣 쌓는 규칙이 사는 곳 — 목업과 실물이 **같이** 부른다 */
    const trailRule = codeOnly(readClient('lib/driveStep.ts'));
    const mockup = codeOnly(readClient('pages/MapMockup.tsx'));

    it('🔴 궤적은 구간 배열이다 — 쌓는 규칙이 목업과 **한 벌**이다', () => {
        expect(store).toMatch(/segments/);
        /**
         * 🔴 **규칙을 여기에 다시 쓰지 않는다** — 목업과 실물이 같은 함수를 부른다
         *    (`lib/driveStep` 의 `pushTrail`). 베껴 두면 한쪽만 고쳐진다 (규칙 ③).
         */
        /* 🔴 **부르는 자리**를 본다 — `import` 줄만 보면 손으로 베낀 구현도 초록이 된다 */
        const sub = store.slice(store.indexOf('ensureDrivenTrailSubscribed'));
        expect(sub).toMatch(/pushTrail\(/);
        expect(mockup).toMatch(/pushTrail\(/);
        /* 2km 넘게 튀면 새 구간 — 순간이동은 주행이 아니다 */
        expect(trailRule).toMatch(/TRAIL_JUMP_KM/);
    });

    it('🔴 캔버스가 구간마다 따로 긋는다 — 구간을 이으면 점프가 직선으로 남는다', () => {
        const i = canvas.indexOf('layers.trail');
        expect(i).toBeGreaterThan(-1);
        const body = canvas.slice(i, i + 400);
        expect(body).toMatch(/for \(const seg of|\.forEach\(seg|drivenTrail\.map/);
    });

    it('🔴 **지나온 점이 다리를 건넌다** — 시뮬 → 관제 → 알림 세 이음매', () => {
        /**
         * 🔴 이 셋 중 **하나만 빠져도** 궤적은 조용히 끝점만 잇는다 — 화면은 «그려지긴 하는»
         *    상태라 아무도 못 본다. 스토어 검사(`drivenTrailStore.test.ts`)는 알림이 온 뒤만
         *    보므로 **여기까지는 못 지킨다** (변이로 확인했다 · 2026-09-12).
         */
        const sim = codeOnly(readClient('hooks/useMockGpsSimulator.ts'));
        expect(sim.slice(sim.indexOf('setMockLocation({ x: r.loc'))).toMatch(/via: r\.via/);

        const master = codeOnly(readClient('hooks/useMasterGps.ts'));
        const call = master.slice(master.indexOf("publishLocation(loc.lat, loc.lng, 'mock'"));
        expect(call.slice(0, 160)).toMatch(/via:/);

        const bridge = codeOnly(readClient('lib/gpsBridge.ts'));
        const evt = bridge.slice(bridge.indexOf("new CustomEvent('local-gps-update'"));
        expect(evt.slice(0, 160)).toMatch(/via/);
    });

    it('🔴 걸음은 거리로 간다 — 폴리라인 점을 건너뛰지 않는다', () => {
        /* `idx += step` 으로 점을 건너뛰면 카카오 곡선이 직선으로 펴진다 */
        expect(sim).toMatch(/stepKm|KM_PER_TICK/);
        expect(sim).not.toMatch(/st\.idx \+= step/);
        /* 🔴 걸음도 목업과 **같은 함수**가 낸다 — 지나온 점을 `via` 로 돌려준다 */
        expect(sim.slice(sim.indexOf('export function simStep'))).toMatch(/driveStep\(/);
        expect(mockup).toMatch(/driveStep\(/);
    });
});

/**
 * 🪧 **시트 콜 줄 — 목업과 «껍데기까지» 한 벌이다** (기사님 실측 2026-09-12)
 *
 * 기사님: *"시트에 있는 콜 리스트 보면 목업과 디자인이 많이 다르고 **마진 패딩이 있어서
 * 좌우영역을 손해** 보고 있어. 시트 스타일을 가져올 수 없나?"* ·
 * *"상차지 하차지 영역에 색이 폰트에 있는 건지 **값이 없을 때 잘려 보일 때**가 있어"*
 *
 * 🔴 **격자 칸은 이미 한 벌이었다** — 같은 `gridTemplateColumns`, 같은 `callPalette`.
 *    다른 것은 **바깥**이었다: `px-2.5` + `gap-1.5` + 테두리로 한 줄에서 **16px** 을 더 먹어
 *    400px 폰에서 지명이 두 자 일찍 잘렸다 (화면으로 확인하고 고쳤다).
 */
describe('시트 콜 줄 — 목업과 껍데기까지 같다', () => {
    const deck = codeOnly(readClient('components/dashboard/CallDeck.tsx'));
    const mock = codeOnly(readClient('pages/MapMockup.tsx'));

    it('🔴 격자 폭이 한 벌이다 — 실물과 목업이 같은 칸을 쓴다', () => {
        const cols = /gridTemplateColumns: '15px minmax\(0,1fr\) 41px 28px 41px 10px 15px minmax\(0,1fr\) 41px 28px 41px'/;
        expect(deck).toMatch(cols);
        expect(mock).toMatch(cols);
    });

    it('🔴 바깥 여백이 목업과 같다 — 테두리로 좌우를 먹지 않는다', () => {
        const i = deck.indexOf('const rowOf');
        const btn = deck.slice(i, deck.indexOf('gridTemplateColumns', i));
        expect(btn).toMatch(/px-1\.5/);
        /* 사방 테두리는 좌우를 먹는다 — «지금 고른 콜»은 왼쪽 띠 한 변으로 말한다 */
        expect(btn).toMatch(/border-l-2/);
        expect(btn).not.toMatch(/rounded-md border /);
    });

    it('🔴 값이 없어도 칸을 비우지 않는다 — 색 띠만 남으면 «잘렸다»로 읽힌다', () => {
        /* 약속·예상 두 칸 모두 «모르면 모른다»를 적는다 (규칙 ⑤-2) */
        expect(deck).toMatch(/promised \? hhmm\(promised\) : '--:--'/);
        expect(mock).toMatch(/st\.promisedAt \? hhmm\(st\.promisedAt\) : '--:--'/);
    });

    it('🔴 색은 **칸 배경**이고 글자색은 따로다 — 폰트에 든 색이 아니다', () => {
        /* 기사님이 «색이 폰트에 있는 건지» 물으신 자리 — 배경은 `stopBoxBg`, 글자는 `callTextColor` */
        expect(deck).toMatch(/background: box/);
        expect(deck).toMatch(/callTextColor\(no, stop, theme\)/);
    });
});
