import { useEffect, useState, useRef } from "react";
import { socket } from "../../lib/socket";
import { useFilterConfig } from "../../hooks/useFilterConfig";
import type { SecuredOrder } from "@onedal/shared";
import { CAPACITY_CONFIDENCE_LABEL } from "@onedal/shared";
import { apiClient } from "../../api/apiClient";
import { getDistanceKm } from "../../lib/routeUtils";

import { Badge } from "../ui/badge";

// 이 패널은 "지금 트럭에 뭐가 실려 있나"만 그린다.
// 예전에는 mainCall/subCalls(종료된 콜 포함)를 받아 스스로 걸렀는데, 그 필터를
// 빠뜨려 "예약 7건 (오토바이, 오토바이, ... 라보)" 처럼 취소한 콜까지 적재 중으로
// 표시됐다. 이제 애초에 살아 있는 콜만 받는다 — 거를 것이 없으면 잊을 수도 없다.
export default function VehicleStatusPanel({ liveCalls }: { liveCalls: SecuredOrder[] }) {
    const { filter } = useFilterConfig();

    // GPS 속도 계산을 위한 상태
    const [currentSpeed, setCurrentSpeed] = useState<number>(0);
    const lastGpsRef = useRef<{ lat: number; lng: number; time: number } | null>(null);


    // 내 차량 정보 (DB 연동)
    const [dbVehicleType, setDbVehicleType] = useState<string>('1t');

    useEffect(() => {
        const fetchVehicle = () => {
            apiClient.get('/settings').then(res => {
                if (res.data.vehicleType) setDbVehicleType(res.data.vehicleType);
            }).catch(err => console.error("차량 정보 로드 실패:", err));
        };

        fetchVehicle();

        const onSettingsUpdated = (newSettings: any) => {
            if (newSettings.vehicleType) {
                setDbVehicleType(newSettings.vehicleType);
            }
        };

        socket.on("settings-updated", onSettingsUpdated);
        return () => {
            socket.off("settings-updated", onSettingsUpdated);
        };
    }, []);

    // 상차 완료 여부 추적 (콜 ID 별 boolean)
    // 한 번 500m 이내로 접근하면 상차 완료로 간주
    const [pickedUpSet, setPickedUpSet] = useState<Set<string>>(new Set());

    useEffect(() => {
        const onGpsUpdate = (e: Event) => {
            const customEvent = e as CustomEvent<{ lat: number, lng: number }>;
            const loc = customEvent.detail;

            const now = Date.now();


            if (lastGpsRef.current) {
                const distKm = getDistanceKm(lastGpsRef.current.lat, lastGpsRef.current.lng, loc.lat, loc.lng);
                const timeHours = (now - lastGpsRef.current.time) / (1000 * 60 * 60);
                if (timeHours > 0) {
                    const speed = distKm / timeHours;
                    // 순간적인 튐 방지 및 부드러운 속도 반영 (간단한 이동 평균)
                    setCurrentSpeed(prev => (prev * 0.7) + (speed * 0.3));
                }
            }
            lastGpsRef.current = { ...loc, time: now };

            // 상차지 근접 체크 (500m 이내)
            // 취소·방출·완료된 콜은 제외한다. 그렇지 않으면 이미 취소한 콜의 상차지를
            // 지나가기만 해도 "상차 완료"로 기록된다.
            const activeRoute = liveCalls;
            setPickedUpSet(prev => {
                let changed = false;
                const newSet = new Set(prev);
                activeRoute.forEach(order => {
                    if (order.id && order.pickupY && order.pickupX && !newSet.has(order.id)) {
                        const dist = getDistanceKm(loc.lat, loc.lng, order.pickupY, order.pickupX);
                        if (dist < 0.5) { // 500m 이내 접근 시 상차로 간주
                            newSet.add(order.id);
                            changed = true;
                        }
                    }
                });
                return changed ? newSet : prev;
            });
        };

        window.addEventListener("local-gps-update", onGpsUpdate);
        return () => {
            window.removeEventListener("local-gps-update", onGpsUpdate);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [liveCalls.map(c => c.id).join(',')]);

    // 콜이 취소/완료되어 activeRoute에서 사라지면 pickedUpSet에서도 정리
    useEffect(() => {
        const activeIds = new Set(liveCalls.map(c => c.id).filter(Boolean) as string[]);
        setPickedUpSet(prev => {
            let changed = false;
            const next = new Set(prev);
            for (const id of next) {
                if (!activeIds.has(id)) {
                    next.delete(id);
                    changed = true;
                }
            }
            return changed ? next : prev;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [liveCalls.map(c => c.id).join(',')]);

    const isMoving = currentSpeed > 5;
    const totalCount = liveCalls.length;

    // 예약 건 vs 상차 건 분류
    const reservedItems = liveCalls.filter(o => o.id && !pickedUpSet.has(o.id));
    const loadedItems = liveCalls.filter(o => o.id && pickedUpSet.has(o.id));

    // 내 차량 (DB 설정 우선, 없으면 필터 설정)
    const myVehicle = dbVehicleType || filter?.allowedVehicleTypes?.[0] || '1t';

    const renderLoadStatus = () => {
        if (totalCount === 0) {
            return <span className="text-text-muted">예약 0건</span>;
        }

        const formatItems = (items: SecuredOrder[], prefix: string) => {
            if (items.length === 0) return null;
            const vehicles = items.map(i => i.vehicleType || i.itemDescription || '짐').join(', ');
            return `${prefix} ${items.length}건 (${vehicles})`;
        };

        const reservedStr = formatItems(reservedItems, '예약');
        const loadedStr = formatItems(loadedItems, '상차');

        if (reservedStr && loadedStr) {
            return <span className="text-warning font-bold">{loadedStr}, {reservedStr}</span>;
        } else if (loadedStr) {
            return <span className="text-success font-bold">{loadedStr}</span>;
        } else if (reservedStr) {
            return <span className="text-info font-bold">{reservedStr}</span>;
        }
        return null;
    };

    return (
        <div className="flex flex-row items-center justify-between px-4 py-2 border-b border-border-card">
            <div className="flex items-center gap-2">
                <span className="text-sm font-black text-text-primary">{myVehicle}</span>
                <div className="text-xs mt-0.5 flex items-center gap-1.5">
                    {renderLoadStatus()}
                    {/* [Phase 8.4] 잔여 적재량을 얼마나 믿을 수 있는지 드러낸다.
                        '추정'은 차종만 보고 계산한 값이라 현장에서 안 들어갈 수 있다.
                        기사님이 그 위험을 알고 합짐을 잡아야 한다. */}
                    {liveCalls.length > 0 && filter?.capacityConfidence && (
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                            filter.capacityConfidence === 'CONFIRMED' ? 'bg-success/15 text-success'
                            : filter.capacityConfidence === 'DECLARED' ? 'bg-info/15 text-info'
                            : 'bg-warning/15 text-warning'
                        }`}>
                            {CAPACITY_CONFIDENCE_LABEL[filter.capacityConfidence]}
                        </span>
                    )}
                </div>
            </div>

            <div className="flex flex-col items-end gap-1">
                <Badge variant="outline" className={`gap-1.5 px-2 py-0.5 rounded-full ${isMoving ? 'border-info/30 bg-info/10 text-info' : 'border-border bg-surface-alt text-text-muted'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isMoving ? 'bg-info animate-pulse' : 'bg-text-muted'}`}></span>
                    <span className="text-[11px] font-black tracking-wider">
                        {isMoving ? '이동 중' : '정차 중'}
                    </span>
                    {isMoving && (
                        <span className="text-[10px] font-mono text-info/70 ml-1">{Math.round(currentSpeed)} km/h</span>
                    )}
                </Badge>
            </div>
        </div>
    );
}
