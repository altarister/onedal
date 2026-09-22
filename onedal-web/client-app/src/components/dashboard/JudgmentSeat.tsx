import { useMemo, useState } from 'react';
import type { SecuredOrder, CallTarget } from '@onedal/shared';
import { isManualLineage, safeCancelSecOf, SERVER_CLEANUP_EXTRA_SEC } from '@onedal/shared';
import { useSettingsStore } from '../../stores/settingsStore';
import { verdictOf, type VerdictColor } from '../../lib/verdict';
import { getAddressLabel, hhmm } from '../../lib/routeUtils';
import { seatConclusion } from '../../lib/seatConclusion';
import { useFilterConfig } from '../../hooks/useFilterConfig';

/**
 * 🪧 **심사석** — 평가·미리보기 콜이 필터 자리를 빌려 쓰는 판 (기사님 확정 0831 · 와이어프레임 v13).
 *
 * 🔴 수치는 v13(judging-seat-wireframe-v13.html)을 **그대로** 옮긴다 — 어림 치환 금지
 *    (0831 실측: 어림으로 옮기니 "완전 다른 모양"이 됐다). 바꿀 땐 와이어프레임 먼저.
 * 문법: 색은 «물듦»(직접·알람) 또는 «버튼»(자동), 점수는 워터마크, 글은 세 줄.
 * 판정 전엔 무채색 — 색을 지어내지 않는다 (규칙 ④). 결정: 직접·알람은 스캔앱, 자동은 버튼 35:65.
 */

/**
 * 🎨 **판정색 한 벌** — 심사석과 «한 줄 심사석»이 같은 색을 쓴다 (2026-09-05).
 *    색이 곧 기사님의 결정이라(규칙 ⑤-3), 자리마다 색이 다르면 그게 가장 큰 사고다.
 */
export const SOAK: Record<VerdictColor, { tint: string; bar: string; text: string; glow: string; wm: string }> = {
    '꿀':   { tint: 'rgba(79,141,249,.30)', bar: '#4f8df9', text: '#9db9ff', glow: 'rgba(79,141,249,.5)',  wm: 'rgba(79,141,249,.16)' },
    '보통': { tint: 'rgba(47,158,110,.28)', bar: '#2f9e6e', text: '#7fd8ab', glow: 'rgba(47,158,110,.45)', wm: 'rgba(47,158,110,.15)' },
    '똥':   { tint: 'rgba(230,180,34,.30)', bar: '#e6b422', text: '#f0d27a', glow: 'rgba(230,180,34,.45)', wm: 'rgba(230,180,34,.15)' },
    '사고': { tint: 'rgba(224,85,99,.30)',  bar: '#e05563', text: '#f09aa4', glow: 'rgba(224,85,99,.45)',  wm: 'rgba(224,85,99,.15)' },
};
// 테마를 따른다 — 다크 고정색은 라이트 테마에서 이질적이었다 (기사님 0831)
const CARD_BG = 'linear-gradient(180deg, var(--color-surface-alt), var(--color-surface))';
/** 호칭의 타겟명 — 용어집 조합 규칙. 🔴 관내는 파생이라 여기 없다 (C4-8b-2) */
const TARGET_NAME: Record<CallTarget, string> = { DEST: '노선', HOME: '복귀' };

const cleanRoute = (t?: string) => (t ?? '')
    .replace(/'(꿀|똥|콜|보통|사고)'/g, '').replace(/\[(추천|최단거리|최단시간)\]/g, '')
    .replace(/[🚙💩🍯]/g, '').replace(/\s{2,}/g, ' ').trim();

/** v13 둘째 줄 리듬 «11.5km · 15분 (상차 10분)» — 못 읽으면 서버 원문 그대로 (지어내지 않는다) */
function routeLine(distanceKm: number | undefined, ext: string): string {
    const mins = ext.match(/소요\s*(\d+)분/)?.[1];
    const approach = ext.match(/상차지?까지\s*(\d+)분/)?.[1];
    if (distanceKm && mins) return `${distanceKm}km · ${mins}분${approach ? ` (상차 ${approach}분)` : ''}`;
    return ext;
}

/** 호칭 — 타겟명 + 첫짐(생략)/합짐N + 후보콜 (용어집 조합 규칙) */
export function candidateName(target: CallTarget, confirmedActive: number): string {
    const t = TARGET_NAME[target];
    return confirmedActive <= 0 ? `${t} 후보콜` : `${t} 합짐${confirmedActive} 후보콜`;
}

interface Props {
    route: SecuredOrder;
    /**
     * 📐 **바깥 여백은 놓는 쪽이 정한다** (기사님 2026-09-05:
     * *"일반 콜리스트와 거리를 둔 이유가 있어? 그냥 콜리스트와 같은 간격이면 좋겠어"*).
     *
     * 🔴 컴포넌트가 자기 여백을 들고 다니면 **어디에 놓든 그 여백이 따라와** 옆의 것과
     *    간격이 어긋난다. 판정이 콜 목록 바로 아래 붙는 자리에서는 **목록과 같은 값**이라야
     *    한 표처럼 읽힌다. 안 주면 지금까지의 값 그대로다 (실물은 안 바뀐다).
     */
    inset?: string;
    confirmedActive: number;
    onDecision?: (id: string, action: 'ORDER_CONFIRMED' | 'SAFE_CANCEL' | 'ORDER_RELEASED_BY_ME' | 'ORDER_RELEASED_BY_OFFICE') => void;
    processingId?: string | null;
    setProcessingId?: (id: string | null) => void;
}

export default function JudgmentSeat({ route, confirmedActive, inset, onDecision, processingId, setProcessingId }: Props) {
    const [open, setOpen] = useState(false);
    const { filter } = useFilterConfig();
    const v = verdictOf(route);
    // 🐥 가상 체험 모드(isSimulated)에서는 픽커 미리보기 콜이어도 관제탑에서 KEEP/거절 결재 버튼(35:65)을 노출한다
    const manual = !route.isSimulated && (isManualLineage(route.type) || !!route.isPreview);
    /** ⏱️ 그 배차망의 안전취소 초 (서버 DB) — 픽커는 안전취소가 없어 null */
    const cancelSec = useSettingsStore(st => safeCancelSecOf(st, route.targetApp));
    /**
     * 👀 **미리보기는 언제 사라지나** — 서버가 «픽커 상세 대기 시간 + 정리 여유» 뒤 스스로 치운다 (#155).
     * 🔴 흐른 만큼 **미리 차 있게** 한다(`animationDelay` 에 음수) — 새로고침했다고 처음부터 다시 차오르면 화면이 거짓말한다.
     * 🔴 **그 값은 콜마다 한 번만 센다** — 다시 그릴 때마다 `Date.now()` 를 새로 재면 시작점이 흔들려 배경이 튄다.
     */
    /**
     * ⏱️ **길이는 서버가 고른 배차망별 값이다** (`judgeUntil`).
     *    인성 · 화물24시는 안전취소 시간, 픽커는 상세 대기 시간 — 여기서 배차망을 다시 가르지 않는다 (규칙 ③).
     * 🔴 **이 배경이 다 차도 카드는 안 사라진다** — 끄는 것은 폰의 화면 상태 하나다.
     *    옛 코드는 픽커 값 하나로 세고 있었고, 그때는 서버 타이머가 실제로 치웠다.
     */
    const pickerHoldSec = useSettingsStore(st => st.pickerAlarmDetailSec);
    const previewHoldSec = route.judgeUntil && route.capturedAt
        ? Math.max(1, (route.judgeUntil - Date.parse(route.capturedAt)) / 1000)
        : pickerHoldSec + SERVER_CLEANUP_EXTRA_SEC;
    const previewElapsedSec = useMemo(
        () => (route.isPreview && route.capturedAt ? Math.max(0, (Date.now() - Date.parse(route.capturedAt)) / 1000) : 0),
        [route.isPreview, route.capturedAt],
    );
    const judged = !!v.color;
    const c = v.color ? SOAK[v.color] : null;
    const hourly = route.judgment?.axes?.find(a => a.key === 'money')?.value;
    const score = route.judgment?.score;
    const routeText = cleanRoute(route.kakaoTimeExt);
    const negatives = route.rejectionReasons ?? [];
    const positives = route.approvalReasons ?? [];
    const busy = processingId === route.id;
    const name = candidateName(filter?.callTarget ?? 'DEST', confirmedActive);
    /**
     * 🧾 **기존 콜이 어떻게 되나** — 결론은 `seatConclusion` 한 곳 (전수표 #45 #46 · 목업 «④ 후보콜에 대한 심사 결론»).
     *    합짐 심사 때만 있다. 모르면 «❓ 모른다», 늦으면 가장 늦는 정거장, 아니면 «안 밀린다».
     */
    const conclusion = seatConclusion(route.judgment);
    const conclusionClass = conclusion?.kind === 'unknown' ? 'text-danger' : conclusion?.kind === 'late' ? 'text-warning' : 'text-success';
    /**
     * ⏱️ **더 쓰는 시간** — 판정이 시급의 분모로 쓴 분 (전수표 #42 · 목업 시트 심사 카드).
     *    합짐만 적는다 — 둘째 줄의 «+km, +분»은 주행 증가분뿐이라, 정차까지 더한 «시급의 분»은 따로 말해야 한다.
     */
    const extraLine = confirmedActive > 0 && route.judgment?.extraMin != null
        ? <span style={{ opacity: .75 }}> · 더 쓰는 {route.judgment.extraMin}분</span> : null;

    /* ── v13 .row: 42px · 0 16px · gap 10 · 14px ── */
    const header = (
        <div className="flex items-center relative z-10" style={{ gap: 10, padding: '0 16px', minHeight: 42, fontSize: 14, borderBottom: '1px solid var(--color-border-card)' }}>
            {manual && <span style={{ borderRadius: 7, padding: '3px 10px', fontSize: 12, fontWeight: 800, background: 'rgba(79,141,249,.14)', color: '#9db9ff', border: '1px solid rgba(79,141,249,.35)' }}>
                {route.capturedVia === 'ALARM' ? '🔔' : '✋'}</span>}
            {route.isSimulated && <span style={{ borderRadius: 7, padding: '3px 8px', fontSize: 11, fontWeight: 900, background: 'rgba(56,189,248,.18)', color: '#38bdf8', border: '1px solid rgba(56,189,248,.4)' }}>
                🐥 체험</span>}
            {/**
              * 🔢 **잡으면 목록의 몇 번이 되나** (기사님 2026-09-05:
              *    *"이걸 클릭하면 2번이 될 거라고 보이면 좋겠어"*).
              * 🔴 목록의 순번과 **같은 모양·같은 자리**로 둔다 — 그래야 눈이
              *    «이게 저기 들어간다»를 잇는다. 확정된 콜 수 + 1 이 그 번호다.
              */}
            <span className="shrink-0 tabular-nums" style={{ width: 12, fontSize: 13.5, fontWeight: 900, color: c ? c.text : 'var(--color-text-muted)' }}>
                {confirmedActive + 1}
            </span>
            <span style={{ fontWeight: 900, fontSize: 14.5, letterSpacing: '-.3px' }} className="whitespace-nowrap">{name}</span>
            <span className="truncate" style={{ color: 'var(--color-text-muted)', fontSize: 12.5, fontWeight: 700 }}>
                {getAddressLabel(route.pickup)} → {getAddressLabel(route.dropoff)}
            </span>
            <span className="ml-auto flex items-baseline shrink-0" style={{ gap: 10 }}>
                {/**
                  * 🔴 **«꿀 · 보통 · 똥»을 글자로 안 적는다** (기사님 2026-09-05:
                  *    *"우린 색으로 구분하면 되니까"*).
                  *    색은 왼쪽 띠·워터마크·KEEP 버튼이 **이미 세 번** 말하고 있었다.
                  *    같은 것을 네 번째로 적으면 그만큼 금액이 늦게 읽힌다 (규칙 ⑤-3).
                  * ⚠️ 판정 **전**에는 적는다 — 그건 색이 아직 없어서 아무도 말해 주지 않는다.
                  */}
                {!judged && <span className="animate-pulse" style={{ color: 'var(--color-text-muted)', fontSize: 13, fontWeight: 800 }}>판정 중…</span>}
                <span className="tabular-nums" style={{ fontSize: 19, fontWeight: 900 }}>
                    {route.fare > 0 ? `${(route.fare / 10000).toFixed(1)}만원` : '금액미상'}
                </span>
            </span>
        </div>
    );

    // ── 직접·알람: 물든 판 (보기만) — v13 .soak ──
    if (manual) {
        return (
            <div className="relative overflow-hidden flex flex-col" style={{ margin: inset ?? '8px 12px', borderRadius: 14, border: `1px solid ${c ? `${c.bar}73` : '#2a3450'}`, background: CARD_BG, boxShadow: '0 8px 28px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.04)', height: open ? 'auto' : 158, minHeight: 158 }}>
                {/**
                  * ⏳ 미리보기 장막 — 서버가 치울 때까지 배경이 **오른쪽에서 왼쪽으로** 차오른다. 다 차면 카드가 저절로 사라진다.
                  * 🔴 `width` 가 아니라 `transform` 으로 늘린다 — 폭을 재우면 글자 배치를 매 프레임 다시 계산해 눈에 띄게 튄다.
                  * 🔴 **경계선을 긋지 않는다** — 지나가는 선이 눈을 끌어 금액·판정 색보다 먼저 읽힌다 (규칙 ⑤-3).
                  */}
                {route.isPreview && <div className="absolute inset-0 z-0 pointer-events-none"
                     style={{ background: 'linear-gradient(270deg, rgba(0,0,0,.45), rgba(0,0,0,.10))', transformOrigin: 'right center',
                              animation: `seat-drain-x ${previewHoldSec}s linear forwards`, animationDelay: `-${previewElapsedSec.toFixed(1)}s` }} />}
                {judged && <div className="absolute inset-0 z-0" style={{ background: `linear-gradient(165deg, ${c!.tint} 0%, rgba(0,0,0,0) 45%, transparent 100%)` }} />}
                <div className="absolute left-0 top-0 bottom-0 z-10" style={{ width: 5, background: c ? `linear-gradient(180deg, ${c.bar}, ${c.bar}59)` : '#3a4358', boxShadow: c ? `2px 0 14px ${c.glow}` : undefined }} />
                {/* v13 .wm — 158px · right 2 · bottom -34 */}
                <div className="absolute z-0 font-black leading-none select-none pointer-events-none tabular-nums"
                     style={{ right: 2, bottom: -34, fontSize: 158, letterSpacing: '-5px',
                              color: judged ? c!.wm : 'color-mix(in srgb, var(--color-text-primary) 8%, transparent)', textShadow: judged ? `0 0 60px ${c!.glow.replace('.5', '.25')}` : 'none',
                              ...(judged ? {} : { animation: 'pulse 1.2s ease-in-out infinite' }) }}>
                    {judged ? score ?? '' : '?'}
                </div>
                {header}
                {/* 👀 미리보기는 **누르면 치운다** — 배차망엔 아무 일도 안 생기고(안 잡은 콜) 취소 한도도 안 깎인다. 펼치기는 안 쓴다 (운전 중 두 손짓은 못 기억한다) */}
                <div className="relative z-10 tabular-nums cursor-pointer" style={{ padding: '8px 16px 12px 21px' }}
                     onClick={() => route.isPreview ? onDecision?.(route.id, 'SAFE_CANCEL') : judged && setOpen(o => !o)}>
                    {judged ? (<>
                        {/* v13 .core .l1 — 27px */}
                        <div style={{ fontSize: 27, fontWeight: 900, letterSpacing: '-.5px', lineHeight: 1.15 }}>
                            {hourly != null ? <>{hourly.toFixed(1)}만<span style={{ fontSize: 14, color: 'var(--color-text-muted)', fontWeight: 700 }}>/h</span></> : <span style={{ fontSize: 15 }}>{v.reason}</span>}
                        </div>
                        {/* v13 .l2 — 14.5px */}
                        <div className="truncate" style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: '-.2px', marginTop: 5 }}>{routeLine(route.distanceKm, routeText) || '경로 계산됨'}{extraLine}</div>
                        {/* v13 .l3 — 12.5px · 걸리는 것만 */}
                        <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 4, color: negatives.length ? c!.text : 'var(--color-text-muted)' }}>
                            {negatives.length ? negatives.join(' · ') : '걸리는 것 없음'} · 근거 {open ? '▴' : '▾'}
                        </div>
                        {conclusion && (
                            <div className={`truncate ${conclusionClass}`} style={{ fontSize: 12.5, fontWeight: 800, marginTop: 3 }}>{conclusion.text}</div>
                        )}
                        {open && positives.length > 0 && (
                            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--color-text-muted)' }}>✅ {positives.join(' · ')}</div>
                        )}
                        {open && route.judgment && (
                            <div className="mt-2 flex flex-col gap-1 rounded-md border border-border bg-surface-alt/40 px-2.5 py-2" style={{ fontSize: 12 }}>
                                {route.judgment.gates.map(g => <div key={g.key} className={g.pass ? 'text-text-muted' : 'text-danger font-bold'}>{g.pass ? '✅' : '🔴'} {g.name}{!g.pass && g.why ? ` — ${g.why}` : ''}</div>)}
                                {route.judgment.axes.map(a => <div key={a.key}><b>{a.name}</b> {a.raw} <span className="text-text-muted">({a.score ?? '—'}점{a.weight !== 1 ? ` ×${a.weight}` : ''})</span></div>)}
                                {/* 🧾 기존 콜 정거장마다 «약속 → 예정 (±)» — 이 후보를 받으면 (전수표 #43 #47 · 하차 약속이 곧 시한이다) */}
                                {(route.judgment.stops ?? []).length > 0 && (
                                    <div className="mt-1 flex flex-col gap-0.5 border-t border-border pt-1 tabular-nums">
                                        <div className="text-text-muted font-bold">기존 콜 — 이 후보를 받으면</div>
                                        {(route.judgment.stops ?? []).map((st, k) => (
                                            <div key={k} className={`flex justify-between gap-2 ${st.arrived ? 'text-text-muted' : ''}`}>
                                                <span className="truncate">{st.name}{st.arrived ? ' · 지남' : ''}</span>
                                                <span className="shrink-0">
                                                    <span className="text-text-muted">{st.promisedAt ? hhmm(st.promisedAt) : '--:--'}{st.confirmed ? '' : '~'} → </span>
                                                    <b>{st.etaAt ? hhmm(st.etaAt) : '모름'}</b>
                                                    {st.lateMin != null && !st.arrived && (
                                                        <b className={st.lateMin > 0 ? 'text-warning' : 'text-success'}> ({st.lateMin > 0 ? '+' : ''}{st.lateMin}분)</b>
                                                    )}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </>) : (<>
                        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-text-muted)' }}>📄 상세 읽는 중 — 판정을 기다립니다</div>
                        <div className="animate-pulse" style={{ height: 12, width: 230, borderRadius: 6, background: 'color-mix(in srgb, var(--color-text-primary) 8%, transparent)', marginTop: 8 }} />
                        <div className="animate-pulse" style={{ height: 12, width: 180, borderRadius: 6, background: 'color-mix(in srgb, var(--color-text-primary) 8%, transparent)', marginTop: 8 }} />
                    </>)}
                    {/* 👀 미리보기 — 무엇을 하면 되는지 한 줄. 남은 시간은 배경이 말한다 (숫자를 세려고 매초 다시 그리지 않는다) */}
                    {route.isPreview && (
                        <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, color: 'var(--color-text-muted)' }}>
                            👀 미리보기 — 눌러서 치우기 · 폰에서 상세를 닫으면 사라집니다
                        </div>
                    )}
                </div>
                {/* ⏳ 배경이 차오르는 문법 — 오른쪽 끝에 붙어 왼쪽으로 늘어난다 (자동콜 판의 `seat-drain` 과 다른 이름인 것은 일부러다: 그쪽은 폭을 잰다) */}
                <style>{`@keyframes seat-drain-x { from { transform: scaleX(0) } to { transform: scaleX(1) } }`}</style>
            </div>
        );
    }

    // ── 자동콜: 아래 전체가 버튼 35:65 — v13 .btns ──
    return (
        <div className="relative overflow-hidden flex flex-col" style={{ margin: inset ?? '8px 12px', borderRadius: 14, border: '1px solid rgba(79,141,249,.35)', background: CARD_BG, boxShadow: '0 8px 28px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.04)', height: 158 }}>
            {header}
            <div className="flex relative z-10" style={{ gap: 9, padding: '8px 13px 13px', flex: 1, minHeight: 0 }}>
                <button disabled={!judged || busy}
                    onClick={() => { setProcessingId?.(route.id); onDecision?.(route.id, 'SAFE_CANCEL'); }}
                    className="text-left disabled:opacity-40 overflow-hidden"
                    style={{ flex: 35, borderRadius: 11, padding: '8px 12px', fontSize: 13.5, fontWeight: 700, lineHeight: 1.7,
                             background: 'linear-gradient(180deg,#3a1518,#2c1013)', color: '#e79aa2', border: '1px solid rgba(224,85,99,.35)' }}>
                    {/* ❓ 기존 콜 도착을 모르면 거절 쪽 맨 위에 — 모르는 것이 «걸리는 것 없음»으로 읽히지 않게 (전수표 #45) */}
                    {judged ? ([conclusion?.kind === 'unknown' ? '❓ 기존 콜 도착 모름' : null, ...negatives.map(r => `❌ ${r}`)].filter(Boolean).join('\n') || '거절') : '❌ —'}
                </button>
                <button disabled={!judged || busy}
                    onClick={() => { setProcessingId?.(route.id); onDecision?.(route.id, 'ORDER_CONFIRMED'); }}
                    className="text-left relative overflow-hidden tabular-nums disabled:opacity-60"
                    style={judged
                        ? { flex: 65, borderRadius: 11, padding: '8px 12px', background: `linear-gradient(180deg, ${c!.bar}, ${c!.bar}cc)`, color: '#181818', boxShadow: `0 0 24px ${c!.glow}, inset 0 1px 0 rgba(255,255,255,.35)` }
                        : { flex: 65, borderRadius: 11, padding: '8px 12px', background: 'linear-gradient(180deg,#232c42,#1b2234)', color: 'var(--color-text-muted)', border: '1px solid #1c2436' }}>
                    {/* v13 .bwm — 124px · right 0 · bottom -26 */}
                    <div className="absolute z-0 font-black leading-none select-none tabular-nums"
                         /* 🔴 **-25px** (기사님 2026-09-05). 숫자가 서로 겹칠 만큼 뭉쳐야
                            «읽는 값»이 아니라 «바탕»으로 물러난다 — 앞의 시급이 먼저 읽힌다 */
                         style={{ right: 0, bottom: -26, fontSize: 124, letterSpacing: '-25px', color: judged ? 'rgba(0,0,0,.18)' : 'color-mix(in srgb, var(--color-text-primary) 8%, transparent)' }}>
                        {judged ? score ?? '' : '?'}
                    </div>
                    {/* ⏳ 안전취소 장막 — 그 배차망의 안전취소 시간만큼 차오르면 자동취소 · 픽커는 안전취소가 없어 안 건다 */}
                    {judged && cancelSec != null && <div className="absolute top-0 right-0 bottom-0 z-1"
                         style={{ background: 'linear-gradient(90deg, rgba(0,0,0,.15), rgba(0,0,0,.5))', borderLeft: '2px solid rgba(0,0,0,.5)', animation: `seat-drain ${cancelSec}s linear forwards` }} />}
                    <div className="relative z-2" style={{ lineHeight: 1.5 }}>
                        {judged ? (<>
                            {/* v13 .g1 22px / .g2 13.5 / .g3 12 */}
                            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-.6px' }}>
                                {hourly != null ? <>{hourly.toFixed(1)}만<span style={{ fontSize: 13, fontWeight: 800, opacity: .75 }}>/h</span></> : `${score ?? ''}점`}
                            </div>
                            <div className="truncate" style={{ fontSize: 13.5, fontWeight: 800, marginTop: 2 }}>{routeLine(route.distanceKm, routeText)}{extraLine}</div>
                            <div className="truncate" style={{ fontSize: 12, fontWeight: 700, opacity: .8, marginTop: 1 }}>{positives.length ? positives.join(' · ') : '걸리는 것 없음'}</div>
                        </>) : <span style={{ fontSize: 14, fontWeight: 900 }}>좌표 분석 중…</span>}
                    </div>
                </button>
            </div>
            <style>{`@keyframes seat-drain { from { width: 0 } to { width: 100% } }`}</style>
        </div>
    );
}
