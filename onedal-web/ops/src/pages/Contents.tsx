import { useState } from 'react';
import { CONSENT_KINDS, type OpsContentKind } from '@onedal/shared';
import { Button } from '@onedal/ui/button';
import { Input } from '@onedal/ui/input';
import { api, useOps, write } from '../api/ops';
import { Card, ErrorBand, PageHeader, fmtTime } from '../ui';

/** 📝 페이지 글 — 약관 · 처리방침 · 위치정보 약관 · 가입 · 설치 · 탈퇴 안내. 글마다 판 번호 — 약관이 바뀌면 회원에게 다시 동의받는다 (기사님이 채우는 자리). 서버는 저장마다 새 판 한 줄 */
const KIND_TITLE: Record<OpsContentKind, string> = { terms: '이용약관', privacy: '개인정보 처리방침', location: '위치정보 약관', joinGuide: '가입 안내', installGuide: '설치 안내', withdrawGuide: '탈퇴 안내' };

export default function Contents() {
    const { data, error, reload } = useOps(() => api.contents(), []);
    const list = data ?? [];
    const [kind, setKind] = useState<OpsContentKind>('joinGuide');
    const [edit, setEdit] = useState<{ title: string; body: string } | null>(null);   // 손대기 전엔 null — 서버 글이 그대로 보인다
    const cur = list.find(c => c.kind === kind);
    const title = edit?.title ?? cur?.title ?? '';
    const body = edit?.body ?? cur?.body ?? '';
    const pick = (k: OpsContentKind) => { setKind(k); setEdit(null); };
    const dirty = !!edit && (edit.title !== (cur?.title ?? '') || edit.body !== (cur?.body ?? ''));
    const needsReconsent = (CONSENT_KINDS as readonly string[]).includes(kind);   // 다시 동의받는 글 — 규격 한 곳
    const nameOf = (k: OpsContentKind, t: string) => t || KIND_TITLE[k];

    return (
        <>
            <PageHeader title="페이지 글" sub="기사가 보는 글 — 비어 있어도 화면은 돌고, 채우면 그 자리에 뜹니다" />
            {error && <ErrorBand text={error} onRetry={reload} />}
            <div className="grid md:grid-cols-[14rem_1fr] gap-4">
                <Card title="글">
                    {list.map(c => (
                        <button key={c.kind} type="button" onClick={() => pick(c.kind)} className={`w-full text-left rounded-lg px-3 py-2 text-sm ${c.kind === kind ? 'bg-info/15 text-info font-bold' : 'hover:bg-surface-alt'}`}>
                            <div>{nameOf(c.kind, c.title)}</div>
                            <div className="text-xs text-text-muted">{c.version ? `${c.version}판 · ${fmtTime(c.updatedAt)}` : '비어 있음'}</div>
                        </button>
                    ))}
                    {!data && !error && <p className="text-sm text-text-muted">읽는 중…</p>}
                </Card>
                <Card title={`${nameOf(kind, cur?.title ?? '')} — ${cur?.version ? `지금 ${cur.version}판` : '아직 글이 없습니다'}`}>
                    <Input value={title} onChange={e => setEdit({ title: e.target.value, body })} placeholder="제목" />
                    <textarea value={body} onChange={e => setEdit({ title, body: e.target.value })} rows={14} placeholder="여기에 글을 적습니다. 글자로만 그려집니다(HTML 안 됨)." className="w-full rounded-lg border border-border-card bg-bg-base px-3 py-2 text-sm leading-relaxed" />
                    {needsReconsent && <p className="text-xs text-warning">⚠️ 약관 글을 새 판으로 올리면 회원이 다음 로그인 때 다시 동의합니다.</p>}
                    <div className="flex gap-2">
                        <Button type="button" disabled={!dirty} onClick={() => void write(() => api.saveContent(kind, title, body), () => { setEdit(null); reload(); })}>새 판으로 저장 ({(cur?.version ?? 0) + 1}판)</Button>
                        <Button type="button" variant="outline" disabled={!dirty} onClick={() => setEdit(null)}>되돌리기</Button>
                    </div>
                    <div className="pt-3 border-t border-border-card">
                        <div className="text-xs font-bold text-text-muted mb-1">기사 화면에서 이렇게 보입니다</div>
                        <article className="rounded-xl border border-border-card bg-bg-base p-4 text-sm whitespace-pre-wrap">
                            {body ? body : <span className="text-text-muted">(글 자리 — 운영센터 «페이지 글»에서 적습니다)</span>}
                        </article>
                    </div>
                </Card>
            </div>
        </>
    );
}
