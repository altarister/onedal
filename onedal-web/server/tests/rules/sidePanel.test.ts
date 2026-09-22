import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * 🔬 **곁 패널 — 기사님과 내가 «같은 것»을 보게 하는 화면**.
 *
 * 기사님: *"내가 볼때 너랑 나랑 같은걸 보고 있어야 될꺼 같단 말이지."*
 *
 * 기사님은 화면을, 나는 서버 로그·코드·계획서를 보면 같은 질문에 서로 다른 답을 낸다
 * (국면이 다른 줄을 세거나, 화면에 없는 토글을 코드에서 찾거나). **같은 화면을 보면 30초**면 끝난다.
 *
 * 🔴 **이 패널은 언젠가 통째로 지운다** (기사님 지시: *"나중에 한방에 지울수 있으면 더 좋겠다"*).
 *    그래서 이 검사가 «지우기 쉬운 모양»을 잠근다 — 파일 하나 · 호출 한 줄 · 바깥을 안 건드림.
 */

const CLIENT = join(__dirname, '../../../client-app/src');
const BOARD_DIR = join(CLIENT, 'statusboard');
const PANEL = join(BOARD_DIR, 'StatusBoard.tsx');
const read = (abs: string) => readFileSync(abs, 'utf8');
/** 주석을 걷어낸 코드만 — 주석의 역사 기록에 걸리지 않게 */
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('곁 패널 — 지우기 쉬운 모양으로 둔다', () => {

    /**
     * 🔴 **폴더 하나다** (기사님 지시: *"불러오는 폴더와 파일만이라도
     *    분리 해야 할꺼 같은데"*).
     *
     * 현황판이 제 폴더(`statusboard/`)를 가지면 그 폴더만 만지는 에이전트와 나머지를
     *    만지는 에이전트가 **같은 파일을 안 연다.**
     * 🔴 «한 방에 지운다»도 지킨다 — **폴더째** 지우면 끝이다.
     */
    it('🔴 폴더 하나다 — 지울 때 이것만 지우면 된다', () => {
        expect(existsSync(BOARD_DIR)).toBe(true);
        expect(existsSync(PANEL)).toBe(true);
    });

    /**
     * 🔴 **현황판은 제 폴더 밖으로 안 나간다** — 나가는 순간 «폴더째 지우기»가 깨지고,
     *    다른 에이전트와 같은 파일을 열게 된다.
     *    ⚠️ `Dashboard` 의 **부르는 한 줄**은 예외다 (그게 유일한 접점이다).
     */
    it('🔴 현황판 조각이 폴더 밖에 흩어져 있지 않다', () => {
        const outside = ['components/stage/SidePanel.tsx', 'components/SidePanel.tsx'];
        for (const rel of outside) expect(`${rel}: ${existsSync(join(CLIENT, rel)) ? '있다' : '없다'}`).toBe(`${rel}: 없다`);
    });

    /**
     * 🌉 **바깥에 기대는 것은 «다리» 하나를 지난다** (기사님 지시:
     *    *"지금꺼 잘 분리해서 **나중에 쓸수 있도록** 잘 만들어줘"*).
     *
     * 기사님 구상: **브라우저 둘** — 프로젝트 / 어드민. 어드민에서 기사를 골라 들어가면
     * 지금 오른쪽에 있는 것이 그대로 뜬다 (*"어짜피 오른쪽에 있는것이 서버에서 하는 일들이라"*).
     * 지금은 안 한다.
     *
     * 🔴 **그날 갈아끼울 것을 한 파일로 모아 둔다.** 현황판이 관제웹 안쪽을 여기저기서
     *    직접 부르면, 옮길 때 **어디를 고쳐야 하는지 세어 봐야 한다.** 다리 하나면
     *    «그 파일만 새로 쓰면 된다»가 된다 — 그리고 **의존이 몇 개인지 한눈에 보인다.**
     * ⚠️ `react` 와 `@onedal/shared` 는 어디서든 쓰는 것이라 다리를 안 지난다.
     */
    it('🌉 관제웹 안쪽은 다리(bridge)로만 본다', () => {
        expect(existsSync(join(BOARD_DIR, 'bridge.ts'))).toBe(true);
        const board = codeOnly(read(PANEL));
        /* 폴더 밖(`../`)을 직접 부르는 줄이 없다 — 다리가 대신 본다 */
        const outward = board.match(/from '\.\.\/[^']+'/g) || [];
        expect(outward).toEqual([]);
    });

    /** 🔴 다리는 **얇아야 한다** — 로직이 들어가면 그것도 옮길 짐이 된다 */
    it('🌉 다리는 잇기만 한다 (제 계산을 갖지 않는다)', () => {
        const bridge = codeOnly(read(join(BOARD_DIR, 'bridge.ts')));
        expect(bridge).not.toMatch(/function |=>/);
    });

    /**
     * 🪪 **두 영역에 이름표를 붙인다** (기사님 지시: *"그 div에 프로젝트와,
     *    현황판 뭐 이런 영어 이름으로 아이디 하나씩 만들어줘"*).
     *    화면에서 «여기가 누구 영역인가»가 보여야 셋이 나눠 일할 때 헷갈리지 않는다.
     */
    it('🪪 왼쪽은 project · 오른쪽은 statusboard 로 이름표가 있다', () => {
        const dash = codeOnly(read(join(CLIENT, 'pages/Dashboard.tsx')));
        expect(dash).toMatch(/id="project"/);
        expect(dash).toMatch(/id="statusboard"/);
    });

    /**
     * 🔴 **부르는 곳이 둘이면 «한 방에»가 깨진다.** 하나를 지우고 다른 하나를 놓치면
     *    화면이 반쯤 남는다.
     */
    it('🔴 부르는 곳이 한 곳뿐이다', () => {
        const dash = codeOnly(read(join(CLIENT, 'pages/Dashboard.tsx')));
        expect((dash.match(/<StatusBoard/g) || []).length).toBe(1);
        expect((dash.match(/from ["'].*statusboard\/StatusBoard["']/g) || []).length).toBe(1);
    });

    /**
     * 🔴 **폰에서는 아예 안 만든다** (기사님 지시: *"모바일일때는 컨포넌트 호출을 안하고"*).
     *    숨기는 것(`hidden`)과 안 만드는 것은 다르다 — 숨기면 훅이 돌고 구독이 붙는다.
     *    운행 중 화면에 무게를 얹지 않는다.
     */
    it('🔴 좁은 화면에서는 컴포넌트를 만들지 않는다 (숨기는 게 아니다)', () => {
        const dash = codeOnly(read(join(CLIENT, 'pages/Dashboard.tsx')));
        // 자리가 되는지 재고, 안 되면 **그 앞에서 돌아선다**
        expect(dash).toMatch(/const withPanel = sidePanelRoom/);
        expect(dash).toMatch(/if \(!withPanel\) return body;/);
    });

    /**
     * 🔴 **원본과 «형제»로 선다 — 겹치지 않는다** (기사님 지시:
     *    *"원본에는 어떤 영향도 없어야해.. div 로 완벽하게 분리해줘"*).
     *
     * ⚠️ **`fixed` 로 원본 위에 얹으면 헤더가 어긋난다.** 무대만 `mr-auto` 로 당기면
     *    전체 폭을 쓰는 헤더와 따로 논다 — 원본 **안쪽**을 건드리게 된다.
     *    그래서 부모가 좌우로 가르고 패널은 제 칸만 채운다.
     */
    it('🔴 원본 위에 겹치지 않는다 (fixed 로 얹지 않는다)', () => {
        const panel = codeOnly(read(PANEL));
        expect(panel).not.toMatch(/fixed/);
        expect(panel).not.toMatch(/100vw/);
        expect(panel).toMatch(/h-full w-full/);
    });

    /**
     * 🔴 **원본 안쪽을 한 줄도 안 고친다.** 무대는 제 폭 안에서 가운데다 (`max-w-2xl mx-auto`) —
     *    패널이 서든 안 서든 같아야 «어떤 영향도 없다»가 참이 된다.
     */
    it('🔴 원본(무대) 정렬을 안 건드린다', () => {
        const dash = codeOnly(read(join(CLIENT, 'pages/Dashboard.tsx')));
        expect(dash).toMatch(/max-w-2xl mx-auto/);
        expect(dash).not.toMatch(/mr-auto/);
    });

    /**
     * 🔴 **패널이 없으면 감싸개조차 안 만든다** — 그래야 폰·좁은 화면의 DOM 이
     *    패널이 없는 화면 그대로다 (`if (!withPanel) return body;`).
     */
    it('🔴 패널이 없으면 예전 그대로 내보낸다 (감싸개도 없다)', () => {
        const dash = codeOnly(read(join(CLIENT, 'pages/Dashboard.tsx')));
        expect(dash).toMatch(/if \(!withPanel\) return body;/);
    });

    /**
     * 🔴 **화면이 값을 따로 만들지 않는다** — 서버가 쥔 것을 그대로 비춘다.
     *    패널이 제 계산을 하면 «화면은 맞는데 판정은 틀린» 것을 못 잡는다.
     *    그러면 진단 화면이 오히려 오진을 늘린다.
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

    /**
     * 🔴 **칸이 숨으면 안 된다** (기사님 지시: *"왼쪽의 모듈들이 다 보였으면
     *    좋겠어. 항상 윈도우를 풀사이즈로 하는건 힘들어"*).
     *
     * ⚠️ **가로 스크롤**이면 창이 좁을 때 칸이 옆으로 숨어 **있는 줄도 모른다.**
     * ⚠️ **격자**(`grid`)면 **행 높이가 그 줄에서 가장 큰 칸에 맞춰져** 짧은 칸 아래가 통째로 빈다.
     * ⚠️ **신문 단**(`columns`)도 쓰지 않는다 (기사님: *"컨포넌트가 한줄로 있는 구조가
     *    아니구나.. 그냥 한줄로 만들고"*).
     *
     * 그래서 **줄마다 한 단**(`flex flex-col`)이다 — **칸이 숨지 않고 가로로 안 흐른다.**
     */
    it('칸은 아래로 흐른다 — 창이 좁아도 숨지 않는다', () => {
        const panel = codeOnly(read(PANEL));
        expect(panel).toMatch(/h-full/);                    // 부모가 준 높이를 꽉 채운다
        expect(panel).toMatch(/overflow-y-auto/);           // 세로로 흐른다
        expect(panel).toMatch(/flex flex-col gap-2/);       // 줄마다 한 단 — 칸이 자리를 안 옮긴다
        expect(panel).not.toMatch(/columnWidth/);           // 신문 단을 되살리지 않는다
        expect(panel).not.toMatch(/overflow-x-auto/);       // 가로로 숨기지 않는다
        // 부모(감싸개)가 창 높이를 정한다 — 그래야 원본과 패널이 같은 높이다
        const dash = codeOnly(read(join(CLIENT, 'pages/Dashboard.tsx')));
        expect(dash).toMatch(/flex h-dvh overflow-hidden/);
    });
});
