import { useRef, useState } from "react";
import { useFilterConfig } from "../../hooks/useFilterConfig";
import { TRUCK_CAPACITY_SLOTS, HUNT_PHASE_LABEL } from "@onedal/shared";
import type { HuntPhase } from "@onedal/shared";
import { socket } from "../../lib/socket";
import { logRoadmapEvent } from "../../lib/roadmapLogger";

/**
 * 요약줄 — 관제탑에 늘 보이는 한 칸. (docs/필터_재설계_명세.md §4-1)
 *
 *   탭      → 필터 설정 팝업
 *   스와이프 → 국면 전환 (목적지행 → 이 동네 → 복귀행)
 *
 * 스와이프 순서가 하루의 흐름과 같다. 기사님:
 * *"목적지행으로 모두 수행하고 거의 도착할 즈음 '이 동네에서 찾기'로 스와이프하고,
 *   이 동네에서 찾고 나면 복귀행으로 스와이프하면 모든 경우의 수를 커버할 것 같은데."*
 *
 * 🔴 전환은 **필터만** 바꾼다. 콜은 건드리지 않는다 (옛 투트랙이 콜을 완료 처리했다).
 *
 * ══ 진짜 페이저여야 편안하다 ══
 * 기사님: *"그래도 아까와 같은 편안한 액션은 아니다."*
 *
 * 처음엔 한 칸이 제자리에서 밀리고 이웃이 페이드인하는 **가짜**로 만들었다.
 * 목업은 카드 3장이 나란히 있고 **트랙 전체가 미끄러진다**(`translateX(-page*100% + dx)`).
 * 손가락이 트랙을 직접 잡고 있는 느낌이 나려면 그 구조여야 한다.
 */
const PHASES: HuntPhase[] = ['DEST', 'LOCAL', 'HOME'];

const PHASE_STYLE: Record<HuntPhase, { icon: string; accent: string; hint: string }> = {
    DEST:  { icon: '🎯', accent: 'text-info',       hint: '목적지로 가는 콜 — 첫짐·합짐' },
    LOCAL: { icon: '🏘️', accent: 'text-accent-alt', hint: '같은 시 안에서 끝나는 콜' },
    HOME:  { icon: '🏠', accent: 'text-accent',     hint: '집 방향 콜 — 합짐 최대한' },
};

/** 스와이프로 인정하는 최소 이동 폭 — 이 아래는 탭(설정 열기)으로 본다 */
const TAP_THRESHOLD_PX = 6;
/**
 * 국면이 넘어가려면 이만큼은 밀어야 한다.
 * 폭 비율만 쓰면 넓은 화면(데스크톱 800px)에서 240px 를 끌어야 해 못 쓴다 — 둘 중 작은 쪽.
 */
const snapThreshold = (w: number) => Math.min(w * 0.3, 80);

export default function OrderFilterStatus({ onOpenFilter }: { onOpenFilter: () => void }) {
    const { filter } = useFilterConfig();
    const wrapRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{ startX: number; dx: number } | null>(null);
    const [dragDx, setDragDx] = useState(0);
    const [dragging, setDragging] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    if (!filter) {
        return (
            <div className="flex flex-row items-center justify-center px-4 py-3">
                <span className="text-sm font-black tracking-tight text-text-primary flex items-center gap-2">오더 필터 동기화 중...</span>
            </div>
        );
    }

    const phase: HuntPhase = filter.huntPhase ?? 'DEST';
    const phaseIdx = PHASES.indexOf(phase);

    // [V2] DispatchPhase 기반 상태 라벨 — 국면(HuntPhase)과 다른 축이다
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
    const eyeline = filter.eyelinePct ?? 10;
    const eyelineLabel = eyeline >= 100 ? '전부' : (eyeline === 0 ? '시세' : `-${eyeline}%`);
    const oneTonRate = filter.ratePerKm?.['1t'] ?? 0;
    const slotsUsed = Math.round(filter.slotsUsed ?? 0);
    const regionCount = filter.destinationKeywords?.length ?? 0;

    /** 지금 국면의 제목 — 필터를 사람 말로 읽어 준다 */
    const headline = (p: HuntPhase) => {
        const city = filter.destinationCity || '목적지 미정';
        if (p === 'LOCAL') return <>이 동네(<b className="text-text-primary">{city}</b>) 안에서 끝나는 콜 찾기</>;
        if (p === 'HOME') return <>여기서부터 <b className="text-text-primary">집({city})</b> 방향으로 필터링</>;
        return <>여기서 반경 <b className="text-text-primary">{filter.pickupRadiusKm}km</b> → <b className="text-text-primary">{city} {filter.destinationRadiusKm ?? 0}km</b> 반경</>;
    };

    const goPhase = (next: HuntPhase) => {
        if (next === phase) return;
        logRoadmapEvent("웹", `요약줄 스와이프 → 국면 전환 (${phase} → ${next})`);
        socket.emit("set-hunt-phase", { phase: next });
        setToast(`${HUNT_PHASE_LABEL[next]} 전환됨`);
        setTimeout(() => setToast(null), 1600);
    };

    // ── 드래그: 트랙을 직접 잡는다 ──
    const onDown = (e: React.PointerEvent) => {
        dragRef.current = { startX: e.clientX, dx: 0 };
        setDragging(true);
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: React.PointerEvent) => {
        if (!dragRef.current) return;
        let dx = e.clientX - dragRef.current.startX;
        // 양 끝에서는 고무줄처럼 저항한다 — 넘어갈 곳이 없다는 걸 손으로 알려준다
        const atEdge = (dx > 0 && phaseIdx === 0) || (dx < 0 && phaseIdx === PHASES.length - 1);
        if (atEdge) dx *= 0.25;
        dragRef.current.dx = dx;
        setDragDx(dx);
    };
    const onUp = () => {
        const d = dragRef.current;
        dragRef.current = null;
        setDragging(false);     // 트랜지션을 켜서 스냅되게 한다
        setDragDx(0);
        if (!d) return;

        const w = wrapRef.current?.offsetWidth ?? 1;
        if (Math.abs(d.dx) < TAP_THRESHOLD_PX) {
            onOpenFilter();                       // 탭 — 설정 열기
        } else if (Math.abs(d.dx) > snapThreshold(w)) {
            const i = phaseIdx + (d.dx < 0 ? 1 : -1);
            if (i >= 0 && i < PHASES.length) goPhase(PHASES[i]);
        }
        // 그 사이(살짝 민 것)는 제자리로 돌아간다
    };

    /** 카드 한 장 — 지금 국면이면 상세, 아니면 그 국면이 무엇인지 */
    const card = (p: HuntPhase) => {
        const st = PHASE_STYLE[p];
        const isCurrent = p === phase;
        return (
            <div key={p} className="min-w-full px-4 py-3 flex items-center justify-between gap-2">
                <div className="flex flex-col leading-tight overflow-hidden min-w-0 flex-1">
                    <span className={`text-[12px] font-black truncate ${st.accent} ${isCurrent ? '' : 'opacity-70'}`}>
                        {st.icon} {isCurrent ? headline(p) : HUNT_PHASE_LABEL[p]}
                        {isCurrent && (
                            <>
                                <span className="ml-1.5 text-[9.5px] font-bold text-text-muted align-middle whitespace-nowrap">
                                    {label}
                                </span>
                                {/* 🔒 손으로 고친 필터는 자동 갱신이 덮어쓰지 않는다 — 자리는 안 먹는다 */}
                                {filter.userOverrides && (
                                    <span title="손으로 고친 필터라 경로가 바뀌어도 자동 갱신되지 않습니다. 첫짐으로 돌아가면 풀립니다"
                                        className="ml-1 text-[10px] text-warning align-middle">🔒</span>
                                )}
                            </>
                        )}
                    </span>
                    {isCurrent ? (
                        /* ── 순서를 고정한다 (명세 §4-1) — 💰 금액 · 📍 지역 · 📦 적재 ── */
                        <span className="text-[11px] text-text-muted font-medium truncate mt-0.5">
                            💰 {eyelineLabel}
                            <span className="opacity-70"> (1t ≥ {oneTonRate.toLocaleString()}원/km)</span>
                            <span className="mx-1.5 opacity-40">·</span>
                            📍 {regionCount}개 동
                            <span className="mx-1.5 opacity-40">·</span>
                            📦 {slotsUsed}/{TRUCK_CAPACITY_SLOTS}칸
                        </span>
                    ) : (
                        <span className="text-[11px] text-text-muted/70 font-medium truncate mt-0.5">
                            {st.hint} <span className="opacity-60">— 놓으면 여기로 전환</span>
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {/* 점 3개 — 옆에 다른 국면이 있다는 힌트이자, 눌러서 바로 전환 */}
                    <div className="flex gap-1">
                        {PHASES.map((q, i) => (
                            <button key={q} title={`${HUNT_PHASE_LABEL[q]} 로 전환`}
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => { e.stopPropagation(); goPhase(q); }}
                                className={`w-2 h-2 rounded-full transition-colors ${i === phaseIdx ? 'bg-info' : 'bg-border-card hover:bg-text-muted'}`} />
                        ))}
                    </div>
                    <span className="text-text-muted text-sm">⚙️</span>
                </div>
            </div>
        );
    };

    return (
        <div
            ref={wrapRef}
            id="filter-status"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            className="relative overflow-hidden select-none cursor-grab active:cursor-grabbing border-b border-border-card bg-bg-base"
            style={{ touchAction: 'pan-y' }}
        >
            {/* 트랙 — 카드 3장이 나란히. 손가락이 이걸 직접 잡고 있다 */}
            <div
                className="flex"
                style={{
                    transform: `translateX(calc(${-phaseIdx * 100}% + ${dragDx}px))`,
                    transition: dragging ? 'none' : 'transform 220ms cubic-bezier(.2,.8,.2,1)',
                }}
            >
                {PHASES.map(card)}
            </div>

            {toast && (
                <span className="absolute right-3 bottom-1 z-10 text-[10px] font-black px-2 py-0.5 rounded-md bg-accent/15 border border-accent/40 text-accent">
                    {toast}
                </span>
            )}
        </div>
    );
}
