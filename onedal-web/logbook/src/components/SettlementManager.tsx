export default function SettlementManager() {
  const dummyUnpaid = [
    { id: 'ORD-005', payer: '레드캠프 경리팀', phone: '010-1234-5678', amount: '45,000', dueDate: '2026-05-10', memo: '계산서 발행 완료' },
    { id: 'ORD-012', payer: '삼성물산 담당자', phone: '02-987-6543', amount: '120,000', dueDate: '2026-05-15', memo: '익월 말 결제' },
  ];

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">미수금 리스트</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {dummyUnpaid.map((item) => (
          <div key={item.id} className="bg-surface border border-destructive/30 rounded-lg p-5 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h4 className="font-medium text-text-primary">{item.payer}</h4>
                <p className="text-sm text-text-muted">{item.phone}</p>
              </div>
              <span className="text-lg font-bold text-destructive">{item.amount}원</span>
            </div>
            
            <div className="flex flex-col gap-1 mb-4 text-sm">
              <div className="flex justify-between">
                <span className="text-text-muted">입금 예정일</span>
                <span>{item.dueDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">메모</span>
                <span className="truncate max-w-[150px]">{item.memo}</span>
              </div>
            </div>

            <button className="w-full py-2 bg-primary text-primary-foreground rounded-md shadow hover:bg-primary/90 transition-colors">
              정산 완료 처리
            </button>
          </div>
        ))}
      </div>
      {dummyUnpaid.length === 0 && (
        <div className="text-center py-8 text-text-muted">
          미수금 건이 없습니다.
        </div>
      )}
    </div>
  );
}
