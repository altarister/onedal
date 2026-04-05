import { useState, useEffect, useRef, useCallback } from "react";
import { socket } from "../lib/socket";
import type { SimplifiedOfficeOrder, SecuredOrder } from "@onedal/shared";

export function useOrderEngine() {
    const [orders, setOrders] = useState<SimplifiedOfficeOrder[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [mainCall, setMainCall] = useState<SecuredOrder | null>(null);
    const [subCalls, setSubCalls] = useState<SecuredOrder[]>([]);
    const [rejectedCallIds, setRejectedCallIds] = useState<Set<string>>(new Set());
    const [selectedOrder, setSelectedOrder] = useState<SimplifiedOfficeOrder | SecuredOrder | null>(null);

    const mainCallIdRef = useRef<string | null>(null);

    useEffect(() => {
        mainCallIdRef.current = mainCall?.id || null;
    }, [mainCall]);

    const playAlertSound = useCallback(() => {
        try {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 880;
            osc.type = "sine";
            gain.gain.value = 0.3;
            osc.start();
            setTimeout(() => { osc.stop(); ctx.close(); }, 300);

            setTimeout(() => {
                const ctx2 = new AudioContext();
                const osc2 = ctx2.createOscillator();
                const gain2 = ctx2.createGain();
                osc2.connect(gain2);
                gain2.connect(ctx2.destination);
                osc2.frequency.value = 1100;
                osc2.type = "sine";
                gain2.gain.value = 0.3;
                osc2.start();
                setTimeout(() => { osc2.stop(); ctx2.close(); }, 300);
            }, 350);
        } catch (e) {
            console.log("알림음 재생 실패:", e);
        }
    }, []);

    useEffect(() => {
        fetch("/api/orders").then((res) => res.json()).then((data) => setOrders(data.orders || [])).catch(() => {});
        
        if (socket.connected) {
            setIsConnected(true);
        }

        const onConnect = () => setIsConnected(true);
        const onDisconnect = () => setIsConnected(false);
        const onNewOrder = (newOrder: SimplifiedOfficeOrder) => {
            setOrders((prev) => [...prev, newOrder]);
            playAlertSound();
        };

        // 1단계: 1차 선빵 수신 (BASIC) — 닫기/취소 버튼 노출
        const onOrderEvaluating = (secured: SecuredOrder) => {
            if (!mainCallIdRef.current || mainCallIdRef.current === secured.id) {
                if (!mainCallIdRef.current) playAlertSound();
                setMainCall(secured);
                mainCallIdRef.current = secured.id;
            } else {
                setSubCalls(subs => {
                    const existing = subs.findIndex(s => s.id === secured.id);
                    if (existing >= 0) {
                        const newSubs = [...subs];
                        newSubs[existing] = secured;
                        return newSubs;
                    }
                    return [...subs, secured];
                });
            }
            setSelectedOrder(null);
        };

        // 2단계: 상하차지+적요 수신 (DETAIL 접수) — 경로/적요 섹션 업데이트
        const onOrderDetailReceived = (secured: SecuredOrder) => {
            if (mainCallIdRef.current === secured.id) {
                setMainCall(secured);
            } else {
                setSubCalls(subs => subs.map(s => s.id === secured.id ? secured : s));
            }
        };

        // 3단계: 카카오 연산 완료 — 수익률/경로 최종 노출 (판단 버튼 활성화)
        const onOrderEvaluated = (secured: SecuredOrder) => {
            playAlertSound();
            if (mainCallIdRef.current === secured.id) {
                setMainCall(secured);
            } else {
                setSubCalls(subs => subs.map(s => s.id === secured.id ? secured : s));
            }
        };

        const onOrderConfirmed = (id: string) => {
            setMainCall(prev => prev?.id === id ? { ...prev, status: 'confirmed' } : prev);
            setSubCalls(subs => subs.map(s => s.id === id ? { ...s, status: 'confirmed' } : s));
        };

        const onOrderCanceled = (id: string) => {
            setMainCall(prev => prev?.id === id ? null : prev);
            setSubCalls(subs => subs.filter(s => s.id !== id));
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

        return () => {
             socket.off("connect", onConnect);
             socket.off("disconnect", onDisconnect);
             socket.off("new-order", onNewOrder);
             socket.off("order-evaluating", onOrderEvaluating);
             socket.off("order-detail-received", onOrderDetailReceived);
             socket.off("order-evaluated", onOrderEvaluated);
             socket.off("order-confirmed", onOrderConfirmed);
             socket.off("order-canceled", onOrderCanceled);
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
