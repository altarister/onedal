import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSectionDriveMin } from '../../src/services/routeComposer';

/**
 * 🗺️ **잰 경로는 장부까지 간다 — 메모리에만 두지 않는다** (기사님 실측).
 *
 * ── 왜 다시 잴 때마다 적나 ──
 * `insertOrder` 는 경로 칸들을 **콜을 확정할 때 한 번** 저장한다. 그런데 경로는 **그 뒤에**
 * 계산되고 합짐이 붙을 때마다 **다시** 계산된다. 다시 잰 값을 안 적으면 나중에 홀더가 된 콜은
 * 그 값이 **장부에 안 들어가**, 사이클마다 **첫 콜만** 값이 남는다.
 *
 * 그러면 새로고침·재기동 때 **예상 시각·상차버퍼가 폴백으로 돌고**, 주행분이 없어 홀더가
 * 비면 **지도가 직선으로 물러난다**.
 *
 * 🔴 **`sectionDriveMin` 도 장부에 칸이 있어야 한다.** 나머지 셋(`routePolyline`·`sectionEnds`·
 *    `sectionStops`)과 **한 운명**이다.
 */

const read = (p: string) => readFileSync(join(__dirname, '../../src', p), 'utf8');
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('경로는 장부까지 간다', () => {

    /**
     * 🔴 **이 한 건이 이 검사의 핵심이다.** 부르는 자리가 여덟이라 «잊으면 조용히 실패»한다 —
     *    그래서 싣는 일과 적는 일을 **한 이름**으로 묶는다. `applyRoute` 를 직접 부르면
     *    장부가 안 따라오므로, 감싼 함수 안에서만 부르게 못박는다.
     */
    it('🔴 `applyRoute`·`applySoloRoute` 를 직접 부르지 않는다 — 감싼 함수만 부른다', () => {
        const eng = codeOnly(read('services/dispatchEngine.ts'));
        /* 감싼 함수 정의 두 줄은 빼고 센다 */
        const direct = [...eng.matchAll(/(?<!AndSave|function )\bapply(?:Solo)?Route\(/g)];
        const inWrapper = [...eng.matchAll(/\n    apply(?:Solo)?Route\(holder,/g)];
        expect(direct.length - inWrapper.length).toBe(0);
        expect(eng).toMatch(/function applyRouteAndSave/);
        expect(eng).toMatch(/function applySoloRouteAndSave/);
    });

    /**
     * ⚠️ **범위를 좁혀서 센다.** `slice(i, i+400)` 으로 보면 두 감싼 함수가 가까이 있어
     *    **한쪽에서 저장을 빼도 옆 함수 것이 잡혀** 초록이 된다.
     *    그래서 «함수 본문 안에 한 번씩, 합쳐 두 번»을 센다.
     */
    it('🔴 감싼 함수가 장부에 되쓴다 — 둘 다', () => {
        const eng = codeOnly(read('services/dispatchEngine.ts'));
        /** 함수 선언부터 **닫는 줄**(`\n}`)까지가 그 함수 본문이다 */
        const bodyOf = (name: string) => {
            const i = eng.indexOf(`function ${name}`);
            expect(i).toBeGreaterThan(-1);
            return eng.slice(i, eng.indexOf('\n}', i));
        };
        expect(bodyOf('applyRouteAndSave')).toMatch(/OrderRepository\.saveRouteFields/);
        expect(bodyOf('applySoloRouteAndSave')).toMatch(/OrderRepository\.saveRouteFields/);
        /* 🔴 감싼 함수 **둘에서만** 저장한다 — 다른 자리에서 또 부르면 두 벌이 된다 */
        expect([...eng.matchAll(/OrderRepository\.saveRouteFields/g)]).toHaveLength(2);
    });

    /**
     * 🔴 **넷은 한 운명이다.** 궤적만 살아남고 나머지가 없으면 지도가 색을 잃고
     *    주행분이 남의 이름에 붙는다. 한 번에 쓴다.
     */
    it('🔴 네 칸을 한 번에 쓴다 — 궤적만 살아남지 않는다', () => {
        const repo = codeOnly(read('repositories/OrderRepository.ts'));
        const i = repo.indexOf('saveRouteFields');
        const body = repo.slice(i, i + 1400);
        for (const col of ['routePolyline', 'sectionEnds', 'sectionStops', 'sectionDriveMin', 'routeComputedAt']) {
            expect(body).toMatch(new RegExp(`${col}\\s*=`));
        }
    });

    /**
     * 🔴 **모르는 값으로 아는 값을 덮지 않는다.** 주행분 없이 다시 잰 결과가 장부의 주행분을
     *    지우면 화면이 폴백으로 돈다 — `COALESCE` 가 그 일을 한다 (규칙 ④).
     */
    it('🔴 빈 값이 장부의 옛 값을 지우지 않는다', () => {
        const repo = codeOnly(read('repositories/OrderRepository.ts'));
        const i = repo.indexOf('saveRouteFields');
        expect(repo.slice(i, i + 1400)).toMatch(/COALESCE/);
    });

    it('🔴 `sectionDriveMin` 칸이 장부에 있다 — 없어서 홀더가 비었다', () => {
        const db = codeOnly(read('db.ts'));
        const i = db.indexOf("ensureColumns('orders'");
        expect(db.slice(i, i + 2500)).toMatch(/sectionDriveMin: 'TEXT'/);
    });

    it('이력(REST)도 네 칸을 펴서 준다 — 새로고침에 지도가 안 죽는다', () => {
        const route = codeOnly(read('routes/orders.ts'));
        for (const fn of ['parsePolyline', 'parseSectionEnds', 'parseSectionStops', 'parseSectionDriveMin']) {
            expect(route).toMatch(new RegExp(`${fn}\\(`));
        }
    });

    /**
     * 🔴 «못 잰 구간»은 `null` 로 산다 — 숫자만 받으면 그 구간이 통째로 사라져
     *    `sectionStops` 와 길이가 어긋나고, 그러면 주행분이 남의 이름에 붙는다 (#60).
     */
    it('주행분을 되돌릴 때 «못 잼»(null)을 버리지 않는다', () => {
        expect(parseSectionDriveMin('[5,null,12]')).toEqual([5, null, 12]);
        expect(parseSectionDriveMin([5, null, 12])).toEqual([5, null, 12]);
        expect(parseSectionDriveMin('[5,"열두"]')).toBeUndefined();   // 모양이 다르면 통째로 버린다
        expect(parseSectionDriveMin(null)).toBeUndefined();
        expect(parseSectionDriveMin('망가진 JSON')).toBeUndefined();
    });
});
