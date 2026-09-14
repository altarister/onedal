import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🕐 **시각을 어떻게 그리는가 — 문서가 정한 대로인가** (기사님 확정 2026-08-30)
 *
 * 원천은 docs/지금/시각_표시.md 다.
 * 기사님이 다섯 안을 견주어 골랐다:
 *
 * ```
 * 접힌 줄   안 C — 기호로만        «틀어졌나»만 답한다
 * 펼친 카드  안 A — 화살표로 전부    «원래 몇 시라 했지»를 답한다
 * ```
 *
 * ── 왜 검사가 필요한가 ──
 *
 * 이 화면은 **하루에 두 번** 두 말을 했다:
 *   · `신둔면 ~03:15 +5분` — 「5분 밀렸다」면서 03:15 는 안 밀린 값이었다
 *   · 카드 줄은 카카오 구간 ETA(정차 없음), 덱은 타임라인(정차 있음)
 *
 * 🔴 **모양을 문서로 정해 놓고 코드가 딴 데로 가면 또 그렇게 된다.**
 *    그래서 문서의 표를 여기서 잠근다 — 화면이 표와 다르면 빨간불.
 */

/** 🔴 문서 경로는 **레포 뿌리 기준**으로 적는다 — `audit:docs` ④ 가 그 형태만 검사한다 */
const ROOT = join(__dirname, '../../../..');
const 벗긴다 = (p: string) => {
    try {
        return readFileSync(join(__dirname, p), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    } catch { return ''; }
};
const 덱 = 벗긴다('../../../client-app/src/components/dashboard/CallDeck.tsx');
const 카드 = 벗긴다('../../../client-app/src/components/dashboard/PinnedRouteCard.tsx');
const 문서 = readFileSync(join(ROOT, 'docs/지금/시각_표시.md'), 'utf8');
import { stopTimeOfRecords } from '@onedal/shared';

describe('🕐 접힌 줄 — 안 C (기호로만)', () => {
    /** 🔴 이게 안 C 와 안 B 를 가르는 줄이다 */
    /**
     * 🔄 **개정 2026-09-11 — 「기호」에서 「격자」로** (기사님: *"그냥 목업처럼 해"* · 이식 A2).
     *    원천은 `docs/지금/시각_표시.md` 의 개정 절이다. 0905 의 «밀린 분을 안 적는다»는
     *    폐기됐다 — 기사님이 실험실에서 «약속 → ± → 예상»이 **한 문장으로 읽힌다**고 확정했다.
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
    /** 🔄 0911 — ± 칸이 기호를 대신한다. **색 규칙은 그대로다** (초록·빨강 금지) */
    it('🔴 ± 에 초록/빨강을 쓰지 않는다 — 늦음만 노랑이다', () => {
        const i = 덱.indexOf('diff > 0 ?');
        const 조각 = 덱.slice(Math.max(0, i - 320), i + 320);
        expect(조각).not.toMatch(/text-success/);
        expect(조각).not.toMatch(/text-danger/);
        expect(조각).toMatch(/text-warning/);
    });
});

describe('🕐 문서와 코드가 같은 말을 한다', () => {
    it('문서에 0911 개정(격자)이 적혀 있다 — 화면만 바꾸고 원천을 안 고치는 것을 막는다', () => {
        expect(문서).toMatch(/개정 2026-09-11[\s\S]{0,200}격자/);
        expect(문서).toMatch(/\[번호\]\[지명\]\[약속\]\[±\]\[예상\]/);
    });

    /** 🔴 문서가 칸을 바꾸면 이 줄이 알려 준다 (문서만 고치고 코드를 안 고치는 것) */
    it('문서가 말한 다섯 칸이 코드에도 있다', () => {
        expect(문서).toMatch(/±/);
        expect(덱).toMatch(/diff/);
    });
});

/**
 * 🕐 **개정 2026-09-05 — 펼친 카드의 «안 A» 를 걷어냈다** (기사님 확정)
 *
 * 기사님: *"타이틀하고 중복인 것 같은데 이걸 지우고 타이틀에 다 표현할 수 있지?"*
 * 그리고 *"버퍼와 착불은 남겨 주고 나머지는 목업과 같이 해 줘."*
 *
 * ── 왜 바뀌었나 ──
 * 콜 줄(타이틀)이 이제 **양쪽 시각을 다 그린다** — `① 초월읍 ~23:23 → ③ 신둔면 ~00:38`.
 * 펼친 판의 상차·하차 줄에만 있던 것은 **옛 시각(취소선)과 차이** 둘뿐이었는데:
 *   · 옛 시각은 **지나간 값**이다 — 지금 몇 시인지만 알면 된다
 *   · «달라졌나»는 **색과 기호**가 답한다 (접힌 줄의 `▲▼` · 안 C 는 그대로다)
 *   · 몇 분인지는 심사 중이면 **심사석 위 한 줄**이 이미 말한다 (규칙 ③)
 *
 * 🔴 **안 C(접힌 줄)는 그대로다** — 위 describe 가 계속 지킨다.
 *    바뀐 것은 «펼치면 원래 값도 적는다» 하나뿐이다.
 */
describe('🕐 펼친 카드의 상차·하차 줄 — **제 몫이 있을 때만** (0911 재개정)', () => {
    /**
     * 🔴 **재개정 2026-09-11 — 「금지」에서 「자격」으로** (이식 P2 · 기사님 지시).
     *
     * 0905 에 이 줄을 철거한 이유는 *"타이틀과 중복"* 이었고 **그때는 옳았다** —
     * 그 줄에 있던 것이 약속·차이뿐이라 타이틀이 다 말할 수 있었다.
     *
     * 지도 실험실(`MapMockup.tsx`)이 그 줄에 **타이틀에 없는 둘**을 넣었다:
     *   · **구간 거리·분** — 그 정거장으로 들어오는 구간 (`9.4km·21분`)
     *   · **밀림 내역** — 누가 밀었나 (`└ 합짐2 경유  +7분`)
     * 기사님: *"목업에서 열리면 보이는 컨텐츠 상하차 부분은 가지고 가서 기존 거에 더하고 싶어."*
     *
     * 그래서 **금지를 자격으로 바꾼다** — 줄을 만들어도 되지만, 만들었다면
     * **타이틀이 못 하는 말을 해야 한다.** 약속만 되풀이하는 줄은 여전히 중복이다.
     * ⚠️ 0905 의 판단을 뒤집는 것이 아니다 — 전제(«그 줄엔 새 정보가 없다»)가 바뀐 것이다.
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
     * ⚠️ **원인별 내역**(`└ 합짐2 경유 +7분`)은 아직 실물에 재료가 없다 —
     *    `impactOfStop` 을 shared 로 올리는 A3 에서 이 검사를 한 번 더 조인다.
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
 * 🔴 **시각을 만드는 곳은 넷인데 재료가 하나만 달랐다** (자기 리뷰 2026-08-30)
 *
 * `deriveRouteTimeline` 은 제품에서 **네 곳**이 부른다. 오늘 실측 정차를 물리면서
 * **한 곳만** 고쳤더니 이렇게 됐다:
 *
 * ```
 * 덱·카드          3:20      ← 실측 19분을 봄
 * 출발 카운트다운   3:15      ← 못 봄
 * ```
 *
 * 🔴 **어제까지는 넷 다 안 봐서 «틀리지만 일치»했다.** 한 곳만 고쳐 갈라 놓은 것은
 *    내가 오늘 만든 것이다 — 이 레포가 반복해 온 「두 목소리」 그대로다.
 *
 * ⚠️ 이 검사는 **글자를 본다.** 다섯 번째 호출부가 생겨도 잡히게 하려는 것이라 그렇다.
 *    (타입으로 강제하려면 필수 인자로 바꿔야 하는데, 검사 호출부 수십 곳이 함께 깨진다)
 */
describe('🕐 시각을 만드는 네 곳이 같은 재료를 쓴다', () => {
    const 제품 = [
        '../../src/core/engine/OrderEvaluator.ts',
        '../../src/socket/socketHandlers.ts',
        '../../../client-app/src/components/dashboard/DepartureCountdown.tsx',
        '../../../client-app/src/hooks/useRouteDerivations.ts',   // ← PinnedRoute 에서 이사 (0831 개편 1단계)
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
     * 🔴 판정 기준 탭의 정차 값(`unk`)도 같은 자리에서 빠져 있었다 —
     *    어제 `getStopTiming` 에서 잡은 것과 **같은 병**이다.
     */
    it.each(제품)('🔴 %s 가 판정 기준의 정차 일반값(unk)도 넘긴다', (p) => {
        for (const c of 호출들(벗긴다(p))) {
            expect(c).toMatch(/unk/);
        }
    });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 🔴 **끝난 것의 시각은 경로가 아니라 장부에서 읽는다** (기사님 발견 2026-08-30)
 *
 * 기사님: *"완료됨 가서 이전 콜을 확인해 보니 `?. 초월읍 약속? - ?. 신둔면 약속?`
 * 이렇게 나오는데.. **약속시간이 날아가나 봐.**"*
 *
 * 순번도 시각도 **지금 경로**에서 찾고 있었다. 다녀온 정거장은 경로에서 빠지고
 * 끝난 콜은 통째로 빠진다 — 그래서 물음표만 남았다. 장부에는 다 있었다.
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
 * 👣 **다녀온 정거장도 약속 시각을 잃지 않는다** (기사님 실측 2026-09-14 «7지점 한 바퀴»: *"도착하면 값이 빠져서 빈칸으로 보여"*)
 *
 * 문서 펼친 카드 예시가 `초월읍 2:20 → 2:33 다녀옴` 이다 — 다녀온 곳에도 약속이 남는다.
 * 목업(`MapMockup.tsx`)도 지나간 정거장의 `promisedAt` 을 그대로 두고 «예상»만 비운다.
 *
 * 🔴 실물 덱은 경로 시간표(`timeline`)에서만 약속을 찾았다. 다녀온 정거장은 **시간표에서 빠지는데**
 *    콜 자체의 약속(`deriveCallTiming`)으로 대신하는 길이 **시간표가 통째로 빌 때만** 열려 있어
 *    `1 초월읍 --:-- 16:01` 이 됐다 (장부에는 16:19 약속이 있었다).
 */
describe('👣 다녀온 정거장의 약속', () => {
    it('📄 문서가 «다녀옴» 줄에 약속을 남긴다', () => {
        expect(문서).toMatch(/→ \d{1,2}:\d{2}\s+다녀옴/);
    });
    it('🔴 덱은 시간표에 없는 정거장이면 콜 자체의 약속을 쓴다 — 시간표가 통째로 빌 때만이 아니다', () => {
        expect(덱).not.toMatch(/timeline\.length\s*\?\s*null\s*:\s*deriveCallTiming/);
        expect(덱).toMatch(/deriveCallTiming\(/);
    });
});
