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

    it('아코디언 헤더(콜 요약 줄)는 무조건 화면에 남는다 — sticky', () => {
        expect(deck()).toMatch(/accordion \? 'sticky top-0/);
    });

    it('아코디언은 가로 스와이프 트랙을 그리지 않는다 — 고른 콜 하나만', () => {
        expect(deck()).toMatch(/\{accordion \? \(/);
        expect(deck()).toMatch(/orders\[cur\] \? renderCard\(orders\[cur\]\) : null/);
    });

    it('줄 그리는 코드는 두 모드가 한 벌을 쓴다 (규칙 ③) — 요약 줄 컨테이너는 하나뿐', () => {
        const m = deck().match(/flex flex-col gap-1 px-3 pt-2 pb-1/g) ?? [];
        expect(m.length).toBe(1);
    });
});
