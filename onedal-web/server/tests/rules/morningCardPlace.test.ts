import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 📊 **아침 카드의 자리와 조건** (reviews/25 4단계 · 1f «가 · 가»).
 * 첫 화면의 필터 한 줄(OrderFilterStatus) 바로 위 · 보이는 조건은 «오늘 잡은 콜 0건» 하나(사실을 직접 센다 · 국면 이름을 안 본다).
 * ✕ 로 닫으면 그날은 다시 안 뜬다 — 브라우저 저장은 try/catch(못 읽으면 그냥 보인다). 읽는 문은 관제웹 통계 문 하나.
 */
const client = (p: string) => readFileSync(join(__dirname, '../../../client-app/src', p), 'utf8');

describe('📊 아침 카드 자리', () => {
    it('필터 한 줄 바로 위 · 오늘 잡은 콜 0건일 때만', () => {
        const dash = client('pages/Dashboard.tsx');
        expect(dash).toContain('const keptToday = keptTodayCount([...orders, ...terminatedOrders], Date.now());');
        const i = dash.indexOf('{keptToday === 0 && <MorningCard />}');
        expect(i).toBeGreaterThan(-1);
        expect(dash.indexOf('<OrderFilterStatus', i)).toBeGreaterThan(i);
    });

    it('🔴 국면 이름으로 가르지 않는다', () => {
        const card = client('components/dashboard/MorningCard.tsx');
        expect(card).not.toMatch(/dispatchPhase|DELIVERING|GATHERING|STANDBY/);
    });

    it('읽는 문은 관제웹 통계 문 하나 · ✕ 닫은 날 저장은 try/catch', () => {
        const card = client('components/dashboard/MorningCard.tsx');
        expect(card).toContain("apiClient.get<FlowsReply>('/stats/flows', { params: { from, to, groupBy: 'weekdayHour' } })");
        expect(card).toMatch(/try \{ localStorage\.setItem\(CLOSED_KEY, today\); \} catch/);
        expect(card).toMatch(/try \{ return localStorage\.getItem\(CLOSED_KEY\) === today; \} catch \{ return false; \}/);
    });
});
