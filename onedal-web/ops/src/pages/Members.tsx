import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TARGET_APP_LABEL, type OpsMember } from '@onedal/shared';
import { Badge } from '@onedal/ui/badge';
import { Button } from '@onedal/ui/button';
import { Input } from '@onedal/ui/input';
import { api, useOps } from '../api/ops';
import { Card, ErrorBand, KV, PageHeader, Stat, StatRow, StatusBadge, Table, memberStatus, type Column } from '../ui';

/** 👥 회원 목록 — 승인 대기 · 사용 중 · 정지 · 유예는 사실 시각 칸에서 글로만 (ops/CLAUDE.md). 기사님도 한 줄(기사 + 관리자 · reviews/29 기준 4). 폰에서는 줄마다 카드 */
export default function Members() {
    const navigate = useNavigate();
    const { data, error, reload } = useOps(() => api.members(), []);
    const [filter, setFilter] = useState<'all' | '승인 대기' | '사용 중' | '정지' | '유예'>('all');
    const [q, setQ] = useState('');
    const all = data ?? [];
    const rows = all
        .filter(m => filter === 'all' || memberStatus(m).text.includes(filter))
        .filter(m => !q.trim() || [m.name, m.phone, m.email, m.vehicle].some(v => v.includes(q.trim())));
    const count = (t: string) => all.filter(m => memberStatus(m).text.includes(t)).length;
    const nets = (m: OpsMember) => m.networks.map(n => TARGET_APP_LABEL[n]).join(' · ') || '—';
    const allows = (m: OpsMember) => (
        <span className="flex gap-1 flex-wrap">
            {m.autoAllowedAt && <Badge variant="outline" className="bg-info/15 text-info border-info/30">자동 잡기</Badge>}
            {m.statsAllowedAt && <Badge variant="outline">통계</Badge>}
            {m.opsAllowedAt && <Badge variant="outline" className="bg-accent-alt/15 text-accent-alt border-accent-alt/30">운영센터</Badge>}
            {!m.autoAllowedAt && !m.statsAllowedAt && !m.opsAllowedAt && <span className="text-text-muted">—</span>}
        </span>
    );

    const columns: Column<OpsMember>[] = [
        { key: 'status', label: '상태', render: m => <StatusBadge m={m} /> },
        { key: 'name', label: '이름', className: 'whitespace-nowrap', render: m => <span className="font-bold">{m.name}</span> },
        { key: 'phone', label: '연락처', className: 'whitespace-nowrap', render: m => m.phone || '—' },
        { key: 'vehicle', label: '차종', render: m => m.vehicle || '—' },
        { key: 'networks', label: '배차망', render: nets },
        { key: 'paid', label: '유료 기한', className: 'whitespace-nowrap', render: m => m.paidUntil ?? <span className="text-text-muted">없음</span> },
        { key: 'allow', label: '허락', className: 'whitespace-nowrap', render: allows },
        { key: 'phones', label: '폰', render: m => `${m.phones.length}대 · 연결 ${m.phones.filter(p => p.status === 'ONLINE').length}` },
        { key: 'ver', label: '앱', render: m => m.phones.map(p => p.appVersion).filter((v, i, a) => a.indexOf(v) === i).join(' / ') || '—' },
        { key: 'created', label: '가입', className: 'whitespace-nowrap', render: m => m.createdAt.slice(0, 10) },
    ];

    return (
        <>
            <PageHeader title="회원" sub="모든 회원 — 기사님도 한 줄(기사 + 관리자)" right={<Button asChild variant="outline" size="sm"><Link to="/members/check">매달 멤버 대조</Link></Button>} />
            {error && <ErrorBand text={error} onRetry={reload} />}
            <StatRow>
                <Stat label="승인 대기" value={count('승인 대기')} tone={count('승인 대기') ? 'warn' : undefined} />
                <Stat label="사용 중" value={count('사용 중')} tone="ok" />
                <Stat label="유예" value={count('유예')} tone={count('유예') ? 'warn' : undefined} />
                <Stat label="정지" value={count('정지')} tone={count('정지') ? 'bad' : undefined} />
            </StatRow>
            <Card>
                <div className="flex gap-2 flex-wrap items-center">
                    {(['all', '승인 대기', '사용 중', '유예', '정지'] as const).map(f => (
                        <Button key={f} type="button" size="sm" variant={filter === f ? 'default' : 'outline'} onClick={() => setFilter(f)}>{f === 'all' ? '전체' : f}</Button>
                    ))}
                    <Input value={q} onChange={e => setQ(e.target.value)} placeholder="이름 · 연락처 · 차종 찾기" className="md:ml-auto md:w-56" />
                </div>
            </Card>
            <Table rows={rows} columns={columns} rowKey={m => m.id} onRow={m => navigate(`/members/${m.id}`)} empty={data ? '해당하는 회원이 없습니다' : '읽는 중…'}
                card={m => (
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2"><span className="font-bold">{m.name}</span><StatusBadge m={m} /></div>
                        <KV k="연락처 · 차종" v={`${m.phone || '—'} · ${m.vehicle || '—'}`} />
                        <KV k="배차망" v={nets(m)} />
                        <KV k="폰 · 앱" v={`${m.phones.length}대 (연결 ${m.phones.filter(p => p.status === 'ONLINE').length}) · ${m.phones.map(p => p.appVersion).filter((v, i, a) => a.indexOf(v) === i).join(' / ') || '—'}`} />
                        <div className="flex items-center justify-between gap-2 pt-1"><span className="text-xs text-text-muted">유료 {m.paidUntil ?? '없음'}</span>{allows(m)}</div>
                    </div>
                )} />
        </>
    );
}
