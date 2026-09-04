import type { SecuredOrder } from '@onedal/shared';
import { verdictOf } from '../../lib/verdict';
import { getAddressLabel } from '../../lib/routeUtils';
import { SOAK } from './JudgmentSeat';

/**
 * 🪧 **한 줄 심사석** — 시트가 내려가 있을 때 상태바 자리에 뜬다 (2026-09-05 · 안 ⓑ)
 *
 * ── 왜 만드나 ──
 * 판정보드를 **콜 영역(시트)으로 내리자**는 의견에서 나왔다. 옳은 방향인데 위험이
 * 하나 있다 — **주행 중에는 시트가 내려가 있어 안 보인다.** 심사는 30초짜리라
 * 못 보면 자동 취소되고, 그렇다고 시트를 저절로 올리면 **운전 중에 지도를 덮는다.**
 *
 * 그래서 두 단으로 나눈다:
 * | 시트가 내려가 있을 때 | **이 한 줄** — 색·점수·시급·두 버튼. 지도를 안 덮는다 |
 * | 올리면 | 심사석 전체 — 사유·근거·게이트 |
 *
 * 🔴 **근거는 기사님 말씀이다** — *"나는 KEEP 버튼의 내용보다는 파란색, 녹색이면
 *    바로 잡을 거야"* (규칙 ⑤-3). 색과 점수만 보고 1~2초에 누르신다면 **한 줄이면
 *    충분하다.** 158px 카드는 «왜 그 색인지» 궁금할 때 올려 보는 것이다.
 *
 * 🔴 **색은 `JudgmentSeat` 의 것을 그대로 쓴다** — 자리마다 색이 다르면 그게 이
 *    시스템의 가장 큰 사고다 (규칙 ③ · ⑤-3).
 */
interface Props {
    route: SecuredOrder;
    onDecision?: (id: string, action: 'ORDER_CONFIRMED' | 'SAFE_CANCEL') => void;
    /** 시트를 올려 «왜 그 색인지»를 보러 간다 */
    onOpen?: () => void;
}

export default function JudgmentBar({ route, onDecision, onOpen }: Props) {
    const v = verdictOf(route);
    const c = v.color ? SOAK[v.color] : null;
    const score = route.judgment?.score;
    const hourly = route.judgment?.axes?.find(a => a.key === 'money')?.value;
    const judged = !!v.color;

    return (
        <div className="w-full flex items-center gap-2 min-h-[48px]" style={{ fontSize: 13 }}>
            {/* 🎨 왼쪽 색 띠 — 지도·심사석과 같은 색이다 */}
            <span className="shrink-0 rounded-sm" style={{ width: 4, height: 34, background: c ? c.bar : '#3a4358' }} />

            {/* 🔴 색과 점수가 먼저 온다 — 이 둘로 1~2초에 누르신다 */}
            <button type="button" onClick={onOpen}
                    className="flex-1 min-w-0 flex items-baseline gap-1.5 text-left active:opacity-70">
                {judged ? (
                    <span className="shrink-0 font-black tabular-nums leading-none"
                          style={{ fontSize: 21, color: c!.text, textShadow: `0 0 14px ${c!.glow}` }}>
                        {v.color}{score != null && <span style={{ fontSize: 17, marginLeft: 3 }}>{score}</span>}
                    </span>
                ) : (
                    <span className="animate-pulse shrink-0 font-black text-text-muted" style={{ fontSize: 13 }}>판정 중…</span>
                )}
                {hourly != null && (
                    <span className="shrink-0 font-black tabular-nums text-text-primary" style={{ fontSize: 14 }}>
                        {hourly.toFixed(1)}만<span className="text-text-muted" style={{ fontSize: 11 }}>/h</span>
                    </span>
                )}
                <span className="truncate font-bold text-text-muted" style={{ fontSize: 12 }}>
                    {getAddressLabel(route.pickup)}→{getAddressLabel(route.dropoff)}
                </span>
            </button>

            {/* 🔴 두 버튼은 **끝까지 붙여** 둔다 — 엄지가 닿는 자리다 */}
            <span className="shrink-0 flex gap-1.5">
                <button type="button" disabled={!judged}
                    onClick={() => onDecision?.(route.id, 'SAFE_CANCEL')}
                    className="rounded-lg px-2.5 h-9 font-black disabled:opacity-40"
                    style={{ fontSize: 12.5, background: 'linear-gradient(180deg,#3a1518,#2c1013)', color: '#e79aa2', border: '1px solid rgba(224,85,99,.35)' }}>
                    거절
                </button>
                <button type="button" disabled={!judged}
                    onClick={() => onDecision?.(route.id, 'ORDER_CONFIRMED')}
                    className="rounded-lg px-4 h-9 font-black disabled:opacity-40"
                    style={judged
                        ? { fontSize: 13.5, background: `linear-gradient(180deg, ${c!.bar}, ${c!.bar}cc)`, color: '#181818', boxShadow: `0 0 16px ${c!.glow}` }
                        : { fontSize: 13.5, background: '#232c42', color: 'var(--color-text-muted)' }}>
                    KEEP
                </button>
            </span>
        </div>
    );
}
