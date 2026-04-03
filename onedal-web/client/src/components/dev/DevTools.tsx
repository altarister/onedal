import { useState } from "react";
import { Button } from "../ui/Button";
import { MOCK_SCRAP_POOL } from "./mockScrapOrderData";
import { MOCK_OFFICE_ORDERS } from "./mockOfficeOrderData";
import type { DispatchConfirmRequest, OfficeOrder } from "@onedal/shared";

// 타이머 객체들을 기억해서 초기화 시 일괄 정리하기 위한 전역 모듈 변수
let activeTimers: any[] = [];
let activeBotIds: string[] = [];

function DevTools() {
    const [isOpen, setIsOpen] = useState(false);
    const [botCount, setBotCount] = useState<number>(0);
    const [isLiveMode, setIsLiveMode] = useState<boolean>(false);

    // 타겟 서버 URL 결정 함수
    const getApiUrl = (path: string) => {
        return isLiveMode ? `https://1dal.altari.com${path}` : path;
    };

    const spawnBot = () => {
        const botId = `테스트폰-${Math.floor(Math.random() * 1000)}`;
        activeBotIds.push(botId);
        let stats = { polled: 0, grabbed: 0, canceled: 0 };
        // 더 이상 /ping을 따로 쏘지 않습니다 (TRD 단방향 설계 원칙 준수)

        // 3초 단위 오답노트(스크랩) 가상 콜 수집
        // (데드맨 스위치가 5초이므로, 생존 신고 역할을 겸하기 위해 3초 주기로 전송)
        const t2 = setInterval(() => {
            // MOCK_SCRAP_POOL에서 무작위로 1~5개의 현실적인 데이터를 뽑아옵니다.
            const batchSize = Math.floor(Math.random() * 5) + 1;
            const mockScrapBatch = Array.from({ length: batchSize }).map(() => {
                const randomItem = MOCK_SCRAP_POOL[Math.floor(Math.random() * MOCK_SCRAP_POOL.length)];
                return {
                    ...randomItem,
                    id: `scrap-${Date.now()}-${Math.random()}`, // 고유성 보장
                    timestamp: new Date().toISOString()
                };
            });

            fetch(getApiUrl("/api/scrap"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ deviceId: botId, data: mockScrapBatch })
            })
                // Piggybacking으로 전달받은 서버 모드 명령을 확인 가능
                // .then(r => r.json()).then(res => setLocalConfigMode(res.mode))
                .catch(() => { });

            stats.polled += mockScrapBatch.length;
        }, 3000);

        activeTimers.push(t2);
        setBotCount(prev => prev + 1);
        console.log(`🤖 DevTools: ${botId} 오답노트 수집 봇 가동!`);
    };

    const clearDevices = () => {
        // 프론트 주기적 폴링 봇 완전 정지
        activeTimers.forEach(clearInterval);
        activeTimers = [];
        activeBotIds = [];

        // 백엔드 메모리 DB 완전 삭제
        fetch(getApiUrl("/api/devices/clear"), { method: "POST" })
            .then(() => {
                setBotCount(0);
                console.log("🧹 프론트 및 서버 기기 세션 모두 초기화 완료");
            })
            .catch(console.error);
    };

    const fireMockOfficeOrder = () => {
        // 실제 들어와 있는 폰 중 하나를 랜덤 선택, 없으면 임시 폰
        const botId = activeBotIds.length > 0
            ? activeBotIds[Math.floor(Math.random() * activeBotIds.length)]
            : `1DAL-임시폰-${Math.floor(Math.random() * 100)}`;

        // 10개의 고도화된 타겟 오더 중 하나를 랜덤 픽
        const mockCall = MOCK_OFFICE_ORDERS[Math.floor(Math.random() * MOCK_OFFICE_ORDERS.length)] as OfficeOrder;

        const basicPayload: DispatchConfirmRequest = {
            step: 'BASIC',
            deviceId: botId,
            order: { ...mockCall, timestamp: new Date().toISOString() } as OfficeOrder,
            capturedAt: new Date().toISOString(),
            matchType: 'AUTO'
        };
        fetch(getApiUrl("/api/orders/confirm"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(basicPayload) });

        setTimeout(() => {
            const detailedPayload: DispatchConfirmRequest = {
                step: 'DETAILED',
                deviceId: botId,
                order: { ...mockCall, timestamp: new Date().toISOString() } as OfficeOrder,
                capturedAt: new Date().toISOString(),
                matchType: 'AUTO'
            };
            fetch(getApiUrl("/api/orders/confirm"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(detailedPayload) });
        }, 1000);

        console.log(`🎯 [테스트 배차] ${botId}가 콜을 선점했습니다!`);
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-24 right-4 z-[9999] bg-fuchsia-600 border-2 border-fuchsia-400 text-white rounded-full w-12 h-12 flex items-center justify-center shadow-[0_0_15px_rgba(192,38,211,0.5)] font-black text-xl transition-transform hover:scale-110 opacity-60 hover:opacity-100"
            >
                🛠️
            </button>
        );
    }

    return (
        <div className="fixed bottom-24 right-4 z-[9999] w-22 bg-slate-900 border border-fuchsia-500/50 rounded-lg shadow-2xl overflow-hidden backdrop-blur-md">
            <div className="bg-fuchsia-900/40 border-b border-fuchsia-500/30 px-2 py-1 flex justify-between items-center">
                <span className="font-bold text-fuchsia-300 text-xs text-center w-full">목업 툴</span>
                <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white px-1 ml-1 rounded font-bold text-xs">X</button>
            </div>
            <div className="p-2 flex flex-col gap-1.5">
                <Button
                    size="sm"
                    onClick={spawnBot}
                    className="w-full h-7 text-xs bg-slate-800 border-dashed border border-fuchsia-500/30 text-fuchsia-400 hover:bg-slate-700 font-bold"
                >
                    폰 ({botCount})
                </Button>

                <Button
                    size="sm"
                    disabled={botCount === 0}
                    onClick={fireMockOfficeOrder}
                    className="w-full h-7 text-xs bg-emerald-950/40 border-dashed border border-emerald-500/50 text-emerald-400 hover:bg-emerald-900/60 font-bold"
                >
                    가상 콜
                </Button>

                <Button
                    size="sm"
                    onClick={clearDevices}
                    variant="outline"
                    className="w-full h-7 text-xs bg-red-950/30 border-dashed border border-red-500/30 text-red-400 hover:bg-red-900/50 hover:text-red-300 font-bold px-0"
                >
                    퇴근
                </Button>

                {/* API 발송 타겟 (Local / Live) 전환 토글 */}
                <div 
                    onClick={() => setIsLiveMode(!isLiveMode)}
                    className={`mt-1 flex items-center justify-center py-1 rounded cursor-pointer border text-[10px] font-black transition-all shadow-inner ${isLiveMode ? 'bg-indigo-900/40 border-indigo-500 text-indigo-300' : 'bg-slate-800 border-slate-600 text-slate-400'}`}
                >
                    {isLiveMode ? '📡 실서버로 발송 중' : '🏠 내 PC로 발송 중'}
                </div>
            </div>
        </div>
    );
}

export default DevTools;
