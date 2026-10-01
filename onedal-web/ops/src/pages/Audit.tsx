import { useState } from 'react';
import type { OpsAudit } from '@onedal/shared';
import { Button } from '@onedal/ui/button';
import { Input } from '@onedal/ui/input';
import { api } from '../api/ops';
import { Card, KV, PageHeader, Table, dayKey, fmtTime, memberName, plusDaysKey, useTick, type Column } from '../ui';

/** 🧾 기록 — 관리자가 한 일 · 본 것. 동의의 짝 · 위치정보 이용 기록 (ops/CLAUDE.md) */
export default function Audit() {
    useTick();
    const members = api.members();
    const [period, setPeriod] = useState<'오늘' | '7일' | '전체'>('7일');
    const [q, setQ] = useState('');
    const since = period === '오늘' ? dayKey() : period === '7일' ? plusDaysKey(-6) : '';
    const rows = [...api.audit()]
        .filter(a => dayKey(a.at) >= since)
        .filter(a => !q.trim() || [a.action, a.detail, memberName(members, a.targetMemberId)].some(v => v.includes(q.trim())))
        .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)); // 최신이 위 — 자료 순서가 아니라 화면에서 정렬
    const cols: Column<OpsAudit>[] = [
        { key: 'at', label: '시각', render: a => fmtTime(a.at) },
        { key: 'who', label: '관리자', render: a => a.admin },
        { key: 'act', label: '한 일', render: a => <b>{a.action}</b> },
        { key: 'm', label: '대상 회원', render: a => a.targetMemberId ? memberName(members, a.targetMemberId) : <span className="text-text-muted">—</span> },
        { key: 'd', label: '내용', render: a => <span className="text-text-muted">{a.detail}</span> },
    ];
    return (
        <>
            <PageHeader title="기록" sub="승인 · 정지 · 공지 · 글 · 앱 올리기 · 위치 · 콜 열람 — 지우지 않습니다" />
            <Card>
                <div className="flex gap-2 flex-wrap items-center">
                    {(['오늘', '7일', '전체'] as const).map(p => <Button key={p} type="button" size="sm" variant={period === p ? 'default' : 'outline'} onClick={() => setPeriod(p)}>{p}</Button>)}
                    <Input value={q} onChange={e => setQ(e.target.value)} placeholder="한 일 · 내용 · 회원 찾기" className="md:ml-auto md:w-56" />
                </div>
            </Card>
            <Table rows={rows} columns={cols} rowKey={a => String(a.id)} card={a => (
                <div className="space-y-1">
                    <div className="flex justify-between gap-2"><span className="font-bold">{a.action}</span><span className="text-xs text-text-muted">{fmtTime(a.at)}</span></div>
                    <KV k="대상 · 내용" v={`${a.targetMemberId ? memberName(members, a.targetMemberId) : '—'} · ${a.detail || '—'}`} />
                </div>
            )} />
        </>
    );
}
