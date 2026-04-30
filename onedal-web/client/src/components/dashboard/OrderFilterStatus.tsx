import { useFilterConfig } from "../../hooks/useFilterConfig";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";

export default function OrderFilterStatus({ onOpenFilter }: { onOpenFilter: () => void }) {
    const { filter } = useFilterConfig();

    if (!filter) {
        return (
            <Card className="flex items-center justify-center rounded-xl px-4 py-3 shadow-sm bg-card border-border">
                <span className="text-sm font-black tracking-tight text-foreground flex items-center gap-2">오더 필터 동기화 중...</span>
            </Card>
        );
    }
    // export type LoadState = 'EMPTY' | 'LOADING' | 'DRIVING' | 'ARRIVED';
    let label = '스캔 일시정지';
    if (filter.isActive) {
        const state = filter.loadState || 'EMPTY';
        if (state === 'LOADING') label = '합짐 탐색중';
        else if (state === 'DRIVING') label = '경로상 탐색중';
        else if (state === 'ARRIVED') label = '스캔 대기 (도착)';
        else label = '첫짐 탐색중';
    }

    const getStatusStyles = (active: boolean, shared: boolean) => {
        if (!active) return { badge: 'bg-amber-500/90 text-white border-amber-500', border: 'bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20' };
        if (shared) return { badge: 'bg-purple-500/90 text-white border-purple-500', border: 'bg-purple-500/10 border-purple-500/30 hover:bg-purple-500/20' };
        return { badge: 'bg-blue-500/90 text-white border-blue-500', border: 'bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20' };
    };

    const styles = getStatusStyles(filter.isActive, filter.isSharedMode);

    const getRegionSummary = () => {
        // 합짐, 첫짐 모두 파싱된 '읍/면/동' 타겟팅 총 개수를 가져옵니다.
        const regionCount = filter.destinationKeywords && filter.destinationKeywords.length > 0
            ? filter.destinationKeywords.length
            : 0;

        if (filter.isSharedMode) {
            // 합짐 모드: 지정된 경로 이탈 반경 + 하차 거점 반경 및 총 타겟팅된 읍/면/동 개수 표시
            return `회랑 ±${filter.corridorRadiusKm || 10}km (${regionCount}지역)`;
        }
        // 단독 모드: 지정된 도착 도시 명칭 및 타겟팅된 읍/면/동 개수 표시
        return `${filter.destinationCity} (${regionCount}지역)`;
    };

    return (
        <Card
            id="filter-status"
            onClick={onOpenFilter}
            className={`flex items-center justify-between cursor-pointer rounded-lg px-2 py-1 shadow-sm transition-all active:scale-95 ${styles.border}`}
        >
            <div className="flex items-center gap-3 text-xs text-foreground tracking-tight font-bold">
                <Badge variant="outline" className={`${styles.badge} shadow-sm px-2 py-0.5`}>
                    {label}
                </Badge>
                <span className="text-emerald-500 font-black">{(filter.minFare / 10000).toFixed(1)}</span>
                <span className="text-muted-foreground font-sm">|</span>
                <span className="text-foreground">{filter.pickupRadiusKm}km</span>
                <span className="text-muted-foreground font-sm">|</span>
                <span className="text-purple-500">{getRegionSummary()}</span>
                {filter.allowedVehicleTypes && filter.allowedVehicleTypes.length > 0 ? (
                    <>
                        <span className="text-muted-foreground font-sm">|</span>
                        <span className="text-amber-500 font-black">{filter.allowedVehicleTypes.map(v => v.charAt(0)).join(',')}</span>
                    </>
                ) : (
                    <>
                        <span className="text-muted-foreground font-sm">|</span>
                        <span className="text-muted-foreground">전체</span>
                    </>
                )}
            </div>
            <div className={`text-lg sm:text-xl opacity-80 hover:opacity-100 transition-opacity`}>
                ⚙️
            </div>
        </Card>
    );
}
