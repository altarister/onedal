import { useState } from 'react';
import type { OpsAudit } from '@onedal/shared';
import { Button } from '@onedal/ui/button';
import { Input } from '@onedal/ui/input';
import { api, useOps } from '../api/ops';
import { Card, ErrorBand, KV, PageHeader, Table, fmtTime, memberName, plusDaysKey, todayKey, type Column } from '../ui';

/** 🧾 기록 — 관리자가 한 일 · 본 것(서버 `ops_audit`). 동의의 짝 · 위치정보 이용 기록 (ops/CLAUDE.md). 기간은 서버가 거른다(`?since`) · «전체»는 최근 200줄 */
export default function Audit() {
    const [period, setPeriod] = useState<'오늘' | '7일' | '전체'>('7일');
    const [q, setQ] = useState('');
    const since = period === '오늘' ? todayKey() : period === '7일' ? plusDaysKey(-6) : undefined;
    const { data, error, reload } = useOps(() => Promise.all([api.members(), api.audit(since)]), [since]);
    const [members, audit] = data ?? [[], []];
    const rows = audit.filter(a => !q.trim() || [a.action, a.detail, memberName(members, a.targetMemberId)].some(v => v.includes(q.trim())));
    const cols: Column<OpsAudit>[] = [
        { key: 'at', label: '시각', render: a => fmtTime(a.at) },
        { key: 'who', label: '관리자', render: a => a.admin },
        { key: 'act', label: '한 일', render: a => <b>{a.action}</b> },
        { key: 'm', label: '대상 회원', render: a => a.targetMemberId ? memberName(members, a.targetMemberId) : <span className="text-text-muted">—</span> },
        { key: 'd', label: '내용', render: a => <span className="text-text-muted">{a.detail}</span> },
    ];
    return (
        <>
            <PageHeader title="기록" sub="승인 · 정지 · 공지 · 글 · 회원 열람 — 지우지 않습니다" />
            {error && <ErrorBand text={error} onRetry={reload} />}
            <Card>
                <div className="flex gap-2 flex-wrap items-center">
                    {(['오늘', '7일', '전체'] as const).map(p => <Button key={p} type="button" size="sm" variant={period === p ? 'default' : 'outline'} onClick={() => setPeriod(p)}>{p}</Button>)}
                    <Input value={q} onChange={e => setQ(e.target.value)} placeholder="한 일 · 내용 · 회원 찾기" className="md:ml-auto md:w-56" />
                </div>
            </Card>
            <Table rows={rows} columns={cols} rowKey={a => String(a.id)} empty={data ? '없습니다' : '읽는 중…'} card={a => (
                <div className="space-y-1">
                    <div className="flex justify-between gap-2"><span className="font-bold">{a.action}</span><span className="text-xs text-text-muted">{fmtTime(a.at)}</span></div>
                    <KV k="대상 · 내용" v={`${a.targetMemberId ? memberName(members, a.targetMemberId) : '—'} · ${a.detail || '—'}`} />
                </div>
            )} />
        </>
    );
}
