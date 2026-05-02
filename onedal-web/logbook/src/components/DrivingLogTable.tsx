export default function DrivingLogTable() {
  const dummyLogs = [
    { id: 'ORD-001', time: '13:00', pickup: '경기 광주 오포', dropoff: '서울 강남 역삼', vehicle: '1t', fare: '45,000', distance: '34.5' },
    { id: 'ORD-002', time: '14:30', pickup: '서울 강남 논현', dropoff: '경기 용인 수지', vehicle: '다마스', fare: '30,000', distance: '28.0' },
    { id: 'ORD-003', time: '16:00', pickup: '경기 용인 기흥', dropoff: '경기 화성 동탄', vehicle: '라보', fare: '25,000', distance: '15.2' },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-text-muted uppercase bg-surface-hover border-b border-border-card">
          <tr>
            <th className="px-6 py-3">완료시간</th>
            <th className="px-6 py-3">상차지</th>
            <th className="px-6 py-3">하차지</th>
            <th className="px-6 py-3">차종</th>
            <th className="px-6 py-3">운임</th>
            <th className="px-6 py-3">주행거리</th>
          </tr>
        </thead>
        <tbody>
          {dummyLogs.map((log) => (
            <tr key={log.id} className="bg-surface border-b border-border-card hover:bg-surface-hover/50">
              <td className="px-6 py-4">{log.time}</td>
              <td className="px-6 py-4 font-medium">{log.pickup}</td>
              <td className="px-6 py-4 font-medium">{log.dropoff}</td>
              <td className="px-6 py-4">{log.vehicle}</td>
              <td className="px-6 py-4">{log.fare}원</td>
              <td className="px-6 py-4">{log.distance}km</td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* TODO: 다중 경유지 표시 지원 (Accordion) 구현 예정 */}
    </div>
  );
}
