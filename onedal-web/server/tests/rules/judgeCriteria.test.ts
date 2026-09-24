import { judge, describe as 설명, defineCriterion, scored, nothing, unmeasurable, DEFAULT_JUDGMENT } from '@onedal/shared';
// 🔴 본문이 기준 이름(`MONEY·PROMISE…`)을 값으로 쓰지 않으므로 목록만 들여온다.
//    들여오는 이름이 shared 와 어긋나면 이 파일은 컴파일조차 안 되는데, 실패가 아니라 «없는 것»이라
//    게이트는 초록불이다 — 그래서 쓰는 것만 들여온다.
import { CRITERIA } from '@onedal/shared';
import type { JudgeFacts, JudgmentConfig, Criterion } from '@onedal/shared';

/**
 * ⚖️ **판정 기준은 서로 섞이지 않고, 더하거나 뺄 수 있다** (기사님 확정)
 *
 * 기사님: *"각각의 기준이 서로 섞이지 않도록 스마트하게 만들어줘.
 * 기준이 추가될 수도 삭제될 수도 있어."*
 *
 * 이 검사가 지키는 것 넷:
 *   ① **자기 몫의 사실만 본다** — 남의 사실을 넣어도 안 읽는다
 *   ② **기준을 빼도 나머지가 그대로 돈다** — 엔진을 안 고친다
 *   ③ **기준을 더해도 엔진을 안 고친다**
 *   ④ **세 대답이 갈린다** — 점수 / 잴 게 없음 / 잴 수 없음
 */

const cfg = (over: Partial<JudgmentConfig['weights']> = {}): JudgmentConfig => ({
    ...DEFAULT_JUDGMENT,
    weights: { ...DEFAULT_JUDGMENT.weights, ...over },
});

/** 다 좋은 합짐 하나 — 기준마다 재료가 다 있다 */
const 좋은합짐 = (): JudgeFacts => ({
    money: { fare: 50_000, extraMinutes: 30 , firstLoad: false },                    // 10만/h → 만점권
    /* 🔴 점수를 만드는 축을 다 싣는다 — 돈 하나만 실으면 «돈을 뺐을 때» 점수가 통째로 사라진다 */
    labor: { handMinutes: 1, protectionMinutes: 0 },
    drive: { driveKm: 30, driveMinutes: 30 },
    wait: { toPickupMinutes: 10, deliveryMinutes: 30 },
    promise: { hasExistingCalls: true, lateStops: [], bufferAfterMin: 30 },
    space: { freePct: 70, hasLoad: true },
    nature: { conflicts: [], excludedHits: [], hasLoad: true },
    geography: { firstLoad: false, progressRatio: null },
});

describe('① 기준은 자기 몫의 사실만 본다', () => {
    it('🔴 남의 칸에 값을 넣어도 안 읽는다 — 섞이지 않는다', () => {
        const f = 좋은합짐();
        // 「돈」 칸에 약속의 재료를 밀어 넣어 본다
        (f.money as any).lateStops = [{ label: '첫짐 하차', lateMinutes: 99 }];
        (f.money as any).conflicts = [['위험물', '식료품']];
        const v = judge(CRITERIA, f, cfg());
        expect(v.color).not.toBe('사고');                        // 돈은 그걸 못 본다
        expect(v.criteria.find(c => c.key === 'money')!.outcome.kind).toBe('scored');
    });

    it('🔴 한 기준의 재료가 없어도 다른 기준은 멀쩡히 잰다', () => {
        const f = 좋은합짐();
        delete f.space;                                          // 적재만 못 받았다
        const v = judge(CRITERIA, f, cfg());
        expect(v.criteria.find(c => c.key === 'space')!.outcome.kind).toBe('unmeasurable');
        expect(v.criteria.find(c => c.key === 'money')!.outcome.kind).toBe('scored');
    });

    /**
     * 🔴 **엔진이 넘기는 것을 직접 본다.** 각 기준이 «자기 칸만» 받는지를
     *    말이 아니라 **실제로 받은 값**으로 증명한다.
     */
    it('🔴 엔진은 기준마다 자기 칸만 넘긴다', () => {
        const 받은것: Record<string, unknown> = {};
        const 엿보기 = CRITERIA.map(c => defineCriterion<any>({
            ...c, measure: (f, k) => { 받은것[c.key] = f; return c.measure(f, k); },
        }));
        const f = 좋은합짐();
        judge(엿보기, f, cfg({ geography: 1 }));
        expect(받은것.money).toBe(f.money);
        expect(받은것.promise).toBe(f.promise);
        expect(받은것.space).toBe(f.space);
        expect(받은것.nature).toBe(f.nature);
        expect(받은것.geography).toBe(f.geography);
    });

    it('기준 이름(key)이 겹치지 않는다 — 겹치면 같은 칸을 두 기준이 먹는다', () => {
        const keys = CRITERIA.map(c => c.key);
        expect(new Set(keys).size).toBe(keys.length);
    });
});

describe('② 기준을 빼도 나머지가 그대로 돈다', () => {
    it('🔴 「돈」을 목록에서 빼도 엔진은 그대로다', () => {
        /* 🔴 목록을 손으로 적지 않는다 — 기준이 늘 때마다 깨지면 이 검사가 잡으려던 것과 다른 일을 한다 */
        const 나머지 = CRITERIA.filter(c => c.key !== 'money');
        const v = judge(나머지, 좋은합짐(), cfg());
        expect(v.criteria.map(c => c.key)).toEqual(나머지.map(c => c.key));
        expect(v.criteria.map(c => c.key)).not.toContain('money');
        expect(v.score).not.toBeNull();
    });

    it('가중치 0 으로도 끌 수 있다 — 목록에는 남고 색에만 안 든다', () => {
        const v = judge(CRITERIA, 좋은합짐(), cfg({ revenueDetour: 0 }));
        const 돈줄 = v.criteria.find(c => c.key === 'money')!;
        expect(돈줄.weight).toBe(0);
        expect(돈줄.outcome).toEqual({ kind: 'nothing', why: '안 봄 (가중치 0)' });
    });

    it('전부 끄면 색을 지어내지 않는다', () => {
        /* 🔴 손으로 나열하지 않는다 — 기준이 늘면 이 검사가 잡으려던 것과 다른 일을 한다 */
        const v = judge(CRITERIA, 좋은합짐(), cfg(
            Object.fromEntries(Object.keys(DEFAULT_JUDGMENT.weights).map(k => [k, 0])) as any,
        ));
        expect(v.score).toBeNull();
        expect(v.color).toBe('사고');
        expect(v.notes.join(' ')).toContain('잴 수 없음');
    });
});

describe('③ 기준을 더해도 엔진을 안 고친다', () => {
    /** 있지도 않은 새 기준을 즉석에서 만들어 붙인다 */
    const 새기준 = defineCriterion<{ good: boolean }>({
        key: 'brandNew', name: '새 기준', asks: '시험용',
        weightKey: 'slots',                                      // 가중치 칸은 빌려 쓴다
        measure: f => (f ? scored(f.good ? 100 : 0, f.good ? '좋음' : '나쁨') : nothing('없음')),
    });

    it('🔴 목록에 한 줄 넣으면 그대로 채점된다', () => {
        const f = { ...좋은합짐(), brandNew: { good: false } } as JudgeFacts;
        const v = judge([...CRITERIA, 새기준], f, cfg());
        const 줄 = v.criteria.find(c => c.key === 'brandNew')!;
        expect(줄.outcome).toMatchObject({ kind: 'scored', score: 0 });
        expect(v.criteria).toHaveLength(CRITERIA.length + 1);   // 목록 + 새 기준 하나
    });

    it('새 기준이 평균을 실제로 움직인다', () => {
        const f = { ...좋은합짐(), brandNew: { good: false } } as JudgeFacts;
        const 없이 = judge(CRITERIA, f, cfg()).score!;
        const 함께 = judge([...CRITERIA, 새기준], f, cfg()).score!;
        expect(함께).toBeLessThan(없이);
    });
});

describe('④ 세 대답이 갈린다', () => {
    it('첫짐은 「약속」이 **잴 게 없음** 이다 — 못 쟀다가 아니다', () => {
        const f: JudgeFacts = {
            money: { fare: 60_000, extraMinutes: 40 , firstLoad: false },
            promise: { hasExistingCalls: false, lateStops: [], bufferAfterMin: null },
            space: { freePct: null, hasLoad: false },
            nature: { conflicts: [], excludedHits: [], hasLoad: false },
        };
        const v = judge(CRITERIA.filter(c => c.key !== 'geography'), f, cfg());
        expect(v.criteria.find(c => c.key === 'promise')!.outcome.kind).toBe('nothing');
        expect(v.criteria.find(c => c.key === 'space')!.outcome.kind).toBe('nothing');
        expect(v.color).not.toBe('사고');                        // 첫짐이라고 빨간불이 되면 안 된다
    });

    it('🔴 재료가 없으면 **잴 수 없음** — 색은 🔴 이고 이유를 적는다', () => {
        const f: JudgeFacts = { ...좋은합짐(), money: { fare: 50_000, extraMinutes: null , firstLoad: false } };
        const v = judge(CRITERIA, f, cfg());
        expect(v.color).toBe('사고');
        expect(v.notes.join(' ')).toContain('돈');
    });

    /**
     * 🔴 **약속은 색으로 말하고 점수는 안 깎는다** (기사님 확정).
     *    전화로 굳힌 약속이 **흔들림 밖**으로 깨지면 🔴 다 — 몇 분이든 무조건은 아니다.
     */
    it('🔴 굳힌 약속이 흔들림 밖이면 «잡으면 사고» — 점수는 그대로', () => {
        const f = 좋은합짐();
        const 밖 = DEFAULT_JUDGMENT.slack.slipCalledMin + 5;
        f.promise!.lateStops = [{ label: '노선콜 하차 약속', lateMinutes: 밖, firm: true }];
        const v = judge(CRITERIA, f, cfg());
        expect(v.color).toBe('사고');
        expect(v.criteria.find(c => c.key === 'promise')!.outcome).toMatchObject({ hardFail: true });
        /* 🔴 «빨강바탕에 90점» — 점수는 «얼마짜리인가» 그대로여야 판단 재료가 된다 */
        expect(v.score!).toBeGreaterThan(DEFAULT_JUDGMENT.color.honeyMin);
    });

    it('그 「사고」도 가중치 0 이면 안 덮는다 (경로만 보는 시험)', () => {
        const f = 좋은합짐();
        f.promise!.lateStops = [{ label: '노선콜 하차 약속', lateMinutes: 60, firm: true }];
        expect(judge(CRITERIA, f, cfg({ promiseGuard: 0 })).color).not.toBe('사고');
    });
});

/**
 * 🧭 지리는 **첫짐의 목적지 전진 배수**다 (기사님 확정). «잴 값이 있을 때 켠다»는
 *    기준이고, 전진율이 그 잴 값이다. 눈금·경계는 `destBonus.test.ts` 가 문다 —
 *    여기서는 **다른 기준과 섞이지 않는가**만 본다.
 */
describe('🧭 지리는 첫짐의 배수다 — 평균에 섞이지 않는다', () => {
    it('가중치가 켜져 있다 — 켜는 조건(잴 값)이 생겼다', () => {
        expect(DEFAULT_JUDGMENT.weights.geography).toBeGreaterThan(0);
    });

    it('🔴 합짐에서는 «잴 게 없다» — 그쪽 지리는 「돈」(우회 시급)이 이미 센다', () => {
        const 지리줄 = judge(CRITERIA, 좋은합짐(), cfg()).criteria.find(c => c.key === 'geography')!;
        expect(지리줄.name).toBe('지리');
        expect(지리줄.outcome.kind).toBe('nothing');
    });

    it('🔴 그래서 합짐 총점에는 지리가 안 섞인다 — 켜도 꺼도 같은 점수', () => {
        expect(judge(CRITERIA, 좋은합짐(), cfg({ geography: 1 })).score)
            .toBe(judge(CRITERIA, 좋은합짐(), cfg({ geography: 0 })).score);
    });

    it('🔴 첫짐에서는 배수로 답한다 — 평균의 한 항이 아니다', () => {
        const 첫짐 = {
            money: { fare: 30_000, extraMinutes: 60, firstLoad: true },
            promise: { hasExistingCalls: false, lateStops: [], bufferAfterMin: null },
            space: { freePct: null, hasLoad: false },
            nature: { conflicts: [], excludedHits: [], hasLoad: false },
            geography: { firstLoad: true, progressRatio: 1 },
        };
        const 줄 = judge(CRITERIA, 첫짐, cfg()).criteria.find(c => c.key === 'geography')!;
        expect(줄.outcome).toMatchObject({ kind: 'scored', multiplier: DEFAULT_JUDGMENT.destBonus.max });
    });
});

describe('🧪 1층 문지기(gate) — 점수 가중평균에 섞이지 않고 사고만 차단한다', () => {
    it('🔴 성질(nature)은 정상이어도 100점을 점수 평균에 얹어주지 않는다', () => {
        const 기본합짐 = 좋은합짐();
        const v = judge(CRITERIA, 기본합짐, cfg());
        // 성질 줄은 통과(scored)이지만 role: 'gate'이므로 총점에 +25점을 거저 얹지 않는다
        const 성질줄 = v.criteria.find(c => c.key === 'nature')!;
        expect(성질줄.outcome.kind).toBe('scored');
        /**
         * 🔴 **성질을 켜도 총점이 안 움직인다** — `gate` 는 점수 평균에 안 섞인다.
         *    (기사님 배분: 성질은 🔴 만 만들고 «얼마짜리인가»에는 안 든다)
         */
        const 성질끔 = judge(CRITERIA, 기본합짐, cfg({ cargoCompat: 0 }));
        const 성질켬 = judge(CRITERIA, 기본합짐, cfg({ cargoCompat: 1 }));
        expect(성질켬.score).toBe(성질끔.score);
    });

    it('🔴 성질(nature)에 충돌이나 제외 키워드가 걸리면 즉시 🔴 사고로 차단한다', () => {
        const 상극합짐 = {
            ...좋은합짐(),
            nature: { conflicts: [['위험물', '식료품'] as [string, string]], excludedHits: [], hasLoad: true },
        };
        const v = judge(CRITERIA, 상극합짐, cfg());
        expect(v.color).toBe('사고');
        expect(v.criteria.find(c => c.key === 'nature')!.outcome).toMatchObject({ hardFail: true });
    });
});

describe('📊 실전 콜 순위 검증 — 고수익 콜이 저수익 콜을 압도한다', () => {
    it('🔴 3.9만/h 고수익 콜이 1.6만/h 저수익 콜보다 항상 높은 점수를 받는다', () => {
        // 실전에서 뒤집혔던 두 콜
        const 저수익콜: JudgeFacts = {
            money: { fare: 16_000, extraMinutes: 60, firstLoad: false }, // 1.6만/h -> 돈 27점
            promise: { hasExistingCalls: true, lateStops: [], bufferAfterMin: 3 },
            space: { freePct: 20, hasLoad: true },
            nature: { conflicts: [], excludedHits: [], hasLoad: true },
        };
        const 고수익콜: JudgeFacts = {
            money: { fare: 39_000, extraMinutes: 60, firstLoad: false }, // 3.9만/h -> 돈 73점
            promise: { hasExistingCalls: true, lateStops: [], bufferAfterMin: 15 },
            space: { freePct: 50, hasLoad: true },
            nature: { conflicts: [], excludedHits: [], hasLoad: true },
        };

        // 사용자의 원칙: "나머지가 점수에 영향을 주지 못하도록 격리 (slots: 0, promiseGuard: 0)"
        const 순수돈cfg = cfg({ slots: 0, promiseGuard: 0 });
        const v저 = judge(CRITERIA, 저수익콜, 순수돈cfg);
        const v고 = judge(CRITERIA, 고수익콜, 순수돈cfg);

        expect(v고.score!).toBe(73);
        expect(v고.color).toBe('꿀');
        expect(v저.score!).toBe(27);
        /**
         * 🔴 **27점짜리도 색은 🟢 다** — 전화할 곳도, 못 지킬 약속도 없으니 «그냥 잡으면 된다».
         *    🟡 은 «전화하면 잡을 수 있다» 하나만 뜻한다 (`colorIsAction.test.ts`).
         *    이 검사가 지키는 것은 **순위**다 — 색이 아니라 아래 줄이 그 일을 한다.
         */
        expect(v저.color).toBe('보통');
        expect(v고.score!).toBeGreaterThan(v저.score!);
    });
});

/**
 * 💰 **총점은 돈 점수를 못 넘는다** (기사님 확정 · 판정 균형 3단계)
 *
 * 축이 아홉인데 대부분이 만점이라 **돈이 낮아도 평균이 높았다** —
 * 시급 3만짜리 합짐이 🔵 85, 시급 2.1만(기준 미달) 첫짐이 🔵 78 이었다.
 * 다른 축은 **돈에서 깎기만** 한다. 돈보다 좋은 콜은 없다.
 */
describe('💰 돈이 총점의 천장이다 — 다른 축은 깎기만 한다', () => {

    const 돈점 = (v: ReturnType<typeof judge>) =>
        (v.criteria.find(c => c.key === 'money')!.outcome as { score: number }).score;

    it('🔴 다른 축이 다 만점이어도 총점이 돈을 못 넘는다 (합짐)', () => {
        const 싼합짐: JudgeFacts = {
            money: { fare: 30_000, extraMinutes: 60, firstLoad: false },   // 3만/h
            drive: { driveKm: 60, driveMinutes: 60 },
            wait: { toPickupMinutes: 10, deliveryMinutes: 60 },
            calls: { count: 0, hasExistingCalls: true },
            promise: { hasExistingCalls: true, lateStops: [], bufferAfterMin: 60 },
            space: { freePct: 60, hasLoad: true },
            nature: { conflicts: [], excludedHits: [], hasLoad: true },
            geography: { firstLoad: false, progressRatio: null },
        };
        const v = judge(CRITERIA, 싼합짐, cfg());
        expect(v.score).toBe(돈점(v));
        expect(v.color).toBe('보통');
    });

    it('🔴 첫짐도 같다 — 국면으로 가르지 않는다', () => {
        const 싼첫짐: JudgeFacts = {
            money: { fare: 21_000, extraMinutes: 60, firstLoad: true },    // 2.1만/h
            drive: { driveKm: 100, driveMinutes: 120 },
            wait: { toPickupMinutes: 10, deliveryMinutes: 120 },
            calls: { count: null, hasExistingCalls: false },
            promise: { hasExistingCalls: false, lateStops: [], bufferAfterMin: null },
            space: { freePct: null, hasLoad: false },
            nature: { conflicts: [], excludedHits: [], hasLoad: false },
            geography: { firstLoad: true, progressRatio: 1 },
        };
        const v = judge(CRITERIA, 싼첫짐, cfg());
        expect(v.score).toBe(돈점(v));
    });

    it('🔴 다른 축이 나쁘면 돈보다 더 내려간다 — 천장이지 바닥이 아니다', () => {
        /* 🔴 «나쁜 축»은 **점수를 만드는 축**이어야 한다 — 공간·약속은 색만 만든다 (기사님 배분) */
        const 나쁜합짐: JudgeFacts = {
            money: { fare: 60_000, extraMinutes: 60, firstLoad: false },   // 6만/h → 돈 만점
            labor: { handMinutes: 40, protectionMinutes: 5 },              // 손으로 45분 — 고되다
            drive: { driveKm: 10, driveMinutes: 60 },                      // 10km/h — 시내
            wait: { toPickupMinutes: 20, deliveryMinutes: 5 },             // 남겨 주는 것이 거의 없다
            promise: { hasExistingCalls: true, lateStops: [], bufferAfterMin: 60 },
            space: { freePct: 70, hasLoad: true },
            nature: { conflicts: [], excludedHits: [], hasLoad: true },
            geography: { firstLoad: false, progressRatio: null },
        };
        const v = judge(CRITERIA, 나쁜합짐, cfg());
        expect(v.score!).toBeLessThan(돈점(v));
    });

    it('🔴 천장에 걸리면 화면에 까닭이 적힌다 — 조용히 안 내려간다', () => {
        const 싼합짐: JudgeFacts = {
            money: { fare: 30_000, extraMinutes: 60, firstLoad: false },
            wait: { toPickupMinutes: 10, deliveryMinutes: 60 },
            promise: { hasExistingCalls: true, lateStops: [], bufferAfterMin: 60 },
            space: { freePct: 60, hasLoad: true },
            nature: { conflicts: [], excludedHits: [], hasLoad: true },
            geography: { firstLoad: false, progressRatio: null },
        };
        expect(judge(CRITERIA, 싼합짐, cfg()).notes.join(' ')).toContain('돈');
    });
});

/**
 * ⏳ **콜 대기는 천장에 닿지 않는다** (기사님 확정 · 판정 균형 3단계)
 *
 * 배송 40분만 넘으면 100점이라 거의 모든 콜이 만점이었다 — 만점인 축은 갈라 주지 못하고
 * 평균만 끌어올린다. 배송 60분과 240분이 같은 🔵 80 이던 자리다.
 */
describe('⏳ 콜 대기 — 길수록 계속 오르고 100 에 안 닿는다', () => {

    const 대기점 = (deliveryMinutes: number) => {
        const v = judge(CRITERIA, {
            money: { fare: 30_000, extraMinutes: 60, firstLoad: false },
            wait: { toPickupMinutes: 10, deliveryMinutes },
            promise: { hasExistingCalls: true, lateStops: [], bufferAfterMin: 60 },
            space: { freePct: 60, hasLoad: true },
            nature: { conflicts: [], excludedHits: [], hasLoad: true },
            geography: { firstLoad: false, progressRatio: null },
        }, cfg());
        return (v.criteria.find(c => c.key === 'wait')!.outcome as { score: number }).score;
    };

    it('🔴 배송이 길수록 계속 오른다 — 어느 자리에서도 뭉치지 않는다', () => {
        const 값 = [20, 60, 120, 240, 480].map(대기점);
        for (let i = 1; i < 값.length; i++) expect(값[i]).toBeGreaterThan(값[i - 1]);
    });

    /* 🔴 하루를 통째로 쓰는 배송(8시간)에서도 안 닿는다 — 닿는 순간 그 위가 다시 뭉친다 */
    it('🔴 하루치 배송(480분)에서도 100 에 안 닿는다', () => {
        expect(대기점(480)).toBeLessThan(100);
    });
});

describe('설명 한 줄', () => {
    it('점수·기준·딱지를 한 줄로 적는다', () => {
        const v = judge(CRITERIA, { ...좋은합짐(), notes: ['배송주행 추정(일반값)'] }, cfg());
        const s = 설명(v);
        expect(s).toContain('🔵');
        expect(s).toContain('돈');
        expect(s).toContain('딱지: 배송주행 추정(일반값)');
    });

    it('못 쟀으면 「0점」이라 쓰지 않는다', () => {
        const v = judge(CRITERIA, {}, cfg());
        expect(설명(v)).toContain('잴 수 없음');
        expect(설명(v)).not.toContain('0점');
    });
});

/**
 * 🔴 **색은 판정 함수가 낸다 — 채점하는 곳은 하나다.**
 *
 * 첫짐·합짐·«판정 없이 끝날 때» 세 자리가 모두 같은 `judge(CRITERIA, …)` 를 부른다 —
 * 한 자리라도 다른 채점기를 쓰면 같은 콜이 자리마다 다른 색을 낸다.
 */
describe('갈아탔다 — 채점하는 곳은 하나다', () => {
    const { readFileSync } = require('fs');
    const { join } = require('path');
    const ev = readFileSync(join(__dirname, '../../src/core/engine/OrderEvaluator.ts'), 'utf8');

    it('🔴 색·점수·스냅샷이 전부 새 함수에서 나온다', () => {
        expect(ev).toMatch(/toSnapshot\(judge\(CRITERIA,/);
        expect(ev).toMatch(/saveJudgment\(securedOrder\.id, userId, dry\)/);
        expect(ev).toMatch(/recommend = `'\$\{dry\.color\}'`/);
    });

    it('🔴 옛 채점기는 손을 뗐다 — 부르지도, 들여오지도 않는다', () => {
        // 주석의 «옛 채점기» 언급은 역사다 — 그건 남겨 둔다 (glossary 검사와 같은 태도)
        expect(ev).not.toMatch(/scoreDryRun\(/);
        expect(ev).not.toMatch(/import[\s\S]{0,200}scoreDryRun/);
    });

    /**
     * 셋째 자리는 **«판정 없이 끝나지 않는다»** 한 곳이다 — 좌표를 못 찾거나 카카오가
     * 실패해도 판정 함수를 불러 서버 로그에 판정 색이 남는다. 채점 규칙을 따로 갖지 않고
     * **같은 함수에 «시간 모름»을 넘길 뿐**이라 두 벌이 아니다 — 그것까지 함께 문다.
     */
    it('첫짐·합짐 두 자리 모두 갈아탔다 — 한쪽만 바꾸면 두 벌이 된다 (+ 판정 없이 끝날 때 한 자리)', () => {
        expect((ev.match(/toSnapshot\(judge\(CRITERIA,/g) || []).length).toBe(3);
        expect(ev).toMatch(/if \(!\(securedOrder as any\)\.judgment\) \{[\s\S]{0,200}toSnapshot\(judge\(CRITERIA, firstLoadFacts\(\{[\s\S]{0,120}totalMinutes: null/);
    });
});
