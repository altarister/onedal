import { businessDayKey, isEvaluating, SIGUNGU_AMBIGUOUS, SIGUNGU_UNKNOWN } from '@onedal/shared';

/**
 * 📊 **아침 카드 — 오늘 이 시간엔 어디 → 어디가 많다** (reviews/25 4단계 · 기사님 결정 3 · 1f).
 *
 * 먼발치 1~2초에 읽히게 세 줄 이내: ① 요일·시간 창·기간 ② ③ 콜이 많은 흐름 둘(주마다 N건 · 처음 본 요금 평균).
 * 재료는 관제웹 통계 문(`/api/stats/flows?groupBy=weekdayHour`) 하나 — 같은 요일 · 지금부터 3시간 창만 고른다.
 * 🔴 지어내지 않는다 — 같은 요일 표본이 2일 이하면 «(표본 N일)», 0일이면 한 줄. 모호·모름은 순위에 안 넣고 꼬리의 비율로만.
 * 🔴 «내 폰이 본 목록 기준» — 통계는 기사님 폰이 목록을 훑은 자리 둘레의 콜뿐이다(전국 흐름이 아니다).
 */

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
const WINDOW_HOURS = 3;
const TOP = 2;

interface Sum { calls: number; fareFirstAvg: number }
interface ViewerCell { group: string; from: string; to: string; mine: Sum | null; all: (Sum & { drivers: number }) | null }
export interface FlowsReply { days: string[]; cells: ViewerCell[] }

const weekdayOfDay = (day: string) => {
    const [y, m, d] = day.split('-').map(Number);
    return WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
};
const resolved = (s: string) => s !== SIGUNGU_AMBIGUOUS && s !== SIGUNGU_UNKNOWN;
const man = (won: number) => `${(won / 10000).toFixed(1)}만`;

export function morningCardOf(reply: FlowsReply, nowMs: number): { lines: string[]; tail: string; sampleDays: number; flows: number } {
    const now = new Date(nowMs);
    const weekday = WEEKDAY[now.getDay()];
    const h = now.getHours();
    const sampleDays = reply.days.filter(d => weekdayOfDay(d) === weekday).length;
    if (sampleDays === 0) return { lines: ['📊 아직 쌓인 날이 없다 — 내일 아침부터'], tail: '내 폰이 본 목록 기준', sampleDays, flows: 0 };

    const window = new Set(Array.from({ length: WINDOW_HOURS }, (_, i) => `${weekday} ${h + i}시`));
    const flows = new Map<string, { from: string; to: string; calls: number; fareSum: number }>();
    let total = 0, hidden = 0;
    for (const c of reply.cells) {
        if (!window.has(c.group)) continue;
        /* 남이 3명 이상 섞였으면 칸 합계(all), 아니면 내 값 — 서버가 이미 가려 보냈다 */
        const s = c.all ?? c.mine;
        if (!s) continue;
        total += s.calls;
        if (!resolved(c.from) || !resolved(c.to)) { hidden += s.calls; continue; }
        const key = `${c.from}→${c.to}`;
        const f = flows.get(key) ?? { from: c.from, to: c.to, calls: 0, fareSum: 0 };
        f.calls += s.calls;
        f.fareSum += s.fareFirstAvg * s.calls;
        flows.set(key, f);
    }
    const top = [...flows.values()].sort((a, b) => b.calls - a.calls).slice(0, TOP);
    const head = `📊 ${weekday}요일 ${h}~${h + WINDOW_HOURS}시 · 최근 4주${sampleDays <= 2 ? ` (표본 ${sampleDays}일)` : ''}`;
    const lines = [head, ...(top.length
        ? top.map(f => `${f.from} → ${f.to} · 주마다 ${(f.calls / sampleDays).toFixed(1)}건 · 평균 ${man(f.fareSum / f.calls)}`)
        : ['이 시간대에 본 콜이 없다'])];
    const tail = `내 폰이 본 목록 기준${hidden ? ` · 동네 못 가림 ${Math.round(hidden / total * 100)}%` : ''}`;
    return { lines, tail, sampleDays, flows: top.length };
}

/**
 * 오늘 잡은 콜 수 — 카드가 보이는 조건(«0건»)의 재료.
 * 잡은 콜 = 심사 중이 아닌 콜 가운데 capturedAt 이 오늘 영업일. 예약 보관 콜(내일)은 부르는 쪽이 넘기지 않는다.
 */
export function keptTodayCount(calls: Array<{ status: string; capturedAt?: string }>, nowMs: number): number {
    const today = businessDayKey(nowMs);
    return calls.filter(c => !isEvaluating(c.status as any) && c.capturedAt
        && businessDayKey(Date.parse(c.capturedAt)) === today).length;
}
