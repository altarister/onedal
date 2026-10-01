import { useEffect, useState } from 'react';
import {
    DEVICE_MODE_LABEL, TARGET_APP_LABEL, VERDICT_AXIS_LABEL, appFilterRowsOf, clockText, deviceLabel, isTargetApp, summarizeTally, workStageLabel,
    type DeviceModeType, type IntelRow, type OpsBoardPhone,
} from '@onedal/shared';
import { api, useOps } from '../api/ops';
import { Card, ErrorBand, fmtTime, fmtWon } from '../ui';

/**
 * 📱 **회원 상세의 «폰 · 필터» 칸** — 이 회원의 폰이 일하고 있나 · 폰이 받는 필터 · 기사가 정한 값 · 앱이 올린/버린 콜(reviews/33 · 서버 `/api/ops/board/*` · 읽기만).
 *    «왜 콜을 안 잡았나»를 여기서 본다. 열람 기록은 서버가 남긴다(열어 둔 동안 한 줄). 10초마다 다시 읽는다.
 *    🔴 필터를 고치는 손잡이는 없다 — 기사 관제웹에 있다. 앱 판정은 옮겨 적기만 한다(다시 재지 않는다).
 */
const modeKo = (m?: string) => m ? (DEVICE_MODE_LABEL[m as DeviceModeType] ?? m) : undefined;
/** 앱 판정 낱말 → 글 — 화면은 옮겨 적기만 한다(다시 재지 않는다) */
const verdictKo = (v: string | null) => v === 'pass' ? '통과' : v === 'locked' ? '잠겨 안 봄' : v ? `막힘 · ${VERDICT_AXIS_LABEL[v] ?? v}` : '— 구앱';

export default function MemberPhoneFilter({ memberId }: { memberId: string }) {
    const [tick, setTick] = useState(0);
    useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 10_000); return () => clearInterval(t); }, []);
    const { data, error, reload } = useOps(() => Promise.all([api.boardPhones(memberId), api.boardFilter(memberId), api.boardIntel(memberId)]), [memberId, tick]);
    const [phones, filter, intel] = data ?? [[], null, null];
    const [phoneId, setPhoneId] = useState('');
    const phone = phones.find(p => p.deviceId === phoneId) ?? phones[0];
    const shownFilter = filter?.active ?? filter?.base ?? null;
    /* 📦 폰이 받는 필터 — 서버가 폰 문과 같은 함수로 조립한 것(회원의 폰마다). 화면은 고르거나 다시 계산하지 않는다 */
    const [appPhoneId, setAppPhoneId] = useState('');
    const appPhone = filter?.app?.find(a => a.deviceId === appPhoneId) ?? filter?.app?.[0];
    const appRows = appPhone ? appFilterRowsOf(appPhone.filter) : [];

    return (
        <>
            {error && <ErrorBand text={error} onRetry={reload} />}
            <Card title="📱 폰 — 이 폰이 든 필터 · 일하고 있나 · 성적표 · 누적 (배차망 폰만 — 관제앱 폰은 서버가 세지 않습니다)">
                <div className="flex flex-wrap gap-2">
                    {phones.map(p => (
                        <button key={p.deviceId} type="button" onClick={() => setPhoneId(p.deviceId)} className={`rounded-lg px-3 py-1.5 text-sm ${phone?.deviceId === p.deviceId ? 'bg-info/15 text-info font-bold' : 'bg-surface-alt'}`}>
                            <span className={p.status === 'ONLINE' ? 'text-success' : 'text-danger'}>●</span> {deviceLabel(p)}
                        </button>
                    ))}
                    {phones.length === 0 && <p className="text-sm text-text-muted">{data ? '연결한 폰이 없습니다' : '읽는 중…'}</p>}
                </div>
                {phone && <PhoneCards p={phone} />}
            </Card>
            <div className="grid lg:grid-cols-2 gap-4">
                <div className="space-y-4">
                    <Card title={`📦 앱에 내려갈 필터 — 폰이 받는 그대로${appPhone ? ` (${appRows.length}칸)` : ''}`}>
                        {filter && filter.app === null && <p className="text-sm text-text-muted">폰이 오늘 아직 보고 안 함 — 세션이 없어 서버가 조립할 것이 없습니다.</p>}
                        {filter?.app && filter.app.length === 0 && <p className="text-sm text-text-muted">등록된 폰이 없다 — 이 회원 계정에 이어진 배차망 폰이 없습니다.</p>}
                        {filter?.app && filter.app.length > 1 && (
                            <div className="flex flex-wrap gap-2">
                                {filter.app.map(a => (
                                    <button key={a.deviceId} type="button" onClick={() => setAppPhoneId(a.deviceId)} className={`rounded-lg px-2 py-1 text-xs ${appPhone?.deviceId === a.deviceId ? 'bg-info/15 text-info font-bold' : 'bg-surface-alt'}`}>
                                        {deviceLabel({ deviceId: a.deviceId, deviceName: phones.find(p => p.deviceId === a.deviceId)?.deviceName })}
                                    </button>
                                ))}
                            </div>
                        )}
                        {appPhone && <div className="grid grid-cols-2 gap-x-4 text-xs">{appRows.map(([k, v]) => <Row key={k} k={k} v={v} />)}</div>}
                        <p className="text-xs text-text-muted">서버가 폰에 답할 때 조립한 값 — 자동 반경 · 복귀 목적지 · 내일 콜 · 경로 순서가 들어 있어 아래 «기사가 정한 값»과 다를 수 있습니다.</p>
                    </Card>
                    <Card title={`🧾 기사가 정한 값 — ${filter ? (filter.active ? '오늘 쓰는 값(세션)' : '평소 설정(오늘 세션 없음)') : '…'}`}>
                        <pre className="text-xs leading-relaxed rounded-xl bg-bg-base border border-border-card p-3 overflow-x-auto max-h-80">{shownFilter ? JSON.stringify(shownFilter, null, 2) : '읽는 중…'}</pre>
                        <p className="text-xs text-text-muted">읽기만 — 필터를 고치는 손잡이는 기사 관제웹에 있습니다.</p>
                    </Card>
                </div>
                <Card title={`🗑️ 앱이 올린 콜 — 최근 ${intel?.rows.length ?? 0}건${intel ? ` / 쌓인 ${intel.total}` : ''} (판정은 앱이 한 것)`}>
                    {intel?.rows.length === 0 && <p className="text-sm text-text-muted">없습니다</p>}
                    {intel?.rows.map(r => <IntelLine key={r.id} r={r} />)}
                </Card>
            </div>
        </>
    );
}

function IntelLine({ r }: { r: IntelRow }) {
    const app = r.targetApp && isTargetApp(r.targetApp) ? TARGET_APP_LABEL[r.targetApp] : r.targetApp ?? '';
    return (
        <div className="text-sm flex justify-between gap-2 border-t border-border-card first:border-t-0 pt-1 first:pt-0">
            <span className="min-w-0"><span className="text-text-muted">{fmtTime(r.timestamp)}</span> {app} · {r.pickup} → {r.dropoff}{r.fare != null ? ` · ${fmtWon(r.fare)}` : ''}{r.vehicleType ? ` · ${r.vehicleType}` : ''}</span>
            <span className={`shrink-0 ${r.verdict === 'pass' ? 'text-success' : 'text-warning'}`}>{verdictKo(r.verdict)}</span>
        </div>
    );
}

function PhoneCards({ p }: { p: OpsBoardPhone }) {
    const sum = summarizeTally(p.filterTally, p.filterTallyAt);
    const gapSec = p.prevSeen ? Math.round((p.lastSeen - p.prevSeen) / 1000) : null;
    const box = 'rounded-xl border border-border-card p-3 space-y-1';
    const head = 'text-xs font-bold text-text-muted';
    return (
        <div className="grid md:grid-cols-4 gap-3 text-sm">
            <div className={box}>
                <div className={head}>📡 이 폰이 든 필터</div>
                <Row k="든 필터 지문" v={p.filterVersion} empty="— 구앱은 안 싣는다" tone={p.filterVersion ? undefined : 'warn'} />
                <Row k="그 지문을 본 때" v={clockText(p.filterVersionAt)} />
                <Row k="모드 (관제 명령)" v={modeKo(p.mode)} />
                <Row k="모드 (실제 도는)" v={modeKo(p.effectiveMode)} empty="— 구앱은 안 싣는다" tone={p.effectiveMode && p.effectiveMode !== p.mode ? 'warn' : undefined} />
            </div>
            <div className={box}>
                <div className={head}>👁️ 폰이 일하고 있나</div>
                <Row k="마지막 보고" v={clockText(p.lastSeen)} />
                <Row k="직전과 간격" v={gapSec != null ? `${gapSec}초` : undefined} empty="— 첫 보고" />
                <Row k="읽은 노드" v={p.screenNodeCount} tone={p.screenNodeCount === 0 ? 'warn' : undefined} />
                <Row k="못 읽은 지" v={clockText(p.blindSince)} empty="— 읽고 있다" tone={p.blindSince ? 'warn' : undefined} />
                <Row k="화면" v={p.isScreenOn === undefined ? undefined : p.isScreenOn ? '켜짐' : '💤 꺼짐'} tone={p.isScreenOn === false ? 'warn' : undefined} />
                <Row k="작업 단계" v={workStageLabel(p) ?? undefined} empty="— 구앱은 안 보냄" />
            </div>
            <div className={box}>
                <div className={head}>🔍 이 폰의 성적표 (마지막 보고)</div>
                {sum
                    ? <><Row k="본 콜 → 통과" v={`${sum.seen} → ${sum.passed}`} tone={sum.passed > 0 ? undefined : 'warn'} />{sum.rejects.map(([name, n]) => <Row key={name} k={`막힘 ${name}`} v={n} />)}<Row k="잰 시각" v={sum.at} /></>
                    : <Row k="성적표" v={undefined} empty="— 이번 보고엔 없다" tone="warn" />}
            </div>
            <div className={box}>
                <div className={head}>📊 누적</div>
                <Row k="목록 조회 · 잡음" v={`${p.stats?.polled ?? 0} · ${p.stats?.grabbed ?? 0}`} />
                <Row k="취소 통보" v={p.stats?.canceled} />
                <Row k="위치" v={p.hasLocation ? '보냄' : '안 보냄'} />
                <Row k="앱" v={p.version ? `v${p.version}` : undefined} />
            </div>
        </div>
    );
}

function Row({ k, v, tone, empty = '—' }: { k: string; v: unknown; tone?: 'warn'; empty?: string }) {
    const text = v == null || v === '' ? null : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return (
        <div className="flex justify-between gap-2">
            <span className="text-text-muted shrink-0">{k}</span>
            <span className={`text-right break-all ${tone === 'warn' ? 'text-warning font-bold' : text == null ? 'text-text-muted' : 'font-semibold'}`}>{text ?? empty}</span>
        </div>
    );
}
