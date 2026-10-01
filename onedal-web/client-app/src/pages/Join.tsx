import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@onedal/ui/button';
import { Checkbox } from '@onedal/ui/checkbox';
import { Input } from '@onedal/ui/input';
import { CONSENT_KINDS, TARGET_APPS, TARGET_APP_LABEL, type ContentKind, type ContentReply } from '@onedal/shared';
import { useAuth } from '../contexts/AuthContext';
import { JoinStaleError, agree, fetchContents, submitJoin } from '../api/join';
import {
    AGREEMENT_ITEMS, EMPTY_INFO, JOIN_STEPS,
    agreementsFor, canProceed, nextOf, prevOf, stepFromQuery, toggleNetwork,
    type JoinState, type JoinStep,
} from '../lib/joinFlow';
import { ContentSlot, JoinShell, SectionCard } from './JoinSteps';

/**
 * 📝 **가입 — ① 동의 → ② 가입 정보 → ③ 신청** (reviews/29 «관제웹 기사 쪽 페이지» · 서버 문 `/api/join`).
 *    새 계정이 처음 보는 화면. 로그인 밖에 있다 — 주소를 받은 사람이 바로 연다. 신청(③)만 로그인이 필요하다.
 *    단계는 `?step=` 에, 적던 내용은 이 브라우저(`sessionStorage`)에 — 새로고침해도 이어진다.
 *    `?reconsent=1` 이면 **동의 단계만** — 약관 판이 올라 다시 동의할 때(관제 화면 띠에서 온다). 서버로 보내는 곳은 `api/join.ts` 하나.
 */

const STEP_LABELS: Record<JoinStep, string> = { agree: '동의', info: '가입 정보', done: '신청' };
const DRAFT_KEY = 'onedal-join-draft';
const CONTENT_LINK: Record<string, string> = { terms: '/terms', privacy: '/privacy', location: '/location-terms' };

/** `?example=1` — 예시 자료로 채워 «실제로 돌면 이렇게 보인다»를 보인다 (사진용) */
const EXAMPLE_STATE: JoinState = {
    agreed: Object.fromEntries(AGREEMENT_ITEMS.map(i => [i.key, true])),
    info: { phone: '010-1234-5678', dispatchNetworks: ['insung', 'kakaopicker'] },
};

function loadDraft(example: boolean): JoinState {
    if (example) return EXAMPLE_STATE;
    try {
        const raw = sessionStorage.getItem(DRAFT_KEY);
        if (raw) { const d = JSON.parse(raw); return { agreed: d.agreed ?? {}, info: { ...EMPTY_INFO, ...(d.info ?? {}) } }; }
    } catch { /* 저장소가 막혀 있어도 흐름은 돈다 */ }
    return { agreed: {}, info: EMPTY_INFO };
}

export default function Join() {
    const [params, setParams] = useSearchParams();
    const navigate = useNavigate();
    const { isAuthenticated } = useAuth();
    const reconsentOnly = params.get('reconsent') === '1';
    const steps = reconsentOnly ? (['agree'] as const) : JOIN_STEPS;
    const step = stepFromQuery(steps, params.get('step'));
    const [state, setState] = useState<JoinState>(() => loadDraft(params.get('example') === '1'));
    const [contents, setContents] = useState<Partial<Record<ContentKind, ContentReply | null>>>({});
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /** 동의 글의 지금 판 — 서버로 보낼 동의는 이 판으로. 못 읽으면 그 종류는 «글 없음»으로 둔다(흐름은 돈다) */
    const loadContents = async () => {
        const entries = await Promise.all(CONSENT_KINDS.map(async kind => [kind, await fetchContents(kind).catch(() => null)] as const));
        setContents(Object.fromEntries(entries));
    };
    useEffect(() => { loadContents(); }, []);
    useEffect(() => {
        try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(state)); } catch { /* 위와 같다 */ }
    }, [state]);

    const go = (s: JoinStep | null) => { if (s) setParams(p => { const n = new URLSearchParams(p); n.set('step', s); return n; }); };
    const setAgreed = (key: string, v: boolean) => setState(st => ({ ...st, agreed: { ...st.agreed, [key]: v } }));
    const setInfo = (patch: Partial<JoinState['info']>) => setState(st => ({ ...st, info: { ...st.info, ...patch } }));
    const allOn = AGREEMENT_ITEMS.every(i => state.agreed[i.key]);

    const onStale = async (e: unknown) => {
        if (e instanceof JoinStaleError) {
            setError('그 사이 약관 글이 바뀌었습니다 — 다시 읽고 동의해 주세요.');
            await loadContents();
            setState(st => ({ ...st, agreed: {} }));
            go('agree');
            return true;
        }
        return false;
    };

    const submit = async () => {
        setSending(true); setError(null);
        try {
            await submitJoin({ info: state.info, agreements: agreementsFor(contents) });
            try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* 위와 같다 */ }
            navigate('/pending');
        } catch (e) {
            if (!(await onStale(e))) setError('신청을 보내지 못했습니다 — 잠시 뒤 다시 눌러 주세요.');
        } finally { setSending(false); }
    };

    const submitReconsent = async () => {
        setSending(true); setError(null);
        try { await agree(agreementsFor(contents)); navigate('/'); }
        catch (e) { if (!(await onStale(e))) setError('동의를 보내지 못했습니다 — 잠시 뒤 다시 눌러 주세요.'); }
        finally { setSending(false); }
    };

    return (
        <JoinShell title={reconsentOnly ? '새 약관 동의' : '1DAL 가입'} subtitle={reconsentOnly ? '약관 글이 바뀌어 다시 동의가 필요합니다' : '주소를 받은 분이 여는 화면입니다'} steps={steps} step={step} labels={STEP_LABELS}>
            {isAuthenticated && !reconsentOnly && (
                <div className="rounded-xl border border-info/40 bg-info/10 px-4 py-3 text-sm">
                    로그인돼 있습니다. 이미 회원이면 <Link to="/" className="font-bold text-info underline">관제 화면으로</Link>
                </div>
            )}
            {error && <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm">{error}</div>}

            {step === 'agree' && (
                <>
                    {!reconsentOnly && <ContentSlot kind="joinGuide" placeholder="예: 1DAL 이 무엇을 하는 서비스인지 · 누가 쓰는지 한 문단" />}
                    <SectionCard title="동의 (필수)">
                        {AGREEMENT_ITEMS.map(item => (
                            <label key={item.key} className="flex items-start gap-3 py-1 cursor-pointer">
                                <Checkbox checked={!!state.agreed[item.key]} onCheckedChange={v => setAgreed(item.key, v === true)} className="mt-0.5" />
                                <span className="text-sm leading-snug flex-1">
                                    {item.label}
                                    {item.contentKind && contents[item.contentKind] && <span className="ml-1 text-xs text-text-muted">v{contents[item.contentKind]!.version}</span>}
                                    {item.contentKind && CONTENT_LINK[item.contentKind] && (
                                        <Link to={CONTENT_LINK[item.contentKind]} className="ml-2 text-xs text-info underline">읽기</Link>
                                    )}
                                </span>
                            </label>
                        ))}
                        <div className="pt-2 border-t border-border-card">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <Checkbox checked={allOn} onCheckedChange={v => AGREEMENT_ITEMS.forEach(i => setAgreed(i.key, v === true))} />
                                <span className="text-sm font-bold">모두 동의합니다</span>
                            </label>
                        </div>
                    </SectionCard>
                </>
            )}

            {step === 'info' && (
                <SectionCard title="가입 정보">
                    <Field label="연락처">
                        <Input inputMode="tel" placeholder="010-0000-0000" value={state.info.phone} onChange={e => setInfo({ phone: e.target.value })} />
                    </Field>
                    <Field label="쓰는 배차망 (여러 개 가능)">
                        <div className="flex flex-wrap gap-2">
                            {TARGET_APPS.map(n => {
                                const on = state.info.dispatchNetworks.includes(n);
                                return (
                                    <Button key={n} type="button" size="sm" variant={on ? 'default' : 'outline'} onClick={() => setInfo({ dispatchNetworks: toggleNetwork(state.info.dispatchNetworks, n) })}>
                                        {on ? '✓ ' : ''}{TARGET_APP_LABEL[n]}
                                    </Button>
                                );
                            })}
                        </div>
                    </Field>
                    <p className="text-xs text-text-muted">차종은 가입 뒤 관제 설정에서 정합니다.</p>
                </SectionCard>
            )}

            {step === 'done' && (
                <SectionCard title="신청 내용">
                    <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
                        <dt className="text-text-muted">연락처</dt><dd className="font-semibold">{state.info.phone || '—'}</dd>
                        <dt className="text-text-muted">배차망</dt><dd className="font-semibold">{state.info.dispatchNetworks.map(n => TARGET_APP_LABEL[n]).join(' · ') || '—'}</dd>
                    </dl>
                    <p className="text-xs text-text-muted">신청하면 관리자가 확인한 뒤 승인합니다. 승인 전에는 앱을 미리 받아 둘 수 있습니다.</p>
                    {!isAuthenticated && <p className="text-xs text-warning">신청에는 구글 로그인이 필요합니다 — 로그인하면 이 화면으로 돌아옵니다.</p>}
                </SectionCard>
            )}

            <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" className="flex-1" disabled={!prevOf(steps, step)} onClick={() => go(prevOf(steps, step))}>이전</Button>
                {reconsentOnly
                    ? <Button type="button" className="flex-[2]" disabled={!canProceed('agree', state) || sending} onClick={submitReconsent}>{sending ? '보내는 중…' : '동의하고 관제로'}</Button>
                    : step !== 'done'
                        ? <Button type="button" className="flex-[2]" disabled={!canProceed(step, state)} onClick={() => go(nextOf(steps, step))}>다음</Button>
                        : isAuthenticated
                            ? <Button type="button" className="flex-[2]" disabled={sending} onClick={submit}>{sending ? '신청 중…' : '가입 신청'}</Button>
                            : <Button type="button" className="flex-[2]" onClick={() => navigate('/login', { state: { from: '/join?step=done' } })}>구글로 로그인하고 신청</Button>}
            </div>
            {!reconsentOnly && (
                <p className="text-center text-xs text-text-muted">
                    이미 신청했나요? <Link to="/pending" className="underline">승인 대기 화면</Link> · 앱을 먼저 받으려면 <Link to="/join/apps" className="underline">앱 받기</Link>
                </p>
            )}
        </JoinShell>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <div className="text-xs font-bold text-text-muted">{label}</div>
            {children}
        </div>
    );
}
