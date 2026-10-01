// @ts-nocheck
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 📦 **응답 모양은 shared 한 곳** (공통 함수 6 · onedal-1f «가») — 서버가 보내는 자리에 shared 타입 이름이 붙고, 받는 화면은 모양을 따로 적지 않는다.
 * 따로 적으면 서버가 칸 이름을 바꿔도 양쪽 tsc 가 못 잡아 화면이 조용히 빈다.
 */
const WEB = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(WEB, p), 'utf8');

describe('📦 응답 모양 shared', () => {
    it('🔴 받는 쪽에 모양 사본이 없다', () => {
        const copies: [string, RegExp][] = [
            ['client-app/src/lib/morningCard.ts', /interface (FlowsReply|ViewerCell|Sum)\b/],
            ['ops/src/api/ops.ts', /interface (StatsAdminReply|StatsAdminCell)\b/],
            ['client-app/src/hooks/useSystemAlerts.ts', /interface (EmergencyAlert|SafeCancelWarning|FilterPassAlarm)\b/],
            ['ops/src/api/client.ts', /interface ServerHealth\b/],
            ['logbook/src/components/FilterDayBoard.tsx', /interface FilterDay\b/],
            ['logbook/src/components/PlaceInsightBoard.tsx', /interface (HotspotPlace|BlacklistedPlace|PlaceInsights)\b/],
            ['logbook/src/components/KeyMetricsBoard.tsx', /interface SummaryMetrics\b/],
            ['server/src/services/statService.ts', /interface (SummaryMetrics|HotspotPlace|BlacklistedPlace|PlaceInsights)\b/],
        ];
        expect(copies.filter(([f, re]) => re.test(read(f))).map(([f]) => f)).toEqual([]);
    });
    it('🔴 서버가 보내는 자리에 shared 타입 이름이 붙어 있다', () => {
        expect(read('server/src/routes/stats.ts')).toMatch(/: FlowsViewerReply = /);
        expect(read('server/src/routes/stats.ts')).toMatch(/: FlowsAdminReply = /);
        expect(read('server/src/routes/emergency.ts')).toMatch(/: EmergencyAlert = /);
        expect(read('server/src/routes/detail.ts')).toMatch(/: SafeCancelWarning = /);
        expect(read('server/src/routes/devices.ts')).toMatch(/: FilterPassAlarm = /);
        expect(read('server/src/routes/health.ts')).toMatch(/: HealthReply = /);
        expect(read('server/src/routes/logbook/filterDays.ts')).toMatch(/: FilterDaysReply = /);
        expect(read('shared/src/index.ts')).toMatch(/export \* from '\.\/replies'/);
    });
});
