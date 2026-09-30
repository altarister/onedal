import type { OpsPhone } from '@onedal/shared';
import { api } from '../api/ops';
import { PageHeader, Stat, Table, fmtTime, memberName, useTick, type Column } from '../ui';

/** 📱 모든 폰 — 연결 · 끊긴 까닭 · 마지막 연락 · 앱 버전 · 모드 · 위치 보냄. 모드를 바꾸는 손잡이는 기사 관제웹에 있다(운영센터는 읽기만) */
export default function Phones() {
    useTick();
    const members = api.members();
    const phones = api.phones();
    const latest = Object.fromEntries(api.releases().filter(r => r.isLatest).map(r => [r.app, r.version]));
    const columns: Column<OpsPhone>[] = [
        { key: 'st', label: '연결', render: p => <span className={p.status === 'ONLINE' ? 'text-success font-bold' : 'text-danger font-bold'}>{p.status === 'ONLINE' ? '● 연결' : '● 끊김'}</span> },
        { key: 'name', label: '폰', render: p => <b>{p.deviceName}</b> },
        { key: 'member', label: '회원', render: p => memberName(members, p.memberId) },
        { key: 'reason', label: '끊긴 까닭', render: p => p.offlineReason ?? <span className="text-text-muted">—</span> },
        { key: 'seen', label: '마지막 연락', render: p => fmtTime(p.lastSeenAt) },
        { key: 'ver', label: '앱', render: p => { const isScanner = p.deviceName.includes('배차망'); const l = latest[isScanner ? 'scanner' : 'dashboard']; return <span>v{p.appVersion}{l && l !== p.appVersion && <span className="ml-1 text-xs text-warning">↑ {l}</span>}</span>; } },
        { key: 'mode', label: '모드', render: p => <span className={p.mode === 'AUTO' ? 'text-info font-bold' : ''}>{p.mode === 'AUTO' ? '자동' : p.mode === 'ALARM' ? '알람' : '대기'}</span> },
        { key: 'loc', label: '위치', render: p => p.locationOn ? '보냄' : <span className="text-text-muted">안 보냄</span> },
        { key: 'id', label: '기기 id', render: p => <span className="text-xs text-text-muted">{p.deviceId}</span> },
    ];
    return (
        <>
            <PageHeader title="폰" sub="연결 상태 · 앱 버전 · 모드 — 회원마다 배차망 폰 · 운전석 폰 두 대" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label="연결" value={phones.filter(p => p.status === 'ONLINE').length} tone="ok" />
                <Stat label="끊김" value={phones.filter(p => p.status === 'OFFLINE').length} tone={phones.some(p => p.status === 'OFFLINE') ? 'bad' : undefined} />
                <Stat label="옛 판" value={phones.filter(p => { const l = latest[p.deviceName.includes('배차망') ? 'scanner' : 'dashboard']; return l && l !== p.appVersion; }).length} tone="warn" hint="최신이 아닌 앱" />
                <Stat label="위치 보냄" value={phones.filter(p => p.locationOn).length} />
            </div>
            <Table rows={phones} columns={columns} rowKey={p => p.deviceId} />
        </>
    );
}
