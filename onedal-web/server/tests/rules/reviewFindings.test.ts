import db from '../../src/db';
import { getStopTiming } from '../../src/core/helpers';
import { OrderRepository } from '../../src/repositories/OrderRepository';
import { judge, CRITERIA, toSnapshot, DEFAULT_JUDGMENT } from '@onedal/shared';
import type { JudgmentConfig, JudgeFacts } from '@onedal/shared';

/**
 * 🔍 **코드 리뷰가 잡은 것** (2026-08-29 · 판정 갈아타기 직후)
 *
 * 기사님: *"시니어 개발자라 생각하고 먼발치에서 구조·코드 퀄리티 중점으로 오류를 찾아 리뷰해."*
 * 리뷰가 11건을 냈고, 그중 **직접 확인해서 진짜인 것**만 여기 검사로 세운다.
 *
 * 🔴 이 셋이 급하다:
 *   ① 판정을 저장하다 **크래시** — 점수 `null` 인데 칸이 `NOT NULL`
 *   ② 7단계로 올린 정차 값이 **판정 경로에 안 닿는다** (오늘 종일 잡던 그 병)
 *   ③ 못 잰 기준이 화면에 **「0점」으로** 그려진다 (주석은 «0 으로 안 바꾼다»라 적혀 있다)
 */

const cfg = (over: Partial<JudgmentConfig>): JudgmentConfig => ({ ...DEFAULT_JUDGMENT, ...over });
const USER: string = (db.prepare(`SELECT id FROM users LIMIT 1`).get() as any)?.id;
const maybe = USER ? describe : describe.skip;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

maybe('① 🔴 점수를 못 내도 판정 저장이 터지지 않는다', () => {
    const ID = 'TEST-NULL-SCORE';
    afterAll(() => db.prepare(`DELETE FROM order_judgments WHERE orderId = ?`).run(ID));

    /**
     * 🔴 «잴 수 있는 기준이 하나도 없다» 는 실제로 생긴다 — 기사님이 「우회 시급」
     *    가중치를 0 으로 두면 첫짐은 재는 기준이 남지 않는다 (탭의 최솟값이 0 이다).
     *    그때 점수는 `null` 인데 `order_judgments.score` 가 `NOT NULL` 이라 저장이 터지고,
     *    `try` 가 그걸 삼켜 **「카카오 연산 실패」로 둔갑**한다 — 판정이 통째로 사라진다.
     */
    it('가중치를 다 끄면 점수가 null 인데, 저장이 터지지 않는다', () => {
        const v = judge(CRITERIA, { money: { fare: 50_000, extraMinutes: 30 } }, cfg({
            weights: { revenueDetour: 0, bufferCost: 0, slots: 0, promiseGuard: 0, cargoCompat: 0, geography: 0 },
        }));
        expect(v.score).toBeNull();
        db.prepare(`DELETE FROM order_judgments WHERE orderId = ?`).run(ID);
        expect(() => OrderRepository.saveJudgment(ID, USER, toSnapshot(v))).not.toThrow();
    });

    it('되살릴 때도 null 이 그대로다 — 0 으로 지어내지 않는다', () => {
        const back = OrderRepository.getJudgmentVerdict(ID);
        expect(back?.score).toBeNull();
        expect(back?.color).toBe('사고');
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

maybe('② 🔴 판정 기준 탭의 정차 값이 **판정 경로에** 닿는다', () => {
    const ID = 'TEST-DWELL-REACH';
    const 콜 = {
        id: ID, userId: USER, status: 'ORDER_CONFIRMED',
        timestamp: '2026-08-29T00:00:00Z', capturedAt: '2026-08-29T00:00:00Z',
        pickup: '경기 광주시 초월읍', dropoff: '경기 이천시 신둔면', vehicleType: '다마스',
    };
    const put = () => {
        db.prepare(`DELETE FROM orders WHERE id = ?`).run(ID);
        const c = Object.keys(콜);
        db.prepare(`INSERT INTO orders (${c.join(',')}) VALUES (${c.map(() => '?').join(',')})`)
          .run(...c.map(k => (콜 as any)[k]));
    };
    afterAll(() => db.prepare(`DELETE FROM orders WHERE id = ?`).run(ID));

    /**
     * 🔴 7단계에서 「수작업 박스당 분」을 판정 기준 탭으로 올렸는데, **판정이 그걸 안 읽었다.**
     *    `judgmentTunable.test.ts` 는 `dwellMinutes` 를 **직접** 불러 초록불이었다 —
     *    2026-08-29 에 네 번 반복한 «고쳤는데 안 돌고 있는 것» 그대로다.
     */
    it('수작업 박스당 시간을 늘리면 판정이 쓰는 정차도 늘어난다', () => {
        put();
        const 기본 = getStopTiming(ID, undefined, 콜, DEFAULT_JUDGMENT);
        const 느리게 = getStopTiming(ID, undefined, 콜,
            cfg({ dwellPerBox: { forkliftMin: 0.05, manualMin: 0.5 } }));
        expect(느리게.pickupDwell).toBeGreaterThan(기본.pickupDwell);
    });

    it('설정을 안 넘기면 옛 상수로 돈다 (되돌리는 길)', () => {
        put();
        expect(getStopTiming(ID, undefined, 콜).pickupDwell).toBe(14);
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('③ 🔴 못 잰 기준을 화면이 「0점」이라 말하지 않는다', () => {
    const 첫짐: JudgeFacts = {
        money: { fare: 50_000, extraMinutes: 40 },
        promise: { hasExistingCalls: false, lateStops: [], bufferAfterMin: null },
        space: { freePct: null, hasLoad: false },
        nature: { conflicts: [], excludedHits: [], hasLoad: false },
    };

    it('「잴 게 없음」 기준은 점수가 null 이다 — 0 이 아니다', () => {
        const snap = toSnapshot(judge(CRITERIA, 첫짐, DEFAULT_JUDGMENT));
        const 약속 = snap.axes.find(a => a.key === 'promise')!;
        expect(약속.score).toBeNull();
        expect(약속.raw).toContain('잡아 둔 콜이 없습니다');
    });

    it('점수를 낸 기준은 그대로 숫자다', () => {
        const snap = toSnapshot(judge(CRITERIA, 첫짐, DEFAULT_JUDGMENT));
        expect(snap.axes.find(a => a.key === 'money')!.score).toBe(100);
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('④ 「약속」이 깨진 이유에 «0분 늦음» 을 붙이지 않는다', () => {
    /**
     * 옛 조건은 «몇 분 늦는지»를 **문장으로만** 들고 있어 숫자로 못 꺼낸다.
     * 그런데 자리표시자 `0` 을 넣는 바람에 «…12분 깨집니다 **0분 늦음**» 이 됐다 —
     * 문장이 스스로 모순된다 (규칙 ④).
     */
    it('분을 모르면 «N분 늦음» 을 안 적는다', () => {
        const v = judge(CRITERIA, {
            money: { fare: 50_000, extraMinutes: 20 },
            promise: { hasExistingCalls: true, bufferAfterMin: 10,
                       lateStops: [{ label: '첫짐 하차 약속이 12분 깨집니다', lateMinutes: null }] },
            space: { freePct: 70, hasLoad: true },
            nature: { conflicts: [], excludedHits: [], hasLoad: true },
        } as any, DEFAULT_JUDGMENT);
        const o = v.criteria.find(c => c.key === 'promise')!.outcome as any;
        expect(o.why).toBe('첫짐 하차 약속이 12분 깨집니다');
        expect(o.why).not.toContain('0분 늦음');
    });

    it('분을 알면 적는다', () => {
        const v = judge(CRITERIA, {
            money: { fare: 50_000, extraMinutes: 20 },
            promise: { hasExistingCalls: true, bufferAfterMin: 10,
                       lateStops: [{ label: '노선콜 하차', lateMinutes: 7 }] },
            space: { freePct: 70, hasLoad: true },
            nature: { conflicts: [], excludedHits: [], hasLoad: true },
        }, DEFAULT_JUDGMENT);
        expect((v.criteria.find(c => c.key === 'promise')!.outcome as any).why).toContain('7분 늦음');
    });
});
