import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * 🔴 **옛말 금지 — 용어집(docs/지금/용어집.md)이 유일한 원천이다** (기사님 2026-08-17)
 *
 * 기사님: *"새로 정의를 해도 너는 자꾸 이전 용어를 쓰고 있고."*
 * 코드에 옛말이 살아 있으면 그걸 읽는 쪽(사람이든 Claude 든)이 옛말을 다시 배운다.
 * 그래서 **새 코드가 옛말을 쓰면 여기서 빨간불**이 나게 한다.
 *
 * 검사 방식: **주석을 벗긴 코드**(codeOnly)만 본다 —
 * 역사 서술 주석("예전엔 `본콜`이라 불렀다")과 금지패턴 검사 자체는 옛말을 담는 게 당연하다.
 * (2026-08-17 에 일반 치환이 금지패턴 검사까지 바꿔서 멀쩡한 새말을 금지시킨 사고가 있었다)
 */

const ROOTS = [
    join(__dirname, "../../src"),                      // server
    join(__dirname, "../../../client-app/src"),        // 관제웹
    join(__dirname, "../../../shared/src"),            // shared
    join(__dirname, "../../../scripts"),               // 검증 스크립트 (scenario 가 잡았던 구멍)
];

const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const walk = (d: string, out: string[] = []): string[] => {
    for (const e of readdirSync(d)) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.(ts|tsx|mjs)$/.test(e) && !e.endsWith('.d.ts')) out.push(p);
    }
    return out;
};

/** 옛말 → 확정 용어. 예외는 이유와 함께 — 이유 없는 예외는 만들지 않는다 */
const BANNED: { name: string, pattern: RegExp, allow?: RegExp, until?: string }[] = [
    { name: '사냥 → 콜 필터/콜 잡기', pattern: /사냥/ },
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
            let code = codeOnly(readFileSync(f, 'utf8'));
            if (b.allow) code = code.replace(new RegExp(b.allow.source, 'g'), '');
            if (b.pattern.test(code)) offenders.push(f.split('/onedal-web/')[1] ?? f);
        }
        expect(offenders).toEqual([]);
    });

    it('검사가 파일을 실제로 읽고 있다 (0개 파일이면 검사가 죽은 것)', () => {
        expect(files.length).toBeGreaterThan(50);
    });
});
