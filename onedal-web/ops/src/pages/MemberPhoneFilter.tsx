import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    DEVICE_MODE_LABEL, SCREEN_PAGE_LABEL, TARGET_APP_LABEL, VERDICT_AXIS_LABEL, WORD_KIND_LABEL, appFilterRowsOf, clockText, deviceLabel, filterValueRowsOf, isTargetApp, summarizeTally, wonText, workStageLabel,
    type DeviceModeType, type IntelRow, type OpsBoardMember, type OpsBoardPhone, type ScreenPage, type WordKind,
} from '@onedal/shared';
import { api, useOps } from '../api/ops';
import { Card, ErrorBand, fmtTime, fmtWon } from '../ui';

/**
 * 📱 **회원 상세의 «폰 · 필터» 칸 — 관제웹 현황판의 그 기사 몫이 여기 다 있다** (기사님: «회원의 알타리 페이지로 들어가면 다 있어야» · 서버 `/api/ops/board/*` · 읽기만).
 *    🔴 카드 이름 · 순서는 관제웹 현황판(`client-app/src/statusboard/StatusBoard.tsx`)과 같은 글자다 — 기사님이 «같은 것이 다 있나»를 대조하신다(`opsBoardScreen` 검사가 두 파일의 글자를 견준다).
 *    넣지 않는 것: 🚨 어긋남(관제웹 화면끼리의 대조라 옮길 수 없다) · 서버로 값을 보내는 시험 도구(모의 주행 · 위치 찍기 · 개별콜 · 문제지 — 관리자가 남의 차를 움직이지 않는다).
 *    🖥️ 지금 무엇이 도는가는 회원 일이 아니라 «점검» 쪽 링크 · 📋 콜 리스트는 이 회원의 «오늘 콜» 칸 링크(같은 목록을 두 벌로 그리지 않는다).
 *    🔴 필터를 고치는 손잡이는 없다 — 기사 관제웹에 있다. 판정은 옮겨 적기만 한다(다시 재지 않는다). 상대시각(«N초 전»)은 쓰지 않는다. 10초마다 다시 읽는다.
 */
/** 📍 위치 출처 글자 — 관제웹 현황판 «📍 내 위치»와 같은 글자 한 벌(관제웹 파일을 건드리지 않으려 여기 따로 둔다 · 검사가 두 파일을 견준다) */
const LOCATION_SOURCE_LABEL: Record<string, string> = {
    gps: '📡 GPS',
    mock: '🧪 모의 주행',
    manual: '📍 손으로 찍음',
    home: '🏠 집 주소로 대신',
};
const modeKo = (m?: string) => m ? (DEVICE_MODE_LABEL[m as DeviceModeType] ?? m) : undefined;
/** 앱 판정 낱말 → 글 — 화면은 옮겨 적기만 한다(다시 재지 않는다) */
const verdictKo = (v: string | null) => v === 'pass' ? '통과' : v === 'locked' ? '잠겨 안 봄' : v ? `막힘 · ${VERDICT_AXIS_LABEL[v] ?? v}` : '— 구앱';

export default function MemberPhoneFilter({ memberId }: { memberId: string }) {
    const [tick, setTick] = useState(0);
    useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 10_000); return () => clearInterval(t); }, []);
    const { data, error, reload } = useOps(() => Promise.all([api.boardPhones(memberId), api.boardFilter(memberId), api.boardIntel(memberId, 40, true), api.boardMember(memberId)]), [memberId, tick]);
    const [phones, filter, intel, board] = data ?? [[], null, null, null];
    const [phoneId, setPhoneId] = useState('');
    const phone = phones.find(p => p.deviceId === phoneId) ?? phones[0];
    const shownFilter = filter?.active ?? filter?.base ?? null;
    /* 📦 폰이 받는 필터 — 서버가 폰 문과 같은 함수로 조립한 것(회원의 폰마다). 화면은 고르거나 다시 계산하지 않는다 */
    const [appPhoneId, setAppPhoneId] = useState('');
    const appPhone = filter?.app?.find(a => a.deviceId === appPhoneId) ?? filter?.app?.[0];
    const appRows = appPhone ? appFilterRowsOf(appPhone.filter) : [];

    /* 🎛️🗂️ «지금 어떤 판인가» · «영역»은 오늘 필터(filter.active)의 칸이다 — 세션이 없으면 active 가 null */
    const active = (filter?.active ?? null) as Record<string, unknown> | null;
    const groups = (active?.destinationGroups ?? null) as Record<string, string[]> | null;
    const groupKeys = groups ? Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length) : [];   // 관제웹과 같이 동이 많은 시군구부터
    const dongCount = groupKeys.reduce((n, k) => n + groups![k].length, 0);
    const noSession = <p className="text-sm text-text-muted">오늘 아직 접속 안 함 — 세션이 없어 서버가 쥔 값이 없습니다.</p>;

    return (
        <>
            {error && <ErrorBand text={error} onRetry={reload} />}
            <p className="text-sm"><Link to="/inspect" className="text-info hover:underline">🖥️ 지금 무엇이 도는가 — 점검에서 보기 →</Link></p>
            <div className="grid lg:grid-cols-2 gap-4">
                <NewWordsCard board={board} />
                <LocationCard board={board} />
                <Card title={`🎛️ 필터설정값 — ${filter ? (filter.active ? '오늘 쓰는 값 (평소와 다르면 옆에)' : '평소 설정 (오늘 세션 없음)') : '…'}`}>
                    {shownFilter && (
                        <div className="text-sm space-y-0.5">
                            {filterValueRowsOf(shownFilter as unknown as Record<string, unknown>, filter?.active ? filter.base as unknown as Record<string, unknown> : null)
                                .map(r => <Row key={r.path} k={r.label} v={r.text} tone={r.differs ? 'warn' : undefined} />)}
                            <Row k="요금" v={`${wonText(shownFilter.minFare) ?? '—'} ~ ${wonText(shownFilter.maxFare) ?? '—'}`} />
                            <Row k="제외 지역" v={shownFilter.excludedRegions?.length ? `${shownFilter.excludedRegions.length}곳 · ${shownFilter.excludedRegions.slice(0, 6).join(', ')}` : undefined} empty="— 없다" />
                        </div>
                    )}
                    {!shownFilter && <p className="text-sm text-text-muted">읽는 중…</p>}
                    <p className="text-xs text-text-muted">읽기만 — 필터를 고치는 손잡이는 기사 관제웹에 있습니다.</p>
                </Card>
                <Card title="📋 콜 리스트">
                    <p className="text-sm"><Link to={`/members/${memberId}?tab=calls`} className="text-info hover:underline">이 회원의 «오늘 콜» 칸에서 보기 →</Link></p>
                </Card>
                <Card title={`🗑️ 버린 콜 — 오늘 최근 ${intel?.rows.length ?? 0}건${intel ? ` / 오늘 ${intel.total}` : ''} (앱이 올린 콜 · 판정은 앱이 한 것)`}>
                    <div className="max-h-96 overflow-y-auto space-y-1">
                        {intel?.rows.length === 0 && <p className="text-sm text-text-muted">없습니다</p>}
                        {intel?.rows.map(r => <IntelLine key={r.id} r={r} />)}
                    </div>
                </Card>
                <Card title={`📦 앱에 내려갈 필터 — 폰이 받는 그대로${appPhone ? ` (${appRows.length}칸)` : ''}`}>
                    {filter && filter.app === null && <p className="text-sm text-text-muted">폰이 오늘 아직 보고 안 함 — 세션이 없어 서버가 조립할 것이 없습니다.</p>}
                    {filter?.app && filter.app.length === 0 && <p className="text-sm text-text-muted">등록된 폰이 없다 — 이 회원 계정에 이어진 배차망 폰이 없습니다.</p>}
                    {filter?.app && filter.app.length > 1 && (
                        <div className="flex flex-wrap gap-2">
                            {filter.app.map(a => (
                                <button key={a.deviceId} type="button" onClick={() => setAppPhoneId(a.deviceId)} className={`rounded-lg px-2 py-1 text-xs ${appPhone?.deviceId === a.deviceId ? 'bg-info/15 text-info font-bold' : 'bg-surface-alt text-text-muted'}`}>
                                    {deviceLabel({ deviceId: a.deviceId, deviceName: phones.find(p => p.deviceId === a.deviceId)?.deviceName })}
                                </button>
                            ))}
                        </div>
                    )}
                    {appPhone && <div className="grid grid-cols-2 gap-x-4 text-xs">{appRows.map(([k, v]) => <Row key={k} k={k} v={v} />)}</div>}
                    <p className="text-xs text-text-muted">서버가 폰에 답할 때 조립한 값 — 자동 반경 · 복귀 목적지 · 내일 콜 · 경로 순서가 들어 있어 «필터설정값»과 다를 수 있습니다.</p>
                </Card>
                <Card title="🎛️ 지금 어떤 판인가">
                    {filter && !active && noSession}
                    {active && (
                        <div className="text-sm space-y-0.5">
                            <Row k="callTarget" v={active.callTarget} empty="— 안 고른다(파생)" />
                            <Row k="dispatchPhase" v={active.dispatchPhase} />
                            <Row k="slotsUsed" v={active.slotsUsed} />
                            <Row k="capacityConfidence" v={active.capacityConfidence} />
                            <Row k="driverAction" v={active.driverAction} />
                            <Row k="userOverrides" v={active.userOverrides === undefined ? undefined : String(active.userOverrides)} />
                        </div>
                    )}
                    <p className="text-xs text-text-muted">서버 → 앱 · 국면 · 적재 · 손댐</p>
                </Card>
                <Card title={groupKeys.length ? `🗂️ 영역 — ${groupKeys.length}개 시군구 · ${dongCount}개 동` : '🗂️ 영역 — 시군구별'}>
                    {filter && !active && noSession}
                    {active && groupKeys.length === 0 && <Row k="(없음)" v={undefined} tone="warn" />}
                    {groupKeys.length > 0 && (
                        <details className="text-sm">
                            <summary className="cursor-pointer text-text-muted">앱이 하차지를 맞춰 보는 목록 펼치기</summary>
                            <div className="mt-1 space-y-0.5">{groupKeys.map(region => <Row key={region} k={region} v={`${groups![region].length}개`} />)}</div>
                        </details>
                    )}
                </Card>
                <Card title="🧾 필터 전문">
                    <details className="text-xs">
                        <summary className="cursor-pointer text-text-muted">서버가 준 그대로 — 칸에 없는 값은 여기 있다{shownFilter ? ` (${Object.keys(shownFilter).length}개 칸)` : ''}</summary>
                        <pre className="mt-2 leading-relaxed rounded-xl bg-bg-base border border-border-card p-3 overflow-x-auto max-h-80">{shownFilter ? JSON.stringify(shownFilter, null, 2) : ''}</pre>
                    </details>
                </Card>
                <JudgingCard board={board} />
            </div>
            <Card title="📱 폰 — 📡 이 폰이 든 필터 · 👁️ 폰이 일하고 있나 · 🔍 이 폰의 성적표 · 📊 누적 · 좌표 (배차망 폰만 — 관제앱 폰은 서버가 세지 않습니다)">
                <div className="flex flex-wrap gap-2">
                    {phones.map(p => (
                        <button key={p.deviceId} type="button" onClick={() => setPhoneId(p.deviceId)} className={`rounded-lg px-3 py-1.5 text-sm ${phone?.deviceId === p.deviceId ? 'bg-info/15 text-info font-bold' : 'bg-surface-alt text-text-muted'}`}>
                            <span className={p.status === 'ONLINE' ? 'text-success' : 'text-danger'}>●</span> {deviceLabel(p)}
                        </button>
                    ))}
                    {phones.length === 0 && <p className="text-sm text-text-muted">{data ? '연결한 폰이 없습니다' : '읽는 중…'}</p>}
                </div>
                {phone && <PhoneCards p={phone} />}
            </Card>
        </>
    );
}

/** 📰 새 글자 — 원달앱이 모르는 글자를 처음 봤을 때(배차망 앱이 바뀐 첫 신호). 서버가 모든 폰 것을 함께 준다 */
function NewWordsCard({ board }: { board: OpsBoardMember | null }) {
    const rows = board?.newWords ?? [];
    const line = (w: OpsBoardMember['newWords'][number]) => (
        <Row key={`${w.targetApp}${w.page}${w.kind}${w.word}`} k={`${w.targetApp} ${SCREEN_PAGE_LABEL[w.page as ScreenPage] ?? w.page}`}
            v={`‹${w.word}› ${WORD_KIND_LABEL[w.kind as WordKind] ?? w.kind}${w.sample ? ` — ${w.sample.slice(0, 40)}` : ''}`} />
    );
    return (
        <Card title={rows.length ? `📰 새 글자 — 최근 7일 ${rows.length}개 (모든 폰 공통)` : '📰 새 글자 (모든 폰 공통)'}>
            <div className="text-sm space-y-0.5">
                {!board && <Row k="지금" v={undefined} empty="읽는 중…" />}
                {board && rows.length === 0 && <Row k="최근 7일" v="처음 본 글자 없음" />}
                {rows.slice(0, 5).map(line)}
                {rows.length > 5 && (
                    <details><summary className="cursor-pointer text-xs text-text-muted">나머지 {rows.length - 5}개 보기</summary><div className="mt-1 space-y-0.5">{rows.slice(5).map(line)}</div></details>
                )}
            </div>
        </Card>
    );
}

/** 📍 내 위치 — 서버가 그 기사의 «지금 자리»로 쥔 것. 시각은 «마지막으로 GPS 를 받은 때»다(집 주소로 대신 쓸 때도 낡은 GPS 시각이 실린다) */
function LocationCard({ board }: { board: OpsBoardMember | null }) {
    const loc = board?.location ?? null;
    return (
        <Card title="📍 내 위치">
            <div className="text-sm space-y-0.5">
                {board && !loc && <p className="text-text-muted">오늘 아직 접속 안 함 — 세션이 없어 서버가 쥔 자리가 없습니다.</p>}
                {loc && <>
                    <Row k="출처" v={loc.source ? (LOCATION_SOURCE_LABEL[loc.source] ?? loc.source) : undefined} empty="— 모름" tone={loc.source === 'gps' ? undefined : 'warn'} />
                    <Row k="좌표" v={`${loc.lng.toFixed(5)}, ${loc.lat.toFixed(5)}`} />
                    <Row k="시 · 구" v={loc.region} />
                    <Row k="마지막 GPS 받은 시각" v={loc.at ? clockText(loc.at) : undefined} empty="— 모름 (받은 적 없다)" tone={loc.at ? undefined : 'warn'} />
                    {loc.isFallback && <p className="text-xs text-warning">GPS 가 낡아 다른 자리로 대신 쓰는 중 — 위 시각은 그 자리의 시각이 아니라 마지막 GPS 시각입니다.</p>}
                </>}
            </div>
            <p className="text-xs text-text-muted">서버가 쥔 것</p>
        </Card>
    );
}

/** ⚖️ 심사 중 — 집은 뒤 서버가 하는 일. 관제웹 심사석과 같은 콜 · 판정은 옮겨 적기만 한다 */
function JudgingCard({ board }: { board: OpsBoardMember | null }) {
    const j = board?.judging ?? null;
    return (
        <Card title="⚖️ 심사 중">
            <div className="text-sm space-y-0.5">
                {!j && <Row k="(없음)" v={undefined} empty={board ? '— 지금 심사하는 콜이 없다' : '읽는 중…'} />}
                {j && <>
                    <Row k="콜" v={`${j.pickup ?? '—'} → ${j.dropoff ?? '—'}`} />
                    <Row k="status" v={j.status} />
                    <Row k="미리보기" v={j.isPreview ? 'true' : 'false'} />
                    <Row k="요금" v={j.fare} />
                    <Row k="판정" v={j.judgment ? `${j.judgment.color} ${j.judgment.score ?? '못 잼'}` : undefined} tone={!j.judgment || j.judgment.color === '사고' ? 'warn' : undefined} />
                    {j.judgment?.gates?.filter(g => !g.pass).map(g => <Row key={g.key} k={`⛔ ${g.name}`} v={g.why ?? '막혔다'} tone="warn" />)}
                    {j.judgment?.axes?.map(a => <Row key={a.key} k={a.name} v={a.score == null ? `못 잼 (${a.raw})` : `${a.score} · ${a.raw}`} />)}
                </>}
            </div>
        </Card>
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
                <div className={head}>🔍 이 폰의 성적표</div>
                {sum
                    ? <><Row k="본 콜 → 통과" v={`${sum.seen} → ${sum.passed}`} tone={sum.passed > 0 ? undefined : 'warn'} />{sum.rejects.map(([name, n]) => <Row key={name} k={`막힘 ${name}`} v={n} />)}<Row k="잰 시각" v={sum.at} /></>
                    : <Row k="성적표" v={undefined} empty="— 이번 보고엔 없다" tone="warn" />}
            </div>
            <div className={box}>
                <div className={head}>📊 누적 · 좌표</div>
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
