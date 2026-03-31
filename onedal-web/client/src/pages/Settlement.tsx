import { useEffect, useState } from "react";
import type { OrderData } from "@onedal/shared";

export default function Settlement() {
    const [orders, setOrders] = useState<OrderData[]>([]);

    useEffect(() => {
        // API에서 기존 데이터 가져오기
        fetch("/api/orders")
            .then((res) => res.json())
            .then((data) => setOrders(data.orders || []))
            .catch(() => { });
    }, []);

    const totalCalls = orders.length;
    const confirmedCalls = orders.filter((o) => o.status === "confirmed").length;

    return (
        <main className="p-4">
            <header className="mb-6">
                <h1 className="text-3xl font-black tracking-tight text-white">💰 정산</h1>
                <p className="text-sm text-gray-500 mt-1">오늘 하루의 수익 요약</p>
            </header>

            {/* 요약 카드 */}
            <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                    <h3 className="text-gray-400 text-sm font-semibold mb-2">오늘 콜 수</h3>
                    <p className="text-4xl font-black text-white">{totalCalls} <span className="text-lg text-gray-500 font-medium">건</span></p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                    <h3 className="text-gray-400 text-sm font-semibold mb-2">확정 건수</h3>
                    <p className="text-4xl font-black text-emerald-400">{confirmedCalls} <span className="text-lg text-gray-500 font-medium">건</span></p>
                </div>
            </div>

            {/* 콜 리스트 (추후 무한스크롤 추가 가능) */}
            <h2 className="text-xl font-bold text-gray-300 mb-4">전체 콜 내역</h2>

            {orders.length === 0 ? (
                <div className="text-center py-10 text-gray-600">
                    오늘 수신된 콜이 없습니다.
                </div>
            ) : (
                <div className="space-y-3">
                    {[...orders].reverse().map((order) => {
                        const date = new Date(order.timestamp);
                        const timeStr = `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
                        const isConfirmed = order.status === "confirmed";

                        return (
                            <div
                                key={order.id}
                                className={`flex items-center justify-between p-4 rounded-xl border ${isConfirmed ? "bg-emerald-950/20 border-emerald-900/30" : "bg-gray-900 border-gray-800"
                                    }`}
                            >
                                <div>
                                    <div className="text-sm text-gray-400 mb-1">{timeStr}</div>
                                    <div className="font-semibold text-gray-200">
                                        <span>{order.pickup} → {order.dropoff}</span>
                                    </div>
                                </div>

                                <div className="text-right">
                                    <div className={`text-sm font-bold px-2 py-1 rounded-md inline-block ${isConfirmed ? "text-emerald-400 bg-emerald-400/10" : "text-gray-400 bg-gray-800"
                                        }`}>
                                        {isConfirmed ? "확정" : "대기"}
                                    </div>
                                    <div className="text-lg font-black text-white mt-1">
                                        {order.fare.toLocaleString()}원
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </main>
    );
}
