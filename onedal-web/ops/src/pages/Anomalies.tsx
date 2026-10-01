import { TARGET_APP_LABEL, WORD_KIND_LABEL, deviceLabel, type OpsAnomaly, type OpsScreenWord, type TargetAppType } from '@onedal/shared';
import { api, useOps } from '../api/ops';
import { Card, ErrorBand, KV, PageHeader, Table, fmtTime, memberName, type Column } from '../ui';

/** ⚠️ 앱 이상 기록 · 배차망 화면 새 글자 — 배차망 앱이 바뀌면 모든 회원이 함께 멈춘다. 글자 갈래 이름표는 shared `WORD_KIND_LABEL` 한 벌 */
export default function Anomalies() {
    const { data, error, reload } = useOps(() => Promise.all([api.members(), api.phones(), api.anomalies()]), []);
    const [members, phones, reply] = data ?? [[], [], { anomalies: [], screenWords: [] }];
    const rows = reply.anomalies;
    const words = reply.screenWords;
    const phoneName = (deviceId: string) => deviceLabel({ deviceId, deviceName: phones.find(p => p.deviceId === deviceId)?.deviceName });
    const app = (a: TargetAppType) => TARGET_APP_LABEL[a];
    const cols: Column<OpsAnomaly>[] = [
        { key: 'at', label: '시각', render: a => fmtTime(a.at) },
        { key: 'm', label: '회원', render: a => memberName(members, a.memberId) },
        { key: 'dev', label: '폰', render: a => phoneName(a.deviceId) },
        { key: 'app', label: '배차망', render: a => app(a.targetApp) },
        { key: 'scr', label: '화면', render: a => a.screen },
        { key: 'why', label: '까닭', render: a => a.reason },
    ];
    const wcols: Column<OpsScreenWord>[] = [
        { key: 'app', label: '배차망', render: w => app(w.targetApp) },
        { key: 'page', label: '화면', render: w => w.page },
        { key: 'word', label: '글자', render: w => <b>{w.word}</b> },
        { key: 'kind', label: '갈래', render: w => WORD_KIND_LABEL[w.kind] },
        { key: 'at', label: '처음 본 때', render: w => fmtTime(w.firstSeenAt) },
    ];
    const empty = data ? '없습니다' : '읽는 중…';
    return (
        <>
            <PageHeader title="이상 기록" sub="앱이 화면을 못 읽은 기록 · 처음 보는 글자" />
            {error && <ErrorBand text={error} onRetry={reload} />}
            <Card title="앱 이상 기록"><Table rows={rows} columns={cols} rowKey={a => String(a.id)} empty={empty} card={a => (
                <div className="space-y-1">
                    <div className="flex justify-between gap-2"><span className="font-bold">{app(a.targetApp)} · {a.screen}</span><span className="text-xs text-text-muted">{fmtTime(a.at)}</span></div>
                    <div className="text-sm">{a.reason}</div>
                    <KV k="회원 · 폰" v={`${memberName(members, a.memberId)} · ${phoneName(a.deviceId)}`} />
                </div>
            )} /></Card>
            <Card title="배차망 화면 새 글자 — 사전에 없는 낱말 (배차망 앱이 바뀐 신호)"><Table rows={words} columns={wcols} rowKey={w => `${w.targetApp}-${w.page}-${w.word}`} empty={empty} card={w => (
                <div className="flex justify-between gap-2"><span><b>{w.word}</b> <span className="text-text-muted">· {app(w.targetApp)} · {w.page} · {WORD_KIND_LABEL[w.kind]}</span></span><span className="text-xs text-text-muted">{fmtTime(w.firstSeenAt)}</span></div>
            )} /></Card>
        </>
    );
}
