import { readFileSync } from "fs";
import { join } from "path";
import { judge, CRITERIA, DEFAULT_JUDGMENT, JUDGMENT_FIELDS, judgmentDefaults, toSnapshot } from "@onedal/shared";
import type { JudgeFacts, JudgmentConfig } from "@onedal/shared";
import { mergeFacts } from "../../src/core/engine/judgeFacts";

/**
 * 🧭 **첫짐의 목적지 전진 배수** (기사님 확정)
 *
 * 무엇을 막나
 * - **덧셈으로 섞는 것** — 목적지 방향만 맞으면 요금 0원짜리가 보통색이 된다. 배수는 돈을 키우는 것이지 돈과 더하는 것이 아니다
 * - **합짐에도 배수를 붙이는 것** — 합짐의 지리는 우회 시급이 이미 센다 (같은 사실을 두 번 세지 않는다)
 * - **못 쟀을 때 불리하게 미는 것** — 목적지를 안 정하셨으면 배수 1.0 이다 (규칙 ⑤-2). 🔴 이 되면 안 된다
 * - 배수의 두 끝이 **코드에 박히는 것** — 기사님이 판정 기준 탭에서 고쳐야 한다 (규칙 ⑤-4 ①)
 */

const cfg = (over: Partial<JudgmentConfig['destBonus']> = {}): JudgmentConfig => ({
    ...DEFAULT_JUDGMENT,
    // 돈과 지리만 켠다 — 나머지가 평균에 섞이면 배수를 못 본다
    weights: { ...DEFAULT_JUDGMENT.weights, slots: 0, promiseGuard: 0, cargoCompat: 0 },
    destBonus: { ...DEFAULT_JUDGMENT.destBonus, ...over },
});

/** 복정동 → 대치4동 — 1.2만 ÷ 65분 = 1.1만/h → 돈 44점 */
const 첫짐 = (progressRatio: number | null, fare = 12_000, unknownWhy: string | null = null): JudgeFacts => ({
    money: { fare, extraMinutes: 65, firstLoad: true },
    promise: { hasExistingCalls: false, lateStops: [], bufferAfterMin: null },
    space: { freePct: null, hasLoad: false },
    nature: { conflicts: [], excludedHits: [], hasLoad: false },
    geography: { firstLoad: true, progressRatio, unknownWhy },
});

const 합짐 = (progressRatio: number | null): JudgeFacts => ({
    money: { fare: 30_000, extraMinutes: 60, firstLoad: false },
    promise: { hasExistingCalls: true, lateStops: [], bufferAfterMin: 60 },
    space: { freePct: 100, hasLoad: true },
    nature: { conflicts: [], excludedHits: [], hasLoad: true },
    geography: { firstLoad: false, progressRatio, unknownWhy: null },
});

const 본다 = (f: JudgeFacts, c: JudgmentConfig = cfg()) => judge(CRITERIA, f, c);
/**
 * 💰 **그 콜의 돈 점수** — 여기 검사들이 재는 것은 **배수**지 눈금이 아니다.
 *    숫자를 박으면 「돈」 눈금을 고칠 때마다 이 파일이 깨진다 (규칙 ③ · 숫자 대신 세는 법).
 */
const 돈점 = (f: JudgeFacts, c: JudgmentConfig = cfg()) =>
    (본다(f, c).criteria.find(x => x.key === 'money')!.outcome as { score: number }).score;
const 지리줄 = (f: JudgeFacts, c: JudgmentConfig = cfg()) => 본다(f, c).criteria.find(x => x.key === 'geography')!;

describe('🧭 첫짐 — 목적지로 전진하면 점수가 곱으로 커진다', () => {

    /**
     * 🔴 **방향이 좋아도 시급이 낮으면 꿀이 아니다** (기사님 확정 · 판정 균형).
     *
     * 이 콜은 1.2만원 ÷ 65분 = **시급 1.1만/h** 다 — 첫짐 기준(2.5만)의 절반이 안 된다.
     * 🔴 배수가 1 을 넘으면 이런 콜이 🔵 가 되고, 그 배수가 **100점 천장을 뚫어** 시급 2.1만과
     *    4.0만까지 같은 🔵 100점으로 뭉갠다.
     * 🔴 그렇다고 **똥으로 떨어뜨리지도 않는다** — 목적지로 곧장 가는 것은 값어치가 맞다.
     */
    it('🔴 04:54 복정동 콜은 똥이 아니다 — 방향이 좋아 보통에 선다', () => {
        const v = 본다(첫짐(0.95));
        expect(v.color).toBe('보통');
        expect(v.score).toBeGreaterThan(DEFAULT_JUDGMENT.color.normalMin);
    });

    it('🔴 요금 0원은 목적지 방향이 완벽해도 0점이다 — 곱셈이라서', () => {
        const v = 본다(첫짐(0.95, 0));
        expect(v.score).toBe(0);
        expect(v.color).toBe('똥');
    });

    it('🔴 완전히 반대 방향이면 배수가 하한에서 멈춘다', () => {
        expect(본다(첫짐(-1)).score).toBe(Math.round(돈점(첫짐(-1)) * DEFAULT_JUDGMENT.destBonus.min));
    });

    /* 🔴 옆으로 가는 첫짐은 두 끝의 한가운데다 — 곧장(×1.0)과 뒤로(×0.5) 사이 */
    it('전진율 0(수직)이면 배수가 두 끝의 한가운데다', () => {
        const { max, min } = DEFAULT_JUDGMENT.destBonus;
        expect(본다(첫짐(0)).score).toBe(Math.round(돈점(첫짐(0)) * (min + (max - min) / 2)));
    });

    /**
     * 🔴 **방향이 다르면 점수가 갈려야 한다** — 이것이 이 기준이 있는 까닭이다.
     *    배수가 1 을 넘던 때는 곧장(×2.0)도 옆으로(×1.0)도 100점 천장에서 잘려 **같은 점수**였다.
     */
    it('🔴 같은 콜이 방향만 다르면 점수가 갈린다', () => {
        const 곧장 = 본다(첫짐(1, 30_000)), 옆으로 = 본다(첫짐(0, 30_000));
        expect(곧장.score).toBeGreaterThan(옆으로.score!);
    });

    /**
     * 🔴 **실제 콜처럼 축이 섞이면 색까지 갈린다.**
     *    돈만 있는 콜은 돈이 100점 천장이라 색이 안 갈린다 — 그건 「돈」 눈금의 몫이고
     *    이 기준이 할 일이 아니다. 운전·콜 대기가 함께 오는 실제 첫짐으로 잰다.
     */
    it('🔴 실제 첫짐(운전·콜 대기 포함)은 방향만 달라도 색이 갈린다', () => {
        const 실제 = (p: number): JudgeFacts => ({
            ...첫짐(p, 30_000),
            drive: { extraKm: 100, driveMinutes: 120 },
            wait: { toPickupMinutes: 10, deliveryMinutes: 120 },
        });
        const c: JudgmentConfig = { ...DEFAULT_JUDGMENT,
            weights: { ...DEFAULT_JUDGMENT.weights, slots: 0, promiseGuard: 0, cargoCompat: 0 } };
        expect(본다(실제(1), c).color).toBe('꿀');
        expect(본다(실제(0), c).color).toBe('보통');
    });

    it('🔴 100점을 넘지 않는다 — 배수를 걸어도', () => {
        expect(본다(첫짐(1, 30_000)).score!).toBeLessThanOrEqual(100);
        expect(본다(첫짐(1, 300_000)).score!).toBeLessThanOrEqual(100);
    });
});

describe('🧭 못 쟀으면 배수 1.0 이다 — 불리하게 밀지 않는다 (규칙 ⑤-2)', () => {

    it('🔴 목적지를 안 정하셨으면 배수 1.0 이고 색이 🔴 가 되지 않는다', () => {
        const f = 첫짐(null, 12_000, '목적지 미설정');
        const v = 본다(f);
        expect(v.score).toBe(돈점(f));
        expect(v.color).toBe('보통');
    });

    it('🔴 못 쟀다는 까닭이 화면에 그대로 뜬다', () => {
        const 줄 = 지리줄(첫짐(null, 12_000, '목적지 미설정'));
        expect(줄.outcome.why).toContain('목적지 미설정');
        expect(toSnapshot(본다(첫짐(null, 12_000, '목적지 미설정'))).axes.find(a => a.key === 'geography')!.raw)
            .toContain('목적지 미설정');
    });

    it('🔴 «잴 수 없음»으로 색을 덮지 않는다 — 첫짐이 목적지 없이도 판정된다', () => {
        expect(지리줄(첫짐(null)).outcome.kind).toBe('scored');
    });
});

describe('🧭 합짐에는 배수를 붙이지 않는다 — 우회 시급이 이미 센다', () => {

    it('🔴 합짐의 지리는 «잴 게 없다»다 (전진율을 실어 줘도)', () => {
        expect(지리줄(합짐(0.95)).outcome.kind).toBe('nothing');
    });

    /**
     * 🔴 **까닭이 화면에 거짓말을 하면 안 된다** — 합짐인데 «전진율을 안 받았습니다» 라고 적히면
     *    기사님이 «재료가 빠졌나»로 읽는다. 합짐은 원래 안 재는 것이다 — 우회 시급이 이미 센다.
     */
    it('🔴 합짐이면 «합짐이라 안 잰다»고 적는다 — 사실을 채우는 쪽이 국면을 실어 준다', () => {
        const f = mergeFacts({
            fare: 30_000, extraMinutes: 60, bufferAfterMin: 60, freePct: 100,
            conflicts: [], excludedHits: [], lateStops: [], phase: 'merge' as const, tags: [],
        });
        const 줄 = judge(CRITERIA, f, cfg()).criteria.find(c => c.key === 'geography')!;
        expect(줄.outcome.why).toContain('합짐');
        expect(줄.outcome.why).not.toContain('안 받았');
    });

    it('🔴 그래서 합짐 점수는 돈 그대로다 — 3만/h → 50점', () => {
        expect(본다(합짐(0.95)).score).toBe(50);
    });
});

describe('🧭 배수는 평균에 안 섞인다 — 총점에 곱한다', () => {

    it('🔴 지리를 끄면(가중치 0) 배수가 안 붙는다', () => {
        const c: JudgmentConfig = { ...cfg(), weights: { ...cfg().weights, geography: 0 } };
        expect(본다(첫짐(0.95), c).score).toBe(돈점(첫짐(0.95), c));
    });

    it('🔴 지리가 평균의 한 항이 되면 안 된다 — 되면 요금 0원이 절반 점수를 받는다', () => {
        // 평균이었다면 (0 + 98) / 2 = 49점(보통)이 된다. 곱셈이라 0점이다
        expect(본다(첫짐(0.95, 0)).score).toBe(0);
    });
});

describe('🧭 배수의 두 끝은 판정 기준 탭에 있다 (규칙 ⑤-4 ①)', () => {

    it('🔴 표에 두 칸이 있고 DB 칸과 1:1 이다', () => {
        for (const c of ['dest_bonus_max', 'dest_bonus_min']) {
            expect(JUDGMENT_FIELDS.map(f => f.col)).toContain(c);
            expect(judgmentDefaults()[c]).toBeGreaterThan(0);
        }
    });

    it('🔴 기본값 — 최대 1.0 · 최소 0.5', () => {
        expect(DEFAULT_JUDGMENT.destBonus).toEqual({
            max: 1.0, min: 0.5, trappedMult: 0.6, awayFreeKm: 30, awayHardKm: 150,
        });
    });

    /**
     * 🔴 **배수가 1 을 넘지 않는다** — 넘으면 100점 천장에서 뭉친다.
     *    시급 2.1만(기준 미달)과 4.0만이 둘 다 🔵 100점이던 자리다. 배수는 «깎기»만 한다.
     */
    it('🔴 기본값에서 어떤 전진율도 배수가 1 을 안 넘는다', () => {
        const { max, min } = DEFAULT_JUDGMENT.destBonus;
        expect(max).toBeLessThanOrEqual(1);
        expect(min).toBeLessThanOrEqual(max);
    });

    /**
     * 🧳 **기존 DB 행도 옮긴다** — 기본값만 바꾸면 이미 2.0 이 든 행은 그대로다.
     *    그대로 두면 새 식에서 옆으로 가는 콜이 ×1.25 가 되어 **지금보다 나빠진다**.
     *    🔴 `PRAGMA user_version` 으로 **한 번만** 돈다 (기사님 지시) — 나중에 기사님이
     *       일부러 2.0 으로 올리셔도 다시 안 내린다.
     */
    it('🔴 옛 기본값을 옮기는 마이그레이션이 user_version 으로 한 번만 돈다', () => {
        const db = readFileSync(join(__dirname, '../../src/db.ts'), 'utf8');
        expect(db).toMatch(/user_version/);
        expect(db).toMatch(/UPDATE user_judgment SET dest_bonus_max/);
    });

    it('🔴 기사님이 최대를 내리면 배수가 따라 내려간다', () => {
        const low = 본다(첫짐(0.95), cfg({ max: 0.8 })).score!;
        expect(low).toBeLessThan(본다(첫짐(0.95)).score!);
    });

    it('🔴 지리 가중치의 기본이 켜져 있다 — 전진율이 그 «잴 값»이다', () => {
        expect(DEFAULT_JUDGMENT.weights.geography).toBeGreaterThan(0);
    });
});
