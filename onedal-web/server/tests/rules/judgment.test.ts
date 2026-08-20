import { readFileSync } from "fs";
import { initGeoService } from "../../src/services/geoService";
import { join } from "path";
import { scoreMerge, scoreSolo, rampDown, DEFAULT_JUDGMENT, describeJudgment, parseCapturedAt, deriveCallTiming } from "@onedal/shared";
import { DWELL_UNKNOWN_PICKUP_MINUTES, DWELL_UNKNOWN_DROPOFF_MINUTES, allowedDetourMinutes, dwellMinutes } from "@onedal/shared";

const SERVER = join(__dirname, "../../src");
const read = (rel: string) => readFileSync(join(SERVER, rel), "utf8");
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** 그날 실제로 있었던 콜 — 요금 99,000원 · 우회 +1.1km · 주행 +6분 */
const 그날의콜 = {
    driveDiffMin: 6, detourKm: 1.1,
    dwellMin: DWELL_UNKNOWN_PICKUP_MINUTES + DWELL_UNKNOWN_DROPOFF_MINUTES,  // 25분
    dwellAssumed: true,
    detourBufferMin: null,                       // 통화 전이라 마감을 모른다
    slotsFree: 3, slotsTotal: 5,
};

/**
 * 🔴 **꿀콜이 똥으로 표시되던 문제** (2026-08-15 실측)
 *
 * 기사님: *"'99,000원짜리 콜이 1.1km 우회로 붙는데 똥입니다.' 이걸 이야기 하는 거였어."*
 *
 * 서버 로그가 그대로 말해 준다:
 * ```
 * 👍 장점: 차종 일치 | 도착지 경유 적중 | 우회거리(+1.1km) 양호 🍯
 * 💩 똥콜: 총 추가시간(+46분) 초과 — 주행 +6분 + 상하차 40분(미확인) · 마감 여유 0분 기준
 * ```
 * **세 번의 비관이 곱해졌다:**
 *   ① 상하차를 모른다며 20+20=40분 (주석이 *"낙관하지 않는다"* 며 비관을 명시)
 *   ② 마감 여유가 음수라 `Math.max(0,…)` 로 **0** 이 됨
 *   ③ 그 `0` 이 곧 한계가 되어 `46 >= 0` → 똥. **+0분짜리 콜조차 똥이 된다**
 */
describe('그날의 콜 — 99,000원 · +1.1km · +6분', () => {

    it('🔴 이제 꿀이다 (예전에는 똥이었다)', () => {
        const v = scoreMerge(그날의콜);
        expect(v.color).toBe('꿀');
        expect(v.score).toBeGreaterThanOrEqual(DEFAULT_JUDGMENT.color.honeyMin);
        expect(v.blocked).toBeUndefined();
    });

    it('상하차를 일반값으로 때웠다고 **표시**한다 (숫자가 거짓말하지 않게)', () => {
        const v = scoreMerge(그날의콜);
        expect(v.parts.some(p => p.assumed)).toBe(true);
        expect(describeJudgment(v)).toContain('미확인');
    });

    it('상하차 일반값이 25분이다 (상차 15 + 하차 10 · 예전 40분)', () => {
        expect(DWELL_UNKNOWN_PICKUP_MINUTES + DWELL_UNKNOWN_DROPOFF_MINUTES).toBe(25);
        expect(DWELL_UNKNOWN_PICKUP_MINUTES).toBeGreaterThan(DWELL_UNKNOWN_DROPOFF_MINUTES);  // 상차엔 결박이 붙는다
    });
});

/**
 * 🔴 **마감을 "모른다"와 "늦었다"는 다르다** (기사님 확정 2026-08-15)
 *
 * 예전에는 `Math.max(0, …)` 가 둘 다 `0` 으로 뭉갰고, 그 0 이 한계가 되어 모든 합짐이 똥이었다.
 */
describe('마감 — 모름 · 여유 · 지각을 구분한다', () => {

    /**
     * ⚠️ 이 검사는 원래 *"마감을 모르면 **일반값 90분**을 쓴다"* 였다.
     *
     * 기사님(2026-08-16): *"**여유 90분으로 퉁치니 문제가 발생하는 거야.**"*
     * **여유는 입력값이 아니라 마감에서 계산해 나오는 값**이다. 그래서 상수를 지우고,
     * 통화 마감이 없으면 `computeAllowedDetour` 가 **규칙으로 만든 추정 마감**에서 구한다:
     * ```
     *   상차 마감 = 콜 잡은 시각 + 60분          (콜 대기 여유)
     *   하차 마감 = 상차 마감 + 단독 주행 + 30분  (휴식 여유)
     * ```
     * 그래도 `null` 이 오면 **셀 근거가 아예 없다**는 뜻이라(잡은 시각도 주행도 모른다)
     * 지어내지 않고 **그 요소를 색에서 뺀다**(가중치 0).
     */
    it('🔴 여유를 상수로 때우지 않는다 — 90분 일반값이 사라졌다', () => {
        expect((DEFAULT_JUDGMENT.unknown as any).detourBufferMin).toBeUndefined();
        expect(DEFAULT_JUDGMENT.unknown.pickupOffsetMin).toBe(60);
        expect(DEFAULT_JUDGMENT.unknown.restMarginMin).toBe(30);
    });

    it('🔴 여유를 셀 근거가 없으면 그 요소를 색에서 뺀다 (지어내지 않는다)', () => {
        const v = scoreMerge({ ...그날의콜, detourBufferMin: null });
        const part = v.parts.find(p => p.name === '경유버퍼')!;
        expect(part.assumed).toBe(true);
        expect(part.weight).toBe(0);          // 색에 영향을 주지 않는다
        expect(part.raw).toContain('모름');
    });

    it('🔴 마감을 정했는데 이미 늦었으면 합짐을 막는다', () => {
        const v = scoreMerge({ ...그날의콜, detourBufferMin: -20 });
        expect(v.color).toBe('똥');
        expect(v.blocked).toContain('20분');
        expect(v.blocked).toContain('약속');
    });

    it('여유가 0 이어도 "모름"과 섞이지 않는다', () => {
        const zero = scoreMerge({ ...그날의콜, detourBufferMin: 0 });
        const unknown = scoreMerge({ ...그날의콜, detourBufferMin: null });
        expect(zero.blocked).toBeUndefined();      // 0 은 지각이 아니다
        expect(zero.score).toBeLessThan(unknown.score);
    });

    it('🔴 allowedDetourMinutes 가 음수를 0 으로 깎지 않는다', () => {
        expect(allowedDetourMinutes([-30, 50])).toBe(-30);
        expect(allowedDetourMinutes([null, null])).toBeNull();
        expect(allowedDetourMinutes([80, 30])).toBe(30);
    });
});

describe('점수 — 임계값을 그대로 두 점으로 쓴다', () => {

    it('꿀 기준 이하면 만점 · 똥 기준 이상이면 0점 · 사이는 선형', () => {
        expect(rampDown(10, 30, 60)).toBe(100);
        expect(rampDown(30, 30, 60)).toBe(100);
        expect(rampDown(60, 30, 60)).toBe(0);
        expect(rampDown(90, 30, 60)).toBe(0);
        expect(rampDown(45, 30, 60)).toBe(50);
    });

    it('가중치 0 인 요소는 색에 반영되지 않는다', () => {
        const cfg = { ...DEFAULT_JUDGMENT, weights: { ...DEFAULT_JUDGMENT.weights, detourDist: 0 } };
        const far = { ...그날의콜, detourKm: 99 };
        expect(scoreMerge(far, cfg).score).toBeGreaterThan(scoreMerge(far).score);
    });

    /**
     * 🔴 예전에는 시간과 거리가 `OR` 였다 — 거리 하나만 넘어도 시간과 무관하게 똥.
     *    `+31.1km` 콜이 그렇게 걸렸다. 이제 가중치로 섞인다.
     */
    it('거리 하나가 넘었다고 바로 똥이 되지 않는다', () => {
        const v = scoreMerge({ ...그날의콜, detourKm: 31, driveDiffMin: 5 });
        expect(v.color).not.toBe('똥');
    });
});

/**
 * 🔴 **색을 정하는 곳은 한 곳뿐이다.**
 * 최초 평가 `60분/30km` · 재탐색 `30분/10km` 로 갈라져 있어 **같은 콜이 재탐색만 해도
 * 색이 바뀌었다.**
 */
describe('판정하는 곳은 한 곳', () => {

    it('🔴 OrderEvaluator 가 임계값을 직접 비교하지 않는다', () => {
        const ev = codeOnly(read('core/engine/OrderEvaluator.ts'));
        expect(ev).toMatch(/scoreMerge\(\{/);
        expect(ev).not.toMatch(/DETOUR_SHIT_TIME_MIN|DETOUR_HONEY_TIME_MAX/);
        expect(ev).not.toMatch(/DETOUR_SHIT_DIST_MIN|DETOUR_HONEY_DIST_MAX/);
    });

    it('🔴 첫짐도 한 곳에서 판정한다 — scoreSolo (코드 상수 90분은 폐기)', () => {
        const ev = codeOnly(read('core/engine/OrderEvaluator.ts'));
        expect(ev).toMatch(/scoreSolo\(\{/);
        expect(ev).not.toMatch(/SOLO_SHIT_TIME_MIN|SOLO_HONEY_TIME_MAX/);
        expect(ev).not.toMatch(/driveMin:/);   // 운행시간 축 폐기 (2026-08-18)
        const cfg = codeOnly(read('config/dispatchConfig.ts'));
        expect(cfg).not.toMatch(/SOLO_SHIT_TIME_MIN/);
    });

    /**
     * 🔴 **첫짐은 단가로 잰다 — 운행시간 축은 폐기** (기사님 확정 2026-08-18)
     *
     * 옛 기준(40/90분)에서는 기사님 노선(광주→파주, 80~100분)이 **전부 똥**으로 떴다.
     * 100,000원짜리가 0점이었는데 같은 로그에서 요율은 "적정가의 1.5배"라고 말하고 있었다.
     * 첫짐에서 오래 걸린다는 건 나쁜 게 아니라 그게 일감이다.
     */
    it('첫짐 색 — 적정가를 넘으면 꿀, 하한 이상이면 보통, 미만이면 똥', () => {
        const 적정 = 70_000, 하한 = 63_000;
        expect(scoreSolo({ fare: 100_000, fairPrice: 적정, minAcceptable: 하한 }).color).toBe('꿀');
        expect(scoreSolo({ fare: 65_000, fairPrice: 적정, minAcceptable: 하한 }).color).toBe('보통');
        expect(scoreSolo({ fare: 50_000, fairPrice: 적정, minAcceptable: 하한 }).color).toBe('똥');
    });

    it('첫짐 — 운행시간이 아무리 길어도 단가가 좋으면 꿀이다 (2026-08-18 실측 그 콜)', () => {
        // 100,000원 · 94km · 98분 → 옛 기준으로는 0점 똥이었다
        expect(scoreSolo({ fare: 100_000, fairPrice: 65_142, minAcceptable: 58_628 }).color).toBe('꿀');
    });

    it('첫짐 — 적정가를 못 구하면 색을 지어내지 않는다', () => {
        const r = scoreSolo({ fare: 100_000, fairPrice: null, minAcceptable: null });
        expect(r.parts[0].raw).toContain('연산 실패');
    });

    it('🔴 재탐색이 자기 숫자를 갖지 않는다', () => {
        const en = codeOnly(read('services/dispatchEngine.ts'));
        expect(en).toMatch(/scoreMerge\(\{/);
        expect(en).not.toMatch(/distDiffKm\)\s*>\s*10/);
        expect(en).not.toMatch(/timeDiffMin\)\s*>\s*30/);
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
describe('통화 시트 — 미리 눌러 두고 근거를 남긴다', () => {

    const CLIENT3 = join(__dirname, '../../../client-app/src');
    const rc3 = (rel: string) => codeOnly(readFileSync(join(CLIENT3, rel), 'utf8'));
    const sheet = () => rc3('components/dashboard/StopCallSheet.tsx');

    it('🔴 추천 칸을 미리 눌러 둔다', () => {
        expect(sheet()).toMatch(/suggestedSlot/);
        expect(sheet()).toMatch(/setDeadlineAt\(suggestedSlot\.iso\)/);
    });

    /**
     * 🕒 **약속은 도착 시각이다 — 추천 칸은 도착 예상 + 30분** (기사님 2026-08-18 개정).
     *    옛 규칙은 상차 정차까지 더해 "실어 보내는 시각"을 추천했는데, 상차 소요는
     *    짐 양에 따라 변하는 값이라 신고할 때마다 약속이 흔들렸다 (실측: 40박스 → 갑자기 지각).
     */
    it('🔴 추천 칸은 도착 예상 + 30분 — 상차 소요를 약속에 섞지 않는다', () => {
        const fn = sheet().slice(sheet().indexOf('const suggestedSlot'));
        expect(fn.slice(0, 2600)).toMatch(/nearestSlot\(slotAnchor, arrivalMs\)/);
        expect(fn.slice(0, 2600)).not.toMatch(/arrivalMinutes \+ \(isPickup \? dwell : 0\)/);
    });

    /**
     * 🔄 **다시 "가장 가까운 칸"으로** (2026-08-19) — 두 번 뒤집힌 자리라 경위를 남긴다.
     *
     *   08-16 ①  "가장 가까운 칸"으로 바꿈 (마감 10:36 인데 11:06 을 추천해서)
     *   08-16 ②  되돌림 — 진짜 원인이 설계가 아니라 **초**였다
     *            (`setSeconds(0,0)` 로 10:35:00 칸이 마감 10:35:17 앞에서 17초 모자라 탈락)
     *   08-19 ③  **다시 "가장 가까운 칸"** — 이번엔 원인이 다르다
     *
     * 🔴 08-19 에 격자를 **:00 / :30 경계**로 옮겼다 (중복 칸 문제 — 버그 대장 #23).
     *    옛 격자는 `지금 + 주행` 에서 시작해 목표와 칸이 거의 일치했다 — 그래서
     *    "이후 첫 칸"이 맞았다. 새 격자는 목표와 칸이 **최대 29분** 벌어진다.
     *    **격자를 바꾸면서 그 격자에 의존하던 규칙을 안 바꾼 것이다.**
     *    실측: 도착 예상 17:02 + 여유 30분 = 17:32 → `18:00` (74분 뒤)이 눌렸다.
     *
     * ⚠️ 08-16 의 우려("지킬 수 없는 약속")는 그대로 지킨다 — `nearestSlot` 은
     *    **도착 예상 이후의 칸**만 후보로 삼는다. 17:30 은 도착 예상(17:02)보다 뒤라
     *    안전하고, 여유가 30 → 28분으로 줄 뿐이다 (여유는 애초에 근사값이다).
     */
    it('🔴 목표에 가장 가까운 칸 · 도착 예상보다 이른 칸은 후보가 아니다', () => {
        const src = sheet();
        const fn = src.slice(src.indexOf('const nearestSlot'), src.indexOf('}, [driveKnown'));
        expect(fn).toMatch(/Math\.abs/);            // 가장 가까운 것을 고른다
        expect(fn).toMatch(/notBeforeMs/);          // 도착 예상이 하한
        expect(fn).toMatch(/floorMin/);             // 초는 여전히 버리고 비교한다 (08-16 교훈)
    });

    it('🔴 근거 줄이 **기준 시각**을 함께 적는다 (추천 칸과 다를 수 있다)', () => {
        expect(sheet()).toMatch(/이라 가장 가까운/);
    });

    it('🔴 기사님이 누르시면 추천이 아니라 **확정**이 된다', () => {
        expect(sheet()).toMatch(/deadlineTouched/);
        expect(sheet()).toMatch(/setDeadlineTouched\(true\)/);
    });

    it('🔴 미리 채운 값에는 근거를 남긴다 (누르시면 사라진다)', () => {
        expect(sheet()).toMatch(/!deadlineTouched && deadlineAt/);
        expect(sheet()).toMatch(/눌러 뒀습니다/);
    });

    /**
     * 🧾 **내역이 없으면 계산을 확인할 수 없다** (기사님 실측 2026-08-19)
     *
     * *"콜 잡은 시간 17:14:44, 상차지 18:00 이면 대략 46분 후 출발이어야 하는데
     * 30분으로 나온다. 예전 코드인 거야 아님 안 바뀐 거야?"* — 30분이 맞았다
     * (`18:00 − 접근 주행 15분 = 17:45`). 화면이 그 15분을 안 적어서 확인할 길이 없었다.
     *
     * ⚠️ **분기마다 빼는 값이 다르다** — 그래서 문구는 `detail` 이 만들어 온다:
     *      타임라인(지금 돌고 있는 것) — `주행 N` (+ 앞 정차) · 약속은 **도착** 시각이라
     *                                    이 정거장의 정차는 뺄셈에 없다 (규칙 ⑤-5)
     *      폴백(경로 순서 없음)        — `주행 N, 상차 M` · 옛 규칙(마감 = 실어 보내는 시각)
     */
    /**
     * 🕒 **도착 예상은 하나다** (2026-08-20 실측)
     *
     * 통화 시트가 도착 예상을 **여섯 곳에서 따로** 만들고 있었고, 기준마저 두 가지였다 —
     * 칸은 `slotBaseMs.current`(시트 연 시각, 고정), 문구는 `Date.now()`(매 렌더 흐름).
     * 그래서 **칸은 멈춰 있는데 문구의 도착 예상만 계속 늘어났다.**
     *
     * 🔴 더 큰 문제는 **기준 시각이 틀렸다**는 것이다. `driveMinutes`·`leadMinutes` 는
     *    경로를 계산한 시각(`routeComputedAt`, 닻)부터 잰 값인데, 시트는 그걸
     *    **시트를 연 시각**에 더했다. 실측 로그: `기준 18:20:03 · 닻 18:17:26` —
     *    2분 37초가 통째로 밀렸고, 시트를 늦게 열수록 더 벌어진다.
     *
     * → 타임라인이 이미 만든 `etaMs` 를 **그대로 받는다.** 시트는 다시 더하지 않는다 (규칙 ③).
     */
    it('🔴 도착 예상을 시트가 다시 계산하지 않는다 — 타임라인의 etaMs 를 받는다', () => {
        const c = sheet();
        expect(c).toMatch(/etaMs\?:\s*number \| null/);       // Props 로 받는다
        expect(c).toMatch(/const arrivalMs = etaMs \?\?/);     // 파생은 한 곳
        // 여섯 곳에 흩어져 있던 옛 계산이 한 곳(폴백)으로 모였는지
        expect((c.match(/slotBaseMs\.current \+ arrivalMinutes/g) ?? []).length).toBe(1);
        expect(c).not.toMatch(/Date\.now\(\) \+ arrivalMinutes/);   // 매 렌더 흐르던 기준은 아예 없다
    });

    /**
     * 🏗️ 옛 시트 철거(2026-08-21) — `etaMs` 프롭도 함께 사라졌다.
     * 같은 원칙(도착 예상은 화면이 만들지 않는다)은 더 세게 남았다:
     * 새 단계 화면의 격자 밑값은 **저장된 행의 predicted_at** 이고,
     * 그 값은 출생(시딩)이 타임라인에서 받아 한 번 쓴 것이다.
     */
    it('🔴 카드가 타임라인의 etaMs 를 시트에 넘긴다', () => {
        const sheet = rc3('components/dashboard/StepSheetMock.tsx');
        expect(sheet).toMatch(/r\.predicted_at/);                 // 격자 밑값은 저장된 행
        expect(sheet).not.toMatch(/Date\.now\(\) \+ .*driveMinutes/);  // 화면 계산 금지
    });

    it('🔴 출발 카운트다운이 내역을 적는다 — 그 시각을 만든 뺄셈 그대로', () => {
        const dc = rc3('components/dashboard/DepartureCountdown.tsx');
        expect(dc).toMatch(/\{soonest\.detail\}/);
        expect(dc).toMatch(/주행 \$\{binding\.driveMinutes\}/);
        expect(dc).toMatch(/주행 \$\{t\.approachMinutes\}, 상차 \$\{t\.pickupDwell\}/);
        expect(dc).toMatch(/대기 \$\{soonest\.waitMin\}/);
    });
});

/**
 * 🔴 **이미 상차했으면 출발 시각이 없다** (2026-08-16 검산에서 발견)
 *
 * 예전에는 값을 내놓고 **화면 한 곳**(`DepartureCountdown` 의 `index >= 4`)이 막고 있었다.
 * 막는 곳이 하나뿐이면 다른 화면이 그 값을 쓰는 순간 잘못된 카운트다운이 뜬다.
 */
describe('상차를 마친 콜', () => {
    it('🔴 출발 시각을 값 만드는 자리에서 null 로 낸다', () => {
        const tm = codeOnly(readFileSync(
            join(__dirname, '../../../shared/src/timing.ts'), 'utf8'));
        expect(tm).toMatch(/const departureAt = pickedUp\s*\?\s*null/);
    });
});

/**
 * 🔴 **앱이 한국 시각에 `Z` 를 붙여 보내 9시간이 밀리던 문제** (2026-08-16 실측)
 *
 * 앱의 옛 형식: `yyyy-MM-dd'T'HH:mm:ss'Z'` — 폰 시간대(KST)로 찍고 **글자 `Z`(=UTC)를 그냥 붙임.**
 * 서버가 UTC 로 읽으니 09:10 KST 가 18:10 KST 가 되고, 상차 마감이 19:10 이 되어
 * 화면에 **"대기 572분"**(맞게는 32분)이 떴다.
 *
 * 앱은 `XXX`(→`+09:00`)로 고쳤지만 **재설치 전까지 옛 앱이 계속 보내고 이미 저장된 값도 있다.**
 */
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
        // 🕒 도착 약속(+13 접근 +30 여유) + 상차 미확인 15분 = 완료 (기사님 2026-08-18 개정 규칙)
        expect(결과[0]).toBe(new Date(new Date('2026-08-16T09:10:12+09:00').getTime() + (13 + 30 + 15) * 60_000).toISOString());
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

/**
 * 🔴 **주행을 몰라도 칸을 추천한다** (2026-08-16)
 *
 * 합짐 콜은 병합 궤적이 **마지막 콜 하나에만** 실려(`pickRouteHolder`) 나머지는 주행 시간이 비어 있다.
 * 그래서 기사님이 합짐 통화 화면에서 **빈 버튼 줄**을 보셨다.
 * 상차 마감은 주행과 무관하므로(`콜 잡은 시각 + 60분`) 그 값으로 고를 수 있다.
 */
describe('통화 시트 — 주행을 몰라도 추천한다', () => {
    const CLIENT4 = join(__dirname, '../../../client-app/src');
    const rc4 = (rel: string) => codeOnly(readFileSync(join(CLIENT4, rel), 'utf8'));

    it('🔴 주행을 모르면 서버가 만든 상차 마감으로 고른다', () => {
        const sheet = rc4('components/dashboard/StopCallSheet.tsx');
        const fn = sheet.slice(sheet.indexOf('const suggestedSlot'));
        expect(fn.slice(0, 900)).toMatch(/if \(!driveKnown\)/);
        expect(fn.slice(0, 900)).toMatch(/pickupDeadlineAt/);
    });

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
        expect(seeder).toMatch(/pickupOffsetMin \?\? 60/);
    });

    /**
     * 🔴 「이어서 — 하차지도 지금 정하기」 블록을 **뺐다** (기사님 2026-08-18):
     *    *"통화 완료를 누르면 바로 다음 하차지 통화로 나올 건데, 한 화면에 중복으로
     *    표현할 필요가 없어 보인다."* 시퀀스가 이미 다음 단계로 데려간다 (규칙 ⑥).
     *    그래서 상차 정차를 두 번 더하는지 검사할 대상 자체가 사라졌다.
     */
    it('상차지 통화에 하차지 시각 블록이 없다 — 단계를 한 화면에 겹치지 않는다', () => {
        expect(rc4('components/dashboard/StopCallSheet.tsx')).not.toMatch(/이어서 — 하차지도 지금 정하기/);
    });
});
