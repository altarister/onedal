import { useDevices } from "../../hooks/useDevices";
import type { DeviceSession, ScreenContextType } from "@onedal/shared";
import { isDeviceBlind } from "@onedal/shared";
import { useSystemAlerts } from "../../hooks/useSystemAlerts";
import type { EmergencyAlert, SafeCancelWarning } from "../../hooks/useSystemAlerts";
import { useFilterConfig } from "../../hooks/useFilterConfig";
import { summarizeTally } from "../../lib/filterTally";
import { formatClock } from "../../lib/clock";
import type { AutoDispatchFilter } from "@onedal/shared";


import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

const EMERGENCY_LABELS: Record<string, string> = {
    AUTO_CANCEL: "⏱️ 자동취소 실행됨",
    CANCEL_EXPIRED: "🔴 취소 불가 팝업! 배차실 직접 취소 요망!",
    UNKNOWN_SCREEN: "🟠 알 수 없는 화면에 진입함",
    BUTTON_NOT_FOUND: "🟡 버튼을 찾을 수 없음",
    APP_CRASH: "💀 앱 비정상 종료 후 재시작",
};

/** ScreenContext → 한국어 라벨 + 색상 매핑 (물리적 화면 상태만 표시, 홀드는 isHolding으로 분리) */
const SCREEN_LABELS: Record<ScreenContextType, { label: string; color: string }> = {
    LIST: { label: "콜 리스트", color: "text-success bg-success/15 border-success/20" },
    // 완료 리스트도 "콜에서 손을 뗀" 화면이다 — 앱이 여기로 빠져나가면 서버가 콜을 놓는다.
    // 예전에는 이 값이 shared 타입에 없어서, 앱만 보내고 아무도 못 읽었다 (유령 카드 사고)
    LIST_COMPLETED: { label: "완료 리스트", color: "text-success bg-success/15 border-success/20" },
    DETAIL_PRE_CONFIRM: { label: "상세페이지", color: "text-info bg-info/15 border-info/20" },
    DETAIL_CONFIRMED: { label: "확정페이지", color: "text-warning bg-warning/15 border-warning/20" },
    POPUP_PICKUP: { label: "출발지 팝업", color: "text-info bg-info/15 border-info/20" },
    POPUP_DROPOFF: { label: "도착지 팝업", color: "text-info bg-info/15 border-info/20" },
    POPUP_MEMO: { label: "적요 팝업", color: "text-accent-alt bg-accent-alt/15 border-accent-alt/20" },
    POPUP_ERROR: { label: "취소 불가 팝업", color: "text-danger bg-danger/20 animate-pulse border-danger/30" },
    UNKNOWN: { label: "알 수 없는 화면", color: "text-danger bg-danger/20 animate-pulse border-danger/30" },
};

function DeviceRow({
    device,
    onModeChange,
    deviceAlerts,
    deviceWarnings,
    onDismissAlert,
    onDismissWarning,
    currentFilter
}: {
    device: DeviceSession;
    onModeChange: (id: string, mode: "AUTO" | "MANUAL") => void;
    deviceAlerts: EmergencyAlert[];
    deviceWarnings: SafeCancelWarning[];
    onDismissAlert: (timestamp: string) => void;
    onDismissWarning: (orderId: string) => void;
    currentFilter: AutoDispatchFilter | null;
}) {
    const isDisconnected = device.status === "OFFLINE";
    const screenInfo = device.screenContext ? SCREEN_LABELS[device.screenContext] : null;

    /**
     * 👁️ **앱은 켜져 있는데 화면을 못 읽는 중** (기사님 확정 2026-08-22 · 크리티컬).
     *
     * 기사님: *"분명 폰 이름 1234에 파란불이 들어와 있었어."*
     *
     * 접근성이 막혀 콜을 하나도 못 읽는 동안 이 자리는 **파란불**이었다 — 텔레메트리가
     * 계속 왔기 때문이다. **「연결됐다」와 「읽고 있다」는 다른 말인데 화면은 앞의 것만
     * 보여줬다.** 실운행이면 콜을 통째로 놓치는데 기사님이 알 방법이 없다.
     *
     * 그래서 이 배지는 **연결 상태보다 먼저** 읽혀야 한다.
     */
    const isBlind = isDeviceBlind(device);

    let filterLabel = '동기화 중';
    let filterColor = 'bg-surface-alt text-text-muted border-border';
    if (currentFilter) {
        // 🚨 전역 isActive가 아닌, 이 기기 자체의 mode를 1순위로 검사합니다!
        // isActive = "작전 활성화" (유저별), device.mode = "사격 허가" (폰별)
        if (device.mode === "MANUAL") {
            filterLabel = '수동 대기';
            filterColor = 'bg-surface-alt text-text-muted border-border';
        } else {
            // 기기가 AUTO 모드일 때만 전역 콜 잡기 페이즈를 따라갑니다.
            const phase = currentFilter.dispatchPhase || 'STANDBY';
            const action = currentFilter.driverAction || 'WAITING';

            if (action === 'UNLOADING') {
                filterLabel = '하차 대기';
                filterColor = 'bg-surface-alt text-text-muted border-border';
            } else if (phase === 'GATHERING') {
                filterLabel = '합짐 탐색';
                filterColor = 'bg-info-alt/20 text-info-alt border-info-alt/30';
            } else if (phase === 'DELIVERING') {
                filterLabel = '경로 탐색';
                filterColor = 'bg-accent-alt/20 text-accent-alt border-accent-alt/30';
            } else {
                filterLabel = '첫짐 탐색';
                filterColor = 'bg-success/20 text-success border-success/30';
            }
        }
    }

    // 알아서 잘 취소된 루틴 알림은 무시하고 오직 배차실 개입 등 치명적 알림만 선별
    const criticalAlerts = deviceAlerts.filter(a => a.reason !== 'AUTO_CANCEL' && a.reason !== 'BUTTON_NOT_FOUND');

    /** 🕐 **마지막 보고 시각** — 하트비트를 포함한 *"이 폰이 살아 있다"* */
    const lastSeenAt = formatClock(device.lastSeen);

    /**
     * 👁️ **지금 훑고 있는 것만 그린다** (기사님 확정 2026-08-23).
     *
     * 기사님이 `알 수 없는 화면` 인데 `👁️ 06:28:15 1건 → 통과 0` 이 떠 있는 걸 보시고
     * *"아래 줄은 없어져야 해"* 라고 하셨다. 스캔을 안 하는 폰이 *"방금 훑었다"* 고
     * 말하고 있었던 것이다 (앱이 같은 성적표를 하트비트마다 다시 실어 보냈다).
     *
     * 🔴 **마지막 보고에 함께 온 것만** 참이다. 서버가 두 시각을 같은 값으로 찍으므로
     *    등호 하나로 물을 수 있다. 낡으면 **안 그린다** — 시각 두 개를 나란히 적어
     *    기사님더러 비교하시게 하지 않는다.
     * ⚠️ 서버는 마지막 값을 지우지 않고 들고 있다. 여기서 안 그리는 것은 **표시 규칙**이지
     *    데이터를 버리는 것이 아니다.
     */
    const isScanFresh = device.filterTallyAt != null && device.filterTallyAt === device.lastSeen;
    const scanSummary = isScanFresh ? summarizeTally(device.filterTally, device.filterTallyAt) : null;

    return (
        <div className="flex flex-col border-b border-border last:border-0 py-1 px-1">
            <div className="flex items-center justify-between hover:bg-surface-alt/30 transition-colors rounded px-1">
                <div className={`flex items-center gap-2 flex-1 min-w-0`}>
                    <span className={`font-black text-[10px] px-1.5 rounded truncate shrink-0 ${isDisconnected ? 'bg-danger/20 text-danger animate-pulse' : 'text-success'}`}>
                        {device.deviceName || device.deviceId.slice(0, 8)}
                    </span>
                    {screenInfo && (
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 ${screenInfo.color}`}>
                            {screenInfo.label}
                        </Badge>
                    )}
                    {!isDisconnected && currentFilter && (
                        <Badge variant="outline" className={`text-[10px] font-extrabold px-1.5 py-0 rounded shadow-sm shrink-0 border ${filterColor}`}>
                            {filterLabel}
                        </Badge>
                    )}
                    {/* 💤 폰 화면이 꺼져 있다 — 앱은 살아 있지만 배차망을 못 본다 (콜을 못 잡는다).
                        기사님 확정: "화면꺼짐이 그대로 보이는 것이 맞을 것 같아." */}
                    {device.isScreenOn === false && !isDisconnected && (
                        <Badge variant="outline" className="text-[10px] font-black px-1.5 py-0 shrink-0 bg-warning/15 text-warning border-warning/30">
                            💤 화면 꺼짐
                        </Badge>
                    )}
                    {/* 👁️ 화면은 켜져 있는데 접근성이 막혀 못 읽는다 — 연결됐다고 읽고 있는 건 아니다.
                        기사님 확정: "접근성 스크래핑이 꺼진 건지, 화면이 꺼진 건지 구분이 되면 더 좋고." */}
                    {isBlind && !isDisconnected && device.isScreenOn !== false && (
                        <Badge variant="outline" className="text-[10px] font-black px-1.5 py-0 shrink-0 bg-danger/15 text-danger border-danger/30 animate-pulse">
                            👁️ 화면 못 읽음
                        </Badge>
                    )}
                    {/* 🕐 **마지막으로 이 폰이 보고한 시각**을 숫자 앞에 붙인다 (기사님 형식 확정 2026-08-23).
                        기사님: *"`20:39:13(수집:16 수락:3 취소:1)` 이렇게 표시하면 한 줄로 나올 듯."*
                        숫자만 있으면 "지금 그런 것"과 "아까 그러고 멈춘 것"이 똑같이 보인다. */}
                    <div className="flex items-center gap-1 text-[10px] text-text-muted font-medium ml-1 truncate tabular-nums">
                        {lastSeenAt && <span className="opacity-70">{lastSeenAt}</span>}
                        <span>
                            (수집:{device.stats.polled} 수락:{device.stats.grabbed} 취소:{device.stats.canceled}
                            {/* 👁️ 지금 훑고 있을 때만 뒤에 붙는다 — 낡으면 이 조각째로 사라진다.
                                통과 0 이면 굵은 주황. 잘 돌 때는 조용해야 아무도 안 지나친다. */}
                            {scanSummary && (
                                <span className={scanSummary.passed === 0 ? 'text-warning font-bold' : ''}>
                                    <span className="mx-1 opacity-40">·</span>
                                    훑음 {scanSummary.seen}→{scanSummary.passed}
                                    {/* 가장 많이 걸린 축 하나만 — 무엇을 풀어야 하는지가 그 한 칸에 있다 */}
                                    {scanSummary.rejects[0] && ` ${scanSummary.rejects[0][0]}${scanSummary.rejects[0][1]}`}
                                </span>
                            )})
                        </span>
                    </div>
                </div>
                <div className="shrink-0 ml-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onModeChange(device.deviceId, device.mode === "AUTO" ? "MANUAL" : "AUTO")}
                        className={`h-6 px-2 text-[10px] font-black transition-colors ${device.mode === "AUTO"
                            ? "bg-success/10 text-success border-success/30 hover:bg-success/20"
                            : "bg-warning/10 text-warning border-warning/30 hover:bg-warning/20"
                            }`}
                    >
                        {device.mode}
                        {device.isHolding && <span className="ml-1">처리중</span>}
                    </Button>
                </div>
            </div>

            {/* 🚨 개별 폰 비상/경고 알림 렌더링 (사람 개입 필요한 경우만 노출) */}
            {(criticalAlerts.length > 0 || deviceWarnings.length > 0) && (
                <div className="px-2 pt-2 pb-1 flex flex-col gap-1.5">
                    {criticalAlerts.map(alert => (
                        <div key={alert.timestamp} className="bg-danger/10 border border-danger/30 rounded flex items-center justify-between px-2 py-1.5 animate-pulse">
                            <div className="flex flex-col gap-0.5 overflow-hidden pr-2">
                                <span className="text-danger font-extrabold text-[11px] tracking-tight truncate">
                                    🚨 {EMERGENCY_LABELS[alert.reason] || alert.reason}
                                </span>
                                {alert.screenText && (
                                    <span className="text-danger/70 truncate text-[10px] font-medium min-w-0 tracking-tight">
                                        화면텍스트: {alert.screenText}
                                    </span>
                                )}
                            </div>
                            <Button size="sm" variant="destructive" onClick={() => onDismissAlert(alert.timestamp)} className="h-6 text-xs px-2 shadow-sm">
                                확인
                            </Button>
                        </div>
                    ))}
                    {deviceWarnings.map(w => (
                        <div key={w.orderId} className="bg-warning/10 border border-warning/30 rounded flex items-center justify-between px-2 py-1.5">
                            <span className="text-warning font-extrabold text-[11px] tracking-tight truncate flex-1 pr-2">
                                ⚠️ {w.message}
                            </span>
                            <Button size="sm" variant="outline" onClick={() => onDismissWarning(w.orderId)} className="h-6 text-xs px-2 border-warning/30 text-warning hover:bg-warning/20 shadow-sm">
                                확인
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function DeviceControlPanel() {
    const { alerts, warnings, dismissAlert, dismissWarning } = useSystemAlerts();
    const { devices, changeDeviceMode } = useDevices();
    const { filter } = useFilterConfig();

    return (
        <div className="border-b border-border-card">
            <div className="px-4 py-2">
                <div className="flex flex-col">
                    {devices.length === 0 ? (
                        <div className="text-center text-xs text-text-muted py-4 opacity-80 font-bold tracking-tight">
                            <span className="font-semibold mb-1 block opacity-60">연결된 안드로이드 폰이 없습니다.</span>
                            우측 상단의 계정 버튼을 클릭하고 폰을 먼저 등록해 주세요.
                        </div>
                    ) : (
                        devices.map(device => (
                            <DeviceRow
                                key={device.deviceId}
                                device={device}
                                onModeChange={changeDeviceMode}
                                deviceAlerts={alerts.filter(a => a.deviceId === device.deviceId)}
                                deviceWarnings={warnings.filter(w => w.deviceId === device.deviceId)}
                                onDismissAlert={dismissAlert}
                                onDismissWarning={dismissWarning}
                                currentFilter={filter}
                            />
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
