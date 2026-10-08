import { businessDayKey } from './timing';
export * from './paymentTypes';
import { isTerminal, isEvaluating } from './callStatus';
export * from './callStatus';
export * from './milestones';
export * from './cargoReport';
import { isTargetApp, DEFAULT_TARGET_APP } from './targetApps';
import type { SecuredOrder } from './orderShapes';
export * from './dispatchApi';
export * from './deviceModes';
export * from './screenKinds';
export * from './deviceSession';
export * from './orderShapes';
export * from './dispatchFilter';

export { LET_GO_STATUSES, isLetGoStatus, type LetGoStatus, DECISION_STATUSES, type DecisionStatus } from './orderStatuses';

export * from './deviceOffline';

export * from './targetApps';

export * from './callBands';
export * from './modeTable';
export * from './bleProtocol';
export * from './openBlocked';
export * from './mask';
export * from './format';
export * from './mapTile';
export * from './replies';
export * from './filterTally';
export * from './jsonArray';
export * from './verdict';
export * from './routeReuse';
export * from './fuelCost';
export * from './vehicles';
export * from './deviceLink';
export * from './releases';
export * from './allowance';
export * from './regionMatch';
export * from './pricing';
export * from './phases';
export * from './ops';
export * from './anomalyKinds';
export * from './join';
export * from './callTargetDay';
export * from './pickupList';
export * from './filterArea';
export * from './cargoHints';
export * from './cargoTags';
export * from './cargoUnits';

/**
 * 관제탑으로 보내는 오더 스냅샷.
 * **진행 중과 종료된 것을 나눠서** 보낸다 — 한 배열로 보내면 받는 쪽이 거르기를 잊는다.
 */
/**
 * 이미 상차한 콜인가 — **이 판단은 여기 한 곳에만 둔다.**
 *
 * 🔴 server/routeComposer 와 관제웹이 **같은 정의**를 봐야 지도와 경로가 갈라지지 않는다.
 *
 * 기사님 원칙 그대로 — **KEEP 은 예약이고 상차가 적재다.** 짐을 실었으면 남은 일은 하차뿐이다.
 */
export function isAlreadyLoaded(c: { status?: string | null }): boolean {
    return c.status === 'ORDER_PICKED_UP';
}

/**
 * 🚏 **이 정거장에 이미 다녀왔는가 — 판단은 여기 하나뿐이다** (기사님 확정).
 *
 * 기사님: *"현실에서는 내가 지나온 것은 무시할 것 같은데."*
 *
 * 🔴 **경로 조립과 시각 계산이 이 판단 하나를 쓴다** — 둘로 나뉘면(버튼 vs GPS) 상차 완료를 안 누른 콜이
 *    이미 지나온 상차지로 되돌아가는 경로를 만들어 **없는 우회 비용**을 문다.
 *
 * **GPS 도착이면 다녀온 것이다.** 도착 감지는 500m 안에 들어와야 찍히므로 "거기 갔다"는
 * 뜻이고, **가는 길**은 더 필요 없다.
 *
 * ⚠️ `isAlreadyLoaded`(실었는가)와 **다른 질문**이다. 도착했지만 아직 안 실은 상태가 있고,
 *    그때 단계는 여전히 "상차 완료" 대기다 — 단계는 `isAlreadyLoaded` 로 묻는다.
 *    여기는 오직 **"경로에 남겨 둘 이유가 있는가"** 만 답한다.
 *
 * 📦 적재 계산(«함께 실리는 최대» `peakLoadPoints`)은 이 답으로 **실린 것(loaded)** 을 가른다 — 상차지에 와 있는 콜은
 *    남은 경로 맨 앞에서 실리므로 처음부터 짐에 넣는다. 경로가 뺀 상차를 따로 세면 순서가 콜 전부를 못 덮어
 *    다 더한 값으로 물러선다.
 */
export function hasVisitedStop(
    c: { status?: string | null; arrivedPickupAt?: string | null; arrivedDropoffAt?: string | null },
    stopType: 'pickup' | 'dropoff',
): boolean {
    if (stopType === 'pickup') {
        return !!c.arrivedPickupAt || c.status === 'ORDER_PICKED_UP' || c.status === 'ORDER_DELIVERED';
    }
    return !!c.arrivedDropoffAt || c.status === 'ORDER_DELIVERED';
}

/**
 * 🪧 **심사석에 앉힐 콜** — 평가·미리보기 중인 것 하나 (덱에서는 뺀다).
 *
 * 🔴 **술어는 여기 하나다** (0831 리뷰에서 잡힘). 파생 제조소와 대시보드가 글자까지 같은
 *    식을 각자 들고 있었다 — 한쪽에 조건이 붙는 순간 «심사석에 뜬 콜»과 «덱에서 빠진 콜»이
 *    달라진다. 그 둘은 반드시 같은 콜이어야 한다 (규칙 ③).
 */
export function judgingCallOf<T extends { status?: string | null; isPreview?: boolean }>(
    calls: T[],
): T | undefined {
    return calls.find(c => {
        const s = c.status ?? undefined;
        if (isTerminal(s)) return false;
        // 🛡️ 이미 배차가 확정되었거나 운행 중인 콜은 심사 대상이 아니다 (잔여 isPreview 플래그 방어)
        if (s === 'ORDER_CONFIRMED' || s === 'ORDER_PICKED_UP' || s === 'ORDER_DELIVERED') return false;
        return isEvaluating(s) || !!c.isPreview;
    });
}

/**
 * 🔄 **이번 운행에서 "한 일"인가** — 하차·정산 완료만이다.
 *    취소·방출은 종결(`isTerminal`)이지만 **없던 일**이라 여기 안 든다.
 */
export function isDeliveredCall(c: { status?: string | null }): boolean {
    return c.status === 'ORDER_DELIVERED' || c.status === 'ORDER_COMPLETED';
}

/**
 * 🗓️ **시트의 카드 목록 — 오늘 한 일** (기사님 결정 «시트는 오늘 한 일을 남긴다 · 화면의 사이클 = 하루»).
 *
 * 처음엔 «진행 중이 남은 동안만 하차분을 함께» 보여 줬고(6단계 채운 모습을 보려고),
 * #40에서 «이번 운행 — 진행 중 콜을 잡기 전에 내린 것은 뺀다»로 좁혔다. 그래서 콜 사이 빈 차가 될 때마다
 * 오늘 한 일이 통째로 사라졌다. 이제 경계는 **자정 하나**다 — 오늘 하차한 콜은 진행 중이 0건이어도, 운행이 끊겼다 이어져도 남는다.
 *
 * 경계는 저장하지 않고 하차 시각에서 파생한다 (규칙 ③ · `businessDayKey` — 서버 `ensureBusinessDay` 와 같은 선).
 * ⚠️ **하차 시각을 모르면 남긴다.** 없는 값으로 카드를 지우지 않는다 (규칙 ④).
 * ⚠️ 시각은 **날짜로** 비교한다 — 장부의 두 칸은 표기가 달라(`+09:00` · `Z`) 문자열로 비교하면 뒤집힌다.
 * 🔴 **상태는 콜별 즉시, 화면만 하루 단위.** 하차의 운임은 그 순간 발생한다.
 * ⚠️ 이 목록은 **화면 전용**이다. 경로·적재·운임·카운트다운은 진행 중인 콜만 본다 (`TERMINAL_STATUSES` 주석의 사고).
 * ⚠️ 이름은 옛 «사이클»을 그대로 둔다 — 짝 여럿이 이 이름을 문다. 뜻은 «하루»다.
 */
export function deckOfCycle<T extends { status?: string | null; capturedAt?: string; completedAt?: string | null }>(calls: T[], nowMs: number = Date.now()): T[] {
    const inProgress = calls.filter(c => !isTerminal(c.status ?? undefined));
    const today = businessDayKey(nowMs);
    const doneToday = (c: T) => {
        const t = Date.parse(c.completedAt ?? '');
        return Number.isNaN(t) || businessDayKey(t) === today;
    };
    return [...inProgress, ...calls.filter(c => isDeliveredCall(c) && doneToday(c))]
        .sort((a, b) => (a.capturedAt ?? '').localeCompare(b.capturedAt ?? ''));
}

/**
 * 📍 **단계 사유 — 그때 무슨 일이 있었나** (기사님 확정).
 *
 * 🔴 **단계마다 관심사가 다르다.** 기사님: *"상차지 도착에서는 단위·수량·방법·보호·성질
 *    이것들이 모두 없어야 하는 거 아닌가? 상차지 도착에 관한 것만 있으면 될 것 같은데.
 *    이동 중에 문제가 없었는지, 상차지에 문제(주소 다름·점심시간) 뭐 그런 것들."*
 *
 *   상차지 도착 — 오는 길 + 그 장소            (아직 문을 열기 전이다)
 *   상차 완료   — 화주·짐                      (여기서 비로소 실어 본다)
 *   하차지 도착 — 오는 길 + 그 장소 + **짐 상태** (문을 열면 보인다)
 *   하차 완료   — 인수 단계
 *
 * 🔴 **이 값은 아무것도 판정하지 않는다** — 색·필터·약속과 무관하다. 겪은 일을 적어 두는
 *    칸일 뿐이라 목록이 아직 **가설**이어도 안전하다 (기사님: *"유튜브에서 본 것이 전부야"*).
 *
 * 🔴 **`기타` 를 반드시 둔다.** 목록 밖의 일이 어디에도 안 남으면 **목록을 고칠 근거
 *    자체가 사라진다.** 한 달쯤 뒤 "한 번도 안 쓴 사유"와 "기타로 적힌 것"을 세어 고친다.
 *
 * ⚠️ `수량 다름` 은 넣지 않는다 (기사님 확정: *"3 실측폼"*). 실측 폼에 실제 수량을 적으면
 *    `cargoMismatchRatio` 가 신고와의 차이를 **스스로 센다** — 사유로 또 적으면 같은 사실이
 *    두 곳에 살고 갈라진다 (규칙 ③).
 */
/**
 * 🗂️ **갈래로 묶는다** (기사님 확정).
 *
 * 기사님: *"모든 종류의 트러블이 하나에 모여 있어서 찾기 너무 어렵고 추가하기도 좀
 * 그렇다. 도로문제 / 상차지문제 / 기타 이런 식으로 카테고리로 나누어 표시하는 것이
 * 좋을 것 같은데. 어느 정도 높이가 시트마다 비슷해야 버튼 찾기도 좋으니까."*
 *
 * 한 줄에 쏟아 두면 찾는 데 시간이 걸리고 **늘릴 자리도 없다.** 묶어 두면 눈이 먼저
 * 갈래를 고르고, 사유를 더해도 그 갈래 안에서 자란다 — 목록이 가설이라 늘어날 것을
 * 전제로 짜야 한다.
 */
const ROAD_TROUBLE = ['교통 지연', '사고', '진입 곤란'] as const;   // 오는 길 — 도착 단계에만

const REASON_GROUPS_BY_STEP: Record<string, ReadonlyArray<{ label: string; reasons: readonly string[] }>> = {
    /** 오는 길 + 그 장소. 짐 이야기는 없다 — 아직 문을 못 열었다 */
    ARRIVE_PICKUP: [
        { label: '도로 문제', reasons: ROAD_TROUBLE },
        { label: '상차지 문제', reasons: ['주소 다름', '점심시간', '문 잠김'] },
    ],
    /** 실어 본 뒤에야 아는 것 */
    LOADED: [
        { label: '상차 문제', reasons: ['화주 미준비', '물건 없음', '상차 중 파손'] },
    ],
    /** 오는 길 + 그 장소 + 짐 상태 (문을 열면 보인다 — 하차 완료는 이미 내린 뒤라 늦다) */
    ARRIVE_DROPOFF: [
        { label: '도로 문제', reasons: ROAD_TROUBLE },
        { label: '하차지 문제', reasons: ['주소 다름', '수령인 부재'] },
        { label: '짐 상태', reasons: ['짐 무너짐', '결박 풀림', '파손 발견'] },
    ],
    /** 인수 단계 */
    DELIVERED: [
        { label: '하차 문제', reasons: ['검수 지연', '인수 거부'] },
    ],
};

/** 이것을 고를 때만 메모를 받는다 — 자유 입력 금지 원칙의 유일한 예외 (근거는 위) */
export const REASON_NEEDS_MEMO = '기타';

/** 이 **단계**의 사유 갈래 — `기타` 는 언제나 마지막 갈래로 따로 선다 */
export function arrivalReasonGroupsFor(stepId: string): Array<{ label: string; reasons: string[] }> {
    const own = REASON_GROUPS_BY_STEP[stepId];
    if (!own) return [];
    return [
        ...own.map(g => ({ label: g.label, reasons: [...g.reasons] })),
        { label: '기타', reasons: [REASON_NEEDS_MEMO] },
    ];
}

/** 갈래를 펼친 평면 목록 (검사·저장 검증용) */
export function arrivalReasonsFor(stepId: string): string[] {
    return arrivalReasonGroupsFor(stepId).flatMap(g => g.reasons);
}

export const ARRIVAL_REASONS = Array.from(new Set(
    Object.keys(REASON_GROUPS_BY_STEP).flatMap(arrivalReasonsFor),
));

/**
 * 📍 **마지막으로 아는 자리 — «내가 지금 어디 있나»의 답**.
 *
 * 🔴 **낡아도 집으로 바꾸지 않는다.** 터널·주차장에서 5분 끊긴 것뿐인데 지도가 집으로
 *    날아가면, 운전 중 1~2초 흘끗 보는 화면이 통째로 튄다. **그물은 더 심하다** —
 *    이천에 있는데 파주 콜이 올라온다 (기사님 확정: 지도·그물 둘 다 «마지막 실제 위치»).
 * 🔴 모르면 **`null`** 이다 — 집을 지어내지 않는다 (규칙 ④).
 */
export interface DriverPositionDto {
    x: number; y: number;
    /** 받은 시각 (ms) */ at: number;
    /** 얼마나 묵었나 (ms) — 화면이 «N분 전»을 적는 재료 */ ageMs: number;
    /** 기점으로 쓰기엔 낡았나 (서버 문턱 5분) */ isStale: boolean;
    source: 'gps' | 'mock' | 'manual';
}

/**
 * 🧭 **경로를 어디서부터 짰나 — 위와 다른 질문이다** (규칙 ⑤-4 ⑤).
 *    출발점이 없으면 계산 자체가 안 되므로 낡으면 **집**을 넣는다. 그 규칙은 실제
 *    사고에서 나왔다 (여주에서 4시간 25분 뒤 광주 콜의 경로가 40km 뒤에서 그려졌다).
 *    🔴 **이 값으로 «내 위치» 마커를 찍지 않는다** — 그러면 화면이 «집에 있다»고 거짓말한다.
 */
export interface RouteOriginDto {
    x: number; y: number;
    source: 'gps' | 'mock' | 'manual' | 'home';
    /** 🏠 «집 주소로 대신했다» — 화면이 그 사실을 말할 수 있게 */
    isFallback: boolean;
}

export interface OrderSyncPayload {
    active: SecuredOrder[];
    terminated: SecuredOrder[];
    /**
     * 🧭 **경로 기점 — 정거장 순서(`routeStops`)를 짠 그 자리**.
     *    같이 와야 «1번 정거장이 내 뒤에 있다» 같은 화면이 안 난다.
     *
     * ⚠️ **«내 위치»는 여기 없다** — 이 봉투는 «콜이 바뀔 때» 나가는데 위치는 1초마다
     *    바뀐다. 함께 실으면 **옛 좌표가 내 점을 뒤로 당겨** 모의 주행이 멈춘 것처럼
     *    보인다 (기사님 실측). 위치는 `driver-position` 이벤트로 따로 간다 (규칙 ⑤-4 ③).
     *    🔴 이 봉투를 1초마다 보내는 길은 막혀 있다 — **초당 474KB 사고 자리**다.
     * ⚠️ 옛 서버는 안 싣는다 — `undefined` 면 화면이 «모른다»로 그린다.
     */
    /**
     * 📅 **예약 보관 — 내일 이후 콜**. 오늘 목록(`active`)에는 없다 — 관제웹 «📅 예약» 칸만 그린다.
     * ⚠️ 옛 서버는 안 싣는다.
     */
    reserved?: SecuredOrder[];
    routeOrigin?: RouteOriginDto | null;
    /**
     * 🚫 취소 카운터 — **한 판(10회)에서 몇 번 썼나** (기사님 개정).
     * 망별(targetApp) SAFE_CANCEL 건수. 파생값이라 저장하지 않고 서버가 장부에서 센다.
     *
     * ⚠️ **리셋 시각 이후만** 센다 — 전 기간을 누적하면 `47/10` 처럼 한도를 몇 배씩 넘긴 숫자가 떠
     *    *"조여라"* 도 *"괜찮다"* 도 알려 주지 못한다 — 총량은 `cancelRounds` 가 지킨다.
     */
    cancelCounts?: Record<string, number>;
    /**
     * 🚫 **몇 판째인가** (망별). 한 판 = `CANCEL_BUDGET_PER_ROUND` 회.
     *
     * 🔴 *"취소는 리셋되지 않는다"* 는 원칙을
     *    지키는 자리다. 그 취지는 **총량이 사라지면 안 된다**는 것이지 "숫자가 영원히
     *    커져야 한다"가 아니다. 판수가 남으므로 총량은 `(판수-1)×10 + 카운트` 로 그대로 산다.
     */
    cancelRounds?: Record<string, number>;
    /**
     * 🧭 **경로 순서의 원천 — 서버 하나다** (기사님 동의).
     * 방문 순서대로의 정거장 목록. 관제웹은 자기 TSP 를 돌리지 않고 이걸 그대로 그린다
     * (두 벌이면 ETA 가 엉뚱한 정거장에 붙는다 — "파생값 두 벌" 사고 클래스).
     * 빈 배열은 "정거장 없음"이 아니라 "경로 미연산/고장"일 수 있다 — 콜 자체는 그린다.
     */
    routeStops?: RouteStopInfo[];
    /**
     * 경로를 계산한 시점 — 타임라인 추정 약속의 기준 = **카카오호출시점**. 지금 시각을 기준으로 쓰면
     * 추정 약속이 매초 미래로 밀려 카운트다운이 영원히 "30분 남음"에 머문다.
     */
    routeComputedAt?: string | null;
    /**
     * 🧭 **지금 경로를 든 콜의 id** (기사님 확정 · 잔상 수리).
     *
     * 폴리라인은 «홀더» 한 콜에만 실린다. 관제웹이 홀더를 추측하면 KEEP 직후처럼 갈리는 순간에
     * **직전 콜의 옛 선**을 그린다 — 이름을 실어 추측을 없앤다 (규칙 ③).
     * 🔴 폴리라인 자체를 여기 담지 않는다 — 콜에 이미 있는 것을 한 벌 더 만들면
     *    payload 가 두 배가 되고(초당 237KB 사고) 파생이 두 벌이 된다.
     */
    routeHolderId?: string | null;
    /**
     * 🟡 **심사 중인 콜의 «미리보기 궤적» 홀더** (기사님 실물).
     *
     * 위 `routeHolderId` 는 **주행분(`sectionDriveMin`)이 있는 콜**을 가리키는데,
     * 그 값은 KEEP 뒤에 채워져 **심사 중 30초 동안은 없다.** 그 사이 카카오 궤적은
     * 이미 콜에 실려 있는데도 아무도 안 가리켜, 화면이 «경로가 없을 때만 그리는»
     * 직선 보조선을 그렸다 (기사님: *"점선으로 궤적이 나와야 하는데 또 직선으로 나온다"*).
     *
     * 한 값이 두 질문을 답하고 있었다 (규칙 ⑤-4 ⑤) — **타임라인**과 **그림**은 다른 질문이다.
     * 그래서 갈랐다. 합치면 심사 중 콜의 빈 주행분이 타임라인을 폴백으로 돌린다.
     */
    previewRouteHolderId?: string | null;
}

/** 경로 위의 정거장 하나 — 어느 콜의 어느 쪽을 몇 분 주행 뒤에 가는가 */
/**
 * 🚫 **취소 예산 한 판의 크기** (기사님 확정).
 *
 * 배차망이 세는 취소 한도다.
 * 🔴 서버와 관제웹이 이 값 하나를 본다 — 서버가 "다 썼다"를 판정하려면 같은 값을 봐야 하고, 두 벌이면 갈라진다.
 */

export const CANCEL_BUDGET_PER_ROUND = 10;

export interface RouteStopInfo {
    orderId: string;
    stopType: 'pickup' | 'dropoff';
    /** 출발점(현위치)에서 이 정거장까지 **누적 주행(분), 정차 미포함**. 연산 전·실패면 null */
    driveMinutes: number | null;
}
export * from './callSteps';
export * from './callOptions';
export * from './cargoSpec';
export * from './stepTables';
export * from './stepRecords';
export * from './timing';
export * from './dryRun';
/**
 * 🔴 콜의 **색을 정하는 곳 — 여기 하나뿐이다**.
 *    이 파일은 아무것도 import 하지 않는다 — 순환 참조를 만들지 않으려는 것이다.
 */
export * from './judgment';
export * from './judge';
export * from './criteria';

/** 🏷️ 화면 이름표 — 배차망별로 갈라 둔다 (기사님 설계) */
export * from './screenLabels';
export * from './naviLink';
/** ⏱️ 밀림 — 한 콜이 앞선 정거장을 몇 분 밀었나, 누가 밀었나 (실험실에서 올림) */
export * from './stopImpact';
/** 🎨 구간별 선 — 통짜 폴리라인 + 경계로 자른다 */
export * from './sectionLine';
/**
 * 🕸️ **콜 그물·2단계 판정** — 지도 실험실이 나흘 동안 기사님과 맞춰 온 계산
 *    (기사님 확정: *«실험실 계산을 올린다»*).
 *    마름모·라인 띠·든 동·제외 지역·정거장 재배치가 전부 여기 있다.
 * 🔴 **실물이 원천이고 실험실이 그것을 부른다** — 화면과 서버가 같은 계산을 봐야
 *    «화면은 든다는데 판정은 탈락»이 안 생긴다 (규칙 ③).
 */
export * from './callNet';
export * from './trappedRegions';

/**
 * ⏱️ **«주행·정차»로 굳는 데 걸리는 초 — 기본값** (기사님 확정 · 화면규칙 S16).
 *
 * 20km/h↑ 가 이 시간만큼 이어지면 «주행», 5km/h↓ 면 «정차»로 본다.
 * 기사님이 ⚙️ 설정 → 「화면 설정」에서 고칠 수 있다 (`user_settings.motion_hold_sec`).
 *
 * 🔴 **모의 주행에서는 줄여야 한다** — 배속이 빠르면 정거장 사이를 2~7초에 지나가
 *    10초를 채울 수가 없다. 그래서 «주행이면 시트가 내려간다»가 발화 못 했다
 *    (기사님 실측: 빠름 40배로 한 판을 다 돌았는데 하루 종일 `idle`).
 *    기사님: *"모의주행할 때는 그걸 줄이고 시험하고 **진짜 때는 10으로**"*
 */
export const MOTION_HOLD_SEC_DEFAULT = 10;

/**
 * ⏱️ **배차망별 대기 시간** (기사님 확정).
 *
 * 원천은 DB `user_settings` 세 칸이다 — 여기는 **값이 없을 때의 기본값**(DB DEFAULT 와 같다)과
 * «그 배차망은 몇 초인가»를 가르는 한 곳이다. 서버 타이머 · 관제웹 표시가 같은 함수를 부른다.
 *
 * 🔴 **뜻이 다른 둘이다** (규칙 ⑤-4 ⑤):
 *   · 인성·화물24시 — 잡은 뒤 위약금 없이 취소할 수 있는 시간(안전취소).
 *     인성의 취소 가능 시간은 1분이고, 30초는 기사님이 둔 안전 여유다
 *   · 픽커 — 수락하기가 곧 계약이라 안전취소가 **없다.** 확정 전 상세를(누가 열었든) 띄워 두는 시간만 있다
 */
export const SAFE_CANCEL_SEC_DEFAULT = 30;
export const PICKER_ALARM_DETAIL_SEC_DEFAULT = 30;
/** 서버는 원달앱이 취소한 **뒤에** 메모리를 치운다 — 그 간격 (옛 30초 경고 · 35초 해제의 차이) */
export const SERVER_CLEANUP_EXTRA_SEC = 5;

/**
 * ⏳ **«알 수 없는 화면»이 이만큼 이어지면 상세를 떠난 것으로 본다**.
 *
 * 카드를 여는 순간 `UNKNOWN` 이 **0.05~0.18초** 끼는 일이 있다(실제 픽커 68건 중 3건). 그것을 이탈로
 * 읽으면 카드가 깜빡인다. 반대로 영영 무시하면 배차망 앱 밖으로 나갔을 때를 못 잡는다 — 그때도
 * 하트비트는 계속 오기 때문이다. 앱은 **화면이 바뀌면 즉시** 보고하므로, 몇 초를 넘겨 모름이
 * 이어진다는 것은 스침이 아니라 실제로 다른 곳에 있다는 뜻이다.
 *
 * 🔴 이것은 콜의 수명을 재는 타이머가 아니다 — «이탈»의 정의에 든 시간이다 (기사님: 타이머로 미리보기를 켜고 끄지 않는다).
 */
export const UNKNOWN_LEAVE_SEC = 5;

export interface WaitTimes {
    safeCancelSecInsung: number;
    safeCancelSecHwamul24: number;
    pickerAlarmDetailSec: number;
}

export const DEFAULT_WAIT_TIMES: WaitTimes = {
    safeCancelSecInsung: SAFE_CANCEL_SEC_DEFAULT,
    safeCancelSecHwamul24: SAFE_CANCEL_SEC_DEFAULT,
    pickerAlarmDetailSec: PICKER_ALARM_DETAIL_SEC_DEFAULT,
};

/**
 * ⏱️ **대기 시간 입력 — 1 이상 정수만 값이다** · 아니면 `null` (리뷰).
 * 관제웹 칸을 비우고 저장하면 0초가 저장됐다 — 인성 안전취소 0초면 원달앱이 잡자마자 스스로 취소한다.
 * 🔴 1초 미만은 값이 아니라 고장이다 · 상한은 걸지 않는다(기사님 확정). `null` 이면 설정 경로가 옛 값을 그대로 둔다.
 */
export function waitSecOrNull(v: unknown): number | null {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    if (!Number.isFinite(n)) return null;
    const sec = Math.floor(n);
    return sec >= 1 ? sec : null;
}

/** 그 배차망의 안전취소 초 — 픽커는 안전취소가 없어 `null` · 모르는 배차망은 기본 배차망(인성) */
export function safeCancelSecOf(w: WaitTimes, targetApp: string | null | undefined): number | null {
    const app = isTargetApp(targetApp) ? targetApp : DEFAULT_TARGET_APP;
    if (app === 'kakaopicker') return null;
    return app === 'hwamul24' ? w.safeCancelSecHwamul24 : w.safeCancelSecInsung;
}
export * from './logTags';
export * from './pageFields';
export * from './sigungu';
export * from './adminDongMatch';
export * from './networkPages';
export * from './collectList';
export * from './flowViews';
export * from './pageRead';
