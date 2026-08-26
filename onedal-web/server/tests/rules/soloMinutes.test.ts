import { readFileSync } from 'fs';
import { join } from 'path';
import { soloMinutesOf, derivationInputsOf, DEFAULT_JUDGMENT, deriveRouteTimeline } from '@onedal/shared';

/**
 * 🚚 **단독 배송 주행 — 합짐 콜도 가져야 한다** (기사님 실측 2026-08-26)
 *
 * 기사님: *"상차지를 지났는데 왜 파랑이었는지… 노랑이어야 맞는 것 같은데."*
 *
 * 되돌아가는 37분이 점수를 하나도 못 깎았다. 판정 딱지에 답이 있었다 —
 * **`버퍼 잴 약속 없음`**. 기존 콜들의 하차 약속이 없어서 *"37분 밀리면 뭐가 깨지나"*
 * 를 잴 수가 없었고, 그래서 축 하나가 통째로 빠진 채 **높은 두 축만 평균**해 85점이 됐다.
 *
 * ── 뿌리 ──
 * 하차 약속은 `상차 완료 + 단독 배송주행 × 150%` 로 만들어진다. 그런데 —
 *
 *     dispatchEngine.ts:239
 *     if (!isDetour) { calculateSoloRoute(...) → applySoloRoute(...) }   // 첫짐만
 *     else           { composeMergedRoute(...) }                        // 합짐은 병합만
 *
 * **합짐 콜은 단독 주행을 가질 방법이 구조적으로 없었다.** 실측 DB:
 *
 *     첫짐   soloKm 18.7 · soloMin 21   ✅
 *     합짐   (없음)      · (없음)        ❌
 *     주행중 (없음)      · (없음)        ❌
 *
 * 하나가 비어 **셋이 죽는다** — 판정 버퍼 축 · 타임라인 추정 약속 · 단계 시딩 마감.
 * 증상이 셋이라 각각 고치려 들면 폴백만 늘어난다. 고칠 곳은 **값이 태어나는 자리 하나**다.
 *
 * ── 왜 카카오를 또 부르지 않나 ──
 * 앱이 **이미 배송거리를 보내고 있다.** 인성 리스트 최좌측 두 번째 숫자이고, 앱의 단가
 * 판정(`fare ≥ deliveryDistance × ratePerKm`)이 그걸로 돌아간다. 서버는 그걸 받아
 * `...payload.order` 로 메모리에 담아 두고 **한 번도 안 읽었다.**
 * 없는 값을 만드는 게 아니라 **버리던 값을 줍는 것**이다 (규칙 ⑤-2).
 *
 * 🔴 **속도는 하나가 아니다.** 카카오 실측 45건:
 *     0~3km 27.4 · 3~10km 24.9 · 10~25km 46.1 · 25km+ 56.0 km/h
 *    짧으면 시내, 길면 국도라 두 배 넘게 벌어진다. 평균 하나로 환산하면
 *    짧은 콜을 두 배 빠르게, 긴 콜을 두 배 느리게 잰다.
 */
describe('soloMinutesOf — 실측이 없으면 배송거리로 추정한다', () => {
    // 🔴 실제 호출부와 같은 경로로 만든다 — 판정 기준 → 파생 입력 (규칙 ③)
    const cfg = derivationInputsOf(DEFAULT_JUDGMENT).rules;
    const order = (over: object) => ({ id: 'x', ...over }) as any;

    it('실측이 있으면 그대로 쓴다 — 추정이 실측을 덮지 않는다', () => {
        const r = soloMinutesOf(order({
            kakaoSoloDurationMin: 21, kakaoSoloDistanceKm: 18.7, deliveryDistance: 30,
        }), cfg);
        expect(r).toEqual({ minutes: 21, km: 18.7, estimated: false });
    });

    /**
     * 🔴 **거리와 시간은 한 짝이어야 한다** (2026-08-26 자기 리뷰).
     *
     * 옛 코드가 정확히 이걸 경고하고 있었다 — *"거리와 시간을 같은 출처에서 가져와야
     * 한쪽만 되어 속도가 이상해지지 않는다."* 처음 고칠 때 거리는
     * `kakaoSoloDistanceKm`, 시간은 `kakaoSoloDurationMin` 으로 **열쇠를 갈라** 뒀다.
     * 한쪽만 있으면 카카오 거리에 추정 시간이 붙어 **속도가 거짓말한다.**
     */
    it('🔴 카카오 실측이 반쪽뿐이면 다른 출처로 짝을 맞추지 않는다', () => {
        // 시간만 있고 거리가 없다 → 화면 거리로 «시간까지» 갈아끼우지 않는다
        const half = soloMinutesOf(order({ kakaoSoloDurationMin: 21, deliveryDistance: 30 }), cfg);
        expect(half.estimated).toBe(false);
        expect(half.minutes).toBe(21);
        expect(half.km).toBeNull();                 // 카카오 거리가 없으면 없는 대로 둔다

        // 거리만 있고 시간이 없다
        const half2 = soloMinutesOf(order({ kakaoSoloDistanceKm: 18.7 }), cfg);
        expect(half2.minutes).toBeNull();
        expect(half2.km).toBe(18.7);
    });

    it('🔴 추정으로 갈 때는 거리·시간이 같은 출처(화면 배송거리)에서 나온다', () => {
        const r = soloMinutesOf(order({ deliveryDistance: 20 }), cfg);
        expect(r.km).toBe(20);
        expect(r.estimated).toBe(true);
        // 20km ÷ 46km/h ≈ 26분 — 낸 거리와 낸 시간의 속도가 설정값과 맞는다
        expect(20 / (r.minutes! / 60)).toBeCloseTo(46, 0);
    });

    it('🔴 실측이 없으면 배송거리 ÷ 구간 속도로 채운다 (합짐 콜의 구멍)', () => {
        // 4.4km — 짧은 구간이라 시내 속도(25km/h) → 약 11분
        const r = soloMinutesOf(order({ deliveryDistance: 4.4 }), cfg);
        expect(r.estimated).toBe(true);
        expect(r.minutes).toBeGreaterThanOrEqual(9);
        expect(r.minutes).toBeLessThanOrEqual(13);
    });

    it('🔴 거리에 따라 속도가 달라진다 — 평균 하나로 환산하지 않는다', () => {
        const short = soloMinutesOf(order({ deliveryDistance: 5 }), cfg).minutes!;
        const mid = soloMinutesOf(order({ deliveryDistance: 20 }), cfg).minutes!;
        const long = soloMinutesOf(order({ deliveryDistance: 40 }), cfg).minutes!;
        // 4배 거리인데 4배 시간이 아니다 (긴 구간이 빠르다)
        expect(mid).toBeLessThan(short * 4);
        expect(long).toBeLessThan(mid * 2.5);
    });

    it('배송거리조차 없으면 지어내지 않는다 (규칙 ④)', () => {
        expect(soloMinutesOf(order({}), cfg)).toEqual({ minutes: null, km: null, estimated: false });
        expect(soloMinutesOf(order({ deliveryDistance: 0 }), cfg)).toEqual({ minutes: null, km: null, estimated: false });
    });

    it('속도는 DB 판정 기준에서 온다 — 코드 상수로 박아 두지 않는다 (규칙 ⑤-4 ①)', () => {
        const slow = derivationInputsOf({ ...DEFAULT_JUDGMENT,
            speed: { shortKmh: 10, midKmh: 10, longKmh: 10 } }).rules;
        expect(soloMinutesOf(order({ deliveryDistance: 10 }), slow).minutes)
            .toBeGreaterThan(soloMinutesOf(order({ deliveryDistance: 10 }), cfg).minutes!);
    });
});

/** 읽는 자리가 셋이었다 — 전부 한 함수를 거치는지 소스로 강제한다 (규칙 ③) */
describe('읽는 자리를 한 곳으로 모았다', () => {
    const read = (rel: string) => readFileSync(join(__dirname, '../..', rel), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');

    it('🔴 단계 시딩이 kakaoSoloDurationMin 을 직접 읽지 않는다', () => {
        expect(read('src/services/stepSeeder.ts')).not.toMatch(/kakaoSoloDurationMin/);
    });

    it('🔴 osrmSolo* 는 없앤다 — 아무도 안 채우는데 판정 분기가 그걸 물었다', () => {
        for (const f of ['../shared/src/timing.ts', '../shared/src/index.ts']) {
            expect(read(f)).not.toMatch(/osrmSolo/);
        }
    });
});

/**
 * 🚚 **상차지에 도착해도 «상차 완료 예정»을 잃지 않는다** (기사님 실측 2026-08-26)
 *
 * 같은 판에서 07(상차 전)은 버퍼 축이 있고 28(상차 후)은 통째로 빠졌다:
 *
 *     07  🔵 90점 — 우회(100) · **버퍼 소비 최소 +184분(100)** · 적재 여유(70)
 *     28  🔵 70점 — 우회(100) · 적재 여유(40)        딱지: **버퍼 잴 약속 없음**
 *
 * 하차 약속 = `상차 완료 + 단독 주행 × 150%` 인데 앞쪽이 비었다. 실측(`PICKED_UP`)은
 * 기사님 보고로만 생기고, 예정은 **경로에 상차 정거장이 남아 있을 때만** 채워진다 —
 * 도착하면 정거장이 빠지므로 둘 다 사라진다.
 *
 * 장부에는 도착이 남아 있다: `step_arrive_pickup DONE 09:17:19 (GPS)`.
 * CLAUDE.md ⑤-5 대로 **도착 + 상차 정차**로 파생한다.
 */
describe('상차지 도착 뒤에도 하차 약속이 산다', () => {
    const rules = derivationInputsOf(DEFAULT_JUDGMENT).rules;
    const ANCHOR = '2026-08-26T00:17:00.000Z';
    const NOW = Date.parse(ANCHOR);
    const order = {
        id: 'A', capturedAt: '2026-08-26T00:10:00.000Z',
        kakaoSoloDurationMin: 20, kakaoSoloDistanceKm: 10,
    } as any;
    /** 상차는 이미 다녀왔다 — 남은 정거장은 하차뿐 */
    const stops = [{ orderId: 'A', stopType: 'dropoff' as const, driveMinutes: 10 }];

    const promiseOf = (milestones: any[]) => deriveRouteTimeline(
        stops as any, [order] as any, () => [], () => milestones,
        NOW, ANCHOR, rules,
    )[0]?.promisedUntil ?? null;

    it('🔴 상차 완료 보고가 없어도 «도착 실측»에서 하차 약속이 나온다', () => {
        const p = promiseOf([{ milestone: 'ARRIVED_PICKUP', occurredAt: '2026-08-26T00:15:00.000Z' }]);
        expect(p).not.toBeNull();
    });

    it('도착조차 없으면 약속을 지어내지 않는다 (규칙 ④)', () => {
        expect(promiseOf([])).toBeNull();
    });

    it('실측 상차 완료가 있으면 그것이 이긴다 — 도착+정차가 덮지 않는다', () => {
        const withDone = promiseOf([
            { milestone: 'ARRIVED_PICKUP', occurredAt: '2026-08-26T00:15:00.000Z' },
            { milestone: 'PICKED_UP', occurredAt: '2026-08-26T00:16:00.000Z' },
        ]);
        const onlyArrived = promiseOf([
            { milestone: 'ARRIVED_PICKUP', occurredAt: '2026-08-26T00:15:00.000Z' },
        ]);
        // 실측 완료(00:16)가 도착+정차(00:15+15분=00:30)보다 이르므로 약속도 이르다
        expect(Date.parse(withDone!)).toBeLessThan(Date.parse(onlyArrived!));
    });
});
