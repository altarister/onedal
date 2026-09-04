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

    /**
     * 🔴 **붙이지(sticky) 않는다** — 기사님 실물 2026-09-04: *"여기 겹침이 발생했어."*
     *    시트가 100% 고정이고 스크롤은 펼친 판 안에서만 일어나므로 헤더는 밀리지 않는다.
     *    붙여 두면 오히려 펼친 판 위로 떠올라 단계 줄과 겹친다.
     */
    it('헤더를 붙이지 않는다 — 겹침의 원인이었다', () => {
        const d = deck();
        expect(d).not.toMatch(/position: 'sticky', top: i \* ROW_H/);
        expect(d).not.toMatch(/position: 'sticky', bottom:/);
        // 높이만 고정한다 — 접힘/펼침에 줄 높이가 안 흔들리게
        expect(d).toMatch(/accordion \? \{ height: ROW_H \}/);
    });

    it('층 높이의 원천은 한 곳이다 (규칙 ③) — ROW_H', () => {
        const d = deck();
        expect(d).toMatch(/const ROW_H = \d+;/);
        // 32 를 손으로 또 적으면 줄 높이가 갈라진다
        expect(d).not.toMatch(/height: 32/);
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

/**
 * 🪗 **세로 사슬 — 넘친 것이 밖으로 그려지지 않는다** (기사님 실물 2026-09-04:
 * *"시트 반만 열기에서만 겹침이 발생해"*)
 *
 * 시트 높이가 줄면 자리가 모자란다. 그때 **줄어들 수 있는 것과 없는 것**이 정해져 있지
 * 않으면, 안 줄어드는 쪽이 버티다가 상자를 넘어 **다음 콜 헤더 위에 올라탄다.**
 *
 * | 층 | 규칙 |
 * |---|---|
 * | 아코디언 그릇 | 시트 높이만 쓰고 **넘치지 않는다** — 넘치면 헤더가 밀려 «늘 보인다»가 깨진다 |
 * | 펼친 판 | **상자 밖으로 안 그린다** |
 * | 위 덩어리(콜 전체) | 좁으면 **스스로 줄고 그 안에서 스크롤** |
 * | 아래(스텝) | **최소 높이를 지킨다** — 이 화면의 목적이라 0 으로 찌그러지면 안 된다 |
 */
describe('🪗 시트가 좁아져도 겹치지 않는다', () => {
    const mock = () => codeOnly(readFileSync(join(CLIENT, 'pages/SheetMockup.tsx'), 'utf8'));

    it('아코디언 그릇이 넘치지 않는다', () => {
        expect(mock()).toMatch(/h-full flex flex-col gap-1\.5[^"]*overflow-hidden/);
    });

    it('펼친 판은 자리가 모자라면 **스크롤**한다 — 잘라서 감추지 않는다 (규칙 ④)', () => {
        expect(mock()).toMatch(/flex-1 min-h-0 mt-1\.5 flex flex-col overflow-y-auto/);
    });

    /**
     * 🔴 **위 덩어리가 이긴다** (기사님 2026-09-04: *"위 덩어리는 내용이 다 보여야 해.
     *    지금 시트를 반만 열었다는 건 전체적으로 어떤 콜이 있는지 보기 위함"*).
     *    한 번 거꾸로 잡았다 — 좁을 때 여기를 줄였더니 **정작 볼 것이 사라졌다.**
     */
    it('위 덩어리는 안 줄어든다 — 반만 열기의 목적이 여기다', () => {
        const m = mock();
        expect(m).toMatch(/shrink-0 px-3 pt-2\.5 pb-3 border-b/);
        expect(m).not.toMatch(/min-h-0 shrink overflow-y-auto px-3 pt-2\.5 pb-3/);
    });

    it('아래(스텝)는 최소 높이를 지키고 아래로 밀린다 — 필요하면 시트를 전체로 올린다', () => {
        expect(mock()).toMatch(/shrink-0 flex-1 min-h-\[\d+px\] flex flex-col/);
    });
});
