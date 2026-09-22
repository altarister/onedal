import { useEffect, useState, useRef } from "react";
import { useSettingsStore } from '../../stores/settingsStore';
import { socket } from "../../lib/socket";
import { useFilterConfig } from "../../hooks/useFilterConfig";
import type { SecuredOrder } from "@onedal/shared";
import { CAPACITY_CONFIDENCE_LABEL, isAlreadyLoaded, isEvaluating, TRUCK_CAPACITY_SLOTS } from "@onedal/shared";
import { apiClient } from "../../api/apiClient";
import { logStateChange } from '../../lib/roadmapLogger';
import { initialMotion, motionOnFix, motionOnTick } from './driveMotion';

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
    /**
     * ⏱️ **«몇 초 이어져야 그렇다고 믿나» — 기사님이 정한다** (화면규칙 S16 · 2026-09-12).
     *
     * 🔴 **읽는 곳은 여기 하나다** (규칙 ⑤-4 ⑤). 이 값이 여러 곳에 흩어지면
     *    «화면은 주행인데 배지는 정차»가 난다.
     * 🔴 모의 주행은 배속이 빨라 정거장 사이를 2~7초에 지나간다 — 기본 10초로는
     *    «주행 중»이 **한 번도 성립하지 않는다** (기사님 실측). 그때는 설정에서 줄인다.
     */
    const holdMs = useSettingsStore(st => st.motionHoldSec) * 1000;
    /**
     * 🔴 **ref 로 든다 — 클로저에 가두면 설정을 바꿔도 안 따른다** (기사님 실측 2026-09-12).
     *    ⚠️ 의존성에 `[holdMs]` 를 넣으면 값이 바뀔 때마다 측정 상태가 초기화된다 — ref 면 재구독 없이 최신 값을 본다.
     *    ⚠️ `lint:gate` 는 `exhaustive-deps` 를 꺼 뒀으므로 **이 종류는 기계가 안 잡는다**.
     */
    const holdRef = useRef(holdMs);
    useEffect(() => { holdRef.current = holdMs; }, [holdMs]);
    useEffect(() => {
        /* 🧮 판정은 `driveMotion` 순수 함수 — 좌표가 끊기면 속도 «모름»으로 주행을 내린다 (#132) */
        let st = initialMotion();
        const onGps = (e: Event) => {
            const loc = (e as CustomEvent<{ lat: number, lng: number, source?: string }>).detail;
            st = motionOnFix(st, loc, Date.now());
        };
        /**
         * 📡 **판정이 바뀌면 그때의 속도와 함께 남긴다** (기사님 지시).
         *    «도착했는데 이동 중»을 눈이 아니라 로그로 잡기 위해서다.
         */
        const tick = setInterval(() => {
            const next = motionOnTick(st, Date.now(), holdRef.current);
            if (next.mode !== st.mode) {
                logStateChange("주행판정", `${next.mode} ${next.speed === null ? '속도 모름(좌표 끊김)' : `${Math.round(next.speed)}km/h`}`, "차량");
                setMode(next.mode);
            }
            st = next;
        }, 1_000);
        window.addEventListener('local-gps-update', onGps);
        return () => { clearInterval(tick); window.removeEventListener('local-gps-update', onGps); };
    }, []);
    return mode;
}

/**
 * 🚗 **지금 속도 — 지도 배지·차량 패널이 읽는다** (판정은 `driveMotion` 순수 함수 · #132).
 *    좌표가 끊기면 `null`(모름) — 마지막 속도로 «이동 중»을 남기지 않는다.
 */
export function useGpsSpeed(): { speed: number | null; isMock: boolean } {
    const [view, setView] = useState<{ speed: number | null; isMock: boolean }>({ speed: null, isMock: false });
    useEffect(() => {
        let st = initialMotion();
        let isMock = false;
        const push = () => setView(v => (v.speed === st.speed && v.isMock === isMock) ? v : { speed: st.speed, isMock });
        const onGps = (e: Event) => {
            const loc = (e as CustomEvent<{ lat: number, lng: number, source?: string }>).detail;
            /* 🔴 모의도 실제와 같은 잣대로 잰다 (0831 리뷰) — 출처는 표시에만 쓴다 */
            isMock = loc.source === 'mock';
            st = motionOnFix(st, loc, Date.now());
            push();
        };
        /* 속도만 쓰므로 유지 초는 판정에 안 쓰인다 — 끊김만 본다 */
        const tick = setInterval(() => { st = motionOnTick(st, Date.now(), 0); push(); }, 1_000);
        window.addEventListener('local-gps-update', onGps);
        return () => { clearInterval(tick); window.removeEventListener('local-gps-update', onGps); };
    }, []);
    return view;
}

export function MovingBadge() {
    const { speed, isMock: gpsIsMock } = useGpsSpeed();
    const currentSpeed = speed ?? 0;
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
    const confirmedCalls = liveCalls.filter(o => !isEvaluating(o.status));
    const reserved = confirmedCalls.filter(o => !isAlreadyLoaded(o));
    const loaded = confirmedCalls.filter(o => isAlreadyLoaded(o));
    /**
     * 🧮 **괄호 목록을 뺐다** (목업 이식 2026-09-05).
     *
     * 🔴 `예약 4건 (다마스, 다마스, 다마스, 1t)` — **차종을 콜 수만큼 늘어놓고 있었다.**
     *    콜이 넷이면 한 줄이 넘치고, 달리면서 읽을 것은 «몇 건인가» 하나다.
     *    무엇을 싣는지는 **콜 카드의 📦 칩**이 콜마다 말한다 (규칙 ③ — 한 사실 한 곳).
     * 🟢 대신 **적재량과 확신**을 옆에 둔다 — 그게 «내 트럭 상태»의 답이다.
     */
    const part = (items: typeof liveCalls, prefix: string) =>
        items.length ? `${prefix} ${items.length}` : null;
    const text = [part(loaded, '상차'), part(reserved, '예약')].filter(Boolean).join(' · ') || '예약 0건';
    /**
     * 💰 **진행 중 운임** — 지금 쥔 콜로 얼마를 버나 (기사님 확정 · 옛 화면 머리 줄에서 옮겨 왔다).
     *
     * 🔴 **`confirmedCalls` 로만 더한다** — 심사 중인 콜은 아직 내 것이 아니고,
     *    끝난 콜(취소·방출)은 한 푼도 못 받는다. 전체를 더하면 진행 2건인데 종료분까지
     *    합쳐 과다 표시된다. 완료분은 계산에 섞지 않는다.
     */
    const fareSum = confirmedCalls.reduce((sum, o) => sum + (o.fare || 0), 0);
    return (
        <span className="flex items-baseline gap-1.5 whitespace-nowrap">
            <span className="text-[17px] font-black text-text-primary">{myVehicle}</span>
            <span className={`text-[12.5px] font-bold ${loaded.length ? 'text-success' : reserved.length ? 'text-info' : 'text-text-muted'}`}>{text}</span>
            {/* 📦 **내 트럭이 얼마나 찼나** — 필터 줄의 같은 숫자와 «읽는 질문»이 다르다
                (저기는 «필터가 보는 적재», 여기는 «내 차 상태»). 콜이 없으면 안 그린다 */}
            {liveCalls.length > 0 && filter?.slotsUsed != null && (
                <span className={`shrink-0 text-[12px] font-black tabular-nums ${
                    filter.slotsUsed >= 85 ? 'text-warning' : 'text-text-muted'}`}>
                    📦{Math.round(filter.slotsUsed)}/{TRUCK_CAPACITY_SLOTS}
                </span>
            )}
            {/* 💰 진행 중 운임 — 콜이 없으면 안 그린다 (0원을 지어내지 않는다 · 규칙 ④) */}
            {fareSum > 0 && (
                <span className="shrink-0 text-[12px] font-black tabular-nums text-text-primary">
                    {(fareSum / 10000).toFixed(1)}만
                </span>
            )}
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

    /* 🚗 속도는 `useGpsSpeed` 한 곳 — 좌표가 끊기면 모름(null) → 정차로 보인다 (#132 · 이 자리가 셋째 벌이었다) */
    const { speed: gpsSpeed, isMock: gpsIsMock } = useGpsSpeed();
    const currentSpeed = gpsSpeed ?? 0;


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



    // 시뮬레이션 중에는 "달리고 있다"는 사실만 참이다 — 속도는 모른다
    const isMoving = currentSpeed > 5;
    const totalCount = liveCalls.length;

    /**
     * 🔴 **상차는 추측하지 않는다**.
     *
     * 예전에는 GPS 가 상차지 500m 안을 지나가면 자체 pickedUpSet 에 넣어
     * "상차 1건"으로 표시했다 — 장부는 ORDER_CONFIRMED(상차 보고 없음)인데
     * 요약만 실었다고 말하는 "한 화면 두 세상"이었다.
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
                        {/* 🔴 «달리는가»는 속도가 답한다 — 모의라고 무조건 주행이라 하지 않는다.
                            시뮬 정차 연기(18초)가 여기서 묻히면 무대 자막과 반대말을 하게 된다 */}
                        {gpsIsMock ? '시뮬 ' : ''}{isMoving ? '이동 중' : '정차 중'}
                    </span>
                    {isMoving && (
                        <span className="text-[10px] font-mono text-info/70 ml-1">{Math.round(currentSpeed)} km/h</span>
                    )}
                </Badge>
            </div>
        </div>
    );
}
