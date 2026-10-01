import { useState } from 'react';
import { TARGET_APP_LABEL, isTargetApp } from '@onedal/shared';
import { Button } from '@onedal/ui/button';
import { api, useOps, type StatsAdminCell, type StatsGroupBy } from '../api/ops';
import { ErrorBand, KV, PageHeader, Table, fmtWon, memberName, type Column } from '../ui';

/** 📊 콜 흐름 통계 — 어느 동네에서 어디로 가는 콜이 많은가 (회원 칸 포함 · 관리자 문 · 최근 28일). 회원에게 보내는 것은 3명 이상 섞인 칸만(reviews/25). 폰에서는 줄마다 카드 */
const BY_LABEL: Record<StatsGroupBy, string> = { weekday: '요일', hour: '시간', month: '월' };

export default function Stats() {
    const [by, setBy] = useState<StatsGroupBy>('weekday');
    const { data, error, reload } = useOps(() => Promise.all([api.members(), api.statsAdmin(by)]), [by]);
    const [members, reply] = data ?? [[], null];
    const rows = (reply?.cells ?? []).filter(c => c.calls).sort((a, b) => (b.calls ?? 0) - (a.calls ?? 0));
    const max = Math.max(1, ...rows.map(r => r.calls ?? 0));
    const appOf = (r: StatsAdminCell) => isTargetApp(r.targetApp) ? TARGET_APP_LABEL[r.targetApp] : r.targetApp;
    const fare = (r: StatsAdminCell) => r.fareLastAvg != null ? fmtWon(r.fareLastAvg) : '—';
    const cols: Column<StatsAdminCell>[] = [
        { key: 'g', label: BY_LABEL[by], render: r => r.group },
        { key: 'm', label: '회원', render: r => memberName(members, r.userId) },
        { key: 'app', label: '배차망', render: appOf },
        { key: 'route', label: '출발 → 도착', render: r => `${r.from} → ${r.to}` },
        { key: 'n', label: '건수', render: r => <b>{r.calls}</b> },
        { key: 'fare', label: '평균 요금', render: fare },
        { key: 'bar', label: '', className: 'w-1/4', render: r => <div className="h-2 rounded bg-info/70" style={{ width: `${((r.calls ?? 0) / max) * 100}%` }} /> },
    ];
    return (
        <>
            <PageHeader title="통계" sub={`콜 흐름 — 출발 → 도착 · 건수 · 평균 요금${reply ? ` · ${reply.from} ~ ${reply.to}` : ''}`} right={<>{(Object.keys(BY_LABEL) as StatsGroupBy[]).map(b => <Button key={b} type="button" size="sm" variant={by === b ? 'default' : 'outline'} onClick={() => setBy(b)}>{BY_LABEL[b]}별</Button>)}</>} />
            {error && <ErrorBand text={error} onRetry={reload} />}
            <Table rows={rows} columns={cols} rowKey={r => `${r.group}|${r.userId}|${r.targetApp}|${r.from}|${r.to}`} empty={data ? '이 기간에 묶인 콜이 없습니다' : '읽는 중…'} card={r => (
                <div className="space-y-1">
                    <div className="flex justify-between gap-2"><span className="font-bold">{r.from} → {r.to}</span><span className="font-bold">{r.calls}건</span></div>
                    <KV k={`${BY_LABEL[by]} · 회원 · 배차망`} v={`${r.group} · ${memberName(members, r.userId)} · ${appOf(r)}`} />
                    <KV k="평균 요금" v={fare(r)} />
                    <div className="h-1.5 rounded bg-info/70" style={{ width: `${((r.calls ?? 0) / max) * 100}%` }} />
                </div>
            )} />
        </>
    );
}
