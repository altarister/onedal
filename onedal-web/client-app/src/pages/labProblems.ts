/**
 * 🧪 **콜 문제 목록 — 기사님이 실제로 돈 한 바퀴** (2026-09-10).
 *
 * 🔴 **내가 좌표를 감으로 고르면 맥락이 없다** — *"문제가 맥락 없고 우리 룰과도 모두 틀리다.
 *    이렇게 해서 무슨 테스트야."* 맞다. 그래서 이 목록은 지어낸 것이 하나도 없다:
 *    기사님이 지도를 두 번씩 눌러 **일곱 콜을 잡고 한 바퀴 돈 기록**에서 그대로 옮겼다
 *    (노선 다섯 + 복귀 둘 — 하루 운행 모델과 같은 모양).
 * 🔴 좌표는 **카카오 호출 기록에 찍힌 그 값**이다 (`⑮ 합짐 고유` 줄의 상차·하차).
 *    동 중심점으로 바꾸지 않았다 — **기사님이 누른 자리**라야 그때 그 판이 다시 선다.
 * 🔴 **요금·짐은 안 적는다** — 늘 20만원·1박스다. 지도 클릭으로 만든 콜은 가격을 알 수 없고,
 *    지금 보는 것은 *"가는 길에 잘 잡는가, 필터가 통과할 수 있는가"* 다.
 *    그래야 콜 사이에 **달라진 것이 «길»뿐**이 된다.
 *
 * 🔴 **문제는 화면에 산다.** 실험실 상단이 버튼으로 그리고, 검사(`pnpm lab`)는 **그 버튼을 누른다** —
 *    기사님이 누르는 것과 글자 그대로 같은 것이 돈다 (규칙 ③: 원천 하나).
 */
export interface LabProblem {
    /** 버튼에 적히는 이름 — 짧게 */
    name: string;
    /** 이 문제가 **무엇을 보려고** 있는가 — 눌렀을 때 화면에 적힌다 */
    why: string;
    /** 🎯 목적지 (도 · 시·군·구) */
    dst: { sido: string; sgg: string };
    /** 이 순서대로 잡는다. `confirm: false` 면 **확정하지 않고 심사창에 후보로 남긴다** */
    calls: Array<{
        from: { lng: number; lat: number };
        to: { lng: number; lat: number };
        /** 🗺️ 어디였나 — 읽으려고 적는다. 좌표만 있으면 무슨 판인지 모른다 */
        where: string;
        confirm: boolean;
        /** ↩️ 이 콜부터 **복귀를 켠다** — 기사님 한 바퀴에서 여섯째부터 복귀였다 */
        home?: boolean;
    }>;
}

/**
 * 🚚 **기사님 한 바퀴** — 목적지 파주, 일곱 콜. 카카오 기록의 순서·좌표 그대로다.
 *
 * ⚠️ **하나만 지도 표에서 뽑았다** — 첫 콜의 하차(의정부동). 첫짐이라 «⑮ 합짐 고유» 줄이 없어
 *    좌표가 기록에 안 남았다. 나머지 열셋은 전부 기록에 찍힌 값이다.
 */
export const LAB_CYCLE: LabProblem['calls'] = [
    { where: '양벌동 → 의정부동', confirm: true, from: { lng: 127.28520, lat: 37.37980 }, to: { lng: 127.04510, lat: 37.73830 } },
    { where: '장지동 → 일패동', confirm: true, from: { lng: 127.23830, lat: 37.38800 }, to: { lng: 127.18540, lat: 37.62120 } },
    { where: '천현동 → 문봉동', confirm: true, from: { lng: 127.21380, lat: 37.52880 }, to: { lng: 126.82030, lat: 37.70180 } },
    { where: '도농동 → 가좌동', confirm: true, from: { lng: 127.15470, lat: 37.60100 }, to: { lng: 126.72760, lat: 37.69340 } },
    { where: '관산동 → 대화동', confirm: true, from: { lng: 126.86290, lat: 37.70150 }, to: { lng: 126.74270, lat: 37.66950 } },
    { where: '법곳동 → 무지내동 (복귀)', confirm: true, home: true, from: { lng: 126.71530, lat: 37.66510 }, to: { lng: 126.83960, lat: 37.41410 } },
    { where: '계산동 → 양벌동 (복귀)', confirm: true, home: true, from: { lng: 126.72010, lat: 37.54000 }, to: { lng: 127.28520, lat: 37.37980 } },
];

const PAJU = { sido: '경기', sgg: '파주시' } as const;

export const LAB_PROBLEMS: LabProblem[] = [
    {
        name: '① 첫 콜',
        why: '집 옆 양벌동에서 싣고 의정부로 — 필터를 통과하는가, 색이 나오는가 (한 바퀴의 첫째 콜)',
        dst: PAJU,
        calls: [{ ...LAB_CYCLE[0], confirm: false }],
    },
    {
        name: '② 합짐 하나',
        why: '첫 콜을 잡은 뒤 장지동 콜이 온다 — 기존 콜이 몇 분 밀리는지, 전화할 곳이 나오는가',
        dst: PAJU,
        calls: [LAB_CYCLE[0], { ...LAB_CYCLE[1], confirm: false }],
    },
    {
        name: '③ 노선 다섯',
        why: '노선으로 다섯 콜을 쌓는다 — 순번이 이어지는가, 라인이 서는가',
        dst: PAJU,
        calls: LAB_CYCLE.slice(0, 5),
    },
    {
        name: '④ 한 바퀴',
        why: '노선 다섯 + 복귀 둘 — 기사님이 실제로 돈 하루. 복귀로 접힐 때 그물이 어떻게 되는가',
        dst: PAJU,
        calls: LAB_CYCLE,
    },
];
