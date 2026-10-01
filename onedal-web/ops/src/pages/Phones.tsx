import { deviceLabel, type OpsPhone } from '@onedal/shared';
import { api, useOps } from '../api/ops';
import { ErrorBand, KV, PageHeader, Stat, StatRow, Table, fmtTime, memberName, type Column } from '../ui';

/** 📱 모든 폰 — 연결 · 끊긴 까닭 · 마지막 연락 · 앱 버전 · 모드 · 위치 보냄. 모드를 바꾸는 손잡이는 기사 관제웹에 있다(운영센터는 읽기만). 배차망 폰만 — 관제앱 폰은 서버가 세지 않는다 */
export default function Phones() {
    const { data, error, reload } = useOps(() => Promise.all([api.members(), api.phones()]), []);
    const [members, phones] = data ?? [[], []];
    const modeKo = (p: OpsPhone) => p.mode === 'AUTO' ? '자동' : p.mode === 'ALARM' ? '알람' : '대기';
    const columns: Column<OpsPhone>[] = [
        { key: 'st', label: '연결', render: p => <span className={p.status === 'ONLINE' ? 'text-success font-bold' : 'text-danger font-bold'}>{p.status === 'ONLINE' ? '● 연결' : '● 끊김'}</span> },
        { key: 'name', label: '폰', render: p => <b>{deviceLabel(p)}</b> },
        { key: 'member', label: '회원', render: p => memberName(members, p.memberId) },
        { key: 'reason', label: '끊긴 까닭', render: p => p.offlineReason ?? <span className="text-text-muted">—</span> },
        { key: 'seen', label: '마지막 연락', render: p => fmtTime(p.lastSeenAt) },
        { key: 'ver', label: '앱', render: p => p.appVersion ? `v${p.appVersion}` : '—' },
        { key: 'mode', label: '모드', render: p => <span className={p.mode === 'AUTO' ? 'text-info font-bold' : ''}>{modeKo(p)}</span> },
        { key: 'loc', label: '위치', render: p => p.locationOn ? '보냄' : <span className="text-text-muted">안 보냄</span> },
        { key: 'id', label: '기기 id', render: p => <span className="text-xs text-text-muted" title={p.deviceId}>…{p.deviceId.slice(-4)}</span> },
    ];
    return (
        <>
            <PageHeader title="폰" sub="배차망 폰만 보입니다 — 관제앱(운전석 폰)은 서버가 세지 않습니다" />
            {error && <ErrorBand text={error} onRetry={reload} />}
            <StatRow>
                <Stat label="연결" value={phones.filter(p => p.status === 'ONLINE').length} tone="ok" />
                <Stat label="끊김" value={phones.filter(p => p.status === 'OFFLINE').length} tone={phones.some(p => p.status === 'OFFLINE') ? 'bad' : undefined} />
                <Stat label="자동 모드" value={phones.filter(p => p.mode === 'AUTO').length} hint="자동 잡기가 켜진 폰" />
                <Stat label="위치 보냄" value={phones.filter(p => p.locationOn).length} />
            </StatRow>
            <Table rows={phones} columns={columns} rowKey={p => p.deviceId} empty={data ? '연결한 폰이 없습니다' : '읽는 중…'} card={p => (
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2"><span className="font-bold">{deviceLabel(p)}</span><span className={p.status === 'ONLINE' ? 'text-success font-bold text-xs' : 'text-danger font-bold text-xs'}>{p.status === 'ONLINE' ? '● 연결' : '● 끊김'}</span></div>
                    <KV k="회원" v={memberName(members, p.memberId)} />
                    <KV k="마지막 연락 · 앱" v={`${fmtTime(p.lastSeenAt)} · ${p.appVersion ? `v${p.appVersion}` : '—'}`} />
                    <KV k="모드 · 위치" v={`${modeKo(p)} · ${p.locationOn ? '보냄' : '안 보냄'}`} />
                    {p.offlineReason && <KV k="끊긴 까닭" v={<span className="text-danger">{p.offlineReason}</span>} />}
                </div>
            )} />
        </>
    );
}
