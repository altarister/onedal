import DrivingLogTable from '../components/DrivingLogTable';
import FilterDayBoard from '../components/FilterDayBoard';

export default function DrivingLogPage() {
  return (
    <div className="p-8 space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">전체 장부 (운행 일지)</h2>
          <p className="text-text-muted mt-2">세금 신고 및 증빙용으로 사용할 수 있는 상세 운행 기록입니다.</p>
        </div>
        <button className="px-4 py-2 bg-primary text-primary-foreground rounded-md shadow hover:opacity-90 transition-opacity">
          엑셀 다운로드
        </button>
      </header>

      {/* 📊 설정과 성과 — "이 설정이 얼마를 벌었나" (필터 정의 4장 · 기사님 확정: 운행일지에) */}
      <FilterDayBoard />

      <div className="bg-surface border border-border-card rounded-lg p-6 shadow-sm">
        <DrivingLogTable />
      </div>
    </div>
  );
}
