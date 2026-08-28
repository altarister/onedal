import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * 🔴 **옛말 금지 — 용어집(docs/지금/용어집.md)이 유일한 원천이다** (기사님 2026-08-17)
 *
 * 기사님: *"새로 정의를 해도 너는 자꾸 이전 용어를 쓰고 있고."*
 * 코드에 옛말이 살아 있으면 그걸 읽는 쪽(사람이든 Claude 든)이 옛말을 다시 배운다.
 * 그래서 **새 코드가 옛말을 쓰면 여기서 빨간불**이 나게 한다.
 *
 * 🔴 **2026-08-29 — 이 검사에 구멍이 셋 있었다.** 이걸 믿고 *"코드에 옛말은 없다"* 고
 *    말해 왔는데 전수조사에서 옛말 30여 곳이 나왔다.
 *
 *    **구멍 ① 주석을 안 봤다** — `codeOnly()` 로 주석을 걷어내고 검사해서, **주석은 한 번도
 *      검사된 적이 없었다.** 이 레포는 설계 의도를 주석에 남기는 것이 규칙이라
 *      *"읽는 쪽이 옛말을 다시 배운다"* 는 애초의 문제의식이 정작 주석에서 무방비였다
 *    **구멍 ② 금지어 목록이 용어집보다 짧았다** — `광클`·`무인 서핑`·`팝업 서핑` 이 빠져 있었다
 *    **구멍 ③ 앱(Kotlin)을 안 봤다** — `.ts/.tsx/.mjs` 만 훑어서 `onedal-app` 은 통째로
 *      사각지대였다. 실제로 옛말 19곳이 거기 살아 있었다
 *
 * 검사 방식: **주석까지 본다.** 다만 옛말을 담는 게 당연한 두 자리는 예외로 둔다 —
 *   ⓐ **역사 서술** (`HISTORY_MARK`) — *"예전엔 `본콜`이라 불렀다"* 처럼 옛말임을 **설명하는**
 *      문장. 이걸 금지하면 왜 바뀌었는지를 적을 수 없다
 *   ⓑ **금지패턴 검사 자체** — 이 파일과 audit 스크립트
 * (2026-08-17 에 일반 치환이 금지패턴 검사까지 바꿔서 멀쩡한 새말을 금지시킨 사고가 있었다)
 */

const ROOTS = [
    join(__dirname, "../../src"),                      // server
    join(__dirname, "../../../client-app/src"),        // 관제웹
    join(__dirname, "../../../shared/src"),            // shared
    join(__dirname, "../../../scripts"),               // 검증 스크립트 (scenario 가 잡았던 구멍)
    join(__dirname, "../../../../onedal-app/app/src/main/java"),   // 앱 — 구멍 ③
];

/**
 * 역사 서술로 인정하는 표시 — **이 낱말이 같은 줄에 있으면 옛말을 써도 된다.**
 * 옛말을 «설명하는» 문장과 «사용하는» 문장을 가르는 유일한 수단이다.
 * 새 낱말을 늘릴 때는 «설명 중임이 드러나는가» 를 기준으로 판단한다.
 */
const HISTORY_MARK = /예전|옛말|폐기|이전 용어|더 이상|바뀌었|개명|정정|아니다|없앴|삭제|사라진|였다|이었다|불렀다|썼다|금지/;

/** 검사에서 빼는 파일 — 금지패턴을 코드에 적어 두는 자리 (ⓑ) */
const SELF_REFERENTIAL = /glossary\.test\.ts$|audit-docs\.mjs$|audit-dead\.mjs$/;

/**
 * 옛말이 «쓰인» 줄만 남긴다 — 역사 서술 줄은 걷어낸다.
 * 줄 단위인 이유: 이 레포의 주석은 한 블록 안에 «옛말 설명»과 «현재 서술»이 섞여 있어,
 * 블록째 면제하면 그 블록의 진짜 위반이 통째로 숨는다.
 */
const stripHistoryLines = (s: string) =>
    s.split('\n').filter(line => !HISTORY_MARK.test(line)).join('\n');

const walk = (d: string, out: string[] = []): string[] => {
    for (const e of readdirSync(d)) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.(ts|tsx|mjs|kt)$/.test(e) && !e.endsWith('.d.ts')) out.push(p);
    }
    return out;
};

/** 옛말 → 확정 용어. 예외는 이유와 함께 — 이유 없는 예외는 만들지 않는다 */
const BANNED: { name: string, pattern: RegExp, allow?: RegExp, until?: string }[] = [
    { name: '사냥 → 콜 필터/콜 잡기', pattern: /사냥/ },
    // 아래 셋은 2026-08-29 에 추가 — 용어집에는 폐기어로 있는데 여기 없어서 통과하고 있었다 (구멍 ②)
    { name: '광클 → 선점', pattern: /광클/ },
    // 맨 «서핑» 까지 잡는다 — 「무인/팝업」 만 막으면 홀로 남은 «서핑이 끝나면» 이 그대로 산다 (실측 11곳)
    { name: '서핑 → 상세 수집', pattern: /서핑|[Ss]urfing/ },
    { name: '데스밸리 → 안전취소', pattern: /데스밸리|데스벨리|[Dd]eath[Vv]alley/ },
    { name: '눈높이 → 콜할인율', pattern: /눈높이/ },
    { name: '회랑 → 경유', pattern: /회랑/ },
    { name: '선빵 → 선점', pattern: /선빵/ },
    { name: '본콜 → 첫짐 콜', pattern: /본콜/ },
    { name: 'hunt → callTarget/callFilter', pattern: /\bhunt|Hunt/ },   // \b 없이 /hunt/i 로 하면 refreshUntil 의 hUnt 가 걸린다
    { name: 'mainCall/subCalls → firstCall/mergeCalls', pattern: /mainCall|subCalls/ },
    { name: 'eyeline → callDiscount', pattern: /eyeline/i },      // DB 컬럼까지 완료 (P3 2026-08-17)
    {
        name: 'corridor → detour', pattern: /corridor/i,
        allow: /trimCorridorByProgress/,   // 죽은 옛 함수의 금지패턴·역사 — 영구 예외
    },
    { name: "'미상' → '배차값없음'", pattern: /['\"`]미상['\"`]/ },   // 단독 센티널만 — 금액미상 같은 조합형(주어 있음)은 허용

    // 취소의 세 갈래 (용어집 §2-1 · 기사님 확정 2026-08-18)
    // ⚠️ ORDER_RELEASED 는 새 이름의 **앞부분**이라, 뒤에 _BY_ 가 오면 새말이다
    { name: 'ORDER_RELEASED → ORDER_RELEASED_BY_ME', pattern: /ORDER_RELEASED(?!_BY_)/ },
    { name: 'ORDER_CANCELED → SAFE_CANCEL', pattern: /ORDER_CANCELED/ },
    { name: 'ORDER_FORCE_CANCELED → ORDER_RELEASED_BY_OFFICE', pattern: /ORDER_FORCE_CANCELED/ },
];

describe('용어집 — 폐기된 옛말이 코드에 없다', () => {
    const files = ROOTS.flatMap(r => walk(r));

    it.each(BANNED.map(b => [b.name, b] as const))('%s', (_name, b) => {
        const offenders: string[] = [];
        for (const f of files) {
            if (SELF_REFERENTIAL.test(f)) continue;
            // 주석까지 본다 (구멍 ①) — 다만 옛말을 «설명하는» 줄은 뺀다
            let code = stripHistoryLines(readFileSync(f, 'utf8'));
            if (b.allow) code = code.replace(new RegExp(b.allow.source, 'g'), '');
            const m = code.match(new RegExp(b.pattern.source, b.pattern.flags.replace('g', '')));
            if (m) {
                const rel = f.split('/onedal-app/')[1] ? `app/${f.split('/onedal-app/')[1]}`
                                                       : (f.split('/onedal-web/')[1] ?? f);
                offenders.push(`${rel} ("${m[0]}")`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it('검사가 파일을 실제로 읽고 있다 (0개 파일이면 검사가 죽은 것)', () => {
        expect(files.length).toBeGreaterThan(50);
    });

    /**
     * 🔴 **앱을 실제로 읽고 있는가** (구멍 ③ 의 재발 방지).
     * 앱은 `.kt` 라, 확장자 목록에서 `kt` 가 빠지면 **한 건도 안 걸리면서 초록불**이 된다 —
     * 그게 2026-08-29 까지의 상태였다. 파일 수를 세어 그 침묵을 깬다.
     */
    it('🔴 앱(Kotlin)도 검사 대상이다 — 확장자가 빠지면 조용히 0건이 된다', () => {
        const kt = files.filter(f => f.endsWith('.kt'));
        expect(kt.length).toBeGreaterThan(20);
    });

    /**
     * 역사 서술 면제가 **너무 넓어지지 않았는가** — 이 검사가 없으면 `HISTORY_MARK` 에
     * 흔한 낱말을 하나 더 넣는 것만으로 검사 전체가 조용히 무력화된다.
     */
    it('역사 면제는 «설명하는 줄»만 걷어낸다 — 옛말을 쓰는 줄은 남는다', () => {
        expect(stripHistoryLines('예전엔 본콜이라 불렀다')).toBe('');       // 설명 → 면제
        expect(stripHistoryLines('본콜의 좌표를 읽는다')).toContain('본콜'); // 사용 → 남는다
    });
});
