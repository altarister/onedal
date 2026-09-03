import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🪗 **시트는 아코디언이다** (기사님 확정 2026-09-03 · 실주행 캡처와 함께)
 *
 * 기사님: *"올라오는 시트에 진행중, 완료됨.. 그 라인은 거의 필요 없는 것 같아. 그건 어디
 * 따로 봐야 할 것 같아. 시트에 콜리스트 3개 아래로 관련된 스텝이 보이고 있는데..
 * 그러니까 뭘 보고 있는지 어려워. 아코디언으로 만들고, 아코디언 헤더는 무조건 화면에
 * 노출하고, 컨텐츠 영역에 스크롤할 수 있게 하는 것이 어떨까?"*
 *
 * 그날 S23 실물에서 확인된 문제다 — 콜 목록 밑에 «어느 콜의 것인지 모르는 스텝»이
 * 이어져, 스크롤하면 주어가 사라졌다.
 *
 * ⚠️ 옛 화면(토글 꺼짐)은 스와이프 덱 그대로다 — 이 검사는 «시트»만 잠근다.
 */
const CLIENT = join(__dirname, '../../../client-app/src');
const read = (p: string) => readFileSync(join(CLIENT, p), 'utf8');
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('🪗 시트 아코디언 — 기사님 확정 2026-09-03', () => {
    const route = () => codeOnly(read('components/dashboard/PinnedRoute.tsx'));
    const deck = () => codeOnly(read('components/dashboard/CallDeck.tsx'));

    it('탭 줄(진행중·완료됨·취소·방출·전체)은 시트에 없다', () => {
        // 탭 줄 블록이 !sheetOnly 뒤에만 그려진다
        expect(route()).toMatch(/\{!sheetOnly && safeRoute\.length > 0 && \(\s*<div\s*\n?\s*ref=\{tabBarRef\}/);
    });

    it('시트는 «진행 중»으로 고정된다 — 탭이 없으니 view 가 남아돌면 안 된다', () => {
        expect(route()).toMatch(/view = sheetOnly \? 'ACTIVE' : viewFilter/);
        // 렌더 분기가 viewFilter 를 직접 읽으면 시트가 옛 탭 상태를 따라간다
        expect(route()).not.toMatch(/\{viewFilter === 'ACTIVE' &&/);
        expect(route()).not.toMatch(/\{viewFilter !== 'ACTIVE' &&/);
    });

    it('시트의 덱은 아코디언이다', () => {
        expect(route()).toMatch(/accordion=\{sheetOnly\}/);
    });

    it('아코디언 헤더(콜 요약 줄)는 무조건 화면에 남는다 — sticky + 불투명 바닥', () => {
        // 바닥색(bg-surface)까지 잠근다 — 빠지면 밑으로 흐르는 글자가 헤더에 비쳐 겹친다
        expect(deck()).toMatch(/accordion \? 'sticky top-0 z-10 bg-surface'/);
    });

    /**
     * 🔴 리뷰(2026-09-03)가 잡은 것 — 고른 카드만 «그리면» 콜을 바꿀 때마다 카드가
     *    언마운트된다. 통화 중 적던 단위·수량이 날아가고 mount 마다 서버에 단계를 다시 청한다.
     *    그래서 **전부 마운트한 채 `hidden` 으로 숨긴다** — 입력값 보존은 두 모드의 약속이다.
     */
    it('아코디언도 카드를 전부 마운트한다 — 고른 것만 «보일» 뿐 (입력값 보존)', () => {
        expect(deck()).toMatch(/hidden=\{accordion && i !== cur\}/);
        // 고른 카드 하나만 골라 그리는 갈래가 되살아나면 안 된다
        expect(deck()).not.toMatch(/orders\[cur\] \? renderCard/);
    });

    it('아코디언에서 가로 스크롤 기계는 코드로 잠긴다 — trackRef 가 우연히 null 인 것에 기대지 않는다', () => {
        expect(deck()).toMatch(/scrollToIndex = \(i: number, smooth = true\) => \{\s*\n\s*if \(accordion\) return;/);
        expect(deck()).toMatch(/onScroll = \(\) => \{\s*\n\s*if \(accordion\) return;/);
    });

    it('줄 그리는 코드는 두 모드가 한 벌을 쓴다 (규칙 ③) — 카드를 그리는 자리는 하나뿐', () => {
        // renderCard 호출부가 하나면 카드 렌더 경로가 갈라질 수 없다
        const calls = deck().match(/renderCard\(o\)/g) ?? [];
        expect(calls.length).toBe(1);
        // 콜 고르는 줄(헤더)도 하나 — aria-current 를 다는 버튼이 그것이다
        const rows = deck().match(/aria-current/g) ?? [];
        expect(rows.length).toBe(1);
    });
});
