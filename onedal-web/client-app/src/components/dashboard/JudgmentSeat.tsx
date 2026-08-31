import { useState } from 'react';
import type { SecuredOrder, CallTarget } from '@onedal/shared';
import { isManualLineage } from '@onedal/shared';
import { verdictOf, type VerdictColor } from '../../lib/verdict';
import { getAddressLabel } from '../../lib/routeUtils';
import { useFilterConfig } from '../../hooks/useFilterConfig';

/**
 * 🪧 **심사석** — 평가·미리보기 콜이 필터 자리를 빌려 쓰는 판 (기사님 확정 0831 · 와이어프레임 v13).
 *
 * 🔴 수치는 v13(judging-seat-wireframe-v13.html)을 **그대로** 옮긴다 — 어림 치환 금지
 *    (0831 실측: 어림으로 옮기니 "완전 다른 모양"이 됐다). 바꿀 땐 와이어프레임 먼저.
 * 문법: 색은 «물듦»(직접·알람) 또는 «버튼»(자동), 점수는 워터마크, 글은 세 줄.
 * 판정 전엔 무채색 — 색을 지어내지 않는다 (규칙 ④). 결정: 직접·알람은 스캔앱, 자동은 버튼 35:65.
 */

const SOAK: Record<VerdictColor, { tint: string; bar: string; text: string; glow: string; wm: string }> = {
    '꿀':   { tint: 'rgba(79,141,249,.30)', bar: '#4f8df9', text: '#9db9ff', glow: 'rgba(79,141,249,.5)',  wm: 'rgba(79,141,249,.16)' },
    '보통': { tint: 'rgba(47,158,110,.28)', bar: '#2f9e6e', text: '#7fd8ab', glow: 'rgba(47,158,110,.45)', wm: 'rgba(47,158,110,.15)' },
    '똥':   { tint: 'rgba(230,180,34,.30)', bar: '#e6b422', text: '#f0d27a', glow: 'rgba(230,180,34,.45)', wm: 'rgba(230,180,34,.15)' },
    '사고': { tint: 'rgba(224,85,99,.30)',  bar: '#e05563', text: '#f09aa4', glow: 'rgba(224,85,99,.45)',  wm: 'rgba(224,85,99,.15)' },
};
// 테마를 따른다 — 다크 고정색은 라이트 테마에서 이질적이었다 (기사님 0831)
const CARD_BG = 'linear-gradient(180deg, var(--color-surface-alt), var(--color-surface))';
/** 호칭의 타겟명 — 용어집 조합 규칙 (노선/관내/복귀) */
const TARGET_NAME: Record<CallTarget, string> = { DEST: '노선', LOCAL: '관내', HOME: '복귀' };

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
    confirmedActive: number;
    onDecision?: (id: string, action: 'ORDER_CONFIRMED' | 'SAFE_CANCEL' | 'ORDER_RELEASED_BY_ME' | 'ORDER_RELEASED_BY_OFFICE') => void;
    processingId?: string | null;
    setProcessingId?: (id: string | null) => void;
}

export default function JudgmentSeat({ route, confirmedActive, onDecision, processingId, setProcessingId }: Props) {
    const [open, setOpen] = useState(false);
    const { filter } = useFilterConfig();
    const v = verdictOf(route);
    const manual = isManualLineage(route.type) || !!route.isPreview;
    const judged = !!v.color;
    const c = v.color ? SOAK[v.color] : null;
    const hourly = route.judgment?.axes?.find(a => a.key === 'money')?.value;
    const score = route.judgment?.score;
    const routeText = cleanRoute(route.kakaoTimeExt);
    const negatives = route.rejectionReasons ?? [];
    const positives = route.approvalReasons ?? [];
    const busy = processingId === route.id;
    const name = candidateName(filter?.callTarget ?? 'DEST', confirmedActive);

    /* ── v13 .row: 42px · 0 16px · gap 10 · 14px ── */
    const header = (
        <div className="flex items-center relative z-10" style={{ gap: 10, padding: '0 16px', minHeight: 42, fontSize: 14, borderBottom: '1px solid var(--color-border-card)' }}>
            {manual && <span style={{ borderRadius: 7, padding: '3px 10px', fontSize: 12, fontWeight: 800, background: 'rgba(79,141,249,.14)', color: '#9db9ff', border: '1px solid rgba(79,141,249,.35)' }}>
                {route.capturedVia === 'ALARM' ? '🔔' : '✋'}</span>}
            <span style={{ fontWeight: 900, fontSize: 14.5, letterSpacing: '-.3px' }} className="whitespace-nowrap">{name}</span>
            <span className="truncate" style={{ color: 'var(--color-text-muted)', fontSize: 12.5, fontWeight: 700 }}>
                {getAddressLabel(route.pickup)} → {getAddressLabel(route.dropoff)}
            </span>
            <span className="ml-auto flex items-baseline shrink-0" style={{ gap: 10 }}>
                {judged
                    ? <span style={{ fontSize: 27, fontWeight: 900, letterSpacing: '-.5px', color: c!.text, textShadow: `0 0 18px ${c!.glow}` }}>{v.color}</span>
                    : <span className="animate-pulse" style={{ color: 'var(--color-text-muted)', fontSize: 13, fontWeight: 800 }}>판정 중…</span>}
                <span className="tabular-nums" style={{ fontSize: 19, fontWeight: 900 }}>
                    {route.fare > 0 ? `${(route.fare / 10000).toFixed(1)}만원` : '금액미상'}
                </span>
            </span>
        </div>
    );

    // ── 직접·알람: 물든 판 (보기만) — v13 .soak ──
    if (manual) {
        return (
            <div className="relative overflow-hidden flex flex-col" style={{ margin: '8px 12px', borderRadius: 14, border: `1px solid ${c ? `${c.bar}73` : '#2a3450'}`, background: CARD_BG, boxShadow: '0 8px 28px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.04)', height: open ? 'auto' : 158, minHeight: 158 }}>
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
                <div className="relative z-10 tabular-nums cursor-pointer" style={{ padding: '8px 16px 12px 21px' }} onClick={() => judged && setOpen(o => !o)}>
                    {judged ? (<>
                        {/* v13 .core .l1 — 27px */}
                        <div style={{ fontSize: 27, fontWeight: 900, letterSpacing: '-.5px', lineHeight: 1.15 }}>
                            {hourly != null ? <>{hourly.toFixed(1)}만<span style={{ fontSize: 14, color: 'var(--color-text-muted)', fontWeight: 700 }}>/h</span></> : <span style={{ fontSize: 15 }}>{v.reason}</span>}
                        </div>
                        {/* v13 .l2 — 14.5px */}
                        <div style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: '-.2px', marginTop: 5 }}>{routeLine(route.distanceKm, routeText) || '경로 계산됨'}</div>
                        {/* v13 .l3 — 12.5px · 걸리는 것만 */}
                        <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 4, color: negatives.length ? c!.text : 'var(--color-text-muted)' }}>
                            {negatives.length ? negatives.join(' · ') : '걸리는 것 없음'} · 근거 {open ? '▴' : '▾'}
                        </div>
                        {open && positives.length > 0 && (
                            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--color-text-muted)' }}>✅ {positives.join(' · ')}</div>
                        )}
                        {open && route.judgment && (
                            <div className="mt-2 flex flex-col gap-1 rounded-md border border-border bg-surface-alt/40 px-2.5 py-2" style={{ fontSize: 12 }}>
                                {route.judgment.gates.map(g => <div key={g.key} className={g.pass ? 'text-text-muted' : 'text-danger font-bold'}>{g.pass ? '✅' : '🔴'} {g.name}{!g.pass && g.why ? ` — ${g.why}` : ''}</div>)}
                                {route.judgment.axes.map(a => <div key={a.key}><b>{a.name}</b> {a.raw} <span className="text-text-muted">({a.score ?? '—'}점{a.weight !== 1 ? ` ×${a.weight}` : ''})</span></div>)}
                            </div>
                        )}
                    </>) : (<>
                        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-text-muted)' }}>📄 상세 읽는 중 — 판정을 기다립니다</div>
                        <div className="animate-pulse" style={{ height: 12, width: 230, borderRadius: 6, background: 'color-mix(in srgb, var(--color-text-primary) 8%, transparent)', marginTop: 8 }} />
                        <div className="animate-pulse" style={{ height: 12, width: 180, borderRadius: 6, background: 'color-mix(in srgb, var(--color-text-primary) 8%, transparent)', marginTop: 8 }} />
                    </>)}
                </div>
            </div>
        );
    }

    // ── 자동콜: 아래 전체가 버튼 35:65 — v13 .btns ──
    return (
        <div className="relative overflow-hidden flex flex-col" style={{ margin: '8px 12px', borderRadius: 14, border: '1px solid rgba(79,141,249,.35)', background: CARD_BG, boxShadow: '0 8px 28px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.04)', height: 158 }}>
            {header}
            <div className="flex relative z-10" style={{ gap: 9, padding: '8px 13px 13px', flex: 1, minHeight: 0 }}>
                <button disabled={!judged || busy}
                    onClick={() => { setProcessingId?.(route.id); onDecision?.(route.id, 'SAFE_CANCEL'); }}
                    className="text-left disabled:opacity-40 overflow-hidden"
                    style={{ flex: 35, borderRadius: 11, padding: '8px 12px', fontSize: 13.5, fontWeight: 700, lineHeight: 1.7,
                             background: 'linear-gradient(180deg,#3a1518,#2c1013)', color: '#e79aa2', border: '1px solid rgba(224,85,99,.35)' }}>
                    {judged ? (negatives.length ? negatives.map(r => `❌ ${r}`).join('\n') : '거절') : '❌ —'}
                </button>
                <button disabled={!judged || busy}
                    onClick={() => { setProcessingId?.(route.id); onDecision?.(route.id, 'ORDER_CONFIRMED'); }}
                    className="text-left relative overflow-hidden tabular-nums disabled:opacity-60"
                    style={judged
                        ? { flex: 65, borderRadius: 11, padding: '8px 12px', background: `linear-gradient(180deg, ${c!.bar}, ${c!.bar}cc)`, color: '#181818', boxShadow: `0 0 24px ${c!.glow}, inset 0 1px 0 rgba(255,255,255,.35)` }
                        : { flex: 65, borderRadius: 11, padding: '8px 12px', background: 'linear-gradient(180deg,#232c42,#1b2234)', color: 'var(--color-text-muted)', border: '1px solid #1c2436' }}>
                    {/* v13 .bwm — 124px · right 0 · bottom -26 */}
                    <div className="absolute z-0 font-black leading-none select-none tabular-nums"
                         style={{ right: 0, bottom: -26, fontSize: 124, letterSpacing: '-4px', color: judged ? 'rgba(0,0,0,.18)' : 'color-mix(in srgb, var(--color-text-primary) 8%, transparent)' }}>
                        {judged ? score ?? '' : '?'}
                    </div>
                    {/* ⏳ 안전취소 장막 — 30초 차오르면 자동취소 */}
                    {judged && <div className="absolute top-0 right-0 bottom-0 z-1"
                         style={{ background: 'linear-gradient(90deg, rgba(0,0,0,.15), rgba(0,0,0,.5))', borderLeft: '2px solid rgba(0,0,0,.5)', animation: 'seat-drain 30s linear forwards' }} />}
                    <div className="relative z-2" style={{ lineHeight: 1.5 }}>
                        {judged ? (<>
                            {/* v13 .g1 22px / .g2 13.5 / .g3 12 */}
                            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-.6px' }}>
                                {hourly != null ? <>{hourly.toFixed(1)}만<span style={{ fontSize: 13, fontWeight: 800, opacity: .75 }}>/h</span></> : `${score ?? ''}점`}
                            </div>
                            <div style={{ fontSize: 13.5, fontWeight: 800, marginTop: 2 }}>{routeLine(route.distanceKm, routeText)}</div>
                            <div className="truncate" style={{ fontSize: 12, fontWeight: 700, opacity: .8, marginTop: 1 }}>{positives.length ? positives.join(' · ') : '걸리는 것 없음'}</div>
                        </>) : <span style={{ fontSize: 14, fontWeight: 900 }}>좌표 분석 중…</span>}
                    </div>
                </button>
            </div>
            <style>{`@keyframes seat-drain { from { width: 0 } to { width: 100% } }`}</style>
        </div>
    );
}
