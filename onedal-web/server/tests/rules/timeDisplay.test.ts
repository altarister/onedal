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
    it('🔴 밀린 분(숫자)을 접힌 줄에 안 적는다 — 달리며 필요한 답은 「틀어졌나」 하나다', () => {
        expect(덱).not.toMatch(/shift > 0 \? '\+' : ''/);      // 옛 안 B 모양
        expect(덱).not.toMatch(/\{shift\}분/);
    });

    it('🔴 밀림·당겨짐을 기호로 말한다 (▲▼)', () => {
        expect(덱).toMatch(/▲/);
        expect(덱).toMatch(/▼/);
    });

    it('🔴 예측대로면 아무것도 안 그린다 — 적을 말이 없다', () => {
        expect(덱).toMatch(/shift !== 0/);
    });

    /** 통화 전 추정은 물결 — 이미 쓰던 문법이고 바꾸지 않는다 */
    it('추정에는 물결을 붙이고 확정에는 안 붙인다', () => {
        expect(덱).toMatch(/confirmed \?/);
        expect(덱).toMatch(/~\$\{hhmm\(time\)\}/);
    });

    it('지각은 분까지 적는다 — 행동을 바꾸는 신호라서', () => {
        expect(덱).toMatch(/late > 0/);
        expect(덱).toMatch(/⚠️/);
    });
});

describe('🕐 색은 판정·지도와 겨루지 않는다', () => {
    /**
     * 🔴 지도가 이미 상차=초록 · 하차=빨강을 쓰고, 판정이 🔵🟢🟡🔴 을 쓴다.
     *    시각의 **움직임**에까지 초록·빨강을 쓰면 무엇의 색인지 헷갈린다 (규칙 ⑤-3).
     */
    it('🔴 밀림·당겨짐에 초록/빨강을 쓰지 않는다 — 기호로만 말한다', () => {
        const 조각 = 덱.slice(덱.indexOf('shift !== 0'), 덱.indexOf('shift !== 0') + 320);
        expect(조각).not.toMatch(/text-success/);
        expect(조각).not.toMatch(/text-danger/);
    });

    it('지각에는 빨강을 허용한다 — 뜻이 다르다', () => {
        expect(덱).toMatch(/late > 0 \? 'text-danger'/);
    });
});

describe('🕐 문서와 코드가 같은 말을 한다', () => {
    it('문서가 안 C·안 A 로 확정돼 있다', () => {
        expect(문서).toMatch(/접힌 줄\s+안 C/);
        expect(문서).toMatch(/펼친 카드\s+안 A/);
    });

    /** 🔴 문서가 기호를 바꾸면 이 줄이 알려 준다 (문서만 고치고 코드를 안 고치는 것) */
    it('문서의 기호 어휘가 코드에 그대로 있다', () => {
        for (const 기호 of ['▲', '▼']) {
            expect(문서).toContain(기호);
            expect(덱).toContain(기호);
        }
    });
});

describe('🕐 펼친 카드 — 안 A (원래 값과 지금 값을 둘 다)', () => {
    it('🔴 펼치면 원래 값이 나온다 — 통화의 대사가 여기서 나온다', () => {
        expect(카드).toMatch(/PromiseLines/);
        expect(카드).toMatch(/원래/);
    });

    /**
     * 🔴 **원래 값을 따로 저장하지 않는다** (규칙 ③). 지금 값에서 밀린 분을 빼면 나온다.
     *    접힌 줄의 `▲▼` 와 **같은 재료**(`dwellShiftMinutes`)라 두 화면이 갈릴 수 없다 —
     *    2026-08-30 에 「약속」과 「예상 밀림」을 다른 재료로 붙여 정반대를 가리킨 사고.
     */
    it('🔴 원래 값은 지금 값에서 밀린 분을 빼서 만든다 — 두 벌로 저장하지 않는다', () => {
        expect(카드).toMatch(/dwellShiftMinutes/);
        expect(카드).toMatch(/지금 - 밀림 \* 60_000/);
    });

    it('🔴 안 움직였으면 화살표를 안 그린다 — 움직인 것처럼 읽힌다', () => {
        expect(카드).toMatch(/밀림 !== 0 \? hhmm/);
    });

    it('상차·하차를 글자로 밝힌다 (기사님 지적 — 자리만으론 모른다)', () => {
        expect(카드).toMatch(/'상차' : '하차'/);
    });

    it('다녀온 정거장은 흐리게 — 지난 일이다', () => {
        expect(카드).toMatch(/다녀옴/);
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
        '../../../client-app/src/components/dashboard/PinnedRoute.tsx',
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
