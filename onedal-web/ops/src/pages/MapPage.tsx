import { deviceLabel } from '@onedal/shared';
import { api, useOps } from '../api/ops';
import { Card, ErrorBand, PageHeader, fmtTime, memberName } from '../ui';

/**
 * 🗺️ 지도 — 회원 지금 위치 · 잡은 콜의 상하차. 실제 지도는 관제웹 지도 부품(`ui/` 로 옮긴 뒤)을 쓴다 — 지금은 자리만.
 *    위치를 보내는 폰은 서버 `/ops/phones`(배차망 폰) · 좌표 자체와 진행 중 콜의 상하차는 5단계(위치 읽는 문 + 열람 기록). 
 */
export default function MapPage() {
    const { data, error, reload } = useOps(() => Promise.all([api.members(), api.phones()]), []);
    const [members, allPhones] = data ?? [[], []];
    const phones = allPhones.filter(p => p.locationOn);
    return (
        <>
            <PageHeader title="지도" sub="회원 지금 위치 · 잡은 콜의 상하차 — 좌표를 읽는 문은 5단계" />
            {error && <ErrorBand text={error} onRetry={reload} />}
            <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
                <Card>
                    <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden border border-border-card bg-[radial-gradient(circle_at_30%_30%,rgba(59,130,246,0.10),transparent_45%),radial-gradient(circle_at_70%_70%,rgba(16,185,129,0.10),transparent_45%)] bg-surface-alt">
                        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'linear-gradient(rgba(128,128,128,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(128,128,128,0.25) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
                        <div className="absolute left-3 top-3 text-xs text-text-muted bg-surface/80 rounded px-2 py-1">지도 자리 — 관제웹 지도 부품을 ui/ 로 옮긴 뒤 붙입니다 · 좌표는 5단계 문에서</div>
                    </div>
                </Card>
                <div className="space-y-4">
                    <Card title="지금 위치를 보내는 폰">
                        {phones.map(p => <div key={p.deviceId} className="text-sm flex justify-between"><span><b>{memberName(members, p.memberId)}</b> · {deviceLabel(p)}</span><span className="text-text-muted">{fmtTime(p.lastSeenAt)}</span></div>)}
                        {phones.length === 0 && <p className="text-sm text-text-muted">{data ? '없습니다' : '읽는 중…'}</p>}
                    </Card>
                    <Card title="진행 중 콜">
                        <p className="text-sm text-text-muted">모든 회원의 진행 중 콜을 읽는 문은 5단계 — 지금은 회원 한 명 화면의 «오늘 콜»에서 봅니다.</p>
                    </Card>
                </div>
            </div>
        </>
    );
}
