/**
 * 🧪 **콜 문제 목록** (기사님 확정 2026-09-10: *"콜 문제로 만들어 돌릴 수 있게"* ·
 * *"**나도 화면에서 볼 수 있게** 만들어 줘야지"*).
 *
 * 🔴 **문제는 화면에 산다.** 처음엔 검사 스크립트 안에 좌표를 박았는데, 그러면
 *    **나만 돌릴 수 있다** — 기사님은 같은 화면을 못 보신다. 그건 문제가 아니라 내 메모다.
 *    그래서 목록을 여기 두고 **화면이 버튼으로 그린다.** 검사(`pnpm lab`)는 그 버튼을 누른다 —
 *    기사님이 누르는 것과 **글자 그대로 같은 것**이 돈다 (규칙 ③: 원천 하나).
 *
 * 🔴 좌표는 **경위도**다. 픽셀로 두면 창 크기·줌이 바뀔 때 다른 자리를 누른다.
 */
export interface LabProblem {
    /** 버튼에 적히는 이름 — 짧게 */
    name: string;
    /** 이 문제가 **무엇을 보려고** 있는가 — 눌렀을 때 화면에 적힌다 */
    why: string;
    /** 📍 내 위치 */
    me: { lng: number; lat: number };
    /** 🎯 목적지 (도 · 시·군·구) */
    dst: { sido: string; sgg: string };
    /** 이 순서대로 확정한다. 마지막 하나는 **확정하지 않고 후보로 남긴다** */
    calls: Array<{
        pickup: { lng: number; lat: number };
        drop: { lng: number; lat: number };
        /** 확정까지 갈 것인가 — `false` 면 심사창에 후보로 남는다 */
        confirm: boolean;
        /** 🗺️ 어디였나 — 읽으려고 적는 것이지 돌릴 때 쓰는 값이 아니다 */
        where?: string;
    }>;
}

/**
 * 🔴 **요금·짐은 문제에 안 적는다** (기사님 확정 2026-09-10) — 늘 20만원·1박스다.
 *    지도 클릭으로 만든 콜은 가격을 알 수 없고, 지금 보는 것은 **«가는 길에 잘 잡는가»** 다.
 */

/** 초월(집) 부근 — 기사님 자리 */
const HOME = { lng: 127.294001, lat: 37.377178 };

export const LAB_PROBLEMS: LabProblem[] = [
    {
        name: '① 첫짐 20만',
        why: '첫짐 하나 — 색이 나오고, «첫짐 — 밀릴 콜이 없다»가 뜨는가',
        me: HOME,
        dst: { sido: '경기', sgg: '파주시' },
        calls: [{ pickup: { lng: 127.2555, lat: 37.4088 }, drop: { lng: 127.1445, lat: 37.5122 }, confirm: false }],
    },
    {
        name: '② 합짐 둘',
        why: '한 콜을 잡은 뒤 합짐 후보 — 기존 콜이 몇 분 밀리는지 보이는가',
        me: HOME,
        dst: { sido: '경기', sgg: '파주시' },
        calls: [
            { pickup: { lng: 127.2555, lat: 37.4088 }, drop: { lng: 127.1445, lat: 37.5122 }, confirm: true },
            { pickup: { lng: 127.0620, lat: 37.5560 }, drop: { lng: 126.8900, lat: 37.6510 }, confirm: false },
        ],
    },
    {
        name: '③ 늦는 합짐',
        why: '약속을 크게 깨는 합짐 — 색이 사고로 가고 ☎️ 전화할 곳이 나오는가',
        me: HOME,
        dst: { sido: '경기', sgg: '파주시' },
        calls: [
            { pickup: { lng: 127.2555, lat: 37.4088 }, drop: { lng: 127.1445, lat: 37.5122 }, confirm: true },
            /** 🔴 **정반대(남쪽)로 크게 도는 콜** — 앞 콜의 약속을 깨야 «늦는다»가 보인다 */
            { pickup: { lng: 127.0500, lat: 37.1400 }, drop: { lng: 126.8300, lat: 37.0100 }, confirm: false },
        ],
    },
    {
        name: '④ 콜 셋 · 주행',
        why: '콜 셋을 잡고 달린다 — 지나온 정거장이 회색으로 가라앉는가',
        me: HOME,
        dst: { sido: '경기', sgg: '파주시' },
        calls: [
            { pickup: { lng: 127.2555, lat: 37.4088 }, drop: { lng: 127.1445, lat: 37.5122 }, confirm: true },
            { pickup: { lng: 127.0620, lat: 37.5560 }, drop: { lng: 126.8900, lat: 37.6510 }, confirm: true },
            { pickup: { lng: 126.9800, lat: 37.6100 }, drop: { lng: 126.7700, lat: 37.7400 }, confirm: true },
        ],
    },
];
