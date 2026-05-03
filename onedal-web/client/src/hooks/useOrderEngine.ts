import { useState, useEffect, useCallback } from "react";
import { socket } from "../lib/socket";
import type { SimplifiedOfficeOrder, SecuredOrder } from "@onedal/shared";
import { logRoadmapEvent } from "../lib/roadmapLogger";
import { soundManager } from "../lib/soundManager";

export function useOrderEngine() {
    const [orders, setOrders] = useState<SimplifiedOfficeOrder[]>([]);
    const [isConnected, setIsConnected] = useState(socket.connected);
    const [activeOrders, setActiveOrders] = useState<SecuredOrder[]>([]);
    const [rejectedCallIds, setRejectedCallIds] = useState<Set<string>>(new Set());
    const [selectedOrder, setSelectedOrder] = useState<SimplifiedOfficeOrder | SecuredOrder | null>(null);

    // 파생 상태 (기존 컴포넌트 호환성 유지)
    const mainCall = activeOrders.length > 0 ? activeOrders[0] : null;
    const subCalls = activeOrders.length > 1 ? activeOrders.slice(1) : [];

    // 신규 콜(평가 중)이 존재하는지 모니터링하여 루프 알림음을 제어합니다.
    // UX 개선: 똥콜이거나 에러난 콜은 알림음을 울리지 않고, '양호' 이상의 연산 결과가 나왔을 때만 울리게 합니다.
    useEffect(() => {
        const hasGoodCall = activeOrders.some(order => {
            // 1. 관제 대기 중(평가 상태)이 아니면 무시
            if (!order.phase && !order.status?.includes('evaluating')) return false;
            
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

    useEffect(() => {
        const token = localStorage.getItem('access_token');
        fetch("/api/orders", {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        }).then((res) => res.json()).then((data) => setOrders(data.orders || [])).catch(() => { });

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
            soundManager.playBeep();
        };

        // 1단계: 1차 선빵 수신 (BASIC) — 닫기/취소 버튼 노출
        const onOrderEvaluating = (secured: SecuredOrder) => {
            logRoadmapEvent("웹", `🟢 [웹 수신] order-evaluating | ID: ${secured.id} | 기기: ${secured.capturedDeviceId} | ${secured.dropoff}`, "관제대시보드");
            logRoadmapEvent("웹", `확정페이지 진입 (선빵 수신으로 상세 모드 구동)`, "관제대시보드");
            logRoadmapEvent("웹", "PinnedRoute 컴포넌트에 빈 레이아웃(평가중) 렌더링 및 하단 결재버튼 전체 딤드(비활성) 처리", "관제대시보드");
            soundManager.playBeep();

            setActiveOrders(prev => {
                // ⭐ 같은 기기에서 새 콜이 들어오면 그 기기의 모든 이전 카드를 무조건 제거하되,
                // 이미 '확정된(KEEP)' 상태인 콜은 절대 임의로 지우지 않음!
                // (상태 진실 공급원은 서버이므로, 임의 삭제를 방지해야 시스템 엉킴이 발생하지 않음)
                const cleaned = prev.filter(order =>
                    order.capturedDeviceId !== secured.capturedDeviceId ||
                    order.status === 'confirmed' ||
                    order.id === secured.id
                );
                const next = [...cleaned, secured];
                console.log(`   ➡️ activeOrders 변경: [${prev.map(o => o.id.slice(0, 8)).join(', ')}] → [${next.map(o => o.id.slice(0, 8)).join(', ')}]`);
                return next;
            });

            setSelectedOrder(null);
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
            setActiveOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'confirmed' } : o));
        };

        const onOrderCanceled = (id: string) => {
            logRoadmapEvent("웹", `🔴 [웹 수신] order-canceled | ID: ${id.slice(0, 8)}`, "관제대시보드");
            logRoadmapEvent("웹", "PinnedRoute 아코디언 컴포넌트를 강제 삭제하고 초기 관제대기 Empty State 화면 렌더링", "관제대시보드");
            setActiveOrders(prev => {
                const next = prev.filter(o => o.id !== id);
                console.log(`   ➡️ activeOrders 변경: [${prev.map(o => o.id.slice(0, 8)).join(', ')}] → [${next.map(o => o.id.slice(0, 8)).join(', ')}]`);
                return next;
            });
            setRejectedCallIds(prev => new Set(prev).add(id));
        };

        const onDeathvalleyWarning = () => {
            logRoadmapEvent("웹", "서버로 부터 deathvalley-warning 소켓 경고 이벤트 받음", "관제대시보드");
            logRoadmapEvent("웹", "상단 비상 알림 배너 팝업 및 타이머 카운트다운 컴포넌트 텍스트 붉은색 렌더링", "관제대시보드");
        };

        socket.on("connect", onConnect);
        socket.on("disconnect", onDisconnect);
        socket.on("new-order", onNewOrder);
        socket.on("order-evaluating", onOrderEvaluating);
        socket.on("order-detail-received", onOrderDetailReceived);
        socket.on("order-evaluated", onOrderEvaluated);
        socket.on("order-confirmed", onOrderConfirmed);
        socket.on("order-canceled", onOrderCanceled);
        socket.on("deathvalley-warning", onDeathvalleyWarning);

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

                    // -- 시작: 상세 불일치 추적 로직 --
                    const differences: string[] = [];
                    if (prev.length !== serverActiveOrders.length) {
                        differences.push(`배열 길이 다름: 웹(${prev.length}개) vs 서버(${serverActiveOrders.length}개)`);
                    }

                    const serverIds = new Set(serverActiveOrders.map(o => o.id));

                    // 1. 신규 및 변경된 콜 확인
                    serverActiveOrders.forEach(serverOrder => {
                        const prevOrder = prev.find(o => o.id === serverOrder.id);
                        if (!prevOrder) {
                            differences.push(`[NEW] ID: ${serverOrder.id.slice(0, 8)} 서버에서 새로 추가됨`);
                        } else {
                            const propDiffs: string[] = [];
                            // 서버 기준 변경점
                            Object.keys(serverOrder).forEach(key => {
                                const sVal = JSON.stringify((serverOrder as any)[key]);
                                const pVal = JSON.stringify((prevOrder as any)[key]);
                                if (sVal !== pVal) {
                                    propDiffs.push(`'${key}': ${pVal} ➡️ ${sVal}`);
                                }
                            });
                            // 프론트에만 있고 서버엔 없는 속성
                            Object.keys(prevOrder).forEach(key => {
                                if (!(key in serverOrder)) {
                                    propDiffs.push(`'${key}' 속성 삭제됨`);
                                }
                            });
                            if (propDiffs.length > 0) {
                                differences.push(`[UPDATE] ID: ${serverOrder.id.slice(0, 8)} 변경점 -> ${propDiffs.join(' | ')}`);
                            }
                        }
                    });

                    // 2. 삭제된 콜 확인
                    prev.forEach(prevOrder => {
                        if (!serverIds.has(prevOrder.id)) {
                            differences.push(`[DELETE] ID: ${prevOrder.id.slice(0, 8)} 웹에 있던 좀비콜이 서버에 의해 삭제됨`);
                        }
                    });

                    if (differences.length > 0) {
                        console.log(`🔍 [하트비트 상세 원인 추적]\n - ${differences.join('\n - ')}`);
                    } else {
                        // 길이도 같고 안의 요소, 속성도 다 같은데 stringify 결과가 다른 경우 (예: 키 순서 다름)
                        console.log(`🔍 [하트비트 상세 원인 추적]\n - 객체 내부의 키 순서(Ordering)가 다르거나 숨겨진 변경 사항 발생`);
                    }
                    // -- 끝: 상세 불일치 추적 로직 --

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
            socket.off("deathvalley-warning", onDeathvalleyWarning);
            socket.off("sync-active-orders", onSyncActiveOrders);
        };
    }, []);

    const handleDecision = useCallback((id: string, action: 'KEEP' | 'CANCEL') => {
        // 다이어그램 Line 84~99: 관제탑 → 서버 [Socket] 취소/유지 전달
        logRoadmapEvent("웹", `[Socket] ${action === 'KEEP' ? '유지' : '취소'} 전달`, "관제대시보드");
        socket.emit("decision", { orderId: id, action });
    }, []);

    const handleRecalculate = useCallback((id: string, priority: string) => {
        logRoadmapEvent("웹", `[Socket] 카카오 ${priority} 탐색 옵션으로 재계산 요청`, "관제대시보드");
        socket.emit("recalculate-route", { orderId: id, priority });
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
        handleRecalculate,
    };
}
