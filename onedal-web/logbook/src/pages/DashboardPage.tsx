import KeyMetricsBoard from '../components/KeyMetricsBoard';
import AnalyticsChart from '../components/AnalyticsChart';
import PlaceInsightBoard from '../components/PlaceInsightBoard';

export default function DashboardPage() {
  return (
    <div className="p-8 space-y-8">
      <header>
        <h2 className="text-3xl font-bold tracking-tight">대시보드</h2>
        <p className="text-text-muted mt-2">오늘의 운행 현황과 핵심 성과 지표입니다.</p>
      </header>

      {/* 2.1 상단 요약 보드 */}
      <KeyMetricsBoard />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* 2.2 매출 & 주행거리 추이 (차트) */}
          <AnalyticsChart />
        </div>
        <div className="space-y-8">
          {/* 2.5 장소 인사이트 보드 */}
          <PlaceInsightBoard />
        </div>
      </div>
    </div>
  );
}
