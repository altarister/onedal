import { useState } from 'react';
import type { SecuredOrder } from '@onedal/shared';
import { isManualLineage } from '@onedal/shared';
import { verdictOf, type VerdictColor } from '../../lib/verdict';
import { getAddressLabel } from '../../lib/routeUtils';

/**
 * 🪧 **심사석** — 평가·미리보기 콜이 필터 자리를 빌려 쓰는 판 (기사님 확정 0831 · 와이어프레임 v13).
 *
 * 문법: 색은 «물듦»(직접·알람) 또는 «버튼»(자동), 점수는 워터마크, 글은 세 줄
 * (시급 · 거리시간 · 걸리는 것). 판정 전엔 무채색 — 색을 지어내지 않는다 (규칙 ④).
 * 결정: 직접·알람은 스캔앱에서(여긴 보기만), 자동은 여기 버튼 두 개(35:65)로.
 */

const SOAK: Record<VerdictColor, { tint: string; bar: string; text: string; glow: string }> = {
    '꿀':   { tint: 'rgba(79,141,249,.28)',  bar: '#4f8df9', text: '#9db9ff', glow: 'rgba(79,141,249,.5)' },
    '보통': { tint: 'rgba(47,158,110,.26)',  bar: '#2f9e6e', text: '#7fd8ab', glow: 'rgba(47,158,110,.45)' },
    '똥':   { tint: 'rgba(230,180,34,.26)',  bar: '#e6b422', text: '#f0d27a', glow: 'rgba(230,180,34,.45)' },
    '사고': { tint: 'rgba(224,85,99,.26)',   bar: '#e05563', text: '#f09aa4', glow: 'rgba(224,85,99,.45)' },
};

/** kakaoTimeExt 에서 판정 표식을 걷어낸 «거리·시간» 문장 (PinnedRouteCard 와 같은 규칙) */
const cleanRoute = (t?: string) => (t ?? '')
    .replace(/'(꿀|똥|콜|보통|사고)'/g, '').replace(/\[(추천|최단거리|최단시간)\]/g, '')
    .replace(/[🚙💩🍯]/g, '').replace(/\s{2,}/g, ' ').trim();

/** 호칭 — 확정된 활성 콜 수로 첫짐/합짐N 을 센다 (첫짐은 생략이 규칙 · 심사 중이니 후보) */
export function candidateName(confirmedActive: number): string {
    return confirmedActive <= 0 ? '후보콜' : `합짐${confirmedActive} 후보콜`;
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

    const header = (
        <div className="flex items-center gap-2.5 px-4 min-h-[42px] relative z-10 border-b border-white/5 text-[14px]">
            {manual && <span className="px-2 py-0.5 rounded-md text-[12px] font-extrabold bg-info/15 text-info border border-info/30">
                {route.capturedVia === 'ALARM' ? '🔔' : '✋'}</span>}
            <span className="font-black tracking-tight">{candidateName(confirmedActive)}</span>
            <span className="text-text-muted text-[12.5px] font-bold truncate">
                {getAddressLabel(route.pickup)} → {getAddressLabel(route.dropoff)}
            </span>
            <span className="ml-auto flex items-baseline gap-2.5 flex-shrink-0">
                {judged
                    ? <span className="text-[24px] font-black" style={{ color: c!.text, textShadow: `0 0 18px ${c!.glow}` }}>{v.color}</span>
                    : <span className="text-text-muted text-[13px] font-extrabold animate-pulse">판정 중…</span>}
                <span className="text-[18px] font-black tabular-nums">
                    {route.fare > 0 ? `${(route.fare / 10000).toFixed(1)}만원` : '금액미상'}
                </span>
            </span>
        </div>
    );

    /** 워터마크 — 점수가 판의 배경이다 */
    const watermark = (big: boolean) => (
        <div className="absolute right-1 -bottom-6 z-0 font-black leading-none select-none pointer-events-none tabular-nums"
             style={{ fontSize: big ? 130 : 100, letterSpacing: '-5px',
                      color: judged ? `${c!.bar}26` : 'rgba(255,255,255,.06)',
                      ...(judged ? {} : { animation: 'pulse 1.2s ease-in-out infinite' }) }}>
            {judged ? score ?? '' : '?'}
        </div>
    );

    // ── 직접·알람: 물든 판 (보기만) ──
    if (manual) {
        return (
            <div className="relative overflow-hidden border-b-2" style={{ borderColor: c ? `${c.bar}70` : '#2a3450' }}>
                {judged && <div className="absolute inset-0 z-0" style={{ background: `linear-gradient(165deg, ${c!.tint} 0%, transparent 75%)` }} />}
                <div className="absolute left-0 top-0 bottom-0 w-[5px] z-10" style={{ background: c?.bar ?? '#3a4358', boxShadow: c ? `2px 0 14px ${c.glow}` : undefined }} />
                {watermark(true)}
                {header}
                <div className="px-5 pt-2 pb-3 relative z-10 tabular-nums cursor-pointer" onClick={() => judged && setOpen(o => !o)}>
                    {judged ? (<>
                        <div className="text-[26px] font-black tracking-tight leading-tight">
                            {hourly != null ? <>{hourly.toFixed(1)}만<span className="text-[14px] text-text-muted font-bold">/h</span></> : <span className="text-[15px]">{v.reason}</span>}
                        </div>
                        <div className="text-[14px] font-bold mt-1">{routeText || '경로 계산됨'}</div>
                        <div className="text-[12.5px] font-semibold mt-1" style={{ color: negatives.length ? c!.text : 'var(--color-text-muted, #7d879c)' }}>
                            {negatives.length ? negatives.join(' · ') : (positives.length ? positives.join(' · ') : '걸리는 것 없음')} · 근거 {open ? '▴' : '▾'}
                        </div>
                        {open && route.judgment && (
                            <div className="mt-2 flex flex-col gap-1 text-[12px] rounded-md border border-border bg-surface-alt/40 px-2.5 py-2">
                                {route.judgment.gates.map(g => <div key={g.key} className={g.pass ? 'text-text-muted' : 'text-danger font-bold'}>{g.pass ? '✅' : '🔴'} {g.name}{!g.pass && g.why ? ` — ${g.why}` : ''}</div>)}
                                {route.judgment.axes.map(a => <div key={a.key}><b>{a.name}</b> {a.raw} <span className="text-text-muted">({a.score ?? '—'}점{a.weight !== 1 ? ` ×${a.weight}` : ''})</span></div>)}
                            </div>
                        )}
                        <div className="text-[11px] text-text-muted mt-1.5">결정은 인성 화면에서 — 수락하거나 뒤로</div>
                    </>) : (<>
                        <div className="text-[13px] font-extrabold text-text-muted">📄 상세 읽는 중 — 판정을 기다립니다</div>
                        <div className="h-3 w-56 rounded-md bg-white/10 mt-2 animate-pulse" />
                        <div className="h-3 w-40 rounded-md bg-white/10 mt-2 animate-pulse" />
                    </>)}
                </div>
            </div>
        );
    }

    // ── 자동콜: 아래 전체가 버튼 (35:65) ──
    return (
        <div className="relative overflow-hidden border-b-2 border-info/40">
            {header}
            <div className="flex gap-2.5 px-3.5 pt-2 pb-3 relative z-10">
                <button disabled={!judged || busy}
                    onClick={() => { setProcessingId?.(route.id); onDecision?.(route.id, 'SAFE_CANCEL'); }}
                    className="flex-[35] rounded-xl px-3 py-2.5 text-left text-[13px] font-bold leading-relaxed disabled:opacity-40"
                    style={{ background: 'linear-gradient(180deg,#3a1518,#2c1013)', color: '#e79aa2', border: '1px solid rgba(224,85,99,.35)' }}>
                    {judged ? (negatives.length ? negatives.map(r => `❌ ${r}`).join('\n') : '거절') : '❌ —'}
                </button>
                <button disabled={!judged || busy}
                    onClick={() => { setProcessingId?.(route.id); onDecision?.(route.id, 'ORDER_CONFIRMED'); }}
                    className="flex-[65] rounded-xl px-3.5 py-2.5 text-left relative overflow-hidden tabular-nums disabled:opacity-60"
                    style={judged
                        ? { background: `linear-gradient(180deg, ${c!.bar}, ${c!.bar}cc)`, color: '#101318', boxShadow: `0 0 24px ${c!.glow}` }
                        : { background: 'linear-gradient(180deg,#232c42,#1b2234)', color: '#7d879c', border: '1px solid #1c2436' }}>
                    <div className="absolute right-0 -bottom-5 z-0 font-black leading-none select-none tabular-nums"
                         style={{ fontSize: 96, letterSpacing: '-4px', color: 'rgba(0,0,0,.18)' }}>
                        {judged ? score ?? '' : '?'}
                    </div>
                    {/* ⏳ 안전취소 장막 — 30초 동안 차오르고, 다 덮이면 자동취소와 함께 카드도 끝난다 */}
                    {judged && <div className="absolute top-0 right-0 bottom-0 z-[1] border-l-2 border-black/50"
                         style={{ background: 'linear-gradient(90deg, rgba(0,0,0,.15), rgba(0,0,0,.5))', animation: 'seat-drain 30s linear forwards' }} />}
                    <div className="relative z-[2]">
                        {judged ? (<>
                            <div className="text-[21px] font-black tracking-tight leading-tight">
                                {hourly != null ? <>{hourly.toFixed(1)}만<span className="text-[12px] font-extrabold opacity-75">/h</span></> : `${score ?? ''}점`}
                            </div>
                            <div className="text-[13px] font-extrabold mt-0.5">{routeText}</div>
                            <div className="text-[11.5px] font-bold opacity-80 mt-0.5">{positives.length ? positives.join(' · ') : '걸리는 것 없음'}</div>
                        </>) : <span className="text-[14px] font-black">좌표 분석 중…</span>}
                    </div>
                </button>
            </div>
            <style>{`@keyframes seat-drain { from { width: 0 } to { width: 100% } }`}</style>
        </div>
    );
}
