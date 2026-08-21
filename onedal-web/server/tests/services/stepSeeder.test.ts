import db from '../../src/db';
import { birthFirstStep, bridgeCargoReport, bridgeMilestone, bridgeUndoMilestone, stepsView } from '../../src/services/stepSeeder';

/**
 * 🌱 **여섯 단계는 순서대로 태어난다** (기사님 2026-08-20 · 출생 모델)
 *
 * 기사님: *"한번에 생긴다면 상차지 통화할 때 값을 바꾸면 **뒤 필드도 찾아가 수정해줘야**
 * 하잖아. 어차피 시퀀스면 순서에 왔을 때 만들고, 다음 순서로 가면 **이전 값 가지고 와서**
 * 새로 row 만들어 넣으면 DB에 라이트만 하면 되니까."*
 *
 * 이 검사가 지키는 성질 셋:
 *   ① KEEP 은 첫 행만 낳는다 — 뒤 행을 미리 만들지 않는다
 *   ② 다음 행은 **가장 신선한 값**을 물려받아 태어난다 (실측 > 통화 > 차종 기본)
 *   ③ 안 태어난 단계는 저장되지 않고 **회색 예정**(파생)으로만 보인다
 *
 * 사슬 값은 두 시계 모델(시간체계 ⑯ · 기사님 확정 2026-08-21)이다:
 *   상차 시계: 잡음 + 30분(잠정) — 적요 상차 시각 > 통화 > 잠정
 *   배달 시계: 상차 완료 + 배송 × 150% — 픽업 20분 보정 폐기 · 여유30/휴게30 폐지
 *   16:09 잡음 · 접근 16 · 배송 113 · 상차 8분:
 *     예상 16:25 → 약속 16:39(잡음+30) → 완료 16:47 → 하차 예상 18:40
 *     → 데드라인·하차 약속 19:36(완료+169.5) → 하차 완료 19:41
 */

const ORDER_ID = 'TEST-BIRTH-1';
/** `orders.userId` 가 `users(id)` 를 참조한다 — 실제 계정 하나를 빌려 쓴다 */
const USER: string = (db.prepare(`SELECT id FROM users LIMIT 1`).get() as any)?.id;
const kst = (v: string) => new Date(v).toLocaleTimeString('ko-KR',
    { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });

const putOrder = (over: Record<string, any> = {}) => {
    db.prepare(`DELETE FROM orders WHERE id = ?`).run(ORDER_ID);   // CASCADE 로 단계 행도 지워진다
    const row: Record<string, any> = {
        id: ORDER_ID, userId: USER, status: 'ORDER_CONFIRMED',
        timestamp: '2026-08-20T07:09:00Z', pickup: '경기 광주시 경안동', dropoff: '경기 파주시 금촌동',
        capturedAt: '2026-08-20T07:09:00Z',      // 16:09 KST
        vehicleType: '1t',
        totalDistanceKm: 87, totalDurationMin: 129,
        kakaoSoloDistanceKm: 81.1, kakaoSoloDurationMin: 113,
        ...over,
    };
    const cols = Object.keys(row);
    db.prepare(`INSERT INTO orders (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
      .run(...cols.map(c => row[c]));
};

const view = () => stepsView(ORDER_ID);
const of = (step: string) => view().find(s => s.step === step)!;

afterAll(() => { db.prepare(`DELETE FROM orders WHERE id = ?`).run(ORDER_ID); });

const maybe = USER ? describe : describe.skip;   // 빈 DB 에서는 건너뛴다

maybe('출생 모델 — KEEP 은 첫 행만 낳는다', () => {
    it('🔴 KEEP 후 태어난 행은 상차지 통화 하나뿐이다', () => {
        putOrder();
        birthFirstStep(USER, ORDER_ID);
        const born = view().filter(s => s.born);
        expect(born.map(s => s.step)).toEqual(['CALL_PICKUP']);
    });

    it('🔴 안 태어난 다섯도 회색 예정으로 **값은 보인다** — "다음에 뭐가 올지는 알아야지"', () => {
        putOrder();
        birthFirstStep(USER, ORDER_ID);
        const preview = of('ARRIVE_DROPOFF');
        expect(preview.born).toBe(false);
        expect(kst(preview.row.predicted_at)).toBe('18:40');   // 완료(16:47)+113 — 파생값, 저장 안 됨
        expect((db.prepare(`SELECT COUNT(*) c FROM step_arrive_dropoff WHERE orderId = ?`)
            .get(ORDER_ID) as any).c).toBe(0);
    });

    it('첫 행의 사슬 값 — 예상 16:25 (접근 129−113) · 약속 16:39 (상차 시계 = 잡음+30)', () => {
        putOrder();
        birthFirstStep(USER, ORDER_ID);
        const r = of('CALL_PICKUP').row;
        expect(kst(r.predicted_at)).toBe('16:25');
        expect(kst(r.promised_arrival_at)).toBe('16:39');   // 여유30 이 아니라 상차 시계
    });

    /**
     * 🔴 **캡 바닥** (리허설 13번 실측 버그) — 상차 시계가 도착 예상보다 일러도
     *    도착 전 시각을 약속으로 지어내지 않는다. 약속 = 도착 예상(현실)이 되고,
     *    모자람은 상차버퍼 음수(통화 필수)로 보인다.
     */
    it('🔴 접근이 상차 시계를 넘는 콜 — 약속은 도착 예상까지 (불가능한 약속 금지)', () => {
        putOrder({ totalDurationMin: 153, kakaoSoloDurationMin: 78 });   // 접근 75분 (노하우 13 재현)
        birthFirstStep(USER, ORDER_ID);
        const r = of('CALL_PICKUP').row;
        expect(kst(r.predicted_at)).toBe('17:24');           // 16:09 + 75
        expect(kst(r.promised_arrival_at)).toBe('17:24');    // 시계(16:39)가 아니라 도착 예상
    });

    /** ⏱️ 적요의 상차 시각이 상차 시계를 대체한다 (소숙 콜③ — 10시 예약) */
    it('🔴 적요에 상차 시각이 있으면 그게 상차 시계다', () => {
        putOrder({ detailMemo: '17:30상차 예약' });
        birthFirstStep(USER, ORDER_ID);
        expect(kst(of('CALL_PICKUP').row.promised_arrival_at)).toBe('17:30');
    });

    /**
     * 🔴 **적요는 출생이 읽는다** (기사님 기획 승인 2026-08-21).
     *    옛 시트는 열릴 때마다 적요를 파싱했다 — 이제 태어날 때 한 번 파싱해 계획에 넣고,
     *    화면은 `planned_source` 배지만 그린다. 순서: 실측 > 통화 > **적요** > 차종.
     */
    it('🔴 적요에 짐이 적혀 있으면 그 값으로 태어난다 — 출처는 MEMO', () => {
        putOrder({ detailMemo: '라면박스 30개 수작업' });
        birthFirstStep(USER, ORDER_ID);
        const r = of('CALL_PICKUP').row;
        expect(r.planned_unit).toBe('라면박스');
        expect(r.planned_quantity).toBe(30);
        expect(r.planned_handling).toBe('수작업');
        expect(r.planned_source).toBe('MEMO');
    });

    it('적요에 아무 힌트가 없으면 차종 기본값 — 출처는 VEHICLE', () => {
        putOrder({ detailMemo: '문의는 사무실로' });
        birthFirstStep(USER, ORDER_ID);
        const r = of('CALL_PICKUP').row;
        expect(r.planned_unit).toBe('파레트');       // 1t 기본
        expect(r.planned_source).toBe('VEHICLE');
    });

    it('🔴 주행을 모르면 예상은 null — 0 으로 때우지 않는다 (규칙 ④)', () => {
        putOrder({ totalDurationMin: null, kakaoSoloDurationMin: null });
        birthFirstStep(USER, ORDER_ID);
        const r = of('CALL_PICKUP').row;
        expect(r.predicted_at).toBeNull();
        expect(r.promised_arrival_at).not.toBeNull();   // 약속은 옛 규칙(잡은 시각 + 60분)으로 폴백
    });
});

maybe('출생 모델 — 단계가 끝나면 다음이 앞 값을 물려받아 태어난다', () => {
    it('🔴 상차 통화 완료 → 약속이 굳고 하차지 통화가 태어난다', () => {
        putOrder();
        birthFirstStep(USER, ORDER_ID);
        bridgeCargoReport(USER, ORDER_ID, {
            stopType: 'pickup', kind: 'DECLARED',
            unit: '파레트', quantity: 2, handling: '지게차',
            promisedArrivalAt: '2026-08-20T08:02:00Z',      // 격자에서 17:02 를 골랐다
        } as any);
        const call = of('CALL_PICKUP');
        expect(call.row.status).toBe('DONE');
        expect(kst(call.row.promised_arrival_at)).toBe('17:02');
        expect(of('CALL_DROPOFF').born).toBe(true);
        expect(of('ARRIVE_PICKUP').born).toBe(false);        // 두 칸을 한 번에 안 간다 (규칙 ⑥)
    });

    /**
     * 🔴 **한번에 생성 모델이 못 하던 것** — 통화에서 짐을 바꾸면(파레트→라면박스)
     *    그 **뒤에 태어나는** 행이 바뀐 값으로 태어난다. 찾아다니며 고칠 일이 없다.
     */
    it('🔴 통화에서 라면박스로 바꾸면 뒤 행이 라면박스로 태어난다', () => {
        putOrder();
        birthFirstStep(USER, ORDER_ID);
        bridgeCargoReport(USER, ORDER_ID, {
            stopType: 'pickup', kind: 'DECLARED',
            unit: '라면박스', quantity: 40, handling: '수작업',
        } as any);
        bridgeCargoReport(USER, ORDER_ID, { stopType: 'dropoff', kind: 'SKIPPED' } as any);
        bridgeMilestone(USER, ORDER_ID, 'ARRIVED_PICKUP' as any, 'MANUAL_WEB');
        const loaded = of('LOADED');
        expect(loaded.born).toBe(true);
        expect(loaded.row.planned_unit).toBe('라면박스');
        expect(loaded.row.planned_quantity).toBe(40);
    });

    it('통화 스킵도 다음을 낳는다 — 미리 눌린 값이 확정으로 굳는다', () => {
        putOrder();
        birthFirstStep(USER, ORDER_ID);
        bridgeCargoReport(USER, ORDER_ID, { stopType: 'pickup', kind: 'SKIPPED' } as any);
        const call = of('CALL_PICKUP');
        expect(call.row.status).toBe('SKIPPED');
        expect(call.row.promised_arrival_at).not.toBeNull();   // 스킵이어도 약속은 남는다
        expect(of('CALL_DROPOFF').born).toBe(true);
    });

    it('🔴 GPS 도착도 같은 다리로 온다 — 마감 + 다음 출생', () => {
        putOrder();
        birthFirstStep(USER, ORDER_ID);
        bridgeCargoReport(USER, ORDER_ID, { stopType: 'pickup', kind: 'SKIPPED' } as any);
        bridgeCargoReport(USER, ORDER_ID, { stopType: 'dropoff', kind: 'SKIPPED' } as any);
        bridgeMilestone(USER, ORDER_ID, 'ARRIVED_PICKUP' as any, 'GPS');
        const arrive = of('ARRIVE_PICKUP');
        expect(arrive.row.status).toBe('DONE');
        expect(arrive.row.source).toBe('GPS');
        expect(of('LOADED').born).toBe(true);
    });

    it('🔴 현장 실측(ACTUAL)은 상차 완료 행의 actual_* 로 — 계획과 한 행에서 견준다', () => {
        putOrder();
        birthFirstStep(USER, ORDER_ID);
        bridgeCargoReport(USER, ORDER_ID, {
            stopType: 'pickup', kind: 'DECLARED', unit: '파레트', quantity: 2, handling: '지게차',
        } as any);
        bridgeCargoReport(USER, ORDER_ID, { stopType: 'dropoff', kind: 'SKIPPED' } as any);
        bridgeMilestone(USER, ORDER_ID, 'ARRIVED_PICKUP' as any, 'MANUAL_WEB');
        bridgeCargoReport(USER, ORDER_ID, {
            stopType: 'pickup', kind: 'ACTUAL', unit: '라면박스', quantity: 40, handling: '수작업',
        } as any);
        const r = of('LOADED').row;
        expect(r.planned_unit).toBe('파레트');      // 계획 그대로
        expect(r.actual_unit).toBe('라면박스');     // 실측 그대로 — 오차가 한 행에서 나온다
    });

    /**
     * 🔴 **지나쳐진 단계도 태어난다** (기사님 실측 2026-08-21 · 3콜 리허설).
     *    통화 없이 GPS 도착이 먼저 오면, 방어 출생이 도착 행만 낳고 건너뛰어진
     *    하차지 통화는 영영 미출생이었다 — 회색 모형이라 운행 중 통화를 못 했다.
     *    마감은 **거기까지의 모든 미출생을 낳고** 자기를 마감한다. 빠뜨린 단계는
     *    PLANNED 로 태어나 노란 막대로 보이고, 언제든 눌러서 채울 수 있다.
     */
    it('🔴 통화 없이 GPS 도착이 오면 — 건너뛰어진 통화 행도 태어난다 (PLANNED)', () => {
        putOrder();
        birthFirstStep(USER, ORDER_ID);
        // 통화 0번 — 바로 GPS 도착
        bridgeMilestone(USER, ORDER_ID, 'ARRIVED_PICKUP' as any, 'GPS');
        const drop = of('CALL_DROPOFF');
        expect(drop.born).toBe(true);            // 태어났다 — 눌러서 통화할 수 있다
        expect(drop.row.status).toBe('PLANNED'); // 안 한 건 안 한 것 (규칙 ④)
        expect(of('ARRIVE_PICKUP').row.status).toBe('DONE');
        expect(of('LOADED').born).toBe(true);
    });

    /**
     * 🔴 잘못 눌러도 되돌릴 수 있어야 한다 (기사님: *"단계별로 저장하고 수정이 가능해야 한다"*).
     *    마감만 푼다 — 이미 태어난 다음 행은 지우지 않는다 (PLANNED 로 무해).
     */
    it('🔴 도착 되돌리기 — 마감이 풀리고, 태어난 다음 행은 남는다', () => {
        putOrder();
        birthFirstStep(USER, ORDER_ID);
        bridgeCargoReport(USER, ORDER_ID, { stopType: 'pickup', kind: 'SKIPPED' } as any);
        bridgeCargoReport(USER, ORDER_ID, { stopType: 'dropoff', kind: 'SKIPPED' } as any);
        bridgeMilestone(USER, ORDER_ID, 'ARRIVED_PICKUP' as any, 'MANUAL_WEB');
        bridgeUndoMilestone(USER, ORDER_ID, 'ARRIVED_PICKUP' as any);
        const arrive = of('ARRIVE_PICKUP');
        expect(arrive.row.status).toBe('PLANNED');
        expect(arrive.row.occurred_at).toBeNull();
        expect(of('LOADED').born).toBe(true);   // 출생 기록은 지우지 않는다
    });

    /**
     * 🔴 **합짐도 예측이 있어야 한다** (기사님 실측 2026-08-21 · 3콜 리허설).
     *    합짐은 kakaoSolo 가 없어 예측이 전부 null 이었다 — 격자가 "주행 시간을 아직
     *    모릅니다"만 띄웠다. 그런데 **경로는 알고 있었다** (`⑴ 7478-2 상차 4분`).
     *    시딩이 경로(타임라인)를 받아 걷는다 — 파생을 또 만들지 않고 재사용한다 (규칙 ③).
     */
    it('🔴 합짐(solo 없음)도 경로가 알면 예측을 갖고 태어난다', () => {
        putOrder({ totalDurationMin: null, kakaoSoloDurationMin: null });   // 합짐의 실제 모습
        const anchor = Date.parse('2026-08-20T07:09:00Z');
        const routeTl = [
            { orderId: ORDER_ID, stopType: 'pickup', etaMs: anchor + 4 * 60_000, promisedUntil: null },
            { orderId: ORDER_ID, stopType: 'dropoff', etaMs: anchor + 101 * 60_000, promisedUntil: null },
        ] as any;
        birthFirstStep(USER, ORDER_ID, undefined, routeTl);
        const r = of('CALL_PICKUP').row;
        expect(kst(r.predicted_at)).toBe('16:13');                 // 닻 + 4분 (경로가 앎)
        expect(kst(r.promised_arrival_at)).toBe('16:39');          // 상차 시계 (잡음+30)
    });

    /**
     * ⏱️ **배달 데드라인의 기산점은 상차 완료다** (시간체계 ⑯ · 소숙 자막 [09:08]).
     *    상차 전 대기는 배달 시계를 태우지 않는다 — 잡은-시각 기산이었으면
     *    이 짧은 콜이 16:59 에 잘렸다.
     */
    it('🔴 짧은 콜 — 배달 데드라인 = 상차 완료 + 배송×150%', () => {
        putOrder({ totalDurationMin: 40, kakaoSoloDurationMin: 20 });   // 접근 20 · 배송 20
        birthFirstStep(USER, ORDER_ID);
        bridgeCargoReport(USER, ORDER_ID, { stopType: 'pickup', kind: 'SKIPPED' } as any);
        // 상차 약속 16:39(시계) · 완료 16:47 · 데드라인 = 16:47 + 20×1.5 = 17:17
        expect(kst(of('CALL_DROPOFF').row.promised_arrival_at)).toBe('17:17');
    });

    it('🔴 통화로 굳힌 약속은 데드라인과 무관하게 그대로 — 화주 합의가 면책이다', () => {
        putOrder({ totalDurationMin: 40, kakaoSoloDurationMin: 20 });
        birthFirstStep(USER, ORDER_ID);
        bridgeCargoReport(USER, ORDER_ID, {
            stopType: 'pickup', kind: 'DECLARED',
            promisedArrivalAt: '2026-08-20T12:00:00Z',   // 21:00
        } as any);
        expect(kst(of('CALL_PICKUP').row.promised_arrival_at)).toBe('21:00');
    });

    it('끝까지 가면 여섯이 다 태어나 있고, 전부 마감돼 있다', () => {
        putOrder();
        birthFirstStep(USER, ORDER_ID);
        bridgeCargoReport(USER, ORDER_ID, { stopType: 'pickup', kind: 'SKIPPED' } as any);
        bridgeCargoReport(USER, ORDER_ID, { stopType: 'dropoff', kind: 'SKIPPED' } as any);
        for (const m of ['ARRIVED_PICKUP', 'PICKED_UP', 'ARRIVED_DROPOFF', 'DELIVERED'])
            bridgeMilestone(USER, ORDER_ID, m as any, 'MANUAL_WEB');
        const all = view();
        expect(all.filter(s => s.born)).toHaveLength(6);
        expect(all.every(s => s.row.status !== 'PLANNED')).toBe(true);
    });
});
