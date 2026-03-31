"use client";

import { useEffect, useState } from "react";

type Order = {
    id: string;
    texts: string[];
    timestamp: string;
    status: string;
};

export default function SettlementPage() {
    const [orders, setOrders] = useState<Order[]>([]);

    useEffect(() => {
        const fetchOrders = async () => {
            try {
                const res = await fetch("/api/orders");
                const data = await res.json();
                setOrders(data.orders || []);
            } catch {
                console.log("정산 데이터 로드 실패");
            }
        };
        fetchOrders();
    }, []);

    // 오늘 날짜 콜만 필터
    const today = new Date().toISOString().split("T")[0];
    const todayOrders = orders.filter((o) => o.timestamp.startsWith(today));

    return (
        <main className="min-h-screen p-4 pb-24">
            <header className="mb-6">
                <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
                    💰 정산
                </h1>
                <p className="text-sm text-gray-500 mt-1">{today}</p>
            </header>

            {/* 오늘 요약 */}
            <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 text-center">
                    <p className="text-4xl font-black text-white">{todayOrders.length}</p>
                    <p className="text-sm text-gray-500 mt-1">오늘 콜 수</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 text-center">
                    <p className="text-4xl font-black text-emerald-400">
                        {todayOrders.filter((o) => o.status === "confirmed").length}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">확정 건수</p>
                </div>
            </div>

            {/* 콜 히스토리 */}
            <h2 className="text-lg font-bold text-gray-400 mb-3">오늘의 콜 내역</h2>
            {todayOrders.length === 0 ? (
                <p className="text-gray-600 text-center py-10">아직 콜이 없습니다</p>
            ) : (
                <div className="space-y-3">
                    {[...todayOrders].reverse().map((order) => (
                        <div
                            key={order.id}
                            className="bg-gray-900 border border-gray-800 rounded-xl p-4"
                        >
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs text-gray-500">
                                    {new Date(order.timestamp).toLocaleTimeString("ko-KR")}
                                </span>
                                <span className="text-xs text-gray-500">{order.status}</span>
                            </div>
                            <p className="text-white font-semibold">
                                {order.texts.join(" → ")}
                            </p>
                        </div>
                    ))}
                </div>
            )}

            {/* 하단 네비게이션 */}
            <nav className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur border-t border-gray-800 flex">
                <a
                    href="/"
                    className="flex-1 py-4 text-center text-gray-500 font-bold text-sm"
                >
                    📡 실시간
                </a>
                <a
                    href="/settlement"
                    className="flex-1 py-4 text-center text-amber-400 font-bold text-sm"
                >
                    💰 정산
                </a>
            </nav>
        </main>
    );
}
