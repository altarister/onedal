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

/**
 * 🏠 **하루의 시작 자리 — 표의 「잡은 위치」에서 온다** (기사님 2026-09-10:
 * *"우리 집을 데이터에서 가져오는 건가? 아니면 **표에 콜 잡은 위치**로 잡아 줘"*).
 *
 * 🔴 **집(`NET_SRC`)을 쓰지 않는다.** 그건 «기사님이 사시는 곳»이고, 문제가 필요한 것은
 *    «그날 첫 콜을 잡을 때 서 있던 자리»다. 두 값은 대개 같지만 **다른 질문의 답**이다
 *    (규칙 ⑤-4 ⑤) — 볼트 저녁 판은 집이 아니라 **김포 두원타워**(본업 자리)에서 시작한다.
 * 이 값은 카카오 기록 첫 줄의 `내 위치 127.2940,37.3772` 그대로다.
 */
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


/**
 * 🌆 **볼트 저녁 판** — 8/10(월) 저녁, 김포 두원타워에서 시작해 용인 원삼까지 한 줄로 흘린 하루.
 *    (노하우_추출 「볼트 저녁 판 4건」 표 · 자막 `KpS4RzgFIbA` + 기사님 콜창·앱 캡처)
 *
 * 🔴 **상·하차지는 «동사무소·읍사무소»다** (기사님 확정 2026-09-10:
 *    *"상하차지는 동사무소 읍사무소로 하자"*). 자막·캡처는 **동 이름까지만** 말한다.
 *    동 무게중심을 쓰면 **산속에 찍히는 곳**이 있어 카카오가 길을 못 낸다 —
 *    행정복지센터는 **시가지 한복판**이라 도로에 붙는다. 좌표는 서버 지오코딩으로 뽑았다.
 * 🔴 **잡은 자리 둘이 다르다** — 앞 셋은 **두원타워에 앉은 채로 17:46 동시에**,
 *    넷째는 **검단양촌 나들목에서 달리며 18:10** 에 잡았다. 그래서 사이에 주행이 하나 들어간다.
 * ⚠️ 목적지는 자막이 선언하지 않는다. **용인 원삼**(마지막 하차)을 목적지로 걸어 둔다 —
 *    그게 그날 흐름의 끝이다.
 */
export const LAB_EVENING_START: LabPt = { lng: 126.62448, lat: 37.64492 };   // 김포 두원타워 (본업 자리)

export const LAB_EVENING: LabStep[] = [
    { kind: 'call', where: '양촌읍 → 가산동 (34,650)', confirm: true,
        from: { lng: 126.62550, lat: 37.65713 }, to: { lng: 126.89178, lat: 37.47688 } },
    { kind: 'call', where: '오류동 → 원삼면 (46,200)', confirm: true,
        from: { lng: 126.63762, lat: 37.59704 }, to: { lng: 127.31321, lat: 37.16661 } },
    { kind: 'call', where: '불로동 → 안양 박달동 (34,650)', confirm: true,
        from: { lng: 126.68895, lat: 37.61709 }, to: { lng: 126.90913, lat: 37.40367 } },

    { kind: 'drive', where: '검단양촌 나들목까지 달린다 (18:10)', to: { lng: 126.69848, lat: 37.60265 } },
    { kind: 'call', where: '신검단중앙역 → 안양동 (38,000)', confirm: true,
        from: { lng: 126.69848, lat: 37.60265 }, to: { lng: 126.91783, lat: 37.40510 } },
];

export interface LabProblem {
    name: string;
    /** 이 문제가 **무엇을 보려고** 있는가 — 눌렀을 때 화면에 적힌다 */
    why: string;
    dst: { sido: string; sgg: string };
    /** 📍 하루가 시작하는 자리 — 안 주면 집(초월) */
    start?: LabPt;
    steps: LabStep[];
}

const PAJU = { sido: '경기', sgg: '파주시' } as const;
const YONGIN = { sido: '경기', sgg: '용인시 처인구' } as const;
/** 마지막 콜은 **확정하지 않고 후보로 남긴다** — 심사창이 그때 보인다 */
const upTo = (n: number): LabStep[] => {
    const cut = LAB_STEPS.slice(0, n);
    const last = cut[cut.length - 1];
    return last?.kind === 'call' ? [...cut.slice(0, -1), { ...last, confirm: false }] : cut;
};

export const LAB_PROBLEMS: LabProblem[] = [
    { name: '① 첫 콜', why: '집 옆 양벌동에서 싣고 의정부로 — 필터를 통과하는가, 색이 나오는가', dst: PAJU, steps: upTo(1) },
    { name: '② 합짐 하나', why: '첫 콜을 잡은 뒤 장지동 콜이 온다 — 기존 콜이 몇 분 밀리는지, 전화할 곳이 나오는가', dst: PAJU, steps: upTo(2) },
    /**
     * 🔴 **③ 과 ④ 는 한 짝이다 — 같은 콜, 자리만 다르다** (기사님 2026-09-10:
     *    *"한자리에서 모두 돌리면 필터에 걸려 평가할 것도 없는 거야"*).
     *    ③ 은 집에 앉은 채로 ③천현동을 찍는다 → **떨어져야 한다**(상차 반경 10km 밖).
     *    ④ 는 성남까지 달린 뒤 같은 콜을 찍는다 → **통과해야 한다**.
     *    필터가 일을 안 하면 둘 중 하나가 반드시 어긋난다 — 검사(`pnpm lab`)가 이 짝을 본다.
     */
    { name: '③ 달리기 전', why: '🔴 집에 앉은 채로 ③천현동을 찍는다 — **떨어져야 한다** (상차 반경 밖)', dst: PAJU,
        steps: [LAB_STEPS[0], LAB_STEPS[1], { ...(LAB_STEPS[3] as Extract<LabStep, { kind: 'call' }>), confirm: false }] },
    { name: '④ 달린 뒤', why: '🔴 성남까지 달린 뒤 **같은 콜**을 찍는다 — 이제 **통과해야 한다**', dst: PAJU, steps: upTo(4) },
    { name: '⑤ 한 바퀴', why: '노선 다섯 + 복귀 둘 · 사이사이 주행까지 — 기사님이 실제로 돈 하루 그대로', dst: PAJU, steps: LAB_STEPS },
    {
        name: '⑥ 볼트 저녁',
        why: '🌆 김포 두원타워에 **앉은 채로 셋을 동시에** 잡고, 검단양촌 IC 에서 달리며 넷째를 줍는다 — 볼트 8/10 저녁 그대로',
        dst: YONGIN, start: LAB_EVENING_START, steps: LAB_EVENING,
    },
];
