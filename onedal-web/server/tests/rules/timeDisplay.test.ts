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
const 벗긴다 = (p: string) => readFileSync(join(__dirname, p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const 덱 = 벗긴다('../../../client-app/src/components/dashboard/CallDeck.tsx');
const 카드 = 벗긴다('../../../client-app/src/components/dashboard/PinnedRouteCard.tsx');
const 문서 = readFileSync(join(ROOT, 'docs/지금/시각_표시.md'), 'utf8');

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
