import { useEffect, useState } from "react";
import { useFilterConfig } from "../../hooks/useFilterConfig";
import { TRUCK_CAPACITY_SLOTS, CALL_TARGET_LABEL } from "@onedal/shared";
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

/** v13 짧은 국면명 — 머리글·버튼 공용 (긴 설명은 hint·확인창에 산다) */
const SHORT_NAME: Record<CallTarget, string> = { DEST: '노선행', LOCAL: '관내', HOME: '복귀행' };

const PHASE_STYLE: Record<CallTarget, { icon: string; accent: string; hint: string }> = {
    DEST:  { icon: '🎯', accent: 'text-info',       hint: '목적지로 가는 콜 — 첫짐·합짐' },
    LOCAL: { icon: '🏘️', accent: 'text-accent-alt', hint: '같은 시 안에서 끝나는 콜' },
    HOME:  { icon: '🏠', accent: 'text-accent',     hint: '집 방향 콜 — 합짐 최대한' },
};

// 취소 카운트 props 는 받되 안 그린다 (v13 확정안 — 경고가 필요해지면 ⚙️ 팝업으로)
export default function OrderFilterStatus({ onOpenFilter, budgetToast }:
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
    let label = '직접 모드';   // 자동 탐색이 꺼져 있고 기사님이 직접 잡는다 (구 «수동 대기» · 2026-08-30 개명)
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

    /** 지금 국면의 제목 — v14 문장 (관내는 방향이 없어 화살표 없음, 복귀는 도착지가 늘 집) */
    const headline = (p: CallTarget) => {
        const city = filter.destinationCity || '목적지 미정';
        if (p === 'LOCAL') return <><b className="text-text-primary">{city}</b> 안에서 끝나는 콜</>;
        if (p === 'HOME') return <>여기서 → <b className="text-text-primary">집({city}) {filter.destinationRadiusKm ?? 0}km</b></>;
        return <>여기서 <b className="text-text-primary">{filter.pickupRadiusKm}km</b> → <b className="text-text-primary">{city} {filter.destinationRadiusKm ?? 0}km</b></>;
    };

    /** v14 국면 색·라벨 — 노선(파랑) · 관내(민트) · 복귀(주황). 지역 라벨도 국면 따라 */
    const V14: Record<CallTarget, { c: string; chipBg: string; chipBd: string; on: string; onBd: string; onGlow: string; region: string }> = {
        DEST:  { c: '#4f8df9', chipBg: 'rgba(79,141,249,.14)', chipBd: 'rgba(79,141,249,.35)', on: '#cfe0ff', onBd: 'rgba(79,141,249,.55)', onGlow: 'rgba(79,141,249,.18)', region: '도착목표' },
        LOCAL: { c: '#35c3a9', chipBg: 'rgba(53,195,169,.13)', chipBd: 'rgba(53,195,169,.4)',  on: '#c8f3ea', onBd: 'rgba(53,195,169,.6)',  onGlow: 'rgba(53,195,169,.2)',  region: '관내' },
        HOME:  { c: '#e8a15c', chipBg: 'rgba(232,161,92,.13)', chipBd: 'rgba(232,161,92,.4)',  on: '#fbe3c8', onBd: 'rgba(232,161,92,.6)',  onGlow: 'rgba(232,161,92,.2)',  region: '귀갓길' },
    };
    const v14 = V14[phase];

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
        <div id="filter-status" className="relative mx-3 my-2 rounded-xl border overflow-hidden shadow-lg flex flex-col" style={{ background: "linear-gradient(180deg,#131a2b,#0f1522)", height: 158, borderColor: phase === 'DEST' ? 'var(--color-border-card, #1c2436)' : `${v14.c}4d` }}>
            {/* 지금 국면 — 누르면 필터 설정 팝업.
                v13 구조: 줄마다 독립 — [머리글 42px] / [지표 38px], 각 줄 헤어라인 (한 덩어리 금지 · 0831) */}
            <div onClick={onOpenFilter} className="cursor-pointer transition-colors hover:bg-surface-hover/40 active:scale-[0.995] flex flex-col" style={{ flex: 2 }}>
                <div className="flex items-center" style={{ gap: 10, padding: '0 18px', flex: 1, fontSize: 14.5, borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                    <span style={{ borderRadius: 7, padding: '3px 10px', fontSize: 12, fontWeight: 800, background: v14.chipBg, border: `1px solid ${v14.chipBd}` }}>{PHASE_STYLE[phase].icon}</span>
                    <span className="font-black whitespace-nowrap" style={{ color: v14.c }}>{SHORT_NAME[phase]}</span>
                    <span className="text-text-primary font-bold truncate" style={{ fontSize: 13.5 }}>{headline(phase)}</span>
                    {/* 🔒 손으로 고친 필터는 자동 갱신이 덮어쓰지 않는다 — 자리는 안 먹는다 */}
                    {filter.userOverrides && (
                        <span title="손으로 고친 필터라 경로가 바뀌어도 자동 갱신되지 않습니다. 첫짐으로 돌아가면 풀립니다"
                            className="text-[11px] text-warning">🔒</span>
                    )}
                    <span className="ml-auto font-black shrink-0" style={{ fontSize: 14, color: v14.c }}>{label}</span>
                    <span className="text-text-muted text-sm shrink-0">⚙️</span>
                </div>
                {/* ── 순서를 고정한다 (명세 §4-1) — 💰 금액 · 📍 지역 · 📦 적재 ── */}
                <div className="flex items-center text-text-muted font-medium tabular-nums truncate" style={{ gap: 8, padding: '0 18px', flex: 1, fontSize: 13, borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                    💰 {callDiscountLabel}
                    <span className="opacity-70">(1t ≥ {oneTonRate.toLocaleString()}원/km)</span>
                    <span className="mx-1 opacity-40">·</span>
                    📍 {v14.region} {regionCount}개 동
                    <span className="mx-1 opacity-40">·</span>
                    📦 {slotsUsed}/{TRUCK_CAPACITY_SLOTS}박스
                </div>
            </div>

            {/* 국면 버튼 — 지금 것은 눌리지 않고, 다른 것은 확인을 받고 바뀐다.
                하루 흐름 순서(노선행 → 이 동네 → 복귀행)로 나열한다 */}
            <div className="grid grid-cols-3" style={{ gap: 8, padding: "8px 14px 12px", flex: 1 }}>
                {PHASES.map(p => {
                    const st = PHASE_STYLE[p];
                    const isCurrent = p === phase;
                    return (
                        <button
                            key={p}
                            onClick={(e) => { e.stopPropagation(); goPhase(p); }}
                            disabled={isCurrent}
                            title={isCurrent ? '지금 이 국면입니다' : `${CALL_TARGET_LABEL[p]} — ${st.hint}`}
                            style={isCurrent
                                ? { borderRadius: 10, fontSize: 13.5, color: V14[p].on, borderColor: V14[p].onBd, background: V14[p].chipBg, boxShadow: `0 0 14px ${V14[p].onGlow}`, cursor: 'default' }
                                : { borderRadius: 10, fontSize: 13.5 }}
                            className={`font-black transition-all border ${isCurrent
                                ? ''
                                : 'text-text-muted border-border bg-surface-alt/40 hover:bg-surface-hover hover:text-text-primary active:scale-95'}`}
                        >
                            {st.icon} {SHORT_NAME[p]}
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
