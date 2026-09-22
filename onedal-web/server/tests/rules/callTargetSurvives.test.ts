import { readFileSync } from "fs";
import { join } from "path";

/**
 * 🧭 **복귀 켬과 콜의 판이 콜 0건 틈 · 서버 재기동을 지난다** (기사님 확정 2026-09-15).
 *
 * 클래스: **기사님이 켠 값을 잠깐 빈 계산값이 지운다** — 복귀 켬(콜 0건 → 자동 순환 · 재기동 → 메모리 새로 채움)과
 * 모의 주행 켬(경로 0점 → «켤 수 없음» → running 까지 끔)이 같은 모양이었다.
 * 판단은 순수 함수(`shared/src/callTargetDay.ts` · `phases.ts`)가 하고, 여기서는 **저장·되살림 배선**을 잠근다.
 */
const ROOT = join(__dirname, "../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const bodyOf = (src: string, head: string) => {
    const i = src.indexOf(head);
    expect(i).toBeGreaterThan(-1);
    return src.slice(i, src.indexOf('\n}', i));
};

describe('복귀 켬 — 바꾼 일을 적고 오늘 줄에서 되살린다', () => {
    it('표가 있다 — 바꾼 일만 (지금 상태는 저장하지 않는다)', () => {
        expect(read('src/db.ts')).toMatch(/CREATE TABLE IF NOT EXISTS call_target_events \(\s*user_id\s+TEXT NOT NULL,\s*target\s+TEXT NOT NULL,\s*at\s+TEXT NOT NULL,\s*by\s+TEXT NOT NULL/);
    });

    it('🔴 오늘 줄만 보는 판단은 읽는 함수 안에 있다 — 부르는 쪽에 안 미룬다', () => {
        const ev = read('src/core/callTargetEvents.ts');
        expect(bodyOf(ev, 'export function callTargetToday(')).toMatch(/callTargetOfDay\(/);
        expect(bodyOf(ev, 'export function recordCallTarget(')).toMatch(/INSERT INTO call_target_events/);
    });

    it('🔴 쓰는 입구는 setCallTarget 하나 — 누가 바꿨는지 함께 적는다', () => {
        const en = read('src/services/dispatchEngine.ts');
        expect(bodyOf(en, 'export async function setCallTarget(')).toMatch(/recordCallTarget\(userId, phase, by/);
        expect(read('src/core/callTargetEvents.ts')).not.toMatch(/setCallTarget/);
    });

    it('🔴 세션을 만들 때 오늘 줄에서 복귀 켬을 되살린다 — 옛 사용자·새 사용자 두 갈래 모두', () => {
        const store = read('src/state/userSessionStore.ts');
        expect(store.match(/callTarget: callTargetToday\(userId, Date\.now\(\)\)\.target/g)?.length).toBe(2);
    });

    it('🔴 «복귀콜인가»는 복귀를 켠 시각에서 센다 — 이번 운행(deckOfCycle)으로 세지 않는다', () => {
        const fm = read('src/state/filterManager.ts');
        const calls = bodyOf(fm, 'export function homeCallsOf');
        expect(calls).toMatch(/callTargetToday\(userId/);
        expect(calls).toMatch(/isHomeCallSince\(/);
        expect(calls).not.toMatch(/deckOfCycle/);
        /* 🔄 2026-09-15 — 살아 있는 목적지는 새 규칙 한 곳(`goalZonesNow`)이 정하고 «복귀콜을 잡았나»도 거기서 센다 */
        expect(bodyOf(fm, 'function goalZonesNow(')).toMatch(/homeCallsOf\(session, userId, session\.myOrders\)/);
        expect(bodyOf(fm, 'export function goalCitiesOf(')).toMatch(/goalZonesNow\(session, userId/);
    });
});

describe('콜의 판 — 장부에 적고 되살린다', () => {
    it('칸이 있다', () => {
        expect(read('src/db.ts')).toMatch(/ensureColumns\('orders', \{ goalCity: 'TEXT' \}\)/);
    });

    it('🔴 저장은 콜 저장 한 길 — 재확정에 비어 오면 지우지 않는다', () => {
        const repo = bodyOf(read('src/repositories/OrderRepository.ts'), 'public static upsertOrder(');
        expect(repo).toMatch(/goalCity = COALESCE\(excluded\.goalCity, goalCity\)/);
        expect(repo).toMatch(/cachedOrder as any\)\.goalCity \?\? null/);
    });

    it('🔴 재기동 복구가 칸을 읽는다 — 칸만 있고 안 읽으면 전부 하차지 시로 조용히 물러난다', () => {
        expect(read('src/services/dispatchEngine.ts')).toMatch(/goalCity: row\.goalCity \?\? undefined,/);
    });
});

describe('모의 주행 켬 — 경로가 잠깐 비어도 기사님이 켠 것은 남는다', () => {
    const client = (p: string) => readFileSync(join(ROOT, '../client-app/src', p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    it('🔴 «켤 수 없음»은 running 을 끄지 않는다 — 그 틈만 쉬고 경로가 돌아오면 이어 달린다', () => {
        const store = client('stores/mockDriveStore.ts');
        const line = store.slice(store.indexOf('setAvailable:'), store.indexOf('\n', store.indexOf('setAvailable:')));
        expect(line).not.toMatch(/running/);
    });

    it('🔴 경로가 바뀌면 서 있던 자리에서 가장 가까운 점으로 붙는다 — 새 경로 첫 점으로 튀지 않는다', () => {
        expect(client('hooks/useMockGpsSimulator.ts')).toMatch(/indexRef\.current = nearestIndex\(routePolyline, hereRef\.current\);/);
    });

    it('🔄 끄는 것은 기사님뿐 — 경로 끝에서도 안 끄고 그 자리에서 대기한다 (#133 개정)', () => {
        expect(client('hooks/useMasterGps.ts')).not.toMatch(/useMockDriveStore\.getState\(\)\.stop\(\)/);
    });
});
