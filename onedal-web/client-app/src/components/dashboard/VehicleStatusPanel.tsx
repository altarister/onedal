import { useEffect, useState, useRef } from "react";
import { socket } from "../../lib/socket";
import { useFilterConfig } from "../../hooks/useFilterConfig";
import type { SecuredOrder } from "@onedal/shared";
import { CAPACITY_CONFIDENCE_LABEL , isAlreadyLoaded } from "@onedal/shared";
import { apiClient } from "../../api/apiClient";
import { getDistanceKm } from "../../lib/routeUtils";

import { Badge } from "../ui/badge";

// 이 패널은 "지금 트럭에 뭐가 실려 있나"만 그린다.
// 예전에는 mainCall/subCalls(종료된 콜 포함)를 받아 스스로 걸렀는데, 그 필터를
// 빠뜨려 "예약 7건 (오토바이, 오토바이, ... 라보)" 처럼 취소한 콜까지 적재 중으로
// 표시됐다. 이제 애초에 살아 있는 콜만 받는다 — 거를 것이 없으면 잊을 수도 없다.
/**
 * 🚚 **로고 자리 요약** (기사님 0831) — 헤더의 1DAL 로고를 대신한다. 같은 파생
 * (isAlreadyLoaded·capacityConfidence)을 쓰는 압축판 — 파생 두 벌을 만들지 않는다.
 */
/**
 * 🚗 **이동/정차 배지** (기사님 0831 — 지도 요약 줄로 이사). 차량 패널의 GPS 파생을
 * 그대로 쓰는 압축판 — local-gps-update 하나로 속도·시뮬 여부를 읽는다.
 */
/**
 * 🚗 **주행/정차 뷰 신호** (v23 Ⅲ · 기사님 확정 0831) — 표시만 바꾸므로 자동이 안전.
 * 이동 20km/h↑ 10초 → drive · 5km/h↓ 10초 → idle (신호대기 한 번이 콜 확인 시간).
 * 시뮬 GPS 는 drive. 파생은 MovingBadge 와 같은 이벤트 하나다.
 */
export function useDriveMotion(): 'drive' | 'idle' {
    const [mode, setMode] = useState<'drive' | 'idle'>('idle');
    useEffect(() => {
        let speed = 0;
        let last: { lat: number; lng: number; time: number } | null = null;
        let driveSince = 0; let idleSince = 0;
        /**
         * 🔴 mock 도 실 GPS 와 똑같이 **속도를 재서** 판단한다 (2026-08-31).
         *    예전엔 mock = 무조건 주행이라, 모의 주행에서 정차 상태(S2·S7)가
         *    구조적으로 한 번도 안 나왔다 — 시뮬이 정차 연기(18초 같은 자리)를
         *    하게 됐으므로 측정으로 충분하다. 출처 특례는 판단을 죽인다.
         */
        const onGps = (e: Event) => {
            const loc = (e as CustomEvent<{ lat: number, lng: number, source?: string }>).detail;
            const now = Date.now();
            if (last) {
                const h = (now - last.time) / 3_600_000;
                if (h > 0) {
                    /**
                     * 🔴 **내려갈 땐 즉시, 올라갈 땐 평활** (기사님 실측 0831 2판).
                     *    양방향 EWMA 는 모의 순항(수천 km/h)에서 0 으로 내려오는 데만
                     *    ~17초 — 12초 정차 안에 «5km/h↓ 10초»가 영영 안 찬다.
                     *    실운행도 같다: 신호 정지의 속도 0 은 잡음이 아니라 사실이다.
                     *    상한 250 은 GPS 튐(순간 수백 km/h)이 문턱을 흔들지 않게 한다.
                     */
                    const measured = Math.min(250, getDistanceKm(last.lat, last.lng, loc.lat, loc.lng) / h);
                    speed = measured < 5 ? measured : (speed * 0.7) + (measured * 0.3);
                }
            }
            last = { lat: loc.lat, lng: loc.lng, time: now };
        };
        const tick = setInterval(() => {
            const now = Date.now();
            const fast = speed >= 20;
            const slow = speed <= 5;
            if (fast) { idleSince = 0; if (!driveSince) driveSince = now; if (now - driveSince >= 10_000) setMode('drive'); }
            else driveSince = 0;
            if (slow) { if (!idleSince) idleSince = now; if (now - idleSince >= 10_000) setMode('idle'); }
            else idleSince = 0;
        }, 1_000);
        window.addEventListener('local-gps-update', onGps);
        return () => { clearInterval(tick); window.removeEventListener('local-gps-update', onGps); };
    }, []);
    return mode;
}

export function MovingBadge() {
    const [currentSpeed, setCurrentSpeed] = useState<number>(0);
    const [gpsIsMock, setGpsIsMock] = useState(false);
    const lastGpsRef = useRef<{ lat: number; lng: number; time: number } | null>(null);
    useEffect(() => {
        const onGpsUpdate = (e: Event) => {
            const loc = (e as CustomEvent<{ lat: number, lng: number, source?: string }>).detail;
            /**
             * 🔴 **모의도 실제와 같은 잣대로 잰다** (0831 리뷰에서 잡힘).
             *    예전엔 `if (isMock) 속도 0` + `isMoving = isMock || …` 라 **모의는 무조건
             *    «시뮬 주행»** 이었다. 같은 날 `useDriveMotion` 에서는 그 특례를 지웠는데
             *    여기만 남아, 무대 자막이 «정차 중»인 옆에서 배지가 «시뮬 주행»이라고
             *    반대말을 했다 (시뮬 정차 연기 18초마다). 판정은 한 잣대여야 한다.
             */
            const isMock = loc.source === 'mock';
            const now = Date.now();
            setGpsIsMock(isMock);
            if (lastGpsRef.current) {
                const distKm = getDistanceKm(lastGpsRef.current.lat, lastGpsRef.current.lng, loc.lat, loc.lng);
                const h = (now - lastGpsRef.current.time) / 3_600_000;
                // 내려갈 땐 즉시, 올라갈 땐 평활 — useDriveMotion 과 같은 규칙
                if (h > 0) {
                    const measured = Math.min(250, distKm / h);
                    setCurrentSpeed(prev => (measured < 5 ? measured : (prev * 0.7) + (measured * 0.3)));
                }
            }
            lastGpsRef.current = { ...loc, time: now };
        };
        window.addEventListener("local-gps-update", onGpsUpdate);
        return () => window.removeEventListener("local-gps-update", onGpsUpdate);
    }, []);
    const isMoving = currentSpeed > 5;
    return (
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10.5px] font-black ${isMoving ? 'border-info/30 bg-info/10 text-info' : 'border-border bg-surface-alt text-text-muted'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isMoving ? 'bg-info animate-pulse' : 'bg-text-muted'}`}></span>
            {isMoving ? `${gpsIsMock ? '시뮬 ' : ''}이동 중 ${Math.round(currentSpeed)}km/h` : `${gpsIsMock ? '시뮬 ' : ''}정차 중`}
        </span>
    );
}

export function VehicleLogoSummary({ liveCalls }: { liveCalls: SecuredOrder[] }) {
    const { filter } = useFilterConfig();
    const [dbVehicleType, setDbVehicleType] = useState<string | null>(null);
    useEffect(() => {
        apiClient.get('/settings').then(({ data }) => { if (data?.vehicleType) setDbVehicleType(data.vehicleType); }).catch(() => {});
    }, []);
    const myVehicle = dbVehicleType || filter?.allowedVehicleTypes?.[0] || '1t';
    const reserved = liveCalls.filter(o => !isAlreadyLoaded(o));
    const loaded = liveCalls.filter(o => isAlreadyLoaded(o));
    const part = (items: typeof liveCalls, prefix: string) =>
        items.length ? `${prefix} ${items.length}건 (${items.map(i => i.vehicleType || i.itemDescription || '짐').join(', ')})` : null;
    const text = [part(loaded, '상차'), part(reserved, '예약')].filter(Boolean).join(', ') || '예약 0건';
    return (
        <span className="flex items-baseline gap-1.5 whitespace-nowrap">
            <span className="text-[17px] font-black text-text-primary">{myVehicle}</span>
            <span className={`text-[12.5px] font-bold ${loaded.length ? 'text-success' : reserved.length ? 'text-info' : 'text-text-muted'}`}>{text}</span>
            {liveCalls.length > 0 && filter?.capacityConfidence && (
                <span className={`text-[10px] font-black px-1 py-0.5 rounded ${
                    filter.capacityConfidence === 'CONFIRMED' ? 'bg-success/15 text-success'
                    : filter.capacityConfidence === 'DECLARED' ? 'bg-info/15 text-info'
                    : 'bg-warning/15 text-warning'}`}>{CAPACITY_CONFIDENCE_LABEL[filter.capacityConfidence]}</span>
            )}
        </span>
    );
}

export default function VehicleStatusPanel({ liveCalls }: { liveCalls: SecuredOrder[] }) {
    const { filter } = useFilterConfig();

    // GPS 속도 계산을 위한 상태
    const [currentSpeed, setCurrentSpeed] = useState<number>(0);
    /**
     * 지금 좌표를 **시뮬레이터가 대고 있나.**
     *
     * 🔴 2026-08-14 — 화면에 `11669 km/h` 가 떴다. 시뮬레이터는 1초에 경로를 1~2km 씩
     *    **점프**하는데, 속도를 `거리 ÷ 시간` 으로 재니 그 숫자가 나온 것이다.
     *    상한을 씌우는 건 땜빵이다 — **없는 숫자를 지어내지 않는다**(규칙 ④).
     *    좌표에 출처가 실려 오므로, 시뮬레이션이면 속도 대신 그 사실을 말한다.
     */
    const [gpsIsMock, setGpsIsMock] = useState(false);
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

    useEffect(() => {
        const onGpsUpdate = (e: Event) => {
            const customEvent = e as CustomEvent<{ lat: number, lng: number, source?: string }>;
            const loc = customEvent.detail;
            const isMock = loc.source === 'mock';

            const now = Date.now();

            setGpsIsMock(isMock);
            if (isMock) {
                // 시뮬레이터 점프로 속도를 재지 않는다. 옛 값도 남기지 않는다
                setCurrentSpeed(0);
                lastGpsRef.current = { ...loc, time: now };
            } else if (lastGpsRef.current) {
                const distKm = getDistanceKm(lastGpsRef.current.lat, lastGpsRef.current.lng, loc.lat, loc.lng);
                const timeHours = (now - lastGpsRef.current.time) / (1000 * 60 * 60);
                if (timeHours > 0) {
                    const speed = distKm / timeHours;
                    // 순간적인 튐 방지 및 부드러운 속도 반영 (간단한 이동 평균)
                    setCurrentSpeed(prev => (prev * 0.7) + (speed * 0.3));
                }
            }
            if (!isMock) lastGpsRef.current = { ...loc, time: now };

        };

        window.addEventListener("local-gps-update", onGpsUpdate);
        return () => {
            window.removeEventListener("local-gps-update", onGpsUpdate);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [liveCalls.map(c => c.id).join(',')]);


    // 시뮬레이션 중에는 "달리고 있다"는 사실만 참이다 — 속도는 모른다
    const isMoving = currentSpeed > 5;
    const totalCount = liveCalls.length;

    /**
     * 🔴 **상차는 추측하지 않는다** (2026-08-19 실측).
     *
     * 예전에는 GPS 가 상차지 500m 안을 지나가면 자체 pickedUpSet 에 넣어
     * "상차 1건"으로 표시했다 — 장부는 ORDER_CONFIRMED(상차 보고 없음)인데
     * 요약만 실었다고 말하는 "한 화면 두 세상"이었다 (버그 대장 #11 과 같은 뿌리).
     * GPS 는 도착까지만 안다. 실었는가의 원천은 기사님의 상차 완료 보고
     * (ORDER_PICKED_UP) 하나고, 판별은 shared 의 isAlreadyLoaded 하나다.
     */
    const reservedItems = liveCalls.filter(o => !isAlreadyLoaded(o));
    const loadedItems = liveCalls.filter(o => isAlreadyLoaded(o));

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
                        {gpsIsMock ? '시뮬레이션 주행' : isMoving ? '이동 중' : '정차 중'}
                    </span>
                    {isMoving && !gpsIsMock && (
                        <span className="text-[10px] font-mono text-info/70 ml-1">{Math.round(currentSpeed)} km/h</span>
                    )}
                </Badge>
            </div>
        </div>
    );
}
