import { useEffect, useState } from "react";
import { useDevices } from "../../hooks/useDevices";
import type { DeviceSession, DeviceModeType } from "@onedal/shared";
import { isDeviceBlind, DEVICE_MODES, DEVICE_MODE_LABEL, deviceScreenBadge, workStageLabel, isModeApplying, isDeviceQuiet } from "@onedal/shared";
import { useSystemAlerts } from "../../hooks/useSystemAlerts";
import type { EmergencyAlert, SafeCancelWarning, FilterPassAlarm } from "../../hooks/useSystemAlerts";
import { useFilterConfig } from "../../hooks/useFilterConfig";
import { summarizeTally } from "../../lib/filterTally";
import { formatClock } from "../../lib/clock";
import type { AutoDispatchFilter } from "@onedal/shared";


import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

/**
 * 🎨 **폰 모드 색 — 원달앱이 폰 화면에 두르는 테두리와 같다**: 알람 녹색 · 자동 파랑 · 직접 주황.
 * 버튼과 고르기 목록이 이 표 하나를 쓴다 — 따로 적으면 한쪽만 바뀐다.
 */
const MODE_TONE: Record<DeviceModeType, string> = {
    ALARM: 'bg-success/20 text-success border-success/40',
    AUTO: 'bg-info/20 text-info border-info/40',
    MANUAL: 'bg-surface-alt text-text-muted border-border/40',
    SIMULATION: 'bg-amber-400/20 text-amber-400 border-amber-400/40',
};

const EMERGENCY_LABELS: Record<string, string> = {
    AUTO_CANCEL: "⏱️ 자동취소 실행됨",
    CANCEL_EXPIRED: "🔴 취소 불가 팝업! 배차실 직접 취소 요망!",
    UNKNOWN_SCREEN: "🟠 알 수 없는 화면에 진입함",
    POPUP_ORDER_MISSING: "⚠️ 팝업 감지 실패",
    BUTTON_NOT_FOUND: "⚠️ 버튼 감지 실패",
};

/**
 * 📱 **폰 한 대의 카드**
 *
 * 📐 **한 줄 41px 기준** (기사님 2026-09-05: *"폰 영역 높이가 115px 인데 41px 정도로"*).
 *    이름(볼드) · 통신 점 · 모드 버튼 · 3개 점만 한 줄에 두고,
 *    작업 단계 · 누적 카운트 · 취소 등은 3개 점을 눌렀을 때만 편다.
 *    (실제 운행 중에는 폰 이름과 통신 상태·모드만 보면 된다)
 */

function DeviceRow({
    device,
    onModeChange,
    deviceAlerts,
    deviceWarnings,
    onDismissAlert,
    onDismissWarning,
    currentFilter,
    filterAlarm,
}: {
    device: DeviceSession;
    onModeChange: (id: string, mode: DeviceModeType) => void;
    deviceAlerts: EmergencyAlert[];
    deviceWarnings: SafeCancelWarning[];
    onDismissAlert: (timestamp: string) => void;
    onDismissWarning: (orderId: string) => void;
    currentFilter: AutoDispatchFilter | null;
    filterAlarm?: FilterPassAlarm | null;
}) {
    const isDisconnected = device.status === "OFFLINE";
    /**
     * 🖥️ **배차망·화면명·화면 꺼짐은 배지 하나다** (기사님과 확정 2026-09-02 · `docs/기획/폰_상태바.md` §2).
     * 고르는 일은 `shared` 가 한다 — 여기서는 그리기만 한다 (운행일지도 같은 것을 물을 수 있다).
     */
    const screenBadge = deviceScreenBadge(device);
    /** 🚦 지금 무슨 일을 하는 중인가 — 낱말은 `shared` 가 짓는다 (구앱이면 `null`) */
    const stageLabel = workStageLabel(device);

    /**
     * 🎛️ **「적용중」 — 누른 것이 폰에 닿았나** (기사님 확정 2026-09-02 · 0단계 ②③).
     *
     * 🔴 예전에는 누르는 순간 바뀐 것처럼 그렸다(«낙관적 업데이트»). 폰이 받았는지
     *    모르면서 단언한 것이라, 오전에 고친 «읽지 않고 단언»과 같은 병이었다.
     * 🔴 **10초가 지나면 버튼만 다시 눌리게 한다** — 「적용중」 표시는 그대로 두되
     *    기사님이 다시 누르실 수 있어야 한다. 글자는 «반영 안 됨»이라 쓰지 않는다:
     *    홈에 있는 폰은 실제로 나중에 반영되므로 그건 거짓말이 된다 (**사실만** 적는다).
     */
    const applying = isModeApplying(device);
    const [applyingSince, setApplyingSince] = useState<number | null>(null);
    /** 🎛️ 모드 고르는 레이어가 열렸나 — **폰마다 하나씩**이라 여기(줄 안)에 산다 */
    const [modeOpen, setModeOpen] = useState(false);
    /**
     * 📂 **접힌 셋** — 작업 단계 · 누적(수집·수락) · 취소 한도 · 버전.
     * 🔴 넷 다 **달리면서 볼 것이 아니다.** 줄에 늘어놓으면 «지금 뭘 하고 있나»가 묻힌다
     *    (기사님 목업: 115칸 → 41칸). 폰 이름을 누르면 그 폰 카드 안에서 열린다.
     */
    const [more, setMore] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        setApplyingSince(prev => (applying ? (prev ?? Date.now()) : null));
    }, [applying]);
    useEffect(() => {
        if (!applying) return;
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, [applying]);
    const applyingSec = applyingSince ? Math.floor((now - applyingSince) / 1000) : 0;
    /** 10초를 넘겼으면 버튼은 푼다 — 기다림이 길어져도 기사님 손을 묶지 않는다 */
    const buttonsLocked = applying && applyingSec < 10;
    const lastHeardSec = device.lastSeen ? Math.max(0, Math.floor((now - device.lastSeen) / 1000)) : null;

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
        // isActive = "필터가 도는가" (유저별), device.mode = "누가 누르나" (폰별)
        if (device.mode === "MANUAL") {
            filterLabel = '직접 모드';
            filterColor = 'bg-surface-alt text-text-muted border-border';
        } else {
            // 자동·알람은 둘 다 필터가 돈다 — 무엇을 찾고 있는지 그대로 보여준다.
            const phase = currentFilter.dispatchPhase || 'STANDBY';
            const action = currentFilter.driverAction || 'WAITING';

            if (action === 'UNLOADING') {
                filterLabel = '하차';
                filterColor = 'bg-surface-alt text-text-muted border-border';
            } else if (phase === 'GATHERING') {
                filterLabel = '합짐';
                filterColor = 'bg-info-alt/20 text-info-alt border-info-alt/30';
            } else if (phase === 'DELIVERING') {
                filterLabel = '경로';
                filterColor = 'bg-accent-alt/20 text-accent-alt border-accent-alt/30';
            } else {
                filterLabel = '첫짐';
                filterColor = 'bg-success/20 text-success border-success/30';
            }

            /**
             * 🔴 **알람은 «찾는다»까지만이고 «잡는다»가 아니다** (기사님 확정 2026-08-30).
             *
             * 같은 배지를 그대로 두면 화면이 *"앱이 이 콜을 잡는다"* 고 말한다 —
             * 실제로는 기사님이 직접 누르실 때까지 아무 일도 안 일어난다.
             * 그 한 글자 차이가 «왜 안 잡았지?» 를 만든다 (규칙 ⑤-4 ④ 화면).
             */
            // (0831) 🔔 접두는 뺐다 — 알람 여부는 모드 배지가 말하고, 국면 배지는 낱말만
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

    /* 🧱 **폰 하나가 한 덩어리로 보이게** — 줄이 아니라 **카드**다 (목업 이식 0905).
       기사님: *"폰이 덩어리감이 없어 한 줄 더보기 하면 어디가 어딘지 모르겠어."*
       접힌 셋이 열릴 때 **어느 폰의 아랫단인지**가 테두리로 답해진다. */
    return (
        <div className="flex flex-col rounded-lg border border-border-card bg-surface-alt/30 overflow-hidden mb-1">
            <div className="flex items-center justify-between hover:bg-surface-hover/30 transition-colors px-2.5 py-1">
                <div className={`flex items-center gap-2 flex-1 min-w-0`}>
                    {/**
                      * 📱 **폰 이름이 곧 손잡이다** (기사님 2026-09-05: *"⋯ 은 필요없을 것 같다.
                      *    공간을 아껴야 해"*). 누르면 **접힌 셋**이 그 폰 카드 안에서 열린다.
                      */}
                    <button type="button" onClick={() => setMore(v => !v)}
                        title="누르면 작업 단계·누적·취소 한도·버전이 열립니다"
                        /* 🔤 목업과 같은 크기 — 폰 이름이 이 줄의 머리다 (재서 맞춤 0905) */
                        className={`font-black text-[14px] px-1.5 rounded truncate shrink-0 ${
                            isDisconnected ? 'bg-danger/20 text-danger animate-pulse' : 'text-success'
                        } ${more ? 'underline underline-offset-2' : ''}`}>
                        {device.deviceName || device.deviceId.slice(0, 8)}
                    </button>
                    {/* 🌐 배차망 + 화면 + 화면 꺼짐을 한 배지로 — «인성 콜리스트» · «💤 화면 꺼짐».
                        화면이 꺼진 폰의 화면명은 «아까 그것»이라 함께 그리지 않는다 (포함 관계 · 규칙 ⑤-4 ④). */}
                    {screenBadge && (
                        <Badge variant="outline" className={`text-[13px] px-1.5 py-0 shrink-0 ${screenBadge.color}`}>
                            {screenBadge.network && (
                                <span className="text-info font-black mr-1">{screenBadge.network}</span>
                            )}
                            {screenBadge.label}
                        </Badge>
                    )}
                    {/* 🔤 필터 배지(첫짐·합짐) — 목업 12.5 (재서 맞춤 0905) */}
                    {!isDisconnected && currentFilter && (
                        <Badge variant="outline" className={`text-[12.5px] font-extrabold px-1.5 py-0 rounded shadow-sm shrink-0 border ${filterColor}`}>
                            {filterLabel}
                        </Badge>
                    )}
                    {/* 🚦 앱이 지금 무슨 일을 하는 중인가 — «어디서 멈췄나»가 이 한 칸에서 보인다.
                        구앱은 안 보내므로 아무것도 안 그린다 (규칙 ④). */}
                    {/* 👁️ 화면은 켜져 있는데 접근성이 막혀 못 읽는다 — 연결됐다고 읽고 있는 건 아니다.
                        기사님 확정: "접근성 스크래핑이 꺼진 건지, 화면이 꺼진 건지 구분이 되면 더 좋고." */}
                    {isBlind && !isDisconnected && device.isScreenOn !== false && (
                        <Badge variant="outline" className="text-[11.5px] font-black px-1.5 py-0 shrink-0 bg-danger/15 text-danger border-danger/30 animate-pulse">
                            👁️ 화면 못 읽음
                        </Badge>
                    )}
                    {/* 🕐 **마지막으로 이 폰이 보고한 시각**을 숫자 앞에 붙인다 (기사님 형식 확정 2026-08-23).
                        기사님: *"`20:39:13(수집:16 수락:3 취소:1)` 이렇게 표시하면 한 줄로 나올 듯."*
                        숫자만 있으면 "지금 그런 것"과 "아까 그러고 멈춘 것"이 똑같이 보인다. */}
                    {/* 🔤 시각·성적표 — 목업 12.5 */}
                    <div className="flex items-center gap-1 text-[12.5px] text-text-muted font-medium ml-1 truncate tabular-nums">
                        {/* 🕐 **분까지만** 적는다 (목업 0905) — 초는 달리면서 쓸모가 없다.
                            ⚠️ 버리지는 않는다 — 손대면 초까지 보인다 (진단에 쓴다) */}
                        {lastSeenAt && (
                            <span className="opacity-70" title={`마지막 보고 ${lastSeenAt}`}>
                                {lastSeenAt.slice(0, 5)}
                            </span>
                        )}
                        {/**
                          * ⏱️ **조용할 때만 붙는다** (기사님 확정 2026-09-05:
                          *    *"조용한가는 조용할 때만 나오면 될 것 같고"*).
                          *
                          * 🔴 **`👀`(잘 돈다)는 안 그린다.** 잘 돌 때 자리를 쓰면 이상할 때가
                          *    눈에 안 띈다 — 폰 한 줄은 56칸뿐이다.
                          * 🔴 **화면이 꺼져 있어도 그린다** — 최대 60초를 기다려야 하는 것이
                          *    바로 그때다 (폰_상태바.md ④).
                          * 🔴 판정은 `isDeviceQuiet` **하나**에서 온다 — 여기서 다시 세지 않는다.
                          */}
                        {isDeviceQuiet(device.prevSeen, device.lastSeen) && (
                            <span title="30초 넘게 말이 없습니다">⏱️</span>
                        )}
                        {/**
                          * 👁️ **성적표는 «막혔을 때만» 줄에 뜬다** (목업 이식 2026-09-05).
                          *
                          * 🔴 누적(수집·수락·취소)은 **달리면서 볼 것이 아니다** — 폰 이름을
                          *    누르면 열리는 접힌 셋으로 내렸다. 줄에 늘 있으면 «지금 뭘 하고
                          *    있나»가 그 숫자에 묻힌다 (기사님 목업: 115칸 → 41칸).
                          * 🟢 **통과가 0 이면 다르다** — 그건 «콜이 안 잡히고 있다»는 신호이고,
                          *    무엇에 걸렸는지(가장 많이 걸린 축 하나)가 곧 풀 열쇠다.
                          *    잘 돌 때는 조용해야 아무도 안 지나친다.
                          * ⚠️ 낱말을 만들지 않고 풀어쓴다 (기사님 확정 2026-08-30 — «훑음 8→2» 폐기).
                          */}
                        {scanSummary && scanSummary.passed === 0 && (
                            <span className="text-warning font-bold truncate">
                                본 {scanSummary.seen} · 통과 0
                                {scanSummary.rejects[0] && ` ${scanSummary.rejects[0][0]}${scanSummary.rejects[0][1]}`}
                            </span>
                        )}
                    </div>
                </div>
                {/**
                  * 🎛️ **모드 셋을 버튼 셋으로 그린다** (기사님 확정 2026-08-30).
                  *
                  * 🔴 **한 버튼으로 돌려 쓰지 않는다.** 값이 둘일 땐 토글이 맞았지만, 셋이 되면
                  *    한 번 잘못 누를 때 되돌아오는 데 두 번을 더 눌러야 한다. 그리고 지금
                  *    무엇인지가 «다음에 무엇이 되는지»와 섞여 읽힌다.
                  *    셋을 나란히 두면 **지금 상태가 곧 화면**이다 (규칙 ⑤-4 ④).
                  *
                  * 색은 판정 색(🔵🟢🟡🔴)과 겨루지 않는다 — 켜진 것만 진하게 (규칙 ⑤-3).
                  */}
                {/**
                  * 🎛️ **모드는 지금 것 하나만 보인다 — 누르면 셋이 펼쳐진다** (목업 이식 0905).
                  *
                  * 🔴 셋을 늘 늘어놓으니 **한 줄의 절반을 모드가 먹었다.** 달리면서 읽을 것은
                  *    «지금 뭘 하고 있나» 하나이고, 바꾸는 일은 **정차했을 때** 한다.
                  * 🔴 **펼침은 왼쪽으로 자란다** — 오른쪽으로 열면 화면 밖으로 나간다
                  *    (기사님이 잡아 주신 것: *"순서를 바꿔서 왼쪽 정렬하면 될 것 같은데"*).
                  *    그래서 **고른 것을 맨 뒤에** 두고 나머지를 앞에 붙인다 — 제자리에서 편다.
                  * ⚠️ 누른 것이 아직 폰에 안 닿았으면 **돌아가는 표시**로 말한다 —
                  *    «반영 안 됨»이라고 적으면 거짓말이 될 수 있다 (왕복이라 앱이 가져가야 참이다).
                  */}
                <div className="shrink-0 ml-2 relative">
                    <button type="button" disabled={buttonsLocked}
                        /* ⏱️ «마지막 통신 N초 전»은 화면에서 뺐다 — 줄이 좁다.
                           진단에 필요한 값이라 **버리지 않고** 손댈 때 보이게 둔다 */
                        title={applying
                            ? `적용중${lastHeardSec != null ? ` · 마지막 통신 ${lastHeardSec}초 전` : ''}`
                            : '모드를 바꾸려면 누릅니다'}
                        onClick={() => setModeOpen(v => !v)}
                        className={`w-[48px] py-0.5 rounded-md text-[13px] font-black border transition-opacity ${
                            applying ? 'opacity-40' : ''
                        } ${MODE_TONE[device.mode]}`}>
                        {DEVICE_MODE_LABEL[device.mode]}
                    </button>
                    {applying && (
                        <span className="absolute inset-0 grid place-items-center pointer-events-none">
                            <span className="w-3.5 h-3.5 rounded-full border-2 border-warning/30 border-t-warning animate-spin" />
                        </span>
                    )}
                    {modeOpen && (
                        <span style={{ right: -5 }}
                            className="absolute top-1/2 -translate-y-1/2 z-30 flex gap-1 p-1 rounded-lg
                                       bg-surface border border-border shadow-lg">
                            {[...DEVICE_MODES.filter(m => m !== device.mode), device.mode].map(m => (
                                <button key={m} type="button"
                                    onClick={() => { setModeOpen(false); onModeChange(device.deviceId, m); }}
                                    className={`w-[48px] py-0.5 rounded-md text-[13px] font-black border whitespace-nowrap ${MODE_TONE[m]}`}>
                                    {DEVICE_MODE_LABEL[m]}
                                </button>
                            ))}
                        </span>
                    )}
                </div>
            </div>
            {/**
              * 📂 **접힌 셋 — 폰 이름을 눌러야 열린다** (목업 이식 2026-09-05).
              *
              * 🔴 넷 다 **달리면서 볼 것이 아니다** — 작업 단계 · 누적 · 취소 한도 · 버전.
              *    줄에 늘어놓으니 «지금 뭘 하고 있나»가 묻혔다 (115칸 → 41칸).
              * 🔴 **빌드 번호 자리에 «취소 N»을 넣는다** — 빌드는 하루에 한 번 볼까 말까고,
              *    취소는 **한도가 있는 값**이라 남은 판을 알아야 한다 (기사님 2026-09-05).
              * 🟢 **그 폰 카드 안**에 편다 — 선 하나로 «같은 폰의 아랫단»임을 말한다.
              */}
            {more && (
                <div className="flex items-center gap-2 px-2.5 py-1 mt-1 border-t border-border-card
                                bg-surface/40 text-[12px] text-text-muted tabular-nums flex-wrap">
                    {stageLabel && (
                        <span className="px-1.5 rounded border border-border bg-surface-alt font-bold">{stageLabel}</span>
                    )}
                    <span>수집{device.stats.polled} 수락{device.stats.grabbed}</span>
                    <span className={`px-1.5 rounded border font-extrabold ${
                        device.stats.canceled > 0
                            ? 'border-warning/40 bg-warning/10 text-warning'
                            : 'border-border bg-surface-alt'}`}>
                        취소 {device.stats.canceled}
                    </span>
                    {device.version && <span className="opacity-70">{device.version}</span>}
                </div>
            )}

            {/* 🔔 알람 — «지금 인성 리스트에서 직접 누르십시오» */}
            {filterAlarm && (
                <div className="mx-1 mt-1 rounded border border-info/40 bg-info/15 px-2 py-1.5 flex items-center gap-2 animate-pulse">
                    <span className="text-base leading-none">🔔</span>
                    <span className="text-info font-black text-[13px] tracking-tight">
                        필터 통과 {filterAlarm.passed}건 — 인성 리스트에서 직접 누르십시오
                    </span>
                    <span className="ml-auto text-[10px] text-info/70 font-bold tabular-nums shrink-0">
                        본 {filterAlarm.seen}
                    </span>
                </div>
            )}

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
    const { alerts, warnings, filterAlarm, dismissAlert, dismissWarning } = useSystemAlerts();
    const { devices, changeDeviceMode } = useDevices();
    const { filter } = useFilterConfig();

    return (
        <div className="border-b border-border-card">
            {/* 📐 **왼쪽 세로선을 맞춘다** (기사님 2026-09-05: *"타이틀 폰 필터 그리드를 맞춰줘"*).
                헤더·필터가 12px 에서 시작하는데 여기만 16px 이라 셋이 갈려 있었다 —
                재서 확인했다 (타이틀 16 · 폰 24 · 필터 12). 목업은 12/19/12 로 맞아 있다. */}
            <div className="px-3 py-2">
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
                                filterAlarm={filterAlarm?.deviceId === device.deviceId ? filterAlarm : null}
                            />
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
