import { readFileSync } from 'fs';
import { join } from 'path';
import { soloMinutesOf, derivationInputsOf, DEFAULT_JUDGMENT } from '@onedal/shared';

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

    it('실측(kakaoSoloDurationMin)이 있으면 그대로 쓴다 — 추정이 실측을 덮지 않는다', () => {
        const r = soloMinutesOf(order({ kakaoSoloDurationMin: 21, deliveryDistance: 18.7 }), cfg);
        expect(r).toEqual({ minutes: 21, estimated: false });
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
        expect(soloMinutesOf(order({}), cfg)).toEqual({ minutes: null, estimated: false });
        expect(soloMinutesOf(order({ deliveryDistance: 0 }), cfg)).toEqual({ minutes: null, estimated: false });
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
