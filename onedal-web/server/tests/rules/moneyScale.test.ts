import { judge, CRITERIA, DEFAULT_JUDGMENT, JUDGMENT_FIELDS, judgmentDefaults } from "@onedal/shared";
import type { JudgeFacts, JudgmentConfig } from "@onedal/shared";

/**
 * 💰 **돈 눈금 — 합짐은 두 점, 첫짐은 제 기준선** (기사님 확정)
 *
 * 무엇을 막나
 * - 합짐이 **한 점 비율**로 돌아가는 것 — 목표 시급에서 100점을 쳐 버리면 3만/h 와 5만/h 가 같은 꿀이 되고
 *   좋은 콜끼리 구분이 사라진다. 쌓인 판정 53건에서 우회 235분짜리가 보통으로 나온 까닭이다
 * - 첫짐에 **합짐 눈금**을 대는 것 — 빈 차는 안 잡으면 0원이라 같은 눈금이면 길가에 묶인다
 * - 눈금의 두 끝이 **코드에 박히는 것** — 기사님이 판정 기준 탭에서 고쳐야 한다 (규칙 ⑤-4 ①)
 */

const cfg = (over: Partial<JudgmentConfig['target']> = {}): JudgmentConfig => ({
    ...DEFAULT_JUDGMENT,
    // 돈 하나만 켠다 — 다른 기준이 평균에 섞이면 눈금을 못 본다
    weights: { ...DEFAULT_JUDGMENT.weights, slots: 0, promiseGuard: 0, cargoCompat: 0, geography: 0 },
    target: { ...DEFAULT_JUDGMENT.target, ...over },
});

/** 합짐 한 건 — 시급이 딱 나오게 60분으로 맞춘다 */
const 합짐 = (fare: number): JudgeFacts => ({
    money: { fare, extraMinutes: 60, firstLoad: false },
    promise: { hasExistingCalls: true, lateStops: [], bufferAfterMin: 60 },
    space: { freePct: 100, hasLoad: true },
    nature: { conflicts: [], excludedHits: [], hasLoad: true },
});

/** 첫짐 한 건 — 빈 차라 약속·공간·성질은 «잴 게 없다» */
const 첫짐 = (fare: number, minutes: number): JudgeFacts => ({
    money: { fare, extraMinutes: minutes, firstLoad: true },
    promise: { hasExistingCalls: false, lateStops: [], bufferAfterMin: null },
    space: { freePct: null, hasLoad: false },
    nature: { conflicts: [], excludedHits: [], hasLoad: false },
});

const 점수 = (f: JudgeFacts, c: JudgmentConfig = cfg()) => judge(CRITERIA, f, c).score;

describe('💰 합짐 — 두 점 꺾은선 (보통 시급 50점 · 꿀 시급 100점)', () => {

    it('🔴 보통 시급(3만/h)이 100점이 아니라 **50점**이다', () => {
        expect(점수(합짐(30_000))).toBe(50);
    });

    it('🔴 꿀 시급(5만/h)에서 100점을 친다 — 그 사이가 벌어져야 좋은 콜이 구분된다', () => {
        expect(점수(합짐(50_000))).toBe(100);
        expect(점수(합짐(40_000))).toBe(75);
    });

    it('🔴 보통 아래는 비례로 줄어든다 (1.5만/h → 25점)', () => {
        expect(점수(합짐(15_000))).toBe(25);
        expect(점수(합짐(24_000))).toBe(40);      // 🟢 보통의 하한
    });

    it('🔴 꿀 시급을 넘겨도 100 에서 자른다 — 점수는 0~100 이다', () => {
        expect(점수(합짐(150_000))).toBe(100);
    });

    it('설계서 §4-2 표와 한 칸씩 맞는다', () => {
        expect([15_000, 24_000, 30_000, 39_000, 40_000, 50_000].map(f => 점수(합짐(f))))
            .toEqual([25, 40, 50, 73, 75, 100]);
    });

    it('🔴 우회가 없는 길목 콜은 그대로 100점이다 (옛 규칙 유지)', () => {
        expect(점수({ ...합짐(10_000), money: { fare: 10_000, extraMinutes: 0, firstLoad: false } })).toBe(100);
    });

    it('🔴 두 끝을 기사님이 움직이면 눈금이 따라 움직인다 — 코드에 박혀 있지 않다', () => {
        // 꿀 기준을 4만으로 낮추면 4만/h 가 100점이 된다
        expect(점수(합짐(40_000), cfg({ honeyHourlyKrw: 40_000 }))).toBe(100);
        // 보통 기준을 2만으로 낮추면 같은 3만/h 가 50점보다 높아진다
        expect(점수(합짐(30_000), cfg({ hourlyKrw: 20_000 }))).toBeGreaterThan(50);
    });
});

describe('💰 첫짐 — 제 기준선으로 잰다 (빈 차의 기회비용)', () => {

    it('🔴 04:54 복정동 → 대치4동 (1.2만 ÷ 65분 = 1.1만/h) 이 44점이다', () => {
        expect(점수(첫짐(12_000, 65))).toBe(44);
    });

    it('🔴 첫짐 기준 시급(2.5만/h)에서 100점 — 합짐 눈금(5만)을 대지 않는다', () => {
        expect(점수(첫짐(25_000, 60))).toBe(100);
        expect(점수(첫짐(12_500, 60))).toBe(50);
    });

    it('🔴 같은 시급이라도 첫짐이 합짐보다 후하다 — 안 잡으면 0원이라서', () => {
        const h = 20_000;   // 2만/h
        expect(점수(첫짐(h, 60))!).toBeGreaterThan(점수(합짐(h))!);
    });

    it('🔴 첫짐 기준선도 기사님이 고친다', () => {
        expect(점수(첫짐(25_000, 60), cfg({ soloHourlyKrw: 50_000 }))).toBe(50);
    });
});

describe('💰 눈금의 두 끝은 판정 기준 탭에 있다 (규칙 ⑤-4 ①)', () => {

    it('🔴 표에 세 칸이 다 있고 DB 칸과 1:1 이다', () => {
        const cols = JUDGMENT_FIELDS.map(f => f.col);
        for (const c of ['target_hourly_krw', 'honey_hourly_krw', 'solo_hourly_krw']) {
            expect(cols).toContain(c);
            expect(judgmentDefaults()[c]).toBeGreaterThan(0);
        }
    });

    it('🔴 기본값은 설계서 §6 그대로다 — 보통 3만 · 꿀 5만 · 첫짐 2.5만', () => {
        expect(DEFAULT_JUDGMENT.target).toEqual({ hourlyKrw: 30_000, honeyHourlyKrw: 50_000, soloHourlyKrw: 25_000 });
    });

    it('🔴 꿀 기준선은 보통보다 커야 한다 — 같거나 작으면 꺾은선이 뒤집힌다', () => {
        const d = DEFAULT_JUDGMENT.target;
        expect(d.honeyHourlyKrw).toBeGreaterThan(d.hourlyKrw);
    });

    it('🔴 «목표 시급» 이름과 설명이 «보통 50점»을 말한다 — 뜻이 바뀐 칸이라 화면이 거짓말하면 안 된다', () => {
        const f = JUDGMENT_FIELDS.find(x => x.col === 'target_hourly_krw')!;
        expect(`${f.label} ${f.why}`).toMatch(/50점|보통/);
    });
});

/**
 * ⛽🛣️ **시급의 분자는 «순이익»이다** (기사님 확정)
 *
 * 무엇을 막나
 * - 나가는 돈을 **안 보는 것** — 요금만 보면 90km 를 더 달려 톨비까지 내는 콜이 가까운 콜과 같은 점수를 받는다
 * - 못 잰 비용을 **0 으로 치는 것** — «기름이 안 든다»가 되어 먼 콜이 공짜로 보인다 (규칙 ④)
 * - 비용을 **안 넘겼는데 점수가 달라지는 것** — 서버가 값을 못 실어도 지금까지와 같이 돌아야 한다
 */
describe('⛽🛣️ 순이익 — 기름값·톨비를 요금에서 뺀다', () => {

    /** 🔴 이 검사가 있어야 «서버가 아직 안 잇는 동안» 점수가 안 바뀐 것을 안다 */
    it('🔴 비용을 안 넘기면 점수가 지금과 똑같다', () => {
        const 요금만 = 합짐(30_000);
        const 칸은있고값은없음: JudgeFacts = {
            ...요금만,
            money: { ...요금만.money!, extraKm: null, fuelCostPerKm: null, tollKrw: null },
        };
        expect(점수(칸은있고값은없음)).toBe(점수(요금만));
    });

    it('기름값을 빼면 점수가 내려간다 — 3만원 60분에 74km × 160원', () => {
        const 요금만 = 합짐(30_000);
        const 기름뺌: JudgeFacts = {
            ...요금만,
            money: { ...요금만.money!, extraKm: 74, fuelCostPerKm: 160 },
        };
        expect(점수(기름뺌)!).toBeLessThan(점수(요금만)!);
    });

    it('톨비를 빼면 점수가 내려간다', () => {
        const 요금만 = 합짐(30_000);
        const 톨비뺌: JudgeFacts = { ...요금만, money: { ...요금만.money!, tollKrw: 7_000 } };
        expect(점수(톨비뺌)!).toBeLessThan(점수(요금만)!);
    });

    /** 🔴 «거리를 모른다»와 «0km»는 다르다 — 앞의 것은 안 빼고, 뒤의 것은 0원을 뺀다 */
    it('🔴 거리를 모르면 기름값을 안 뺀다 — km당 값만 있어도 그대로', () => {
        const 요금만 = 합짐(30_000);
        const 거리모름: JudgeFacts = {
            ...요금만,
            money: { ...요금만.money!, extraKm: null, fuelCostPerKm: 160 },
        };
        expect(점수(거리모름)).toBe(점수(요금만));
    });

    it('🔴 km당 기름값을 모르면 안 뺀다 — 거리만 있어도 그대로', () => {
        const 요금만 = 합짐(30_000);
        const 단가모름: JudgeFacts = {
            ...요금만,
            money: { ...요금만.money!, extraKm: 74, fuelCostPerKm: null },
        };
        expect(점수(단가모름)).toBe(점수(요금만));
    });

    /** 🔴 합짐은 경로가 짧아질 수도 있다 — 그때는 기름을 덜 쓴 것이 사실이다 */
    it('거리가 음수면 기름값이 되레 더해진다', () => {
        const 요금만 = 합짐(30_000);
        const 짧아짐: JudgeFacts = {
            ...요금만,
            money: { ...요금만.money!, extraKm: -10, fuelCostPerKm: 160 },
        };
        expect(점수(짧아짐)!).toBeGreaterThanOrEqual(점수(요금만)!);
    });

    it('🧾 무엇을 뺐는지 화면 문장에 적힌다 — 숫자만 내려가면 까닭을 모른다', () => {
        const 요금만 = 합짐(50_000);
        const 뺌: JudgeFacts = {
            ...요금만,
            money: { ...요금만.money!, extraKm: 74, fuelCostPerKm: 160, tollKrw: 7_000 },
        };
        const why = judge(CRITERIA, 뺌, cfg()).criteria.find(c => c.key === 'money')!.outcome as { why: string };
        expect(why.why).toContain('기름');
        expect(why.why).toContain('톨비');
    });

    it('🧾 안 뺐으면 그 말이 안 적힌다 — 없는 비용을 화면이 말하지 않는다', () => {
        const why = judge(CRITERIA, 합짐(50_000), cfg()).criteria.find(c => c.key === 'money')!.outcome as { why: string };
        expect(why.why).not.toContain('기름');
        expect(why.why).not.toContain('톨비');
    });
});
