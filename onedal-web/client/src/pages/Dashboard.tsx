import { useEffect, useState, useCallback, useRef } from "react";
import { io, Socket } from "socket.io-client";
import type { OrderData } from "@onedal/shared";

export default function Dashboard() {
    // 🌍 서버 통신 상태
    const [orders, setOrders] = useState<OrderData[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [wakeLockActive, setWakeLockActive] = useState(false);
    const socketRef = useRef<Socket | null>(null);

    // 🚀 합짐 시뮬레이터 (Local State)
    const [mainCall, setMainCall] = useState<OrderData | null>(null);
    const [subCalls, setSubCalls] = useState<OrderData[]>([]);
    const [rejectedCallIds, setRejectedCallIds] = useState<Set<string>>(new Set());
    const [simulationResults, setSimulationResults] = useState<Record<string, { timeExt: string, distExt: string, isGood: boolean, isLoading?: boolean, isDetourCalc?: boolean, calcMainCallId?: string }>>({});
    const fetchingIdsRef = useRef<Set<string>>(new Set());
    const [mockStep, setMockStep] = useState(0);
    
    // 파생 데이터: 확정된 모든 콜 모음
    const activeRoute: OrderData[] = [mainCall, ...subCalls].filter(Boolean) as OrderData[];

    // 🧪 목업 시나리오 실행 함수
    const startMockSequence = useCallback(() => {
        // 기존 뷰 클리어
        // 목업 데이터 클리어
        setMainCall(null);
        setSubCalls([]);
        setRejectedCallIds(new Set());
        setOrders([]);
        setSimulationResults({});
        fetchingIdsRef.current.clear();

        const MOCK_1_GOOD: OrderData = {
            id: "mock1", type: "NEW_ORDER", fare: 30000,
            pickup: "강남역", pickupX: 127.0276, pickupY: 37.4979,
            dropoff: "판교역", dropoffX: 127.1111, dropoffY: 37.3947,
            timestamp: new Date().toISOString(), status: "pending"
        };

        // 1단계 시작: 첫 꿀콜만 내려줌
        setMockStep(1);
        setTimeout(() => setOrders([MOCK_1_GOOD]), 500);
    }, []);

    // 알림음 재생
    const playAlertSound = useCallback(() => {
        try {
            const audioContext = new AudioContext();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            oscillator.frequency.value = 880;
            oscillator.type = "sine";
            gainNode.gain.value = 0.3;

            oscillator.start();
            setTimeout(() => {
                oscillator.stop();
                audioContext.close();
            }, 300);

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
                setTimeout(() => {
                    osc2.stop();
                    ctx2.close();
                }, 300);
            }, 350);
        } catch (e) {
            console.log("알림음 재생 실패:", e);
        }
    }, []);

    // Wake Lock: 화면 꺼짐 방지
    useEffect(() => {
        const requestWakeLock = async () => {
            try {
                if ("wakeLock" in navigator) {
                    await navigator.wakeLock.request("screen");
                    setWakeLockActive(true);
                }
            } catch (err) {
                console.log("Wake Lock 실패:", err);
            }
        };
        requestWakeLock();
    }, []);

    // Socket.io 연결 + 기존 데이터 로딩
    useEffect(() => {
        // 1. 기존 콜 목록 로딩
        fetch("/api/orders")
            .then((res) => res.json())
            .then((data) => setOrders(data.orders || []))
            .catch(() => { });

        // 2. Socket.io 연결
        const socket = io();
        socketRef.current = socket;

        socket.on("connect", () => {
            setIsConnected(true);
        });

        socket.on("disconnect", () => {
            setIsConnected(false);
        });

        // 3. 새 콜이 오면 즉시 카드 배열에 추가 + 소리 리스너
        socket.on("new-order", (newOrder: OrderData) => {
            setOrders((prev) => [...prev, newOrder]);
            playAlertSound();
        });

        return () => {
            socket.disconnect();
        };
    }, [playAlertSound]);

    const formatTime = (iso: string) => {
        const d = new Date(iso);
        return `${d.getHours().toString().padStart(2, "0")}:${d
            .getMinutes()
            .toString()
            .padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
    };

    // 📌 핸들러들
    const handleSetMainCall = (order: OrderData) => {
        setMainCall(order);
        
        // 목업 시퀀스: 1번 꿀콜을 단독 확정하면 2번 똥콜이 내려옴
        if (order.id === "mock1" && mockStep === 1) {
            setMockStep(2);
            const MOCK_2_BAD: OrderData = {
                id: "mock2", type: "NEW_ORDER", fare: 15000,
                pickup: "역삼역", pickupX: 127.0364, pickupY: 37.5006,
                dropoff: "일산 킨텍스", dropoffX: 126.7460, dropoffY: 37.6695,
                timestamp: new Date().toISOString(), status: "pending"
            };
            setTimeout(() => setOrders(prev => [...prev, MOCK_2_BAD]), 1000);
        }
    };

    const handleReject = (id: string) => {
        setRejectedCallIds((prev) => new Set(prev).add(id));

        // 목업 시퀀스: 2번 똥콜을 패스하면 3번 꿀콜이 내려옴
        if (id === "mock2" && mockStep === 2) {
            setMockStep(3);
            const MOCK_3_SUBGOOD: OrderData = {
                id: "mock3", type: "NEW_ORDER", fare: 22000,
                pickup: "양재역", pickupX: 127.0343, pickupY: 37.4841,
                dropoff: "정자역", dropoffX: 127.1082, dropoffY: 37.3670,
                timestamp: new Date().toISOString(), status: "pending"
            };
            setTimeout(() => setOrders(prev => [...prev, MOCK_3_SUBGOOD]), 1000);
        }
    };

    const handleSimulate = async (order: OrderData) => {
        if (!order.id || !mainCall) return;
        
        setSimulationResults((prev) => ({ 
            ...prev, 
            [order.id as string]: { timeExt: "카카오 API 연산 중...", distExt: "거리를 불러오는 중...", isGood: true, isLoading: true } 
        }));

        try {
            if (!mainCall.pickupX || !mainCall.pickupY || !mainCall.dropoffX || !mainCall.dropoffY || !order.pickupX || !order.pickupY || !order.dropoffX || !order.dropoffY) {
                alert("스캐너 좌표 정보(위/경도)가 없어 시뮬레이션을 돌릴 수 없습니다.");
                return;
            }

            const res = await fetch("/api/kakao/directions/compare", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    origin: { x: mainCall.pickupX, y: mainCall.pickupY, name: mainCall.pickup },
                    destination: { x: mainCall.dropoffX, y: mainCall.dropoffY, name: mainCall.dropoff },
                    waypoints: [
                        { x: order.pickupX, y: order.pickupY, name: order.pickup },
                        { x: order.dropoffX, y: order.dropoffY, name: order.dropoff }
                    ]
                })
            });

            if (!res.ok) {
                const errData = await res.json();
                console.error("Kakao API Error:", errData);
                alert("카카오 연산 실패: API 키를 확인해주세요.");
                return;
            }

            const data = await res.json();

            // 계산 결과 포맷팅
            const timeDiffMin = Math.round(data.diff.timeExtSeconds / 60);
            const distDiffKm = (data.diff.distExtMeters / 1000).toFixed(1);

            const isGood = timeDiffMin < 25; // 25분 미만 추가 소요면 녹색(추천)

            setSimulationResults((prev) => ({
                ...prev,
                [order.id as string]: {
                    timeExt: `⏳ 기존 단독 운행 대비 +${timeDiffMin}분 추가 소요`,
                    distExt: `+${distDiffKm}km 추가 주행`,
                    isGood,
                    isLoading: false,
                    isDetourCalc: true,
                    calcMainCallId: mainCall.id
                }
            }));
        } catch (error) {
            console.error(error);
            alert("서버 연결 실패. 다시 시도해주세요.");
            setSimulationResults((prev) => {
                const next = { ...prev };
                delete next[order.id as string];
                return next;
            });
        }
    };

    const handleSimulateBase = async (order: OrderData) => {
        if (!order.id) return;
        
        setSimulationResults((prev) => ({ 
            ...prev, 
            [order.id as string]: { timeExt: "카카오 API 연산 중...", distExt: "경로 탐색 중...", isGood: true, isLoading: true } 
        }));

        try {
            if (!order.pickupX || !order.pickupY || !order.dropoffX || !order.dropoffY) {
                alert("스캐너 좌표 정보(위/경도)가 없어 시뮬레이션을 돌릴 수 없습니다.");
                return;
            }

            const res = await fetch("/api/kakao/directions/compare", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    origin: { x: order.pickupX, y: order.pickupY, name: order.pickup },
                    destination: { x: order.dropoffX, y: order.dropoffY, name: order.dropoff },
                    waypoints: []
                })
            });

            if (!res.ok) {
                const errData = await res.json();
                console.error("Kakao API Error:", errData);
                alert("카카오 연산 실패: API 키를 확인해주세요.");
                return;
            }

            const data = await res.json();

            // 계산 결과 포맷팅 (단독 주행이므로 base 요약본 활용)
            const durationMin = Math.round(data.base.duration / 60);
            const distKm = (data.base.distance / 1000).toFixed(1);

            setSimulationResults((prev) => ({
                ...prev,
                [order.id as string]: {
                    timeExt: `🧭 단독 주행 예상시간: ${durationMin}분 소요`,
                    distExt: `🛣️ 예상 이동 거리: ${distKm}km`,
                    isGood: true,
                    isLoading: false,
                    isDetourCalc: false
                }
            }));
        } catch (error) {
            console.error(error);
            alert("서버 연결 실패. 다시 시도해주세요.");
            setSimulationResults((prev) => {
                const next = { ...prev };
                delete next[order.id as string];
                return next;
            });
        }
    };

    const handleConfirmSub = (order: OrderData) => {
        setSubCalls((prev) => [...prev, order]);
    };

    const handleClearAll = () => {
        setMainCall(null);
        setSubCalls([]);
        setSimulationResults({});
        setMockStep(0);
        fetchingIdsRef.current.clear();
    };

    // 대기열 필터링: 삭제했거나 이미 확정된 콜은 숨김
    const pendingOrders = orders.filter(
        (o) => o.id && !rejectedCallIds.has(o.id) && o.id !== mainCall?.id && !subCalls.some((s) => s.id === o.id)
    );

    // 💡 자동 시뮬레이션 엔진 
    // 콜이 들어오거나, mainCall이 변경되면 자동으로 뒷단에서 계산을 수행합니다.
    useEffect(() => {
        pendingOrders.forEach((order) => {
            if (!order.id) return;
            const sim = simulationResults[order.id];
            
            // 이미 이 주문에 대해 Fetch 중이면 중복 요청 방지
            if (fetchingIdsRef.current.has(order.id)) return;

            const needsBaseCalc = !mainCall && (!sim || sim.isDetourCalc);
            const needsDetourCalc = mainCall && (!sim || !sim.isDetourCalc || sim.calcMainCallId !== mainCall.id);

            if (needsBaseCalc) {
                fetchingIdsRef.current.add(order.id);
                handleSimulateBase(order).finally(() => {
                    fetchingIdsRef.current.delete(order.id as string);
                });
            } else if (needsDetourCalc) {
                fetchingIdsRef.current.add(order.id);
                handleSimulate(order).finally(() => {
                    fetchingIdsRef.current.delete(order.id as string);
                });
            }
        });
    }, [pendingOrders, mainCall, simulationResults]);

    const totalFare = activeRoute.reduce((sum, o) => sum + o.fare, 0);

    return (
        <main className="p-4 relative pb-32">
            <header className="flex items-center justify-between mb-4">
                <div>
                    <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
                        1DAL 관제탑
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">실시간 합짐 시뮬레이터</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                    <button 
                        onClick={startMockSequence} 
                        className="bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs px-3 py-1.5 rounded-lg font-bold shadow-lg shadow-fuchsia-500/20 transition-all active:scale-95"
                    >
                        🧪 목업 3연발 런처
                    </button>
                    <div className="flex items-center gap-2">
                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${isConnected ? "bg-emerald-400 animate-pulse" : "bg-red-500"}`} />
                    </div>
                </div>
            </header>

            {/* 🌟 상단: 확정된 관제 영역 (Pinned Block) */}
            {mainCall && (
                <div className="mb-6 bg-gradient-to-br from-indigo-950 to-slate-900 border-2 border-indigo-500/50 rounded-2xl p-4 shadow-xl shadow-indigo-500/10">
                    <div className="flex justify-between items-start mb-3">
                        <h2 className="text-indigo-300 font-bold text-sm tracking-wide">🏆 현재 확정 배차</h2>
                        <button onClick={handleClearAll} className="bg-slate-800 text-gray-400 px-2 py-1 rounded text-xs hover:text-white">초기화</button>
                    </div>

                    <div className="space-y-2 mb-4">
                        {activeRoute.map((route, idx) => (
                            <div key={route.id} className="flex justify-between items-center bg-black/30 p-2 text-sm rounded-lg border border-white/5">
                                <div>
                                    <span className="text-gray-400 mr-2">{idx === 0 ? "메인" : "경유"}</span>
                                    <span className="text-white font-semibold">{route.pickup}</span>
                                    <span className="mx-2 text-indigo-500">→</span>
                                    <span className="text-white font-semibold">{route.dropoff}</span>
                                </div>
                                <span className="text-indigo-200 font-bold">{route.fare.toLocaleString()}원</span>
                            </div>
                        ))}
                    </div>

                    <div className="flex justify-between items-center pt-3 border-t border-indigo-500/20">
                        <span className="text-gray-400">총 확정 운임</span>
                        <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
                            {totalFare.toLocaleString()}원
                        </span>
                    </div>

                    <div className="flex gap-2 mt-4">
                        <button className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl font-bold transition-colors">
                            📞 전체 전화걸기
                        </button>
                        <button className="flex-1 bg-yellow-400 hover:bg-yellow-300 text-yellow-900 py-3 rounded-xl font-black transition-colors">
                            🚀 아이폰 내비 발송
                        </button>
                    </div>
                </div>
            )}

            {/* 📥 하단: 실시간 수신 영역 (Pending List) */}
            <h2 className="text-gray-400 font-bold text-sm mb-3 ml-1 tracking-wide">📡 수신 대기열 ({pendingOrders.length})</h2>
            
            {pendingOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-gray-700 bg-gray-900/50 rounded-3xl border border-dashed border-gray-800">
                    <div className="text-4xl mb-2 grayscale opacity-50">📡</div>
                    <p className="text-sm font-semibold">대기 중...</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {[...pendingOrders].reverse().map((order) => {
                        const sim = order.id ? simulationResults[order.id] : null;

                        return (
                            <div key={order.id} className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl shadow-black">
                                <div className="flex justify-between items-center mb-4">
                                    <span className="text-xs text-gray-500 bg-black/40 px-2 py-1 rounded-md">{formatTime(order.timestamp)}</span>
                                    <span className="text-2xl font-black text-emerald-400">{order.fare.toLocaleString()}원</span>
                                </div>

                                <div className="flex flex-col gap-3 mb-5 bg-black/20 p-4 rounded-2xl border border-white/5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs shrink-0">출발</div>
                                        <span className="text-xl font-bold text-white truncate">{order.pickup}</span>
                                    </div>
                                    <div className="pl-4 border-l-2 border-slate-800 my-1 ml-4 h-4"></div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center font-bold text-xs shrink-0">도착</div>
                                        <span className="text-xl font-bold text-white truncate">{order.dropoff}</span>
                                    </div>
                                </div>

                                {/* 시뮬레이션 결과가 있을 때 (합짐 계산 완료) */}
                                {sim && (
                                    <div className={`mb-4 p-4 rounded-2xl border ${sim.isGood ? "bg-emerald-950/40 border-emerald-500/30" : "bg-red-950/40 border-red-500/30"} transition-all animate-in fade-in slide-in-from-top-2`}>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-lg">{sim.isGood ? "🟢" : "🔴"}</span>
                                            <span className={`font-bold ${sim.isGood ? "text-emerald-400" : "text-red-400"}`}>합짐 시뮬레이션 결과</span>
                                        </div>
                                        <div className="text-sm text-gray-300 ml-7 space-y-1 mt-2">
                                            <p>소요 시간 : <span className="font-bold text-white">{sim.timeExt}</span></p>
                                            <p>주행 거리 : <span className="font-bold text-white">{sim.distExt}</span></p>
                                        </div>
                                    </div>
                                )}

                                {/* 액션 버튼들 (자동 연산 됨) */}
                                <div className="flex gap-2">
                                    {!mainCall ? (
                                        // 메인 콜이 없을 때: 단독 수락 전
                                        sim?.isLoading ? (
                                            <button disabled className="flex-[2] bg-slate-800 text-slate-400 py-3.5 rounded-xl font-black text-lg shadow-lg">
                                                단독 경로 분석 중...
                                            </button>
                                        ) : (
                                            <button 
                                                onClick={() => handleSetMainCall(order)}
                                                className="flex-[2] bg-emerald-600 hover:bg-emerald-500 text-white py-3.5 rounded-xl font-black text-lg transition-transform active:scale-95 shadow-lg shadow-emerald-500/20"
                                            >
                                                ✅ 배차 확정
                                            </button>
                                        )
                                    ) : (
                                        // 메인 콜이 있을 때: 합짐 우회율 계산결과
                                        sim?.isLoading ? (
                                            <button disabled className="flex-[2] bg-slate-800 text-slate-400 py-3.5 rounded-xl font-black text-lg shadow-lg">
                                                우회 경로 분석 중...
                                            </button>
                                        ) : sim?.isGood ? (
                                            <button 
                                                onClick={() => handleConfirmSub(order)}
                                                className="flex-[2] bg-emerald-600 hover:bg-emerald-500 text-white py-3.5 rounded-xl font-black text-lg transition-transform active:scale-95 shadow-lg shadow-emerald-500/20"
                                            >
                                                ✅ 합짐 추가 확정
                                            </button>
                                        ) : (
                                            <button 
                                                onClick={() => handleConfirmSub(order)}
                                                className="flex-[2] bg-red-900/50 hover:bg-red-800/80 text-red-200 border border-red-500/30 py-3.5 rounded-xl font-black text-lg transition-transform active:scale-95 shadow-lg shadow-red-900/20"
                                            >
                                                ⚠️ 경고 무시 배차
                                            </button>
                                        )
                                    )}
                                    
                                    <button 
                                        onClick={() => handleReject(order.id as string)}
                                        className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-3.5 rounded-xl font-bold transition-colors"
                                    >
                                        ❌ 패스
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </main>
    );
}
