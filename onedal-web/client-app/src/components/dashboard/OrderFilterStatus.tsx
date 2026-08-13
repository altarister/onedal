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
 * ══ 플리킹을 어색하지 않게 ══
 * 손가락과 화면이 **1:1로 붙어 움직여야** 한다. 예전에는 두 가지가 어긋났다.
 *   ① 드래그 중에도 CSS `transition` 이 걸려 있어 화면이 손가락을 늦게 따라왔다
 *   ② 이동량의 30% 만 반영해 끈적하게 끌렸다
 * 이제 드래그 중에는 트랜지션을 끄고 1:1 로 움직이며, 놓을 때만 스냅 애니메이션을 켠다.
 */
const PHASES: HuntPhase[] = ['DEST', 'LOCAL', 'HOME'];

const PHASE_STYLE: Record<HuntPhase, { icon: string; accent: string; ring: string }> = {
    DEST:  { icon: '🎯', accent: 'text-info',       ring: 'border-info/40' },
    LOCAL: { icon: '🏘️', accent: 'text-accent-alt', ring: 'border-accent-alt/40' },
    HOME:  { icon: '🏠', accent: 'text-accent',     ring: 'border-accent/40' },
};

/** 스와이프로 인정하는 최소 이동 폭 — 이 아래는 탭(설정 열기)으로 본다 */
const TAP_THRESHOLD_PX = 6;
/**
 * 국면이 넘어가려면 이만큼은 밀어야 한다 (스치기만 해선 안 바뀐다).
 * 폭 비율만 쓰면 넓은 화면(데스크톱 800px)에서 280px 를 끌어야 해 못 쓴다 — 둘 중 작은 쪽.
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
    const style = PHASE_STYLE[phase];

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

    /** 제목줄 — 필터를 사람 말로 읽어 준다 */
    const headline = () => {
        const city = filter.destinationCity || '목적지 미정';
        if (phase === 'LOCAL') return <>이 동네(<b className="text-text-primary">{city}</b>) 안에서 끝나는 콜 찾기</>;
        if (phase === 'HOME') return <>여기서부터 <b className="text-text-primary">집({city})</b> 방향으로 필터링</>;
        return <>여기서 반경 <b className="text-text-primary">{filter.pickupRadiusKm}km</b> → <b className="text-text-primary">{city} {filter.destinationRadiusKm ?? 0}km</b> 반경</>;
    };

    const goPhase = (next: HuntPhase) => {
        if (next === phase) return;
        logRoadmapEvent("웹", `요약줄 스와이프 → 국면 전환 (${phase} → ${next})`);
        socket.emit("set-hunt-phase", { phase: next });
        setToast(`${HUNT_PHASE_LABEL[next]} 전환됨`);
        setTimeout(() => setToast(null), 1600);
    };

    /** 지금 밀고 있는 쪽의 이웃 국면 (없으면 null — 끝에서는 안 넘어간다) */
    const neighbor = (dx: number): HuntPhase | null => {
        if (dx === 0) return null;
        const i = phaseIdx + (dx < 0 ? 1 : -1);
        return i >= 0 && i < PHASES.length ? PHASES[i] : null;
    };

    // ── 드래그 ──
    const onDown = (e: React.PointerEvent) => {
        dragRef.current = { startX: e.clientX, dx: 0 };
        setDragging(true);
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: React.PointerEvent) => {
        if (!dragRef.current) return;
        let dx = e.clientX - dragRef.current.startX;
        // 끝 국면에서 더 밀면 **고무줄처럼** 저항한다 — 넘어갈 곳이 없다는 걸 손으로 알려준다
        if (!neighbor(dx)) dx *= 0.25;
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
            const next = neighbor(d.dx);
            if (next) goPhase(next);
        }
        // 그 사이(살짝 민 것)는 제자리로 돌아간다
    };

    const w = wrapRef.current?.offsetWidth ?? 1;
    const willSwitch = Math.abs(dragDx) > snapThreshold(w) && !!neighbor(dragDx);
    const nextPhase = neighbor(dragDx);
    /** 이웃 카드가 손가락을 따라 들어오는 정도 (0~1) */
    const peek = Math.min(1, Math.abs(dragDx) / (snapThreshold(w) * 1.6));

    return (
        <div
            ref={wrapRef}
            id="filter-status"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            className="relative overflow-hidden select-none cursor-grab active:cursor-grabbing border-b border-border-card"
            style={{ touchAction: 'pan-y' }}
        >
            {/* 이웃 국면이 손가락을 따라 들어온다 — 옆에 무엇이 있는지 끌면서 보인다 */}
            {nextPhase && (
                <div
                    className="absolute inset-y-0 flex items-center px-4 pointer-events-none"
                    style={{
                        [dragDx < 0 ? 'right' : 'left']: 0,
                        opacity: peek,
                        transform: `translateX(${dragDx < 0 ? (1 - peek) * 40 : -(1 - peek) * 40}px)`,
                    } as React.CSSProperties}
                >
                    <span className={`text-[12px] font-black px-2.5 py-1 rounded-lg border ${PHASE_STYLE[nextPhase].accent} ${PHASE_STYLE[nextPhase].ring} bg-surface-alt/80 whitespace-nowrap`}>
                        {PHASE_STYLE[nextPhase].icon} {HUNT_PHASE_LABEL[nextPhase]}
                        {willSwitch && <span className="ml-1 opacity-70">← 놓으면 전환</span>}
                    </span>
                </div>
            )}

            {/* 본체 — 드래그 중에는 트랜지션 없이 1:1 로 따라온다 */}
            <div
                className="flex items-center justify-between px-4 py-3 bg-bg-base"
                style={{
                    transform: `translateX(${dragDx}px)`,
                    transition: dragging ? 'none' : 'transform 180ms cubic-bezier(.2,.8,.2,1)',
                    opacity: dragging ? Math.max(0.55, 1 - peek * 0.45) : 1,
                }}
            >
                <div className="flex flex-col leading-tight overflow-hidden min-w-0 flex-1">
                    {/* 제목줄 — 필터를 사람 말로. 상태는 뒤에 작게 (앞을 막으면 문장이 잘린다) */}
                    <span className={`text-[12px] font-black truncate ${style.accent}`}>
                        {style.icon} {headline()}
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
                        💰 {eyelineLabel}
                        <span className="opacity-70"> (1t ≥ {oneTonRate.toLocaleString()}원/km)</span>
                        <span className="mx-1.5 opacity-40">·</span>
                        📍 {regionCount}개 동
                        <span className="mx-1.5 opacity-40">·</span>
                        📦 {slotsUsed}/{TRUCK_CAPACITY_SLOTS}칸
                    </span>
                </div>

                <div className="flex items-center gap-2 ml-2 shrink-0">
                    {/* 점 3개 — 옆에 다른 국면이 있다는 힌트이자, 눌러서 바로 전환 */}
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
            </div>

            {toast && (
                <span className="absolute right-3 bottom-1 z-10 text-[10px] font-black px-2 py-0.5 rounded-md bg-accent/15 border border-accent/40 text-accent">
                    {toast}
                </span>
            )}
        </div>
    );
}
