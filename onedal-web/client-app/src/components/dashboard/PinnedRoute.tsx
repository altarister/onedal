import type { SecuredOrder, RouteStopInfo } from "@onedal/shared";
import { useState, useEffect } from 'react';
import { useRouteDerivations } from '../../hooks/useRouteDerivations';
import PinnedRouteCard from './PinnedRouteCard';
import CallDeck from './CallDeck';
import { EMPTY_RECORDS } from '../../hooks/records';
import { deckOrder } from '../../lib/deckFocus';
import type { BarFocus } from '../stage/barFocus';

/**
 * 🪗 **시트 안에 사는 콜 목록** — 무대(`StageView`)가 시트 내용물로 쓴다.
 *
 * 🔴 파일 이름은 `PinnedRoute` 지만 여기 있는 것은 `PinnedRouteBody` 하나뿐이다.
 *    이름을 바꾸면 이 경로를 읽는 규칙 검사 여럿이 함께 움직여야 해 따로 한다.
 */

interface Props {
    activeRoute: SecuredOrder[];
    /** 🧭 서버가 내려준 경로 순서 — 방문 순서의 유일한 원천 (기사님 동의) */
    routeStops: RouteStopInfo[];
    /** 경로를 계산한 시점 — 타임라인 추정 약속의 기준 = 카카오호출시점 */
    routeComputedAt: string | null;
    /** 🧭 경로를 든 콜 — 서버가 고른 답 */
    routeHolderId?: string | null;
    /** 🟡 심사 중인 콜의 미리보기 궤적 홀더 */
    previewRouteHolderId?: string | null;
    onDecision?: (id: string, action: 'ORDER_CONFIRMED' | 'SAFE_CANCEL' | 'ORDER_RELEASED_BY_ME' | 'ORDER_RELEASED_BY_OFFICE') => void;
    /** 🪗 열린 줄 — 무대가 정한다 (여는 일과 시트 높이를 한 손이 함께 정한다) */
    /** 📏 시트가 «내용만큼» 서는가 — 아코디언의 높이 문법이 갈린다 */
    fit?: boolean;
    openIdx?: number | null;
    /** 🙈 숨길 콜 — 배열에서 빼지 않고 가린다 (`lib/pastCalls` · 기사님 지시) */
    hiddenIds?: ReadonlySet<string>;
    onOpenIdx?: (i: number) => void;
    /** 🎬 시트가 맨 위일 때 시트 상태바가 가리키는 «그 콜 · 그 단계» — 무대가 정한다 (`barFocusOf` · #143) */
    focus?: BarFocus | null;
}

/** 몸통 — 파생은 밖(무대)에서 받아온다. 훅을 안 부르므로 어디에도 담길 수 있다 */
export function PinnedRouteBody({ activeRoute, routeStops, routeComputedAt, onDecision, fit, openIdx, onOpenIdx, hiddenIds, focus, d }: Props & { d: ReturnType<typeof useRouteDerivations> }) {
    /**
     * 🪗 **시트에는 «진행 중»만 산다** (기사님 확정 실주행 뒤):
     * *"올라오는 시트에 진행중, 완료됨.. 그 라인은 거의 필요 없는 것 같아.
     * 그건 어디 따로 봐야 할 것 같아."*
     * 끝난 콜(완료됨·취소·방출)은 ☰ 서랍이 든다 (`components/layout/Drawer`).
     */
    /**
     * 🏭 파생은 전부 **제조소 훅** 한 곳에서 한다.
     * 이 컴포넌트에는 화면 상태(처리중 `processingId`)만 남는다.
     */
    const {
        stepRecords, cycleDeck, safeRoute, judging, callNoOf,
        routeTimeline, etaMap, visitOrderMap, chronologicalIds, gpsFocus,
    } = d;

    const [processingId, setProcessingId] = useState<string | null>(null);
    // 서버 통신 완료 시 (상태가 변하거나 삭제될 때) 로딩 상태 즉각 해제
    useEffect(() => {
        setProcessingId(null);
    }, [activeRoute]);

    return (
        /**
         * 📏 **높이를 물려준다** (기사님 화면 대조).
         *
         * 🔴 여기가 **auto** 면 아래 아코디언의 백분율 높이가 **조용히 auto 로 풀린다** —
         *    그러면 시트가 화면보다 길어져 **맨 아래 붙박이(판정석)가 화면 밖으로 나간다.**
         * 🟢 사슬: 시트(고정) → 스크롤러(flex-1·min-h-0) → **여기(flex-1·min-h-0)** → 아코디언(flex-1)
         */
        <section id="confirmed-route"
                 className="flex flex-col flex-1 min-h-0">


            {/* 🪗 시트에는 **진행 중 덱 하나**만 그린다 (위 «진행 중»만 산다) */}

            {/* 📋 끝난 콜(완료됨·취소/방출)은 **조작이 아니라 조회**라 ☰ 서랍(`components/layout/Drawer`)이 든다 */}
            {/* 최소 출발 시각 카운트다운 — 그 남은 시간이 곧 **대기 예산**이다.
                기사님: *"첫 콜을 잡았다면 최소 출발 시간이 카운트다운하면 좋을 듯하다."* */}
            {/** 🚩 **출발 카운트다운은 콜 목록보다 먼저 읽힌다** (기사님 «상단으로 이동») — 그래서 시트 맨 위 상태바에 있다 */}
            {/* 🚩 출발 조각은 시트 상태바가 든다 (`useDepartureDue` · StageView) — 여기에는 그리지 않고 덱만 그린다 */}

            {cycleDeck.length > 0 && (
                <CallDeck
                    accordion
                    callNoOf={callNoOf}
                    openIdx={openIdx} onOpenIdx={onOpenIdx} fit={fit}
                    hiddenIds={hiddenIds}
                    records={stepRecords}
                    /* 🗺️ 타임라인은 여기서 만든 것 하나 (stepRecords 기반) — 덱이
                       한 벌 더 파생하면 정차가 갈라져 두 데드라인이 된다 */
                    timeline={routeTimeline}
                    gpsFocus={gpsFocus}
                    /* 경유번호는 여기서 한 번 만든 것을 지도·요약 줄이 함께 쓴다.
                       시각은 ETA 가 아니라 약속이라 CallDeck 이 deriveCallTiming 에서 직접 꺼낸다 */
                    visitOrderMap={visitOrderMap}
                    /* 순서는 잡은 시간순으로 고정한다 — 새 콜은 뒤에 붙기만 해서
                       기존 위치가 안 밀린다. 근거는 deckOrder() 주석 참고.
                       🔄 하차한 콜도 오늘 하루 함께 있다 (deckOfCycle · 사이클 = 하루) */
                    orders={deckOrder(cycleDeck).filter(o => o.id !== judging?.id)}
                    renderCard={(route) => (
                        <PinnedRouteCard
                            route={route}
                            isExpanded
                            /* 🪗 펼침은 아코디언(`openIdx`)이 맡는다 — 카드는 늘 펼친 채(`isExpanded`)라
                               카드 머리 누름으로 여닫지 않는다 */
                            onToggle={() => {}}
                            onDecision={onDecision}
                            processingId={processingId}
                            setProcessingId={setProcessingId}
                            etaMap={etaMap}
                            visitOrderMap={visitOrderMap}
                            indexNum={chronologicalIds.indexOf(route.id) + 1}
                            accentColor={d.callColors.get(route.id)}
                            records={stepRecords.get(route.id) ?? EMPTY_RECORDS}
                            timeline={routeTimeline}
                            routeStops={routeStops}
                            routeComputedAt={routeComputedAt}
                            variant="deck"
                            focusStep={focus && focus.orderId === route.id ? focus.step : null}
                            /* 🎬 이 카드가 지금 상태바의 콜인가 — 끌어올리는 순간 참이 되어 손으로 넘긴 단계를 지운다 (#145) */
                            focused={!!focus && focus.orderId === route.id}
                        />
                    )}
                />
            )}
            {cycleDeck.length === 0 && safeRoute.length > 0 && (
                <div className="mx-4 my-6 py-8 px-4 text-center border border-dashed border-border rounded-xl text-text-muted text-[13px]">
                    진행 중인 콜이 없습니다
                    <div className="text-[11px] mt-1 opacity-80">첫짐 필터로 돌아가 새 콜을 기다립니다</div>
                </div>
            )}

        </section>
    );
}


