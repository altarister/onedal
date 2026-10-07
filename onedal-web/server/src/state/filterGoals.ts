/**
 * 🎯 **목적지 · 집 셈** — 오늘 어디로 가나(목표 시 · 목적지 원) · 집이 있는 시 · 집으로 오는 콜.
 * 🔴 이 파일은 위(filterNet · filterManager)를 가져오지 않는다 — 방향: filterManager → filterNet → filterGoals.
 * 바깥 일을 하는 함수: homeCityOf(설정 저장소) · goalCityOf · goalCitiesOf · homeCallsOf(설정 저장소 · DB · 지금 시각) · goalZonesNow(세션 · 설정 저장소 · DB · 지금 시각) (나머지는 값만 받는다)
 */
import { isHomeCallSince, IN_PROGRESS_STATUSES } from "@onedal/shared";
import { callTargetToday } from "../core/callTargetEvents";
import { getActiveCalls } from "../core/activeCalls";
import { SettingsRepository } from "../repositories/SettingsRepository";
import { getUserSession } from "./userSessionStore";
import type { OrderStatus } from "@onedal/shared";
import { goalZonesOf, withNearness, nearestDong, effectiveRadii } from "@onedal/shared";

type Session = ReturnType<typeof getUserSession>;
type Filter = Session['activeFilter'];

/**
 * 🏠 **집이 있는 시 — «좌표»로 뽑는다.**
 *
 * 🔴 주소 글자에서 「시」로 끝나는 조각을 찾지 않는다 — 사람이 적는 주소는 «광주시»라고 안 적는다
 *    («경기도 광주 초월 …»). 집 좌표(`home_x/home_y`)를 `nearestDong` 에 넣는다 —
 *    그물이 이미 쓰는 그 표(`DONG_CENTROIDS`)다 (규칙 ③). 좌표가 없을 때만 주소 글자로 물러선다.
 * ⚠️ 서울이면 «서울 영등포구»처럼 구까지 온다 — `cityCenter` 가 그 이름을 그대로 받는다.
 */
export function homeCityOf(userId: string): string | null {
    return homeCityFrom(SettingsRepository.getHomeLocation(userId));
}

/** 🏠 집이 있는 시 — 값만 받는 셈 (집 좌표 · 주소) */
export function homeCityFrom(home: { x: number; y: number; address?: string } | null): string | null {
    if (!home) return null;
    if (Number.isFinite(home.x) && Number.isFinite(home.y)) {
        const region = nearestDong({ lng: home.x, lat: home.y }).region;
        if (region) return region;
    }
    return home.address?.split(/\s+/).find(p => p.endsWith('시') || p.endsWith('군')) ?? null;
}

/**
 * 🎯 **그물이 향하는 시 — «파생»이다** (규칙 ③).
 *
 * `callTarget` 이 HOME 이면 **집이 있는 시**, 아니면 기사님이 정한 `destinationCity`.
 * 🔴 **`destinationCity` 를 덮어쓰지 않는다** — 덮으면 복귀를 끄고 돌아올 때 원래 목적지가 없다.
 *    «어디를 볼지»만 여기서 매번 낸다. 목적지를 읽는 자리
 *    (첫짐 재계산·합짐 갱신·경유 조립·빈 차 경유·앱 피기백)가 **전부 이 함수**를 본다.
 * ⚠️ 집 주소에서 시·군을 못 뽑으면 `destinationCity` 로 물러선다 — 빈 그물을 만들지 않는다.
 */
export function goalCityOf(session: ReturnType<typeof getUserSession>, userId: string): string {
    return goalCityFrom(session.activeFilter, homeCityOf(userId));
}

/** 🎯 그물이 향하는 시 — 값만 받는 셈 (필터의 목적지 · 복귀 켬 · 집 시) */
export function goalCityFrom(filter: Pick<Filter, 'destinationCity' | 'callTarget'>, homeCity: string | null): string {
    const mine = filter.destinationCity ?? '';
    if (filter.callTarget !== 'HOME') return mine;
    return homeCity ?? mine;
}

/** 🎯 콜의 판 — 적힌 값. 비었으면(서버가 다시 켜져 메모리가 비었다) 하차지의 시로 대신한다 */
function boardOf(o: { goalCity?: string; dropoffX?: number; dropoffY?: number }): string | undefined {
    if (o.goalCity) return o.goalCity;
    return o.dropoffX != null && o.dropoffY != null ? nearestDong({ lng: o.dropoffX, lat: o.dropoffY }).region : undefined;
}

/**
 * 🏠 **살아 있는 목적지 전부** — 규칙은 shared `filterArea.goalZonesOf`, 세션에서 부르는 곳은 `goalZonesNow` 한 곳.
 *
 * ```
 * 목적지 = { 필터값 (복귀를 켰으면 집) } ∪ { 진행 중인 확정 콜 가운데 마지막 콜의 목표값 }   — 최대 둘
 * ```
 *
 * 취소 · 방출 · 하차 끝난 콜은 마지막 콜이 아니다 — 진행 중인 확정 콜이 없으면 목적지는 필터값 하나다.
 */
export function goalCitiesOf(session: ReturnType<typeof getUserSession>, userId: string): string[] {
    /* `goalZonesOf`(목적지 콜이 남으면 목적지도)의 목적지 이름.
       관제웹 `goalCities` 가 하차 · 상차 목록과 같은 답을 본다 (필터.md «필터 영역») */
    return goalZonesNow(session, userId, null).zones.map(z => z.city);
}

/**
 * 🏠 **복귀콜만 골라낸다 — 복귀를 켠 뒤에 잡았고 판이 집인 콜** (판단은 shared `isHomeCallSince`).
 * 🔴 **셋이 이 함수 하나로 묻는다** — 목적지 계산(`goalCitiesOf`) · 하차 완료 자동 순환(`dispatchEngine`).
 * 🔴 **이번 운행(`deckOfCycle`)으로 세지 않는다** — 그건 진행 중인 콜이 0건이면 빈 목록이라, 콜 0건 틈에 «안 잡음»이 됐다.
 *    켠 시각은 `call_target_events` 오늘 줄에서 읽는다 — 서버를 다시 띄워도 같다.
 */
export function homeCallsOf<T extends { status?: string; capturedAt?: string; goalCity?: string; dropoffX?: number; dropoffY?: number }>(
    session: ReturnType<typeof getUserSession>, userId: string, orders: T[],
): T[] {
    void session;
    const home = homeCityOf(userId);
    const { homeOnAt } = callTargetToday(userId, Date.now());
    return homeCallsFrom(orders, homeOnAt, home);
}

/** 🏠 복귀콜 고르기 — 값만 받는 셈 (콜들 · 복귀 켠 시각 · 집 시) */
export function homeCallsFrom<T extends { status?: string; capturedAt?: string; goalCity?: string; dropoffX?: number; dropoffY?: number }>(
    orders: T[], homeOnAt: string | null, home: string | null,
): T[] {
    return orders.filter(o => isHomeCallSince({ status: o.status, capturedAt: o.capturedAt, board: boardOf(o) }, homeOnAt, home));
}

/**
 * 🎯 **지금 살아 있는 목적지 · 각자 상태 · 가까이 옴 — 한 곳**.
 *    상차 목록(`rebuildPickupList`)과 하차 목록(`netOfGoals`)이 **같은 값**을 쓴다 — 관제웹 «상차» · «하차» 레이어도 같은 두 shared 함수다 (규칙 ③).
 *    반경은 `effectiveRadii` · 모양은 `quadShapeFrom`. 내 위치를 모르면 «가까이 옴»을 못 재 «멀다»로 둔다 (규칙 ④).
 */
export function goalZonesNow(session: ReturnType<typeof getUserSession>, userId: string, me: { x: number; y: number } | null) {
    return goalZonesFrom({
        filter: session.activeFilter,
        myOrders: session.myOrders,
        departedAt: session.departedAt,
        homeCity: homeCityOf(userId),
        homeOnAt: callTargetToday(userId, Date.now()).homeOnAt,
        me,
    });
}

/** 🎯 살아 있는 목적지 · 상태 · 가까이 옴 — 값만 받는 셈 (필터 · 쥔 콜 · 출발 시각 · 집 시 · 복귀 켠 시각 · 내 위치) */
export function goalZonesFrom(o: {
    filter: Filter;
    myOrders: Session['myOrders'];
    departedAt: Session['departedAt'];
    homeCity: string | null;
    homeOnAt: string | null;
    me: { x: number; y: number } | null;
}) {
    const { me, homeCity } = o;
    const f = o.filter;
    const eff = effectiveRadii(f);
    const homeOn = f.callTarget === 'HOME';
    /**
     * 🎯 **목적지 = 필터값 ∪ «진행 중인 확정 콜» 가운데 마지막 콜의 목표값** (기사님 확정 · shared `goalZonesOf`).
     *    취소 · 방출 · 하차 끝난 콜과 판정 중(KEEP 전) 콜은 마지막 콜이 아니다 — 묻는 것은 «확정됐고 아직 안 끝났나» 하나다.
     *    차례는 `myOrders` 에 쌓인 차례다 — KEEP 할 때 끝에 붙고, 재시작 때는 `orders.timestamp` 차례로 되살린다 (KEEP 시각 칸은 없다).
     *    새 방향 콜을 잡으면 그 목표값이 필터값과 같아져 저절로 하나가 된다 — 지우는 코드가 없다.
     */
    const kept = o.myOrders.filter(c => IN_PROGRESS_STATUSES.includes(c.status as OrderStatus));
    const lastKept = kept[kept.length - 1];
    const base = goalZonesOf({
        filterCity: goalCityFrom(f, homeCity),
        lastKeptGoalCity: (lastKept as { goalCity?: string } | undefined)?.goalCity ?? null,
        homeCity,
        activeCalls: getActiveCalls({ myOrders: o.myOrders }),
    });
    /* 🎯 가까이 옴은 **목적지 반경 하나**로 잰다 — 현위치 반경을 더하지 않는다 (shared `isNearGoal`) */
    const zones = me ? withNearness(base, {
        me: { x: me.x, y: me.y },
        destinationRadiusKm: eff.destinationRadiusKm,
    }) : base;
    /* 🔴 «출발했나»는 목적지마다가 아니라 **하나**다 — 조각이 이 값을 직접 본다 */
    /* ⏭️ `homeCaught` 는 아직 관제웹·소켓 규격이 읽는다 — 목적지 계산에는 안 쓴다 (걷어내기는 다음 걸음) */
    const homeCaught = homeOn && homeCallsFrom(o.myOrders, o.homeOnAt, homeCity).length > 0;
    return { zones, homeOn, homeCity, homeCaught, departed: !!o.departedAt };
}
