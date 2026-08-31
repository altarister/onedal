import { useState, useEffect, useRef } from 'react';
import type { SecuredOrder, RouteStopInfo } from '@onedal/shared';
import { hasVisitedStop } from '@onedal/shared';
import { useRouteDerivations } from '../../hooks/useRouteDerivations';
import { getAddressLabel } from '../../lib/routeUtils';
import PinnedRouteCanvas from '../dashboard/PinnedRouteCanvas';
import StageSheet, { type SheetSnap } from './StageSheet';
import { PinnedRouteBody } from '../dashboard/PinnedRoute';
import { MovingBadge, useDriveMotion } from '../dashboard/VehicleStatusPanel';
import { useGpsFocusStore } from '../../stores/gpsFocusStore';
import { socket } from '../../lib/socket';

/**
 * 🎭 **무대 — 지도 배경 + 3단 시트** (화면개편 2단계 · v23/v24 · 기사님 확정 2026-08-31).
 *
 * «새 화면 미리보기» 토글이 켜졌을 때만 그려진다 — 꺼진 동안 옛 화면(PinnedRoute 단독)이
 * 그대로다. 파생은 여기서 제조소를 **한 번만** 부르고, 시트 내용물(PinnedRoute sheetOnly)
 * 에 넘긴다 — 훅 두 번 = 구독·상태 두 벌이라 금지.
 *
 * 3단계(useStageRules)에서 snap 이 자동으로 움직이고, 4단계에서 S4~S7 이 연결된다.
 */
interface Props {
    activeRoute: SecuredOrder[];
    routeStops: RouteStopInfo[];
    routeComputedAt: string | null;
    onDecision?: (id: string, action: 'ORDER_CONFIRMED' | 'SAFE_CANCEL' | 'ORDER_RELEASED_BY_ME' | 'ORDER_RELEASED_BY_OFFICE') => void;
    onRecalculate?: (id: string, priority: string) => void;
    viewFilter: 'ACTIVE' | 'COMPLETED' | 'CANCELED' | 'RELEASED' | 'ALL';
    setViewFilter: (f: 'ACTIVE' | 'COMPLETED' | 'CANCELED' | 'RELEASED' | 'ALL') => void;
}

export default function StageView(props: Props) {
    const { activeRoute, routeStops, routeComputedAt } = props;
    const derived = useRouteDerivations(activeRoute, routeStops, routeComputedAt);
    const { liveRoute, unifiedRoutePoints, myLocation, visitOrderMap } = derived;
    const [snap, setSnap] = useState<SheetSnap>('half');

    /**
     * 🧠 상태 규칙 (v23 Ⅲ표 · 3단계) — 자동은 시트 높이만 바꾼다 (표시 전용이라 안전).
     * 손(드래그)이 이긴다 — 터치 후 30초 유예 (v23 Ⅳ).
     */
    const drive = useDriveMotion();
    const userHoldUntil = useRef(0);
    const judging = derived.judging;
    useEffect(() => {
        if (Date.now() < userHoldUntil.current) return;
        if (judging) { setSnap('peek'); return; }          // S4 — 지도가 판정 근거 (후보 정거장이 지도에 뜬다)
        if (drive === 'drive') { setSnap('peek'); return; } // S3 — 주행: 지도 주인공
        setSnap(liveRoute.length > 0 ? 'half' : 'peek');    // S2/S1 — 정차: 콜 목록 / 대기 한 줄
    }, [drive, judging ? judging.id : null, liveRoute.length]);

    /**
     * 📞 S5 — KEEP 직후: 시트 전체 + 그 콜 포커스 (킵 직후 바로 통화 원칙).
     * 포커스 전달은 기존 근접 포커스와 같은 그릇(gpsFocusStore) — 덱이 이미 읽는다.
     */
    useEffect(() => {
        const onConfirmed = (orderId: string) => {
            useGpsFocusStore.setState({ gpsFocus: { orderId, tick: Date.now() } });
            userHoldUntil.current = Date.now() + 30_000;   // 통화하는 동안 자동 전환 유예
            setSnap('full');
        };
        socket.on('order-confirmed', onConfirmed);
        return () => { socket.off('order-confirmed', onConfirmed); };
    }, []);

    /* 🗺️ 다음 정거장 이름표 재료 — 서버 경로 순서(routeStops)에서 첫 미방문 (v22 S3) */
    const next = (() => {
        const idx = routeStops.findIndex(st => {
            const o = liveRoute.find(r => r.id === st.orderId);
            return !!o && !hasVisitedStop(o, st.stopType);
        });
        if (idx < 0) return null;
        const st = routeStops[idx];
        const o = liveRoute.find(r => r.id === st.orderId)!;
        const callNo = liveRoute.findIndex(r => r.id === st.orderId) + 1;
        return {
            idx, total: routeStops.length, orderId: st.orderId,
            name: getAddressLabel(st.stopType === 'pickup' ? o.pickup : o.dropoff),
            stopLabel: st.stopType === 'pickup' ? '상차' : '하차',
            callNo, driveMinutes: st.driveMinutes,
            visitNo: (() => { const vo = visitOrderMap.get(st.orderId) as { pickupIdx?: number; dropoffIdx?: number } | number | undefined;
                if (typeof vo === 'number') return vo;
                return (st.stopType === 'pickup' ? vo?.pickupIdx : vo?.dropoffIdx) ?? idx + 1; })(),
        };
    })();

    return (
        <section id="stage-view" className="relative" style={{ height: 'calc(100dvh - 300px)', minHeight: 420 }}>
            {/* 지도 배경 — 캔버스 재사용 (배경 어댑터 자리: 훗날 카카오 타일 실험) */}
            <div className="absolute inset-0">
                <PinnedRouteCanvas
                    unifiedRoutePoints={unifiedRoutePoints}
                    liveRoute={liveRoute}
                    myLocation={myLocation}
                >
                    {/* 🏷️ 다음 정거장 이름표 — «어느 콜의 어떤 단계» (v22 S3 · 탭 동선은 4단계에서) */}
                    {next && (
                        <div className="absolute left-3 top-3 z-10 rounded-xl border px-3 py-2 tabular-nums cursor-pointer active:scale-95 transition-transform"
                             onClick={() => {
                                 // S6 — 정거장 이름표 탭 = 그 콜·그 단계로 (지도는 장부의 목차)
                                 useGpsFocusStore.setState({ gpsFocus: { orderId: next.orderId, tick: Date.now() } });
                                 userHoldUntil.current = Date.now() + 30_000;
                                 setSnap('full');
                             }}
                             style={{ background: 'color-mix(in srgb, var(--color-surface) 92%, transparent)', borderColor: '#4f8df9', backdropFilter: 'blur(3px)' }}>
                            <div className="text-[14px] font-black" style={{ color: '#9db9ff' }}>
                                {next.visitNo}. {next.name}{next.driveMinutes != null ? ` · ~${next.driveMinutes}분` : ''}
                            </div>
                            <div className="text-[11px] font-bold text-text-muted flex items-center gap-2">
                                {next.callNo}번 콜 · {next.stopLabel} · {next.idx + 1}/{next.total} 정거장 <MovingBadge />
                            </div>
                        </div>
                    )}
                </PinnedRouteCanvas>
            </div>

            {/* 3단 시트 — 내용물은 기존 콜 화면 그대로 (sheetOnly) */}
            <StageSheet snap={snap} onSnapChange={setSnap}>
                <PinnedRouteBody {...props} sheetOnly d={derived} />
            </StageSheet>
        </section>
    );
}
