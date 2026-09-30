import { useEffect } from 'react';
import { deviceLabel } from '@onedal/shared';
import { api } from '../api/ops';
import { Card, PageHeader, VERDICT_DOT, fmtTime, memberName, useTick } from '../ui';

/**
 * 🗺️ 지도 — 회원 지금 위치 · 잡은 콜의 상하차. 실제 지도는 관제웹 지도 부품(`ui/` 로 옮긴 뒤)을 쓴다 — 지금은 자리만.
 *    위치는 5~10초에 한 번 읽는 문 하나로 가져온다(1초 반복 · 소켓 방송 없음 — reviews/29 5단계). 열람은 기록에 남는다.
 */
const SPOTS: Record<string, { x: number; y: number }> = { 'm-driver1': { x: 38, y: 46 }, 'm-driver2': { x: 22, y: 30 } };
const STOPS = [
    { id: 's1', label: '① 곤지암 상차', x: 44, y: 52, kind: 'pickup' },
    { id: 's2', label: '① 관고동 하차', x: 70, y: 66, kind: 'dropoff' },
    { id: 's3', label: '② 야탑 상차', x: 12, y: 18, kind: 'pickup' },
    { id: 's4', label: '② 오포 하차', x: 32, y: 40, kind: 'dropoff' },
];

export default function MapPage() {
    useTick();
    useEffect(() => { api.viewed('위치 봄', null, '/map'); }, []);
    const members = api.members();
    const phones = api.phones().filter(p => p.locationOn);
    const calls = api.calls().filter(c => c.status === 'ORDER_CONFIRMED');
    return (
        <>
            <PageHeader title="지도" sub="회원 지금 위치 · 잡은 콜의 상하차 — 5~10초마다 갱신" />
            <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
                <Card>
                    <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden border border-border-card bg-[radial-gradient(circle_at_30%_30%,rgba(59,130,246,0.10),transparent_45%),radial-gradient(circle_at_70%_70%,rgba(16,185,129,0.10),transparent_45%)] bg-surface-alt">
                        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'linear-gradient(rgba(128,128,128,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(128,128,128,0.25) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
                        <div className="absolute left-3 top-3 text-xs text-text-muted bg-surface/80 rounded px-2 py-1">지도 자리 — 관제웹 지도 부품을 ui/ 로 옮긴 뒤 붙입니다</div>
                        {STOPS.map(s => (
                            <div key={s.id} className="absolute -translate-x-1/2 -translate-y-1/2 text-[11px]" style={{ left: `${s.x}%`, top: `${s.y}%` }}>
                                <div className={`w-3 h-3 rounded-full mx-auto ${s.kind === 'pickup' ? 'bg-success' : 'bg-danger'} ring-2 ring-surface`} />
                                <div className="mt-0.5 bg-surface/90 rounded px-1 whitespace-nowrap">{s.label}</div>
                            </div>
                        ))}
                        {phones.map(p => {
                            const sp = SPOTS[p.memberId]; if (!sp) return null;
                            return (
                                <div key={p.deviceId} className="absolute -translate-x-1/2 -translate-y-1/2 text-[11px]" style={{ left: `${sp.x}%`, top: `${sp.y}%` }}>
                                    <div className="w-5 h-5 rounded-full bg-info ring-4 ring-info/30 mx-auto animate-pulse" />
                                    <div className="mt-0.5 bg-info text-white rounded px-1.5 py-0.5 font-bold whitespace-nowrap">{memberName(members, p.memberId)}</div>
                                </div>
                            );
                        })}
                    </div>
                </Card>
                <div className="space-y-4">
                    <Card title="지금 위치를 보내는 폰">
                        {phones.map(p => <div key={p.deviceId} className="text-sm flex justify-between"><span><b>{memberName(members, p.memberId)}</b> · {deviceLabel(p)}</span><span className="text-text-muted">{fmtTime(p.lastSeenAt)}</span></div>)}
                        {phones.length === 0 && <p className="text-sm text-text-muted">없습니다</p>}
                    </Card>
                    <Card title="진행 중 콜">
                        {calls.map(c => <div key={c.id} className="text-sm">{VERDICT_DOT[c.verdict]} <b>{memberName(members, c.memberId)}</b> · {c.pickup.place} → {c.dropoff.place}</div>)}
                    </Card>
                </div>
            </div>
        </>
    );
}
