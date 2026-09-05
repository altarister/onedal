/**
 * 🎬 **한 사이클 시나리오** — 기사님이 2026-09-05 에 통째로 적어 주신 것
 *
 * ── 왜 이 파일이 있나 ──
 * 목업이 지금까지 **장면 하나하나**만 보여 줬다. 그런데 이 제품에서 어려운 것은
 * 장면이 아니라 **차례**다 — 콜이 하나씩 붙을 때마다 정거장 번호가 밀리고, QR 이
 * 담는 곳이 달라지고, 경로 방침 버튼이 잠긴다. **그걸 순서대로 못 보면 확인할 수가 없다.**
 *
 * ── 어디까지가 지금 코드인가 ──
 * 기사님이 세 곳을 짚어 «코드가 맞다»고 확정하셨다 (2026-09-05):
 * | ① | 카카오에 **한 번**(추천) 요청한다 — 경로 셋을 미리 받지 않는다 |
 * | ② | 방침 버튼은 **합짐이 붙어 2건이 되는 순간** 잠긴다 — 첫콜 KEEP 뒤에도 살아 있다 |
 * | ③ | 합짐 경로는 **설정의 기본 방침**으로 계산한다 — 첫콜이 고른 것을 이어받지 않는다 |
 *
 * 🔴 그래서 각 단계의 `gap` 은 **«아직 없는 것»만** 적는다. 있는 것을 없다고 적으면
 *    그게 이 레포가 네 번 당한 «없는 방어를 믿는» 사고다.
 *
 * ── 정거장은 09-03 실주행 그대로다 ──
 * ```
 * 출발(집)   ①초월읍 → ②여수동 → ③석수동 → ④가산동 → ⑤구로동 → ⑥방화동
 *           합짐2상    첫콜상     합짐1상    첫콜하     합짐1하    합짐2하
 * ```
 */

export type ScenarioStep = {
    /** 몇 번째 장면인가 */
    no: number;
    /** 조작판 버튼에 적히는 이름 — 짧게 */
    title: string;
    /** 무슨 일이 일어났나 — 로그에 그대로 나간다 */
    what: string;
    /** 지금까지 **잡은** 콜 수 (0~3) — 정거장이 여기서 파생된다 */
    grabbed: 0 | 1 | 2 | 3;
    /** 몇 정거장을 **다녀왔나** */
    visited: number;
    /**
     * 🚚 **몸이 지금 무엇을 하고 있나** — 서 있나 달리나.
     *
     * 🔴 **«심사»는 여기 들어오면 안 된다** (2026-09-05 정정). 한때 국면에 섞어 뒀더니
     *    「⑪ 주행 중 합짐2 심사」가 **정차로 읽혀** 상태바가 ⏸ 를 달았다 — 달리는 중인데.
     *    심사 중인지는 `seat` 가 이미 말한다. **한 값이 두 질문을 답하지 않는다**
     *    (CLAUDE.md ⑤-4 ⑤).
     */
    phase: '대기' | '주행' | '정차';
    /** 🧭 QR 이 떠 있나 — 담은 곳들의 **정거장 이름**. 마지막이 도착지다 */
    qr?: string[];
    /** 이 장면에서 새로 나온 판정색 */
    color?: '꿀' | '보통' | '똥';
    /** 🔒 경로 방침 버튼이 잠겼나 */
    priorityLocked?: boolean;
    /** 🔴 **아직 코드에 없는 것** — 이 장면이 «되어야 할 모습»을 그리는 부분 */
    gap?: string;
    /**
     * 🪧 **심사석에 올라 있는 콜** — 있으면 필터 자리에 심사석이 뜬다 (실물과 같은 자리).
     *    기사님이 거기서 **KEEP 을 실제로 누르시면** 다음 장면으로 넘어간다.
     */
    seat?: '첫콜' | '합짐1' | '합짐2';
};

export const SCENARIO: ScenarioStep[] = [
    {
        no: 1, title: '① 콜 대기', grabbed: 0, visited: 0, phase: '대기',
        what: '앉아서 콜을 기다립니다. 진행 중인 콜이 없어 시트에도 지도에도 아무것도 없습니다.',
    },
    {
        no: 2, title: '② 첫콜 심사', grabbed: 0, visited: 0, phase: '정차', color: '꿀',
        seat: '첫콜',
        what: '첫콜이 필터를 통과해 서버로 왔습니다. 서버가 카카오에 경로를 한 번(추천) 물어 '
            + '그 경로로 심사합니다 → 🔵 꿀 91. 안전취소 30초가 흐릅니다. '
            + '🔴 아직 잡은 콜이 아니라 목록에도 지도에도 없습니다 — 심사석에만 있습니다.',
    },
    {
        no: 3, title: '③ 첫콜 확정', grabbed: 1, visited: 0, phase: '정차',
        what: 'KEEP 하는 순간 콜이 됩니다 — 경로가 저장되고, 목록에 한 줄이 생기고, 지도에 그려집니다. '
            + '🔓 방침 버튼은 아직 살아 있습니다 — 합짐이 붙기 전까지는 바꾸실 수 있습니다.',
    },
    {
        no: 4, title: '④ 경로를 바꿔 본다', grabbed: 1, visited: 0, phase: '정차',
        what: '지도 좌상단의 「추천 / 시간 / 거리」로 방침을 바꿔 보십시오. 콜이 하나뿐이라 아직 '
            + '열려 있습니다. 🔴 그런데 이 구간에서는 「시간」이 추천과 값이 같습니다 — 09-03 여덟 '
            + '구간 중 일곱이 그랬습니다. 「거리」를 누르면 44.8km / 111분 — 2.7km 짧고 7분 느립니다.',
        gap: '기사님 시나리오는 «고속도로 우선을 누르면 멀어지고 색이 녹색이 된다»였는데, 실측에서는 '
           + '이 구간의 추천과 시간이 같습니다(경로.md §2-2 — 「고속도로 우선」에 딱 맞는 값이 없어 '
           + 'TIME 으로 근사한다). 그리고 판정 스냅샷은 «심사 1회, 불변»이라 확정 뒤 경로를 바꿔도 '
           + '색이 다시 매겨지지 않습니다.',
    },
    {
        no: 5, title: '⑤ QR 코드로 내비 켜기', grabbed: 1, visited: 0, phase: '정차',
        qr: ['여수동', '가산동'],
        what: '「QR 코드」를 누르면 QR 이 뜹니다 — 개인폰 카메라로 찍으면 카카오내비가 켜집니다.',
    },
    {
        no: 6, title: '⑥ 출발 전 — 합짐 대기', grabbed: 1, visited: 0, phase: '정차',
        what: 'QR 을 닫고 아직 출발하지 않은 채 기다립니다 — 합짐 필터가 걸려 있어 '
            + '가는 길의 콜을 하나 더 잡아 보려는 것입니다. '
            + '🔴 그래도 「QR 코드」는 그대로 있습니다 — 첫짐만 잡고 그냥 떠나셔도 됩니다.',
    },
    {
        no: 7, title: '⑦ 합짐1 심사', grabbed: 1, visited: 0, phase: '정차', color: '보통',
        seat: '합짐1',
        what: '첫짐 경로에서 산출된 합짐이 필터를 통과했습니다. 서버가 설정의 기본 방침으로 '
            + '전체 경로를 받아 지도에 그리고, 그 경로로 심사합니다 → 🟢 보통. '
            + '합짐은 점수를 따로 손대지 않고 그대로 심사합니다.',
    },
    {
        no: 8, title: '⑧ 합짐1 확정', grabbed: 2, visited: 0, phase: '정차', priorityLocked: true,
        what: '기사님이 KEEP 하셨습니다. 서버는 뒤에서 이 콜의 단독 경로를 따로 물어 저장하고 '
            + '콜 목록 제목에 넣습니다. 🔒 이제 콜이 2건이라 방침 버튼이 잠깁니다.',
    },
    {
        no: 9, title: '⑨ QR 코드로 내비 켜기', grabbed: 2, visited: 0, phase: '정차', priorityLocked: true,
        qr: ['여수동', '석수동', '가산동', '구로동'],
        what: '네 곳을 한 장에 담습니다 — 앞 셋이 경유지, 마지막이 도착지입니다.',
    },
    {
        no: 10, title: '⑩ 주행 중', grabbed: 2, visited: 0, phase: '주행', priorityLocked: true,
        what: 'QR 을 찍고 달립니다. 시트가 내려가 지도만 남습니다 — 손이 갈 데가 없고, '
            + '맨 아래 한 줄만 먼발치에서 읽힙니다. 이것이 이 제품의 본 화면입니다 (점검표 #31).',
    },
    {
        no: 11, title: '⑪ 주행 중 합짐2 심사', grabbed: 2, visited: 0, phase: '주행', color: '똥',
        seat: '합짐2', priorityLocked: true,
        what: '가다가 합짐2가 왔습니다. 잡으면 순서가 「출발 → ①초월읍 → ②여수동 → ③석수동 → '
            + '④가산동 → ⑤구로동 → ⑥방화동」으로 다시 짜입니다 — 앞에 낄 ①초월읍만큼 뒤가 전부 '
            + '밀립니다. 밀려도 데드라인 150%는 다 지킬 수 있어 🟡 노랑입니다.',
    },
    {
        no: 12, title: '⑫ 합짐2 확정 + 전화', grabbed: 3, visited: 0, phase: '정차', priorityLocked: true,
        what: '기사님이 합짐2를 감수하고 KEEP → 순서가 확정됩니다. 초월읍이 맨 앞에 끼어들어 뒤가 한 칸씩 '
            + '밀렸습니다. 밀린 상차지 둘에 전화할지 판단해서, 많이 늦을 곳에만 겁니다 — '
            + '다행히 늦어도 된다고 합니다.',
        gap: '«어느 상차지에 전화해야 하는가»를 화면이 골라 주는 것은 아직 없습니다.',
    },
    {
        no: 13, title: '⑬ 멈춰서 QR 다시', grabbed: 3, visited: 0, phase: '정차',
        priorityLocked: true, qr: ['초월읍', '여수동', '석수동', '가산동'],
        what: '가는 길에 경로가 바뀌었으니 잠깐 멈춰 QR 을 다시 찍습니다. '
            + '정차할 곳이 먼저 있었다면 거기 도착해서 찍었을 것입니다.',
    },
    {
        no: 14, title: '⑭ 내비가 길을 다시 잡음', grabbed: 3, visited: 3, phase: '주행',
        priorityLocked: true,
        what: '①②③을 지나 ④가산동으로 가는 중, 실시간 경로 변경으로 내비가 길을 다시 잡았습니다. '
            + '지나온 자리는 빼고 현위치 → ④가산동만 바뀝니다. '
            + '관제앱도 «경로에서 폰이 얼마나 멀어졌나»로 그것을 압니다.',
        gap: '주행 중에 합짐 필터가 **바뀐 길** 기준으로 갱신되지는 않습니다 — 지금은 하차 완료 때만 갱신됩니다 (09-03 실측 최대 67분).',
    },
    {
        no: 15, title: '⑮ 길을 잘못 들었다', grabbed: 3, visited: 3, phase: '주행',
        priorityLocked: true,
        what: '길을 잘못 들었습니다. 지나온 경로는 저장돼 있으니 남은 것만(현위치 → ④ → ⑤ → ⑥) '
            + '다시 물어, 지금 가고 있는 길과 가장 닮은 경로를 고릅니다. '
            + '겹치는 부분은 새로 받은 것으로 덮어씁니다.',
        gap: '«가장 닮은 경로를 고른다»와 «겹친 부분만 덮어쓴다»는 아직 없습니다. 지금은 전체를 다시 그립니다.',
    },
    {
        no: 16, title: '⑯ ④가산동 도착', grabbed: 3, visited: 4, phase: '정차',
        priorityLocked: true,
        what: '④가산동에 도착해 하차를 마쳤습니다. 그런데 내비가 «경유지»가 아니라 '
            + '«목적지에 도착하였습니다»라고 합니다 — QR 한 장에 담았던 네 곳을 다 쓴 것입니다.',
    },
    {
        no: 17, title: '⑰ 나머지 QR', grabbed: 3, visited: 4, phase: '정차',
        priorityLocked: true, qr: ['구로동', '방화동'],
        what: '남은 두 곳을 QR 로 다시 받습니다. 이번엔 경유 하나 + 도착 하나입니다.',
    },
    {
        no: 18, title: '⑱ 사이클 끝', grabbed: 3, visited: 6, phase: '정차',
        priorityLocked: true,
        what: '⑤구로동 · ⑥방화동까지 마치고 한 사이클이 끝났습니다.',
    },
];


/* ═════════════════════════════════════════════
   🪧 심사석에 올라가는 콜 — **실물 컴포넌트에 그대로 먹인다**

   기사님(2026-09-05): *"첫심사에 심사 목업 ui가 있으면 좋겠고, 첫짐킵을 추가해주면
   좋겠어, 합짐킵도 있고 주행중 합짐킵도 만들어줘."*

   🔴 **목업용 심사석을 따로 그리지 않는다** — 지도와 같은 원칙이다 (규칙 ③).
      실물 `JudgmentSeat` 에 자료만 먹인다. 그래야 목업에서 정한 것이 실물과 안 갈라진다.
   🔴 **판정색·점수는 시늉이다** — 실제 판정은 서버가 낸다.
      주소·요금·거리는 09-03 실측 그대로다 (`local.db` 의 그 콜들).
   ═════════════════════════════════════════════ */

/** 심사석이 읽는 것만 담는다 — 콜 전체를 흉내 내지 않는다 */
export type SeatCall = {
    id: string;
    type: string;
    status: string;
    pickup: string;
    dropoff: string;
    fare: number;
    distanceKm: number;
    kakaoTimeExt: string;
    capturedDeviceId: string;
    capturedAt: string;
    judgment: {
        color: '꿀' | '보통' | '똥' | '사고';
        score: number | null;
        axes: Array<{ key: string; name: string; score: number | null; weight: number; raw: string; value?: number }>;
        gates: Array<{ key: string; name: string; pass: boolean; why: string | null }>;
        tags: string[];
    };
    approvalReasons: string[];
    rejectionReasons: string[];
};

const seat = (
    id: string, pickup: string, dropoff: string, fare: number, km: number, min: number,
    color: SeatCall['judgment']['color'], score: number, hourly: number,
    good: string[], bad: string[],
): SeatCall => ({
    id, type: 'AUTO', status: 'PENDING_EVALUATION',
    pickup, dropoff, fare, distanceKm: km,
    kakaoTimeExt: `추천거리 ${km}km, 소요 ${min}분`,
    capturedDeviceId: 'mock', capturedAt: '2026-09-03T13:50:11.000Z',
    judgment: {
        color, score,
        axes: [{ key: 'money', name: '시급', score, weight: 1, raw: `${hourly.toFixed(1)}만/h`, value: hourly }],
        gates: bad.length
            ? bad.map((why, i) => ({ key: `g${i}`, name: why, pass: false, why }))
            : [{ key: 'ok', name: '걸리는 것 없음', pass: true, why: null }],
        tags: [],
    },
    approvalReasons: good, rejectionReasons: bad,
});

/** 🪧 심사석에 오르는 넷 — 시나리오 ② ③ ⑦ ⑩ 에서 쓴다 */
export const SEAT_CALLS: Record<'첫콜' | '합짐1' | '합짐2', SeatCall> = {
    첫콜: seat('s-first', '경기 성남시 중원구 여수동 성남시 택시쉼터',
        '서울 금천구 가산동 서서울도시고속도로 서부간선영업소',
        45000, 29.3, 55, '꿀', 91, 4.9,
        ['가는 길에 있음', '상차버퍼 넉넉'], []),
    합짐1: seat('s-merge1', '경기 안양시 만안구 석수동 안양석유주유소',
        '서울 구로구 구로동 경인로53길 111 진일텍푸라',
        35000, 19.0, 34, '보통', 58, 3.2,
        ['우회 8분'], []),
    합짐2: seat('s-merge2', '경기 광주시 초월읍 스타벅스 경기광주초월역DT점',
        '서울 강서구 방화동 양천로 35 강서개화장례식장',
        90000, 52.8, 79, '똥', 41, 2.6,
        ['금액이 큼 9.0만'], ['앞에 끼어 뒤가 34분 밀림', '데드라인 150% 안에는 들어옴']),
};
