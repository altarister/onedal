import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TARGET_APP_LABEL, type OpsMember, type TargetAppType } from '@onedal/shared';
import { Badge } from '@onedal/ui/badge';
import { Button } from '@onedal/ui/button';
import { api } from '../api/ops';
import { Card, PageHeader, Stat, StatusBadge, Table, memberStatus, useTick, type Column } from '../ui';

/** 👥 회원 목록 — 승인 대기 · 사용 중 · 정지 · 유예는 사실 시각 칸에서 글로만 (ops/CLAUDE.md) */
export default function Members() {
    useTick();
    const navigate = useNavigate();
    const [filter, setFilter] = useState<'all' | '승인 대기' | '사용 중' | '정지' | '유예'>('all');
    const all = api.members().filter(m => m.role !== 'ADMIN');
    const rows = filter === 'all' ? all : all.filter(m => memberStatus(m).text.startsWith(filter));
    const count = (t: string) => all.filter(m => memberStatus(m).text.startsWith(t)).length;

    const columns: Column<OpsMember>[] = [
        { key: 'status', label: '상태', render: m => <StatusBadge m={m} /> },
        { key: 'name', label: '이름', render: m => <span className="font-bold">{m.name}</span> },
        { key: 'phone', label: '연락처', render: m => m.phone },
        { key: 'vehicle', label: '차종', render: m => m.vehicle || '—' },
        { key: 'networks', label: '배차망', render: m => m.networks.map(n => TARGET_APP_LABEL[n as TargetAppType]).join(' · ') || '—' },
        { key: 'region', label: '지역', render: m => m.region || '—' },
        { key: 'paid', label: '유료 기한', render: m => m.paidUntil ?? <span className="text-text-muted">없음</span> },
        { key: 'allow', label: '허락', className: 'whitespace-nowrap', render: m => (
            <span className="flex gap-1">
                {m.autoUntil && <Badge variant="outline" className="bg-info/15 text-info border-info/30">자동 잡기</Badge>}
                {m.statsUntil && <Badge variant="outline">통계</Badge>}
                {m.opsAllowedAt && <Badge variant="outline" className="bg-accent-alt/15 text-accent-alt border-accent-alt/30">운영센터</Badge>}
                {!m.autoUntil && !m.statsUntil && !m.opsAllowedAt && <span className="text-text-muted">—</span>}
            </span>
        ) },
        { key: 'phones', label: '폰', render: m => `${m.phones.length}대 · 연결 ${m.phones.filter(p => p.status === 'ONLINE').length}` },
        { key: 'ver', label: '앱', render: m => m.phones.map(p => p.appVersion).filter((v, i, a) => a.indexOf(v) === i).join(' / ') || '—' },
        { key: 'created', label: '가입', render: m => m.createdAt.slice(0, 10) },
    ];

    return (
        <>
            <PageHeader title="회원" sub="기사 계정 — 관리자 계정은 여기 없습니다" right={<Button asChild variant="outline" size="sm"><Link to="/members/check">매달 멤버 대조</Link></Button>} />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label="승인 대기" value={count('승인 대기')} tone={count('승인 대기') ? 'warn' : undefined} />
                <Stat label="사용 중" value={count('사용 중')} tone="ok" />
                <Stat label="유예" value={count('유예')} tone={count('유예') ? 'warn' : undefined} />
                <Stat label="정지" value={count('정지')} tone={count('정지') ? 'bad' : undefined} />
            </div>
            <Card>
                <div className="flex gap-2 flex-wrap">
                    {(['all', '승인 대기', '사용 중', '유예', '정지'] as const).map(f => (
                        <Button key={f} type="button" size="sm" variant={filter === f ? 'default' : 'outline'} onClick={() => setFilter(f)}>{f === 'all' ? '전체' : f}</Button>
                    ))}
                </div>
            </Card>
            <Table rows={rows} columns={columns} rowKey={m => m.id} onRow={m => navigate(`/members/${m.id}`)} empty="해당하는 회원이 없습니다" />
        </>
    );
}
