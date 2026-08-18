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
        expect(code()).toMatch(/\{km\}주행 \{driveMinutes\}분/);
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

    /** 출발은 "지금 + 상차" — 그래야 출발 + 주행 + 휴게가 도착과 맞물린다 */
    it('하차지 출발 시각 = 지금 + 앞 정거장 작업 시간', () => {
        expect(code()).toMatch(/const departMs = Date\.now\(\) \+ leadMinutes \* 60_000/);
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
    it('🔴 카드가 시트 주행값을 경로 타임라인에서 뽑는다', () => {
        const card = readFileSync(
            join(__dirname, '../../../client-app/src/components/dashboard/PinnedRouteCard.tsx'), 'utf8');
        expect(card).toMatch(/routeLead/);
        expect(card).toMatch(/timeline/);
    });
});
