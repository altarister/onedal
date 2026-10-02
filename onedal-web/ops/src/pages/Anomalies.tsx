import { TARGET_APP_LABEL, WORD_KIND_LABEL, collectCountOf, collectListOf, deviceLabel, type CollectRow, type OpsAnomaly, type OpsScreenWord, type TargetAppType } from '@onedal/shared';
import { api, useOps } from '../api/ops';
import { Card, ErrorBand, KV, Table, fmtTime, memberName, type Column } from '../ui';

/** ⚠️ («점검» 쪽의 칸) 앱 이상 기록 · 배차망 화면 새 글자 · 배차망 화면 모을 것 — 배차망 앱이 바뀌면 모든 회원이 함께 멈춘다. 글자 갈래 이름표는 shared `WORD_KIND_LABEL` 한 벌 · 모을 것은 shared `collectListOf`(배차망 정의 표에서 뽑음) */
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
    const collect = collectListOf();
    const collectCounts = collectCountOf(collect);
    const ccols: Column<CollectRow>[] = [
        { key: 'app', label: '배차망', render: c => app(c.network) },
        { key: 'page', label: '페이지', render: c => c.page },
        { key: 'over', label: '그 위에 뜨는 것', render: c => c.overlay ?? '—' },
        { key: 'what', label: '무엇을 모으나', render: c => c.what },
        { key: 'open', label: '어디서 여나', render: c => c.openAt },
    ];
    return (
        <>
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
            <Card title="배차망 화면 — 모을 것 (캡처를 붙여 표에 한 줄 · 0 이 되면 그 배차망을 다 안다)">
                <div className="text-sm">{(Object.keys(collectCounts) as TargetAppType[]).map(n => `${app(n)} ${collectCounts[n]}`).join(' · ')}</div>
                <Table rows={collect} columns={ccols} rowKey={c => `${c.network}-${c.page}-${c.overlay ?? ''}`} empty="없습니다 — 모든 페이지 · 팝업을 안다" card={c => (
                    <div className="space-y-1">
                        <div className="font-bold">{app(c.network)} · {c.page}{c.overlay ? ` › ${c.overlay}` : ''}</div>
                        <KV k="모을 것" v={c.what} />
                        <KV k="어디서" v={c.openAt} />
                    </div>
                )} />
            </Card>
        </>
    );
}
