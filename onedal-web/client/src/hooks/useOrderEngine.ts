import { useState, useEffect, useCallback } from "react";
import { socket } from "../lib/socket";
import type { SimplifiedOfficeOrder, SecuredOrder } from "@onedal/shared";

export function useOrderEngine() {
    const [orders, setOrders] = useState<SimplifiedOfficeOrder[]>([]);
    const [isConnected, setIsConnected] = useState(socket.connected);
    const [activeOrders, setActiveOrders] = useState<SecuredOrder[]>([]);
    const [rejectedCallIds, setRejectedCallIds] = useState<Set<string>>(new Set());
    const [selectedOrder, setSelectedOrder] = useState<SimplifiedOfficeOrder | SecuredOrder | null>(null);

    // 파생 상태 (기존 컴포넌트 호환성 유지)
    const mainCall = activeOrders.length > 0 ? activeOrders[0] : null;
    const subCalls = activeOrders.length > 1 ? activeOrders.slice(1) : [];

    const playAlertSound = useCallback(() => {
        try {
            const audio = new Audio("/sounds/new-call.mp3");
            audio.play().catch(e => console.log("오디오 재생 실패 (상호작용 전):", e));
        } catch (e) {
            console.error(e);
        }
    }, []);

    useEffect(() => {
        fetch("/api/orders").then((res) => res.json()).then((data) => setOrders(data.orders || [])).catch(() => {});
        
        if (socket.connected) {
            setIsConnected(true);
        }

        const onConnect = () => {
            setIsConnected(true);
            // 💡 서버 재시작(소켓 재접속) 시, 프론트엔드의 캐시도 강제 초기화!
            // 화면에 남아있는 평가 중인/확정된 상태도 모두 유령(Ghost)이 됩니다. 따라서 전부 지워야 싱크가 맞습니다.
            setActiveOrders([]);
        };
        const onDisconnect = () => setIsConnected(false);
        const onNewOrder = (newOrder: SimplifiedOfficeOrder) => {
            setOrders((prev) => [...prev, newOrder]);
            playAlertSound();
        };

        // 1단계: 1차 선빵 수신 (BASIC) — 닫기/취소 버튼 노출
        const onOrderEvaluating = (secured: SecuredOrder) => {
            console.log(`🟢 [웹 수신] order-evaluating | ID: ${secured.id.slice(0,8)} | 기기: ${secured.capturedDeviceId} | ${secured.pickup} → ${secured.dropoff}`);
            playAlertSound();
            
            setActiveOrders(prev => {
                // ⭐ 같은 기기에서 새 콜이 들어오면 그 기기의 모든 이전 카드를 무조건 제거!
                // status 체크 없이 capturedDeviceId만으로 판단 — 상태가 뭐든 같은 폰은 하나만!
                const cleaned = prev.filter(order => 
                    order.capturedDeviceId !== secured.capturedDeviceId &&
                    order.id !== secured.id
                );
                const next = [...cleaned, secured];
                console.log(`   ➡️ activeOrders 변경: [${prev.map(o => o.id.slice(0,8)).join(', ')}] → [${next.map(o => o.id.slice(0,8)).join(', ')}]`);
                return next;
            });
            
            setSelectedOrder(null);
        };

        // 2단계: 상하차지+적요 수신 (DETAIL 접수) — 경로/적요 섹션 업데이트
        const onOrderDetailReceived = (secured: SecuredOrder) => {
            console.log(`🟡 [웹 수신] order-detail-received | ID: ${secured.id.slice(0,8)} | ${secured.pickupDetails?.[0]?.addressDetail?.slice(0,20) || '없음'}`);
            setActiveOrders(prev => {
                const next = prev.map(o => o.id === secured.id ? secured : o);
                const found = prev.some(o => o.id === secured.id);
                if (!found) console.warn(`   ⚠️ ID ${secured.id.slice(0,8)}이 activeOrders에 없음! 현재: [${prev.map(o=>o.id.slice(0,8)).join(', ')}]`);
                return next;
            });
        };

        // 3단계: 카카오 연산 완료 — 수익률/경로 최종 노출 (판단 버튼 활성화)
        const onOrderEvaluated = (secured: SecuredOrder) => {
            console.log(`🔵 [웹 수신] order-evaluated | ID: ${secured.id.slice(0,8)} | ${secured.kakaoTimeExt || '결과없음'}`);
            playAlertSound();
            setActiveOrders(prev => prev.map(o => o.id === secured.id ? secured : o));
        };

        const onOrderConfirmed = (id: string) => {
            setActiveOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'confirmed' } : o));
        };

        const onOrderCanceled = (id: string) => {
            console.log(`🔴 [웹 수신] order-canceled | ID: ${id.slice(0,8)}`);
            setActiveOrders(prev => {
                const next = prev.filter(o => o.id !== id);
                console.log(`   ➡️ activeOrders 변경: [${prev.map(o => o.id.slice(0,8)).join(', ')}] → [${next.map(o => o.id.slice(0,8)).join(', ')}]`);
                return next;
            });
            setRejectedCallIds(prev => new Set(prev).add(id));
        };

        socket.on("connect", onConnect);
        socket.on("disconnect", onDisconnect);
        socket.on("new-order", onNewOrder);
        socket.on("order-evaluating", onOrderEvaluating);
        socket.on("order-detail-received", onOrderDetailReceived);
        socket.on("order-evaluated", onOrderEvaluated);
        socket.on("order-confirmed", onOrderConfirmed);
        socket.on("order-canceled", onOrderCanceled);

        // ⭐ 1초 하트비트 싱크: 서버의 실제 평가 오더 전체 객체 배열
        // 소켓 이벤트 누락 복구 + 웹 클라이언트 첫 접속/새로고침 시 전체 데이터 복원 기능
        const onSyncActiveOrders = (serverActiveOrders: SecuredOrder[]) => {
            setActiveOrders(prev => {
                // 배열 내역(ID, 상태, 카카오결과 등) 전체를 비교하여 하나라도 다르면 무조건 덮어쓰기
                // 소켓 통신(Vite 프록시) 불안정으로 이벤트가 누락되더라도 1초 안에 100% 자동 치유됨!
                const prevStr = JSON.stringify(prev);
                const serverStr = JSON.stringify(serverActiveOrders);

                if (prevStr !== serverStr) {
                    console.log(`🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.`);
                    return serverActiveOrders;
                }
                
                return prev; // 완벽히 일치하면 리렌더 방지
            });
        };
        socket.on("sync-active-orders", onSyncActiveOrders);

        return () => {
             socket.off("connect", onConnect);
             socket.off("disconnect", onDisconnect);
             socket.off("new-order", onNewOrder);
             socket.off("order-evaluating", onOrderEvaluating);
             socket.off("order-detail-received", onOrderDetailReceived);
             socket.off("order-evaluated", onOrderEvaluated);
             socket.off("order-confirmed", onOrderConfirmed);
             socket.off("order-canceled", onOrderCanceled);
             socket.off("sync-active-orders", onSyncActiveOrders);
        };
    }, [playAlertSound]);

    const handleDecision = useCallback((id: string, action: 'KEEP' | 'CANCEL') => {
        // 다이어그램 Line 84~99: 관제탑 → 서버 [Socket] 취소/유지 전달
        socket.emit("decision", { orderId: id, action });
    }, []);


    return {
        orders,
        isConnected,
        mainCall,
        subCalls,
        rejectedCallIds,
        selectedOrder,
        setSelectedOrder,
        handleDecision,
    };
}
