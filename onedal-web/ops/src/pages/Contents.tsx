import { useState } from 'react';
import type { OpsContentKind } from '@onedal/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '../api/ops';
import { Card, PageHeader, fmtTime, useTick } from '../ui';

/** 📝 페이지 글 — 약관 · 처리방침 · 위치정보 약관 · 가입 · 설치 · 탈퇴 안내. 글마다 판 번호 — 약관이 바뀌면 회원에게 다시 동의받는다 (기사님이 채우는 자리) */
export default function Contents() {
    useTick();
    const list = api.contents();
    const [kind, setKind] = useState<OpsContentKind>('joinGuide');
    const cur = list.find(c => c.kind === kind)!;
    const [title, setTitle] = useState(cur.title);
    const [body, setBody] = useState(cur.body);
    const pick = (k: OpsContentKind) => { setKind(k); const c = list.find(x => x.kind === k)!; setTitle(c.title); setBody(c.body); };
    const dirty = title !== cur.title || body !== cur.body;
    const needsReconsent = kind === 'terms' || kind === 'privacy' || kind === 'location';

    return (
        <>
            <PageHeader title="페이지 글" sub="기사가 보는 글 — 비어 있어도 화면은 돌고, 채우면 그 자리에 뜹니다" />
            <div className="grid md:grid-cols-[14rem_1fr] gap-4">
                <Card title="글">
                    {list.map(c => (
                        <button key={c.kind} type="button" onClick={() => pick(c.kind)} className={`w-full text-left rounded-lg px-3 py-2 text-sm ${c.kind === kind ? 'bg-info/15 text-info font-bold' : 'hover:bg-surface-alt'}`}>
                            <div>{c.title}</div>
                            <div className="text-xs text-text-muted">{c.version ? `v${c.version} · ${fmtTime(c.updatedAt)}` : '비어 있음'}</div>
                        </button>
                    ))}
                </Card>
                <Card title={`${cur.title} — ${cur.version ? `지금 v${cur.version}` : '아직 글이 없습니다'}`}>
                    <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="제목" />
                    <textarea value={body} onChange={e => setBody(e.target.value)} rows={14} placeholder="여기에 글을 적습니다. 글자로만 그려집니다(HTML 안 됨)." className="w-full rounded-lg border border-border-card bg-bg-base px-3 py-2 text-sm leading-relaxed" />
                    {needsReconsent && <p className="text-xs text-warning">⚠️ 약관 글을 새 판으로 올리면 회원이 다음 로그인 때 다시 동의합니다.</p>}
                    <div className="flex gap-2">
                        <Button type="button" disabled={!dirty} onClick={() => api.saveContent(kind, title, body)}>새 판으로 저장 (v{cur.version + 1})</Button>
                        <Button type="button" variant="outline" disabled={!dirty} onClick={() => pick(kind)}>되돌리기</Button>
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
