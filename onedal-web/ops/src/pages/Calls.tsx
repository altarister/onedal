import { useState } from 'react';
import { TARGET_APP_LABEL, type OpsCall } from '@onedal/shared';
import { Button } from '@onedal/ui/button';
import { Checkbox } from '@onedal/ui/checkbox';
import { Input } from '@onedal/ui/input';
import { api } from '../api/ops';
import { COLOR_DOT, Card, PageHeader, Stat, StatRow, dayKey, fmtTime, fmtWon, memberName, statusKo, todayKey, useTick } from '../ui';

/**
 * 📞 **통화 도우미** — 기사가 KEEP 했거나 판정이 «통화 필요»인 콜이 맨 위. 관리자가 상차지 · 하차지에 전화해 결과를 적는다 (reviews/29 5단계).
 *    적는 칸은 기사가 쓰는 «통화함»과 같다 + 누가 적었나. 🔴 «상대가 취소함»은 정보다 — CANCEL 결재는 기사가 관제웹에서 누른다.
 */
export default function Calls() {
    useTick();
    const members = api.members();
    const [who, setWho] = useState<string>('all');
    const all = api.calls().filter(c => who === 'all' || c.memberId === who);
    const todo = all.filter(c => c.needsCall);
    const rest = all.filter(c => !c.needsCall);

    return (
        <>
            <PageHeader title="통화 도우미" sub="전화할 콜이 맨 위 — 결과를 적으면 기사 판정에 들어갑니다" right={
                <select value={who} onChange={e => setWho(e.target.value)} className="rounded-lg border border-border-card bg-surface px-3 py-1.5 text-sm">
                    <option value="all">모든 기사</option>
                    {members.filter(m => m.role !== 'ADMIN').map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
            } />
            <StatRow>
                <Stat label="전화할 콜" value={todo.length} tone={todo.length ? 'warn' : 'ok'} />
                <Stat label="오늘 적은 결과" value={all.filter(c => c.callNote && dayKey(c.callNote.writtenAt) === todayKey()).length} />
                <Stat label="진행 중" value={all.filter(c => c.status === 'ORDER_CONFIRMED').length} />
                <Stat label="상대 취소" value={all.filter(c => c.callNote?.counterpartCancelled).length} tone="bad" />
            </StatRow>
            {todo.length === 0 && <Card><p className="text-sm text-text-muted text-center py-4">지금 전화할 콜이 없습니다</p></Card>}
            {todo.map(c => <CallCard key={c.id} c={c} name={memberName(members, c.memberId)} />)}
            {rest.length > 0 && (
                <Card title="적은 것 · 끝난 것">
                    {rest.map(c => (
                        <div key={c.id} className="text-sm border-t border-border-card first:border-t-0 pt-2 first:pt-0">
                            <div className="flex justify-between gap-2">
                                <span>{COLOR_DOT[c.verdict]} <b>{memberName(members, c.memberId)}</b> · {TARGET_APP_LABEL[c.targetApp]} · {c.pickup.place} → {c.dropoff.place}</span>
                                <span className="text-text-muted shrink-0">{fmtWon(c.fare)} · {statusKo(c.status)}</span>
                            </div>
                            {c.callNote && (
                                <div className="text-xs text-text-muted mt-0.5">
                                    📝 {c.callNote.cargoSize}{c.callNote.pickupReadyAt ? ` · 상차 가능 ${fmtTime(c.callNote.pickupReadyAt)}` : ''}{c.callNote.counterpartCancelled ? ' · ⚠️ 상대가 취소함' : ''}{c.callNote.memo ? ` · ${c.callNote.memo}` : ''}
                                    <span className="ml-2">— {c.callNote.writtenBy} {fmtTime(c.callNote.writtenAt)}</span>
                                </div>
                            )}
                        </div>
                    ))}
                </Card>
            )}
        </>
    );
}

function CallCard({ c, name }: { c: OpsCall; name: string }) {
    const [cargoSize, setCargoSize] = useState('');
    const [ready, setReady] = useState('');
    const [cancelled, setCancelled] = useState(false);
    const [memo, setMemo] = useState('');
    const save = () => {
        // 상차 가능 시각 — 오늘(한국 날)의 그 시각. toISOString 의 날짜(UTC)를 쓰면 새벽에 전날이 된다
        const at = ready ? (() => { const [h, mi] = ready.split(':').map(Number); const t = new Date(); t.setHours(h, mi, 0, 0); return t.toISOString(); })() : null;
        api.writeCallNote(c.id, { cargoSize: cargoSize || '(안 물음)', pickupReadyAt: at, counterpartCancelled: cancelled, memo });
    };
    const tel = (p: string | null) => p ? <a href={`tel:${p.replace(/[^\d]/g, '')}`} className="text-info font-bold underline-offset-2 hover:underline">📞 {p}</a> : <span className="text-text-muted">번호 없음</span>;
    return (
        <Card className="border-warning/40">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="text-sm space-y-1">
                    <div className="text-base font-black">{COLOR_DOT[c.verdict]} {name} · {TARGET_APP_LABEL[c.targetApp]} <span className="text-xs font-normal text-warning">🟡 통화 필요</span></div>
                    <div>상차 <b>{c.pickup.place}</b> · {c.pickup.address} · {tel(c.pickup.phone)} {c.pickup.at && <span className="text-text-muted">· {fmtTime(c.pickup.at)}</span>}</div>
                    <div>하차 <b>{c.dropoff.place}</b> · {c.dropoff.address} · {tel(c.dropoff.phone)}</div>
                    <div className="text-text-muted">{fmtWon(c.fare)} · KEEP {fmtTime(c.capturedAt)}</div>
                </div>
            </div>
            <div className="grid md:grid-cols-4 gap-2 pt-2 border-t border-border-card">
                <label className="text-xs text-text-muted space-y-1"><span>짐 크기</span><Input placeholder="예: 박스 3 · 팔레트 1" value={cargoSize} onChange={e => setCargoSize(e.target.value)} /></label>
                <label className="text-xs text-text-muted space-y-1"><span>상차 가능 시각</span><Input type="time" value={ready} onChange={e => setReady(e.target.value)} /></label>
                <label className="text-xs text-text-muted space-y-1"><span>메모</span><Input placeholder="뒷문 · 지게차 없음 …" value={memo} onChange={e => setMemo(e.target.value)} /></label>
                <div className="flex items-end gap-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer"><Checkbox checked={cancelled} onCheckedChange={v => setCancelled(v === true)} /> 상대가 취소함 <span className="text-xs text-text-muted">(정보 — 결재는 기사)</span></label>
                    <Button type="button" size="sm" onClick={save}>적기</Button>
                </div>
            </div>
        </Card>
    );
}
