import { judge, describe as 설명, defineCriterion, scored, nothing, unmeasurable, DEFAULT_JUDGMENT } from '@onedal/shared';
import { CRITERIA, 돈, 약속, 공간, 성질, 지리 } from '@onedal/shared';
import type { JudgeFacts, JudgmentConfig, Criterion } from '@onedal/shared';

/**
 * ⚖️ **판정 기준은 서로 섞이지 않고, 더하거나 뺄 수 있다** (기사님 확정 2026-08-29)
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
    money: { fare: 50_000, extraMinutes: 30 },                    // 10만/h → 만점권
    promise: { hasExistingCalls: true, lateStops: [], bufferAfterMin: 30 },
    space: { freePct: 70, vehicleFits: true, hasLoad: true, vehicleLabel: '다마스' },
    nature: { conflicts: [], excludedHits: [], hasLoad: true },
    geography: { onDetourPath: true },
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
        const 넷 = CRITERIA.filter(c => c.key !== 'money');
        const v = judge(넷, 좋은합짐(), cfg());
        expect(v.criteria.map(c => c.key)).toEqual(['promise', 'space', 'nature', 'geography']);
        expect(v.score).not.toBeNull();
    });

    it('가중치 0 으로도 끌 수 있다 — 목록에는 남고 색에만 안 든다', () => {
        const v = judge(CRITERIA, 좋은합짐(), cfg({ revenueDetour: 0 }));
        const 돈줄 = v.criteria.find(c => c.key === 'money')!;
        expect(돈줄.weight).toBe(0);
        expect(돈줄.outcome).toEqual({ kind: 'nothing', why: '안 봄 (가중치 0)' });
    });

    it('전부 끄면 색을 지어내지 않는다', () => {
        const v = judge(CRITERIA, 좋은합짐(), cfg({
            revenueDetour: 0, bufferCost: 0, slots: 0, promiseGuard: 0, cargoCompat: 0, geography: 0,
        }));
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
        expect(v.criteria).toHaveLength(6);
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
            money: { fare: 60_000, extraMinutes: 40 },
            promise: { hasExistingCalls: false, lateStops: [], bufferAfterMin: null },
            space: { freePct: null, vehicleFits: true, hasLoad: false },
            nature: { conflicts: [], excludedHits: [], hasLoad: false },
        };
        const v = judge(CRITERIA.filter(c => c.key !== 'geography'), f, cfg());
        expect(v.criteria.find(c => c.key === 'promise')!.outcome.kind).toBe('nothing');
        expect(v.criteria.find(c => c.key === 'space')!.outcome.kind).toBe('nothing');
        expect(v.color).not.toBe('사고');                        // 첫짐이라고 빨간불이 되면 안 된다
    });

    it('🔴 재료가 없으면 **잴 수 없음** — 색은 🔴 이고 이유를 적는다', () => {
        const f: JudgeFacts = { ...좋은합짐(), money: { fare: 50_000, extraMinutes: null } };
        const v = judge(CRITERIA, f, cfg());
        expect(v.color).toBe('사고');
        expect(v.notes.join(' ')).toContain('돈');
    });

    it('🔴 약속이 깨지면 점수와 무관하게 «잡으면 사고»', () => {
        const f = 좋은합짐();
        f.promise!.lateStops = [{ label: '노선콜 하차', lateMinutes: 7 }];
        const v = judge(CRITERIA, f, cfg());
        expect(v.color).toBe('사고');
        expect(v.criteria.find(c => c.key === 'promise')!.outcome).toMatchObject({ hardFail: true });
    });

    it('그 「사고」도 가중치 0 이면 안 덮는다 (경로만 보는 시험)', () => {
        const f = 좋은합짐();
        f.promise!.lateStops = [{ label: '노선콜 하차', lateMinutes: 7 }];
        expect(judge(CRITERIA, f, cfg({ promiseGuard: 0 })).color).not.toBe('사고');
    });
});

describe('🧭 지리는 자리와 이름이 있되 꺼져 있다 (기사님 확정)', () => {
    it('기본 가중치가 0 이다', () => {
        expect(DEFAULT_JUDGMENT.weights.geography).toBe(0);
    });

    it('꺼져 있어도 목록에 보인다 — 「일단 만들고 나중에 노출」이 아니다', () => {
        const v = judge(CRITERIA, 좋은합짐(), cfg());
        const 지리줄 = v.criteria.find(c => c.key === 'geography')!;
        expect(지리줄.name).toBe('지리');
        expect(지리줄.weight).toBe(0);
    });

    it('켜면 바로 돈다 — 경유를 벗어나면 0점', () => {
        const f = 좋은합짐();
        f.geography = { onDetourPath: false };
        const v = judge(CRITERIA, f, cfg({ geography: 1 }));
        expect(v.criteria.find(c => c.key === 'geography')!.outcome).toMatchObject({ score: 0 });
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

/** 아직 아무도 안 부른다 — 옛 채점기와 나란히 두고 비교한 뒤 갈아탄다 */
describe('아직 제품에 안 물렸다', () => {
    it('서버 코드가 judge() 를 부르지 않는다', () => {
        const { execSync } = require('child_process');
        const out = execSync(
            `grep -rl "judge(" ${__dirname}/../../src --include="*.ts" || true`,
            { encoding: 'utf8' });
        expect(out.trim()).toBe('');
    });
});
