import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🧹 **취소·방출한 시각을 남긴다** (목업 `labPortMap.ts` 의 `terminatedAt`).
 *
 * 취소·방출은 «사라지지 않고 옮겨 간다»(규칙: 종료된 콜은 «완료됨 · 취소/방출» 로 이동). 하차에 `completedAt` 이 있듯
 * 취소·방출에도 **언제** 버렸는지를 장부에 적는다 — 상태만 바꾸면 시각이 안 남는다. 안전취소는 배차망 취소 횟수(10회)에
 * 들어가서, 기사님이 «언제 몇 번 썼나»를 알아야 한다.
 *
 *   · 장부 칸 `orders.terminatedAt` — 기존 DB 에는 `ensureColumns` 로 붙인다
 *   · 상태를 취소·방출로 바꾸는 한 곳(`OrderRepository.updateOrderStatus`)이 적는다 — 처음 한 번만(`COALESCE`)
 *   · 관제웹 조회 목록 머리에 «취소 HH:MM»
 */
const code = (rel: string) => readFileSync(join(__dirname, '../../', rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('🧹 취소·방출 시각', () => {
    it('🔴 장부에 칸이 있다 — 기존 DB 에는 ensureColumns 로 붙인다', () => {
        expect(code('src/db.ts')).toMatch(/ensureColumns\('orders', \{[^}]*terminatedAt: 'TEXT'/);
    });
    it('🔴 취소·방출로 바꾸는 한 곳이 시각을 적는다 — 처음 한 번만', () => {
        const repo = code('src/repositories/OrderRepository.ts');
        const fn = repo.slice(repo.indexOf('updateOrderStatus('), repo.indexOf('insertOrderStop('));
        expect(fn).toMatch(/terminatedAt = CASE/);
        expect(fn).toMatch(/COALESCE\(terminatedAt/);
        expect(fn).toMatch(/SAFE_CANCEL/);
    });
    /**
     * 🔴 **그리는 자리를 읽는다** — 조회 목록은 서랍(`Drawer`)이다.
     *    옛 판은 `PinnedRouteCard` 의 «리스트 헤더»를 읽었는데, 그 머리줄은 덱 전용 헤더가
     *    생긴 뒤로 한 번도 안 그려졌고(`variant='list'` 를 주는 곳이 없어졌다) 이제 걷었다.
     *    조회 탭이 서랍으로 옮겨 갈 때 검사가 안 따라왔던 것이다.
     */
    it('🔴 관제웹 조회 목록(서랍)이 취소 시각을 보인다', () => {
        expect(code('../client-app/src/components/layout/Drawer.tsx')).toMatch(/terminatedAt/);
    });
});
