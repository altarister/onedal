import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * ⏱️ **통화로 약속을 저장하면 그 자리에서 경로를 다시 짠다** (기사님 확정).
 *
 * 굳은 약속이 정거장 순서를 정하므로(`orderByPromise`), 저장만 하고 경로를 두면
 * 미뤄 둔 약속이 다음 사건이 올 때까지 순서에 반영되지 않는다.
 *
 * 🔴 **약속이 든 저장일 때만** 부른다 — 짐만 신고한 저장으로 카카오를 더 부르지 않는다.
 * 🔴 다시 짜기는 **조건부**다 — 남은 정거장이 이미 보낸 순서를 그대로 따르면 안 부른다
 *    (`recalcRouteIfStopsChanged` → `routeNeedsRecompute`).
 */
const handlers = readFileSync(join(__dirname, '../../src/socket/socketHandlers.ts'), 'utf8');
const engine = readFileSync(join(__dirname, '../../src/services/dispatchEngine.ts'), 'utf8');

describe('통화 약속 저장 → 경로 다시 짜기', () => {
    it('🔴 약속이 든 저장에서만 다시 짜기를 부른다', () => {
        expect(handlers).toMatch(/promisedArrivalAt[\s\S]{0,200}recalcRouteIfStopsChanged/);
    });

    it('🔴 다시 짜기는 조건부다 — 정거장이 그대로면 카카오를 안 부른다', () => {
        expect(engine).toMatch(/routeNeedsRecompute\(sent, remaining\)/);
    });

    it('🔴 남은 정거장도 약속을 본 순서로 낸다 — 경로와 같은 잣대', () => {
        expect(engine).toMatch(/planArrivalStops\([\s\S]{0,80}promiseOrderOpts\(session\)\)/);
    });
});
