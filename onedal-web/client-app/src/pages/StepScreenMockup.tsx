import { useMemo, useState } from 'react';
import { CALL_STEPS } from '@onedal/shared';
import StepSheetMock from '../components/dashboard/StepSheetMock';
import { MOCK_PLANS, type Call } from './mockPlans';

/**
 * 📱 **한 콜 화면 목업 — 콜 진행 6단계를 화면 하나에** (기사님 «목업 그리기»)
 *
 * 지금 실물은 단계 시트가 «펼친 콜 카드» 안 · 콜 목록 서랍 안에 있어 화면 1/4 만 쓰고 그 안에서 또 스크롤된다.
 * 이 목업은 그 시트를 꺼내 전체 화면으로 그린다:
 * - 여섯 칸을 세로로 한 번에 — 지금 칸만 펼치고, 지난 칸은 한 줄(누르면 펼침), 뒤 칸은 회색 한 줄에 예정 값
 * - 뒤 칸은 «이 칸에 오면 고칠 수 있어요» — 흐린 까닭을 글로(고장과 구별)
 * - 주 단추는 바닥에 고정 — 스크롤과 상관없이 늘 보인다
 *
 * 장면 셋(목업 위 «장면» 단추):
 * ① 콜 카드 — 카드 안에는 단계 한 줄 요약만 남긴다(이전: 카드 안에서 시트가 펼쳐져 상자 속 스크롤 두 겹)
 * ② 한 콜 화면 — 그 한 줄을 누르면 **위에 덮이는 층**으로 뜬다(페이지 이동 아님 · ← 로 닫으면 지도 · 목록 그대로)
 * ③ 새 콜 들어옴 — 한 콜 화면이 저절로 비키고 심사석(지도 포함 «나» 높이 · `snapOnJudging`)이 뜬다 · 결재가 끝나면 보던 단계로 돌아온다
 *
 * ⚠️ 기능은 없다 — 지금 칸은 실물 `StepSheetMock` 을 `orderId` 없이 그려 저장이 안 나간다.
 *    바닥 단추는 목업 안에서만 다음 칸으로 넘긴다. 콜 값은 실주행 실측 목업 자료(`MOCK_PLANS`)에서 온다.
 */

/** 목업 자료의 단계 순서(상차 셋 · 하차 셋) — `call.now` · `call.stamp` 가 이 순서로 적혀 있다 */
const MOCK_ORDER = ['CALL_PICKUP', 'ARRIVE_PICKUP', 'LOADED', 'CALL_DROPOFF', 'ARRIVE_DROPOFF', 'DELIVERED'] as const;

const MAIN_BUTTONS: Record<string, [string, string]> = {
    CALL_PICKUP: ['통화 스킵', '통화 완료'], CALL_DROPOFF: ['통화 스킵', '통화 완료'],
    ARRIVE_PICKUP: ['⏭️ 건너뛰기', '📍 도착'], ARRIVE_DROPOFF: ['⏭️ 건너뛰기', '📍 도착'],
    LOADED: ['✕ 취소', '📦 상차 완료'], DELIVERED: ['', '🏁 하차 완료'],
};

const iso = (hhmm?: string) => {
    const m = hhmm?.match(/(\d{1,2}):(\d{2})/);
    return m ? `2026-09-03T${m[1].padStart(2, '0')}:${m[2]}:00+09:00` : undefined;
};

/** 한 칸의 시트 자료 — 기존 시트 목업(`SheetMockup` PaneBody)과 같은 규칙: 지어낸 값을 넣지 않는다 */
function rowOf(call: Call, step: string, done: boolean) {
    const mi = MOCK_ORDER.indexOf(step as typeof MOCK_ORDER[number]);
    const promise = call.stops[step.endsWith('PICKUP') || step === 'LOADED' ? 0 : 1];
    return {
        status: done ? 'DONE' : 'PLANNED',
        occurred_at: done && call.stamp[mi] ? iso(call.stamp[mi]) : null,
        source: call.stamp[mi]?.includes('자동') ? 'AUTO' : call.stamp[mi] ? 'MANUAL' : null,
        predicted_at: iso(promise.now),
        promised_arrival_at: iso(promise.now),
        planned_source: call.item ? 'MEMO' : null,
    };
}

export default function StepScreenMockup() {
    const calls = MOCK_PLANS[3].callList;
    const [ci, setCi] = useState(0);
    const call = calls[ci];
    const startNow = useMemo(() => CALL_STEPS.findIndex(s => MOCK_ORDER.indexOf(s.id) >= call.now), [call]);
    const [now, setNow] = useState(Math.max(0, startNow));
    const [peek, setPeek] = useState<number | null>(null);
    const [log, setLog] = useState('');
    /** 장면 — 콜 카드(한 줄 요약) · 한 콜 화면(덮이는 층) · 새 콜 심사(한 콜 화면이 비킴) */
    const [scene, setScene] = useState<'card' | 'steps' | 'judging'>('card');
    const [backTo, setBackTo] = useState<'card' | 'steps'>('card');
    const pick = (i: number) => { setCi(i); setNow(Math.max(0, CALL_STEPS.findIndex(s => MOCK_ORDER.indexOf(s.id) >= calls[i].now))); setPeek(null); setLog(''); };

    const cur = CALL_STEPS[now];
    const [left, right] = cur ? MAIN_BUTTONS[cur.id] : ['', ''];
    const site = (stop: string) => call.site[stop === 'pickup' ? 'p' : 'd'];

    const sceneBar = (
        <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-warning/10 text-[11px] border-b border-border">
            <span className="text-text-muted">장면:</span>
            {([['card', '① 콜 카드'], ['steps', '② 한 콜 화면'], ['judging', '③ 새 콜 들어옴']] as const).map(([k, t]) => (
                <button key={k} onClick={() => { if (k === 'judging') setBackTo(scene === 'judging' ? backTo : scene); setScene(k); }}
                    className={`px-2 py-0.5 rounded border ${scene === k ? 'border-warning text-warning font-bold' : 'border-border text-text-muted'}`}>{t}</button>
            ))}
        </div>
    );

    /* ── ① 콜 카드 — 카드 안 단계 자리는 한 줄 요약 ── */
    if (scene === 'card') return (
        <div className="fixed inset-0 flex flex-col bg-background text-text-primary">
            {sceneBar}
            <div className="flex-1 bg-surface-alt/30 flex items-center justify-center text-text-muted text-[13px]">🗺️ 지도 (그대로)</div>
            <div className="shrink-0 rounded-t-2xl border-t border-border bg-surface px-3 pt-2 pb-4 flex flex-col gap-2">
                <div className="mx-auto w-10 h-1 rounded-full bg-border" />
                <div className="flex items-center gap-2">
                    <span className="text-[15px] font-black">{call.no}. {call.p} → {call.d}</span>
                    <span className="ml-auto text-[17px] font-black text-success">{call.fare}</span>
                </div>
                <button onClick={() => setScene('steps')} className="w-full flex items-center gap-2 rounded-xl border border-info bg-info/10 px-3 py-3 text-left">
                    <span className="flex gap-1">{CALL_STEPS.map((_, i) => <span key={i} className={`w-5 h-1.5 rounded-full ${i < now ? 'bg-success' : i === now ? 'bg-info' : 'bg-border'}`} />)}</span>
                    <span className="text-[15px] font-black">{CALL_STEPS[now]?.label ?? '운행 완료'}</span>
                    <span className="text-[12px] text-text-muted">{now}/6</span>
                    <span className="ml-auto text-[13px] font-bold text-info">단계 열기 ›</span>
                </button>
                <div className="text-[11px] text-text-muted leading-snug">
                    <b className="text-text-primary">이전</b>: 이 자리 아래에 단계 시트가 카드 안에서 펼쳐졌다 — 화면 1/4 · 카드 안 스크롤 · 위아래로 다른 콜 줄.<br />
                    <b className="text-text-primary">지금</b>: 한 줄 요약만 남고, 누르면 한 콜 화면이 위에 덮인다(페이지 이동 아님).
                </div>
                <div className="text-[12px] text-text-muted">2 곤지암 · 3 배차… (다른 콜 줄은 그대로)</div>
            </div>
        </div>
    );

    /* ── ③ 새 콜 들어옴 — 한 콜 화면이 비키고 심사석(지도 포함) ── */
    if (scene === 'judging') return (
        <div className="fixed inset-0 flex flex-col bg-background text-text-primary">
            {sceneBar}
            <div className="flex-1 bg-surface-alt/30 flex items-center justify-center text-text-muted text-[13px]">🗺️ 지도 — 새 콜 경로를 그린다(심사 «나» 높이)</div>
            <div className="shrink-0 rounded-t-2xl border-t border-warning bg-surface px-3 pt-3 pb-4 flex flex-col gap-2">
                <div className="text-[12px] text-warning font-bold">🔔 새 콜 심사 중 — 보던 «{CALL_STEPS[now]?.label}» 화면은 잠시 비켰습니다</div>
                <div className="rounded-xl border border-border-card p-3 text-[14px]"><b>🪑 심사석</b> (지금 실물 그대로) — 판정 색 · 점수 · 경로</div>
                <div className="flex gap-2">
                    {(['거절', 'KEEP'] as const).map(k => (
                        <button key={k} onClick={() => { setScene(backTo); setLog(`결재 «${k}» 끝 — 보던 «${CALL_STEPS[now]?.label}»(으)로 돌아왔습니다`); }}
                            className={`flex-1 py-3.5 rounded-xl text-[17px] font-black ${k === 'KEEP' ? 'bg-success text-white' : 'border border-border bg-surface-alt'}`}>{k}</button>
                    ))}
                </div>
                <div className="text-[11px] text-text-muted">결재가 끝나면 비키기 전 화면({backTo === 'steps' ? '한 콜 화면 · 같은 단계' : '콜 카드'})으로 저절로 돌아간다 — 고치던 칩은 그대로</div>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 flex flex-col bg-background text-text-primary">
            {sceneBar}
            {/* ── 머리: 콜 한 줄 · 뒤로 ── */}
            <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-border bg-surface">
                <button onClick={() => setScene('card')} className="text-[20px] font-black text-text-muted">←</button>
                <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-black truncate">{call.p} → {call.d}</div>
                    <div className="text-[11px] text-text-muted">콜 {call.no} · 잡은 시각 {call.grabbed} · {now}/6 단계 마침</div>
                </div>
                <div className="text-[18px] font-black text-success">{call.fare}</div>
            </div>
            {/* 목업 조작: 콜 고르기 */}
            <div className="shrink-0 flex gap-1.5 px-3 py-1.5 bg-surface-alt/40 text-[11px]">
                <span className="text-text-muted">목업 콜:</span>
                {calls.map((c, i) => (
                    <button key={c.no} onClick={() => pick(i)} className={`px-2 py-0.5 rounded border ${i === ci ? 'border-info text-info font-bold' : 'border-border text-text-muted'}`}>{c.no} {c.p}</button>
                ))}
            </div>

            {/* ── 여섯 칸 — 세로로 한 번에 ── */}
            <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1.5">
                {CALL_STEPS.map((s, i) => {
                    const done = i < now, isNow = i === now, open = isNow || peek === i;
                    const r = rowOf(call, s.id, done);
                    const [nm] = site(s.stop);
                    const time = r.occurred_at?.slice(11, 16) ?? r.predicted_at?.slice(11, 16);
                    return (
                        <div key={s.id} className={`rounded-lg border ${isNow ? 'border-info bg-info/5' : 'border-border-card bg-surface'}`}>
                            <button onClick={() => !isNow && setPeek(peek === i ? null : i)}
                                className={`w-full flex items-center gap-2 px-3 ${isNow ? 'py-3' : 'py-2.5'} text-left ${!done && !isNow ? 'opacity-60' : ''}`}>
                                <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-black ${done ? 'bg-success text-white' : isNow ? 'bg-info text-white' : 'bg-surface-alt text-text-muted'}`}>
                                    {done ? '✓' : i + 1}
                                </span>
                                <span className={`font-black ${isNow ? 'text-[17px]' : 'text-[15px]'}`}>{s.label}</span>
                                <span className="text-[12px] text-text-muted truncate">{nm}</span>
                                <span className="ml-auto shrink-0 text-[13px] font-bold tabular-nums text-text-muted">
                                    {done ? `✓ ${time ?? ''}` : isNow ? '지금' : `예정 ${time ?? '--:--'}`}
                                </span>
                            </button>
                            {!done && !isNow && peek !== i && (
                                <div className="px-3 pb-2 -mt-1 text-[11px] text-text-muted">이 칸에 오면 고칠 수 있어요{s.optional ? ' · 건너뛸 수 있음' : ''}</div>
                            )}
                            {open && (
                                <div className="px-2 pb-2">
                                    <StepSheetMock
                                        view={{ step: s.id, label: s.label, born: done || isNow, row: r }}
                                        place={{ name: site(s.stop)[0], address: site(s.stop)[1], phone: site(s.stop)[2] }}
                                        prevName={s.stop === 'dropoff' ? call.p : null}
                                        onMock={(what) => setLog(`🎛️ «${what}» — 목업이라 저장은 안 나갑니다`)}
                                    />
                                    {!isNow && !done && <div className="mt-1 text-[11px] text-warning">미리 보기 — 이 칸에 오면 고칠 수 있어요</div>}
                                </div>
                            )}
                        </div>
                    );
                })}
                {now >= CALL_STEPS.length && <div className="text-center text-success font-black py-4">운행 완료 · 6단계를 모두 마쳤습니다</div>}
                {log && <div className="text-[11px] text-text-muted px-1">{log}</div>}
            </div>

            {/* ── 주 단추 — 바닥 고정 ── */}
            {cur && (
                <div className="shrink-0 flex gap-2 px-3 py-3 border-t border-border bg-surface">
                    {left && <button onClick={() => { if (cur.optional || left.includes('건너뛰기')) setNow(now + 1); setPeek(null); setLog(`«${left}» — 목업`); }}
                        className="flex-1 py-3.5 rounded-xl border border-border bg-surface-alt text-[16px] font-black">{left}</button>}
                    <button onClick={() => { setNow(now + 1); setPeek(null); setLog(`«${right}» — 목업에서 다음 칸으로`); }}
                        className="flex-[2] py-3.5 rounded-xl bg-info text-white text-[17px] font-black">{right}</button>
                </div>
            )}
        </div>
    );
}
