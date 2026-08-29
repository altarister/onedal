import { readFileSync } from "fs";
import { initGeoService } from "../../src/services/geoService";
import { join } from "path";
import { judge, CRITERIA, describe as 판정설명, DEFAULT_JUDGMENT, parseCapturedAt, deriveCallTiming } from "@onedal/shared";
import { DWELL_UNKNOWN_PICKUP_MINUTES, DWELL_UNKNOWN_DROPOFF_MINUTES, allowedDetourMinutes, dwellMinutes } from "@onedal/shared";

const SERVER = join(__dirname, "../../src");
const read = (rel: string) => readFileSync(join(SERVER, rel), "utf8");
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/**
 * 🎨 **판정색 확정안 v2 로 전환된 뒤의 규칙 검사** (2026-08-21)
 *
 * 옛 채점기(scoreMerge·scoreSolo — 절대치 문턱·요율 재계산)는 노하우 4콜 문제지
 * 낙제로 철거됐다. 채점 행동 자체는 `tests/shared/dryRunScore.test.ts` 가 지킨다.
 * 여기 남는 것은 **역사적 실측 콜들이 새 채점기에서도 옳게 나오는가**와
 * **판정하는 곳이 한 곳뿐인가**(소스 검사)다.
 */

describe('실측 콜 회귀 — 옛 사고가 새 채점기에서 재발하지 않는다', () => {

    /** 그날 실제로 있었던 콜 (2026-08-15) — 99,000원 · 한계 우회 +6분 + 정차 25분 */
    it('🔴 99,000원 · +31분이면 「돈」이 만점이다 (옛 채점기는 마감 여유 0 으로 뭉개 똥이었다)', () => {
        const v = judge(CRITERIA, {
            money: { fare: 99_000, extraMinutes: 6 + DWELL_UNKNOWN_PICKUP_MINUTES + DWELL_UNKNOWN_DROPOFF_MINUTES },
            promise: { hasExistingCalls: true, lateStops: [], bufferAfterMin: null },
            space: { freePct: 60, hasLoad: true },
            nature: { conflicts: [], excludedHits: [], hasLoad: true },
            notes: ['정차 미확인(일반값)'],
        }, DEFAULT_JUDGMENT);
        // 9.9만 ÷ 31분 = 19.2만/h — 「돈」은 만점이다
        expect((v.criteria.find(c => c.key === 'money')!.outcome as any).score).toBe(100);
        // ⚠️ 여유를 못 재면 색은 🔴 다 (3단계에서 정한 것) — 옛 채점기는 그 기준을 빼고 꿀을 냈다
        expect(판정설명(v)).toContain('미확인');
    });

    it('상하차 일반값이 25분이다 (상차 15 + 하차 10 · 예전 40분)', () => {
        expect(DWELL_UNKNOWN_PICKUP_MINUTES + DWELL_UNKNOWN_DROPOFF_MINUTES).toBe(25);
        expect(DWELL_UNKNOWN_PICKUP_MINUTES).toBeGreaterThan(DWELL_UNKNOWN_DROPOFF_MINUTES);  // 상차엔 결박이 붙는다
    });

    it('첫짐 — 운행시간이 아무리 길어도 시급이 좋으면 꿀이다 (2026-08-18 실측 그 콜)', () => {
        // 100,000원 · 98분(+정차 25) — 옛 시간 기준(40/90분)으로는 0점 똥이었다
        const v = judge(CRITERIA, {
            money: { fare: 100_000, extraMinutes: 123 },
            promise: { hasExistingCalls: false, lateStops: [], bufferAfterMin: null },
            space: { freePct: null, hasLoad: false },
            nature: { conflicts: [], excludedHits: [], hasLoad: false },
        }, DEFAULT_JUDGMENT);
        expect(v.color).toBe('꿀');           // 4.9만/h ≥ 목표 3.0만
    });

    it('가중치 0 인 기준은 색에 반영되지 않는다 (표시는 계속한다)', () => {
        const cfg = { ...DEFAULT_JUDGMENT,
            weights: { ...DEFAULT_JUDGMENT.weights, slots: 0 } };
        const 사실 = (freePct: number | null) => ({
            money: { fare: 35_000, extraMinutes: 40 },
            promise: { hasExistingCalls: true, lateStops: [], bufferAfterMin: 20 },
            space: { freePct, hasLoad: true },
            nature: { conflicts: [], excludedHits: [], hasLoad: true },
        });
        const 자리나쁨 = judge(CRITERIA, 사실(0), cfg);
        const 자리좋음 = judge(CRITERIA, 사실(100), cfg);
        expect(자리나쁨.score).toBe(자리좋음.score);                    // 색 무관
        expect(자리나쁨.criteria.some(c => c.key === 'space')).toBe(true);  // 표시는 남는다
    });

    it('🔴 allowedDetourMinutes 가 음수를 0 으로 깎지 않는다', () => {
        expect(allowedDetourMinutes([-30, 50])).toBe(-30);
        expect(allowedDetourMinutes([null, null])).toBeNull();
        expect(allowedDetourMinutes([80, 30])).toBe(30);
    });
});

describe('판정하는 곳은 한 곳', () => {

    /**
     * 🔴 **2026-08-29 갈아탐** — 채점기가 `scoreDryRun` 에서 `judge` 로 바뀌었다.
     *    갈아타기 전 **84건을 나란히 대조해 어긋남 0** 을 확인했다 (검사 73 · 리허설 11).
     *    지키는 것은 그대로다: **채점하는 곳은 한 곳뿐이다.**
     */
    it('🔴 채점은 judge 하나 — 옛 채점기·임계값 상수가 코드에 없다', () => {
        const ev = codeOnly(read('core/engine/OrderEvaluator.ts'));
        expect(ev).toMatch(/judge\(CRITERIA,/);
        expect(ev).not.toMatch(/scoreDryRun/);
        expect(ev).not.toMatch(/scoreMerge|scoreSolo/);
        expect(ev).not.toMatch(/DETOUR_SHIT_TIME_MIN|DETOUR_HONEY_TIME_MAX/);
        const cfg = codeOnly(read('config/dispatchConfig.ts'));
        expect(cfg).not.toMatch(/SOLO_SHIT_TIME_MIN/);
    });

    it('🔴 재탐색은 색을 다시 정하지 않는다 — 심사 스냅샷 고정 (확정 ④)', () => {
        const en = codeOnly(read('services/dispatchEngine.ts'));
        expect(en).not.toMatch(/scoreMerge|scoreDryRun|judge\(CRITERIA/);
        expect(en).toMatch(/getJudgment\(/);
        expect(en).not.toMatch(/distDiffKm\)\s*>\s*10/);
    });

    it('🔴 상하차 일반값을 코드가 직접 쓰지 않는다 (dwellMinutes 가 정한다)', () => {
        expect(dwellMinutes(null, 0, 'pickup')).toBe(DWELL_UNKNOWN_PICKUP_MINUTES);
        expect(dwellMinutes(null, 0, 'dropoff')).toBe(DWELL_UNKNOWN_DROPOFF_MINUTES);
        expect(dwellMinutes('지게차', 80)).toBe(4);    // 방법+수량을 알면 일반값과 무관 (파레트 2개 × 2분)
        expect(dwellMinutes('지게차', 0)).toBe(DWELL_UNKNOWN_PICKUP_MINUTES);   // 수량을 모르면 일반값
    });
});

/**
 * 🔴 **서버가 미리 눌러 두고 기사님이 확정하신다** (기사님 확정 2026-08-16)
 *
 * *"너가 눌러 놓은 걸 내가 확정하는 거야. 너가 눌러 논 것에서 상황이 바뀐다면 내가 바꿔서 확정할 거고."*
 *
 * 내가 *"안 고르셨는데 고른 것처럼 저장되면 안 된다"* 며 **빈칸으로 두자고** 제안했다가
 * *"완전히 잘못 생각하고 있어"* 라는 지적을 받았다. 이 제품은 처음부터 일관되게
 * **미리 채우고 기사님이 확정하는** 방식이다 — 앱이 느슨하게 집어 오면 결재하시고,
 * 적요에서 미리 클릭해 두면 틀린 것만 고치신다.
 */
/**
 * 🏗️ 옛 시트(StopCallSheet)는 철거됐다 (기사님 확인 2026-08-21).
 * "미리 눌러 두고 기사님이 확정"의 거처가 옮겨졌다:
 *   · 미리 눌림(추천 계산) → **서버 시딩** (stepSeeder computeChain — stepSeeder.test 가 지킨다)
 *   · 근거 표시 → planned_source 배지 + 격자 ⓘ "저장된 값 — 도착 예상 …"
 *   · 누르면 확정 → 격자 안내 + 통화 완료 저장 (promiseChain·stepSkip 검사)
 *   · 시트는 계산하지 않는다 → callSheetSentence 검사
 */
describe('미리 눌러 두고 기사님이 확정 — 새 거처', () => {
    const CLIENT3 = join(__dirname, '../../../client-app/src');
    const rc3 = (rel: string) => codeOnly(readFileSync(join(CLIENT3, rel), 'utf8'));
    const sheet3 = () => rc3('components/dashboard/StepSheetMock.tsx');

    it('🔴 격자 ⓘ 가 저장된 값의 근거(도착 예상·약속)를 함께 적는다', () => {
        expect(sheet3()).toMatch(/저장된 값/);
        expect(sheet3()).toMatch(/도착 예상/);
    });

    it('🔴 누르면 확정 — 격자가 그 사실을 말한다', () => {
        expect(sheet3()).toMatch(/누르면 그게 확정|약속으로 저장/);
    });

    it('🔴 미리 눌림은 서버 시딩이 한다 — 차종 기본값 배지가 남는다', () => {
        expect(sheet3()).toMatch(/차종 기본값/);
        const seeder = codeOnly(readFileSync(join(__dirname, '../../src/services/stepSeeder.ts'), 'utf8'));
        expect(seeder).toMatch(/defaultCargoByVehicle/);
    });
});

describe('콜 잡은 시각 — 시간대를 잘못 붙인 값도 읽어낸다', () => {

    const NOW = new Date('2026-08-16T09:40:00+09:00').getTime();
    const t = (x: string | null) => x ? new Date(x).toISOString() : null;

    it('🔴 `Z` 가 붙었는데 미래면 로컬로 다시 읽는다 (잡은 시각이 미래일 수는 없다)', () => {
        expect(parseCapturedAt('2026-08-16T09:10:12Z', NOW))
            .toBe(new Date('2026-08-16T09:10:12+09:00').getTime());
    });

    it('제대로 보낸 값은 그대로 쓴다', () => {
        expect(parseCapturedAt('2026-08-16T09:10:12+09:00', NOW))
            .toBe(new Date('2026-08-16T09:10:12+09:00').getTime());
        // 진짜 UTC 로 보낸 값은 **과거**라 보정에 안 걸린다
        expect(parseCapturedAt('2026-08-16T00:10:12Z', NOW))
            .toBe(new Date('2026-08-16T00:10:12Z').getTime());
    });

    it('🔴 세 형식이 **같은 상차 마감**을 낸다', () => {
        const base: any = { id: 'X', status: 'ORDER_CONFIRMED', totalDistanceKm: 65,
                            totalDurationMin: 80, kakaoSoloDistanceKm: 50,
                            kakaoSoloDurationMin: 60, approachDurationMin: 13 };
        const 결과 = ['2026-08-16T09:10:12Z', '2026-08-16T09:10:12+09:00', '2026-08-16T00:10:12Z']
            .map(cap => t(deriveCallTiming({ ...base, capturedAt: cap }, [], [], NOW).pickupDeadlineAt));
        expect(new Set(결과).size).toBe(1);
        // ⏱️ 두 시계(⑯): 약속 = max(도착 예상 +13, 상차 시계 +30) = +30 · + 상차 미확인 15 = 완료
        expect(결과[0]).toBe(new Date(new Date('2026-08-16T09:10:12+09:00').getTime() + (30 + 15) * 60_000).toISOString());
    });

    it('값이 없거나 이상하면 null (지어내지 않는다)', () => {
        expect(parseCapturedAt(null, NOW)).toBeNull();
        expect(parseCapturedAt('아무거나', NOW)).toBeNull();
    });

    it('🔴 앱이 시간대를 실어 보낸다 (`Z` 를 글자로 붙이지 않는다)', () => {
        const APP = join(__dirname, '../../../../onedal-app/app/src/main/java/com/onedal/app');
        for (const f of ['HijackService.kt', 'plugins/insung/InsungParser.kt',
                         'plugins/hwamul24/Hwamul24Parser.kt']) {
            const src = readFileSync(join(APP, f), 'utf8')
                .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
            expect(src).not.toMatch(/'T'HH:mm:ss'Z'/);
        }
    });
});

describe('시트 상태 — 콜마다 새로 선다', () => {
    const CLIENT4 = join(__dirname, '../../../client-app/src');
    const rc4 = (rel: string) => codeOnly(readFileSync(join(CLIENT4, rel), 'utf8'));

    /**
     * 🔴 **콜마다 시트를 새로 그린다** (2026-08-16 실측).
     *
     * `key` 가 `shownStep.id`(= `CALL_PICKUP` 같은 **단계 이름**)뿐이라 콜이 달라도 같았다.
     * React 가 컴포넌트를 재사용해 **앞 콜의 `deadlineAt`·물량이 다음 콜 화면에 남았다** —
     * 송정동 콜 화면에 계산서필 콜의 `11:08` 이 떠 있었다.
     */
    /** 🏗️ 옛 시트 철거(2026-08-21) 후에도 교훈은 산다 — 콜이 달라지면 시트 상태가 새로 선다 */
    it('🔴 시트의 key 에 콜 id 가 들어간다', () => {
        const card = rc4('components/dashboard/PinnedRouteCard.tsx');
        const at = card.indexOf('<StepSheetMock');
        expect(at).toBeGreaterThan(-1);
        const props = card.slice(at, at + 300);
        expect(props).toMatch(/key=\{`\$\{route\.id\}:\$\{sv\.step\}`\}/);
    });

    /**
     * 🏗️ `pickupDeadlineAt` 프롭도 옛 시트와 함께 철거 — "주행을 몰라도 추천"은 이제
     * **출생**이 한다: 시딩이 접근을 모르면 약속을 옛 규칙(잡은 시각+60분)으로 폴백해
     * 행에 저장하고, 격자는 그 저장값을 그린다 (`stepSeeder.test` 의 '주행을 모르면' 검사).
     */
    it('🔴 주행을 몰라도 약속 폴백이 행에 저장된다 — 시딩이 한다', () => {
        const seeder = readFileSync(join(__dirname, '../../src/services/stepSeeder.ts'), 'utf8');
        // 상차 시계 잠정(30)이 통화 전 추정 약속의 폴백이다 (⑯)
        expect(seeder).toMatch(/pickupOffsetMin \?\? 30/);
    });

    /**
     * 🔴 「이어서 — 하차지도 지금 정하기」 블록을 **뺐다** (기사님 2026-08-18):
     *    *"통화 완료를 누르면 바로 다음 하차지 통화로 나올 건데, 한 화면에 중복으로
     *    표현할 필요가 없어 보인다."* 시퀀스가 이미 다음 단계로 데려간다 (규칙 ⑥).
     *    그래서 상차 정차를 두 번 더하는지 검사할 대상 자체가 사라졌다.
     */
    it('상차지 통화에 하차지 시각 블록이 없다 — 단계를 한 화면에 겹치지 않는다', () => {
        expect(rc4('components/dashboard/StepSheetMock.tsx')).not.toMatch(/이어서 — 하차지도 지금 정하기/);
    });
});
