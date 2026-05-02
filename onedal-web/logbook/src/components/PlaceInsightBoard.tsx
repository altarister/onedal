import { useState, useEffect } from 'react';
import { MapPin, AlertTriangle, Loader2 } from 'lucide-react';
import axios from 'axios';

interface HotspotPlace {
  id: number;
  addressDetail: string;
  customerName: string;
  region: string;
  visitCount: number;
  lastVisitedAt: string | null;
}

interface BlacklistedPlace {
  id: number;
  addressDetail: string;
  customerName: string;
  rating: number;
  blacklistMemo: string | null;
}

interface PlaceInsights {
  hotspots: HotspotPlace[];
  blacklisted: BlacklistedPlace[];
}

export default function PlaceInsightBoard() {
  const [data, setData] = useState<PlaceInsights | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    axios.get<PlaceInsights>('/api/logbook/places/hotspots', {
      headers: { Authorization: `Bearer ${token}` },
      params: { limit: 5 },
    })
      .then((res) => setData(res.data))
      .catch((err) => console.error('Places API 호출 실패:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-surface border border-border-card rounded-lg p-6 shadow-sm flex items-center justify-center h-40">
        <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    );
  }

  const hotspots = data?.hotspots || [];
  const blacklisted = data?.blacklisted || [];

  return (
    <div className="space-y-6">
      {/* 핫스팟 TOP 5 */}
      <div className="bg-surface border border-border-card rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <span className="text-warning">🔥</span> 단골 핫스팟 TOP 5
        </h3>
        {hotspots.length === 0 ? (
          <p className="text-sm text-text-muted py-4 text-center">아직 방문 기록이 없습니다.</p>
        ) : (
          <ul className="space-y-3">
            {hotspots.map((place, idx) => (
              <li key={place.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-text-muted font-mono w-4">{idx + 1}.</span>
                  <div>
                    <span className="font-medium text-text-primary">{place.customerName || '미상'}</span>
                    <p className="text-xs text-text-muted truncate max-w-[180px]">{place.addressDetail}</p>
                  </div>
                </div>
                <span className="text-sm bg-primary/10 text-primary px-2 py-1 rounded-full whitespace-nowrap">
                  {place.visitCount}회 방문
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 블랙리스트 */}
      <div className="bg-surface border border-border-card rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-destructive" /> 블랙리스트 경고판
        </h3>
        {blacklisted.length === 0 ? (
          <p className="text-sm text-text-muted py-4 text-center">블랙리스트에 등록된 장소가 없습니다.</p>
        ) : (
          <ul className="space-y-4">
            {blacklisted.map((place) => (
              <li key={place.id} className="border-l-2 border-destructive pl-3">
                <div className="font-medium text-text-primary flex items-center gap-1">
                  <MapPin className="w-4 h-4 text-text-muted" /> {place.customerName || place.addressDetail}
                </div>
                <p className="text-sm text-text-muted mt-1">
                  평점 {place.rating.toFixed(1)} · {place.blacklistMemo || '사유 미기록'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
