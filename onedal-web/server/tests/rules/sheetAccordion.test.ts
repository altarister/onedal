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

    it('헤더는 «내용 사이사이»에 끼워 그린다 — 내용이 자기 헤더 바로 밑에 온다', () => {
        // 🔴 첫 판은 헤더를 위에 몰고 내용을 그 아래 따로 그렸다 — «누구 것인가»가 또 생겼다
        expect(deck()).toMatch(/\{rowOf\(o, i\)\}\s*\n[\s\S]{0,240}?hidden=\{i !== cur\}>\{renderCard\(o\)\}/);
    });

    it('헤더는 고른 콜 위·아래로 «층»으로 붙어 전부 화면에 남는다', () => {
        const d = deck();
        expect(d).toMatch(/i <= cur/);
        expect(d).toMatch(/position: 'sticky', top: i \* ROW_H/);
        expect(d).toMatch(/position: 'sticky', bottom: \(orders\.length - 1 - i\) \* ROW_H/);
        // 붙는 줄은 내용 위에 뜨므로 불투명 바닥이 필수다
        expect(d).toMatch(/accordion \? 'bg-surface border-border\/60'/);
    });

    it('층 높이의 원천은 한 곳이다 (규칙 ③) — ROW_H', () => {
        const d = deck();
        expect(d).toMatch(/const ROW_H = \d+;/);
        // 32 같은 숫자를 sticky 계산에 손으로 또 적으면 층이 어긋난다
        expect(d).not.toMatch(/top: i \* 32/);
    });

    /**
     * 🔴 리뷰(2026-09-03)가 잡은 것 — 고른 카드만 «그리면» 콜을 바꿀 때마다 카드가
     *    언마운트된다. 통화 중 적던 단위·수량이 날아가고 mount 마다 서버에 단계를 다시 청한다.
     *    그래서 **전부 마운트한 채 `hidden` 으로 숨긴다** — 입력값 보존은 두 모드의 약속이다.
     */
    it('아코디언도 카드를 전부 마운트한다 — 고른 것만 «보일» 뿐 (입력값 보존 · 버그 대장 #95)', () => {
        expect(deck()).toMatch(/hidden=\{i !== cur\}/);
        // 고른 카드 하나만 골라 그리는 갈래가 되살아나면 안 된다
        expect(deck()).not.toMatch(/orders\[cur\] \? renderCard/);
    });

    it('아코디언에서 가로 스크롤 기계는 코드로 잠긴다 — trackRef 가 우연히 null 인 것에 기대지 않는다', () => {
        expect(deck()).toMatch(/scrollToIndex = \(i: number, smooth = true\) => \{\s*\n\s*if \(accordion\) return;/);
        expect(deck()).toMatch(/onScroll = \(\) => \{\s*\n\s*if \(accordion\) return;/);
    });

    it('줄 그리는 코드는 두 모드가 한 벌을 쓴다 (규칙 ③) — rowOf 하나', () => {
        const d = deck();
        // 줄을 만드는 함수는 하나로 정의되고, 두 모드가 그것을 부른다
        expect(d.match(/const rowOf = /g) ?? []).toHaveLength(1);
        expect(d.match(/aria-current/g) ?? []).toHaveLength(1);
        expect(d).toMatch(/orders\.map\(\(o, i\) => rowOf\(o, i\)\)/);   // 스와이프
        expect(d).toMatch(/\{rowOf\(o, i\)\}/);                            // 아코디언
    });
});
