import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🧭 **내비 화면은 위치를 «쓰되 보내지 않는다»** (기사님 지적 2026-09-03)
 *
 * 기사님: *"관제가 2개 열리면 안된다고 한것 같은데."* — 맞다.
 * 개인 폰(아이폰)에서 이 웹을 열었을 때 좌표를 **서버로 보내면**, 서버는 관제폰과 개인 폰의
 * 위치를 **한 차량으로** 본다. 두 점을 오가는 것으로 보여 「위치 점프」가 찍히고
 * 도착·지나침 판정이 통째로 흔들린다.
 *
 * 🟢 그런데 **위치 자체는 필요하다** — «지금 여기서 출발»하는 링크를 만들어야 하니까.
 *    개인 폰도 차 안에 있어 좌표는 같다. 그래서 **읽기는 켜고 보내기만 끈다.**
 *
 * 🔴 이 구분이 사라지면 **조용히** 섞인다 — 화면에는 아무 표시도 안 난다.
 */
const CLIENT = join(__dirname, '../../../client-app/src');
const read = (p: string) => readFileSync(join(CLIENT, p), 'utf8');
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('🧭 내비 화면은 좌표를 서버로 보내지 않는다', () => {
    const app = () => codeOnly(read('App.tsx'));

    it('보내는 훅(useGpsTelemetry)은 내비 화면에서 꺼진다', () => {
        expect(app()).toMatch(/useGpsTelemetry\(\s*!naviOnly\s*\)/);
    });

    it('«내비 화면인가»는 주소로 정한다 — 다른 화면은 영향이 없다', () => {
        expect(app()).toMatch(/naviOnly\s*=\s*location\.pathname\.startsWith\(['"]\/navi['"]\)/);
    });

    it('🟢 읽는 훅(useNativeLocation)은 끄지 않는다 — 출발지가 있어야 링크가 선다', () => {
        expect(app()).toMatch(/useNativeLocation\(\s*\)/);
    });

    /** 🔴 읽는 훅이 서버로 새면 위 구분이 무의미해진다 */
    it('읽는 훅은 서버로 보내지 않는다 (publishLocation 을 안 부른다)', () => {
        expect(codeOnly(read('hooks/useNativeLocation.ts'))).not.toMatch(/publishLocation/);
    });

    /** 🔴 관제 화면의 부품을 끌어오면 그 안에서 또 보낼 수 있다 */
    it('내비 화면은 모의주행·마스터 GPS·결재를 안 쓴다', () => {
        const navi = codeOnly(read('pages/Navi.tsx'));
        expect(navi).not.toMatch(/useMasterGps|useMockGpsSimulator|publishLocation|handleDecision/);
    });

    /**
     * 🔴 `useOrderEngine` 은 소켓 구독을 **자기가** 들고 있다 — 두 화면이 함께 쓰면
     *    구독이 두 벌이 된다 (`ghostCard.test.ts` 가 잡는 그 규칙).
     */
    it('내비 화면은 자기 전용 읽기 훅을 쓴다 — 관제 엔진을 끌어오지 않는다', () => {
        expect(codeOnly(read('pages/Navi.tsx'))).not.toMatch(/useOrderEngine/);
        expect(codeOnly(read('hooks/useNaviRoute.ts'))).toMatch(/socket\.on\('sync-active-orders'/);
    });
});
