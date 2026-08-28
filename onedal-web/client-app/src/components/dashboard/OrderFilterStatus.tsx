import { useEffect, useState } from "react";
import { useFilterConfig } from "../../hooks/useFilterConfig";
import { TRUCK_CAPACITY_SLOTS, CALL_TARGET_LABEL, CANCEL_BUDGET_PER_ROUND } from "@onedal/shared";
import type { CallTarget } from "@onedal/shared";
import { socket } from "../../lib/socket";
import { logRoadmapEvent } from "../../lib/roadmapLogger";

/**
 * 요약줄 — 관제탑에 늘 보이는 한 칸. (docs/지금/필터.md §3)
 *
 *   탭        → 필터 설정 팝업
 *   국면 버튼  → 확인 후 전환 (노선행 → 이 동네 → 복귀행)
 *
 * 버튼 순서가 하루의 흐름과 같다. 기사님:
 * *"목적지행(현 노선행)으로 모두 수행하고 거의 도착할 즈음 '이 동네에서 찾기'로 스와이프하고,
 *   이 동네에서 찾고 나면 복귀행으로 넘기면 모든 경우의 수를 커버할 것 같은데."*
 *
 * 🔴 전환은 **필터만** 바꾼다. 콜은 건드리지 않는다 (옛 투트랙이 콜을 완료 처리했다).
 *
 * ══ 🔴 드래그 전환을 걷어냈다 (2026-08-14) ══
 * 기사님: *"드래그로 바꾸면 안 될 듯싶다. 이렇게 필터가 쉽게 바뀌면 오작동이 될
 * 가능성이 있을 것 같다. 버튼을 누르게 하고 알럿창으로 확인받는 것이 안전할 듯하다."*
 *
 * 맞는 판단이다. 국면 전환은 목적지·반경을 바꾸고 **경유를 통째로 재계산**한다
 * (지리 연산 수 초 + 앱 필터 교체). 운전 중에 스크롤하다 손가락이 스치면 콜 잡기가
 * 엉뚱한 방향으로 간다. 임계값(80px)·탭 판정(6px)을 넣어도 완전하지 않았다.
 *
 * 하루에 두 번 하는 조작이므로 **확인 한 번이 부담이 아니다.** 편의보다 안전.
 * 같은 이유로 출발 감지도 자동 전환이 아니라 "알림만 주고 기사님이 누른다"이다.
 */
const PHASES: CallTarget[] = ['DEST', 'LOCAL', 'HOME'];

const PHASE_STYLE: Record<CallTarget, { icon: string; accent: string; hint: string }> = {
    DEST:  { icon: '🎯', accent: 'text-info',       hint: '목적지로 가는 콜 — 첫짐·합짐' },
    LOCAL: { icon: '🏘️', accent: 'text-accent-alt', hint: '같은 시 안에서 끝나는 콜' },
    HOME:  { icon: '🏠', accent: 'text-accent',     hint: '집 방향 콜 — 합짐 최대한' },
};

export default function OrderFilterStatus({ onOpenFilter, cancelCounts = {}, cancelRounds = {}, budgetToast }:
    {
        onOpenFilter: () => void;
        cancelCounts?: Record<string, number>;
        /** 🚫 몇 판째인가 — 총량이 사라지지 않게 (필터_정의 §2 의 취지) */
        cancelRounds?: Record<string, number>;
        /** 🚫 한 판을 다 쓴 순간 서버가 보낸 알림 — 뜨면 토스트로 한 번 보여 준다 */
        budgetToast?: { app: string; used: number; limit: number; round: number } | null;
    }) {
    const { filter } = useFilterConfig();
    const [toast, setToast] = useState<string | null>(null);

    /** 두 망 중 더 많이 쓴 쪽으로 색을 정한다 — 하나만 위험해도 위험한 것이다 */
    const worstCancel = Math.max(cancelCounts['insung'] ?? 0, cancelCounts['hwamul24'] ?? 0);

    /**
     * 🔴 **스캔 성적표(`👁️ …건 → 통과 …`)는 여기 없다** — 폰 카드로 옮겼다 (기사님 지적 2026-08-23).
     *
     * 이 카드가 말하는 필터는 **서버가 만들어 모든 폰에 똑같이 내려보내는 한 벌**이다.
     * 성적표는 **폰마다 다르다.** 여기에 놓으면 폰이 둘일 때 하나를 골라야 하는데,
     * 고르는 순간 멀쩡한 폰이 멈춘 폰을 가린다 → `DeviceControlPanel` · `lib/filterTally.ts`
     */

    /**
     * 🚫 **한 판을 다 쓰면 알린다** (기사님 확정 2026-08-23).
     *
     * 기사님: *"10회가 되면 토스트 알림주고 리셋해줘."*
     * 숫자만 조용히 0으로 돌아가면 **다 썼다는 사실 자체를 놓친다.**
     * 카운터 리셋은 서버가 하고, 화면은 그 순간을 한 번 말해 준다.
     */
    useEffect(() => {
        if (!budgetToast) return;
        const name = budgetToast.app === 'hwamul24' ? '화물24시' : '인성콜';
        setToast(`🚫 ${name} 취소 ${budgetToast.limit}회를 다 썼습니다 — ${budgetToast.round}판째 시작 (누적 ${(budgetToast.round - 1) * budgetToast.limit}회)`);
        const t = setTimeout(() => setToast(null), 6000);   // 페널티 신호라 평소(2초)보다 길게 둔다
        return () => clearTimeout(t);
    }, [budgetToast]);

    if (!filter) {
        return (
            <div className="flex flex-row items-center justify-center px-4 py-3">
                <span className="text-sm font-black tracking-tight text-text-primary flex items-center gap-2">오더 필터 동기화 중...</span>
            </div>
        );
    }

    const phase: CallTarget = filter.callTarget ?? 'DEST';

    // [V2] DispatchPhase 기반 상태 라벨 — 국면(CallTarget)과 다른 축이다
    let label = '수동 대기';
    if (filter.isActive) {
        const dPhase = filter.dispatchPhase || 'STANDBY';
        const action = filter.driverAction || 'WAITING';
        if (action === 'UNLOADING') label = '하차 대기';
        else if (dPhase === 'GATHERING') label = '합짐 탐색중';
        else if (dPhase === 'DELIVERING') label = '경로상 탐색중';
        else label = '첫짐 탐색중';
    }

    // ── 단가 판정 모델 표시값 ── 서버가 내려준 파생값을 그대로 쓴다
    const callDiscount = filter.callDiscountPct ?? 10;
    const callDiscountLabel = callDiscount >= 100 ? '전부' : (callDiscount === 0 ? '시세' : `-${callDiscount}%`);
    const oneTonRate = filter.ratePerKm?.['1t'] ?? 0;
    const slotsUsed = Math.round(filter.slotsUsed ?? 0);
    const regionCount = filter.destinationKeywords?.length ?? 0;

    /** 지금 국면의 제목 — 필터를 사람 말로 읽어 준다 */
    const headline = (p: CallTarget) => {
        const city = filter.destinationCity || '목적지 미정';
        if (p === 'LOCAL') return <>이 동네(<b className="text-text-primary">{city}</b>) 안에서 끝나는 콜 찾기</>;
        if (p === 'HOME') return <>여기서부터 <b className="text-text-primary">집({city})</b> 방향으로 필터링</>;
        return <>여기서 반경 <b className="text-text-primary">{filter.pickupRadiusKm}km</b> → <b className="text-text-primary">{city} {filter.destinationRadiusKm ?? 0}km</b> 반경</>;
    };

    /**
     * 국면 전환 — **확인을 받고** 바꾼다.
     *
     * 되돌리려면 경유를 다시 계산해야 하고, 그 사이 앱은 바뀐 필터로 콜 잡기한다.
     * 실수로 눌렀을 때 조용히 넘어가면 안 된다.
     */
    const goPhase = (next: CallTarget) => {
        if (next === phase) return;
        const ok = confirm(
            `콜 잡기 방향을 바꿉니다.\n\n` +
            `  ${CALL_TARGET_LABEL[phase]}  →  ${CALL_TARGET_LABEL[next]}\n` +
            `  ${PHASE_STYLE[next].hint}\n\n` +
            `잡아 둔 콜은 그대로 있습니다 (필터만 바뀝니다).\n계속할까요?`
        );
        if (!ok) return;
        logRoadmapEvent("웹", `국면 전환 버튼 (${phase} → ${next})`);
        socket.emit("set-call-target", { phase: next });
        setToast(`${CALL_TARGET_LABEL[next]} 전환됨`);
        setTimeout(() => setToast(null), 2000);
    };

    return (
        <div id="filter-status" className="relative border-b border-border-card bg-bg-base">
            {/* 지금 국면 — 누르면 필터 설정 팝업 */}
            <div
                onClick={onOpenFilter}
                className="flex items-center justify-between gap-2 px-4 pt-3 pb-2 cursor-pointer transition-colors hover:bg-surface-hover/40 active:scale-[0.995]"
            >
                <div className="flex flex-col leading-tight overflow-hidden min-w-0 flex-1">
                    <span className={`text-[12px] font-black truncate ${PHASE_STYLE[phase].accent}`}>
                        {PHASE_STYLE[phase].icon} {headline(phase)}
                        <span className="ml-1.5 text-[9.5px] font-bold text-text-muted align-middle whitespace-nowrap">
                            {label}
                        </span>
                        {/* 🔒 손으로 고친 필터는 자동 갱신이 덮어쓰지 않는다 — 자리는 안 먹는다 */}
                        {filter.userOverrides && (
                            <span title="손으로 고친 필터라 경로가 바뀌어도 자동 갱신되지 않습니다. 첫짐으로 돌아가면 풀립니다"
                                className="ml-1 text-[10px] text-warning align-middle">🔒</span>
                        )}
                    </span>
                    {/* ── 순서를 고정한다 (명세 §4-1) — 💰 금액 · 📍 지역 · 📦 적재 ── */}
                    <span className="text-[11px] text-text-muted font-medium truncate mt-0.5">
                        💰 {callDiscountLabel}
                        <span className="opacity-70"> (1t ≥ {oneTonRate.toLocaleString()}원/km)</span>
                        <span className="mx-1.5 opacity-40">·</span>
                        📍 {regionCount}개 동
                        <span className="mx-1.5 opacity-40">·</span>
                        📦 {slotsUsed}/{TRUCK_CAPACITY_SLOTS}박스
                        {/* 🚫 취소 예산 — 한 판 CANCEL_BUDGET_PER_ROUND 회. 소진 속도가
                            "필터를 조여라"의 신호라 늘 보인다. 한도의 80%부터 빨강.
                            판수(N판째)는 2판 이상일 때만 붙인다 — 첫 판에 군더더기를 안 만든다.
                            🔴 한도를 여기 숫자로 적지 않는다. 서버가 "다 썼다"를 판정하려면
                               같은 값을 봐야 하고, 두 벌이면 갈라진다 (규칙 ⑤-4 ①) */}
                        <span className="mx-1.5 opacity-40">·</span>
                        <span className={
                            worstCancel >= CANCEL_BUDGET_PER_ROUND * 0.8 ? 'text-danger font-bold'
                            : worstCancel >= CANCEL_BUDGET_PER_ROUND * 0.5 ? 'text-warning font-bold'
                            : ''
                        }>🚫 인성 {cancelCounts['insung'] ?? 0}/{CANCEL_BUDGET_PER_ROUND}
                            {(cancelRounds['insung'] ?? 1) > 1 && ` (${cancelRounds['insung']}판)`}
                            <span className="mx-1 opacity-40">·</span>
                            24시 {cancelCounts['hwamul24'] ?? 0}/{CANCEL_BUDGET_PER_ROUND}
                            {(cancelRounds['hwamul24'] ?? 1) > 1 && ` (${cancelRounds['hwamul24']}판)`}</span>
                    </span>
                </div>
                <span className="text-text-muted text-sm shrink-0">⚙️</span>
            </div>

            {/* 국면 버튼 — 지금 것은 눌리지 않고, 다른 것은 확인을 받고 바뀐다.
                하루 흐름 순서(노선행 → 이 동네 → 복귀행)로 나열한다 */}
            <div className="grid grid-cols-3 gap-1 px-3 pb-2.5">
                {PHASES.map(p => {
                    const st = PHASE_STYLE[p];
                    const isCurrent = p === phase;
                    return (
                        <button
                            key={p}
                            onClick={(e) => { e.stopPropagation(); goPhase(p); }}
                            disabled={isCurrent}
                            title={isCurrent ? '지금 이 국면입니다' : `${CALL_TARGET_LABEL[p]} — ${st.hint}`}
                            className={`py-1.5 rounded-lg text-[11px] font-black transition-all border ${isCurrent
                                ? `${st.accent} border-current/40 bg-surface-alt cursor-default`
                                : 'text-text-muted border-border bg-surface-alt/40 hover:bg-surface-hover hover:text-text-primary active:scale-95'}`}
                        >
                            {st.icon} {CALL_TARGET_LABEL[p]}
                            {isCurrent && <span className="ml-1 opacity-60">●</span>}
                        </button>
                    );
                })}
            </div>

            {toast && (
                <span className="absolute right-3 top-2 z-10 text-[10px] font-black px-2 py-0.5 rounded-md bg-accent/15 border border-accent/40 text-accent">
                    {toast}
                </span>
            )}
        </div>
    );
}
