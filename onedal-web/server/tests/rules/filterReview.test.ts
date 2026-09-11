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

    it('🔴 반경 줄이 넷이다 — 현위·목적·라인·기준', () => {
        const i = modal.indexOf('knobs={[...KNOB_FIELDS.map(');
        expect(i).toBeGreaterThan(-1);
        /* 그 KnobGrid 의 여는 태그 안에 cols={4} 가 있어야 한다 */
        const open = modal.lastIndexOf('<KnobGrid', i);
        const tag = modal.slice(open, i);
        expect(tag).toMatch(/cols=\{4\}/);
        const body = modal.slice(i, i + 3000);
        expect(body).toMatch(/radiusBaseKm/);
    });

    it('🔴 기준 거리는 자동일 때만 산다 — 수동이면 흐리고, 자동이면 나머지 셋이 흐리다', () => {
        const i = modal.indexOf('key: \'radiusBaseKm\'');
        expect(i).toBeGreaterThan(-1);
        const body = modal.slice(i, modal.indexOf('}]}', i));
        expect(body).toMatch(/dim: !radiusAuto/);
    });

    it('🔴 기준 거리를 끌면 서버로 간다 — 재계산 조건에 이미 들어 있다', () => {
        const i = modal.indexOf('key: \'radiusBaseKm\'');
        /* 주석이 길다 — 그 knob 객체가 닫히는 `}]}` 까지 본다 */
        const body = modal.slice(i, modal.indexOf('}]}', i));
        expect(body).toMatch(/updateFilter\(\{ radiusBaseKm/);
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
        /* 합짐 갱신 */
        /* ⚠️ `const kept =` 첫 등장은 netKeywordsOf 안의 다른 줄 — 합짐 갱신의 «goal» 줄을 집는다 */
        const j = fm.indexOf('const goal = goalCityOf(session, userId);');
        expect(j).toBeGreaterThan(-1);
        expect(fm.slice(j, j + 300)).toMatch(/netKeywordsOf\(session, userId, goal/);
        expect(fm.slice(j, j + 300)).not.toMatch(/activeFilter\.destinationCity/);
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
        /* 빈 차 경유 도출도 파생 목적지를 본다 */
        const j = de.indexOf('syncDetourFilter(userId, io);\n        return;');
        expect(de.slice(j, j + 400)).toMatch(/goalCityOf\(/);
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
