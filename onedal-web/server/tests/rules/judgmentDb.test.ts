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

/**
 * 🔴 **콜 필터와 판정 기준은 화면·소켓·스토어까지 갈라져 있다** (기사님 확정 2026-08-16)
 *
 * *"필터와 완전 분리 격리되어 각각 따로 작동해야 한다."*
 *
 * 한 페이로드·한 스토어에 태우면 갈라 놓은 의미가 없다 —
 * 필터가 바뀔 때마다 판정 기준이 딸려 나가고, 관제웹도 둘을 한 덩어리로 다루게 된다.
 */
describe('콜 필터 ↔ 판정 기준 — 화면까지 갈라져 있다', () => {

    const CLIENT = join(__dirname, "../../../client-app/src");
    const rc = (rel: string) => codeOnly(readFileSync(join(CLIENT, rel), "utf8"));

    it('🔴 판정 기준이 filter 페이로드에 섞이지 않는다', () => {
        const fm = codeOnly(read('state/filterManager.ts'));
        const fn = fm.slice(fm.indexOf('function broadcastFilter'));
        expect(fn.slice(0, fn.indexOf('\n}'))).not.toMatch(/judgment/);
    });

    it('🔴 별도 소켓 이벤트로 오간다', () => {
        const h = codeOnly(read('socket/socketHandlers.ts'));
        expect(h).toMatch(/socket\.emit\("judgment-init", session\.judgment\)/);
        expect(h).toMatch(/"save-judgment"/);
        expect(h).toMatch(/emit\("judgment-updated"/);
    });

    it('🔴 저장은 트랜잭션 하나 — 절반만 반영되지 않는다', () => {
        const h = codeOnly(read('socket/socketHandlers.ts'));
        const fn = h.slice(h.indexOf('"save-judgment"'));
        expect(fn.slice(0, 1200)).toMatch(/db\.transaction\(/);
        // 들어온 값을 그대로 믿지 않는다 — 범위 밖이면 잘라 넣는다
        expect(fn.slice(0, 1200)).toMatch(/judgmentFromRow\(judgmentToRow\(/);
    });

    it('🔴 관제웹 스토어도 콜 필터와 따로다', () => {
        const js = rc('stores/judgmentStore.ts');
        expect(js).toMatch(/socket\.on\('judgment-init'/);
        expect(js).toMatch(/socket\.on\('judgment-updated'/);
        // 어제의 5중 구독 사고를 되풀이하지 않는다
        expect(js).toMatch(/if \(subscribed\) return;/);
        expect(rc('stores/filterStore.ts')).not.toMatch(/judgment/);
    });

    it('🔴 폼을 손으로 그리지 않는다 — 표를 읽어 자동 생성한다', () => {
        const tab = rc('components/dashboard/settings/JudgmentSettingsTab.tsx');
        expect(tab).toMatch(/JUDGMENT_FIELDS/);
        // 칸 이름을 하드코딩하면 표에 줄이 늘어도 화면이 안 따라온다
        expect(tab).not.toMatch(/merge_honey_max_minutes/);
        expect(tab).toMatch(/f\.why/);        // 근거를 칸마다 띄운다
    });

    /**
     * ⚠️ 「오늘만」이라는 **말**은 화면에 있어도 된다 — *"여기서 바꾸면 계속 적용됩니다
     *    (「오늘만」이 없습니다)"* 는 기사님께 차이를 알려 주는 안내다.
     *    없어야 하는 것은 **버튼과 그 동작**이다. 그래서 버튼 목록과 저장 인자를 본다.
     */
    it('🔴 판정 기준 탭에 「오늘만」 **버튼**이 없다 (그건 콜 필터에만 있다)', () => {
        const tab = rc('components/dashboard/settings/JudgmentSettingsTab.tsx');
        const buttons = [...tab.matchAll(/<button[\s\S]*?>([\s\S]*?)<\/button>/g)].map(m => m[1]);
        expect(buttons.length).toBeGreaterThan(0);
        for (const b of buttons) expect(b).not.toMatch(/오늘만/);
        expect(buttons.join(' ')).toMatch(/적용/);
        expect(tab).not.toMatch(/saveAsDefault/);          // 콜 필터의 저장 인자
        expect(rc('stores/judgmentStore.ts')).not.toMatch(/saveAsDefault|오늘만/);
    });

    it('설정 모달에 「판정 기준」 탭이 있다 (「판정/필터」가 아니다 — 「요율/필터」와 헷갈린다)', () => {
        const m = rc('components/dashboard/SettingsModal.tsx');
        expect(m).toMatch(/value="judgment"/);
        expect(m).toMatch(/판정 기준<\/TabsTrigger>/);
        expect(m).not.toMatch(/판정\/필터/);
    });
});

/**
 * 🔴 **접속 순간에 한 번 보내는 값은, 놓친 뒤에도 받을 수 있어야 한다** (2026-08-16 실측)
 *
 * 기사님: *"값을 바꿀 수 없다."*
 *
 * 서버는 `judgment-init` 을 **소켓 접속 순간에 한 번** 보냈다. 그런데 관제웹은 기사님이
 * ⚙️ 설정 → 「판정 기준」 탭을 **여는 순간** 비로소 구독했다 — 그때는 이미 지나간 뒤였다.
 * 값을 못 받으니 `loaded` 가 false 로 남고 **폼이 통째로 잠겼다.**
 *
 * 콜 필터가 **같은 문제를 이미 겪고** `request-filter-init` 으로 풀어 놓았는데,
 * 내가 판정 기준을 만들면서 그 교훈을 안 가져왔다.
 */
describe('놓친 초기값을 다시 받을 수 있다', () => {

    const CLIENT2 = join(__dirname, "../../../client-app/src");
    const rc2 = (rel: string) => codeOnly(readFileSync(join(CLIENT2, rel), "utf8"));

    it('🔴 서버가 요청받으면 다시 보낸다', () => {
        const h = codeOnly(read('socket/socketHandlers.ts'));
        expect(h).toMatch(/socket\.on\("request-judgment"/);
    });

    it('🔴 관제웹이 아직 못 받았으면 달라고 한다 · 재접속에도', () => {
        const js = rc2('stores/judgmentStore.ts');
        expect(js).toMatch(/socket\.emit\('request-judgment'\)/);
        expect(js).toMatch(/loaded/);
        expect(js).toMatch(/socket\.on\('connect'/);   // 재접속 때도 다시 묻는다
    });

    it('🔴 탭이 아니라 대시보드에서 미리 구독한다', () => {
        // 탭에서만 구독하면 탭을 열기 전까지 값이 없다 — 폼이 잠긴 채로 남는다
        expect(rc2('pages/Dashboard.tsx')).toMatch(/ensureJudgmentSocketSubscribed\(\)/);
    });
});
