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
