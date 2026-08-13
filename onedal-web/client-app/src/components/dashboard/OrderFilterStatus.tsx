import { useFilterConfig } from "../../hooks/useFilterConfig";
import { TRUCK_CAPACITY_SLOTS } from "@onedal/shared";

import { Badge } from "../ui/badge";

export default function OrderFilterStatus({ onOpenFilter }: { onOpenFilter: () => void }) {
    const { filter } = useFilterConfig();

    if (!filter) {
        return (
            <div className="flex flex-row items-center justify-center px-4 py-3">
                <span className="text-sm font-black tracking-tight text-text-primary flex items-center gap-2">오더 필터 동기화 중...</span>
            </div>
        );
    }
    // [V2] DispatchPhase 기반 상태 라벨링
    let label = '수동 대기';
    if (filter.isActive) {
        const phase = filter.dispatchPhase || 'STANDBY';
        const action = filter.driverAction || 'WAITING';

        if (action === 'UNLOADING') label = '하차 대기 (도착)';
        else if (phase === 'GATHERING') label = '합짐 탐색중';
        else if (phase === 'DELIVERING') label = '경로상 탐색중';
        else label = '첫짐 탐색중'; // STANDBY
    }

    const getStatusStyles = (active: boolean, shared: boolean) => {
        if (!active) return { badge: 'bg-warning/90 text-white border-warning', border: 'bg-warning/10 border-warning/30 hover:bg-warning/20' };
        if (shared) return { badge: 'bg-accent-alt/90 text-white border-accent-alt', border: 'bg-accent-alt/10 border-accent-alt/30 hover:bg-accent-alt/20' };
        return { badge: 'bg-info/90 text-white border-info', border: 'bg-info/10 border-info/30 hover:bg-info/20' };
    };

    const styles = getStatusStyles(filter.isActive, filter.isSharedMode);

    // ── 단가 판정 모델 표시값 (docs/필터_재설계_명세.md) ──
    // 서버가 내려준 파생값을 그대로 쓴다. 여기서 다시 계산하지 않는다.
    const eyeline = filter.eyelinePct ?? 10;
    const eyelineLabel = eyeline >= 100 ? '전부' : (eyeline === 0 ? '시세' : `-${eyeline}%`);
    const oneTonRate = filter.ratePerKm?.['1t'] ?? 0;
    const slotsUsed = filter.slotsUsed ?? 0;

    const getRegionSummary = () => {
        // 합짐, 첫짐 모두 파싱된 '읍/면/동' 타겟팅 총 개수를 가져옵니다.
        const regionCount = filter.destinationKeywords && filter.destinationKeywords.length > 0
            ? filter.destinationKeywords.length
            : 0;

        let guSummary = '';
        if (filter.destinationGroups && Object.keys(filter.destinationGroups).length > 0) {
            const guKeys = Object.keys(filter.destinationGroups);
            if (guKeys.length <= 2) {
                guSummary = guKeys.join(', ');
            } else {
                guSummary = `${guKeys[0]}, ${guKeys[1]} 등 ${guKeys.length}개 구`;
            }
        }

        if (filter.isSharedMode) {
            // 합짐 모드: 구(district) 요약 정보가 있으면 우선 표시
            if (guSummary) {
                return `±${filter.corridorRadiusKm ?? 10}km | ${guSummary} (${regionCount}동)`;
            }
            return `±${filter.corridorRadiusKm ?? 10}km | ${regionCount}개 동`;
        }
        
        // 단독 모드: 지정된 도착 도시 명칭 및 타겟팅된 읍/면/동 개수 표시
        if (guSummary) {
            return `${filter.destinationCity} | ${guSummary} (${regionCount}동)`;
        }
        return `${filter.destinationCity} (${regionCount}동)`;
    };

    return (
        <div
            id="filter-status"
            onClick={onOpenFilter}
            className="flex items-center justify-between cursor-pointer px-4 py-3 transition-all active:scale-[0.98] hover:bg-surface-hover/50 border-b border-border-card"
        >
            <div className="flex items-center gap-3 flex-1">
                <Badge variant="outline" className={`${styles.badge} shadow-sm px-2 py-1 whitespace-nowrap`}>
                    {label}
                </Badge>
                {/* 🔒 기사님이 손으로 고친 필터는 자동 갱신이 덮어쓰지 않는다.
                    그 사실을 화면에 남긴다 — 안 그러면 "왜 회랑이 안 바뀌지?" 를 알 수 없다.
                    (사냥 사이클이 끝나 첫짐으로 돌아가면 자동으로 풀린다) */}
                {filter.userOverrides && (
                    <Badge variant="outline"
                        title="손으로 고친 필터라 경로가 바뀌어도 자동 갱신되지 않습니다. 첫짐으로 돌아가면 풀립니다"
                        className="bg-warning/12 border-warning/45 text-warning px-1.5 py-0.5 text-[10px] font-black whitespace-nowrap">
                        🔒 수동 고정
                    </Badge>
                )}
                <div className="flex flex-col leading-tight overflow-hidden">
                    {/* ── 순서를 고정한다 (docs/필터_재설계_명세.md §4-1) ──
                        ① 💰 금액(눈높이·단가)  ② 📍 지역  ③ 📦 적재
                        기사님: "아래 줄에 노출되는 값이 일정한 순서로 나오면 좋겠다" */}
                    <span className="font-black text-text-primary text-sm">
                        💰 {eyelineLabel}
                        <span className="text-[11px] text-text-muted font-normal ml-1">
                            (1t ≥ {oneTonRate.toLocaleString()}원/km)
                        </span>
                        {!filter.isSharedMode && (
                            <span className="text-[11px] text-text-muted font-normal ml-1">| 상차 {filter.pickupRadiusKm}km</span>
                        )}
                    </span>
                    <span className="text-[11px] text-text-muted font-medium truncate mt-0.5">
                        📍 {getRegionSummary()}
                        <span className="ml-2">📦 {slotsUsed}/{TRUCK_CAPACITY_SLOTS}칸</span>
                    </span>
                </div>
            </div>
            <span className="text-text-muted text-sm ml-2">⚙️</span>
        </div>
    );
}
