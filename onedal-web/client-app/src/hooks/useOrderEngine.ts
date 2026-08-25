import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { socket } from "../lib/socket";
import type { SimplifiedOfficeOrder, SecuredOrder, OrderSyncPayload, RouteStopInfo } from "@onedal/shared";
import { isEvaluating, isTerminal } from "@onedal/shared";
import { logRoadmapEvent, logStateChange } from "../lib/roadmapLogger";
import { soundManager } from "../lib/soundManager";

export function useOrderEngine() {
    const [orders, setOrders] = useState<SimplifiedOfficeOrder[]>([]);
    const [isConnected, setIsConnected] = useState(socket.connected);
    const [activeOrders, setActiveOrders] = useState<SecuredOrder[]>([]);
    /**
     * 지금 값을 **부작용 없이** 읽기 위한 사본. 로그를 updater 안에서 찍으면
     * StrictMode 가 두 번 불러 같은 줄이 두 번 나온다.
     */
    const activeOrdersRef = useRef<SecuredOrder[]>([]);
    useEffect(() => { activeOrdersRef.current = activeOrders; }, [activeOrders]);
    /**
     * 종료된 콜 (취소·방출·완료·하차). 서버가 **따로** 보내준다.
     * 관제탑의 완료/취소 탭 표시용 — 적재·경로 계산에는 절대 쓰지 않는다.
     */
    const [terminatedOrders, setTerminatedOrders] = useState<SecuredOrder[]>([]);
    /** 🧭 서버가 내려준 경로 순서 — 방문 순서의 유일한 원천 (기사님 동의 2026-08-19) */
    const [routeStops, setRouteStops] = useState<RouteStopInfo[]>([]);
    const [routeComputedAt, setRouteComputedAt] = useState<string | null>(null);
    // 🚫 취소 예산 — 한 판에서 몇 번 썼나. 서버가 장부에서 파생해 sync 에 싣는다
    const [cancelCounts, setCancelCounts] = useState<Record<string, number>>({});
    // 🚫 몇 판째인가 — 판수가 남으므로 총량은 사라지지 않는다 (필터_정의 §2 의 취지)
    const [cancelRounds, setCancelRounds] = useState<Record<string, number>>({});
    /**
     * 🚫 **한 판을 다 쓴 순간** 서버가 보내는 알림 (기사님 확정 2026-08-23).
     * 숫자만 조용히 0으로 돌아가면 **다 썼다는 사실 자체를 놓친다.**
     */
    const [cancelBudgetToast, setCancelBudgetToast] =
        useState<{ app: string; used: number; limit: number; round: number } | null>(null);

    // 파생 상태 (기존 컴포넌트 호환성 유지)
    const firstCall = activeOrders.length > 0 ? activeOrders[0] : null;
    const mergeCalls = activeOrders.length > 1 ? activeOrders.slice(1) : [];

    // 🚚 지금 실제로 트럭에 실려 있는 콜. **여기가 유일한 판정처다.**
    //
    // 서버의 sync-active-orders 는 '취소/방출' 탭 표시를 위해 종료된 콜까지
    // 한 배열에 담아 보낸다. 그래서 소비하는 쪽마다 isTerminal 을 기억해야 했고,
    // 2026-08-09 하루에만 세 번 그걸 잊어서 버그가 났다.
    //   AA 적재 7건으로 표시 · BB 취소된 콜을 재탐색 · DD 취소분까지 운임 합산
    // "기억해야 하는 규칙"을 "고를 수 없는 구조"로 바꾼다.
    // 서버가 이미 걸러서 보내지만(buildOrderSync), 낙관적 UI 가 만든 임시 항목이
    // 섞일 수 있으므로 한 겹 더 둔다. 비용이 없고 계약이 깨져도 안전하다.
    const liveCalls = useMemo(
        () => activeOrders.filter(o => !isTerminal(o.status)),
        [activeOrders]
    );

    // 신규 콜(평가 중)이 존재하는지 모니터링하여 루프 알림음을 제어합니다.
    // UX 개선: 똥콜이거나 에러난 콜은 알림음을 울리지 않고, '양호' 이상의 연산 결과가 나왔을 때만 울리게 합니다.
    useEffect(() => {
        const hasGoodCall = activeOrders.some(order => {
            // 1. 관제 대기 중(평가 상태)이 아니면 무시
            if (!isEvaluating(order.status)) return false;
            
            // 2. 카카오 연산 결과가 없으면(기다리는 중) 무시 (이 구간 동안 약 1~2초 침묵 발생)
            if (!order.kakaoTimeExt) return false;
            
            // 3. 똥콜, 실패, 에러면 무시
            if (order.kakaoTimeExt.includes("'똥'") || 
                order.kakaoTimeExt.includes("실패") || 
                order.kakaoTimeExt.includes("에러")) {
                return false;
            }
            
            // 4. 연산 완료 + 양호/꿀콜이면 true (벨 울림)
            return true;
        });

        if (hasGoodCall) {
            soundManager.playCallRinging();
        } else {
            soundManager.stopCallRinging();
        }
    }, [activeOrders]);

    // 컴포넌트 언마운트 시 알림음 잔류 방지 (activeOrders 의존성에서 분리)
    useEffect(() => {
        return () => soundManager.stopCallRinging();
    }, []);

    /**
     * 🔴 **종료된 콜은 장부(DB)에서 다시 읽는다** (2026-08-18 실측으로 발견).
     *
     * `terminatedOrders` 는 서버 **세션 메모리**에서 온다(`buildOrderSync`). 그런데 취소된 콜은
     * 캐시 정리(TTL·새 콜 진입)로 메모리에서 빠지므로, 다음 싱크에 목록에서 **통째로 사라진다** —
     * 기사님 실측: 30초 자동 취소가 취소 탭에 뜬 뒤, 새 콜을 올리자 **취소 수가 0** 이 됐다.
     * DB 에는 멀쩡히 3건이 남아 있었다. 화면만 거짓말한 것이다.
     *
     * 취소 횟수는 배차망 패널티(10회)와 직결되므로 한 건도 새면 안 된다 (용어집 §2-1).
     * → 콜이 끝나는 순간(`order-canceled`·`order-confirmed`) 이력을 다시 읽는다.
     */
    const reloadHistory = useCallback(() => {
        const token = localStorage.getItem('access_token');
        fetch("/api/orders", {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        }).then((res) => res.json()).then((data) => setOrders(data.orders || [])).catch(() => { });
    }, []);

    useEffect(() => {
        reloadHistory();

        if (socket.connected) {
            setIsConnected(true);
        }

        const onConnect = () => {
            /**
             * 📡 **소켓이 붙고 끊긴 순간을 남긴다** (필드테스트 ④ · 2026-08-25).
             *    어제 문서 §4-2 가 *"주행 중 소켓이 몇 번 끊겼나"* 를 모른다고 적어 뒀다.
             *    끊긴 동안 쌓아 뒀다가 붙으면 한꺼번에 올라간다 (`roadmapLogger`).
             */
            logStateChange("소켓", "연결됨", "관제대시보드");
            setIsConnected(true);
            // 💡 서버 재시작(소켓 재접속) 시, 프론트엔드의 캐시도 강제 초기화!
            // 화면에 남아있는 평가 중인/확정된 상태도 모두 유령(Ghost)이 됩니다. 따라서 전부 지워야 싱크가 맞습니다.
            setActiveOrders([]);
        };
        const onDisconnect = (reason?: string) => {
            logStateChange("소켓", `끊김${reason ? `(${reason})` : ''}`, "관제대시보드");
            setIsConnected(false);
        };
        // ※ `new-order` 리스너 제거됨 (Phase 0): 유일한 발신처였던 레거시 `POST /api/orders`가
        //    삭제되어 이 이벤트는 더 이상 발생하지 않습니다.

        // 1단계: 1차 선점 수신 (BASIC) — 닫기/취소 버튼 노출
        const onOrderEvaluating = (secured: SecuredOrder) => {
            logRoadmapEvent("웹", `🟢 [웹 수신] order-evaluating | ID: ${secured.id} | 기기: ${secured.capturedDeviceId} | ${secured.dropoff}`, "관제대시보드");
            logRoadmapEvent("웹", `확정페이지 진입 (선점 수신으로 상세 모드 구동)`, "관제대시보드");
            logRoadmapEvent("웹", "PinnedRoute 컴포넌트에 빈 레이아웃(평가중) 렌더링 및 하단 결재버튼 전체 딤드(비활성) 처리", "관제대시보드");
            soundManager.playBeep();

            setActiveOrders(prev => {
                // ⭐ 같은 기기에서 새 콜이 들어오면 그 기기의 모든 이전 카드를 무조건 제거하되,
                // 이미 '확정된(KEEP)' 상태인 콜은 절대 임의로 지우지 않음!
                // (상태 진실 공급원은 서버이므로, 임의 삭제를 방지해야 시스템 엉킴이 발생하지 않음)
                const cleaned = prev.filter(order =>
                    order.capturedDeviceId !== secured.capturedDeviceId ||
                    isTerminal(order.status) || order.status === 'ORDER_CONFIRMED' ||
                    order.id === secured.id
                );
                return [...cleaned, secured];
            });
            // 🔴 로그는 updater 밖에서 — StrictMode 가 updater 를 두 번 부른다 (같은 줄이 두 번 찍힌다)
            console.log(`   ➡️ activeOrders 변경: [${activeOrdersRef.current.map(o => o.id.slice(0, 8)).join(', ')}] → [+${secured.id.slice(0, 8)}]`);

        };

        // 2단계: 상하차지+적요 수신 (DETAIL 접수) — 경로/적요 섹션 업데이트
        const onOrderDetailReceived = (secured: SecuredOrder) => {
            logRoadmapEvent("웹", `🟡 [웹 수신] order-detail-received | ID: ${secured.id.slice(0, 8)} | ${secured.pickupDetails?.[0]?.addressDetail?.slice(0, 20) || '없음'}`, "관제대시보드");
            logRoadmapEvent("웹", "PinnedRoute 컴포넌트에 '상하차지 및 적요' 텍스트를 선출력하여 렌더링", "관제대시보드");
            setActiveOrders(prev => {
                const next = prev.map(o => o.id === secured.id ? secured : o);
                const found = prev.some(o => o.id === secured.id);
                if (!found) console.warn(`   ⚠️ ID ${secured.id.slice(0, 8)}이 activeOrders에 없음! 현재: [${prev.map(o => o.id.slice(0, 8)).join(', ')}]`);
                return next;
            });
        };

        // 3단계: 카카오 연산 완료 — 수익률/경로 최종 노출 (판단 버튼 활성화)
        const onOrderEvaluated = (secured: SecuredOrder) => {
            logRoadmapEvent("웹", `🔵 [웹 수신] order-evaluated | ID: ${secured.id.slice(0, 8)} | ${secured.kakaoTimeExt || '결과없음'}`, "관제대시보드");
            logRoadmapEvent("웹", "추천 결과 노출, 경로보기버튼 추가 노출 후 판단 (취소 or 닫기) 대기", "관제대시보드");
            if (secured.kakaoTimeExt?.includes("실패") || secured.kakaoTimeExt?.includes("에러")) {
                logRoadmapEvent("웹", "UI 상단에 에러 배너 렌더링 및 카카오맵 불가 상태를 PinnedRoute 에 표현", "관제대시보드");
            } else {
                logRoadmapEvent("웹", "PinnedRoute 내 캔버스 미니맵 좌표 포커싱 및 카카오 궤적(폴리라인) 드로잉 처리", "관제대시보드");
                logRoadmapEvent("웹", "예상 시간/수익률을 컴포넌트에 표시하고 결재버튼(KEEP/CANCEL) 즉시 딤드 해제(활성화)", "관제대시보드");
            }
            soundManager.playBeep();
            setActiveOrders(prev => prev.map(o => o.id === secured.id ? secured : o));
        };

        const onOrderConfirmed = (id: string) => {
            logRoadmapEvent("웹", "PinnedRoute 레이아웃을 합짐/무한 궤도 모드로 격상 렌더링 및 딤드 다시 처리", "관제대시보드");
            setActiveOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'ORDER_CONFIRMED' } : o));
        };

        const onOrderCanceled = (payload: { id: string, status: SecuredOrder['status'], isManual?: boolean }) => {
            const { id, status, isManual } = payload;
            logRoadmapEvent("웹", `🔴 [웹 수신] order-canceled | ID: ${id.slice(0, 8)} | 상태: ${status} | 수동여부: ${isManual}`, "관제대시보드");
            
            if (isManual) {
                // 수동 액션인 경우 삭제하지 않고 상태값만 변경하여 '취소/방출' 탭에 표시되도록 함
                logRoadmapEvent("웹", "오더 상태를 취소/방출로 변경하여 탭을 이동시킵니다", "관제대시보드");
                setActiveOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
            } else {
                // 시스템에 의한 자동 삭제인 경우 완전히 지움
                logRoadmapEvent("웹", "PinnedRoute 아코디언 컴포넌트를 강제 삭제하고 초기 관제대기 Empty State 화면 렌더링", "관제대시보드");
                // 🔴 로그는 updater 밖에서 — StrictMode 가 updater 를 두 번 부른다
                const before = activeOrdersRef.current;
                const after = before.filter(o => o.id !== id);
                console.log(`   ➡️ activeOrders 변경: [${before.map(o => o.id.slice(0, 8)).join(', ')}] → [${after.map(o => o.id.slice(0, 8)).join(', ')}]`);
                setActiveOrders(after);
            }
            
            setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
        };

        const onSafeCancelWarning = () => {
            logRoadmapEvent("웹", "서버로 부터 safecancel-warning 소켓 경고 이벤트 받음", "관제대시보드");
            logRoadmapEvent("웹", "상단 비상 알림 배너 팝업 및 타이머 카운트다운 컴포넌트 텍스트 붉은색 렌더링", "관제대시보드");
        };

        socket.on("connect", onConnect);
        socket.on("disconnect", onDisconnect);
        socket.on("order-evaluating", onOrderEvaluating);
        socket.on("order-detail-received", onOrderDetailReceived);
        socket.on("order-evaluated", onOrderEvaluated);
        socket.on("order-confirmed", onOrderConfirmed);
        socket.on("order-canceled", onOrderCanceled);
        // 종료된 콜이 메모리에서 빠져도 화면에서 사라지지 않게, 장부를 다시 읽는다
        const onTerminalReload = () => setTimeout(reloadHistory, 400);   // DB 기록이 끝난 뒤
        socket.on("order-canceled", onTerminalReload);
        socket.on("order-confirmed", onTerminalReload);
        socket.on("safecancel-warning", onSafeCancelWarning);

        // ⭐ 1초 하트비트 싱크: 서버의 실제 평가 오더 전체 객체 배열
        // 소켓 이벤트 누락 복구 + 웹 클라이언트 첫 접속/새로고침 시 전체 데이터 복원 기능
        const onSyncActiveOrders = (payload: OrderSyncPayload | SecuredOrder[]) => {
            // 🔴 서버가 진행/종료를 **나눠서** 보낸다 (2026-08-10).
            //    예전에는 한 배열로 와서 받는 쪽마다 isTerminal 을 기억해야 했고,
            //    잊으면 조용히 틀렸다 (AA 적재 건수 · BB 재탐색 대상 · DD 운임 합계).
            //    이제 나뉘어 오므로 **잊을 수가 없다.**
            //
            //    배열로 오면 옛 서버가 돌고 있다는 뜻이다. 조용히 넘기지 않고 경고한다 —
            //    이 프로젝트에서 tsx watch 가 변경을 놓치는 일이 반복됐다.
            if (Array.isArray(payload)) {
                console.warn('⚠️ [계약 불일치] sync-active-orders 가 배열로 왔습니다. '
                    + '서버가 옛 코드입니다 — 재기동하세요. 종료된 콜이 진행 중으로 섞여 보일 수 있습니다.');
                setTerminatedOrders(payload.filter(o => isTerminal(o.status)));
                payload = { active: payload.filter(o => !isTerminal(o.status)), terminated: [] };
            }
            const serverActiveOrders = payload.active || [];

            /**
             * 🔴 **여기서 비교하지 않는다** (2026-08-14).
             *
             * 예전에는 `JSON.stringify(prev) !== JSON.stringify(server)` 로 매초 비교했다.
             * 실측: active 118KB · terminated 119KB 가 1초마다 왔고, 양쪽을 문자열로 만드니
             * **초당 474KB 의 임시 문자열**이 생겼다 다시 버려졌다. 한 시간이면 1.7GB —
             * **브라우저가 시간이 지나면 죽었다.** 종료 콜은 하루 종일 쌓이기만 하므로
             * 오후로 갈수록 나빠졌다.
             *
             * 비교는 어차피 필요하다. 다만 **서버가 한 번** 한다 (`socketHandlers` 의 백그라운드
             * 싱크가 직전 전송본과 같으면 아예 안 보낸다). 그러니 **도착했다는 것 자체가
             * "바뀌었다"는 뜻**이고, 여기서는 그냥 받아 넣으면 된다.
             *
             * 자동 치유는 그대로다 — 소켓이 새로 붙으면 서버가 무조건 한 번 보낸다.
             */
            setTerminatedOrders(payload.terminated || []);
            // 옛 서버는 이 필드가 없다 → 빈 배열 (화면은 번호 없이 콜만 그린다)
            setRouteStops(payload.routeStops ?? []);
            setRouteComputedAt(payload.routeComputedAt ?? null);
            if (payload.cancelCounts) setCancelCounts(payload.cancelCounts);
            if (payload.cancelRounds) setCancelRounds(payload.cancelRounds);

            /**
             * 🔴 로그는 **updater 밖에서** 찍는다.
             *    `setActiveOrders(prev => { console.log(...) })` 로 넣었더니 개발 중에
             *    **같은 줄이 두 번** 찍혔다 — React StrictMode 가 updater 를 두 번 부르기
             *    때문이다(순수해야 할 함수에 부작용을 넣으면 이렇게 드러난다).
             *    화면이 "두 번 일어났다"고 잘못 말하게 된다.
             */
            const prev = activeOrdersRef.current;
            if (prev.length !== serverActiveOrders.length) {
                const prevIds = new Set(prev.map(o => o.id));
                const serverIds = new Set(serverActiveOrders.map(o => o.id));
                const added = serverActiveOrders.filter(o => !prevIds.has(o.id)).map(o => o.id.slice(0, 8));
                const gone = prev.filter(o => !serverIds.has(o.id)).map(o => o.id.slice(0, 8));
                console.log(`🔄 [하트비트 싱크] ${prev.length} → ${serverActiveOrders.length}건`
                    + (added.length ? ` · 추가 [${added.join(', ')}]` : '')
                    + (gone.length ? ` · 제거 [${gone.join(', ')}]` : ''));
            }
            setActiveOrders(serverActiveOrders);
        };
        socket.on("sync-active-orders", onSyncActiveOrders);

        /**
         * 🚫 **취소 한 판을 다 썼다** — 서버가 리셋하는 그 순간에만 온다.
         *    숫자는 sync 로 0이 되지만, 그 사실은 이 이벤트로만 알 수 있다.
         */
        const onCancelBudgetReached = (p: { app: string; used: number; limit: number; round: number }) => {
            console.warn(`🚫 [취소 예산 소진] ${p.app} ${p.used}/${p.limit} → ${p.round}판째`);
            setCancelBudgetToast(p);
        };
        socket.on("cancel-budget-reached", onCancelBudgetReached);

        return () => {
            socket.off("connect", onConnect);
            socket.off("disconnect", onDisconnect);
            socket.off("order-evaluating", onOrderEvaluating);
            socket.off("order-detail-received", onOrderDetailReceived);
            socket.off("order-evaluated", onOrderEvaluated);
            socket.off("order-confirmed", onOrderConfirmed);
            socket.off("order-canceled", onOrderCanceled);
            socket.off("safecancel-warning", onSafeCancelWarning);
            socket.off("order-canceled", onTerminalReload);
            socket.off("order-confirmed", onTerminalReload);
            socket.off("sync-active-orders", onSyncActiveOrders);
            socket.off("cancel-budget-reached", onCancelBudgetReached);
        };
    }, []);

    const handleDecision = useCallback((id: string, action: 'ORDER_CONFIRMED' | 'SAFE_CANCEL' | 'ORDER_RELEASED_BY_ME' | 'ORDER_RELEASED_BY_OFFICE') => {
        // 다이어그램 Line 84~99: 관제탑 → 서버 [Socket] 취소/유지 전달
        logRoadmapEvent("웹", `[Socket] ${action === 'ORDER_CONFIRMED' ? '유지' : '취소'} 전달`, "관제대시보드");
        socket.emit("decision", { orderId: id, action });
    }, []);

    const handleRecalculate = useCallback((id: string, priority: string) => {
        logRoadmapEvent("웹", `[Socket] 카카오 ${priority} 탐색 옵션으로 재계산 요청`, "관제대시보드");
        socket.emit("recalculate-route", { orderId: id, priority });
    }, []);

    return {
        orders,
        routeStops,
        routeComputedAt,
        cancelCounts,
        cancelRounds,
        cancelBudgetToast,
        isConnected,
        firstCall,
        mergeCalls,
        liveCalls,
        terminatedOrders,
        handleDecision,
        handleRecalculate,
    };
}
