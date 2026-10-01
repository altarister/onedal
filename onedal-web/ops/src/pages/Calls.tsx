import { useCallback, useEffect, useState } from 'react';
import { CALL_NOTE_MEMO_MAX, CARGO_UNITS, CARGO_UNIT_QUANTITY_INPUT, TARGET_APP_LABEL, type CargoUnit, type OpsCall, type OpsCallNoteWrite } from '@onedal/shared';
import { Button } from '@onedal/ui/button';
import { Input } from '@onedal/ui/input';
import { api, useOps, write } from '../api/ops';
import { useCallsChanged, useSignalConnected } from '../api/socket';
import { baseDayLabel, baseDayOf, promisedAtOf } from '../api/callNote';
import { COLOR_DOT, Card, ErrorBand, PageHeader, Stat, StatRow, dayKey, fmtTime, fmtWon, memberName, statusKo, todayKey } from '../ui';

/**
 * 📞 **통화 도우미** — 서버가 «통화 필요»(🟡 이고 상차 통화 전)인 콜을 위에 놓는다. 관리자가 상차지 · 하차지에 전화해 결과를 적으면
 *    서버가 그 콜의 통화 단계 행에 적는다(기사 소켓과 같은 길 · reviews/29 5단계) — 기사 관제웹의 통화 단계에 같은 값 + «✍️ 누가 적음»이 보인다.
 *    적는 칸은 기사가 쓰는 «통화함»과 같은 구조 값(짐 단위 · 수량 · 약속 시각 · 메모). «상대가 취소했다고 함»은 사실 칸(체크) — 기사 관제웹 통화 단계 맨 위에 경고 줄로 뜬다. 손댔을 때만 실어 보낸다(안 건드리면 서버가 그대로 둔다 — 약속만 고쳐 적다가 조용히 지워지지 않게).
 *    🔴 CANCEL 결재는 기사가 관제웹에서 누른다 — 여기엔 그 버튼이 없다. 서버 신호(`ops-calls-changed`)가 오면 바로 다시 읽고, 신호가 끊겼을 때만 30초마다.
 */
export default function Calls() {
    const [who, setWho] = useState<string>('all');
    const { data, error, reload } = useOps(() => Promise.all([api.members(), api.calls(who === 'all' ? undefined : who)]), [who]);
    // 🔔 서버 신호(콜 · 판정 · 통화 결과가 바뀜)가 오면 보고 있는 기사 것만 다시 읽는다 — 자료는 소켓으로 안 온다
    const onSignal = useCallback(({ memberId }: { memberId: string }) => { if (who === 'all' || !memberId || memberId === who) reload(); }, [who, reload]);
    useCallsChanged(onSignal);
    // 신호가 끊겼을 때만 30초마다 — 물러설 자리
    const connected = useSignalConnected();
    useEffect(() => { if (connected) return; const t = setInterval(reload, 30_000); return () => clearInterval(t); }, [connected, reload]);
    const [members, calls] = data ?? [[], []];
    const todo = calls.filter(c => c.needsCall);
    const rest = calls.filter(c => !c.needsCall);
    const today = todayKey();

    return (
        <>
            <PageHeader title="통화 도우미" sub="전화할 콜이 맨 위 — 결과를 적으면 기사 관제웹의 통화 단계에 들어갑니다" right={
                <select value={who} onChange={e => setWho(e.target.value)} className="rounded-lg border border-border-card bg-surface px-3 py-1.5 text-sm">
                    <option value="all">모든 기사</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
            } />
            {error && <ErrorBand text={error} onRetry={reload} />}
            <StatRow>
                <Stat label="전화할 콜" value={todo.length} tone={todo.length ? 'warn' : 'ok'} />
                <Stat label="오늘 적은 결과" value={calls.filter(c => c.callNote && dayKey(c.callNote.writtenAt) === today).length} />
                <Stat label="진행 중" value={calls.length} hint="KEEP 한 · 끝나지 않은 콜" />
            </StatRow>
            {todo.length === 0 && <Card><p className="text-sm text-text-muted text-center py-4">{data ? '지금 전화할 콜이 없습니다' : '읽는 중…'}</p></Card>}
            {todo.map(c => <CallCard key={c.id} c={c} name={memberName(members, c.memberId)} reload={reload} />)}
            {rest.length > 0 && (
                <Card title="적은 것 · 끝난 것">
                    {rest.map(c => (
                        <div key={c.id} className="text-sm border-t border-border-card first:border-t-0 pt-2 first:pt-0">
                            <div className="flex justify-between gap-2">
                                <span>{COLOR_DOT[c.verdict]} <b>{memberName(members, c.memberId)}</b> · {TARGET_APP_LABEL[c.targetApp]} · {c.pickup.place} → {c.dropoff.place}</span>
                                <span className="text-text-muted shrink-0">{fmtWon(c.fare)} · {statusKo(c.status)}</span>
                            </div>
                            {c.callNote && <div className="text-xs text-text-muted mt-0.5">{noteText(c.callNote)}</div>}
                            <CancelToggle c={c} reload={reload} />
                        </div>
                    ))}
                </Card>
            )}
        </>
    );
}

/**
 * 📵 **적은 뒤에 온 취소 소식** — 통화 결과를 이미 적은 콜(적는 칸이 없는 아래 목록)에서 «상대가 취소했다고 함»만 켜고 끈다.
 *    그 사실 칸만 실어 보낸다 — 짐 · 약속 · 메모는 비워 보내 서버가 그대로 둔다. 쪽은 적힌 메모의 쪽, 없으면 상차.
 *    🔴 기사 화면의 경고 글을 켜고 끄는 것뿐이다 — 콜 취소(CANCEL)는 기사가 관제웹에서 누른다.
 *    🔴 지우기는 번복용이 아니다 — 상대가 취소했으면 기사도 취소하고 끝이다. «잘못 누름 지우기»만이고 한 번 묻는다.
 */
function CancelToggle({ c, reload }: { c: OpsCall; reload: () => void }) {
    const on = !!c.callNote?.counterpartCancelledAt;
    const send = () => {
        if (on && !window.confirm('잘못 누른 표시를 지웁니다 — 상대가 정말 취소했다면 지우지 마세요')) return;
        const note: OpsCallNoteWrite = { stopType: c.callNote?.stopType ?? 'pickup', unit: null, quantity: null, promisedArrivalAt: null, memo: '', counterpartCancelled: !on };
        void write(() => api.writeCallNote(c.id, note), reload);
    };
    return (
        <button type="button" onClick={send} className={`mt-1 text-xs underline underline-offset-2 ${on ? 'text-text-muted' : 'text-danger'}`}>
            {on ? '잘못 누름 지우기' : '상대가 취소했다고 함 적기'}
        </button>
    );
}

/** 적힌 결과 한 줄 — «📝 상차 · 파레트 2 · 약속 14:30 · 메모 — 와이프 10:12» */
function noteText(n: NonNullable<OpsCall['callNote']>): string {
    const parts = [n.stopType === 'pickup' ? '상차' : '하차'];
    if (n.counterpartCancelledAt) parts.unshift(`⚠️ 상대가 취소했다고 함(${n.counterpartCancelledBy ?? ''} ${fmtTime(n.counterpartCancelledAt)})`);
    if (n.unit) parts.push(`${n.unit}${n.quantity != null ? ` ${n.quantity}` : ''}`);
    if (n.promisedArrivalAt) parts.push(`약속 ${fmtTime(n.promisedArrivalAt)}`);
    if (n.memo) parts.push(n.memo);
    return `📝 ${parts.join(' · ')} — ${n.writtenBy} ${fmtTime(n.writtenAt)}`;
}

function CallCard({ c, name, reload }: { c: OpsCall; name: string; reload: () => void }) {
    const [stopType, setStopType] = useState<'pickup' | 'dropoff'>('pickup');
    const [unit, setUnit] = useState<CargoUnit | null>(null);
    const [quantity, setQuantity] = useState<number | null>(null);
    const [hhmm, setHhmm] = useState('');
    const [memo, setMemo] = useState('');
    /** 📵 상대 취소 체크 — null = 안 건드림(서버가 그대로 둔다) · true/false = 관리자가 누른 값 */
    const [cancelTouched, setCancelTouched] = useState<boolean | null>(null);
    const pickup = stopType === 'pickup';
    const stopAt = pickup ? c.pickup.at : c.dropoff.at;
    const baseDay = baseDayOf(stopAt);
    const cancelKnown = c.callNote?.stopType === stopType && !!c.callNote.counterpartCancelledAt;   // 서버에 적혀 있는 것(이 정거장 쪽)
    const cancelShown = cancelTouched ?? cancelKnown;
    const qInput = unit ? CARGO_UNIT_QUANTITY_INPUT[unit] : null;
    const pickUnit = (u: CargoUnit) => { setUnit(u); setQuantity(null); };
    const save = () => {
        const note: OpsCallNoteWrite = {
            stopType,
            unit: pickup ? unit : null, quantity: pickup && qInput?.mode !== 'none' && quantity != null ? Math.round(quantity) : null,   // 짐은 상차에서만 — 하차로 보내면 두 벌이 된다 · 수량은 정수
            promisedArrivalAt: promisedAtOf(stopAt, hhmm), memo: memo.trim(),
            ...(cancelTouched != null ? { counterpartCancelled: cancelTouched } : {}),
        };
        void write(() => api.writeCallNote(c.id, note), () => { setUnit(null); setQuantity(null); setHhmm(''); setMemo(''); setCancelTouched(null); reload(); });
    };
    const tel = (p: string | null) => p ? <a href={`tel:${p.replace(/[^\d]/g, '')}`} className="text-info font-bold underline-offset-2 hover:underline">📞 {p}</a> : <span className="text-text-muted">번호 없음</span>;
    const chipCls = (on: boolean) => `px-2.5 py-1.5 rounded-md text-sm font-bold border ${on ? 'bg-info/15 text-info border-info/40' : 'bg-surface-alt/40 border-border-card text-text-muted'}`;
    return (
        <Card className="border-warning/40">
            <div className="text-sm space-y-1">
                <div className="text-base font-black">{COLOR_DOT[c.verdict]} {name} · {TARGET_APP_LABEL[c.targetApp]} <span className="text-xs font-normal text-warning">🟡 통화 필요</span></div>
                <div>상차 <b>{c.pickup.place}</b> · {tel(c.pickup.phone)} {c.pickup.at && <span className="text-text-muted">· 예정 {fmtTime(c.pickup.at)}</span>}</div>
                <div>하차 <b>{c.dropoff.place}</b> · {tel(c.dropoff.phone)} {c.dropoff.at && <span className="text-text-muted">· 예정 {fmtTime(c.dropoff.at)}</span>}</div>
                <div className="text-text-muted">{fmtWon(c.fare)} · KEEP {fmtTime(c.capturedAt)}</div>
                {c.callNote && <div className="text-xs text-text-muted">{noteText(c.callNote)}</div>}
            </div>
            <div className="space-y-2 pt-2 border-t border-border-card">
                <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-xs text-text-muted w-16">어디</span>
                    <button type="button" className={chipCls(pickup)} onClick={() => { setStopType('pickup'); setCancelTouched(null); }}>상차지</button>
                    <button type="button" className={chipCls(!pickup)} onClick={() => { setStopType('dropoff'); setCancelTouched(null); }}>하차지</button>
                </div>
                {pickup && (
                    <div className="flex flex-wrap gap-1.5 items-center">
                        <span className="text-xs text-text-muted w-16">짐 단위</span>
                        {CARGO_UNITS.map(u => <button key={u} type="button" className={chipCls(unit === u)} onClick={() => pickUnit(u)}>{u}</button>)}
                        {qInput?.mode === 'preset' && qInput.options.map(n => <button key={n} type="button" className={chipCls(quantity === n)} onClick={() => setQuantity(n)}>{n}개</button>)}
                        {qInput && qInput.mode !== 'preset' && qInput.mode !== 'none' && (
                            <Input type="number" min={1} step={1} value={quantity ?? ''} onChange={e => setQuantity(e.target.value ? Number(e.target.value) : null)} placeholder="몇 개" className="w-24" />
                        )}
                    </div>
                )}
                <label className="flex flex-wrap items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4" checked={cancelShown} onChange={e => setCancelTouched(e.target.checked)} />
                    <span className={cancelShown ? 'font-bold text-danger' : ''}>상대가 취소했다고 함</span>
                    <span className="text-xs text-text-muted">기사 화면에 경고로 뜹니다 — 취소(CANCEL)는 기사가 누릅니다 · 잘못 눌렀으면 풀고 «적기»</span>
                </label>
                <div className="grid md:grid-cols-[auto_1fr_2fr_auto] gap-2 items-end">
                    <label className="text-xs text-text-muted space-y-1"><span>약속 시각 · {baseDayLabel(baseDay)}</span><Input type="time" value={hhmm} onChange={e => setHhmm(e.target.value)} /></label>
                    <div className="text-xs text-text-muted md:pb-2">{pickup ? '«몇 시까지 갈게요»' : '«몇 시까지 내릴게요»'}</div>
                    <label className="text-xs text-text-muted space-y-1"><span>메모 · {memo.length}/{CALL_NOTE_MEMO_MAX}</span><Input placeholder="통화에서 들은 것" value={memo} maxLength={CALL_NOTE_MEMO_MAX} onChange={e => setMemo(e.target.value)} /></label>
                    <Button type="button" size="sm" disabled={!unit && !hhmm && !memo.trim() && cancelTouched == null} onClick={save}>적기</Button>
                </div>
            </div>
        </Card>
    );
}
