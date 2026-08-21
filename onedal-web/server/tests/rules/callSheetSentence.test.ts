import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🗣️ **통화 시트의 문구는 기사님이 실제로 하는 말이어야 한다** (기사님 확정 2026-08-18)
 *
 * 예전 문구: *"지금 출발하면 17:57 도착 · 상차 31분 소요 · 약속까지 대기 30분 가능"*
 * 기사님: *"지금 출발할 것도 아닌데.. 이렇게 쓰는 건 별로인 듯하다."*
 *
 * 기사님이 적어 주신 꼴 (2026-08-18):
 *
 *   상차지   여기서 (이마트 광주점)까지 5.9km · 주행 20분, 대기 30분 = 19:34 도착
 *   하차지   이마트 광주점에서 4분 상차하고 18:34 출발, 93.1km · 주행 109분, 휴게 30분 = 20:23 도착
 *
 * 두 가지가 규칙이다.
 *   ① **갈 곳의 이름을 넣는다** — 통화 상대에게 "거기"는 말이 안 된다.
 *      이름을 모르면 넣지 않는다 (규칙 ④ — 지어내지 않는다).
 *   ② **`출발 + 주행 + 대기 = 도착` 이 화면에서 검산된다.** 항 하나를 빼거나
 *      기준 시각을 다른 데서 끌어오면 등식이 깨지고 **화면이 조용히 거짓말한다.**
 */
const sheet = () => readFileSync(
    join(__dirname, '../../../client-app/src/components/dashboard/StopCallSheet.tsx'), 'utf8');

/** 주석(예전 문구를 왜 버렸는지 적어 둔 곳)은 검사 대상이 아니다 */
const code = () => sheet().split('\n')
    .filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l))
    .join('\n');

describe('통화 시트 문구 — 지금 출발한다고 가정하지 않는다', () => {
    it('🔴 "지금 출발하면" 을 화면에 쓰지 않는다', () => {
        expect(code()).not.toMatch(/지금 출발하면/);
    });

    it('상차지는 "여기서 (이름)까지 … = … 도착" 으로 읽힌다', () => {
        const c = code();
        expect(c).toMatch(/여기서 \{contactName \?/);
        expect(c).toMatch(/\{' = '\}/);
    });

    it('🔴 갈 곳의 이름을 넣는다 — 통화 상대에게 "거기"는 말이 안 된다', () => {
        // 이름이 있으면 이름, 없으면 "거기까지" — 지어내지 않는다
        expect(code()).toMatch(/contactName[\s\S]{0,80}거기까지/);
    });

    it('하차지는 앞 정거장 이름·상차·출발 시각으로 시작한다', () => {
        const c = code();
        expect(c).toMatch(/leadFrom \?[\s\S]{0,120}에서/);
        expect(c).toMatch(/출발,/);
    });

    it('주행에는 "주행" 이라고 적는다 — 숫자만 있으면 무슨 분인지 모른다', () => {
        expect(code()).toMatch(/\{km\}주행 \{driveMinutes\}분/);   // 상차지 — 현위치부터
    });

    /**
     * 🔴 **하차지는 누적이 아니라 구간이다** (실측 2026-08-20).
     *    `driveMinutes` 는 닻부터의 누적(129분 = 접근 16 + 단독 113)이라,
     *    "상차지를 떠난 뒤의 주행"에 쓰면 접근 16분을 **두 번** 센다.
     */
    it('🔴 하차지 주행은 구간(segmentDriveMinutes)을 쓴다 — 누적을 쓰면 접근을 두 번 센다', () => {
        const c = code();
        expect(c).toMatch(/const segMin = segmentDriveMinutes \?\? driveMinutes/);
        expect(c).toMatch(/\{km\}주행 \{segMin\}분/);
    });
});

describe('문장이 검산된다 — 출발 + 주행 + 대기 = 도착', () => {
    /**
     * 🔴 도착으로 적는 시각은 **약속(deadlineAt)** 그 자체다.
     *    따로 계산해 적으면 대기 항과 1~2분씩 어긋나 등식이 깨진다.
     */
    it('약속이 있으면 그 시각을 도착으로 적는다', () => {
        expect(code()).toMatch(/const arriveAt = deadlineAt\s*\n?\s*\?\s*hhmm\(deadlineAt\)/);
    });

    /**
     * 🔴 **이 검사가 틀린 계산을 못박고 있었다** (기사님 실측 2026-08-20).
     *
     * 예전 규칙은 *"출발 = 지금 + 상차"* 였다. 그런데 `지금` 은 **시트를 연 시각**이라
     * 열 때마다 값이 달라졌고, 상차지 시트가 말하는 출발(`상차 약속 + 상차`)과
     * **44분** 어긋났다 — 한 화면 안에서 두 시트가 다른 시각을 말했다.
     *
     *   하차지 시트: *"…에서 8분 상차하고 **16:19** 출발, 주행 129분 … = 18:26 도착"*
     *   참값:        *"…에서 8분 상차하고 **17:03** 출발, 주행 113분 … = 18:56 도착"*
     *
     * 이제 **시각을 시트가 만들지 않는다** — 타임라인의 `departPrevMs` 를 그대로 그린다
     * (규칙 ③). 값이 없으면 앞 절을 쓰지 않는다 (규칙 ④ — 지어내지 않는다).
     * 계산 쪽 검사는 `tests/rules/departSentence.test.ts` 에 있다.
     */
    it('🔴 하차지 출발 시각을 시트가 계산하지 않는다 — 타임라인이 준 값을 쓴다', () => {
        expect(code()).not.toMatch(/Date\.now\(\) \+ leadMinutes/);
        expect(code()).toMatch(/departPrevMs != null/);
        expect(code()).toMatch(/hhmm\(new Date\(departPrevMs\)/);
    });

    /** 규칙 ④ — 늦으면 "대기 -30분" 같은 거짓 항을 만들지 않고 늦었다고 적는다 */
    it('약속을 넘기면 대기가 아니라 늦음으로 적는다', () => {
        expect(code()).toMatch(/waitMin < 0 &&[\s\S]{0,160}늦음/);
    });

    /** 주행을 모르면 문장 자체를 만들지 않는다 (0 으로 때우지 않는다) */
    it('주행 미확인이면 시각을 지어내지 않는다', () => {
        expect(code()).toMatch(/driveKnown \?/);
        expect(code()).toMatch(/주행 시간을 아직 모릅니다/);
    });
});

/**
 * 🗺️ **통화 시트도 경로 타임라인을 읽는다** (2026-08-19 실측)
 *
 * 덱 요약 줄은 합짐 하차 ~05:56 을 알고 있는데, 같은 화면의 하차지 통화 시트는
 * "주행 시간을 아직 모릅니다"라며 03:28 같은 **물리적으로 못 지킬 칸**을 추천했다.
 * 한 화면의 두 곳이 다른 세상을 보고 있으면 화면이 거짓말한다 —
 * 카드가 시트에 넘기는 주행·선행 시간도 타임라인에서 온다.
 */
describe('통화 시트 — 경로 타임라인 연결', () => {
    /**
     * 🏗️ 옛 시트(StopCallSheet 렌더)는 철거됐다 (기사님 2026-08-21) — `routeLead` 도 함께.
     * 같은 원칙(시트는 타임라인 값을 그리기만)은 새 단계 화면이 잇는다:
     * 카드가 `departPrevMs`·`segmentDriveMinutes` 를 타임라인에서 뽑아 넘긴다.
     */
    it('🔴 카드가 시트 주행값을 경로 타임라인에서 뽑는다', () => {
        const card = readFileSync(
            join(__dirname, '../../../client-app/src/components/dashboard/PinnedRouteCard.tsx'), 'utf8');
        expect(card).toMatch(/departPrevMs=\{svTl\?\.departPrevMs/);
        expect(card).toMatch(/segmentDriveMinutes=\{svTl\?\.segmentDriveMinutes/);
        expect(card).toMatch(/timeline/);
    });
});

/**
 * ⓘ **추천 근거는 실제 계산과 같은 말을 해야 한다** (2026-08-19 실측)
 *
 * 화면: "주행 4분 + 상차 4분 → 04:09 이라 가장 가까운 04:35 을 눌러 뒀습니다"
 * 실제 계산: 도착 예상(04:05) + 여유 30분 = 04:35 이상인 첫 칸.
 *
 * 04:09에서 04:35가 "가장 가까운" 것도 아니고, 도착 약속의 근거에 상차 소요를
 * 섞어 보여줬다 (약속은 도착 시각 — 상차를 섞지 않는다는 규칙과도 어긋난 표시).
 * 숫자가 우연히 맞아 보여서 더 위험하다 — 근거가 거짓말하면 기사님이 검산을 못 한다.
 */
describe('추천 근거 문구 — 실제 계산 그대로', () => {
    it('🔴 시트 ⓘ 가 "여유 30분"을 말하고, 상차 소요를 근거에 섞지 않는다', () => {
        const c = code();
        expect(c).toMatch(/여유 30분/);
        expect(c).not.toMatch(/\+ 상차 \$\{dwell\}분/);
    });

    it('🔴 카운트다운 추정 설명이 두 시계 기준을 말한다 — 여유30 카피 금지 (⑯)', () => {
        const c = readFileSync(join(__dirname,
            '../../../client-app/src/components/dashboard/DepartureCountdown.tsx'), 'utf8');
        // 숫자는 판정 기준 탭 값을 그대로 말한다 (하드코딩 30·150 금지 — 필터 확정안 구현 1)
        expect(c).toMatch(/상차 시계\(잡음\+잠정 \$\{rules\.pickupOffsetMinutes\}분\)/);
        expect(c).toMatch(/배달 데드라인\(상차 완료\+\$\{rules\.deadlineRatioPct\}%\)/);
        expect(c).not.toMatch(/도착 예상 \+30분/);
    });
});
