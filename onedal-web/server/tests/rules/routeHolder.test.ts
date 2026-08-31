import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🧭 **경로를 든 콜을 «추측»하지 않는다** (기사님 확정 2026-08-31 · 잔상 수리)
 *
 * 기사님: *"자꾸 먼 잔상이 남아서 경로를 망가트리고 있어."*
 *
 * ── 무엇이 문제였나 ──
 * 폴리라인은 «홀더» 한 콜에만 실린다(`applyRoute`). 그런데 **누가 홀더인가**를
 * 세 곳이 각자 판정하고 있었다:
 *   서버 `buildOrderSync`  — 값(sectionDriveMin)이 있는 마지막 활성 콜
 *   관제웹 파생            — 폴리라인이 있는 마지막 진행 중 콜   ← 추측
 *   지도 캔버스            — 같은 추측을 **한 번 더**            ← 추측 두 벌
 *
 * 평소엔 우연히 일치하지만, **새 콜을 KEEP 한 직후 재계산이 끝나기 전**에는 갈린다 —
 * 그 창에서 관제웹은 **직전 콜의 옛 선**을 그렸다. 잔상의 뿌리다.
 * 클래스: 「같은 사실을 여러 곳이 각자 판정한다」 (규칙 ③ — 이 레포가 반복해 당한 형태).
 *
 * ── 고침 ──
 * 서버가 이미 고른 답을 **이름으로** 보낸다(`routeHolderId`). 관제웹은 그 이름의 콜에서만
 * 선을 읽고, 없으면 **아무 선도 안 그린다** — 낡은 선을 그리는 것보다 낫다 (규칙 ④).
 *
 * 🔴 **폴리라인 자체를 봉투에 담지 않는다.** 콜에 이미 있는 것을 한 벌 더 만들면
 *    payload 가 두 배가 되고(2026-08-14 «초당 237KB 로 브라우저가 죽던» 사고),
 *    그 자체가 파생 두 벌이다 — 고치려던 병에 다시 걸린다.
 */
const CLIENT = join(__dirname, '../../../client-app/src');
const read = (rel: string) => readFileSync(join(CLIENT, rel), 'utf8');
/** 주석은 뺀다 — 사고 이력을 적어 둔 문장이 검사에 걸리면 안 된다 */
const codeOnly = (src: string) =>
    src.split('\n').filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');

describe('경로를 든 콜 — 판정은 서버 한 곳', () => {
    it('🔴 서버가 홀더 이름을 실어 보낸다', () => {
        const helpers = readFileSync(join(__dirname, '../../src/core/helpers.ts'), 'utf8');
        expect(helpers).toMatch(/routeHolderId:\s*holder\?\.id/);
    });

    it('🔴 관제웹은 그 이름으로 찾는다 — 폴리라인으로 «마지막 콜»을 뒤지지 않는다', () => {
        const der = codeOnly(read('hooks/useRouteDerivations.ts'));
        expect(der).toMatch(/routeHolderId/);
        expect(der).toMatch(/liveRoute\.find\(r => r\.id === routeHolderId\)/);
        expect(der).not.toMatch(/reverse\(\)[\s\S]{0,80}routePolyline/);
    });

    it('🔴 지도 캔버스는 스스로 홀더를 찾지 않는다 (추측 두 벌 금지)', () => {
        const canvas = codeOnly(read('components/dashboard/PinnedRouteCanvas.tsx'));
        expect(canvas).toMatch(/routeHolder\?\.routePolyline/);
        expect(canvas).not.toMatch(/reverse\(\)[\s\S]{0,80}routePolyline/);
    });

    it('🔴 홀더가 없으면 선을 그리지 않는다 — 낡은 선을 그리지 않는다 (규칙 ④)', () => {
        const der = codeOnly(read('hooks/useRouteDerivations.ts'));
        // activePolyline 은 홀더의 것만 — 홀더가 없으면 null
        expect(der).toMatch(/routeHolder\?\.routePolyline\?\.length \? routeHolder\.routePolyline : null/);
    });

    it('🔴 폴리라인을 경로 봉투에 한 벌 더 담지 않는다 (초당 237KB 사고 재발 방지)', () => {
        const shared = readFileSync(
            join(__dirname, '../../../shared/src/index.ts'), 'utf8');
        const envelope = shared.slice(shared.indexOf('export interface OrderSyncPayload'));
        const body = envelope.slice(0, envelope.indexOf('\n}'));
        expect(codeOnly(body)).not.toMatch(/routePolyline/);
    });
});

/**
 * 🧹 **시뮬 방문 장부는 판을 넘기지 않는다** (기사님 실측 2026-08-31).
 * 7지점 문제지는 판마다 정거장 **좌표가 같다** — 지난 판의 «들렀다»가 남으면
 * 이번 판에서 그 정거장의 정차 연기를 통째로 건너뛴다 (어제 상태가 오늘 되살아나면 안 된다).
 */
describe('모의 주행 — 사이클이 닫히면 방문 장부를 비운다', () => {
    it('🔴 정거장이 하나도 없으면 장부를 초기화한다', () => {
        const sim = codeOnly(read('hooks/useMockGpsSimulator.ts'));
        expect(sim).toMatch(/if \(!stops\?\.length\) simRef\.current = initialSimState\(\)/);
    });
});
