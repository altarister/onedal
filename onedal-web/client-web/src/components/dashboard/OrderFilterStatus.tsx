import { useFilterConfig } from "../../hooks/useFilterConfig";

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
    let label = '스캔 일시정지';
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
                <div className="flex flex-col leading-tight overflow-hidden">
                    <span className="font-black text-text-primary text-sm">
                        {(filter.minFare / 10000).toFixed(1)}만 이상
                        {!filter.isSharedMode && (
                            <span className="text-[11px] text-text-muted font-normal ml-1">| {filter.pickupRadiusKm}km</span>
                        )}
                        {filter.allowedVehicleTypes && filter.allowedVehicleTypes.length > 0 ? (
                            <span className="text-[11px] text-text-muted font-normal ml-1">| {filter.allowedVehicleTypes.join(', ')}</span>
                        ) : (
                            <span className="text-[11px] text-text-muted font-normal ml-1">| 전체</span>
                        )}
                    </span>
                    <span className="text-[11px] text-text-muted font-medium truncate mt-0.5">
                        {getRegionSummary()}
                    </span>
                </div>
            </div>
            <span className="text-text-muted text-sm ml-2">⚙️</span>
        </div>
    );
}
