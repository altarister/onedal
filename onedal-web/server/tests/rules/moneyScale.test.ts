import { readFileSync } from "fs";
import { join } from "path";
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

    /**
     * 🔴 **기준선 아래는 «보통»에 남긴다** (기사님 확정).
     *    첫짐은 안 잡으면 그 시간이 **0원**이라, 기준선의 절반이라도 길가에 서 있는 것보다 낫다.
     *    이 콜(1.2만 ÷ 65분 = 1.1만/h)이 똥으로 떨어지면 빈 차가 콜을 안 잡고 서 있게 된다.
     */
    it('🔴 04:54 복정동 → 대치4동 (1.1만/h) 은 보통에 남는다', () => {
        const s = 점수(첫짐(12_000, 65))!;
        expect(s).toBeGreaterThan(DEFAULT_JUDGMENT.color.normalMin);
        expect(s).toBeLessThan(DEFAULT_JUDGMENT.color.honeyMin);
    });

    /**
     * 🔴 **기준 시급이 꿀 경계다** — 그 위는 꿀 시급(5만)까지 편다.
     *    기준선에서 바로 100점을 주면 **그 위가 전부 뭉친다** — 2.5만과 4.0만과 10만이
     *    같은 🔵 100점이라 기사님이 고르실 수가 없다.
     */
    it('🔴 첫짐 기준 시급(2.5만/h)이 꿀 경계다 — 100점이 아니다', () => {
        expect(점수(첫짐(25_000, 60))).toBe(DEFAULT_JUDGMENT.color.honeyMin);
    });

    it('🔴 기준선 위가 갈린다 — 꿀 시급(5만)에서 100점', () => {
        const 기준 = 점수(첫짐(25_000, 60))!, 중간 = 점수(첫짐(40_000, 60))!, 꿀 = 점수(첫짐(50_000, 60))!;
        expect(중간).toBeGreaterThan(기준);
        expect(꿀).toBeGreaterThan(중간);
        expect(꿀).toBe(100);
    });

    it('🔴 같은 시급이라도 첫짐이 합짐보다 후하다 — 안 잡으면 0원이라서', () => {
        const h = 20_000;   // 2만/h
        expect(점수(첫짐(h, 60))!).toBeGreaterThan(점수(합짐(h))!);
    });

    it('🔴 첫짐 기준선도 기사님이 고친다 — 올리면 같은 콜이 내려간다', () => {
        expect(점수(첫짐(25_000, 60), cfg({ soloHourlyKrw: 50_000 }))!)
            .toBeLessThan(점수(첫짐(25_000, 60))!);
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

/**
 * 🔗 **이음새 — 서버가 나가는 돈을 실제로 넘기는가**
 *
 * 위 검사들은 「돈」 기준이 **받으면** 어떻게 재는지만 본다. 서버가 안 넘기면 그 검사는
 * 전부 초록인데 화면은 그대로다 — 기름값 설정이 DB 에 있으면서 아무도 안 읽던 자리가 그랬다.
 */
describe('🔗 연결 — 서버가 기름값·통행료를 판정에 넘긴다', () => {
    const src = (rel: string) => readFileSync(join(__dirname, '../../src', rel), 'utf8');

    it('🔴 설정에서 km당 기름값을 읽는 길이 있다', () => {
        expect(src('repositories/SettingsRepository.ts')).toContain('getFuelCostPerKm');
    });

    it('🔴 나눗셈은 shared 한 곳이다 — 저장소가 제 손으로 나누지 않는다 (규칙 ③)', () => {
        const repo = src('repositories/SettingsRepository.ts');
        expect(repo).toContain('fuelCostPerKm(');
        expect(repo).not.toMatch(/fuel_price\s*\/\s*/);
    });

    it('🔴 카카오에서 통행료를 꺼내 두 경로의 차이를 낸다', () => {
        const kakao = src('services/kakaoService.ts');
        expect(kakao).toContain('fare?.toll');
        expect(kakao).toContain('tollDiffKrw');
    });

    it('🔴 심사가 세 값을 판정에 넘긴다 — 첫짐도 합짐도', () => {
        const ev = src('core/engine/OrderEvaluator.ts');
        expect(ev).toContain('getFuelCostPerKm');
        expect(ev).toContain('tollDiffKrw');       // 합짐 — 늘어나는 통행료
        expect(ev).toMatch(/extraKm:/);
    });
});

/**
 * 🛣️⏳ **편함과 콜 대기 — «뒤에 더 할 수 있나»를 두 질문으로 나눠 잰다** (기사님 확정)
 *
 * 무엇을 막나
 * - 두 축을 **한 칸에 담는 것** — 「약속」의 여유 눈금은 30분에서 천장을 친다. «늦나»와 «얼마나 남나»는 다른 질문이라
 *   한 칸에 담으면 뒤의 것이 죽는다 (규칙 ⑤-4 ⑤)
 * - 가중치가 없어 **기사님이 못 끄는 것** — 0 으로 두면 아예 안 본다
 * - 새 문턱을 **또 만드는 것** — 편함은 배송 속도 셋, 콜 대기는 상차 약속 분을 그대로 눈금으로 쓴다
 */
describe('💪 노동강도 — 팔다리를 얼마나 쓰나', () => {
    /* 🔴 「돈」은 켜 둔다 — 전부 끄면 점수를 낼 기준이 없어 «잴 수 없음»(🔴)이 된다 */
    const 켬 = (): JudgmentConfig => ({
        ...DEFAULT_JUDGMENT,
        weights: { ...DEFAULT_JUDGMENT.weights, slots: 0, promiseGuard: 0, cargoCompat: 0, geography: 0, drive: 0, wait: 0, calls: 0 },
    });
    const 노동 = (hand: number | null, guard: number | null = null) => judge(CRITERIA, {
        ...합짐(30_000),
        labor: { handMinutes: hand, protectionMinutes: guard },
    }, 켬()).criteria.find(c => c.key === 'labor')!.outcome;

    /** 🔴 이 검사가 생긴 까닭 — 기사님: *"까대기, 파레트, 짐의 상하차 방법과 량, 결박도 표현되어 들어가야"* */
    it('🔴 까대기가 파레트보다 낮다 — 같은 80박스라도 손으로 들면 27분, 지게차면 4분', () => {
        const 까대기 = 노동(27 * 2) as { score: number };   // 상·하차 두 번
        const 파레트 = 노동(4 * 2) as { score: number };
        expect(파레트.score).toBeGreaterThan(까대기.score);
    });

    it('🔴 결박이 붙으면 낮아진다', () => {
        expect((노동(10, 4) as { score: number }).score).toBeLessThan((노동(10, 0) as { score: number }).score);
    });

    it('🔴 짐을 모르면 잴 게 없다 — 통화 전에는 안 깎는다 (규칙 ⑤-2)', () => {
        expect(노동(null, null).kind).toBe('nothing');
    });

    it('🔴 운전은 안 본다 — 그건 「운전」이 따로 묻는다', () => {
        const 느린길 = judge(CRITERIA, { ...합짐(30_000), labor: { handMinutes: 10, protectionMinutes: 4 }, drive: { extraKm: 10, driveMinutes: 60 } }, 켬());
        const 빠른길 = judge(CRITERIA, { ...합짐(30_000), labor: { handMinutes: 10, protectionMinutes: 4 }, drive: { extraKm: 70, driveMinutes: 60 } }, 켬());
        const 점수 = (v: typeof 느린길) => (v.criteria.find(c => c.key === 'labor')!.outcome as { score: number }).score;
        expect(점수(느린길)).toBe(점수(빠른길));
    });

    it('🔴 눈금이 상차 미확인 일반값을 따라 움직인다 — 새 문턱을 안 만들었다', () => {
        const 길게: JudgmentConfig = { ...켬(), unknown: { ...켬().unknown, pickupDwellMin: 60 } };
        const a = judge(CRITERIA, { ...합짐(30_000), labor: { handMinutes: 30, protectionMinutes: null } }, 켬());
        const b = judge(CRITERIA, { ...합짐(30_000), labor: { handMinutes: 30, protectionMinutes: null } }, 길게);
        const 점수 = (v: typeof a) => (v.criteria.find(c => c.key === 'labor')!.outcome as { score: number }).score;
        expect(점수(b)).toBeGreaterThan(점수(a));
    });
});

describe('🚚 운전 — 평균 속도가 말한다', () => {
    const 켬 = (): JudgmentConfig => ({
        ...DEFAULT_JUDGMENT,
        weights: { ...DEFAULT_JUDGMENT.weights, slots: 0, promiseGuard: 0, cargoCompat: 0, geography: 0, labor: 0, wait: 0, calls: 0 },
    });
    const 운전 = (km: number | null, min: number | null) => judge(CRITERIA, {
        ...합짐(30_000),
        drive: { extraKm: km, driveMinutes: min },
    }, 켬()).criteria.find(c => c.key === 'drive')!.outcome;

    it('🔴 고속으로 달리면 시내보다 높다', () => {
        expect((운전(70, 60) as { score: number }).score).toBeGreaterThan((운전(20, 60) as { score: number }).score);
    });

    /**
     * 🔴 **이 검사가 생긴 까닭 — 실제 주행에서 잡혔다** (로컬 한 바퀴).
     *    「돈」이 받는 «더 쓰는 분»에는 상·하차 정차가 들어 있다. 그 값을 그대로 쓰니
     *    «+2.6km · 30분(정차 25분 포함)» 이 **5km/h** 로 읽혀 멀쩡한 콜이 전부 0 점이 됐다.
     *    분모는 **주행 분**이어야 한다.
     */
    it('🔴 정차가 길어져도 속도가 안 변한다 — 분모는 주행 분이다', () => {
        const 주행5분 = 운전(2.6, 5) as { score: number; why: string };
        expect(주행5분.why).toContain('31km/h');     // 2.6km ÷ 5분 = 31km/h · 30분으로 나누면 5km/h 였다
        expect(주행5분.score).toBeGreaterThan(0);
    });

    it('🔴 거리를 모르면 잴 게 없다 — 색을 🔴 로 만들지 않는다', () => {
        expect(운전(null, 60).kind).toBe('nothing');
        expect(judge(CRITERIA, { ...합짐(30_000), drive: { extraKm: null, driveMinutes: 60 } }, 켬()).color).not.toBe('사고');
    });

    it('🔴 상하차는 안 본다 — 그건 「노동강도」가 따로 묻는다', () => {
        const 가벼움 = judge(CRITERIA, { ...합짐(30_000), drive: { extraKm: 70, driveMinutes: 60 }, labor: { handMinutes: 2, protectionMinutes: 0 } }, 켬());
        const 무거움 = judge(CRITERIA, { ...합짐(30_000), drive: { extraKm: 70, driveMinutes: 60 }, labor: { handMinutes: 60, protectionMinutes: 4 } }, 켬());
        const 점수 = (v: typeof 가벼움) => (v.criteria.find(c => c.key === 'drive')!.outcome as { score: number }).score;
        expect(점수(가벼움)).toBe(점수(무거움));
    });

    it('🔴 가중치 0 이면 안 본다', () => {
        const cfg0: JudgmentConfig = { ...DEFAULT_JUDGMENT, weights: { ...DEFAULT_JUDGMENT.weights, drive: 0 } };
        const 있음 = judge(CRITERIA, { ...합짐(30_000), drive: { extraKm: 70, driveMinutes: 60 } }, cfg0);
        const 없음 = judge(CRITERIA, 합짐(30_000), cfg0);
        expect(있음.score).toBe(없음.score);
    });

    it('🔴 서버가 「돈」과 다른 값을 넘긴다 — 정차를 더한 분을 여기 쓰지 않는다', () => {
        const ev = readFileSync(join(__dirname, '../../src/core/engine/OrderEvaluator.ts'), 'utf8');
        expect(ev).toMatch(/driveMinutes: marginal,/);              // 합짐 — 카카오 주행 delta 그대로
        expect(ev).not.toMatch(/driveMinutes: marginal \+ cost\.dwell/);
    });
});

describe('⏳ 콜 대기 — 이 콜이 시간을 얼마나 남겨 주나', () => {
    /* ⏳ 여기는 콜 대기 눈금만 본다 — 돈까지 켜면 평균에 섞여 «몇 콜치»를 못 본다 */
    const 켬 = (): JudgmentConfig => ({
        ...DEFAULT_JUDGMENT,
        weights: { ...DEFAULT_JUDGMENT.weights, revenueDetour: 0, slots: 0, promiseGuard: 0, cargoCompat: 0, geography: 0, labor: 0, drive: 0 },
    });
    const 대기 = (toPickup: number | null, delivery: number | null) => judge(CRITERIA, {
        ...합짐(30_000),
        wait: { toPickupMinutes: toPickup, deliveryMinutes: delivery },
    }, 켬()).score;

    /** 🔴 이 검사가 생긴 까닭 — 기사님: *"5분 걸리는 상차지와 20분 걸리는 상차지는 엄연히 달리 점수를 줘야"* */
    it('🔴 가까운 상차지가 먼 상차지보다 높다 — 같은 20분 약속이라도 다르다', () => {
        expect(대기(5, 0)!).toBeGreaterThan(대기(20, 0)!);
    });

    /** 🔴 기사님: *"배달거리는 길면 길수록 여유시간이 150%이니 많아져"* */
    it('🔴 배송이 길수록 높다 — 마감 150% 의 여분이 쌓인다', () => {
        expect(대기(10, 120)!).toBeGreaterThan(대기(10, 40)!);
    });

    it('상차 약속(20분)에 딱 맞춰 도착하고 배송이 없으면 0점 — 남는 것이 없다', () => {
        expect(대기(20, 0)).toBe(0);
    });

    /**
     * 🔴 **한 콜치가 절반이고, 그 위는 100 에 닿지 않는다** (기사님 확정 · 판정 균형 3단계).
     *    두 콜치에서 천장을 치던 때는 배송 40분만 넘으면 거의 모든 콜이 100점이라
     *    콜을 갈라 주지 못하고 평균만 끌어올렸다.
     */
    it('상차 여유 20분이면 한 콜치 50점 · 두 콜치는 그보다 높되 100 이 아니다', () => {
        expect(대기(0, 0)).toBe(50);            // 상차 여유 20분 = 한 콜치
        const 두콜치 = 대기(0, 40)!;            // 상차 20 + 배송 40×50% = 20 → 40분
        expect(두콜치).toBeGreaterThan(50);
        expect(두콜치).toBeLessThan(100);
    });

    it('🔴 상차에 늦어도 배송 여유를 지우지 않는다 — 늦는 것은 「약속」의 몫이다', () => {
        expect(대기(50, 200)!).toBeGreaterThan(0);
    });

    it('🔴 둘 다 모르면 잴 게 없다 — 색을 🔴 로 만들지 않는다', () => {
        const v = judge(CRITERIA, { ...합짐(30_000), wait: { toPickupMinutes: null, deliveryMinutes: null } },
            { ...DEFAULT_JUDGMENT });
        expect(v.criteria.find(c => c.key === 'wait')!.outcome.kind).toBe('nothing');
        expect(v.color).not.toBe('사고');
    });

    it('🔴 한쪽만 알아도 잰다 — 모르는 쪽을 0 으로 치지 않는다', () => {
        expect(대기(5, null)).not.toBeNull();
        expect(대기(null, 120)).not.toBeNull();
    });

    it('🔴 눈금이 상차 약속을 따라 움직인다 — 새 문턱을 안 만들었다', () => {
        const 짧게: JudgmentConfig = { ...켬(), unknown: { ...켬().unknown, pickupPromiseMin: 10 } };
        const v = judge(CRITERIA, { ...합짐(30_000), wait: { toPickupMinutes: 0, deliveryMinutes: 0 } }, 짧게);
        expect(v.score).toBe(50);   // 10분 단위면 상차 여유 10분은 한 콜치
    });

    it('🔴 마감 비율을 따라 움직인다 — 150% 를 내리면 배송 여유가 준다', () => {
        const 낮게: JudgmentConfig = { ...켬(), deadline: { ratioPct: 110 } };
        const 높게 = judge(CRITERIA, { ...합짐(30_000), wait: { toPickupMinutes: 20, deliveryMinutes: 100 } }, 켬()).score;
        const 낮은 = judge(CRITERIA, { ...합짐(30_000), wait: { toPickupMinutes: 20, deliveryMinutes: 100 } }, 낮게).score;
        expect(높게!).toBeGreaterThan(낮은!);
    });
});

describe('🔗 연결 — 서버가 두 축의 사실을 채운다', () => {
    it('🔴 첫짐도 합짐도 노동강도·운전·콜 대기를 넘긴다', () => {
        const jf = readFileSync(join(__dirname, '../../src/core/engine/judgeFacts.ts'), 'utf8');
        expect(jf).toContain('labor:');
        expect(jf).toContain('drive:');
        expect(jf).toContain('wait:');
    });

    it('🔴 손으로 드는 분의 셈이 한 곳이다 — 심사가 박스를 다시 세지 않는다 (규칙 ③)', () => {
        const ev = readFileSync(join(__dirname, '../../src/core/engine/OrderEvaluator.ts'), 'utf8');
        expect(ev).toContain('handMinutes');
        expect(ev).not.toContain('DWELL_PER_POINT');
    });

    it('🔴 가중치 칸이 판정 기준 탭에 있다 — 기사님이 못 고치는 값을 만들지 않는다', () => {
        const cols = JUDGMENT_FIELDS.map(f => f.col);
        for (const c of ['weight_labor', 'weight_drive', 'weight_wait', 'weight_calls']) {
            expect(cols).toContain(c);
            expect(judgmentDefaults()[c]).toBe(1);
        }
    });
});

/**
 * ☎️ **전화할 곳 — 이 콜이 남의 약속을 몇 곳 흔드나** (기사님 확정)
 *
 * 무엇을 막나
 * - 전화를 **세 번** 걸어야 하는 콜과 **한 번도** 안 걸어도 되는 콜이 같은 색으로 뜨는 것
 * - 1분 밀림마다 세어 화면이 시끄러워지는 것 — 기사님: *"정차 중에 3~4콜을 모으려면 몇 분씩은 밀린다"*
 * - 다녀온 정거장을 세는 것 — 지나간 곳에는 전화할 일이 없다
 */
describe('☎️ 전화할 곳 — 점수가 아니라 «할 일»이다', () => {
    /**
     * ☎️ **이 축이 재는 것은 «남의 약속을 몇 곳 흔드나» — 곧 전화할 곳 수다** (기사님 배분).
     *
     * 기사님: *"노란색: 약속 · 전화할 곳"* — «얼마짜리인가»가 아니라 **할 일**이므로
     * 점수가 아니라 색으로 말한다. 흔들 곳이 있으면 🟡(전화해서 미룬다) 다.
     * 🔴 운전 중에는 전화를 못 거신다 — 그래서 **잡기 전에** 알아야 한다 (규칙 ⑤-3).
     */
    const 전화 = (n: number | null) => judge(CRITERIA, {
        ...합짐(30_000),
        calls: { count: n, hasExistingCalls: true },
    }, DEFAULT_JUDGMENT);
    const 줄 = (n: number | null) => 전화(n).criteria.find(c => c.key === 'calls')!.outcome as any;

    it('🔴 흔들 곳이 없으면 그냥 잡는다', () => {
        expect(줄(0).needsCall).toBeFalsy();
        expect(전화(0).color).not.toBe('똥');
    });

    it('🔴 흔들 곳이 있으면 🟡 — 전화해서 미룬다', () => {
        expect(줄(1).needsCall).toBe(true);
        expect(전화(1).color).toBe('똥');
    });

    /** 🔴 곳이 몇이든 «얼마짜리인가»는 같다 — 점수에 안 섞인다 */
    it('🔴 곳 수가 점수를 안 움직인다', () => {
        expect(전화(1).score).toBe(전화(0).score);
        expect(전화(9).score).toBe(전화(0).score);
    });

    /** 🔴 몇 곳인지는 화면이 말해야 한다 — 기사님이 전화기를 몇 번 드실지 아셔야 한다 */
    it('🔴 몇 곳인지 이유에 적힌다', () => {
        expect(줄(3).why).toMatch(/3곳/);
        expect(줄(3).value).toBe(3);
    });

    it('🔴 못 셌으면 잴 게 없다 — 0 곳과 다르다', () => {
        const v = judge(CRITERIA, { ...합짐(30_000), calls: { count: null, hasExistingCalls: true } }, DEFAULT_JUDGMENT);
        expect(v.criteria.find(c => c.key === 'calls')!.outcome.kind).toBe('nothing');
    });

    it('🔴 빈 차는 잴 게 없다 — 흔들 남이 없다', () => {
        const v = judge(CRITERIA, { ...첫짐(50_000, 60), calls: { count: null, hasExistingCalls: false } }, DEFAULT_JUDGMENT);
        expect(v.criteria.find(c => c.key === 'calls')!.outcome.kind).toBe('nothing');
    });

    /** 🔴 🔴 는 아니다 — 전화는 걸면 되는 일이다. 약속이 정말 깨지는 것은 「약속」이 말한다 */
    it('🔴 아무리 많아도 🔴 는 아니다', () => {
        expect(줄(9).hardFail).toBeFalsy();
    });
});

describe('🔗 연결 — 서버가 전화할 곳을 센다', () => {
    const ev = () => readFileSync(join(__dirname, '../../src/core/engine/OrderEvaluator.ts'), 'utf8');

    it('🔴 세는 규칙 셋이 서버에 있다 — 기존 콜만 · 안 다녀온 곳만 · 설정 분 이상', () => {
        const src = ev();
        expect(src).toContain('callsToMake');
        expect(src).toMatch(/existing\.filter/);
        expect(src).toContain('!e.arrived');
        expect(src).toContain('lateSoftMin');
    });

    it('🔴 가중치 칸이 판정 기준 탭에 있다', () => {
        expect(JUDGMENT_FIELDS.map(f => f.col)).toContain('weight_calls');
        expect(judgmentDefaults()['weight_calls']).toBe(1);
    });
});
