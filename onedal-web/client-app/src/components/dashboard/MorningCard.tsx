import { useEffect, useRef, useState } from 'react';
import { businessDayKey } from '@onedal/shared';
import { apiClient } from '../../api/apiClient';
import { morningCardOf, type FlowsReply } from '../../lib/morningCard';
import { logRoadmapEvent } from '../../lib/roadmapLogger';

/**
 * 📊 **아침 카드** — 오늘 이 요일 · 이 시간엔 어디 → 어디 콜이 많았나 (reviews/25 4단계).
 *
 * 필터 한 줄 바로 위, **오늘 잡은 콜이 0건일 때만** 부모가 그린다 — 첫 콜을 잡으면 저절로 사라진다.
 * 재료는 관제웹 통계 문 하나(최근 4주 · 어제까지 묶인 날). 못 읽으면 안 그린다.
 * ✕ 를 누르면 그날은 다시 안 뜬다 — 브라우저 저장을 못 읽으면 그냥 보인다.
 * 📝 서버 로그에 세 줄 — 보임 · ✕ 닫음 · 첫 콜로 사라짐. 그날 한 번씩(새로고침·다시 그리기마다 찍지 않는다).
 */
const CLOSED_KEY = 'onedal.morningCard.closedDay';
const SHOWN_KEY = 'onedal.morningCard.shownDay';
const GONE_KEY = 'onedal.morningCard.goneDay';
const DAY_MS = 86_400_000;
const PAGE = '아침 카드';

const isToday = (key: string, today: string) => {
    try { return localStorage.getItem(key) === today; } catch { return false; }
};
/** 그날 처음이면 적어 두고 true — 저장을 못 쓰면 늘 true(로그가 겹칠 뿐 빠지지는 않는다) */
const firstToday = (key: string, today: string) => {
    try {
        if (localStorage.getItem(key) === today) return false;
        localStorage.setItem(key, today);
    } catch { /* 저장 못 함 */ }
    return true;
};

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

    const card = reply && !closed ? morningCardOf(reply, now) : null;

    const sampleDays = card?.sampleDays ?? null;
    const flows = card?.flows ?? null;
    useEffect(() => {
        if (sampleDays === null) return;
        if (firstToday(SHOWN_KEY, today)) logRoadmapEvent('화면', '웹', sampleDays
            ? `📊 보임 — 표본 ${sampleDays}일 · 흐름 ${flows}개`
            : '📊 보임 — 쌓인 날 없음', PAGE);
    }, [sampleDays, flows, today]);

    if (!card) return null;
    const close = () => {
        try { localStorage.setItem(CLOSED_KEY, today); } catch { /* 저장 못 해도 이번엔 닫는다 */ }
        logRoadmapEvent('화면', '웹', '📊 ✕ 로 닫음', PAGE);
        setClosed(true);
    };

    return (
        <div className="relative shrink-0 px-3 py-2 border-b border-border-card text-text-primary">
            <button type="button" onClick={close} aria-label="오늘은 닫기"
                className="absolute top-1 right-1 w-8 h-8 flex items-center justify-center opacity-50">✕</button>
            {card.lines.map((l, i) => (
                <div key={i} className={`pr-8 truncate ${i === 0 ? 'text-[12.5px] font-black' : 'text-[13px] font-bold'}`}>{l}</div>
            ))}
            <div className="text-[11px] opacity-50 truncate">{card.tail}</div>
        </div>
    );
}

/**
 * 첫 콜로 카드가 저절로 사라진 때 한 줄 — 부모(대시보드)가 오늘 잡은 콜 수를 넘긴다.
 * 0 → 1 이상으로 바뀐 순간 · 그날 카드가 보였고 ✕ 로 닫지 않은 경우만 · 그날 한 번.
 */
export function useMorningCardGoneLog(keptToday: number) {
    const prev = useRef(keptToday);
    useEffect(() => {
        const was = prev.current;
        prev.current = keptToday;
        if (was !== 0 || keptToday === 0) return;
        const today = businessDayKey(Date.now());
        if (isToday(SHOWN_KEY, today) && !isToday(CLOSED_KEY, today)
            && firstToday(GONE_KEY, today)) logRoadmapEvent('화면', '웹', `📊 첫 콜로 사라짐 — 오늘 잡은 콜 ${keptToday}건`, PAGE);
    }, [keptToday]);
}
