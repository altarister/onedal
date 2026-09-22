import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🕐 **시각을 어떻게 그리는가** — 원천은 이 검사다 (기사님 확정).
 *
 * 접힌 줄은 **상·하차를 한 줄에 나란히 놓는 격자**다 — 칸마다 뜻이 정해져 있어 자리가 곧 이름이다:
 *
 * ```
 * [번호][지명][약속][±][예상] │ [번호][지명][약속][±][예상]
 *   1  갈마동 03:15 −13 03:02 │  2  성거읍 05:27  +8 05:35
 * ```
 *   · 번호 — 몇 번째로 가는 정거장인가 (`stopNoOf` 하나가 원천) · 없으면 `?`
 *   · 약속 — 그 시각까지 가기로 한 것. 통화로 정했으면 보라 · 없으면 `--:--`
 *   · ± — 약속과 견준 값. 늦으면 `+N`(노랑), 이르면 `−N`(회색) · 없으면 빈칸
 *   · 예상 — 지났으면 도착, 아직이면 예상 · 없으면 `--:--`
 *   기사님: *"22:14에 도착해야 하는데 +24가 걸려서 22:37에 도착 예정"* — «약속 → ± → 예상»이 한 문장으로 읽힌다.
 *   다녀온 정거장에도 약속이 남는다 (`초월읍 2:20 → 2:33 다녀옴`).
 *
 * ── 왜 검사가 필요한가 ──
 *
 * 모양을 정해 놓고 코드가 딴 데로 가면 화면이 두 말을 한다:
 *   · `신둔면 ~03:15 +5분` — 「5분 밀렸다」면서 03:15 는 안 밀린 값
 *   · 카드 줄은 카카오 구간 ETA(정차 없음), 덱은 타임라인(정차 있음)
 *
 * 🔴 **그래서 모양을 검사로 잠근다.**
 *    그래서 위 격자를 여기서 잠근다 — 화면이 격자와 다르면 빨간불.
 */

const 벗긴다 = (p: string) => {
    try {
        return readFileSync(join(__dirname, p), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    } catch { return ''; }
};
const 덱 = 벗긴다('../../../client-app/src/components/dashboard/CallDeck.tsx');
const 카드 = 벗긴다('../../../client-app/src/components/dashboard/PinnedRouteCard.tsx');
import { stopTimeOfRecords } from '@onedal/shared';

describe('🕐 접힌 줄 — 안 C (기호로만)', () => {
    /** 🔴 이게 안 C 와 안 B 를 가르는 줄이다 */
    /**
     * 🔄 **타이틀은 「격자」다** (기사님: *"그냥 목업처럼 해"*).
     *    원천은 파일 머리의 격자다. ± 칸은 밀린 분을 숫자로 적는다 —
     *    기사님이 실험실에서 «약속 → ± → 예상»이 **한 문장으로 읽힌다**고 확정했다.
     */
    it('🔴 타이틀은 **격자**다 — 칸마다 뜻이 정해져 자리가 곧 이름이다', () => {
        expect(덱).toMatch(/gridTemplateColumns/);
    });

    it('🔴 ± 를 **숫자로** 적는다 — 되돌아보지 않게 (0905 의 기호 규칙은 폐기)', () => {
        expect(덱).toMatch(/diff > 0 \? `\+\$\{diff\}`/);
    });

    it('🔴 약속과 견준 값이다 — 지났든 아니든 **같은 셈법** (규칙 ③)', () => {
        expect(덱).toMatch(/real[\s\S]{0,80}promised[\s\S]{0,80}60000/);
    });

    it('🔴 통화로 정한 약속은 **색**이 말한다 — 글자를 더하면 격자가 깨진다', () => {
        expect(덱).toMatch(/confirmed\('pickup'\)|promiseConfirmed|confirmed\(/);
        expect(덱).toMatch(/PROMISE_CALLED|text-accent-alt/);
    });

    it('🔴 지나간 정거장은 **회색**이다 — 시선을 안 뺏는다', () => {
        expect(덱).toMatch(/gone/);
        expect(덱).toMatch(/text-text-muted/);
    });

    it('🔴 마지막 칸이 **결론**이다 — 지났으면 도착, 아직이면 예상', () => {
        expect(덱).toMatch(/passedAt|goneAt|arrivedAt/);
    });
});

describe('🕐 색은 판정·지도와 겨루지 않는다', () => {
    /**
     * 🔴 지도가 이미 상차=초록 · 하차=빨강을 쓰고, 판정이 🔵🟢🟡🔴 을 쓴다.
     *    시각의 **움직임**에까지 초록·빨강을 쓰면 무엇의 색인지 헷갈린다 (규칙 ⑤-3).
     */
    /** 🔄 ± 칸도 같은 색 규칙이다 — 초록·빨강을 쓰지 않고 늦음만 노랑이다 */
    it('🔴 ± 에 초록/빨강을 쓰지 않는다 — 늦음만 노랑이다', () => {
        const i = 덱.indexOf('diff > 0 ?');
        const 조각 = 덱.slice(Math.max(0, i - 320), i + 320);
        expect(조각).not.toMatch(/text-success/);
        expect(조각).not.toMatch(/text-danger/);
        expect(조각).toMatch(/text-warning/);
    });
});

describe('🕐 격자의 ± 칸이 코드에 있다', () => {
    it('덱이 약속과 견준 차이(± 칸)를 그린다', () => {
        expect(덱).toMatch(/diff/);
    });
});

/**
 * 🕐 **펼친 카드의 상차·하차 줄은 타이틀을 되풀이하지 않는다** (기사님 확정)
 *
 * 기사님: *"타이틀하고 중복인 것 같은데 이걸 지우고 타이틀에 다 표현할 수 있지?"*
 * 그리고 *"버퍼와 착불은 남겨 주고 나머지는 목업과 같이 해 줘."*
 *
 * 콜 줄(타이틀)은 **양쪽 시각을 다 그린다** — `① 초월읍 ~23:23 → ③ 신둔면 ~00:38`.
 * 그래서 펼친 줄에 약속·차이만 적으면 중복이다:
 *   · 바뀌기 전 시각(취소선)은 **지나간 값**이다 — 지금 몇 시인지만 알면 된다
 *   · «달라졌나»는 **색과 기호**가 답한다 (접힌 줄의 `▲▼` · 안 C)
 *   · 몇 분인지는 심사 중이면 **심사석 위 한 줄**이 이미 말한다 (규칙 ③)
 *
 * 🔴 **안 C(접힌 줄)는 그대로다** — 위 describe 가 계속 지킨다.
 */
describe('🕐 펼친 카드의 상차·하차 줄 — **제 몫이 있을 때만** (0911 재개정)', () => {
    /**
     * 🔴 **줄은 자격이 있을 때만 만든다** (기사님 지시).
     *
     * 지도 실험실(`MapMockup.tsx`)은 그 줄에 **타이틀에 없는 둘**을 넣는다:
     *   · **구간 거리·분** — 그 정거장으로 들어오는 구간 (`9.4km·21분`)
     *   · **밀림 내역** — 누가 밀었나 (`└ 합짐2 경유  +7분`)
     * 기사님: *"목업에서 열리면 보이는 컨텐츠 상하차 부분은 가지고 가서 기존 거에 더하고 싶어."*
     *
     * 줄을 만들어도 되지만, 만들었다면 **타이틀이 못 하는 말을 해야 한다.**
     * 약속만 되풀이하는 줄은 중복이다.
     */
    /**
     * 펼침 상·하차 블록이 있나 — 있으면 아래 두 자격을 묻는다.
     * 🔴 **부품 이름(진짜 코드)으로 찾는다** — `벗긴다` 가 주석을 걷어내므로
     *    주석에 표식을 적어 두는 것으로는 이 검사를 만족시킬 수 없다 (일부러 그렇다).
     */
    const 블록있다 = /function StopDetailBlock/.test(카드);

    it('🔴 줄을 만들었다면 **구간 거리·분**을 적는다 — 타이틀에 없는 것', () => {
        if (!블록있다) return;                       // 안 만들었으면 이 검사는 할 말이 없다
        expect(카드).toMatch(/StopDetailBlock[\s\S]{0,3000}legKm/);
        expect(카드).toMatch(/StopDetailBlock[\s\S]{0,3000}legMin/);
    });

    /**
     * 🔴 접힌 줄은 밀림을 **기호(▲▼)로만** 말한다 (위 describe 가 지킨다).
     *    그래서 «몇 분 밀렸나»는 펼침에만 있는 정보다 — 그것이 이 줄의 두 번째 자격이다.
     * ⚠️ **원인별 내역**(`└ 합짐2 경유 +7분`)은 이 줄에 아직 없다 —
     *    이 줄이 `shared` 의 `impactOfStop` 을 부르게 되면 이 검사를 한 번 더 조인다.
     */
    it('🔴 줄을 만들었다면 **밀린 분**을 적는다 — 접힌 줄은 기호로만 말한다', () => {
        if (!블록있다) return;
        expect(카드).toMatch(/StopDetailBlock[\s\S]{0,3000}shiftMin/);
    });

    it('🔴 왜 이 줄이 자격을 얻었는지가 코드에 남아 있다 — 다음 사람이 또 철거하지 않게', () => {
        const 원문 = readFileSync(join(__dirname,
            '../../../client-app/src/components/dashboard/PinnedRouteCard.tsx'), 'utf8');
        expect(원문).toMatch(/PromiseLines[\s\S]{0,200}철거/);      // 0905 의 기록은 남긴다
        // 🔴 이유는 **부품 바로 위**에 있어야 한다 — 멀리 떼어 놓으면 다음 사람이 못 본다
        if (블록있다) expect(원문).toMatch(/타이틀에 없는 둘[\s\S]{0,600}function StopDetailBlock/);
    });

    it('⚠️ 접힌 줄의 기호(안 C)는 살아 있다 — 그것이 «틀어졌나»의 답이다', () => {
        expect(덱).toMatch(/shift > 0 \? '▲' : '▼'/);
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 🔴 **시각을 만드는 네 곳은 같은 재료를 쓴다**
 *
 * `deriveRouteTimeline` 은 제품에서 **네 곳**이 부른다. 실측 정차를
 * **한 곳만** 넘기면 이렇게 된다:
 *
 * ```
 * 덱·카드          3:20      ← 실측 19분을 봄
 * 출발 카운트다운   3:15      ← 못 봄
 * ```
 *
 * 🔴 한 곳만 다르면 같은 정거장에 두 시각이 뜬다 — 「두 목소리」다.
 *
 * ⚠️ 이 검사는 **글자를 본다.** 다섯 번째 호출부가 생겨도 잡히게 하려는 것이라 그렇다.
 *    (타입으로 강제하려면 필수 인자로 바꿔야 하는데, 검사 호출부 수십 곳이 함께 깨진다)
 */
describe('🕐 시각을 만드는 네 곳이 같은 재료를 쓴다', () => {
    const 제품 = [
        '../../src/core/engine/OrderEvaluator.ts',
        '../../src/socket/socketHandlers.ts',
        '../../../client-app/src/components/dashboard/DepartureCountdown.tsx',
        '../../../client-app/src/hooks/useRouteDerivations.ts',
    ];
    /** 호출 한 덩어리를 통째로 떠온다 — 인자가 여러 줄에 걸쳐 있다 */
    const 호출들 = (src: string) => {
        const out: string[] = [];
        let i = src.indexOf('deriveRouteTimeline(');
        while (i !== -1) {
            let depth = 0, j = src.indexOf('(', i);
            for (let k = j; k < src.length; k++) {
                if (src[k] === '(') depth++;
                else if (src[k] === ')' && --depth === 0) { out.push(src.slice(i, k + 1)); j = k; break; }
            }
            i = src.indexOf('deriveRouteTimeline(', j + 1);
        }
        return out;
    };

    /** 🔴 파일이 옮겨지면 «검사가 아무것도 안 보고 통과»한다 — 먼저 그것부터 막는다 */
    it('🔴 네 곳이 다 제자리에 있고 실제로 부르고 있다', () => {
        for (const p of 제품) {
            expect(벗긴다(p)).not.toBe('');
            expect(호출들(벗긴다(p)).length).toBeGreaterThan(0);
        }
    });

    it.each(제품)('🔴 %s 가 실측 정차(장부)를 넘긴다', (p) => {
        for (const c of 호출들(벗긴다(p))) {
            expect(c).toMatch(/[dD]wellLedger/);
        }
    });

    /**
     * 🔴 판정 기준 탭의 정차 일반값(`unk`)도 네 곳이 함께 넘긴다 —
     *    한 곳만 빠지면 **같은 두 목소리**가 된다.
     */
    it.each(제품)('🔴 %s 가 판정 기준의 정차 일반값(unk)도 넘긴다', (p) => {
        for (const c of 호출들(벗긴다(p))) {
            expect(c).toMatch(/unk/);
        }
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 🔴 **끝난 것의 시각은 경로가 아니라 장부에서 읽는다** (기사님 발견)
 *
 * 다녀온 정거장은 경로에서 빠지고 끝난 콜은 통째로 빠진다 — 순번도 시각도
 * **지금 경로**에서만 찾으면 `?. 초월읍 약속?` 처럼 물음표만 남는다. 장부에는 다 있다.
 */
describe('🕐 끝난 정거장도 시각을 잃지 않는다', () => {
    const 신고 = (stopType: string, at: string) =>
        ({ stopType, kind: 'DECLARED', promisedArrivalAt: at }) as any;

    it('🔴 실제로 간 시각이 가장 세다', () => {
        const t = stopTimeOfRecords(
            [신고('pickup', '2026-08-30T02:20:00Z')],
            [{ milestone: 'ARRIVED_PICKUP', occurredAt: '2026-08-30T02:33:00Z' }],
            'pickup');
        expect(t).toEqual({ ms: Date.parse('2026-08-30T02:33:00Z'), kind: 'actual' });
    });

    it('아직 안 갔으면 통화로 굳힌 약속을 쓴다', () => {
        const t = stopTimeOfRecords([신고('pickup', '2026-08-30T02:20:00Z')], [], 'pickup');
        expect(t).toEqual({ ms: Date.parse('2026-08-30T02:20:00Z'), kind: 'confirmed' });
    });

    it('🔴 둘 다 없으면 null 이다 — 지어내지 않는다 (규칙 ④)', () => {
        expect(stopTimeOfRecords([], [], 'pickup')).toBeNull();
    });

    it('상차·하차를 섞지 않는다', () => {
        expect(stopTimeOfRecords([신고('dropoff', '2026-08-30T03:15:00Z')], [], 'pickup')).toBeNull();
    });

    it('🔴 카드가 경로에 없으면 장부로 폴백한다 — 머리 줄과 펼친 블록 둘 다', () => {
        expect((카드.match(/stopTimeOfRecords/g) ?? []).length).toBeGreaterThanOrEqual(2);
        expect(카드).toMatch(/fromRoute\?\.pickupEta \?\?/);
    });
});

/**
 * 👣 **다녀온 정거장도 약속 시각을 잃지 않는다** (기사님 실측)
 *
 * 펼친 카드 예시가 `초월읍 2:20 → 2:33 다녀옴` 이다 (머리 격자) — 다녀온 곳에도 약속이 남는다.
 * 목업(`MapMockup.tsx`)도 지나간 정거장의 `promisedAt` 을 그대로 두고 «예상»만 비운다.
 *
 * 🔴 덱이 경로 시간표(`timeline`)에서만 약속을 찾으면, 다녀온 정거장은 **시간표에서 빠져**
 *    `1 초월읍 --:-- 16:01` 처럼 빈다. 그래서 시간표에 없는 정거장이면 콜 자체의 약속
 *    (`deriveCallTiming`)을 쓴다 — 시간표가 통째로 빌 때만이 아니다.
 */
describe('👣 다녀온 정거장의 약속', () => {
    it('🔴 덱은 시간표에 없는 정거장이면 콜 자체의 약속을 쓴다 — 시간표가 통째로 빌 때만이 아니다', () => {
        expect(덱).not.toMatch(/timeline\.length\s*\?\s*null\s*:\s*deriveCallTiming/);
        expect(덱).toMatch(/deriveCallTiming\(/);
    });
});
