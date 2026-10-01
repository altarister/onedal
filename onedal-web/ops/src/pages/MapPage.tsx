import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, useOps } from '../api/ops';
import OpsMapCanvas, { type MapDot } from './OpsMapCanvas';
import { Card, ErrorBand, KV, PageHeader, dayKey, fmtTime, memberName, todayKey } from '../ui';

/**
 * 🗺️ **지도 — 회원들이 지금 어디 있나** (reviews/33 3단계 · 서버 `GET /api/ops/locations` · 읽기만 · 열람 기록 «위치 봄»은 서버가 남긴다).
 *    점은 운전석 폰 GPS 의 마지막 자리 · 시 · 구는 서버가 동 명부로 찾는다(카카오를 안 부른다). 뱃지는 서버가 센 것 그대로다(화면이 다시 세지 않는다).
 *    오늘 보고가 아닌 점은 흐리게 — 마지막 시각을 같이 적는다. 30초마다 다시 읽는다(위치는 천천히 바뀐다).
 */
export default function MapPage() {
    const navigate = useNavigate();
    const [tick, setTick] = useState(0);
    useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 30_000); return () => clearInterval(t); }, []);
    const { data, error, reload } = useOps(() => Promise.all([api.members(), api.locations()]), [tick]);
    const [members, loc] = data ?? [[], null];
    const today = todayKey();
    const dots: MapDot[] = (loc?.rows ?? []).map(r => ({
        id: r.memberId, lat: r.lat, lng: r.lng, label: memberName(members, r.memberId), note: fmtTime(r.at), faded: dayKey(r.at) !== today,
    }));
    return (
        <>
            <PageHeader title="지도" sub="운전석 폰 GPS 의 마지막 자리 — 오늘 보고가 아닌 점은 흐리게 · 30초마다" />
            {error && <ErrorBand text={error} onRetry={reload} />}
            <div className="flex flex-wrap gap-1.5">
                {loc?.regions.map(r => <span key={r.label} className="rounded-full border border-border-card bg-surface-alt/40 px-2.5 py-1 text-xs">{r.label} <b>{r.count}</b></span>)}
                {loc && loc.regions.length === 0 && <span className="text-sm text-text-muted">위치를 보낸 운전석 폰이 없습니다</span>}
                {!loc && !error && <span className="text-sm text-text-muted">읽는 중…</span>}
            </div>
            <OpsMapCanvas dots={dots} onPick={id => navigate(`/members/${id}`)} />
            <Card title={`회원 위치 — ${loc?.rows.length ?? 0}명`}>
                {loc?.rows.map(r => (
                    <KV key={r.memberId} k={`${memberName(members, r.memberId)} · ${r.region}`} v={fmtTime(r.at)} />
                ))}
                {loc && loc.rows.length === 0 && <p className="text-sm text-text-muted">없습니다</p>}
            </Card>
        </>
    );
}
