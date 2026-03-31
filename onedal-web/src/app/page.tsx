"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { io, Socket } from "socket.io-client";

type Order = {
  id: string;
  texts: string[];
  timestamp: string;
  status: "pending" | "confirmed" | "completed";
};

export default function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const socketRef = useRef<Socket | null>(null);

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
    // 1. 기존 콜 목록 로딩 (최초 1회)
    fetch("/api/orders")
      .then((res) => res.json())
      .then((data) => setOrders(data.orders || []))
      .catch(() => { });

    // 2. Socket.io 연결
    const socket = io();
    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      console.log("🔌 소켓 연결됨:", socket.id);
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
      console.log("❌ 소켓 끊김");
    });

    // 3. 새 콜이 오면 즉시 카드에 추가 + 알림음
    socket.on("new-order", (newOrder: Order) => {
      console.log("🆕 새 콜 도착!", newOrder);
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

  return (
    <main className="min-h-screen p-4">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
            1DAL 관제탑
          </h1>
          <p className="text-sm text-gray-500 mt-1">실시간 콜 모니터링</p>
        </div>
        <div className="flex gap-2 items-center">
          <span
            className={`inline-block w-3 h-3 rounded-full ${isConnected ? "bg-emerald-400 animate-pulse" : "bg-red-500"
              }`}
          />
          <span className="text-xs text-gray-400">
            {isConnected ? "소켓 연결됨" : "소켓 끊김"}
          </span>
          {wakeLockActive && (
            <span className="text-xs text-yellow-400 ml-2">🔆 화면유지</span>
          )}
        </div>
      </header>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[60vh] text-gray-600">
          <div className="text-6xl mb-4">📡</div>
          <p className="text-xl font-semibold">대기 중...</p>
          <p className="text-sm mt-2">
            스캐너 폰에서 콜이 들어오면 여기에 즉시 표시됩니다
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {[...orders].reverse().map((order) => (
            <div
              key={order.id}
              className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-lg shadow-violet-500/5 hover:border-violet-500/30 transition-all"
            >
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs text-gray-500">
                  {formatTime(order.timestamp)}
                </span>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${order.status === "pending"
                      ? "bg-amber-500/20 text-amber-400"
                      : order.status === "confirmed"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-gray-700 text-gray-400"
                    }`}
                >
                  {order.status === "pending"
                    ? "⏳ 대기"
                    : order.status === "confirmed"
                      ? "✅ 확정"
                      : "완료"}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {order.texts.map((text, i) => (
                  <span
                    key={i}
                    className="bg-gray-800 text-white px-3 py-2 rounded-xl text-lg font-bold"
                  >
                    {text}
                  </span>
                ))}
              </div>

              <div className="flex gap-3 mt-4">
                <a
                  href="tel:010-0000-0000"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-center py-3 rounded-xl font-bold text-lg transition-colors"
                >
                  📞 상차지 전화
                </a>
                <a
                  href={`kakaonavi://navigate?ep=${encodeURIComponent(
                    order.texts[order.texts.length - 1] || ""
                  )}`}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-center py-3 rounded-xl font-bold text-lg transition-colors"
                >
                  🗺️ 카카오내비
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur border-t border-gray-800 flex">
        <a
          href="/"
          className="flex-1 py-4 text-center text-violet-400 font-bold text-sm"
        >
          📡 실시간
        </a>
        <a
          href="/settlement"
          className="flex-1 py-4 text-center text-gray-500 font-bold text-sm"
        >
          💰 정산
        </a>
      </nav>
    </main>
  );
}
