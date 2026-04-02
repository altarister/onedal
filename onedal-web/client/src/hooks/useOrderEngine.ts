import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { io, Socket } from "socket.io-client";
import type { SimplifiedOfficeOrder, SecuredOrder, DispatchConfirmRequest, OfficeOrder } from "@onedal/shared";

export function useOrderEngine() {
    const [orders, setOrders] = useState<SimplifiedOfficeOrder[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [mainCall, setMainCall] = useState<SecuredOrder | null>(null);
    const [subCalls, setSubCalls] = useState<SecuredOrder[]>([]);
    const [rejectedCallIds, setRejectedCallIds] = useState<Set<string>>(new Set());
    const [selectedOrder, setSelectedOrder] = useState<SimplifiedOfficeOrder | SecuredOrder | null>(null);
    const socketRef = useRef<Socket | null>(null);

    const [filterStatus, setFilterStatus] = useState<'첫짐' | '대기' | '합짐'>('첫짐');
    const [mockIndex, setMockIndex] = useState(0);
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
        const socket = io({ transports: ["websocket"] });
        socketRef.current = socket;

        socket.on("connect", () => setIsConnected(true));
        socket.on("disconnect", () => setIsConnected(false));
        socket.on("new-order", (newOrder: SimplifiedOfficeOrder) => {
            setOrders((prev) => [...prev, newOrder]);
            playAlertSound();
        });

        socket.on("order-evaluating", (secured: SecuredOrder) => {
            // BASIC 수신 시: 평가 카드 올리고 전역 필터를 '대기'로 변경!
            if (secured.status === 'evaluating_basic') {
                setFilterStatus('대기');
            }

            if (!mainCallIdRef.current || mainCallIdRef.current === secured.id) {
                // 본콜이 비어있거나, 들어온 콜이 이미 본콜(기본->상세 업데이트)인 경우
                if (!mainCallIdRef.current) playAlertSound();
                setMainCall(secured);
                mainCallIdRef.current = secured.id; // 동기적으로 즉시 업데이트 처리
            } else {
                // 본콜이 이미 존재하고, 새로운 콜(합짐)이 들어온 경우
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
        });

        socket.on("order-confirmed", (id: string) => {
            setMainCall(prev => prev?.id === id ? { ...prev, status: 'confirmed' } : prev);
            setSubCalls(subs => subs.map(s => s.id === id ? { ...s, status: 'confirmed' } : s));
        });

        socket.on("order-canceled", (id: string) => {
            // 방출 처리된 오더는 화면에서 즉시 제거
            setMainCall(prev => prev?.id === id ? null : prev);
            setSubCalls(subs => subs.filter(s => s.id !== id));
            setRejectedCallIds(prev => new Set(prev).add(id));
        });

        return () => { setTimeout(() => socket.disconnect(), 100); };
    }, [playAlertSound]);

    const MOCK_DATA = useMemo(() => [
        { id: "mockA", pickup: "강남역", dropoff: "판교역", fare: 55000, pickupX: 127.0276, pickupY: 37.4979, dropoffX: 127.1111, dropoffY: 37.3947 },
        { id: "mockB", pickup: "양재역", dropoff: "정자역", fare: 35000, pickupX: 127.0343, pickupY: 37.4841, dropoffX: 127.1082, dropoffY: 37.3670 },
        { id: "mockC", pickup: "서초역", dropoff: "수내역", fare: 42000, pickupX: 127.0076, pickupY: 37.4919, dropoffX: 127.1143, dropoffY: 37.3784 }
    ], []);

    const fireMockCall = useCallback(async (index: number) => {
        if (index >= MOCK_DATA.length) return;
        const mockCall = MOCK_DATA[index];

        // 1차: BASIC 전송 (리스트 클릭 직후)
        const basicPayload: DispatchConfirmRequest = {
            step: 'BASIC',
            deviceId: `1DAL-폰${index + 1}호기`,
            order: { type: "NEW_ORDER", ...mockCall, timestamp: new Date().toISOString() },
            capturedAt: new Date().toISOString(),
            matchType: 'AUTO'
        };
        fetch("/api/orders/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(basicPayload) });

        // 상세페이지 진입 시뮬레이션 지연시간 1초
        setTimeout(() => {
            const detailedPayload: DispatchConfirmRequest = {
                step: 'DETAILED',
                deviceId: `1DAL-폰${index + 1}호기`,
                order: {
                    type: "NEW_ORDER",
                    ...mockCall,
                    timestamp: new Date().toISOString(),
                    itemDescription: "테스트 적요 (CBM: 2파레트)",
                    companyName: "1DAL 화주",
                } as OfficeOrder,
                capturedAt: new Date().toISOString(),
                matchType: 'AUTO'
            };
            fetch("/api/orders/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(detailedPayload) });
        }, 1000);
    }, [MOCK_DATA]);

    const startMockSequence = useCallback(() => {
        setMainCall(null);
        setSubCalls([]);
        setSelectedOrder(null);
        setRejectedCallIds(new Set());
        setFilterStatus('첫짐');
        setMockIndex(1); // 다음 쏠 인덱스는 1
        
        // 첫 번째 콜 바로 발사
        fireMockCall(0);
    }, [fireMockCall]);

    // 기사님이 '닫기(KEEP)'를 눌러서 수동 확정하는 행동
    const handleDecision = useCallback(async (id: string, action: 'KEEP' | 'CANCEL') => {
        try {
            await fetch(`/api/orders/decision/${id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action })
            });

            if (action === 'KEEP') {
                // PRD 시나리오: 확정을 했으므로 다음 화물을 찾기 위해 전역 필터를 '합짐'으로 돌림
                setFilterStatus('합짐');

                // MOCK 시뮬레이터를 위해 다음 콜 연쇄 발사
                setMockIndex(prev => {
                    const next = prev;
                    if (next < 3) setTimeout(() => fireMockCall(next), 2000);
                    return prev + 1;
                });
            } else {
                // 취소 시 대기상태가 풀리고 다시 첫짐/합짐 모드로 복구되겠으나 시뮬상 생략
            }
        } catch (e) { console.error("결정 전송 에러:", e); }
    }, [fireMockCall]);

    const requestConfirm = useCallback(async (order: SimplifiedOfficeOrder | SecuredOrder) => {
        try {
            // (Mocking) 실전에서는 안드로이드가 화면을 스크래핑한 상세데이터를 채워넣게 됩니다.
            const enhancedOrder = {
                ...order,
                itemDescription: "테스트 적요 (1DAL 자동채움)",
                companyName: "1DAL 가상화주",
            } as OfficeOrder;

            const payload: DispatchConfirmRequest = {
                step: 'DETAILED',
                deviceId: "phone-1",
                order: enhancedOrder,
                capturedAt: new Date().toISOString(),
                matchType: 'MANUAL'
            };
            await fetch("/api/orders/confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
        } catch (e) { console.error(e); }
    }, []);

    const handleSetMainCall = requestConfirm;
    const handleConfirmSub = requestConfirm;



    return {
        orders,
        isConnected,
        filterStatus,
        mockIndex,
        mainCall,
        subCalls,
        rejectedCallIds,
        selectedOrder,
        setSelectedOrder,
        startMockSequence,
        handleSetMainCall,
        handleConfirmSub,
        handleDecision,
    };
}
