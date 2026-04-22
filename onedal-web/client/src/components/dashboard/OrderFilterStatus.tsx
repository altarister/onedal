import { useFilterConfig } from "../../hooks/useFilterConfig";

export default function OrderFilterStatus({ onOpenFilter }: { onOpenFilter: () => void }) {
    const { filter } = useFilterConfig();

    if (!filter) {
        return (
            <section className="flex items-center justify-center rounded-xl px-4 py-3 border shadow-md bg-surface border-border-card">
                <span className="text-sm font-black tracking-tight text-text-primary flex items-center gap-2">오더 필터 동기화 중...</span>
            </section>
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
        if (!active) return { badge: 'bg-warning text-white px-2 py-0.5 rounded-md border border-warning', border: 'bg-warning/10 border-warning/50 hover:bg-warning/20' };
        if (shared) return { badge: 'bg-accent text-white px-2 py-0.5 rounded-md border border-accent', border: 'bg-accent/10 border-accent/40 hover:bg-accent/20' };
        return { badge: 'bg-info text-white px-2 py-0.5 rounded-md border border-info', border: 'bg-info/10 border-info/30 hover:bg-info/20' };
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
        <section
            id="filter-status"
            onClick={onOpenFilter}
            className={`flex items-center justify-between cursor-pointer rounded-xl px-2 py-1 border shadow-md transition-all active:scale-95 ${styles.border}`}
        >
            <div className="flex items-center gap-3 text-xs text-text-primary tracking-tight font-bold">
                <span className={styles.badge}>
                    {label}
                </span>
                <span className="text-success font-black">{(filter.minFare / 10000).toFixed(1)}</span>
                <span className="text-text-muted font-sm">|</span>
                <span className="text-text-primary">{filter.pickupRadiusKm}km</span>
                <span className="text-text-muted font-sm">|</span>
                <span className="text-accent">{getRegionSummary()}</span>
                {filter.allowedVehicleTypes && filter.allowedVehicleTypes.length > 0 ? (
                    <>
                        <span className="text-text-muted font-sm">|</span>
                        <span className="text-warning font-black">{filter.allowedVehicleTypes.map(v => v.charAt(0)).join(',')}</span>
                    </>
                ) : (
                    <>
                        <span className="text-text-muted font-sm">|</span>
                        <span className="text-text-muted">전체</span>
                    </>
                )}
            </div>
            <div className={`text-lg sm:text-xl`}>
                ⚙️
            </div>
        </section>
    );
}
