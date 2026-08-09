import { useEffect, useState, useRef } from "react";
import { socket } from "../../lib/socket";
import { useFilterConfig } from "../../hooks/useFilterConfig";
import type { SecuredOrder } from "@onedal/shared";
import { isTerminal } from "@onedal/shared";
import { apiClient } from "../../api/apiClient";
import { getDistanceKm } from "../../lib/routeUtils";

import { Badge } from "../ui/badge";

export default function VehicleStatusPanel({ mainCall, subCalls }: { mainCall: SecuredOrder | null, subCalls: SecuredOrder[] }) {
    const { filter } = useFilterConfig();

    // 지금 실제로 트럭에 걸려 있는 콜만 추린다.
    //
    // mainCall / subCalls 는 서버의 sync-active-orders 를 그대로 받은 것으로,
    // '취소/방출' 탭 표시를 위해 **종료된 콜(취소·방출·완료)이 의도적으로 포함**되어 있다.
    // 이걸 거르지 않아 "예약 7건 (오토바이, 오토바이, ... 라보)" 처럼
    // 이미 취소한 콜까지 적재 중인 것으로 표시되고 있었다.
    // PinnedRoute 는 liveRoute 로 걸러내는데 이 컴포넌트만 빠져 있었다. (2026-08-09 수정)
    const liveCalls = ([mainCall, ...subCalls].filter(Boolean) as SecuredOrder[])
        .filter(o => !isTerminal(o.status));

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
                <div className="text-xs mt-0.5">
                    {renderLoadStatus()}
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
