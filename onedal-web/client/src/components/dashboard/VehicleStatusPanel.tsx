import { useEffect, useState, useRef } from "react";
import { socket } from "../../lib/socket";
import { useFilterConfig } from "../../hooks/useFilterConfig";
import { useOrderEngine } from "../../hooks/useOrderEngine";
import type { SecuredOrder } from "@onedal/shared";
import { apiClient } from "../../api/apiClient";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";

// 하버사인 거리 계산 (km)
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export default function VehicleStatusPanel() {
    const { filter } = useFilterConfig();
    const { mainCall, subCalls } = useOrderEngine();

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
                const distKm = haversineKm(lastGpsRef.current.lat, lastGpsRef.current.lng, loc.lat, loc.lng);
                const timeHours = (now - lastGpsRef.current.time) / (1000 * 60 * 60);
                if (timeHours > 0) {
                    const speed = distKm / timeHours;
                    // 순간적인 튐 방지 및 부드러운 속도 반영 (간단한 이동 평균)
                    setCurrentSpeed(prev => (prev * 0.7) + (speed * 0.3));
                }
            }
            lastGpsRef.current = { ...loc, time: now };

            // 상차지 근접 체크 (500m 이내)
            const activeRoute = [mainCall, ...subCalls].filter(Boolean) as SecuredOrder[];
            setPickedUpSet(prev => {
                let changed = false;
                const newSet = new Set(prev);
                activeRoute.forEach(order => {
                    if (order.id && order.pickupY && order.pickupX && !newSet.has(order.id)) {
                        const dist = haversineKm(loc.lat, loc.lng, order.pickupY, order.pickupX);
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
    }, [mainCall, subCalls]);

    // 콜이 취소/완료되어 activeRoute에서 사라지면 pickedUpSet에서도 정리
    useEffect(() => {
        const activeIds = new Set([mainCall?.id, ...subCalls.map(s => s.id)].filter(Boolean) as string[]);
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
    }, [mainCall, subCalls]);

    const isMoving = currentSpeed > 5;
    const activeRoute = [mainCall, ...subCalls].filter(Boolean) as SecuredOrder[];
    const totalCount = activeRoute.length;

    // 예약 건 vs 상차 건 분류
    const reservedItems = activeRoute.filter(o => o.id && !pickedUpSet.has(o.id));
    const loadedItems = activeRoute.filter(o => o.id && pickedUpSet.has(o.id));

    // 내 차량 (DB 설정 우선, 없으면 필터 설정)
    const myVehicle = dbVehicleType || filter?.allowedVehicleTypes?.[0] || '1t';

    const renderLoadStatus = () => {
        if (totalCount === 0) {
            return <span className="text-muted-foreground">예약 0건</span>;
        }

        const formatItems = (items: SecuredOrder[], prefix: string) => {
            if (items.length === 0) return null;
            const vehicles = items.map(i => i.vehicleType || i.itemDescription || '짐').join(', ');
            return `${prefix} ${items.length}건 (${vehicles})`;
        };

        const reservedStr = formatItems(reservedItems, '예약');
        const loadedStr = formatItems(loadedItems, '상차');

        if (reservedStr && loadedStr) {
            return <span className="text-amber-500 font-bold">{loadedStr}, {reservedStr}</span>;
        } else if (loadedStr) {
            return <span className="text-emerald-500 font-bold">{loadedStr}</span>;
        } else if (reservedStr) {
            return <span className="text-blue-500 font-bold">{reservedStr}</span>;
        }
        return null;
    };

    return (
        <Card className="flex flex-row items-center justify-between px-2 py-1 shadow-sm border-border bg-card rounded-lg">
            <div className="flex items-center gap-2">
                <span className="text-sm font-black text-foreground">{myVehicle}</span>
                <div className="text-xs mt-0.5">
                    {renderLoadStatus()}
                </div>
            </div>

            <div className="flex flex-col items-end gap-1">
                <Badge variant="outline" className={`gap-1.5 px-2 py-0.5 rounded-full ${isMoving ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-500' : 'border-border bg-muted text-muted-foreground'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isMoving ? 'bg-cyan-500 animate-pulse' : 'bg-muted-foreground'}`}></span>
                    <span className="text-[11px] font-black tracking-wider">
                        {isMoving ? '이동 중' : '정차 중'}
                    </span>
                    {isMoving && (
                        <span className="text-[10px] font-mono text-cyan-500/70 ml-1">{Math.round(currentSpeed)} km/h</span>
                    )}
                </Badge>
            </div>
        </Card>
    );
}
