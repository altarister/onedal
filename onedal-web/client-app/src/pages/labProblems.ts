/**
 * 🧪 **콜 문제 — 기사님이 실제로 돈 한 바퀴** (2026-09-10).
 *
 * 🔴 **한자리에서 일곱 콜을 다 잡는 것은 문제가 아니다** (기사님:
 *    *"한자리에서 모두 돌리면 **필터에 걸려 평가할 것도 없는** 거야.
 *    당연히 **주행을 넣어야** 테스트가 되는 거야. 생각을 해야지."*).
 *    콜을 잡는 사이사이에 **기사님이 달린다** — 그래서 다음 콜이 내 위치 반경에 들어온다.
 *    주행을 빼면 뒤 콜들은 애초에 «상차 반경 밖»이라 필터가 떨어뜨린다. 평가할 것이 없다.
 *
 * 🔴 **주행 기록도 로그에 있었다.** 카카오 호출의 «⑮ 합짐 고유» 줄 머리가
 *    `내 위치 x,y` 다 — **그 콜을 잡던 순간 기사님이 서 있던 자리**다. 그대로 옮겼다:
 *      초월읍(집) → 성남 은행동 → 서울 강일동 → 고양 선유동 → 일산 풍동 → 계양 노오지동
 *
 * 🔴 좌표는 전부 **기록에 찍힌 값**이다 — 동 중심점으로 바꾸지 않았다.
 *    ⚠️ 하나만 지도 표에서 뽑았다(①하차 의정부동) — 첫짐이라 «⑮» 줄이 없어 기록에 없다.
 * 🔴 **요금·짐은 안 적는다** — 늘 20만원·1박스다. 지금 보는 것은
 *    *"가는 길에 잘 잡는가, 필터가 통과할 수 있는가"* 라 **달라진 것이 «길»뿐**이라야 한다.
 */

/** 지점 하나 */
export interface LabPt { lng: number; lat: number }

/**
 * 한 걸음 — **달리거나(이벤트) · 콜을 잡거나** 둘 중 하나다.
 * 화면은 이 순서 그대로 **왼쪽에 이벤트 · 오른쪽에 콜**로 늘어놓는다 (기사님 2026-09-10).
 */
export type LabStep =
    | { kind: 'drive'; to: LabPt; where: string; home?: boolean }
    | { kind: 'call'; from: LabPt; to: LabPt; where: string; confirm: boolean };

/** 🏠 하루의 시작 — 집(초월) */
export const LAB_START: LabPt = { lng: 127.29400, lat: 37.37720 };

/**
 * 🚚 **기사님 한 바퀴** — 목적지 파주, 노선 다섯 + 복귀 둘.
 * 로그 시각 20:31:17 ~ 20:34:56 의 순서 그대로다.
 */
export const LAB_STEPS: LabStep[] = [
    { kind: 'call', where: '양벌동 → 의정부동', confirm: true, from: { lng: 127.28520, lat: 37.37980 }, to: { lng: 127.04510, lat: 37.73830 } },
    { kind: 'call', where: '장지동 → 일패동', confirm: true, from: { lng: 127.23830, lat: 37.38800 }, to: { lng: 127.18540, lat: 37.62120 } },

    { kind: 'drive', where: '성남 은행동까지 달린다', to: { lng: 127.17800, lat: 37.46130 } },
    { kind: 'call', where: '천현동 → 문봉동', confirm: true, from: { lng: 127.21380, lat: 37.52880 }, to: { lng: 126.82030, lat: 37.70180 } },

    { kind: 'drive', where: '서울 강일동까지 달린다', to: { lng: 127.17350, lat: 37.56250 } },
    { kind: 'call', where: '도농동 → 가좌동', confirm: true, from: { lng: 127.15470, lat: 37.60100 }, to: { lng: 126.72760, lat: 37.69340 } },

    { kind: 'drive', where: '고양 선유동까지 달린다', to: { lng: 126.91860, lat: 37.67970 } },
    { kind: 'call', where: '관산동 → 대화동', confirm: true, from: { lng: 126.86290, lat: 37.70150 }, to: { lng: 126.74270, lat: 37.66950 } },

    { kind: 'drive', where: '일산 풍동까지 · ↩️ 복귀 켬', to: { lng: 126.80700, lat: 37.66420 }, home: true },
    { kind: 'call', where: '법곳동 → 무지내동', confirm: true, from: { lng: 126.71530, lat: 37.66510 }, to: { lng: 126.83960, lat: 37.41410 } },

    { kind: 'drive', where: '계양 노오지동까지 달린다', to: { lng: 126.75590, lat: 37.58000 } },
    { kind: 'call', where: '계산동 → 양벌동', confirm: true, from: { lng: 126.72010, lat: 37.54000 }, to: { lng: 127.28520, lat: 37.37980 } },
];

export interface LabProblem {
    name: string;
    /** 이 문제가 **무엇을 보려고** 있는가 — 눌렀을 때 화면에 적힌다 */
    why: string;
    dst: { sido: string; sgg: string };
    steps: LabStep[];
}

const PAJU = { sido: '경기', sgg: '파주시' } as const;
/** 마지막 콜은 **확정하지 않고 후보로 남긴다** — 심사창이 그때 보인다 */
const upTo = (n: number): LabStep[] => {
    const cut = LAB_STEPS.slice(0, n);
    const last = cut[cut.length - 1];
    return last?.kind === 'call' ? [...cut.slice(0, -1), { ...last, confirm: false }] : cut;
};

export const LAB_PROBLEMS: LabProblem[] = [
    { name: '① 첫 콜', why: '집 옆 양벌동에서 싣고 의정부로 — 필터를 통과하는가, 색이 나오는가', dst: PAJU, steps: upTo(1) },
    { name: '② 합짐 하나', why: '첫 콜을 잡은 뒤 장지동 콜이 온다 — 기존 콜이 몇 분 밀리는지, 전화할 곳이 나오는가', dst: PAJU, steps: upTo(2) },
    { name: '③ 달려서 셋째', why: '🔴 성남까지 달린 뒤에야 천현동이 내 위치 반경에 든다 — 주행이 없으면 이 콜은 필터에서 떨어진다', dst: PAJU, steps: upTo(4) },
    { name: '④ 한 바퀴', why: '노선 다섯 + 복귀 둘 · 사이사이 주행까지 — 기사님이 실제로 돈 하루 그대로', dst: PAJU, steps: LAB_STEPS },
];
