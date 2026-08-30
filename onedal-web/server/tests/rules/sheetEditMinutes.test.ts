import { readFileSync } from 'fs';
import { join } from 'path';
import db, { seedCallOptions } from '../../src/db';
import { saveStepDwell, DWELL_COLUMN_OF, plannedDwellOf, stepsView, birthFirstStep,
         bridgeCargoReport } from '../../src/services/stepSeeder';
import { dwellActualOfSteps, dwellLedgerOfSteps, dwellSlipMinutes, deriveRouteTimeline, DEFAULT_JUDGMENT, derivationInputsOf } from '@onedal/shared';

/**
 * ✏️ **분(分)은 «이 콜»의 값이다 — 규칙이 아니다** (기사님 확정 2026-08-30)
 *
 * 기사님: *"a 가 맞아. **'예측(14분)과 실제(19분)를 둘 다 남겨'** 이것도 맞아."*
 *
 * ── 🔴 하루 만에 뒤집은 것 ──
 *
 * 2026-08-29 에 이 배지는 콜 옵션 표의 「박스당 분」을 **되돌려 계산해** 고쳤다 (**B**).
 * 화면으로는 똑같아 보이지만 뜻이 전혀 다르다:
 *
 * ```
 * B  오늘 이 짐이 무거웠다  →  «수작업은 원래 박스당 0.5분»  →  내일 남의 짐 예측까지 바뀐다
 * A  오늘 이 짐이 무거웠다  →  «이 콜 이 정거장은 19분»      →  규칙은 그대로
 * ```
 *
 * 🔴 **예측을 덮지 않는다.** 덮으면 «우리 계산이 얼마나 맞았나»를 영영 못 잰다 —
 *    기사님: *"누구도 거짓을 말하지 않았고 **결과는 바뀐 거지**."* 둘 다 사실이다.
 */

const USER: string = (db.prepare(`SELECT id FROM users LIMIT 1`).get() as any)?.id;
const maybe = USER ? describe : describe.skip;

const ID = 'TEST-DWELL-EDIT';
const 콜 = {
    id: ID, userId: USER, status: 'ORDER_CONFIRMED',
    timestamp: '2026-08-30T00:00:00Z', capturedAt: '2026-08-30T00:00:00Z',
    pickup: '경기 광주시 초월읍', dropoff: '경기 이천시 신둔면', vehicleType: '다마스',
};

maybe('✏️ 배지가 고치는 것은 이 콜의 이 정거장이다 (A)', () => {
    beforeAll(() => {
        seedCallOptions(USER);
        db.prepare(`DELETE FROM orders WHERE id = ?`).run(ID);
        const c = Object.keys(콜);
        db.prepare(`INSERT INTO orders (${c.join(',')}) VALUES (${c.map(() => '?').join(',')})`)
          .run(...c.map(k => (콜 as any)[k]));
        birthFirstStep(USER, ID);
        // 완료 행이 있어야 실측을 적을 수 있다 — 출생 모델대로 앞 단계를 채워 태어나게 한다
        for (const st of ['CALL_PICKUP', 'CALL_DROPOFF', 'ARRIVE_PICKUP', 'LOADED', 'ARRIVE_DROPOFF', 'DELIVERED']) {
            const t = st.toLowerCase();
            db.prepare(`INSERT OR IGNORE INTO step_${t} (orderId, userId, status, recorded_at) VALUES (?,?,'PLANNED',?)`)
              .run(ID, USER, new Date().toISOString());
        }
    });
    afterAll(() => db.prepare(`DELETE FROM orders WHERE id = ?`).run(ID));

    /** 🔴 이게 A 와 B 를 가르는 줄이다 — 열려 있는 칸이 완료 행의 실측뿐이어야 한다 */
    it('🔴 실측 칸은 완료 단계에만 있다 — 통화 단계는 안 연다', () => {
        expect(DWELL_COLUMN_OF.LOADED).toBe('actual_dwell_min');
        expect(DWELL_COLUMN_OF.DELIVERED).toBe('actual_dwell_min');
        expect(DWELL_COLUMN_OF.CALL_PICKUP).toBeUndefined();
        expect(DWELL_COLUMN_OF.CALL_DROPOFF).toBeUndefined();
    });

    it('🔴 실측을 적어도 예측은 그 자리에 남는다 — 둘 다 남긴다', () => {
        db.prepare(`UPDATE step_loaded SET planned_dwell_min = 14 WHERE orderId = ?`).run(ID);
        expect(saveStepDwell(ID, 'LOADED', 19)).toBe(true);
        const row = db.prepare(`SELECT * FROM step_loaded WHERE orderId = ?`).get(ID) as any;
        expect(row.actual_dwell_min).toBe(19);
        expect(row.planned_dwell_min).toBe(14);      // ← 안 덮었다
    });

    it('🔴 콜 옵션 표는 손대지 않는다 — 내일 남의 짐 예측이 안 바뀐다', () => {
        const 전 = db.prepare(
            `SELECT num1, num2 FROM call_options WHERE user_id = ? AND category = 'handling' AND key = '수작업'`)
            .get(USER);
        saveStepDwell(ID, 'LOADED', 25);
        const 후 = db.prepare(
            `SELECT num1, num2 FROM call_options WHERE user_id = ? AND category = 'handling' AND key = '수작업'`)
            .get(USER);
        expect(후).toEqual(전);
    });

    it('🔴 판정이 쓰는 정차가 실측으로 바뀐다 — 안 그러면 화면만 바뀐다', () => {
        // 통화 행의 예측을 깔아 둔다 (출생이 하는 일) — 실측이 그걸 이기는지 본다
        db.prepare(`UPDATE step_loaded SET actual_dwell_min = NULL WHERE orderId = ?`).run(ID);
        db.prepare(`UPDATE step_call_pickup  SET planned_dwell_min = 14 WHERE orderId = ?`).run(ID);
        db.prepare(`UPDATE step_call_dropoff SET planned_dwell_min = 10 WHERE orderId = ?`).run(ID);
        const 전 = plannedDwellOf(stepsView(ID, DEFAULT_JUDGMENT, 콜 as any));
        expect(전?.pickupDwell).toBe(14);

        saveStepDwell(ID, 'LOADED', 19);
        const 후 = plannedDwellOf(stepsView(ID, DEFAULT_JUDGMENT, 콜 as any));
        expect(후?.pickupDwell).toBe(19);
        expect(후?.dropoffDwell).toBe(10);        // 하차는 안 건드렸다
    });

    it('음수는 안 받는다 — 없는 숫자를 지어내지 않는다 (규칙 ④)', () => {
        expect(saveStepDwell(ID, 'LOADED', -3)).toBe(false);
    });

    it('통화 단계로는 아무것도 못 쓴다', () => {
        expect(saveStepDwell(ID, 'CALL_PICKUP' as any, 30)).toBe(false);
    });

    /**
     * 🔴 **안 먹었으면 화면이 알아야 한다** (자기 리뷰 2026-08-30).
     *    예전엔 false 를 돌리고 끝이라, 기사님은 **눌렀는데 안 바뀐 화면**만 보셨다.
     */
    it('🔴 저장이 안 되면 소켓이 이유를 던진다 — 조용히 넘어가지 않는다', () => {
        const 소켓 = readFileSync(join(__dirname, '../../src/socket/socketHandlers.ts'), 'utf8');
        const 문 = 소켓.slice(소켓.indexOf('save-step-dwell'), 소켓.indexOf('save-step-dwell') + 1200);
        expect(문).toMatch(/if \(!saveStepDwell/);
        expect(문).toMatch(/throw new Error/);
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('⏱️ 실측이 뒤 정거장을 민다 — 기사님의 「−5분」', () => {
    const { rules, unk } = derivationInputsOf(DEFAULT_JUDGMENT);
    const 주문 = (id: string) => ({
        id, status: 'ORDER_CONFIRMED', vehicleType: '다마스',
        capturedAt: '2026-08-30T09:00:00Z', timestamp: '2026-08-30T09:00:00Z',
        pickup: '경기 광주시 초월읍', dropoff: '경기 이천시 신둔면',
    });
    const 상차 = { orderId: 'A', stopType: 'pickup' as const, driveMinutes: 20 };
    const 하차 = { orderId: 'A', stopType: 'dropoff' as const, driveMinutes: 50 };
    const 없음 = { planned: null, actual: null };
    const 장부 = (pickup: any, dropoff: any = 없음) => () => ({ pickup, dropoff });
    const 돌린다 = (stops: any[], 장부f?: any) =>
        deriveRouteTimeline(stops, [주문('A')] as any, () => [], () => [],
            Date.parse('2026-08-30T09:00:00Z'), '2026-08-30T09:00:00Z', rules, unk, 장부f);

    it('🔴 상차 실측이 예측보다 길면 하차 도착이 그만큼 늦어진다', () => {
        const 기본 = 돌린다([상차, 하차]);
        const 예측 = 기본[0].dwellMinutes;
        const 늦게 = 돌린다([상차, 하차], 장부({ planned: 예측, actual: 예측 + 5 }));
        expect(늦게[1].etaMs! - 기본[1].etaMs!).toBe(5 * 60_000);
    });

    it('🔴 밀린 분이 화면에 쓸 수 있게 나온다 — 앞 정거장 것만 진다', () => {
        const 예측 = 돌린다([상차, 하차])[0].dwellMinutes;
        const 늦게 = 돌린다([상차, 하차], 장부({ planned: 예측, actual: 예측 + 5 }));
        expect(늦게[0].dwellShiftMinutes).toBe(0);   // 상차 자신은 아직 안 밀렸다
        expect(늦게[1].dwellShiftMinutes).toBe(5);   // 하차가 5분 밀렸다
    });

    /**
     * 🔴 **기사님 리허설(2026-08-30)이 잡은 것 — 이게 진짜 위험한 경우다.**
     *
     * «실제로 몇 분 걸렸나»를 아는 순간은 **상차 완료를 누르는 때**인데, 바로 그 순간
     * 상차지가 **경로에서 빠진다.** 처음 만든 계산은 «경로에 남은 정거장»만 훑었으므로
     * 방금 5분 더 걸린 그 정거장을 **아무도 안 셌다** — 화면에 영영 안 떴다.
     *
     * 기사님: *"하차 완료까지 했는데 «보실 것»을 확인 못 했어."* 못 볼 수밖에 없었다.
     */
    it('🔴 다녀와서 경로에서 빠진 정거장의 밀림도 남은 정거장에 실린다', () => {
        const 예측 = 돌린다([상차, 하차])[0].dwellMinutes;
        // 상차를 마쳐 경로에는 하차만 남았다 — 그래도 +5 를 알아야 한다
        const v = 돌린다([하차], 장부({ planned: 예측, actual: 예측 + 5 }));
        expect(v[0].dwellShiftMinutes).toBe(5);
    });

    it('짧게 걸리면 당겨진다 — 부호가 반대다', () => {
        const 예측 = 돌린다([상차, 하차])[0].dwellMinutes;
        const 빨리 = 돌린다([상차, 하차], 장부({ planned: 예측, actual: Math.max(0, 예측 - 5) }));
        expect(빨리[1].dwellShiftMinutes).toBe(-5);
    });

    it('🔴 예측이 없으면 밀렸다고 말하지 않는다 — 견줄 상대가 없다 (규칙 ④)', () => {
        const v = 돌린다([하차], 장부({ planned: null, actual: 30 }));
        expect(v[0].dwellShiftMinutes).toBe(0);
    });

    it('실측이 없으면 옛 동작 그대로다 — 안 넘기면 아무것도 안 바뀐다', () => {
        expect(돌린다([상차, 하차])[1].dwellShiftMinutes).toBe(0);
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 🔴 **실측이 «라벨»로만 붙고 약속에는 안 들어갔다** (기사님 리허설 2026-08-30 · 로그 대조)
 *
 * 화면이 두 말을 했다:
 * ```
 * 신둔면 ~03:15  +5분      ← 「5분 밀렸다」고 적으면서, 03:15 는 안 밀린 값
 * ```
 *
 * 하차 약속의 기산점은 `상차 완료`다. 아직 상차를 안 끝냈으면 **도착 실측 + 정차**로
 * 파생하는데(CLAUDE.md ⑤-5), 그 «정차»가 **계산값 14** 였다. 기사님이 적어 둔 **19** 를
 * 안 봤다. 그래서 *"다음 도착지가 5분 늦어진다"* 가 라벨로만 남고 시각은 그대로였다.
 *
 * 🔴 **이 자리는 정거장이 경로에서 빠진 뒤에만 지난다** — 상차지에 도착하면 그 정거장이
 *    경로에서 빠지기 때문이다. 오늘 두 번째로 같은 곳에서 밟혔다 (밀림 누적도 그랬다).
 */
describe('⏱️ 실측 정차가 하차 약속까지 민다', () => {
    const { rules, unk } = derivationInputsOf(DEFAULT_JUDGMENT);
    const T0 = Date.parse('2026-08-30T09:00:00Z');
    const 주문 = {
        id: 'A', status: 'ORDER_CONFIRMED', vehicleType: '다마스',
        capturedAt: '2026-08-30T08:30:00Z', timestamp: '2026-08-30T08:30:00Z',
        pickup: '경기 광주시 초월읍', dropoff: '경기 이천시 신둔면',
        kakaoSoloDurationMin: 20,
    };
    /** 상차지에 **도착만** 했다 — 상차 완료는 아직. 그래서 상차 정거장은 경로에서 빠졌다 */
    const 도착함 = [{ milestone: 'ARRIVED_PICKUP', occurredAt: '2026-08-30T09:00:00Z' }];
    const 하차만 = [{ orderId: 'A', stopType: 'dropoff' as const, driveMinutes: 30 }];
    const 없음 = { planned: null, actual: null };

    const 약속 = (led?: any) => {
        const v = deriveRouteTimeline(하차만, [주문] as any, () => [], () => 도착함 as any,
            T0, '2026-08-30T09:00:00Z', rules, unk, led);
        return v[0].promisedUntil ? Date.parse(v[0].promisedUntil) : null;
    };

    /**
     * 🔴 **바탕값에 기대지 않는다.** 처음엔 «기본 대비 +5분» 으로 적었다가 4분이 나왔다 —
     *    신고가 없으면 정차가 미확인 일반값(15분)이라 내가 가정한 14와 달랐던 것이다.
     *    검사가 틀렸지 제품이 틀린 게 아니었다. 그래서 **실측끼리 견준다.**
     */
    const 실측 = (min: number) => 약속(() => ({ pickup: { planned: 14, actual: min }, dropoff: 없음 }));

    it('🔴 상차가 10분 더 걸리면 하차 약속도 정확히 10분 뒤로 간다', () => {
        expect(실측(19)).not.toBeNull();
        expect(실측(19)! - 실측(9)!).toBe(10 * 60_000);
    });

    it('🔴 약속은 «도착 + 실측 정차 + 단독×150%» 그대로다', () => {
        // 09:00 도착 + 19분 상차 + (단독 20분 × 1.5 = 30분) = 09:49
        expect(실측(19)).toBe(Date.parse('2026-08-30T09:49:00Z'));
    });

    it('실측이 없으면 옛 동작 그대로다', () => {
        expect(약속(() => ({ pickup: 없음, dropoff: 없음 }))).toBe(약속());
    });

    /**
     * 🔴 **라벨과 그 옆 숫자가 같은 말을 해야 한다** — 이게 이 버그의 본질이었다.
     *
     * 고치기 전 화면: `신둔면 ~03:15 +5분` — 「5분 밀렸다」고 적으면서 03:15 는 안 밀린 값.
     * 라벨을 다른 자리로 옮기는 것보다, **약속이 진짜로 밀리게** 하는 것이 답이었다.
     * 이 검사가 둘을 묶어 둔다 — 한쪽만 고치면 여기서 깨진다.
     */
    it('🔴 「+N분」 라벨과 실제로 밀린 분이 같다', () => {
        const 재기 = (min: number | null) => {
            const led = () => ({ pickup: min == null ? 없음 : { planned: 14, actual: min }, dropoff: 없음 });
            const v = deriveRouteTimeline(하차만, [주문] as any, () => [], () => 도착함 as any,
                T0, '2026-08-30T09:00:00Z', rules, unk, led);
            return { 약속: Date.parse(v[0].promisedUntil!), 라벨: v[0].dwellShiftMinutes };
        };
        const a = 재기(14), b = 재기(19);
        expect(b.라벨 - a.라벨).toBe(5);                          // 화면이 「+5분」이라 말하고
        expect((b.약속 - a.약속) / 60_000).toBe(5);               // 시각도 정확히 5분 밀린다
    });
});

describe('⏱️ 실측을 읽는 규칙은 한 곳뿐이다', () => {
    const 행 = (step: string, row: any, born = true) => ({ step, born, row });

    const 장부행 = [
        행('CALL_PICKUP', { planned_dwell_min: 14 }),
        행('LOADED', { planned_dwell_min: 14, actual_dwell_min: 19 }),
        행('DELIVERED', { planned_dwell_min: 10, actual_dwell_min: 5 }),
    ] as any;

    it('완료 행의 실측만 읽는다', () => {
        expect(dwellActualOfSteps(장부행)).toEqual({ pickup: 19, dropoff: 5 });
    });

    it('예측과 실측을 한 쌍으로 읽는다 — 기사님의 14 → 19', () => {
        const l = dwellLedgerOfSteps(장부행);
        expect(l.pickup).toEqual({ planned: 14, actual: 19 });
        expect(dwellSlipMinutes(l.pickup)).toBe(5);
        expect(dwellSlipMinutes(l.dropoff)).toBe(-5);
    });

    it('한쪽만 있으면 밀림은 0 이다 — 지어내지 않는다 (규칙 ④)', () => {
        expect(dwellSlipMinutes({ planned: null, actual: 19 })).toBe(0);
        expect(dwellSlipMinutes({ planned: 14, actual: null })).toBe(0);
    });

    /** 🔴 회색 「예정」은 저장된 게 아니다 — 파생값을 실측으로 읽으면 화면이 거짓말한다 */
    it('안 태어난 행은 안 읽는다', () => {
        expect(dwellActualOfSteps([행('LOADED', { actual_dwell_min: 19 }, false)] as any).pickup).toBeNull();
    });

    it('없으면 null 이다 — 0 으로 지어내지 않는다 (규칙 ④)', () => {
        expect(dwellActualOfSteps([행('LOADED', {})] as any)).toEqual({ pickup: null, dropoff: null });
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('✏️ 화면이 그 규칙을 지키는가', () => {
    const 벗긴다 = (p: string) => readFileSync(join(__dirname, p), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const 시트 = 벗긴다('../../../client-app/src/components/dashboard/StepSheetMock.tsx');
    const 덱 = 벗긴다('../../../client-app/src/components/dashboard/CallDeck.tsx');
    const 경로 = 벗긴다('../../../client-app/src/components/dashboard/PinnedRoute.tsx');

    it('🔴 배지는 콜별 문으로 나간다 — 표를 고치지 않는다', () => {
        expect(시트).toMatch(/save-step-dwell/);
        expect(시트).not.toMatch(/saveCallOptions/);
    });

    it('🔴 단계를 닫는 문(save-cargo-report)으로 보내지 않는다', () => {
        const 배지 = 시트.slice(시트.indexOf('saveActualDwell'), 시트.indexOf('saveActualDwell') + 400);
        expect(배지).not.toMatch(/save-cargo-report/);
    });

    it('🔴 완료 단계에서만 열린다 — 통화 시트는 실측을 안 넘긴다', () => {
        expect(시트).toMatch(/actualDwell=\{\{ orderId, step \}\}/);
        expect((시트.match(/actualDwell=\{\{/g) ?? []).length).toBe(1);
    });

    /**
     * 🔴 **± 를 누를 때마다 저장하지 않는다** (자기 리뷰 2026-08-30).
     *    리허설 로그에 1.7초 동안 7번 저장됐다 — 누를 때마다 DB 쓰기 + 브로드캐스트다.
     *    손을 뗄 때(✓) 한 번만 보낸다.
     */
    it('🔴 ± 는 초안만 바꾸고, 저장은 ✓ 를 누를 때 한 번이다', () => {
        expect(시트).toMatch(/setDraft\(d =>/);
        expect(시트).toMatch(/close\(true\)/);
        // ± 버튼이 곧바로 onEdit 을 부르지 않는다
        expect(시트).not.toMatch(/onClick=\{\(\) => onEdit\(/);
    });

    /**
     * 🔴 **버튼이 움직이면 운전 중에 못 누른다** (기사님 실측 2026-08-30).
     *    ① 고친 값을 `text-info` 로 칠했는데 칩이 선택되면 배경도 `bg-info` 라 **사라졌다**
     *    ② 자릿수가 바뀌면 폭이 변해 ± 버튼이 밀렸다
     */
    it('🔴 고친 값을 배경과 같은 색으로 칠하지 않는다 — 파랑 위 파랑은 안 보인다', () => {
        const 배지 = 시트.slice(시트.indexOf('function MinuteBadge'), 시트.indexOf('function CargoForm'));
        expect(배지).not.toMatch(/text-info/);
    });

    it('🔴 숫자 칸 폭을 고정한다 — 자릿수가 바뀌어도 ± 가 안 밀린다', () => {
        const 배지 = 시트.slice(시트.indexOf('function MinuteBadge'), 시트.indexOf('function CargoForm'));
        expect(배지).toMatch(/min-w-\[/);
        expect(배지).toMatch(/tabular-nums/);
    });

    it('안 바뀌었으면 저장도 안 한다', () => {
        expect(시트).toMatch(/draft !== minutes/);
    });

    it('칩 고르는 것과 섞이지 않는다 — 배지가 눌림을 삼킨다', () => {
        expect(시트).toMatch(/stopPropagation\(\)/);
    });

    it('🔴 밀린 분을 덱이 그린다 — 기사님의 「−5분」', () => {
        expect(덱).toMatch(/dwellShiftMinutes/);
        expect(덱).toMatch(/shift !== 0/);          // 0 이면 안 그린다
    });

    it('🔴 칩 시각의 원천은 타임라인 하나다 — 카카오 구간 ETA 를 따로 안 쓴다', () => {
        expect(경로).toMatch(/routeTimeline/);
        expect(경로).not.toMatch(/buildEtaMap/);
        expect(경로).not.toMatch(/sectionEtas/);
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 🔴 **통화로 박스 수를 고치면 예측 정차도 따라가야 한다** (기사님 리허설 2026-08-30)
 *
 * 장부에서 같은 콜의 두 행이 **다른 예측**을 들고 있었다:
 *
 * ```
 * step_call_pickup   라면박스 20개   예측 14.0분   ← 30개(차종 기본)일 때 값이 남았다
 * step_loaded        라면박스 20개   예측 11.0분   ← 나중에 태어나 20개로 다시 쟀다
 * ```
 *
 * `bridgeCargoReport` 가 `planned_quantity` 만 쓰고 `planned_dwell_min` 은 안 고쳤다.
 * 상차 완료 행이 태어나기 전까지 판정은 **3분 긴 값**을 쓴다.
 *
 * 🔴 어제 배지를 통화 단계에 안 연 이유가 *"손으로 쓴 값이 예측을 얼린다"* 였는데,
 *    **이미 얼어 있었다.** 원인은 배지가 아니라 통화 저장이었다.
 */
maybe('📞 통화로 짐을 고치면 그 행의 예측 정차도 따라간다', () => {
    const ID2 = 'TEST-DECLARE-DWELL';
    const 콜2 = {
        id: ID2, userId: USER, status: 'ORDER_CONFIRMED',
        timestamp: '2026-08-30T00:00:00Z', capturedAt: '2026-08-30T00:00:00Z',
        pickup: '경기 광주시 초월읍', dropoff: '경기 이천시 신둔면', vehicleType: '다마스',
    };
    beforeAll(() => {
        seedCallOptions(USER);
        db.prepare(`DELETE FROM orders WHERE id = ?`).run(ID2);
        const c = Object.keys(콜2);
        db.prepare(`INSERT INTO orders (${c.join(',')}) VALUES (${c.map(() => '?').join(',')})`)
          .run(...c.map(k => (콜2 as any)[k]));
        birthFirstStep(USER, ID2);
    });
    afterAll(() => db.prepare(`DELETE FROM orders WHERE id = ?`).run(ID2));

    const 행 = () => db.prepare(`SELECT * FROM step_call_pickup WHERE orderId = ?`).get(ID2) as any;

    it('태어날 때는 차종 기본값(다마스 30박스)으로 잰다', () => {
        expect(행().planned_quantity).toBe(30);
        expect(행().planned_dwell_min).toBeGreaterThan(0);
    });

    it('🔴 통화로 20박스라 들으면 예측 정차가 줄어든다', () => {
        const 전 = 행().planned_dwell_min;
        bridgeCargoReport(USER, ID2, {
            stopType: 'pickup', kind: 'DECLARED',
            unit: '라면박스', quantity: 20, handling: '수작업', protections: ['결박'],
        } as any, DEFAULT_JUDGMENT);
        const 후 = 행();
        expect(후.planned_quantity).toBe(20);
        expect(후.planned_dwell_min).toBeLessThan(전);     // 짐이 줄었으니 정차도 줄어야 한다
    });

    it('🔴 늘리면 늘어난다 — 한 방향만 따라가는 게 아니다', () => {
        const 전 = 행().planned_dwell_min;
        bridgeCargoReport(USER, ID2, {
            stopType: 'pickup', kind: 'DECLARED',
            unit: '라면박스', quantity: 40, handling: '수작업', protections: ['결박'],
        } as any, DEFAULT_JUDGMENT);
        expect(행().planned_dwell_min).toBeGreaterThan(전);
    });
});
