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
        const call = dash.slice(Math.max(0, dash.indexOf('<SidePanel') - 300), dash.indexOf('<SidePanel'));
        expect(call).toMatch(/&&/);                       // 조건부 렌더다
        expect(dash).toMatch(/sidePanelRoom|wideEnough/); // 자리가 되는지 재는 값이 있다
    });

    /**
     * 🔴 **무대를 건드리지 않는다.** 지도·시트는 `max-w-2xl`(672px) 가운데 고정이고
     *    패널은 그 **왼쪽 빈 자리**에 뜬다. 흐름에 끼우면 지도가 밀려 운행 화면이 달라진다.
     */
    it('🔴 무대 레이아웃 밖에 뜬다 (흐름에 안 끼운다)', () => {
        const panel = codeOnly(read(PANEL));
        expect(panel).toMatch(/fixed/);
        expect(panel).toMatch(/left-0/);
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

    it('높이는 창에 맞춘다 · 칸은 가로로 흐른다 (지도는 늘 보인다)', () => {
        const panel = codeOnly(read(PANEL));
        expect(panel).toMatch(/h-screen|100vh/);
        expect(panel).toMatch(/overflow-x-auto/);
    });
});
