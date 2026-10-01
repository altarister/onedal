import { useState } from 'react';
import type { OpsRelease } from '@onedal/shared';
import { Badge } from '@onedal/ui/badge';
import { Button } from '@onedal/ui/button';
import { Input } from '@onedal/ui/input';
import { api, useOps, write } from '../api/ops';
import { Card, ErrorBand, KV, PageHeader, Table, fmtTime, type Column } from '../ui';

/**
 * 📦 앱 배포 — APK 올리기 · 최신 · 최소 판(서버 `app_releases` · 파일은 EC2 레포 밖 폴더). 기사는 가입 «앱 받기»에서 10분 주소로 받는다.
 *    «최신»은 판 번호가 가장 큰 줄 · «최소»는 앱마다 한 줄 — 둘 다 서버가 정한다. 원달앱은 보고 응답의 최신 · 최소 판 번호를 보고 «업데이트 있음 / 해야 씁니다»를 띄운다 (reviews/29 4단계).
 *    올리기는 본문이 파일 바이트 그대로 — 같은 판은 409 · 상한은 413 · 서버 글이 창에 그대로 뜬다.
 */
const APP_LABEL: Record<OpsRelease['app'], string> = { scanner: '원달앱 (배차망 폰)', dashboard: '관제앱 (운전석 폰)' };

export default function Releases() {
    const { data, error, reload } = useOps(() => api.releases(), []);
    const rows = data ?? [];
    const [app, setApp] = useState<OpsRelease['app']>('scanner');
    const [version, setVersion] = useState('');
    const [code, setCode] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [pct, setPct] = useState<number | null>(null);
    const codeNum = Number(code);
    const canUpload = !!file && !!version.trim() && Number.isInteger(codeNum) && codeNum > 0 && pct === null;
    const upload = () => {
        if (!file) return;
        setPct(0);
        void write(() => api.uploadRelease(file, app, version.trim(), codeNum, setPct), () => { setVersion(''); setCode(''); setFile(null); reload(); }).finally(() => setPct(null));
    };
    const minimum = (r: OpsRelease) => void write(() => api.setMinimum(r.app, r.versionCode), reload);
    const cols: Column<OpsRelease>[] = [
        { key: 'app', label: '앱', render: r => APP_LABEL[r.app] },
        { key: 'v', label: '판', render: r => <span><b>{r.version}</b> <span className="text-xs text-text-muted">code {r.versionCode}</span></span> },
        { key: 'flags', label: '', render: r => <span className="flex gap-1">{r.isLatest && <Badge variant="outline" className="bg-success/15 text-success border-success/30">최신</Badge>}{r.isMinimum && <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30">최소</Badge>}</span> },
        { key: 'file', label: '파일', render: r => <span className="text-xs">{r.fileName}</span> },
        { key: 'sha', label: 'sha256', render: r => <span className="text-xs text-text-muted" title={r.sha256}>{r.sha256.slice(0, 12)}…</span> },
        { key: 'at', label: '올린 때', render: r => fmtTime(r.uploadedAt) },
        { key: 'act', label: '', render: r => !r.isMinimum ? <Button type="button" size="xs" variant="outline" onClick={() => minimum(r)}>최소 판으로</Button> : null },
    ];
    return (
        <>
            <PageHeader title="앱 배포" sub="올리면 «최신»이 되고, «최소»보다 낮은 앱은 «업데이트해야 씁니다»가 뜹니다" />
            {error && <ErrorBand text={error} onRetry={reload} />}
            <Card title="APK 올리기 — 릴리스 서명 키로 개발 PC 에서 서명한 파일만">
                <div className="grid md:grid-cols-[12rem_8rem_6rem_1fr_auto] gap-2 items-center">
                    <select value={app} onChange={e => setApp(e.target.value as OpsRelease['app'])} className="rounded-lg border border-border-card bg-surface px-3 py-2 text-sm">
                        <option value="scanner">원달앱</option><option value="dashboard">관제앱</option>
                    </select>
                    <Input placeholder="판 (2.9.13)" value={version} onChange={e => setVersion(e.target.value)} />
                    <Input placeholder="code" inputMode="numeric" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} />
                    <Input type="file" accept=".apk,application/vnd.android.package-archive" onChange={e => setFile(e.target.files?.[0] ?? null)} className="file:mr-2 file:rounded-md file:border-0 file:bg-surface-alt file:px-2 file:py-1 file:text-xs" />
                    <Button type="button" disabled={!canUpload} onClick={upload}>{pct === null ? '올리기' : `올리는 중 ${pct}%`}</Button>
                </div>
                <p className="text-xs text-text-muted">versionCode 는 원달앱 build.gradle 의 값과 같게 적습니다(릴리스마다 올림). 서명이 바뀌면 덮어 설치가 안 됩니다 — 키는 git 밖 두 곳에.{file ? ` · 고른 파일 ${file.name} (${Math.round(file.size / 1024 / 1024)}MB)` : ''}</p>
            </Card>
            <Table rows={rows} columns={cols} rowKey={r => `${r.app}-${r.versionCode}`} empty={data ? '아직 올린 앱이 없습니다' : '읽는 중…'} card={r => (
                <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2"><span className="font-bold">{APP_LABEL[r.app]} {r.version}</span><span className="flex gap-1">{r.isLatest && <Badge variant="outline" className="bg-success/15 text-success border-success/30">최신</Badge>}{r.isMinimum && <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30">최소</Badge>}</span></div>
                    <KV k="code · 올린 때" v={`${r.versionCode} · ${fmtTime(r.uploadedAt)}`} />
                    <KV k="파일" v={r.fileName} />
                    {!r.isMinimum && <Button type="button" size="xs" variant="outline" onClick={() => minimum(r)}>최소 판으로</Button>}
                </div>
            )} />
        </>
    );
}
