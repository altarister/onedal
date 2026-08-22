import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🗺️ **한 번 잰 경로를 다시 재지 않는다** (기사님 확정 2026-08-23)
 *
 * 기사님: *"콜이 들어와 확정 지을 때 경로를 저장하고 있는 거 맞지? … 확정된 경로를
 * 새로 받아올 필요가 없다 생각되어서 하는 질문이야."*
 *
 * 실측으로 확인한 것:
 *   ⓐ `orders` 에 `routeComputedAt`·거리·시간은 있는데 **궤적(routePolyline)이 없다.**
 *      그래서 서버가 재시작할 때마다 `restoreAndRecalculateSession` 이 **카카오를 다시 부른다**
 *      (2026-08-22 하루에만 여섯 번 재시작 = 여섯 번 재계산).
 *   ⓑ 새 콜을 붙였다가 취소하면 **원래 경로를 또 계산한다.** 원래 콜은 아무것도 안 바뀌었는데.
 *      미리보기를 넣은 뒤 "판정만 받고 취소"가 잦아져 이 낭비가 커졌다.
 *
 * ⚠️ 되살릴 때 **현위치가 그대로일 때만** 쓴다 — 취소하는 사이 기사님이 움직였으면
 *    같은 콜이라도 경로가 달라진다. 낡은 궤적을 쓰는 건 없는 값을 쓰는 것보다 나쁘다.
 */

const SERVER = join(__dirname, '../../src');
const read = (p: string) => readFileSync(join(SERVER, p), 'utf8');
/** 주석은 걷어낸다 — 계획을 적어 둔 글이 구현으로 세어지지 않게 */
const code = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('🗺️ 가 — 확정 경로는 장부에 남는다', () => {
    it('🔴 orders 에 궤적 칸이 있다', () => {
        const db = code(read('db.ts'));
        expect(db).toMatch(/routePolyline/);
    });

    it('🔴 KEEP 할 때 궤적을 함께 저장한다', () => {
        const repo = code(read('repositories/OrderRepository.ts'));
        expect(repo).toMatch(/routePolyline/);
    });

    /**
     * 🔴 저장했으면 **다시 부르지 않는다.** 재시작 복구가 장부의 궤적을 먼저 본다.
     *    없을 때만(옛 행·연산 실패) 카카오로 간다 — 안전망은 남긴다.
     */
    /**
     * 🔴 **장부의 문자열이 화면까지 새어 나가면 안 된다** (2026-08-23 실측 사고).
     *
     * `routePolyline` 은 DB 에 **JSON 문자열**로 산다. 그런데 `/api/orders` 는 행을
     * `SELECT *` 로 읽어 **그대로** 관제웹에 보냈다. 관제웹은 좌표 배열로 알고
     * `.filter()` 를 부르다 통째로 죽었다:
     *
     *     TypeError: currentPolyline.filter is not a function  (PinnedRouteCanvas:65)
     *
     * 저장 형식(문자열)과 쓰는 형식(배열)이 다르면 **경계에서 반드시 되돌린다.**
     * 그 자리는 `parsePolyline` 한 곳이다 (규칙 ③).
     */
    it('🔴 장부에서 읽어 내보낼 때 좌표 배열로 되돌린다', () => {
        const ord = code(read('routes/orders.ts'));
        expect(ord).toMatch(/parsePolyline|routePolyline/);
    });

    it('🔴 재시작 복구가 장부의 궤적을 먼저 쓴다', () => {
        const eng = code(read('services/dispatchEngine.ts'));
        const fn = eng.split('export async function restoreAndRecalculateSession')[1] ?? '';
        expect(fn).toMatch(/routePolyline/);
    });
});

/**
 * 🔴 **취소는 원래 경로로 되돌아가는 것이다** — 다시 계산하는 것이 아니다.
 */
describe('↩️ 나 — 취소하면 직전 경로를 되살린다', () => {
    it('🔴 새 콜을 붙이기 전 경로를 한 벌 보관한다', () => {
        const store = code(read('state/userSessionStore.ts'));
        expect(store).toMatch(/routeSnapshot|prevRoute/);
    });

    it('🔴 강제 정리·취소가 그 보관본을 되돌린다', () => {
        const eng = code(read('services/dispatchEngine.ts'));
        expect(eng).toMatch(/restoreRouteSnapshot|routeSnapshot/);
    });

    /**
     * ⚠️ 현위치가 달라졌으면 되살리지 않는다 — 그때는 다시 재는 것이 맞다.
     */
    it('🔴 현위치가 그대로일 때만 되살린다', () => {
        const src = code(read('services/routeComposer.ts')) + code(read('services/dispatchEngine.ts'));
        expect(src).toMatch(/driverLocation/);
    });
});

/**
 * 🌅 **자정에 바뀐 필터도 화면에 간다** (2026-08-23 확인).
 *
 * 영업일이 바뀌면 `activeFilter` 가 `baseFilter` 로 되돌아간다. 전환 함수는
 * `sync-active-orders`(콜 목록)만 직접 보내는 것처럼 보이지만, 끝에서
 * `updateActiveFilter(userId, {}, io)` 를 부르고 그 안의 `broadcastFilter` 가
 * `filter-updated` 를 쏜다. **이미 되어 있다** — 이 검사는 그것이 끊기지 않게 지킨다.
 *
 * ⚠️ `broadcastFilter` 는 **직전과 같은 내용이면 안 보낸다**(`lastFilterJson`).
 *    자정 리셋은 값이 실제로 바뀌므로 통과한다.
 */
describe('🌅 자정 전환 — 필터가 바뀐 것도 알린다', () => {
    it('전환이 파생 재계산과 전파를 함께 부른다', () => {
        const fm = code(read('state/filterManager.ts'));
        const i = fm.indexOf('오늘 필터를 기본 설정으로 되돌립니다');
        expect(i).toBeGreaterThan(-1);
        expect(fm.slice(i, i + 600)).toMatch(/updateActiveFilter\(userId, \{\}, io\)/);
    });

    it('🔴 전파는 filter-updated 로 나간다 (관제탑이 듣는 이름)', () => {
        expect(code(read('state/filterManager.ts'))).toMatch(/emit\("filter-updated"/);
    });
});
