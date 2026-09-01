/**
 * 공통 헬퍼 함수 — 전체 서버에서 한 곳에서만 정의합니다.
 */
import { isTerminal, cargoPoints, VEHICLE_CAPACITY, normalizeVehicleType,
         findTagConflicts,
         computeStopTiming, recordsOfSteps } from '@onedal/shared';
import type { MyOrder, CargoReport, CapacityConfidence, DwellUnknown, StopTiming, JudgmentConfig } from '@onedal/shared';
import { OrderRepository } from '../repositories/OrderRepository';
import db from '../db';
import { planArrivalStops } from '../services/routeComposer';
import type { RouteSnapshot } from '../services/routeComposer';
import { stepsView, stepRecordsOf, plannedDwellOf } from '../services/stepSeeder';

/**
 * 종료되지 않은(활성) 콜만 필터링합니다.
 *
 * "종결"의 정의는 `@onedal/shared` 에만 있다.
 * 예전에는 `core/constants.ts` 가 같은 목록을 Set 으로 한 벌 더 갖고 있어,
 * shared 에 `ORDER_DELIVERED` 를 추가해도 여기에 반영되지 않았다.
 * 하차한 짐이 계속 적재 중으로 세어졌다 (이슈 JJ).
 */
export function getActiveCalls(session: { myOrders: MyOrder[] }): MyOrder[] {
    return session.myOrders.filter(c => !isTerminal(c.status));
}

/**
 * [Phase 8.4] 지금 실려 있는 짐의 **적재 점수와 확신도**.
 *
 * 콜마다 근거가 다르다. 셋을 섞어 쓰되, 하나라도 추정이면 전체를 추정으로 본다
 * — 실제로 안 들어갈 위험이 남아 있는데 "확정"이라고 말하면 안 된다.
 *
 *   현장 실측(ACTUAL)  → 확정
 *   통화 신고(DECLARED) → 신고
 *   없음               → 차종으로 추정 (**그 차종의 정원을 다 먹는다**고 가정)
 *
 * ⚠️ 예전 주석은 "1t 콜이면 30점"이라 적었는데 **틀렸다** — 30 은 다마스 값이고
 *    1t 는 80(정원 100 중)이다. 라면박스 축 전환(2026-08-17) 전 숫자가 남은 것이다.
 *    적재 판정이 이 값을 먹으므로 숫자를 여기 다시 적지 않는다 — 원천은
 *    `VEHICLE_CAPACITY`(shared/vehicles.ts) 하나다 (규칙 ③ · 2026-08-29 정정)
 */
export function computeLoadedPoints(
    calls: MyOrder[],
    myVehicle: string,
    reportsByOrder: Map<string, CargoReport[]>,
): { points: number; confidence: CapacityConfidence } {
    let points = 0;
    let anyEstimated = false;
    let anyDeclaredOnly = false;

    for (const c of calls) {
        const reports = reportsByOrder.get(c.id) || [];
        // 상차지 기준. 하차지 신고는 "내릴 때 무엇이 나가는가"라 적재량과 같다
        const actual = reports.find(r => r.stopType === 'pickup' && r.kind === 'ACTUAL');
        const declared = reports.find(r => r.stopType === 'pickup' && r.kind === 'DECLARED');
        const chosen = actual || declared;

        // 🔴 2026-08-11 — 여기 관문이 `chosen?.sizeClass` 였다.
        //    `sizeClass`(소·중·대)는 단위를 파레트·라면박스로 바꾸기 **전의 옛 필드**이고
        //    화면(StopCallSheet)은 `unit` 만 보낸다. 그래서 이 관문이 영원히 닫혀
        //    **기사님이 신고한 짐 양을 통째로 무시하고** 늘 차종 추정으로 떨어졌다.
        //    합짐 2건이면 만재로 추정해 허용 차종이 [오토바이] 하나만 남았다 —
        //    Phase 8.4 가 "놓치던 합짐 기회를 연다"고 한 것의 정확히 반대다.
        //
        //    관문을 **필드가 아니라 점수로** 건다. cargoPoints 는 이미 unit 을 우선 보고
        //    옛 sizeClass 로 폴백하므로, 단위 체계를 또 바꿔도 여기는 안 깨진다.
        const reported = chosen ? cargoPoints(chosen) : 0;

        if (reported > 0) {
            points += reported;
            if (!actual) anyDeclaredOnly = true;
        } else {
            points += VEHICLE_CAPACITY[normalizeVehicleType(c.vehicleType || myVehicle) || myVehicle] ?? 0;
            anyEstimated = true;
        }
    }

    const confidence: CapacityConfidence =
        anyEstimated ? 'ESTIMATED' : anyDeclaredOnly ? 'DECLARED' : 'CONFIRMED';
    return { points, confidence };
}

/**
 * 🎨 `computeAllowedDetour`(옛 합짐 판정의 "우회 허용치")는 판정색 확정안 v2 전환으로
 * 철거됐다 (2026-08-21) — 새 채점기는 버퍼 소비를 후보 포함 타임라인에서 직접 잰다.
 * "상차 약속엔 접근만, 하차 약속엔 전부를 뺀다"는 교훈은 timing.ts 의 두 시계가 잇는다.
 */

/**
 * 한 콜의 상·하차 정차 시간.
 *
 * 🔴 **차종을 알면 짐을 안다** (기사님 지적 2026-08-29):
 *    *"다마스를 불렀다면 기본적으로 박스 30개라고 묵시적으로 알 수 있다고 한 것 같은데..
 *      **모르는 게 있다는 것이 버그 아닐까?**"*
 *
 *    맞다. 여기가 **태어난 단계 행만** 읽었는데, 행은 KEEP 해야 태어난다.
 *    그런데 **판정은 KEEP 하기 전에 난다** — 기사님은 색을 보고 KEEP 을 누르니까.
 *    그래서 판정 시점에는 장부가 늘 비어 있었고 정차가 언제나 「미확인 일반값」(15·10)이었다.
 *    차종이 무엇이든 총 25분 — 다마스도 1t 도 5t 도 같은 값이었다는 뜻이다.
 *
 *    🔴 **틀린 방향이 차종마다 달랐다** (실측 2026-08-29):
 *    1t 은 지게차라 실제 13분인데 25분으로 봐 **우회가 비싸 보였고**,
 *    5t 은 실제 57분인데 25분으로 봐 **싸 보였다.** 색이 곧 결정이라(규칙 ⑤-3) 양쪽 다 사고다.
 *    다마스만 우연히 25분(14+11)으로 같다 — 가장 흔한 차종에서 티가 안 났다.
 *
 *    🔴 **여기서 다시 세지 않는다** (규칙 ③). 단계 사슬(`computeChain`)이 이미
 *    «실측 > 통화 계획 > 적요 > 차종 기본» 순으로 짐을 정하고 정차 시간까지 계산해
 *    `planned_dwell_min` 에 담아 둔다. 안 태어난 행에도 파생값으로 들어 있다.
 *    이 함수는 **그 값을 읽기만 한다** — 같은 콜이 두 곳에서 다른 정차를 말하지 않게.
 */
export function getStopTiming(orderId: string, unk?: DwellUnknown,
    /** KEEP 전이라 `orders` 행이 아직 없을 때 넘기는 **메모리의 콜** (판정 경로가 그렇다) */
    order?: unknown,
    /**
     * 🔴 **판정 기준 설정** — 안 넘기면 사슬이 기본값으로 돌아 **판정 기준 탭의
     *    정차 값이 안 닿는다** (2026-08-29 리뷰에서 잡힘). 7단계로 올린 값이
     *    화면에만 먹히고 판정엔 안 먹히던 자리다.
     */
    cfg?: JudgmentConfig): StopTiming {
    // 🔄 파생 치환 ② — 재료는 새 장부. 한 번만 읽어 신고와 사슬 둘 다에 쓴다
    const view = stepsView(orderId, cfg, order);
    const reports = recordsOfSteps(view as any).reports as CargoReport[];
    const pick = reports.find(r => r.stopType === 'pickup' && r.kind === 'ACTUAL')
              || reports.find(r => r.stopType === 'pickup');
    const drop = reports.find(r => r.stopType === 'dropoff' && r.kind === 'ACTUAL')
              || reports.find(r => r.stopType === 'dropoff');

    if (!pick) {
        // 장부가 비어 있다 = KEEP 전이다. 사슬이 차종에서 뽑아 둔 값을 그대로 쓴다.
        const plan = plannedDwellOf(view);
        // ⚠️ **차종조차 못 읽은 콜은 여전히 모른다** (규칙 ④ — 없는 숫자를 지어내지 않는다).
        //    그때만 아래 일반값 경로로 내려가서, 호출자가 넘긴 `unk` 를 존중한다.
        if (plan?.pickupHandling) {
            return {
                pickupDwell: plan.pickupDwell,
                dropoffDwell: plan.dropoffDwell,
                totalDwell: plan.pickupDwell + plan.dropoffDwell,
                hasUnknown: !plan.dropoffHandling,
            };
        }
    }

    return computeStopTiming(
        pick ? { handling: pick.handling, unit: pick.unit, quantity: pick.quantity } : undefined,
        drop ? { handling: drop.handling } : undefined,
        unk,
    );
}

/**
 * 이 콜을 합짐으로 추가할 때 **실제로 늘어나는 시간**(분).
 *
 * 카카오가 주는 `timeDiffMin` 은 **주행 delta 뿐**이다.
 * 상차·하차를 한 번씩 더 하게 되므로 그 정차 시간을 반드시 더해야 한다.
 * 수작업 화물이면 여기서만 40~60분이 붙는다.
 */
export function totalDetourCost(driveDiffMin: number, incomingOrderId: string, unk?: DwellUnknown,
    /** KEEP 전에는 `orders` 행이 없다 — 판정 경로는 메모리의 콜을 함께 넘긴다 */
    order?: unknown,
    /** 판정 기준 설정 — 정차 값이 여기서 사슬까지 간다 */
    cfg?: JudgmentConfig): {
    total: number; drive: number; dwell: number; hasUnknown: boolean;
} {
    const t = getStopTiming(incomingOrderId, unk, order, cfg);
    return {
        total: Math.round(driveDiffMin + t.totalDwell),
        drive: driveDiffMin,
        dwell: t.totalDwell,
        hasUnknown: t.hasUnknown,
    };
}

/** 실린 화물과 새 콜이 함께 실을 수 없는 조합인지 (위험물 + 식료품 등) */
export function findLoadConflicts(
    userId: string,
    session: { myOrders: MyOrder[] },
    incomingOrderId: string,
): Array<[string, string]> {
    const incomingTags = stepRecordsOf(incomingOrderId).reports
        .flatMap(r => r.tags || []);
    if (incomingTags.length === 0) return [];

    const loadedTags = getActiveCalls(session)
        .filter(c => c.id !== incomingOrderId)
        .flatMap(c => stepRecordsOf(c.id).reports.flatMap(r => r.tags || []));
    if (loadedTags.length === 0) return [];

    // 중복 제거해서 같은 경고가 여러 번 뜨지 않게
    const seen = new Set<string>();
    return findTagConflicts(loadedTags, incomingTags).filter(([a, b]) => {
        const k = `${a}|${b}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

/**
 * 🔬 **계측 (2026-08-19)** — 경로 순서와 주행분이 **어디에도 안 남는다.**
 *
 * 기사님 실측: 상차 약속이 `18:51` 로 저장됐는데, 화면이 말하는 도착 예상은 `17:56`
 * 이었다. 역산하면 저장 순간의 주행은 47분, 지금은 21분이다. 어느 쪽이 47분을
 * 만들었는지 — 서버가 그렇게 줬는지, 관제웹이 다른 값을 썼는지 — **확인할 방법이
 * 없었다.** 카카오는 구간을 나눠 주고 `sections[0]` 이 곧 상차지까지인데,
 * 그 값이 로그에도 장부에도 남지 않아 사후에 볼 수가 없다.
 *
 * → 값이 **바뀔 때만** 한 줄 남긴다 (`sync` 는 매초 나가므로 무조건 찍으면 로그가 묻힌다).
 *
 * ⚠️ 이건 원인을 못박기 위한 계측이다. 원인이 확정되면 지우거나 정식 로그로 승격한다.
 */
/**
 * 🔴 **지문은 기사님마다 따로 기억한다** (기사님 실측 2026-08-26).
 *
 * 예전엔 모듈 전역 변수 **하나**였고, 저장이 빈 목록 검사보다 **앞**에 있었다:
 *
 *     lastRouteStopsSig = sig;          // ← 먼저 덮어쓰고
 *     if (!routeStops.length) return;   // ← 그 다음에 빠져나간다
 *
 * 1초 인터벌은 `sessions` 의 **모든 유저**를 돈다. 콜이 0건인 세션(남의 서버 토큰으로
 * 생긴 유령 세션)이 하나만 끼어도 매초 지문만 갈아치우고 조용히 나갔고, 다음 초에
 * 기사님 세션이 "바뀐 것"이 되어 또 찍혔다 — **324줄에 내용은 3종류.**
 *
 * 유령은 문에서 막지만(`isKnownUser`), 계측은 그것과 **무관하게 스스로 옳아야 한다**
 * (규칙 ② — 안전장치는 겹쳐 둔다).
 */
const lastRouteStopsSig = new Map<string, string>();
function logRouteStops(
    userId: string | undefined,
    routeStops: Array<{ orderId: string; stopType: string; driveMinutes: number | null }>,
    routeComputedAt: string | null, holderId: string | null,
    aligned: boolean, minsLen: number,
    /** 경로에 섞인 «확정 안 된» 콜 — 있으면 주행분을 안 쓴다 */
    pendingInRoute: string[] = [],
) {
    if (!routeStops.length) return;            // 빈 세션은 남의 지문을 건드리지 않는다
    const key = userId ?? '(주인없음)';
    const sig = JSON.stringify([routeStops, routeComputedAt, holderId]);
    if (sig === lastRouteStopsSig.get(key)) return;
    lastRouteStopsSig.set(key, sig);

    const circled = ['⑴', '⑵', '⑶', '⑷', '⑸', '⑹', '⑺', '⑻', '⑼', '⑽'];
    /**
     * 🔴 **«25분» 이 아니라 «누적 25분» 이라고 적는다** (2026-08-29).
     *    `sectionDriveMin` 은 정거장별 **누적** 주행분인데(kakaoService 주석), 로그가
     *    그냥 «하차 39분» 이라 적어 **그 구간이 39분 걸린다**로 읽혔다.
     *    2026-08-29 에 이걸로 «재탐색이 경로를 14분 나쁘게 만들었다»고 오진했다 —
     *    실제로는 합짐 후보가 붙어 누적이 늘어난 것이었다.
     */
    const body = routeStops.map((st, i) =>
        `${circled[i] ?? `(${i + 1})`} ${st.orderId.slice(-6)} ${st.stopType === 'pickup' ? '상차' : '하차'} ` +
        `${st.driveMinutes != null ? `누적 ${st.driveMinutes}분` : '주행모름'}`).join(' ');
    const kakaoCalledAt = routeComputedAt
        ? new Date(routeComputedAt).toLocaleTimeString('ko-KR', { hour12: false })
        : '없음';
    // 어긋나면 주행분이 전부 null 로 나간다 — 그 사실 자체가 원인일 수 있으므로 함께 적는다
    const mismatch = aligned ? '' : ` ⚠️ 길이 어긋남(주행분 ${minsLen} ≠ 정거장 ${routeStops.length}) → 전부 null`;
    // 후보가 섞였으면 «왜 주행분이 없는가»를 함께 적는다 — 없는 것보다 이유가 중요하다
    const pending = pendingInRoute.length
        ? ` ⚠️ 후보 포함 경로(${pendingInRoute.map(id => id.slice(-6)).join(' · ')}) → 주행분 안 씀`
        : '';
    console.log(`🧭 [경로 순서] 카카오호출시점 ${kakaoCalledAt} · 홀더 ${holderId?.slice(-6) ?? '없음'} · ${body}${mismatch}${pending}`);
}

/**
 * [2026-08-10] 관제탑으로 보낼 오더 스냅샷. **진행 중과 종료된 것을 나눠서** 보낸다.
 *
 * 🔴 예전에는 `Array.from(pendingOrdersData.values())` 를 통째로 보냈다.
 *    한 배열에 진행 중 콜과 취소·완료된 콜이 섞여 있어서, **받는 쪽마다 `isTerminal` 을
 *    기억해야** 했다. 잊으면 조용히 틀린다 — 2026-08-10 하루에만 세 번 났다.
 *      AA 적재 7건으로 표시 · BB 취소한 콜을 재탐색 · DD 취소분까지 운임 합산
 *
 *    "기억해야 하는 규칙"을 "고를 수 없는 구조"로 바꾼다. 나눠서 보내면 잊을 수가 없다.
 *
 * ⚠️ 페이로드를 만드는 곳은 **여기 하나뿐**이어야 한다.
 *    (예전에는 네 군데가 각자 `Array.from(...)` 을 했다)
 */
export function buildOrderSync(session: { userId?: string; myOrders: MyOrder[]; pendingOrdersData: Map<string, any>;
                                          driverLocation?: { x: number; y: number } | null;
                                          /** ↩️ 후보를 붙이며 덮기 직전에 떠 둔 경로 — 확정 경로의 주행분이 여기 있다 */
                                          routeSnapshot?: RouteSnapshot | null }) {
    // 🔴 세션은 같은 콜을 **두 곳**에 들고 있다.
    //    pendingOrdersData — 평가 중 + 확정된 콜의 캐시
    //    myOrders          — 확정된 내 콜 (모든 판정 로직이 이걸 본다)
    //
    //    예전에는 이 함수가 pendingOrdersData 만 읽었다. 그런데 당시의 `completeOrder` ·
    //    `startTwoTrack` 은 myOrders 만 갱신했다 → **관제탑에 낡은 상태가 갔다.**
    //    (하차 완료했는데 카드에 "상차 완료"로 남아 있던 원인)
    //    ⚠️ 그 두 함수는 지금 없다 (2026-08-14 철거 · setCallTarget 이 대체). 이유는 남는다
    //
    //    확정된 콜은 myOrders 가 진실이므로 나중에 덮어쓴다.
    const merged = new Map<string, any>();
    for (const o of session.pendingOrdersData.values()) merged.set(o.id, o);
    for (const o of session.myOrders) merged.set(o.id, o);

    const all = Array.from(merged.values());

    /**
     * 🔴 **종료된 콜의 경로(routePolyline)는 보내지 않는다** (2026-08-14).
     *
     * 관제탑은 진행 중인 콜의 경로만 그린다(`PinnedRoute` 의 `liveRoute`). 종료된 콜의
     * 경로는 **어디에도 쓰지 않는데** 매초 실려 나갔다 — 실측에서 종료 10건이 119KB 였고
     * 그중 한 건이 폴리라인 2384점이었다.
     *
     * 이게 1초마다 나가고, 관제웹은 그걸 다시 `JSON.stringify` 로 비교했다.
     * **초당 474KB 의 문자열이 만들어지고 버려졌다** — 브라우저가 시간이 지나면 죽은 이유다.
     * 게다가 종료 콜은 하루 종일 쌓이기만 하므로 **오후로 갈수록 나빠졌다.**
     */
    const stripPolyline = (o: any) => {
        if (!o?.routePolyline?.length) return o;
        const { routePolyline, ...rest } = o;
        return rest;
    };

    /**
     * 🧭 **경로 순서 — 원천은 서버 하나다** (기사님 동의 2026-08-19).
     *
     * 순서는 `planArrivalStops`(도착 감지가 보는 것과 같은 순서), 주행분은 경로 연산이
     * 홀더에 남긴 `sectionDriveMin`. 길이가 어긋나면(평가 중 후보까지 넣고 계산한 낡은
     * 값 · 연산 실패) 주행분을 **전부 null** 로 보낸다 — 낡은 분을 엉뚱한 정거장에
     * 붙이는 것이 없는 것보다 나쁘다 (규칙 ④).
     */
    const activeCalls = session.myOrders.filter(o => !isTerminal(o.status));
    const stops = activeCalls.length
        ? planArrivalStops(activeCalls, session.driverLocation ?? null) : [];
    /**
     * 🔴 **경로는 "마지막 콜"이 아니라 "값이 있는 마지막 콜"에서 읽는다** (2026-08-19 실측).
     *
     * 기록은 `pickRouteHolder` 가 KEEP **처리 중**의 activeCalls 로 고르는데, 그때는
     * 새 콜이 아직 목록에 없어 **앞 콜**에 실린다. 반면 여기는 KEEP 이 끝난 뒤라
     * "마지막"이 새 콜이고 그 콜은 비어 있다 — 그래서 주행분이 전부 null 이 되어
     * **타임라인이 통째로 폴백으로 돌았다** (합짐 시각·카운트다운·지각 검산 전부).
     *
     * 관제웹은 이미 `reverse().find(r => r.totalDistanceKm != null)` 로 값이 있는 콜을
     * 찾는다 — 서버도 같은 방식이어야 두 쪽이 같은 경로를 본다.
     */
    const holder = [...activeCalls].reverse().find(c => c.sectionDriveMin?.length) ?? null;
    const mins = holder?.sectionDriveMin;
    const aligned = !!mins && mins.length === stops.length;
    /**
     * 🔴 **자리가 아니라 이름으로 맞춘다** (기사님 실측 2026-08-21 · 3콜 리허설).
     *
     * 정거장에 도착하면 목록에서 빠지는데 주행분 배열은 계산 시점 그대로라, 도착할
     * 때마다 길이가 어긋나 **주행분 전체가 null** 이 됐다 — 운행 내내 타임라인이 죽었다
     * (예산 줄·검산 문장·카운트다운이 전부 이 값을 먹는다).
     *
     * 남은 정거장의 누적 주행분은 여전히 옳다 — 카카오호출시점에서 잰 상대값이라 낡지 않는다.
     * 죽은 것은 값이 아니라 **인덱스 맞추기**였다. 경로 연산이 남긴 `sectionStops`
     * (구간마다 어느 정거장인가)로 조회하면, 다녀온 곳은 안 찾아질 뿐이고
     * 계산에 없던 새 정거장만 null 이 된다 (규칙 ④ — 모르는 것만 모른다).
     */
    const secStops = holder?.sectionStops;
    /**
     * 🔴 **후보를 붙인 경로를 «확정된 경로»인 척 내보내지 않는다** (2026-08-29 실측).
     *
     * 심사 중에는 경로를 **후보까지 붙여** 다시 잰다(그게 우회를 재는 방법이다).
     * 그런데 정거장 목록에는 후보가 없으므로, 그 값을 그대로 붙이면
     * **첫짐 하차가 25분 → 39분**으로 늘어난 것처럼 보인다. 실측 그대로다:
     *
     * ```
     * 16:25:51  첫짐만        ⑵ 하차 25분
     * 16:26:06  합짐 후보 선점 (KEEP 전)
     * 16:26:09  재탐색        ⑵ 하차 39분   ← 경로가 나빠진 게 아니다
     * ```
     *
     * 예전에는 «구간 수 ≠ 정거장 수» 검사가 이걸 막았다. 2026-08-21 에 이름으로 맞추게
     * 바꾸며(도착할 때마다 주행분이 죽던 문제를 고치려고) **그 보호가 같이 걷혔다.**
     *
     * 🔴 **다녀와서 빠진 정거장과는 다르다.** 그 콜은 여전히 활성이다.
     *    후보는 **활성 콜이 아니다** — 그 차이로 가른다.
     *
     * ⚠️ 이 값은 로그용이 아니다. `routeStops` 는 관제웹 타임라인의 재료라
     *    도착 예상·카운트다운·버퍼가 전부 이걸 먹는다.
     */
    const activeIds = new Set(activeCalls.map(c => c.id));
    const pendingInRoute = secStops
        ? [...new Set(secStops.filter(st => !activeIds.has(st.orderId)).map(st => st.orderId))]
        : [];
    const pairUp = (
        st: Array<{ orderId: string; stopType: string }> | undefined,
        mn: Array<number | null> | undefined,
    ) => st && mn && st.length === mn.length
        ? new Map(st.map((x, i) => [`${x.orderId}|${x.stopType}`, mn[i]]))
        : null;
    /**
     * ↩️ **후보가 섞였으면 «덮이기 전 경로»를 쓴다** — 모른다고 하지 않는다.
     *
     * 재탐색이 후보를 붙여 홀더를 덮을 때 **덮기 직전 모습을 한 벌 떠 둔다**
     * (`session.routeSnapshot` — 후보가 취소되면 되살리려고 만든 것이다).
     * 확정된 경로의 주행분은 거기 그대로 있으므로, 심사 30초 동안 화면이
     * **깜깜해지지 않는다.** 우리는 아는 값을 갖고 있다 (규칙 ④ — 모르는 것만 모른다).
     */
    const snapMins = pendingInRoute.length > 0 ? session.routeSnapshot : null;
    const snapUsable = !!snapMins?.sectionStops
        && snapMins.sectionStops.every(st => activeIds.has(st.orderId));
    const minByKey = pendingInRoute.length === 0
        ? pairUp(secStops, mins)
        : snapUsable ? pairUp(snapMins!.sectionStops, snapMins!.sectionDriveMin) : null;
    const routeComputedAt = holder?.routeComputedAt
        ?? [...activeCalls].reverse().find(c => c.routeComputedAt)?.routeComputedAt ?? null;
    const routeStops = stops.map((st, i) => ({
        orderId: st.orderId, stopType: st.stopType,
        driveMinutes: minByKey
            ? (minByKey.get(`${st.orderId}|${st.stopType}`) ?? null)
            // 후보가 섞였으면 자리맞춤 폴백도 막는다 — 길이가 우연히 같을 수 있다
            : (aligned && pendingInRoute.length === 0) ? mins![i] : null,
    }));
    logRouteStops(session.userId, routeStops, routeComputedAt, holder?.id ?? null,
        aligned || !!minByKey, mins?.length ?? 0, pendingInRoute);

    /**
     * 🚫 **취소 예산 — 한 판(10회)에서 몇 번 썼나** (기사님 개정 2026-08-23 · 확정안 구현 5).
     *
     * 잘못 집힌 콜 하나 = 취소 1회 소진, 망별(인성/24시). 파생값이라 저장하지 않고
     * 장부(`orders`)에서 센다 (규칙 ③). **저장하는 것은 리셋 시각 하나뿐**이다.
     *
     * ⚠️ 예전에는 전 기간을 세어 `47/10` 같은 숫자가 떴다. 한도를 네 배 넘긴 값은
     *    *"조여라"* 도 *"괜찮다"* 도 알려 주지 못한다 — 화면이 뜻을 잃은 것이다.
     *    지금은 **리셋 이후만** 세고, 총량은 판수(`cancelRounds`)가 지킨다.
     */
    const cancelCounts: Record<string, number> = {};
    const cancelRounds: Record<string, number> = {};
    try {
        const resets = db.prepare(
            `SELECT app, COUNT(*) AS rounds, MAX(reset_at) AS resetAt
             FROM cancel_budget_resets WHERE user_id = ? GROUP BY app`
        ).all(session.userId) as any[];
        const resetByApp = new Map<string, { rounds: number; resetAt: string }>(
            resets.map(r => [r.app, { rounds: r.rounds, resetAt: r.resetAt }])
        );

        const rows = db.prepare(`SELECT COALESCE(targetApp, 'insung') AS app, timestamp
                                 FROM orders WHERE userId = ? AND status = 'SAFE_CANCEL'`)
            .all(session.userId) as any[];
        for (const r of rows) {
            const cut = resetByApp.get(r.app)?.resetAt;
            // 리셋 시각보다 이른 취소는 지난 판의 것 — 이번 판 숫자에 넣지 않는다
            if (cut && String(r.timestamp) <= cut) continue;
            cancelCounts[r.app] = (cancelCounts[r.app] ?? 0) + 1;
        }
        for (const [app, v] of resetByApp) cancelRounds[app] = v.rounds + 1;
        for (const app of Object.keys(cancelCounts)) cancelRounds[app] ??= 1;
    } catch { /* 파생 계측 — 실패해도 sync 는 계속 */ }

    return {
        active: all.filter(o => !isTerminal(o.status)),
        terminated: all.filter(o => isTerminal(o.status)).map(stripPolyline),
        routeStops,
        routeComputedAt,
        /**
         * 🧭 **경로를 든 콜의 이름** (기사님 확정 2026-08-31 · 잔상 수리).
         *    관제웹 지도·캔버스·시뮬이 각자 «마지막 폴리라인 가진 콜»을 추측하고 있었다 —
         *    판정이 세 벌이라 KEEP 직후처럼 갈리는 순간에 **직전 콜의 옛 선**을 그렸다.
         *    이미 여기서 고른 답을 이름으로 보낸다 — 추측을 없앤다 (규칙 ③).
         */
        routeHolderId: holder?.id ?? null,
        cancelRounds,
        cancelCounts,
    };
}

/**
 * 오더 상태를 바꾼다. **두 메모리를 반드시 함께** 갱신한다.
 *
 * 직접 `order.status = ...` 로 쓰면 한쪽만 바뀌고, 그 순간부터
 * "판정은 종료됐는데 화면은 진행 중"인 상태가 된다.
 * 상태를 바꾸는 곳은 이 함수 하나만 쓴다.
 */
export function setOrderStatus(
    session: { myOrders: MyOrder[]; pendingOrdersData: Map<string, any> },
    orderId: string,
    status: string,
): boolean {
    let found = false;
    const inMy = session.myOrders.find(o => o.id === orderId);
    if (inMy) { inMy.status = status as any; found = true; }
    const cached = session.pendingOrdersData.get(orderId);
    if (cached) { cached.status = status; found = true; }
    return found;
}

/**
 * ⛔ **만석 홀드 — 실을 수 있는 차종이 없으면 콜 잡기를 멈춘다** (기사님 확정 2026-08-19).
 *
 * 상차 신고로 적재가 100/100 이 되면 `allowedVehicleTypes` 가 빈 배열이 되는데,
 * 앱 파서는 빈 배열을 "전체 허용"(서버 미응답 대비 오프라인 안전망)으로 읽는다 —
 * 한 신호에 뜻이 둘이라 **만석인데 모든 차종을 잡으러 드는** 사고가 난다.
 * 그래서 만석은 빈 배열이 아니라 isActive=false 로 명시한다 (빈 필터는 고장 — 규칙 ④).
 *
 * 목록이 아예 없는 것(옛 필터·미계산)과 비어 있는 것은 다르다 — 없으면 홀드하지 않는다.
 */
export function capacityFullHold(filter: { dispatchPhase?: string; allowedVehicleTypes?: string[] }): boolean {
    return Array.isArray(filter.allowedVehicleTypes) && filter.allowedVehicleTypes.length === 0;
}

/**
 * 🧭 **피기백 필터 버전 — 내용 해시** (피기백 규격 v2 · 2026-08-22).
 *
 * 앱이 들고 있는 필터와 지금 필터가 같으면 본문을 생략하기 위한 값이다.
 * 🔴 카운터가 아니라 **내용에서 파생**한다 (규칙 ③) — 카운터는 필터를 고치는
 * 모든 경로가 빠짐없이 올려 줘야 하는데, 한 경로만 빼먹어도 앱이 낡은 필터로
 * 콜을 잡는다. 해시는 어긋날 수가 없다. (FNV-1a 32bit · base36)
 */
export function filterVersionOf(filter: unknown): string {
    const s = JSON.stringify(filter);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36);
}
