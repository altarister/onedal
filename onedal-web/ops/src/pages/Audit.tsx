import type { OpsAudit } from '@onedal/shared';
import { api } from '../api/ops';
import { PageHeader, Table, fmtTime, memberName, useTick, type Column } from '../ui';

/** 🧾 기록 — 관리자가 한 일 · 본 것. 동의의 짝 · 위치정보 이용 기록 (ops/CLAUDE.md) */
export default function Audit() {
    useTick();
    const members = api.members();
    const rows = api.audit();
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
            <Table rows={rows} columns={cols} rowKey={a => String(a.id)} />
        </>
    );
}
