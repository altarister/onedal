import { readFileSync } from "fs";
import { initGeoService, looksLikePlaceName } from "../../src/services/geoService";
import { join } from "path";
import { scoreMerge, rampDown, DEFAULT_JUDGMENT, describeJudgment, parseCapturedAt, deriveCallTiming } from "@onedal/shared";
import { DWELL_UNKNOWN_PICKUP_MINUTES, DWELL_UNKNOWN_DROPOFF_MINUTES, allowedDetourMinutes, dwellMinutes } from "@onedal/shared";

const SERVER = join(__dirname, "../../src");
const read = (rel: string) => readFileSync(join(SERVER, rel), "utf8");
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** 그날 실제로 있었던 콜 — 요금 99,000원 · 우회 +1.1km · 주행 +6분 */
const 그날의콜 = {
    driveDiffMin: 6, detourKm: 1.1,
    dwellMin: DWELL_UNKNOWN_PICKUP_MINUTES + DWELL_UNKNOWN_DROPOFF_MINUTES,  // 25분
    dwellAssumed: true,
    slackMin: null,                       // 통화 전이라 마감을 모른다
    slotsFree: 3, slotsTotal: 5,
};

/**
 * 🔴 **꿀콜이 똥으로 표시되던 문제** (2026-08-15 실측)
 *
 * 기사님: *"'99,000원짜리 콜이 1.1km 우회로 붙는데 똥입니다.' 이걸 이야기 하는 거였어."*
 *
 * 서버 로그가 그대로 말해 준다:
 * ```
 * 👍 장점: 차종 일치 | 도착지 회랑 적중 | 우회거리(+1.1km) 양호 🍯
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
        expect((DEFAULT_JUDGMENT.unknown as any).slackMin).toBeUndefined();
        expect(DEFAULT_JUDGMENT.unknown.pickupOffsetMin).toBe(60);
        expect(DEFAULT_JUDGMENT.unknown.restMarginMin).toBe(30);
    });

    it('🔴 여유를 셀 근거가 없으면 그 요소를 색에서 뺀다 (지어내지 않는다)', () => {
        const v = scoreMerge({ ...그날의콜, slackMin: null });
        const part = v.parts.find(p => p.name === '마감 여유')!;
        expect(part.assumed).toBe(true);
        expect(part.weight).toBe(0);          // 색에 영향을 주지 않는다
        expect(part.raw).toContain('모름');
    });

    it('🔴 마감을 정했는데 이미 늦었으면 합짐을 막는다', () => {
        const v = scoreMerge({ ...그날의콜, slackMin: -20 });
        expect(v.color).toBe('똥');
        expect(v.blocked).toContain('20분');
        expect(v.blocked).toContain('마감');
    });

    it('여유가 0 이어도 "모름"과 섞이지 않는다', () => {
        const zero = scoreMerge({ ...그날의콜, slackMin: 0 });
        const unknown = scoreMerge({ ...그날의콜, slackMin: null });
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

    it('🔴 재탐색이 자기 숫자를 갖지 않는다', () => {
        const en = codeOnly(read('services/dispatchEngine.ts'));
        expect(en).toMatch(/scoreMerge\(\{/);
        expect(en).not.toMatch(/distDiffKm\)\s*>\s*10/);
        expect(en).not.toMatch(/timeDiffMin\)\s*>\s*30/);
    });

    it('🔴 상하차 일반값을 코드가 직접 쓰지 않는다 (dwellMinutes 가 정한다)', () => {
        expect(dwellMinutes(null, 0, 'pickup')).toBe(DWELL_UNKNOWN_PICKUP_MINUTES);
        expect(dwellMinutes(null, 0, 'dropoff')).toBe(DWELL_UNKNOWN_DROPOFF_MINUTES);
        expect(dwellMinutes('지게차', 0)).toBe(10);   // 아는 방법은 그대로
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

    it('🔴 상차지는 **상차 정차까지** 포함해 추천한다 (실어 보내는 시각)', () => {
        const fn = sheet().slice(sheet().indexOf('const suggestedSlot'));
        expect(fn.slice(0, 1400)).toMatch(/arrivalMinutes \+ \(isPickup \? dwell : 0\)/);
    });

    /**
     * 🔴 **마감 이상인 첫 칸이 아니라 가장 가까운 칸** (2026-08-16 수정).
     *    칸이 30분 간격이라 마감이 칸을 1분만 넘겨도 다음 칸(30분 뒤)으로 밀렸다 —
     *    마감 10:36 인데 `11:06` 을 추천하고, 근거 줄은 *"콜 잡은 시각 + 1시간 기준"* 이라
     *    적혀 **사실과 달랐다** (기사님 화면에서 실측).
     */
    /**
     * 🔴 **기준 이상인 첫 칸**이어야 한다. 그보다 이른 칸은 **지킬 수 없는 약속**이다 —
     *    주행 20 + 상차 15 = 35분이 필요한데 30분 뒤 칸을 부르면 5분 늦는다.
     *
     * ⚠️ 한 번 `가장 가까운 칸`으로 바꿨다가 되돌렸다(2026-08-16 재검토).
     *    30분 밀리던 진짜 원인은 설계가 아니라 **초**였다 —
     *    `buildArrivalSlots` 가 `setSeconds(0,0)` 로 칸의 초를 0 으로 만들어,
     *    마감 `10:35:17` 앞에서 `10:35:00` 칸이 **17초 모자라** 탈락했다.
     */
    it('🔴 기준 이상인 첫 칸을 고른다 · 초는 버리고 비교한다', () => {
        const src = sheet();
        // 추천 함수 **한 덩어리만** 본다 — 다른 곳의 Math.abs(짐 양 비교)에 걸리지 않게
        const fn = src.slice(src.indexOf('const firstAtOrAfter'), src.indexOf('}, [driveKnown'));
        expect(fn).toMatch(/hourSlots\.find\(sl =>/);
        expect(fn).toMatch(/Math\.floor\(targetMs \/ 60_000\) \* 60_000/);
        expect(fn).not.toMatch(/Math\.abs/);   // 「가장 가까운 칸」이 아니다 — 이른 칸은 못 지킨다
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

    it('🔴 출발 카운트다운이 내역을 적는다 — 주행·상차·대기', () => {
        const dc = rc3('components/dashboard/DepartureCountdown.tsx');
        expect(dc).toMatch(/주행 \{soonest\.driveMin\}/);
        expect(dc).toMatch(/상차 \{soonest\.dwellMin\}/);
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
        expect(결과[0]).toBe(new Date('2026-08-16T10:10:12+09:00').toISOString());
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
    it('🔴 시트의 key 에 콜 id 가 들어간다', () => {
        const card = rc4('components/dashboard/PinnedRouteCard.tsx');
        const at = card.indexOf('<StopCallSheet');
        expect(at).toBeGreaterThan(-1);
        const props = card.slice(at, at + 300);
        expect(props).toMatch(/key=\{`\$\{route\.id\}:\$\{shownStep\.id\}`\}/);
    });

    it('🔴 카드가 그 값을 넘긴다', () => {
        expect(rc4('components/dashboard/PinnedRouteCard.tsx'))
            .toMatch(/pickupDeadlineAt=\{timing\.pickupDeadlineAt\}/);
    });

    it('🔴 「이어서」 블록이 상차 정차를 두 번 더하지 않는다', () => {
        const sheet = rc4('components/dashboard/StopCallSheet.tsx');
        expect(sheet).toMatch(/const loadDoneMs = new Date\(deadlineAt\)\.getTime\(\);/);
        expect(sheet).not.toMatch(/loadDoneMs = new Date\(deadlineAt\)\.getTime\(\) \+ dwell/);
        expect(sheet).toMatch(/실어 보냄/);
    });
});

/**
 * 🔴 **앱이 화면 글자를 지명으로 읽어 보내던 것을 서버가 잡는다** (2026-08-16 실측)
 *
 * ```
 *   ⏱️ [1차 선빵 수신] 계산서필 ➡️ 카톤
 * ```
 * `계산서필`(=세금계산서필요) · `카톤`(=카톤박스) 은 **적요 텍스트 조각**이지 지명이 아니다.
 * 관제탑 카드에 `계산서필 → 카톤` 이 뜨고 차종이 `다`(=다마스 조각)로 찍혔다.
 *
 * 근본 해결은 앱 파서지만 **재설치가 필요**하다. 서버에는 전국 읍면동·자치구 1239개가 이미
 * 메모리에 있으니 그 사전과 대조해 즉시 막는다.
 *
 * ⚠️ **콜을 버리지는 않는다** — 규칙 ①(콜의 주인은 기사님이다).
 *    2차 상세가 오면 제대로 된 주소로 덮인다. 그때까지 "모른다"고 적을 뿐이다.
 */
describe('지명이 아닌 글자를 걸러낸다', () => {

    beforeAll(() => { initGeoService(); });

    it('🔴 실재 지명은 통과한다 (번지·건물명이 섞여도)', () => {
        for (const t of ['경기 광주시 경안동 165-15 농협', '송정동', '금촌동', '탄현면', '경기 파주시'])
            expect(looksLikePlaceName(t)).toBe(true);
    });

    it('🔴 화면 글자·적요 조각은 걸러낸다', () => {
        for (const t of ['계산서필', '카톤', '다', '전표', '신규', '박스', '상세 정보 없음', '미상', '', null])
            expect(looksLikePlaceName(t)).toBe(false);
    });

    /**
     * ⚠️ 변이 테스트로 확인한 것 — 위 검사만으로는 **함수를 통째로 `return true` 로 바꿔도**
     *    잡히지 않았다(다른 케이스가 가려 줬다). 두 방향을 **한 검사 안에서** 함께 본다.
     */
    it('🔴 통과와 차단이 **둘 다** 성립한다 (한쪽만 보면 함수를 무력화해도 안 잡힌다)', () => {
        const 통과 = ['경기 광주시 경안동 165-15', '경안동', '판교역로 146'];
        const 차단 = ['계산서필', '카톤', '전표'];
        expect(통과.every(t => looksLikePlaceName(t))).toBe(true);
        expect(차단.some(t => looksLikePlaceName(t))).toBe(false);
    });

    /**
     * 🔴 **멀쩡한 주소를 막으면 더 큰 사고다.** 재검토(2026-08-16)에서 `판교역로 146` 처럼
     *    시/도·동 없이 오는 **도로명 주소**가 막히는 것을 발견해 규칙을 넓혔다.
     *    화면이 *"주소를 못 읽었다"* 고 거짓말하느니 통과시킨다 —
     *    막아야 할 글자들은 `로`·`길` + 번지 표식이 없다.
     */
    it('🔴 시/도·동이 없는 도로명 주소도 통과한다', () => {
        for (const t of ['판교역로 146', '테헤란로 152 강남파이낸스센터', '경충대로 2170'])
            expect(looksLikePlaceName(t)).toBe(true);
    });

    it('🔴 선빵 수신에서 걸러 표시를 바로잡는다 (콜은 안 버린다)', () => {
        const o = codeOnly(read('routes/orders.ts'));
        expect(o).toMatch(/looksLikePlaceName\(v\)/);
        expect(o).toMatch(/주소 확인 중/);
    });

    it('🔴 2차 상세도 `미상` 만 보지 않는다', () => {
        const d = codeOnly(read('routes/detail.ts'));
        expect(d).toMatch(/!looksLikePlaceName\(pendingOrder\.pickup\)/);
        expect(d).toMatch(/!looksLikePlaceName\(pendingOrder\.dropoff\)/);
    });
});
