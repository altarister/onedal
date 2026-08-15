import { readFileSync } from "fs";
import { join } from "path";
import { JUDGMENT_FIELDS, judgmentDefaults, judgmentFromRow, judgmentToRow,
         DEFAULT_JUDGMENT, scoreMerge, dwellMinutes } from "@onedal/shared";

const read = (rel: string) => readFileSync(join(__dirname, "../../src", rel), "utf8");
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/**
 * 🎯 **판정 기준은 DB 에 산다** (기사님 확정 2026-08-16)
 *
 * *"1. docs/판정_기준표.md 로 DB에 새로운 스키마로 테이블을 만들고 기본값을 넣는다.
 *   2. 관제웹에서 새로고침할 때 DB에 있는 값을 가져와 접속한 사용자 세션에 적용해 준다.
 *   3. 콜 받으면 그 세션의 값으로 판정한다."*
 *
 * 🔴 그리고 **콜 필터와 완전히 분리·격리**된다 —
 *    `user_filters`(집기 전 · 국면별 · `오늘만` 있음) ↔ `user_judgment`(집은 뒤 · 한 벌 · 없음)
 */
describe('판정 기준 — 표 하나가 DB·화면·기본값을 다 만든다', () => {

    it('🔴 표에 있는 모든 값이 DB 컬럼과 1:1 이다', () => {
        const cols = JUDGMENT_FIELDS.map(f => f.col);
        expect(new Set(cols).size).toBe(cols.length);           // 중복 없음
        expect(Object.keys(judgmentDefaults()).sort()).toEqual([...cols].sort());
    });

    it('🔴 표의 기본값이 코드 기본값과 같다 (둘이 갈라지면 화면이 거짓말한다)', () => {
        const d = judgmentDefaults();
        for (const f of JUDGMENT_FIELDS) {
            expect(d[f.col]).toBe((DEFAULT_JUDGMENT[f.path[0]] as any)[f.path[1]]);
        }
    });

    it('DB 한 줄 ↔ 설정 객체가 왕복해도 값이 안 변한다', () => {
        const row = judgmentToRow(DEFAULT_JUDGMENT);
        expect(judgmentFromRow(row)).toEqual(DEFAULT_JUDGMENT);
    });

    it('값이 비었거나 이상하면 기본값으로 메운다 (지어내지 않는다)', () => {
        expect(judgmentFromRow(null)).toEqual(DEFAULT_JUDGMENT);
        expect(judgmentFromRow({ merge_honey_max_minutes: 'abc' }).merge.honeyMaxMin)
            .toBe(DEFAULT_JUDGMENT.merge.honeyMaxMin);
    });

    it('🔴 범위를 벗어난 값은 잘라 넣는다 (음수 가중치로 색이 뒤집히지 않게)', () => {
        expect(judgmentFromRow({ weight_drive_time: -5 }).weights.driveTime).toBe(0);
        expect(judgmentFromRow({ color_honey_min: 999 }).color.honeyMin).toBe(100);
    });

    it('🔴 모든 칸에 라벨과 범위가 있다 (폼이 이걸 읽어 그린다)', () => {
        for (const f of JUDGMENT_FIELDS) {
            expect(f.label.length).toBeGreaterThan(0);
            expect(f.unit.length).toBeGreaterThan(0);
            expect(f.max).toBeGreaterThan(f.min);
        }
    });
});

describe('DB 값이 실제로 색을 바꾼다', () => {

    const 콜 = { driveDiffMin: 6, detourKm: 1.1, dwellMin: 25, dwellAssumed: true,
                slackMin: null, slotsFree: 3, slotsTotal: 5 };

    it('🔴 기준을 빡빡하게 바꾸면 같은 콜의 색이 바뀐다', () => {
        expect(scoreMerge(콜).color).toBe('꿀');
        const 빡빡 = judgmentFromRow({ ...judgmentToRow(DEFAULT_JUDGMENT), color_honey_min: 99 });
        expect(scoreMerge(콜, 빡빡).color).not.toBe('꿀');
    });

    it('🔴 상하차 일반값을 바꾸면 계산이 따라온다 (DB 컬럼이 죽어 있지 않다)', () => {
        expect(dwellMinutes(null, 0, 'pickup')).toBe(DEFAULT_JUDGMENT.unknown.pickupDwellMin);
        const unk = { pickupDwellMin: 40, dropoffDwellMin: 35 };
        expect(dwellMinutes(null, 0, 'pickup', unk)).toBe(40);
        expect(dwellMinutes(null, 0, 'dropoff', unk)).toBe(35);
        // 방법을 아는 짐은 일반값과 무관하다
        expect(dwellMinutes('지게차', 0, 'pickup', unk)).toBe(10);
    });
});

describe('세션이 DB 값을 읽고, 판정이 그 값을 쓴다', () => {

    it('🔴 세션이 user_judgment 를 읽는다', () => {
        const store = codeOnly(read('state/userSessionStore.ts'));
        expect(store).toMatch(/FROM user_judgment WHERE user_id/);
        expect(store).toMatch(/judgmentFromRow\(/);
        expect(store).toMatch(/session\.judgment/);
    });

    it('🔴 판정이 기본값이 아니라 **세션 값**을 쓴다 (두 곳 모두)', () => {
        expect(codeOnly(read('core/engine/OrderEvaluator.ts'))).toMatch(/\}, session\.judgment\)/);
        expect(codeOnly(read('services/dispatchEngine.ts'))).toMatch(/\}, session\.judgment\)/);
    });

    it('🔴 상하차 일반값도 세션 값을 타고 내려간다', () => {
        expect(codeOnly(read('core/engine/OrderEvaluator.ts')))
            .toMatch(/totalDetourCost\([^)]*session\.judgment\.unknown\)/);
    });

    it('🔴 컬럼 목록을 db.ts 가 손으로 적지 않는다 (표에서 뽑는다)', () => {
        const db = codeOnly(read('db.ts'));
        expect(db).toMatch(/JUDGMENT_FIELDS\.map/);
        expect(db).toMatch(/ensureColumns\('user_judgment', JUDGMENT_COLS\)/);
        // 컬럼 이름을 문자열로 박아 두면 표와 갈라진다
        expect(db).not.toMatch(/merge_honey_max_minutes\s+INTEGER/);
    });
});
