import { useState } from 'react';
import { Button } from '@onedal/ui/button';
import { Input } from '@onedal/ui/input';
import { api } from '../api/ops';
import { Card, PageHeader, fmtTime, useTick } from '../ui';

/** 📢 공지 — 기사 관제웹 상단에 한 줄로 뜬다 · 글자로만(HTML 안 됨) */
export default function Notices() {
    useTick();
    const [text, setText] = useState('');
    const [until, setUntil] = useState('');
    const list = api.notices();
    return (
        <>
            <PageHeader title="공지" sub="기사 관제웹 상단에 한 줄로 — 운전 중에 읽히게 짧게" />
            <Card title="새 공지">
                <div className="grid md:grid-cols-[1fr_10rem_auto] gap-2">
                    <Input value={text} onChange={e => setText(e.target.value)} placeholder="예: 내일 새벽 2~3시 서버 점검" maxLength={80} />
                    <Input type="date" value={until} onChange={e => setUntil(e.target.value)} />
                    <Button type="button" disabled={!text.trim()} onClick={() => { api.postNotice(text.trim(), until || null); setText(''); setUntil(''); }}>올리기</Button>
                </div>
                <p className="text-xs text-text-muted">{text.length}/80 · 날짜를 비우면 내릴 때까지 뜹니다</p>
            </Card>
            <Card title="올린 공지">
                {list.length === 0 && <p className="text-sm text-text-muted">없습니다</p>}
                {list.map(n => (
                    <div key={n.id} className="flex items-start justify-between gap-3 text-sm border-t border-border-card first:border-t-0 pt-2 first:pt-0">
                        <div>
                            <div className="font-semibold">{n.text}</div>
                            <div className="text-xs text-text-muted">{fmtTime(n.postedAt)} 올림 · {n.activeUntil ? `${n.activeUntil} 까지` : '내릴 때까지'}</div>
                        </div>
                        <Button type="button" size="xs" variant="outline" onClick={() => api.removeNotice(n.id)}>내리기</Button>
                    </div>
                ))}
            </Card>
            <Card title="기사 화면에서 이렇게 보입니다">
                <div className="rounded-xl bg-info/10 border border-info/30 px-3 py-2 text-sm">📢 {list[0]?.text ?? '(공지 없음)'}</div>
            </Card>
        </>
    );
}
