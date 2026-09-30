import { useState } from 'react';
import type { OpsRelease } from '@onedal/shared';
import { Badge } from '@onedal/ui/badge';
import { Button } from '@onedal/ui/button';
import { Input } from '@onedal/ui/input';
import { api } from '../api/ops';
import { Card, PageHeader, Table, fmtTime, useTick, type Column } from '../ui';

/**
 * 📦 앱 배포 — APK 올리기 · 최신 · 최소 판. 파일은 서버(EC2 레포 밖 폴더)에 두고 기사는 가입 페이지 «앱 받기»에서 받는다.
 *    앱은 서버 응답의 최신 · 최소 versionCode 를 보고 «업데이트 있음 / 해야 씁니다»를 띄운다 (reviews/29 4단계).
 */
const APP_LABEL: Record<OpsRelease['app'], string> = { scanner: '원달앱 (배차망 폰)', dashboard: '관제앱 (운전석 폰)' };

export default function Releases() {
    useTick();
    const [app, setApp] = useState<OpsRelease['app']>('scanner');
    const [version, setVersion] = useState('');
    const [code, setCode] = useState('');
    const [file, setFile] = useState('');
    const rows = api.releases();
    const cols: Column<OpsRelease>[] = [
        { key: 'app', label: '앱', render: r => APP_LABEL[r.app] },
        { key: 'v', label: '판', render: r => <span><b>{r.version}</b> <span className="text-xs text-text-muted">code {r.versionCode}</span></span> },
        { key: 'flags', label: '', render: r => <span className="flex gap-1">{r.isLatest && <Badge variant="outline" className="bg-success/15 text-success border-success/30">최신</Badge>}{r.isMinimum && <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30">최소</Badge>}</span> },
        { key: 'file', label: '파일', render: r => <span className="text-xs">{r.fileName}</span> },
        { key: 'sha', label: 'sha256', render: r => <span className="text-xs text-text-muted">{r.sha256}</span> },
        { key: 'at', label: '올린 때', render: r => fmtTime(r.uploadedAt) },
        { key: 'act', label: '', render: r => !r.isMinimum ? <Button type="button" size="xs" variant="outline" onClick={() => api.setMinimum(r.app, r.versionCode)}>최소 판으로</Button> : null },
    ];
    return (
        <>
            <PageHeader title="앱 배포" sub="올리면 «최신»이 되고, «최소»보다 낮은 앱은 «업데이트해야 씁니다»가 뜹니다" />
            <Card title="APK 올리기 — 릴리스 서명 키로 개발 PC 에서 서명한 파일만">
                <div className="grid md:grid-cols-[12rem_8rem_6rem_1fr_auto] gap-2">
                    <select value={app} onChange={e => setApp(e.target.value as OpsRelease['app'])} className="rounded-lg border border-border-card bg-surface px-3 py-2 text-sm">
                        <option value="scanner">원달앱</option><option value="dashboard">관제앱</option>
                    </select>
                    <Input placeholder="판 (2.9.13)" value={version} onChange={e => setVersion(e.target.value)} />
                    <Input placeholder="code" inputMode="numeric" value={code} onChange={e => setCode(e.target.value)} />
                    <Input placeholder="파일 이름 (.apk) — 목업: 실제 업로드 칸은 서버와 함께" value={file} onChange={e => setFile(e.target.value)} />
                    <Button type="button" disabled={!version || !code || !file} onClick={() => { api.uploadRelease(app, version, Number(code), file); setVersion(''); setCode(''); setFile(''); }}>올리기</Button>
                </div>
                <p className="text-xs text-text-muted">versionCode 는 릴리스마다 올립니다. 서명이 바뀌면 덮어 설치가 안 됩니다 — 키는 git 밖 두 곳에.</p>
            </Card>
            <Table rows={rows} columns={cols} rowKey={r => `${r.app}-${r.versionCode}`} />
        </>
    );
}
