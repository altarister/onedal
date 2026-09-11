import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * 🔬 **곁 패널 — 기사님과 내가 «같은 것»을 보게 하는 화면** (2026-09-11).
 *
 * 기사님: *"내가 볼때 너랑 나랑 같은걸 보고 있어야 될꺼 같단 말이지."*
 *
 * 그날 하루에 셋이 어긋났다 — 전부 **다른 것을 보고 있어서**였다:
 *   · 「그물이 도는가」 — 나는 서버 로그(954개), 기사님은 화면(241개). 국면이 달랐다
 *   · 「현위치 범위가 안 보인다」 — 기사님은 지도, 나는 코드. 답은 «노선/동선 토글이 없다»
 *   · 「목업엔 국면이 없는데」 — 나는 계획서, 기사님은 목업. 계획서가 틀렸다
 * 셋 다 **같은 화면을 보고 있었으면 30초**였을 일이다.
 *
 * 🔴 **이 패널은 언젠가 통째로 지운다** (기사님 지시: *"나중에 한방에 지울수 있으면 더 좋겠다"*).
 *    그래서 이 검사가 «지우기 쉬운 모양»을 잠근다 — 파일 하나 · 호출 한 줄 · 바깥을 안 건드림.
 */

const CLIENT = join(__dirname, '../../../client-app/src');
const PANEL = join(CLIENT, 'components/stage/SidePanel.tsx');
const read = (abs: string) => readFileSync(abs, 'utf8');
/** 주석을 걷어낸 코드만 — 주석의 역사 기록에 걸리지 않게 */
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('곁 패널 — 지우기 쉬운 모양으로 둔다', () => {

    it('🔴 파일 하나다 — 지울 때 이것만 지우면 된다', () => {
        expect(existsSync(PANEL)).toBe(true);
    });

    /**
     * 🔴 **부르는 곳이 둘이면 «한 방에»가 깨진다.** 하나를 지우고 다른 하나를 놓치면
     *    화면이 반쯤 남는다 — 이 레포가 옛 코드 잔상으로 여러 번 당한 모양이다.
     */
    it('🔴 부르는 곳이 한 곳뿐이다', () => {
        const dash = codeOnly(read(join(CLIENT, 'pages/Dashboard.tsx')));
        expect((dash.match(/<SidePanel/g) || []).length).toBe(1);
        expect((dash.match(/from ["'].*SidePanel["']/g) || []).length).toBe(1);
    });

    /**
     * 🔴 **폰에서는 아예 안 만든다** (기사님 지시: *"모바일일때는 컨포넌트 호출을 안하고"*).
     *    숨기는 것(`hidden`)과 안 만드는 것은 다르다 — 숨기면 훅이 돌고 구독이 붙는다.
     *    운행 중 화면에 무게를 얹지 않는다.
     */
    it('🔴 좁은 화면에서는 컴포넌트를 만들지 않는다 (숨기는 게 아니다)', () => {
        const dash = codeOnly(read(join(CLIENT, 'pages/Dashboard.tsx')));
        // 자리가 되는지 재고, 안 되면 **그 앞에서 돌아선다**
        expect(dash).toMatch(/const withPanel = stagePreview && sidePanelRoom/);
        expect(dash).toMatch(/if \(!withPanel\) return body;/);
    });

    /**
     * 🔴 **원본과 «형제»로 선다 — 겹치지 않는다** (기사님 지시 2026-09-11:
     *    *"원본에는 어떤 영향도 없어야해.. div 로 완벽하게 분리해줘"*).
     *
     * ⚠️ **전에는 `fixed` 로 원본 위에 얹었다가 헤더가 어긋났다.** 무대만 `mr-auto` 로
     *    당겼더니 전체 폭을 쓰는 헤더와 따로 놀았다 — 원본 **안쪽**을 건드린 탓이다.
     *    겹쳐 놓고 «안 건드린다»고 믿은 것이 틀렸다. 이제 부모가 좌우로 가르고
     *    패널은 제 칸만 채운다.
     */
    it('🔴 원본 위에 겹치지 않는다 (fixed 로 얹지 않는다)', () => {
        const panel = codeOnly(read(PANEL));
        expect(panel).not.toMatch(/fixed/);
        expect(panel).not.toMatch(/100vw/);
        expect(panel).toMatch(/h-full w-full/);
    });

    /**
     * 🔴 **원본 안쪽을 한 줄도 안 고친다.** 무대는 예전처럼 제 폭 안에서 가운데다 —
     *    패널이 서든 안 서든 같아야 «어떤 영향도 없다»가 참이 된다.
     */
    it('🔴 원본(무대) 정렬을 안 건드린다', () => {
        const dash = codeOnly(read(join(CLIENT, 'pages/Dashboard.tsx')));
        expect(dash).toMatch(/max-w-2xl mx-auto/);
        expect(dash).not.toMatch(/mr-auto/);
    });

    /**
     * 🔴 **패널이 없으면 감싸개조차 안 만든다** — 그래야 폰·좁은 화면의 DOM 이
     *    예전과 글자 그대로 같다.
     */
    it('🔴 패널이 없으면 예전 그대로 내보낸다 (감싸개도 없다)', () => {
        const dash = codeOnly(read(join(CLIENT, 'pages/Dashboard.tsx')));
        expect(dash).toMatch(/if \(!withPanel\) return body;/);
    });

    /**
     * 🔴 **화면이 값을 따로 만들지 않는다** — 서버가 쥔 것을 그대로 비춘다.
     *    패널이 제 계산을 하면 «화면은 맞는데 판정은 틀린» 것을 못 잡는다.
     *    그러면 진단 화면이 오히려 오진을 늘린다 (이 레포가 네 번 당한 모양).
     */
    it('🔴 앱에 내려갈 값은 표(APP_FILTER_KEYS)에서 온다 — 여기 또 적지 않는다', () => {
        const panel = codeOnly(read(PANEL));
        expect(panel).toMatch(/APP_FILTER_KEYS/);
        // 키를 손으로 나열한 배열이 없다
        expect(panel).not.toMatch(/\['isActive',\s*'isSharedMode'/);
    });

    /**
     * 🔴 **칸 순서는 한 곳에서 바꾼다** (기사님: *"순서는 너가 알아서 나중에 바꿀수 있어"*).
     *    JSX 에 칸을 박아 두면 순서를 바꿀 때마다 큰 덩어리를 옮겨야 한다.
     */
    it('칸 목록이 배열 하나다 — 순서를 한 줄로 바꾼다', () => {
        const panel = codeOnly(read(PANEL));
        expect(panel).toMatch(/const COLUMNS/);
        expect(panel).toMatch(/COLUMNS\.map/);
    });

    it('높이는 창에 맞춘다 · 칸은 가로로 흐른다 (원본은 늘 보인다)', () => {
        const panel = codeOnly(read(PANEL));
        expect(panel).toMatch(/h-full/);                  // 부모가 준 높이를 꽉 채운다
        expect(panel).toMatch(/overflow-x-auto/);
        // 부모(감싸개)가 창 높이를 정한다 — 그래야 원본과 패널이 같은 높이다
        const dash = codeOnly(read(join(CLIENT, 'pages/Dashboard.tsx')));
        expect(dash).toMatch(/flex h-dvh overflow-hidden/);
    });
});
