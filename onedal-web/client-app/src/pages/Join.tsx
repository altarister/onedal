import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { useAuth } from '../contexts/AuthContext';
import { submitJoin } from '../api/join';
import {
    AGREEMENT_ITEMS, EMPTY_INFO, JOIN_STEPS, NETWORK_OPTIONS, VEHICLE_OPTIONS,
    canProceed, nextOf, prevOf, stepFromQuery, toggleNetwork,
    type JoinState, type JoinStep,
} from '../lib/joinFlow';
import { ContentSlot, JoinShell, SectionCard } from './JoinSteps';

/**
 * 📝 **가입 — ① 동의 → ② 가입 정보 → ③ 신청** (reviews/29 «관제웹 기사 쪽 페이지»).
 *    새 계정이 처음 보는 화면. 로그인 밖에 있다 — 주소를 받은 사람이 바로 연다.
 *    단계는 `?step=` 에, 적던 내용은 이 브라우저(`sessionStorage`)에 — 새로고침해도 이어진다.
 *    🔴 서버로 보내는 곳은 `api/join.ts` 하나 — 지금은 목업이라 바로 «신청됨»으로 간다.
 */

const STEP_LABELS: Record<JoinStep, string> = { agree: '동의', info: '가입 정보', done: '신청' };
const DRAFT_KEY = 'onedal-join-draft';

const CONTENT_LINK: Record<string, string> = { terms: '/terms', privacy: '/privacy', location: '/location-terms' };

/** `?example=1` — 예시 자료로 채워 «실제로 돌면 이렇게 보인다»를 보인다 (목업 · 사진용) */
const EXAMPLE_STATE: JoinState = {
    agreed: Object.fromEntries(AGREEMENT_ITEMS.map(i => [i.key, true])),
    info: { vehicle: '1t', phone: '010-1234-5678', networks: ['인성', '카카오 픽커'], region: '광주 · 이천 · 여주', youtubeChannel: '화물기사 2호' },
};

function loadDraft(example: boolean): JoinState {
    if (example) return EXAMPLE_STATE;
    try {
        const raw = sessionStorage.getItem(DRAFT_KEY);
        if (raw) return { agreed: {}, info: EMPTY_INFO, ...JSON.parse(raw) };
    } catch { /* 저장소가 막혀 있어도 흐름은 돈다 */ }
    return { agreed: {}, info: EMPTY_INFO };
}

export default function Join() {
    const [params, setParams] = useSearchParams();
    const navigate = useNavigate();
    const { isAuthenticated } = useAuth();
    const step = stepFromQuery(JOIN_STEPS, params.get('step'));
    const [state, setState] = useState<JoinState>(() => loadDraft(params.get('example') === '1'));
    const [sending, setSending] = useState(false);

    useEffect(() => {
        try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(state)); } catch { /* 위와 같다 */ }
    }, [state]);

    const go = (s: JoinStep | null) => { if (s) setParams(p => { const n = new URLSearchParams(p); n.set('step', s); return n; }); };
    const setAgreed = (key: string, v: boolean) => setState(st => ({ ...st, agreed: { ...st.agreed, [key]: v } }));
    const setInfo = (patch: Partial<JoinState['info']>) => setState(st => ({ ...st, info: { ...st.info, ...patch } }));
    const allOn = AGREEMENT_ITEMS.every(i => state.agreed[i.key]);

    const submit = async () => {
        setSending(true);
        try {
            await submitJoin(state);
            navigate('/pending');
        } finally { setSending(false); }
    };

    return (
        <JoinShell title="1DAL 가입" subtitle="주소를 받은 분이 여는 화면입니다" steps={JOIN_STEPS} step={step} labels={STEP_LABELS}>
            {isAuthenticated && (
                <div className="rounded-xl border border-info/40 bg-info/10 px-4 py-3 text-sm">
                    이미 회원입니다. <Link to="/" className="font-bold text-info underline">관제 화면으로</Link>
                </div>
            )}

            {step === 'agree' && (
                <>
                    <ContentSlot kind="joinGuide" placeholder="예: 1DAL 이 무엇을 하는 서비스인지 · 누가 쓰는지 한 문단" />
                    <SectionCard title="동의 (필수)">
                        {AGREEMENT_ITEMS.map(item => (
                            <label key={item.key} className="flex items-start gap-3 py-1 cursor-pointer">
                                <Checkbox checked={!!state.agreed[item.key]} onCheckedChange={v => setAgreed(item.key, v === true)} className="mt-0.5" />
                                <span className="text-sm leading-snug flex-1">
                                    {item.label}
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
                    <Field label="차종">
                        <Select value={state.info.vehicle} onValueChange={v => setInfo({ vehicle: v })}>
                            <SelectTrigger className="w-full"><SelectValue placeholder="차종을 고르세요" /></SelectTrigger>
                            <SelectContent>
                                {VEHICLE_OPTIONS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field label="연락처">
                        <Input inputMode="tel" placeholder="010-0000-0000" value={state.info.phone} onChange={e => setInfo({ phone: e.target.value })} />
                    </Field>
                    <Field label="쓰는 배차망 (여러 개 가능)">
                        <div className="flex flex-wrap gap-2">
                            {NETWORK_OPTIONS.map(n => {
                                const on = state.info.networks.includes(n);
                                return (
                                    <Button key={n} type="button" size="sm" variant={on ? 'default' : 'outline'} onClick={() => setInfo({ networks: toggleNetwork(state.info.networks, n) })}>
                                        {on ? '✓ ' : ''}{n}
                                    </Button>
                                );
                            })}
                        </div>
                    </Field>
                    <Field label="주 활동 지역">
                        <Input placeholder="예: 광주 · 이천 · 여주" value={state.info.region} onChange={e => setInfo({ region: e.target.value })} />
                    </Field>
                    <Field label="유튜브 채널명 (선택 · 멤버 확인용)">
                        <Input placeholder="유튜브에서 쓰는 이름" value={state.info.youtubeChannel} onChange={e => setInfo({ youtubeChannel: e.target.value })} />
                    </Field>
                </SectionCard>
            )}

            {step === 'done' && (
                <SectionCard title="신청 내용">
                    <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
                        <dt className="text-text-muted">차종</dt><dd className="font-semibold">{state.info.vehicle || '—'}</dd>
                        <dt className="text-text-muted">연락처</dt><dd className="font-semibold">{state.info.phone || '—'}</dd>
                        <dt className="text-text-muted">배차망</dt><dd className="font-semibold">{state.info.networks.join(' · ') || '—'}</dd>
                        <dt className="text-text-muted">활동 지역</dt><dd className="font-semibold">{state.info.region || '—'}</dd>
                        <dt className="text-text-muted">유튜브</dt><dd className="font-semibold">{state.info.youtubeChannel || '(비움)'}</dd>
                    </dl>
                    <p className="text-xs text-text-muted">신청하면 관리자가 확인한 뒤 승인합니다. 승인 전에는 앱을 미리 받아 둘 수 있습니다.</p>
                </SectionCard>
            )}

            <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" className="flex-1" disabled={!prevOf(JOIN_STEPS, step)} onClick={() => go(prevOf(JOIN_STEPS, step))}>이전</Button>
                {step !== 'done'
                    ? <Button type="button" className="flex-[2]" disabled={!canProceed(step, state)} onClick={() => go(nextOf(JOIN_STEPS, step))}>다음</Button>
                    : <Button type="button" className="flex-[2]" disabled={sending} onClick={submit}>{sending ? '신청 중…' : '가입 신청'}</Button>}
            </div>
            <p className="text-center text-xs text-text-muted">
                이미 신청했나요? <Link to="/pending" className="underline">승인 대기 화면</Link> · 앱을 먼저 받으려면 <Link to="/join/apps" className="underline">앱 받기</Link>
            </p>
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
