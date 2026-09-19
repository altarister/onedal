import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { rememberOrder } from '../../src/state/orderMemory';
import { getUserSession } from '../../src/state/userSessionStore';

const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const SRC = join(__dirname, '../../src');
const walk = (dir: string): string[] => readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
});

/**
 * 🚪 **종결된 콜은 되살아나지 않는다 — 관문 하나가 막는다**
 *
 * `TERMINAL_STATUSES` 에 «종결 상태 (더 이상 상태 전이 없음)» 이라 적혀 있는데, 그것을 **강제하는 곳이 없었다.**
 * 상태를 정하는 권한이 호출부마다 흩어져 있어, 늦게 온 요청 하나가 죽은 콜을 심사 중으로 되돌렸다.
 *
 * 같은 모양이 세 번 났다. 전부 **다른 경로**였고, 그때마다 그 경로에 분기를 하나 넣었다 —
 * 버그 대장 #12(정리 경로) · #13(재열람 대조) · 2026-09-19 체험(상세 경로).
 * 그래서 경로가 하나 늘 때마다 다시 난다. 분기를 또 더하지 않고 **쓰는 문을 하나로** 만든다.
 *
 * 무엇을 막나
 * - 종결된 콜이 어떤 경로로든 **비종결 상태로 덮이는 것**
 * - 콜을 메모리에 **직접 쓰는 자리가 다시 생기는 것** (문을 우회하면 규칙이 새로 샌다)
 */
describe('🚪 콜을 기억하는 문은 하나다', () => {
    const uid = 'gate-user';
    const s = () => getUserSession(uid);

    beforeEach(() => {
        s().pendingOrdersData.clear();
        s().myOrders = [];
    });

    it('🔴 종결된 콜을 비종결로 쓰려 하면 안 써진다', () => {
        rememberOrder(s(), { id: 'A', status: 'SAFE_CANCEL' } as any);
        const ok = rememberOrder(s(), { id: 'A', status: 'ORDER_SECURED_EVALUATING' } as any);
        expect(ok).toBe(false);
        expect(s().pendingOrdersData.get('A')!.status).toBe('SAFE_CANCEL');
    });

    it('🔴 하차 완료한 콜도 마찬가지다 — 종결은 종결이다', () => {
        rememberOrder(s(), { id: 'B', status: 'ORDER_DELIVERED' } as any);
        expect(rememberOrder(s(), { id: 'B', status: 'ORDER_CONFIRMED' } as any)).toBe(false);
    });

    it('🔴 장부(myOrders)에만 종결로 남은 콜도 못 되살린다 — 캐시가 비어도 죽은 것은 죽은 것이다', () => {
        s().myOrders = [{ id: 'C', status: 'SAFE_CANCEL' } as any];
        expect(rememberOrder(s(), { id: 'C', status: 'ORDER_SECURED_EVALUATING' } as any)).toBe(false);
        expect(s().pendingOrdersData.has('C')).toBe(false);
    });

    it('종결된 콜을 종결 그대로 쓰는 것은 된다 — 서버를 다시 띄울 때 복구가 지나간다', () => {
        rememberOrder(s(), { id: 'D', status: 'SAFE_CANCEL' } as any);
        expect(rememberOrder(s(), { id: 'D', status: 'ORDER_RELEASED_BY_ME' } as any)).toBe(true);
    });

    it('살아 있는 콜의 정상 전이는 막지 않는다', () => {
        rememberOrder(s(), { id: 'E', status: 'ORDER_PRE_SECURED' } as any);
        expect(rememberOrder(s(), { id: 'E', status: 'ORDER_SECURED_EVALUATING' } as any)).toBe(true);
        expect(rememberOrder(s(), { id: 'E', status: 'ORDER_CONFIRMED' } as any)).toBe(true);
        expect(s().pendingOrdersData.get('E')!.status).toBe('ORDER_CONFIRMED');
    });

    it('처음 보는 콜은 그냥 써진다', () => {
        expect(rememberOrder(s(), { id: 'F', status: 'ORDER_PRE_SECURED' } as any)).toBe(true);
    });

    it('🔴 콜을 메모리에 직접 쓰는 자리가 없다 — 문을 우회하면 규칙이 샌다', () => {
        const bad = walk(SRC)
            .filter(p => !p.endsWith('orderMemory.ts'))
            .filter(p => /pendingOrdersData\.set\(/.test(codeOnly(readFileSync(p, 'utf8'))))
            .map(p => p.slice(SRC.length + 1));
        expect(bad).toEqual([]);
    });

    it('🔴 상세 경로가 거부를 받으면 되살리지 않는다', () => {
        const detail = codeOnly(readFileSync(join(SRC, 'routes/detail.ts'), 'utf8'));
        expect(detail).toMatch(/rememberOrder\(/);
        // 거부를 그냥 흘리면 아래 심사가 죽은 콜로 돈다
        expect(detail).toMatch(/if\s*\(!rememberOrder\(/);
    });
});
