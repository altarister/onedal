import { TARGET_APP_LABEL, type OpsAnomaly, type OpsScreenWord, type TargetAppType } from '@onedal/shared';
import { api } from '../api/ops';
import { Card, PageHeader, Table, fmtTime, memberName, useTick, type Column } from '../ui';

/** ⚠️ 앱 이상 기록 · 배차망 화면 새 글자 — 배차망 앱이 바뀌면 모든 회원이 함께 멈춘다. */
export default function Anomalies() {
    useTick();
    const members = api.members();
    const rows = api.anomalies();
    const words = api.screenWords();
    const app = (a: string) => TARGET_APP_LABEL[a as TargetAppType] ?? a;
    const cols: Column<OpsAnomaly>[] = [
        { key: 'at', label: '시각', render: a => fmtTime(a.at) },
        { key: 'm', label: '회원', render: a => memberName(members, a.memberId) },
        { key: 'dev', label: '폰', render: a => <span className="text-xs text-text-muted">{a.deviceId}</span> },
        { key: 'app', label: '배차망', render: a => app(a.targetApp) },
        { key: 'scr', label: '화면', render: a => a.screen },
        { key: 'why', label: '까닭', render: a => a.reason },
    ];
    const wcols: Column<OpsScreenWord>[] = [
        { key: 'app', label: '배차망', render: w => app(w.targetApp) },
        { key: 'page', label: '화면', render: w => w.page },
        { key: 'word', label: '글자', render: w => <b>{w.word}</b> },
        { key: 'kind', label: '갈래', render: w => w.kind },
        { key: 'at', label: '처음 본 때', render: w => fmtTime(w.firstSeenAt) },
    ];
    return (
        <>
            <PageHeader title="이상 기록" sub="앱이 화면을 못 읽은 기록 · 처음 보는 글자" />
            <Card title="앱 이상 기록"><Table rows={rows} columns={cols} rowKey={a => String(a.id)} /></Card>
            <Card title="배차망 화면 새 글자 — 사전에 없는 낱말 (배차망 앱이 바뀐 신호)"><Table rows={words} columns={wcols} rowKey={w => `${w.targetApp}-${w.page}-${w.word}`} /></Card>
        </>
    );
}
