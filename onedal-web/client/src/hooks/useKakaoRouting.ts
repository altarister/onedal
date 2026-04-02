import { useState, useEffect, useRef } from "react";
import type { SecuredOrder, SimplifiedOfficeOrder } from "@onedal/shared";

export type SimResult = {
    timeExt: string;
    distExt: string;
    isGood: boolean;
    isLoading?: boolean;
    isDetourCalc?: boolean;
    calcMainCallId?: string;
};

export function useKakaoRouting(pendingOrders: SimplifiedOfficeOrder[], mainCall: SecuredOrder | null) {
    const [simulationResults, setSimulationResults] = useState<Record<string, SimResult>>({});
    const fetchingIdsRef = useRef<Set<string>>(new Set());

    const handleSimulateBase = async (order: SimplifiedOfficeOrder) => {
        if (!order.id) return;
        setSimulationResults(prev => ({ ...prev, [order.id as string]: { timeExt: "카카오 API 연산 중...", distExt: "경로 탐색 중...", isGood: true, isLoading: true } }));
        try {
            if (!order.pickupX || !order.pickupY || !order.dropoffX || !order.dropoffY) return;
            const res = await fetch("/api/kakao/directions/compare", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    origin: { x: order.pickupX, y: order.pickupY, name: order.pickup },
                    destination: { x: order.dropoffX, y: order.dropoffY, name: order.dropoff },
                    waypoints: []
                })
            });
            if (!res.ok) return;
            const data = await res.json();
            const durationMin = Math.round(data.base.duration / 60);
            const distKm = (data.base.distance / 1000).toFixed(1);
            setSimulationResults(prev => ({
                ...prev, [order.id as string]: { timeExt: `🧭 단독 주행: ${durationMin}분 소요`, distExt: `🛣️ 예상 거리: ${distKm}km`, isGood: true, isLoading: false, isDetourCalc: false }
            }));
        } catch (error) { console.error(error); }
    };

    const handleSimulate = async (order: SimplifiedOfficeOrder) => {
        if (!order.id || !mainCall) return;
        setSimulationResults(prev => ({ ...prev, [order.id as string]: { timeExt: "카카오 API 연산 중...", distExt: "거리를 불러오는 중...", isGood: true, isLoading: true } }));
        try {
            if (!mainCall.pickupX || !mainCall.pickupY || !mainCall.dropoffX || !mainCall.dropoffY || !order.pickupX || !order.pickupY || !order.dropoffX || !order.dropoffY) return;
            const res = await fetch("/api/kakao/directions/compare", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    origin: { x: mainCall.pickupX, y: mainCall.pickupY, name: mainCall.pickup },
                    destination: { x: mainCall.dropoffX, y: mainCall.dropoffY, name: mainCall.dropoff },
                    waypoints: [ { x: order.pickupX, y: order.pickupY, name: order.pickup }, { x: order.dropoffX, y: order.dropoffY, name: order.dropoff } ]
                })
            });
            if (!res.ok) return;
            const data = await res.json();
            const timeDiffMin = Math.round(data.diff.timeExtSeconds / 60);
            const distDiffKm = (data.diff.distExtMeters / 1000).toFixed(1);
            const isGood = timeDiffMin < 25;
            setSimulationResults(prev => ({
                ...prev, [order.id as string]: { timeExt: `⏳ 기존 대비 +${timeDiffMin}분 추가 소요`, distExt: `+${distDiffKm}km 추가 주행`, isGood, isLoading: false, isDetourCalc: true, calcMainCallId: mainCall.id }
            }));
        } catch (error) { console.error(error); }
    };

    useEffect(() => {
        pendingOrders.forEach((order) => {
            if (!order.id) return;
            const sim = simulationResults[order.id];
            if (fetchingIdsRef.current.has(order.id)) return;

            const needsBaseCalc = !mainCall && (!sim || sim.isDetourCalc);
            const needsDetourCalc = mainCall && (!sim || !sim.isDetourCalc || sim.calcMainCallId !== mainCall.id);

            if (needsBaseCalc) {
                fetchingIdsRef.current.add(order.id);
                handleSimulateBase(order).finally(() => { fetchingIdsRef.current.delete(order.id as string); });
            } else if (needsDetourCalc) {
                fetchingIdsRef.current.add(order.id);
                handleSimulate(order).finally(() => { fetchingIdsRef.current.delete(order.id as string); });
            }
        });
    }, [pendingOrders, mainCall, simulationResults]);

    return { simulationResults };
}
