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
 */
const PHASES: HuntPhase[] = ['DEST', 'LOCAL', 'HOME'];

const PHASE_STYLE: Record<HuntPhase, { icon: string; accent: string }> = {
    DEST: { icon: '🎯', accent: 'text-info' },
    LOCAL: { icon: '🏘️', accent: 'text-accent-alt' },
    HOME: { icon: '🏠', accent: 'text-accent' },
};

/** 스와이프로 인정하는 최소 이동 폭 — 이 아래는 탭(설정 열기)으로 본다 */
const TAP_THRESHOLD_PX = 6;
/**
 * 국면이 넘어가려면 이만큼은 밀어야 한다 (스치기만 해선 안 바뀐다).
 *
 * 폭 비율만 쓰면 **넓은 화면에서 너무 멀다** — 관제웹을 데스크톱으로 열면 요약줄이
 * 800px 이라 280px 를 끌어야 했다. 둘 중 **작은 쪽**을 쓴다.
 */
const snapThreshold = (w: number) => Math.min(w * 0.35, 90);

export default function OrderFilterStatus({ onOpenFilter }: { onOpenFilter: () => void }) {
    const { filter } = useFilterConfig();
    const wrapRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{ startX: number; dx: number } | null>(null);
    const [dragDx, setDragDx] = useState(0);
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
    const style = PHASE_STYLE[phase];

    // [V2] DispatchPhase 기반 상태 라벨링 — 국면(HuntPhase)과 다른 축이다
    let label = '수동 대기';
    if (filter.isActive) {
        const dPhase = filter.dispatchPhase || 'STANDBY';
        const action = filter.driverAction || 'WAITING';

        if (action === 'UNLOADING') label = '하차 대기 (도착)';
        else if (dPhase === 'GATHERING') label = '합짐 탐색중';
        else if (dPhase === 'DELIVERING') label = '경로상 탐색중';
        else label = '첫짐 탐색중'; // STANDBY
    }

    // ── 단가 판정 모델 표시값 ── 서버가 내려준 파생값을 그대로 쓴다
    const eyeline = filter.eyelinePct ?? 10;
    const eyelineLabel = eyeline >= 100 ? '전부' : (eyeline === 0 ? '시세' : `-${eyeline}%`);
    const oneTonRate = filter.ratePerKm?.['1t'] ?? 0;
    const slotsUsed = filter.slotsUsed ?? 0;

    const regionCount = filter.destinationKeywords?.length ?? 0;

    /** 제목줄 — 필터를 사람 말로 읽어 준다 */
    const headline = () => {
        const city = filter.destinationCity || '목적지 미정';
        if (phase === 'LOCAL') return <>이 동네(<b className="text-text-primary">{city}</b>) 안에서 끝나는 콜 찾기</>;
        if (phase === 'HOME') return <>여기서부터 <b className="text-text-primary">집({city})</b> 방향으로 필터링</>;
        return <>여기서 반경 <b className="text-text-primary">{filter.pickupRadiusKm}km</b> → <b className="text-text-primary">{city} {filter.destinationRadiusKm ?? 0}km</b> 반경으로 필터링</>;
    };

    const goPhase = (next: HuntPhase) => {
        if (next === phase) return;
        logRoadmapEvent("웹", `요약줄 스와이프 → 국면 전환 (${phase} → ${next})`);
        socket.emit("set-hunt-phase", { phase: next });
        setToast(`${HUNT_PHASE_LABEL[next]} 전환됨`);
        setTimeout(() => setToast(null), 1800);
    };

    /** 지금 밀고 있는 방향의 다음 국면 (임계를 넘었을 때만 — 넘기 전엔 힌트를 안 준다) */
    const pendingPhase = (() => {
        const w = wrapRef.current?.offsetWidth ?? 1;
        if (Math.abs(dragDx) <= snapThreshold(w)) return null;
        const i = phaseIdx + (dragDx < 0 ? 1 : -1);
        return i >= 0 && i < PHASES.length && i !== phaseIdx ? PHASES[i] : null;
    })();

    // ── 드래그: 6px 미만이면 탭(설정 열기), 임계를 넘으면 국면 전환 ──
    const onDown = (e: React.PointerEvent) => {
        dragRef.current = { startX: e.clientX, dx: 0 };
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: React.PointerEvent) => {
        if (!dragRef.current) return;
        dragRef.current.dx = e.clientX - dragRef.current.startX;
        setDragDx(dragRef.current.dx);
    };
    const onUp = () => {
        const d = dragRef.current;
        dragRef.current = null;
        setDragDx(0);
        if (!d) return;

        const w = wrapRef.current?.offsetWidth ?? 1;
        if (Math.abs(d.dx) < TAP_THRESHOLD_PX) {
            onOpenFilter();                      // 탭 — 설정 열기
        } else if (Math.abs(d.dx) > snapThreshold(w)) {
            const next = PHASES[Math.max(0, Math.min(PHASES.length - 1, phaseIdx + (d.dx < 0 ? 1 : -1)))];
            goPhase(next);
        }
        // 그 사이(살짝 민 것)는 아무 일도 없다 — 제자리로 돌아간다
    };

    return (
        <div
            ref={wrapRef}
            id="filter-status"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            style={{ transform: `translateX(${dragDx * 0.3}px)`, touchAction: 'pan-y' }}
            className="relative flex items-center justify-between cursor-grab active:cursor-grabbing select-none px-4 py-3 transition-transform hover:bg-surface-hover/50 border-b border-border-card"
        >
            <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="flex flex-col leading-tight overflow-hidden min-w-0 flex-1">
                    {/* 제목줄 — 필터를 사람 말로. 단계·상태는 **뒤에** 작게 붙는다.
                        예전에는 큰 뱃지 둘이 앞을 막아 제목이 잘렸다 ("여기서 반경 1km → 파주시 1...") */}
                    <span className={`text-[12px] font-black truncate ${style.accent}`}>
                        {style.icon} {headline()}
                        <span className="ml-1.5 text-[9.5px] font-bold text-text-muted align-middle whitespace-nowrap">
                            {label}
                        </span>
                        {/* 🔒 손으로 고친 필터는 자동 갱신이 덮어쓰지 않는다 —
                            그 사실을 남기되 자리는 안 먹는다 (아이콘 하나) */}
                        {filter.userOverrides && (
                            <span title="손으로 고친 필터라 경로가 바뀌어도 자동 갱신되지 않습니다. 첫짐으로 돌아가면 풀립니다"
                                className="ml-1 text-[10px] text-warning align-middle">🔒</span>
                        )}
                    </span>
                    {/* ── 순서를 고정한다 (명세 §4-1) ──
                        ① 💰 금액(눈높이·단가)  ② 📍 지역  ③ 📦 적재
                        기사님: "아래 줄에 노출되는 값이 일정한 순서로 나오면 좋겠다" */}
                    <span className="text-[11px] text-text-muted font-medium truncate mt-0.5">
                        💰 {eyelineLabel}
                        <span className="opacity-70"> (1t ≥ {oneTonRate.toLocaleString()}원/km)</span>
                        <span className="mx-1.5 opacity-40">·</span>
                        📍 {regionCount}개 동
                        <span className="mx-1.5 opacity-40">·</span>
                        📦 {slotsUsed}/{TRUCK_CAPACITY_SLOTS}칸
                    </span>
                </div>
            </div>

            {/* 국면 점 3개 — 옆에 다른 국면이 있다는 힌트 */}
            <div className="flex items-center gap-2 ml-2">
                <div className="flex gap-1">
                    {PHASES.map((p, i) => (
                        <button key={p} title={`${HUNT_PHASE_LABEL[p]} 로 전환`}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); goPhase(p); }}
                            className={`w-2 h-2 rounded-full transition-colors ${i === phaseIdx ? 'bg-info' : 'bg-border-card hover:bg-text-muted'}`} />
                    ))}
                </div>
                <span className="text-text-muted text-sm">⚙️</span>
            </div>

            {pendingPhase && (
                <span className="absolute inset-y-0 right-0 z-10 flex items-center pr-4 pointer-events-none">
                    <span className="text-[11px] font-black px-2 py-1 rounded-md bg-info/20 border border-info/50 text-info whitespace-nowrap">
                        놓으면 → {HUNT_PHASE_LABEL[pendingPhase]}
                    </span>
                </span>
            )}

            {toast && (
                <span className="absolute right-3 -bottom-1 z-10 text-[10px] font-black px-2 py-0.5 rounded-md bg-accent/15 border border-accent/40 text-accent">
                    {toast}
                </span>
            )}
        </div>
    );
}
