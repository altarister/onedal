import { useMemo, useState } from 'react';
import type { SecuredOrder, CallTarget } from '@onedal/shared';
import { isManualLineage, safeCancelSecOf, SERVER_CLEANUP_EXTRA_SEC } from '@onedal/shared';
import { useSettingsStore } from '../../stores/settingsStore';
import { verdictOf, type VerdictColor } from '../../lib/verdict';
import { getAddressLabel, hhmm } from '../../lib/routeUtils';
import { seatConclusion } from '../../lib/seatConclusion';
import { useFilterConfig } from '../../hooks/useFilterConfig';
import { logRoadmapEvent } from '../../lib/roadmapLogger';

/**
 * 🪧 **심사석** — 평가·미리보기 콜이 필터 자리를 빌려 쓰는 카드 (기사님 확정 · 와이어프레임 v13).
 *
 * 🔴 수치는 v13 값을 **그대로** 쓴다 — 어림으로 바꾸면 «완전 다른 모양»이 된다.
 * 문법: 색은 «물듦»(직접·알람) 또는 «버튼»(자동), 점수는 워터마크, 글은 세 줄.
 * 판정 전엔 무채색 — 색을 지어내지 않는다 (규칙 ④). 결정: 직접·알람은 스캔앱, 자동은 버튼 35:65.
 */

/**
 * 🎨 **판정색 한 벌** — 심사석과 «한 줄 심사석»이 같은 색을 쓴다.
 *    색이 곧 기사님의 결정이라(규칙 ⑤-3), 자리마다 색이 다르면 그게 가장 큰 사고다.
 */
export const SOAK: Record<VerdictColor, { tint: string; bar: string; text: string; glow: string; wm: string }> = {
    '꿀':   { tint: 'rgba(79,141,249,.30)', bar: '#4f8df9', text: '#9db9ff', glow: 'rgba(79,141,249,.5)',  wm: 'rgba(79,141,249,.16)' },
    '보통': { tint: 'rgba(47,158,110,.28)', bar: '#2f9e6e', text: '#7fd8ab', glow: 'rgba(47,158,110,.45)', wm: 'rgba(47,158,110,.15)' },
    '똥':   { tint: 'rgba(230,180,34,.30)', bar: '#e6b422', text: '#f0d27a', glow: 'rgba(230,180,34,.45)', wm: 'rgba(230,180,34,.15)' },
    '사고': { tint: 'rgba(224,85,99,.30)',  bar: '#e05563', text: '#f09aa4', glow: 'rgba(224,85,99,.45)',  wm: 'rgba(224,85,99,.15)' },
};
// 테마를 따른다 — 다크 고정색은 라이트 테마에서 이질적이다 (기사님)
const CARD_BG = 'linear-gradient(180deg, var(--color-surface-alt), var(--color-surface))';
/** 호칭의 타겟명 — 용어집 조합 규칙. 🔴 관내는 파생이라 여기 없다 */
const TARGET_NAME: Record<CallTarget, string> = { DEST: '노선', HOME: '복귀' };

const cleanRoute = (t?: string) => (t ?? '')
    .replace(/'(꿀|똥|콜|보통|사고)'/g, '').replace(/\[(추천|최단거리|최단시간)\]/g, '')
    /* 🔴 **점수를 뺀다** — 워터마크가 이미 크게 말한다 (기사님 확정 · 화면 디자인).
       같은 숫자가 한 카드에 두 번 있으면 그만큼 다른 것이 늦게 읽힌다 */
    .replace(/\s*·?\s*\d+점/g, '')
    .replace(/[🚙💩🍯]/g, '').replace(/\s{2,}/g, ' ').replace(/^[·\s]+|[·\s]+$/g, '').trim();

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
     * 📐 **바깥 여백은 놓는 쪽이 정한다** (기사님:
     * *"일반 콜리스트와 거리를 둔 이유가 있어? 그냥 콜리스트와 같은 간격이면 좋겠어"*).
     *
     * 🔴 컴포넌트가 자기 여백을 들고 다니면 **어디에 놓든 그 여백이 따라와** 옆의 것과
     *    간격이 어긋난다. 판정이 콜 목록 바로 아래 붙는 자리에서는 **목록과 같은 값**이라야
     *    한 표처럼 읽힌다. 안 주면 `8px 12px` 이다.
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
     * 👀 **미리보기는 언제 사라지나** — 폰이 상세 화면을 떠났다고 알릴 때다 (`devices.leftDetail`). 배경은 남은 판정 시간을 보여 줄 뿐이다.
     * 🔴 흐른 만큼 **미리 차 있게** 한다(`animationDelay` 에 음수) — 새로고침했다고 처음부터 다시 차오르면 화면이 거짓말한다.
     * 🔴 **그 값은 콜마다 한 번만 센다** — 다시 그릴 때마다 `Date.now()` 를 새로 재면 시작점이 흔들려 배경이 튄다.
     */
    /**
     * ⏱️ **길이는 서버가 고른 배차망별 값이다** (`judgeUntil`).
     *    인성 · 화물24시는 안전취소 시간, 픽커는 상세 대기 시간 — 여기서 배차망을 다시 가르지 않는다 (규칙 ③).
     * 🔴 **이 배경이 다 차도 카드는 안 사라진다** — 끄는 것은 폰의 화면 상태 하나다.
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
     * 🧾 **기존 콜이 어떻게 되나** — 결론은 `seatConclusion` 한 곳 (목업 «④ 후보콜에 대한 심사 결론»).
     *    합짐 심사 때만 있다. 모르면 «❓ 모른다», 늦으면 가장 늦는 정거장, 아니면 «안 밀린다».
     */
    const conclusion = seatConclusion(route.judgment);
    const conclusionClass = conclusion?.kind === 'unknown' ? 'text-danger' : conclusion?.kind === 'late' ? 'text-warning' : 'text-success';
    /**
     * 🎬 **지금 할 일 + 그 대상** — 한 줄에 담는다 (카드가 158px 고정이라 줄을 못 늘린다).
     *    늦는 곳이 있으면 그 «어디가 얼마나»를 뒤에 붙인다 — ⚠️ 는 떼고 온다(이모지 둘은 많다).
     *    🔴 행동이 없으면 `null` — 그때는 결론 줄이 그대로 그 자리를 쓴다.
     */
    const actionLine = v.action
        ? `${v.action}${conclusion?.kind === 'late' ? ` · ${conclusion.text.replace(/^⚠️\s*/, '')}` : ''}`
        : null;
    /**
     * ⏱️ **더 쓰는 시간** — 판정이 시급의 분모로 쓴 분 (목업 시트 심사 카드).
     *    합짐만 적는다 — 둘째 줄의 «+km, +분»은 주행 증가분뿐이라, 정차까지 더한 «시급의 분»은 따로 말해야 한다.
     */
    const extraLine = confirmedActive > 0 && route.judgment?.extraMin != null
        ? <span style={{ opacity: .75 }}> · 더 쓰는 {route.judgment.extraMin}분</span> : null;

    /**
     * ⏳ **시간이 흐르는 것은 «판 배경»이 말한다** — 두 갈래가 한 벌을 쓴다 (기사님 확정 · 화면 디자인).
     *
     * 오른쪽 끝에 붙어 **왼쪽으로** 덮어 온다. 남은 밝은 폭이 곧 남은 시간이다.
     * 🔴 `width` 가 아니라 `transform` 으로 늘린다 — 폭을 재우면 글자 배치를 매 프레임 다시 계산해 눈에 띄게 튄다.
     * 🔴 **경계선을 긋지 않는다** — 지나가는 선이 눈을 끌어 금액·판정 색보다 먼저 읽힌다 (규칙 ⑤-3).
     * 🔴 **머리줄·본문·버튼이 모두 이 위다** — 글자를 가리지 않는다. 버튼 사이 틈과 여백으로 지나간다.
     *
     * 두 시계를 한 자리에서 그린다 — 미리보기는 «판정 보류», 잡은 콜은 «안전취소».
     * 둘은 같이 오지 않는다 (미리보기는 안 잡은 콜이다).
     */
    const drainSec = route.isPreview ? previewHoldSec : (judged ? cancelSec : null);
    const drainDelay = route.isPreview ? previewElapsedSec : 0;
    const drain = drainSec != null && (
        <div className="absolute inset-0 z-0 pointer-events-none"
             style={{ background: 'linear-gradient(270deg, rgba(0,0,0,.72), rgba(0,0,0,.30))', transformOrigin: 'right center',
                      animation: `seat-drain-x ${drainSec}s linear forwards`, animationDelay: `-${drainDelay.toFixed(1)}s` }} />
    );

    /**
     * ── 머리줄 — **두 갈래가 한 벌을 쓴다** (기사님 확정 · 화면 디자인) ──
     *
     * 🔴 **아래 선과 위아래 여백을 걷는다** — 내용과 글자 크기는 그대로다.
     *    그 선 아래가 곧 본문이라 «위는 설명, 아래는 누를 것»을 버튼의 테두리와 둥근 모서리가 이미 가른다.
     *    걷은 15px 은 본문 높이로 간다 (115 → 131px).
     */
    const header = (
        /* 🔴 **머리줄 글자도 판정 색이다** (기사님 확정 · 화면 디자인) — 상차→하차만 흐린 색으로 둔다 */
        <div className="flex items-center relative z-10" style={{ gap: 10, padding: '7px 14px 1px', fontSize: 14, color: c ? c.text : undefined }}>
            {manual && <span style={{ borderRadius: 7, padding: '3px 10px', fontSize: 12, fontWeight: 800, background: 'rgba(79,141,249,.14)', color: '#9db9ff', border: '1px solid rgba(79,141,249,.35)' }}>
                {route.capturedVia === 'ALARM' ? '🔔' : '✋'}</span>}
            {route.isSimulated && <span style={{ borderRadius: 7, padding: '3px 8px', fontSize: 11, fontWeight: 900, background: 'rgba(56,189,248,.18)', color: '#38bdf8', border: '1px solid rgba(56,189,248,.4)' }}>
                🐥 체험</span>}
            {/**
              * 🔢 **잡으면 목록의 몇 번이 되나** (기사님:
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
                  * 🔴 **«꿀 · 보통 · 똥»은 색으로만 말한다** (기사님:
                  *    *"우린 색으로 구분하면 되니까"*).
                  *    색은 왼쪽 띠·워터마크·KEEP 버튼이 **이미 세 번** 말한다.
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

    // ── 직접·알람: 물든 카드 (보기만) — v13 .soak ──
    if (manual) {
        return (
            <div className="relative overflow-hidden flex flex-col" style={{ margin: inset ?? '8px 12px', borderRadius: 14, border: `1px solid ${c ? `${c.bar}73` : '#2a3450'}`, background: CARD_BG, boxShadow: '0 8px 28px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.04)', height: open ? 'auto' : 158, minHeight: 158 }}>
                {drain}
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
                <div className="relative z-10 tabular-nums cursor-pointer" style={{ padding: '5px 16px 11px 21px' }}
                     onClick={() => {
                         /* 🧾 **어느 버튼에서 온 결재인지 남긴다** — 서버 로그에는 «[Socket] 취소 전달» 한 줄만 남아
                            «누가 눌렀나»를 못 가렸다 (누른 적 없는 취소가 «수동»으로 기록된 건). */
                         if (route.isPreview) { logRoadmapEvent("웹", "심사석 — 미리보기 카드를 눌러 치움", "관제대시보드"); onDecision?.(route.id, 'SAFE_CANCEL'); }
                         else if (judged) setOpen(o => !o);
                     }}>
                    {judged ? (<>
                        {/* 🔴 **글 판과 버튼 판이 같은 치수를 쓴다** (기사님 확정 · 화면 디자인) — 시급 26 · 경로 13.5 · 행동 15 */}
                        <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-.5px', lineHeight: 1.15 }}>
                            {hourly != null ? <>{hourly.toFixed(1)}만<span style={{ fontSize: 13, color: 'var(--color-text-muted)', fontWeight: 700 }}>/h</span></> : <span style={{ fontSize: 15 }}>{v.reason}</span>}
                        </div>
                        <div className="truncate" style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: '-.2px', marginTop: 2 }}>{routeLine(route.distanceKm, routeText) || '경로 계산됨'}{extraLine}</div>
                        {/* 걸리는 것만 — 버튼 판의 같은 줄과 한 치수다 */}
                        <div className="truncate" style={{ fontSize: 12, fontWeight: 700, opacity: .8, marginTop: 1, color: negatives.length ? c!.text : 'var(--color-text-muted)' }}>
                            {negatives.length ? negatives.join(' · ') : '걸리는 것 없음'} · 근거 {open ? '▴' : '▾'}
                        </div>
                        {/**
                          * 🎬 **이 자리는 «행동이 있으면 행동»이 차지한다** (판정 4단계 · `lib/verdict.ts` 의 `action`).
                          *
                          * 🔴 **줄을 늘리지 않는다** — 이 카드는 158px 고정(`overflow-hidden`)이라
                          *    여섯째 줄을 만들면 **맨 아래가 조용히 잘린다**. 실측으로 확인했다 —
                          *    게이트도 `pnpm lab` 도 초록인데 화면에서만 사라졌다.
                          * 🔴 **행동이 앞이다** — 이 줄에는 `truncate` 가 걸려 좁은 폰에서 뒤가 잘린다.
                          *    순서가 반대면 제일 중요한 것이 먼저 사라진다.
                          * 🔴 **한 줄 규칙** — 행동이 있으면 «행동 · 대상», 없으면 결론 그대로
                          *    («❓ 모른다» / «✅ 안 밀린다»). 우선순위 표를 만들지 않는다.
                          */}
                        {actionLine ? (
                            <div className="truncate" style={{ fontSize: 15, fontWeight: 900, marginTop: 3, color: c?.text ?? 'var(--color-text-primary)' }}>{actionLine}</div>
                        ) : conclusion && (
                            <div className={`truncate ${conclusionClass}`} style={{ fontSize: 12.5, fontWeight: 800, marginTop: 3 }}>{conclusion.text}</div>
                        )}
                        {open && positives.length > 0 && (
                            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--color-text-muted)' }}>✅ {positives.join(' · ')}</div>
                        )}
                        {open && route.judgment && (
                            <div className="mt-2 flex flex-col gap-1 rounded-md border border-border bg-surface-alt/40 px-2.5 py-2" style={{ fontSize: 12 }}>
                                {route.judgment.gates.map(g => <div key={g.key} className={g.pass ? 'text-text-muted' : 'text-danger font-bold'}>{g.pass ? '✅' : '🔴'} {g.name}{!g.pass && g.why ? ` — ${g.why}` : ''}</div>)}
                                {route.judgment.axes.map(a => <div key={a.key}><b>{a.name}</b> {a.raw} <span className="text-text-muted">({a.score ?? '—'}점{a.weight !== 1 ? ` ×${a.weight}` : ''})</span></div>)}
                                {/* 🧾 기존 콜 정거장마다 «약속 → 예정 (±)» — 이 후보를 받으면 (하차 약속이 곧 시한이다) */}
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
                {/* ⏳ 배경이 차오르는 문법 — 오른쪽 끝에 붙어 왼쪽으로 늘어난다 (두 갈래가 이 한 벌을 쓴다) */}
                <style>{`@keyframes seat-drain-x { from { transform: scaleX(0) } to { transform: scaleX(1) } }`}</style>
            </div>
        );
    }

    // ── 자동콜: 아래 전체가 버튼 35:65 — v13 .btns ──
    return (
        /* 🔴 **테두리도 판정 색이다** — 글 판과 한 벌 (기사님 확정 · 화면 디자인).
              옛 판은 고정 파랑이라 🟢 콜이 파란 테두리로 보였다 */
        <div className="relative overflow-hidden flex flex-col" style={{ margin: inset ?? '8px 12px', borderRadius: 14, border: `1px solid ${c ? `${c.bar}73` : '#2a3450'}`, background: CARD_BG, boxShadow: '0 8px 28px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.04)', height: 158 }}>
            {judged && <div className="absolute inset-0 z-0 pointer-events-none" style={{ background: `linear-gradient(165deg, ${c!.tint} 0%, rgba(0,0,0,0) 45%, transparent 100%)` }} />}
            {drain}
            <div className="absolute left-0 top-0 bottom-0 z-10 pointer-events-none" style={{ width: 5, background: c ? `linear-gradient(180deg, ${c.bar}, ${c.bar}59)` : '#3a4358', boxShadow: c ? `2px 0 14px ${c.glow}` : undefined }} />
            {header}
            <div className="flex relative z-10" style={{ gap: 9, padding: '5px 13px 11px', flex: 1, minHeight: 0 }}>
                <button disabled={!judged || busy}
                    onClick={() => { logRoadmapEvent("웹", "심사석 — 거절(왼쪽) 버튼 클릭", "관제대시보드"); setProcessingId?.(route.id); onDecision?.(route.id, 'SAFE_CANCEL'); }}
                    className="text-left disabled:opacity-40 overflow-hidden"
                    /**
                     * 🔴 **거절 버튼도 판정 색이다** (기사님 확정 · 화면 디자인).
                     *    옛 판은 늘 빨강이라 🟡 콜에서도 빨간 칸이었다 — 색이 그 콜의 뜻과 달랐다.
                     *    🔴 **걸리는 것이 없으면 흐린 회색** — 누를 일이 없는 버튼이 눈을 끌면 안 된다.
                     */
                    style={{ flex: 35, borderRadius: 11, padding: '8px 12px', fontSize: 13.5, fontWeight: 700, lineHeight: 1.7,
                             ...(negatives.length && c
                                 ? { background: `linear-gradient(180deg, ${c.bar}2e, ${c.bar}17)`, color: c.text, border: `1px solid ${c.bar}59` }
                                 : { background: 'linear-gradient(180deg,#232c42,#1b2234)', color: 'var(--color-text-muted)', border: '1px solid #2a3450', opacity: .5 }) }}>
                    {/* ❓ 기존 콜 도착을 모르면 거절 쪽 맨 위에 — 모르는 것이 «걸리는 것 없음»으로 읽히지 않게 */}
                    {judged ? ([conclusion?.kind === 'unknown' ? '❓ 기존 콜 도착 모름' : null, ...negatives.map(r => `❌ ${r}`)].filter(Boolean).join('\n') || '거절') : '❌ —'}
                </button>
                <button disabled={!judged || busy}
                    onClick={() => { logRoadmapEvent("웹", "심사석 — KEEP(오른쪽) 버튼 클릭", "관제대시보드"); setProcessingId?.(route.id); onDecision?.(route.id, 'ORDER_CONFIRMED'); }}
                    className="text-left relative overflow-hidden tabular-nums disabled:opacity-60"
                    /**
                     * 🔴 **흰 글자 · 어둡게 물든 바탕** (기사님 확정 · 화면 디자인).
                     *    옛 판은 «밝은 바탕 + 검정 글자»라 왼쪽 거절 버튼(짙은 바탕 + 연한 글자)과 결이 달랐다.
                     *    색은 **테두리 · 워터마크 · 「지금 할 일」 글자색** 셋이 말한다 — 눌러야 할 쪽이 더 밝고 넓다.
                     */
                    style={judged
                        ? { flex: 65, borderRadius: 11, padding: '8px 12px', background: `linear-gradient(180deg, ${c!.bar}6b, ${c!.bar}33)`, color: 'var(--color-text-primary)', border: `1px solid ${c!.bar}8c`, boxShadow: `0 0 24px ${c!.glow}` }
                        : { flex: 65, borderRadius: 11, padding: '8px 12px', background: 'linear-gradient(180deg,#232c42,#1b2234)', color: 'var(--color-text-muted)', border: '1px solid #1c2436' }}>
                    {/* v13 .bwm — 124px · right 0 · bottom -26 */}
                    <div className="absolute z-0 font-black leading-none select-none tabular-nums"
                         /* 🔴 **-25px** (기사님). 숫자가 서로 겹칠 만큼 뭉쳐야
                            «읽는 값»이 아니라 «바탕»으로 물러난다 — 앞의 시급이 먼저 읽힌다 */
                         style={{ right: 0, bottom: -26, fontSize: 124, letterSpacing: '-25px', color: judged ? 'rgba(255,255,255,.10)' : 'color-mix(in srgb, var(--color-text-primary) 8%, transparent)' }}>
                        {judged ? score ?? '' : '?'}
                    </div>
                    {/* ⏳ 안전취소는 **판 배경**이 말한다 (위 `drain`) — 버튼 안에 따로 두지 않는다 */}
                    <div className="relative z-2" style={{ lineHeight: 1.5 }}>
                        {judged ? (<>
                            {/* v13 .g1 22px / .g2 13.5 / .g3 12 */}
                            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-.6px' }}>
                                {hourly != null ? <>{hourly.toFixed(1)}만<span style={{ fontSize: 13, fontWeight: 800, opacity: .75 }}>/h</span></> : `${score ?? ''}점`}
                            </div>
                            <div className="truncate" style={{ fontSize: 13.5, fontWeight: 800, marginTop: 2 }}>{routeLine(route.distanceKm, routeText)}{extraLine}</div>
                            {/**
                              * 🎬 **이 자리는 «행동이 있으면 행동»이 차지한다** (판정 4단계 · `lib/verdict.ts` 의 `action`).
                              *    🔴 **줄을 늘리지 않는다** — 이 버튼도 고정 높이 안이라 한 줄을 더하면 잘린다.
                              *    🔴 **색 이름으로 가르지 않는다** — «있으면 그린다» 뿐이다.
                              *       🔵🟢 에는 `action` 이 없어 지금처럼 좋은 점이 보인다.
                              */}
                            {actionLine
                                ? <div className="truncate" style={{ fontSize: 13.5, fontWeight: 900, marginTop: 2, color: c?.text ?? 'var(--color-text-primary)' }}>{actionLine}</div>
                                : <div className="truncate" style={{ fontSize: 12, fontWeight: 700, opacity: .8, marginTop: 1 }}>{positives.length ? positives.join(' · ') : '걸리는 것 없음'}</div>}
                        </>) : <span style={{ fontSize: 14, fontWeight: 900 }}>좌표 분석 중…</span>}
                    </div>
                </button>
            </div>
            {/* ⏳ 배경이 차오르는 문법은 한 벌이다 — `seat-drain-x` (위 `drain`). 폭을 재는 옛 `seat-drain` 은 걷었다 */}
            <style>{`@keyframes seat-drain-x { from { transform: scaleX(0) } to { transform: scaleX(1) } }`}</style>
        </div>
    );
}
