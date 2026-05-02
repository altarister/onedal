import SettlementManager from '../components/SettlementManager';

export default function SettlementPage() {
  return (
    <div className="p-8 space-y-8">
      <header>
        <h2 className="text-3xl font-bold tracking-tight">정산 관리</h2>
        <p className="text-text-muted mt-2">미수금 및 정산 내역을 한눈에 관리하세요.</p>
      </header>

      <div className="bg-surface border border-border-card rounded-lg p-6 shadow-sm">
        <SettlementManager />
      </div>
    </div>
  );
}
