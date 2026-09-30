import { useEffect, useState } from 'react';
import { businessDayKey } from '@onedal/shared';
import { apiClient } from '../../api/apiClient';
import { morningCardOf, type FlowsReply } from '../../lib/morningCard';

/**
 * 📊 **아침 카드** — 오늘 이 요일 · 이 시간엔 어디 → 어디 콜이 많았나 (reviews/25 4단계).
 *
 * 필터 한 줄 바로 위, **오늘 잡은 콜이 0건일 때만** 부모가 그린다 — 첫 콜을 잡으면 저절로 사라진다.
 * 재료는 관제웹 통계 문 하나(최근 4주 · 어제까지 묶인 날). 못 읽으면 안 그린다.
 * ✕ 를 누르면 그날은 다시 안 뜬다 — 브라우저 저장을 못 읽으면 그냥 보인다.
 */
const CLOSED_KEY = 'onedal.morningCard.closedDay';
const DAY_MS = 86_400_000;

export default function MorningCard() {
    const now = Date.now();
    const today = businessDayKey(now);
    const [closed, setClosed] = useState(() => {
        try { return localStorage.getItem(CLOSED_KEY) === today; } catch { return false; }
    });
    const [reply, setReply] = useState<FlowsReply | null>(null);

    useEffect(() => {
        if (closed) return;
        const at = Date.now();
        const from = businessDayKey(at - 28 * DAY_MS);
        const to = businessDayKey(at - DAY_MS);
        let alive = true;
        apiClient.get<FlowsReply>('/stats/flows', { params: { from, to, groupBy: 'weekdayHour' } })
            .then(r => { if (alive) setReply(r.data); })
            .catch(() => { /* 못 읽으면 카드를 안 그린다 */ });
        return () => { alive = false; };
    }, [closed, today]);

    if (closed || !reply) return null;
    const { lines, tail } = morningCardOf(reply, now);
    const close = () => {
        try { localStorage.setItem(CLOSED_KEY, today); } catch { /* 저장 못 해도 이번엔 닫는다 */ }
        setClosed(true);
    };

    return (
        <div className="relative shrink-0 px-3 py-2 border-b border-border-card text-text-primary">
            <button type="button" onClick={close} aria-label="오늘은 닫기"
                className="absolute top-1 right-1 w-8 h-8 flex items-center justify-center opacity-50">✕</button>
            {lines.map((l, i) => (
                <div key={i} className={`pr-8 truncate ${i === 0 ? 'text-[12.5px] font-black' : 'text-[13px] font-bold'}`}>{l}</div>
            ))}
            <div className="text-[11px] opacity-50 truncate">{tail}</div>
        </div>
    );
}
