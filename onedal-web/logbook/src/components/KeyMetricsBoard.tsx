import { useState, useEffect } from 'react';
import { DollarSign, Route, TrendingUp, AlertCircle, Loader2 } from 'lucide-react';
import axios from 'axios';

interface SummaryMetrics {
  todayRevenue: number;
  todayDistanceKm: number;
  todayEfficiency: number;
  monthRevenue: number;
  monthDistanceKm: number;
  monthEfficiency: number;
  unpaidTotal: number;
  todayOrderCount: number;
  monthOrderCount: number;
}

export default function KeyMetricsBoard() {
  const [metrics, setMetrics] = useState<SummaryMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    axios.get<SummaryMetrics>('/api/logbook/analytics/summary', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => setMetrics(res.data))
      .catch((err) => {
        console.error('Summary API 호출 실패:', err);
        setError('데이터를 불러오지 못했습니다.');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-surface p-6 rounded-lg border border-border-card shadow-sm flex items-center justify-center h-28">
            <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
          </div>
        ))}
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="bg-surface p-6 rounded-lg border border-destructive/30 text-center text-text-muted">
        {error || '데이터 없음'}
      </div>
    );
  }

  const fmt = (n: number) => n.toLocaleString('ko-KR');

  const cards = [
    {
      title: '오늘 누적 매출',
      value: `${fmt(metrics.todayRevenue)}원`,
      sub: `${metrics.todayOrderCount}건 · 이번 달 ${fmt(metrics.monthRevenue)}원`,
      icon: DollarSign,
      color: 'text-success',
    },
    {
      title: '오늘 주행 거리',
      value: `${metrics.todayDistanceKm.toFixed(1)} km`,
      sub: `이번 달 ${metrics.monthDistanceKm.toFixed(1)} km`,
      icon: Route,
      color: 'text-info',
    },
    {
      title: 'km당 운임 효율',
      value: `${fmt(metrics.todayEfficiency)} 원/km`,
      sub: `이번 달 평균 ${fmt(metrics.monthEfficiency)} 원/km`,
      icon: TrendingUp,
      color: 'text-primary',
    },
    {
      title: '미수금 총액',
      value: `${fmt(metrics.unpaidTotal)}원`,
      sub: metrics.unpaidTotal > 0 ? '미수금 건이 있습니다' : '미수금 없음',
      icon: AlertCircle,
      color: 'text-destructive',
      highlight: metrics.unpaidTotal > 0,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((m) => (
        <div
          key={m.title}
          className={`bg-surface p-6 rounded-lg border ${m.highlight ? 'border-destructive shadow-sm' : 'border-border-card shadow-sm'}`}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-text-muted">{m.title}</h3>
            <m.icon className={`w-5 h-5 ${m.color}`} />
          </div>
          <div className="mt-3">
            <span className={`text-2xl font-bold ${m.highlight ? 'text-destructive' : 'text-text-primary'}`}>
              {m.value}
            </span>
          </div>
          <p className="text-xs text-text-muted mt-2">{m.sub}</p>
        </div>
      ))}
    </div>
  );
}
