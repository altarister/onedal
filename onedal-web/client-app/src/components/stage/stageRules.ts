/**
 * 🧠 **시트 규칙 — v23 Ⅲ표가 곧 이 함수다** (기사님 확정).
 *
 * 무대의 시트가 언제 올라가고 내려가는지를 정하는 **유일한 자리**다.
 * 화면도 타이머도 소켓도 모르는 **순수 함수**라 폰 없이 검사된다 (`stageRules.test.ts`).
 *
 * 🔴 **왜 순수 함수로 두나** — 이 규칙(유예 30초 · 자동올림 · 덱 추종 …)은 자주 바뀐다.
 *    손으로만 확인하면 하나를 뒤집을 때 다른 칸이 조용히 깨진다. 이 레포의 원칙은
 *    *"있는 검사가 안 불리면 없는 것"* 이고, «짧은 구간에서 시트가 안 내려간다» 같은 것은
 *    검사가 있어야 책상에서 잡힌다.
 *
 * 표의 뜻:
 *   · 손(드래그·탭)이 이긴다 — 만진 뒤 30초는 주행·정차·KEEP·도착이 못 바꾼다
 *     (심사 판정과 필터 열림은 손 유예보다 먼저다)
 *   · 자동으로 올린 시트(KEEP·도착)는 «정차»에는 이기고 «주행»에는 진다
 *   · 자동은 **높이만** 바꾼다 — 콜·필터 상태는 건드리지 않으므로 안전하다 (v23 Ⅳ)
 */
/** 🪟 시트의 세 단 — 이름의 원천은 `StageSheet` 의 `SheetSnap` 이다 (규칙 ③) */
/* 🪧 심사 때 시트를 올리는 규칙은 여기 한 곳이 안다 (규칙 ③) */
import { snapOnJudging } from './sheetTransition';
export type Snap = 'peek' | 'list' | 'full';

/** 지금 무대가 받는 신호 — 전부 밖에서 재서 넣는다 */
export interface StageSignals {
    nowMs: number;
    /** 진행 중인 콜 수 */
    calls: number;
    /** 심사 중인 콜이 있나 (S4) */
    judging: boolean;
    /** 🔍 오더 필터 패널이 열려 있나 (판정이 없을 때 시트를 최하단으로 내려 지도 확보) */
    filterOpen?: boolean;
    /** 주행/정차 — GPS 속도의 히스테리시스 결과 */
    drive: 'drive' | 'idle';
    /**
     * 🪧 **지금 시트 높이** — 심사가 뜰 때 «올릴까»를 정하는 데 쓴다.
     *    규칙은 `snapOnJudging` 하나가 안다 (어느 높이에서든 「나」로).
     */
    snap?: 'peek' | 'list' | 'full';
    /**
     * 📍 **지금 곁(100m)에 있는 다녀온 정거장** — `orderId:pickup|dropoff` 꼴.
     *    유예 중 미룬 도착을 다시 물을 때 «아직 그 정거장 곁인가»를 답한다.
     */
    hereStops?: string[];
    /**
     * 🪜 **「나」에 보일 콜 줄이 없나** — 콜 없음 · 지난 콜 숨김으로 전부 가림 (판정 중이면 판정석이 있어 안 빈다).
     *    비어 있는 「나」는 «내용만큼» 서서 「가」와 거의 같은 높이라, 손으로 끌면 «딸깍»으로만 보인다 (기사님 · #147).
     */
    listEmpty?: boolean;
}

/** 규칙이 기억하는 것 — 이것도 밖에 두고 넣고 받는다 (숨은 상태 없음) */
export interface StageMemory {
    /** KEEP·도착이 올린 시트인가 — 정차에는 이기고 주행에는 진다 */
    autoRaised: boolean;
    /** 손이 이기는 유예의 끝 (ms). 0 이면 유예 없음 */
    userHoldUntil: number;
    /**
     * 🏁 **유예 중에 미룬 도착** — `orderId:pickup|dropoff`. 최신 하나만 든다.
     *    유예가 끝나면 이 도착을 다시 묻는다 — «신호»만 다시 물으면 도착 마중이 사라진다.
     */
    pendingArrival?: string | null;
}

export const initialStageMemory = (): StageMemory => ({ autoRaised: false, userHoldUntil: 0, pendingArrival: null });

/** 손이 이기는 시간 — 만지면 이만큼은 자동이 아무것도 못 바꾼다 (v23 Ⅳ) */
export const USER_HOLD_MS = 30_000;

export type StageEvent =
    /** 신호가 바뀌었다 (주행/정차 · 판정 · 콜 수) */
    | { type: 'signal' }
    /** KEEP 직후 — 바로 통화해야 한다 (S5) */
    | { type: 'keep' }
    /** 🕰️ KEEP 한 콜이 목록에 들어왔다 — 늦게 열기도 규칙을 지난다 (#144) */
    | { type: 'keepReady' }
    /** 🪧 새 판정이 떴다 — 손 유예보다 먼저다 (#144) */
    | { type: 'judge' }
    /**
     * 정거장 도착 — 신고 시트가 마중 나간다 (v23 Ⅲ-S7 · 화면규칙 S13).
     *
     * 🔴 **«그 콜»과 «그 단계»를 함께 든다** — v23 원문이 *"focus={그 콜, 그 단계}"* 다.
     *    이것이 없으면 시트만 올라오고 **무엇을 열지 아무도 모른다** (사고).
     */
    | { type: 'arrive'; orderId?: string; stopType?: 'pickup' | 'dropoff' }
    /**
     * 🚪 **완료 행동 — 문을 닫는다** (v23 Ⅳ · 화면규칙 S14).
     *
     * v23 원문: *"통화 완료·시트 저장 → focus 해제 + 시트 자동 복귀
     * **(뒤로가기를 찾을 일 없음)**"*.
     * 🔴 이 길이 없으면 기사님이 **손으로 내리게 되고**, 그 순간 S11 유예(30초)가 걸려
     *    **다음 도착 마중이 조용히 사라진다** (기사님 실측: 도착 여섯 중 셋만 마중).
     *    손은 «내 뜻»이지만 **도착은 차가 한 일**이다 — 둘을 같은 것으로 치면 안 된다.
     */
    | { type: 'done' }
    /** 출발(버튼 또는 국면 전환) — 이제 달린다 */
    | { type: 'depart' }
    /** 지도 정거장·이름표 탭 (S6) */
    | { type: 'tap' }
    /** 손으로 끌었다 */
    | { type: 'drag'; to: Snap };

export interface StageResult {
    mem: StageMemory;
    /** 바꿀 높이. `null` 이면 그대로 둔다 */
    snap: Snap | null;
    /** 왜 그렇게 정했나 — 로그로 남아 GPS 궤적과 대조된다 */
    reason: string;
    /**
     * 손 유예에 걸려 **미룬** 결정인가. 호출부는 유예가 끝나면 다시 물어야 한다 —
     * 안 그러면 유예 중에 온 전환이 영영 사라진다 (시트가 전체에 눌러앉는다).
     */
    deferred: boolean;
}

/**
 * 📋 **신호 처리 우선순위 룰 테이블 (Declarative Priority Rule Table)**
 *
 * 위에서부터 순서대로 조건을 평가하며, 가장 먼저 매칭된 규칙이 시트 높이를 결정한다.
 * 순서 = 우선순위:
 *   1순위: 👑 심사 판정 (최우선 — 결재 버튼 사수, 필터보다 무조건 우선)
 *   2순위: 🔍 필터 열림 (판정 아닐 때 지도 확보를 위해 최하단 peek)
 *   3순위: ⏳ 손 유예 중 (30초 동안 자동 주행/정차 차단)
 *   4순위: 🚗 주행 중 (달릴 때는 지도 집중)
 *   5순위: 🪜 마중 유지 (KEEP·도착으로 올라간 시트 유지)
 *   6순위: 🛑 정차 중 (콜 목록 표시)
 *   7순위: 📭 기본 (콜 없음)
 */
export interface StageRule {
    name: string;
    match: (sig: StageSignals, mem: StageMemory) => boolean;
    resolve: (sig: StageSignals, mem: StageMemory) => {
        snap: Snap | null;
        autoRaised?: boolean;
        userHoldUntil?: number;
        deferred?: boolean;
    };
}

export const SIGNAL_RULES: StageRule[] = [
    // 👑 1순위: 심사 판정 (최우선 — 필터보다 무조건 우선하며 결재석 'list' 사수)
    {
        name: '판정중',
        match: (sig) => sig.judging,
        resolve: (sig) => ({
            snap: snapOnJudging(sig.snap ?? 'peek'),
            autoRaised: false,
            userHoldUntil: 0,
        }),
    },
    // 🔍 2순위: 필터 열림 (판정이 아닐 때 지도를 넓게 보기 위해 최하단 peek)
    {
        name: '필터열림',
        match: (sig) => Boolean(sig.filterOpen),
        resolve: () => ({
            snap: 'peek',
            autoRaised: false,
            userHoldUntil: 0,
        }),
    },
    // ⏳ 3순위: 손 유예 중 (기사님이 손으로 시트를 만진 뒤 30초 동안은 자동 주행/정차가 못 바꿈)
    {
        name: '손 유예 중',
        match: (sig, mem) => sig.nowMs < mem.userHoldUntil,
        resolve: () => ({
            snap: null,
            deferred: true,
        }),
    },
    // 🚗 4순위: 주행 중 (달릴 때는 지도가 주인공)
    {
        name: '주행',
        match: (sig) => sig.drive === 'drive',
        resolve: () => ({
            snap: 'peek',
            autoRaised: false,
        }),
    },
    // 🪜 5순위: 마중 유지 (KEEP·도착으로 올라간 시트는 정차가 끌어내리지 못함)
    {
        name: '마중 유지',
        match: (_sig, mem) => mem.autoRaised,
        resolve: () => ({
            snap: null,
        }),
    },
    // 🛑 6순위: 정차 중 (콜이 있으면 아코디언 목록 확인)
    {
        name: '정차',
        match: (sig) => sig.calls > 0,
        resolve: () => ({
            snap: 'list',
        }),
    },
    // 📭 7순위: 기본 상태 (콜 없음)
    {
        name: '콜없음',
        match: () => true,
        resolve: () => ({
            snap: 'peek',
        }),
    },
];

const out = (mem: StageMemory, snap: Snap | null, reason: string, deferred = false): StageResult =>
    ({ mem, snap, reason, deferred });

/**
 * 🚧 **표의 앞 세 줄만이 «화면을 붙잡는 것»이다** — 판정(1) · 필터 열림(2) · 손 유예(3).
 *
 * 🔴 4순위 아래(주행 · 마중 · 정차 · 콜 없음)는 **«달리 보여드릴 게 없을 때의 기본»** 이라
 *    사건이 이기는 것이 맞다 — 사건은 «방금 일어난 일»이고 그쪽은 «지금 상태»다.
 *    여기까지 밀리면 KEEP 직후 바로 통화(S5)와 도착 마중(S7)이 주행 중에 사라진다.
 */
const HOLDING_RANKS = 3;

/** 🚧 지금 화면을 붙잡고 있는 것의 순위 — 아무것도 안 붙잡고 있으면 `Infinity` */
function holdingRank(sig: StageSignals, mem: StageMemory): number {
    const i = SIGNAL_RULES.findIndex(r => r.match(sig, mem));
    return i >= 0 && i < HOLDING_RANKS ? i + 1 : Infinity;
}

/**
 * 🎫 **사건이 자기 순위를 말한다** — 숫자는 위 표(`SIGNAL_RULES`)의 **같은 줄 번호**다.
 *    `judge` 는 판정을 만드는 사건이라 판정(1)에 안 밀리고, 손이 만드는 `drag`·`tap` 은 손 유예(3)와 같은 줄이다.
 *    `signal` 은 표를 직접 거치므로 이 문을 안 지난다.
 */
const EVENTS: Record<StageEvent['type'], { rank: number; label: string }> = {
    judge:     { rank: 1,        label: '판정' },
    drag:      { rank: 3,        label: '손' },
    tap:       { rank: 3,        label: '탭' },
    keep:      { rank: 4,        label: 'KEEP' },
    keepReady: { rank: 4,        label: 'KEEP 콜 들어옴' },
    arrive:    { rank: 4,        label: '도착' },
    depart:    { rank: 4,        label: '출발' },
    /* 🚪 «통화 완료»·«저장»은 시트 안에서 **손이 누르는** 버튼이라 손 유예(3)와 같은 줄이다 —
          4 로 두면 방금 누르신 버튼이 30초 유예에 밀려 무시된다 (v23 Ⅳ · S14) */
    done:      { rank: 3,        label: '완료' },
    signal:    { rank: Infinity, label: '신호' },
};

/** 🏁 도착이 가리킨 정거장 — 밀려도 **이것만은** 담아 둔다 (`orderId:pickup|dropoff`) */
const arrivalKeyOf = (ev: StageEvent): string | null =>
    ev.type === 'arrive' && ev.orderId && ev.stopType ? `${ev.orderId}:${ev.stopType}` : null;

/**
 * 🎬 **한 걸음** — 지금 신호와 기억, 그리고 방금 일어난 일로 다음 높이를 정한다.
 * 순서가 곧 우선순위다. 위에서 걸리면 아래는 안 본다.
 */
export function stageStep(mem: StageMemory, sig: StageSignals, ev: StageEvent): StageResult {
    /**
     * 🚧 **사건은 일하기 전에 주변을 살핀다** (기사님).
     *
     * 기사님: *"그것들이 자기가 작동하려 할 때 주변 상황을 살피고 우선순위 높은 것이 있으면
     * 우선순위에 밀려 자기의 일을 하지 말아야 하는 거 아냐?"*
     *
     * 🔴 **이 문이 없으면 사건마다 조건을 따로 적게 되고, 하나를 빠뜨리면 조용히 샌다** —
     *    실주행에서 판정 1초 뒤의 「출발」이 결재 버튼을 **17.5초** 가렸다. 표에는 판정이
     *    1순위로 제대로 있었는데 「출발」이 표를 안 거치고 자기 높이를 바로 정했다.
     * 🏁 **밀려도 잊지 않는다** — 도착은 담아 두고, 붙잡은 것이 풀리면 «아직 그 정거장 곁인가»를 다시 묻는다.
     *    나머지는 담을 것이 없다 — 붙잡은 것이 풀리면 `signal` 이 와서 표가 제자리를 찾는다.
     */
    const hold = holdingRank(sig, mem);
    if (ev.type !== 'signal' && hold < EVENTS[ev.type].rank) {
        return out({ ...mem, pendingArrival: arrivalKeyOf(ev) ?? mem.pendingArrival ?? null },
            null, `${EVENTS[ev.type].label}(${SIGNAL_RULES[hold - 1].name}에 밀림)`, true);
    }

    switch (ev.type) {
        case 'judge':
            /* 🪧 새 판정은 손 유예보다 먼저다 — 유예를 끝내고 판정 높이로 (기사님 «1, 2 자리 바꿈» · #144) */
            return out({ ...mem, autoRaised: false, userHoldUntil: 0 }, snapOnJudging(sig.snap ?? 'peek'), '판정중');

        case 'keepReady':
            /* 🕰️ KEEP 사건 때 목록에 없던 콜이 들어왔다 — KEEP 과 같은 자리 (정차면 올라와 열리고 · 주행이면 다음 신호에 내려간다) */
            return out({ ...mem, autoRaised: true }, 'full', 'KEEP 콜 들어옴');

        case 'drag':
            // 손으로 끈 것이 곧 의사 표현이다 — 마중은 끝나고, 30초 유예가 시작된다
            /* 🪜 비어 있는 「나」는 건너뛴다 — 가던 방향으로 한 단 더 (올리면 「다」 · 내리면 「가」) (#147) */
            {
                const to = sig.listEmpty && ev.to === 'list' ? (sig.snap === 'full' ? 'peek' : 'full') : ev.to;
                return out({ ...mem, autoRaised: false, userHoldUntil: sig.nowMs + USER_HOLD_MS }, to, '손');   // 미룬 도착은 든 채로
            }

        case 'tap':
            // 지도에서 콜을 골랐다 — 손짓이므로 유예를 준다 (S6)
            return out({ ...mem, autoRaised: false, userHoldUntil: sig.nowMs + USER_HOLD_MS }, 'full', '탭');

        case 'keep':
            // 킵 직후 바로 통화 — 정차 전환이 끌어내리지 못하게 «자동 올림»으로 표시 (S5)
            return out({ ...mem, autoRaised: true }, 'full', 'KEEP');

        case 'arrive':
            // 신고하는 동안 정차 전환이 못 끌어내린다 — 달리기 시작하면 내려간다 (S7)
            return out({ ...mem, autoRaised: true, pendingArrival: null }, 'full', '도착');

        case 'done':
            /**
              * 🚪 **완료 행동이 문을 닫는다** (v23 Ⅳ · S14) — 통화 완료·저장을 누르면
              *    시트가 스스로 내려간다. 🔴 **유예를 걸지 않는다** — 손으로 끈 것이 아니라
              *    «일을 마친 것»이라, 다음 정거장 도착은 여전히 마중 나가야 한다.
              */
            return out({ ...mem, autoRaised: false, pendingArrival: null }, 'list', '완료');   // 일을 마쳤다 — 미룬 도착도 끝

        case 'depart':
            // 달릴 참이다 — 마중은 끝난다. 주행 감지(10초)를 기다리면 그 사이 지도를 가린다
            return out({ ...mem, autoRaised: false }, 'peek', '출발');

        case 'signal':
        default: {
            /* 🏁 붙잡은 것이 풀렸다 — 미룬 도착이 있고 **아직 그 정거장 곁이면** 도착으로 올린다. 떠났으면 조용히 잊는다 (한 번만 묻는다) */
            if (hold === Infinity && mem.pendingArrival) {
                const key = mem.pendingArrival;
                mem = { ...mem, pendingArrival: null };
                if (sig.hereStops?.includes(key)) return out({ ...mem, autoRaised: true }, 'full', '도착(유예 뒤)');
            }

            const rule = SIGNAL_RULES.find(r => r.match(sig, mem))!;
            const res = rule.resolve(sig, mem);
            return out(
                {
                    ...mem,
                    autoRaised: res.autoRaised !== undefined ? res.autoRaised : mem.autoRaised,
                    userHoldUntil: res.userHoldUntil !== undefined ? res.userHoldUntil : mem.userHoldUntil,
                },
                res.snap,
                rule.name,
                res.deferred ?? false
            );
        }
    }
}
