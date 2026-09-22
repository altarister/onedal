import { useEffect, useState } from 'react';
/* 🚪 시뮬 전용 문은 문지기 하나로만 연다 — 라이브에서는 닫혀 있다 (`simDoor.ts`) */
import { simAsk } from './simDoor';
import { VERDICT_AXIS_LABEL } from './callVerdict';

/**
 * 🎬 **시나리오콜 카드 — «이천 왕복 하루»** (기사님 지시).
 *
 * 기사님: *"너가 알려주는 건 안 돼, 시선이 분산되니까. 현황판에서 모두 해결할 수 있도록 해줘"*
 * → 기사님이 할 일은 **[시작] 한 번 + 이 카드의 «지금» 줄이 시키는 KEEP · 취소 · ↩️ 복귀 켬** 뿐이다.
 *
 * 🔴 **여기서 판단하지 않는다** — 서버(`GET /api/sim/scenario`)가 사건순으로 콜을 내고 줄마다 ✅/🔴 를 정한다
 *    (`server/src/core/simScenario.ts`). 이 카드는 그 상태를 1.5초마다 읽어 그린다. 화면에 판단을 두면 돌려 봐야만 틀린 줄을 안다.
 * 🔴 폰 판정 낱말(`pickup` · `fare` …)의 한국어는 `callVerdict.ts` 한 곳을 쓴다.
 */

type Mark = 'wait' | 'sent' | 'ok' | 'warn' | 'bad' | 'unknown' | 'skip';

interface ScenarioRowView {
    id: string; stage: string; kind: 'keep' | 'cancel' | 'block' | 'act';
    say: string; why: string; guess: boolean; blockBy: string | null; when: string; call: string | null;
    mark: Mark; note: string; verdict?: string | null;
    checks?: Array<{ label: string; ok: boolean }>;
}
interface ScenarioView {
    ok: boolean; name: string; running: boolean; waitingPhone?: boolean; index: number | null; finished: boolean; startedAt: number | null;
    precheck: Array<{ what: string; ok: boolean; got: string }>;
    rows: ScenarioRowView[];
}

const MARK_SIGN: Record<Mark, string> = { wait: '·', sent: '⏳', ok: '✅', warn: '🟠', bad: '🔴', unknown: '❔', skip: '⏭️' };
const KIND_SIGN: Record<ScenarioRowView['kind'], string> = { keep: '🟢', cancel: '🟡', block: '⚪', act: '🧭' };

const axisLabel = (v?: string | null) => (v ? (VERDICT_AXIS_LABEL[v] ?? v) : '');

/** 🧾 «결과 복사» 글 — 기사님이 채팅에 붙이면 서버 로그와 대조한다 */
function resultText(v: ScenarioView): string {
    const at = v.startedAt ? new Date(v.startedAt).toLocaleTimeString('ko-KR', { hour12: false }) : '—';
    const lines = v.rows.map(r => {
        const checks = r.checks?.length ? ` (${r.checks.map(c => `${c.label} ${c.ok ? '✅' : '🔴'}`).join(' · ')})` : '';
        const verdict = r.kind === 'block' && r.verdict ? ` [폰: ${axisLabel(r.verdict)} · 막을 축: ${axisLabel(r.blockBy)}]` : '';
        return `${r.id} ${MARK_SIGN[r.mark]} ${r.note}${verdict}${checks}${r.guess ? ' (🟡추정)' : ''}`;
    });
    return [`🎬 ${v.name} · 시작 ${at}`, ...lines,
        '눈으로 볼 것: 내 위치 점선 원(A2) · 🎯 둘/하나(C1/C3) · 심사석 결론(B1 B3 C3) · 후보 구간 판정 색(B1)'].join('\n');
}

/** 🎬 카드 하나 = 문제 하나 — 이름표로 서버에 묻고 시작한다 (기사님 2026-09-15 «이천 왕복하루 아래에 이천 성공하는 5콜» · 2026-09-19 «강남 진입과 광주 복귀 5콜») */
export default function ScenarioCard({ scenarioKey, title }: { scenarioKey: 'icheonRound' | 'icheonFive' | 'gangnamFive'; title: string }) {
    const [view, setView] = useState<ScenarioView | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        let alive = true;
        const read = async () => {
            const r = await simAsk<ScenarioView>(`/scenario?key=${scenarioKey}`);
            if (!alive) return;
            /**
             * 🔴 **줄이 온 것만 화면으로 세운다** (규칙 ④).
             *    `index !== null` 은 `undefined` 를 통과시킨다 — 그러면 `rows[undefined]` 로 죽는다.
             */
            if (!r.ok || !Array.isArray(r.data.rows)) { setError(r.ok ? '서버가 줄을 안 줬다' : r.why); return; }
            setView(r.data); setError(null);
        };
        void read();
        const t = setInterval(read, 1500);
        return () => { alive = false; clearInterval(t); };
    }, [scenarioKey]);

    const post = async (path: 'start' | 'skip' | 'stop') => {
        setBusy(true);
        try {
            const r = await simAsk<{ ok?: boolean }>(`/scenario/${path}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: scenarioKey }),
            });
            setError(r.ok && r.data?.ok ? null : (r.ok ? '서버가 안 받았다' : r.why));
        } finally {
            setBusy(false);
        }
    };

    const copy = async () => {
        if (!view) return;
        try { await navigator.clipboard.writeText(resultText(view)); setCopied(true); setTimeout(() => setCopied(false), 1500); }
        catch { setError('복사를 못 했다 — 브라우저가 막았다'); }
    };

    const cur = view && view.index !== null ? view.rows[view.index] : null;
    const next = view && view.index !== null && !view.finished ? view.rows[view.index + 1] ?? null : null;
    const done = view && view.index !== null ? view.rows.slice(0, view.finished ? view.rows.length : view.index) : [];

    return (
        <div className="rounded-xl border border-border-card bg-surface px-3 py-2">
            <div className="flex items-center gap-2 pb-1">
                <span className="text-[12px] font-black text-text-primary">🎬 {view?.name ?? title}</span>
                <span className="text-[9.5px] text-text-muted">서버가 사건순으로 콜을 낸다 · 시뮬레이터는 «🚚 개별콜» 탭</span>
                <span className="ml-auto flex gap-1">
                    {!view?.running && <button type="button" disabled={busy} onClick={() => void post('start')}
                        className="px-2 py-1 rounded-md border border-info/40 bg-info/15 text-[10.5px] font-black text-info">▶ 시작</button>}
                    {view?.running && <button type="button" disabled={busy} onClick={() => void post('skip')}
                        className="px-2 py-1 rounded-md border border-border-card text-[10.5px] font-black text-text-muted">⏭️ 건너뛰기</button>}
                    {view?.running && <button type="button" disabled={busy} onClick={() => void post('stop')}
                        className="px-2 py-1 rounded-md border border-border-card text-[10.5px] font-black text-text-muted">⏹ 멈춤</button>}
                    {view && view.index !== null && <button type="button" onClick={() => void copy()}
                        className="px-2 py-1 rounded-md border border-border-card text-[10.5px] font-black text-text-muted">{copied ? '복사됨' : '📋 결과 복사'}</button>}
                </span>
            </div>

            {/* 시작 조건 — 틀려도 막지 않는다 (시뮬레이터 연결만 서버가 막는다) */}
            {view && <div className="flex flex-wrap gap-x-2 text-[10px] text-text-muted pb-1">
                {view.precheck.map(p => (
                    <span key={p.what} className={p.ok ? '' : 'text-warning font-bold'}>{p.what} {p.got} {p.ok ? '✅' : '🔴'}</span>
                ))}
            </div>}
            {error && <div className="text-[10.5px] font-bold text-warning pb-1">— {error}</div>}

            {/* 🧹 시작하면 이전 콜을 리셋한다 — 폰이 본 콜 기억을 비울 번호를 받기 전에는 첫 콜을 안 낸다 */}
            {view?.waitingPhone && (
                <div className="rounded-lg border border-warning/40 bg-warning/10 px-2.5 py-2 text-[13px] font-black text-text-primary">
                    🧹 이전 콜 리셋 중 — 폰이 기억을 비우면 첫 콜이 나간다
                    <div className="text-[10px] font-bold text-text-muted pt-0.5">시뮬레이터 목록이 비는 순간 폰 화면이 바뀌어 곧 받는다 · 늦어도 1분 (앱 2.9.5 부터)</div>
                </div>
            )}

            {/* ▶ 지금 줄 — 크게 */}
            {cur && !view?.finished && (
                <div className="rounded-lg border border-info/40 bg-info/10 px-2.5 py-2">
                    <div className="flex items-baseline gap-2">
                        <span className="text-[13px] font-black text-info">▶ {cur.id}</span>
                        <span className="text-[11px] font-bold text-text-muted">{cur.when}</span>
                        {cur.guess && <span className="text-[9.5px] text-warning">🟡 추정</span>}
                    </div>
                    {cur.call && <div className="text-[12px] font-black text-text-primary">{cur.call}</div>}
                    <div className="text-[15px] font-black text-text-primary pt-0.5">{KIND_SIGN[cur.kind]} {cur.say.replace(/^[🟢🟡⚪🧭]\s*/u, '')}</div>
                    {cur.note && <div className={`text-[12px] font-bold pt-0.5 ${cur.mark === 'bad' ? 'text-danger' : cur.mark === 'warn' || cur.mark === 'unknown' ? 'text-warning' : 'text-text-muted'}`}>
                        {cur.note}{cur.kind === 'block' && cur.verdict ? ` · 폰: ${axisLabel(cur.verdict)}` : ''}
                    </div>}
                    <div className="text-[9.5px] text-text-muted pt-0.5">{cur.why}</div>
                </div>
            )}
            {view?.finished && <div className="text-[12px] font-black text-success">🏁 끝 — [📋 결과 복사] 를 눌러 채팅에 붙여 주세요</div>}

            {/* 다음 줄 — 미리보기 */}
            {next && <div className="text-[10.5px] text-text-muted pt-1">다음 {next.id} · {next.when} · {KIND_SIGN[next.kind]} {next.call ?? next.say}</div>}

            {/* 지난 줄 */}
            {done.length > 0 && <div className="flex flex-col pt-1 border-t border-border-card/50 mt-1">
                {done.map(r => (
                    <div key={r.id} className="text-[10px] text-text-muted truncate">
                        <b className="text-text-primary">{r.id}</b> {MARK_SIGN[r.mark]} {r.note}
                        {r.kind === 'block' && r.verdict ? ` · 폰: ${axisLabel(r.verdict)}` : ''}
                        {r.checks?.length ? ` · ${r.checks.map(c => `${c.label} ${c.ok ? '✅' : '🔴'}`).join(' · ')}` : ''}
                    </div>
                ))}
            </div>}
        </div>
    );
}
