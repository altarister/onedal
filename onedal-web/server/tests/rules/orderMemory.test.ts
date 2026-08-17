import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * 🧠 **콜 객체를 앱 payload 에서 새로 시작하지 않는다** (2026-08-18 신설)
 *
 * 같은 클래스의 사고가 두 번 났다 —
 *   · 2026-08-17 경로 재탐색: 심사 캐시만 고치고 활성 콜을 안 고침 (`95161b6`)
 *   · 2026-08-18 `targetApp`: `/confirm` 이 넣은 값을 `/detail` 이 새 객체로 덮어써 13행 전부 NULL
 *
 * 두 번 다 "필드가 조용히 증발"이라 **타입 검사도 단위 테스트도 못 잡았다.**
 * 사람이 기억하는 대신 이 검사가 기억한다.
 *
 * 허용은 딱 한 곳 — `/orders/confirm` 은 콜을 **처음 보는 자리**라 앞의 기억이 없다.
 */
const SRC = join(__dirname, '../../src');

function walk(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
        const p = join(dir, name);
        return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
    });
}

/** 주석은 역사다 — 지우지 않는다. 코드 줄만 본다. */
function codeOnly(src: string): string {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter(l => !l.trim().startsWith('//'))
        .join('\n');
}

describe('콜 객체 조립 규칙', () => {
    const files = walk(SRC);

    /**
     * 콜을 처음 보는 자리(`/orders/confirm`)를 뺀 나머지에서 앱 payload 로 콜을 조립하려면
     * **반드시 `evolveOrder` 를 거쳐야 한다.** (스프레드 자체를 금지하면 `evolveOrder` 의
     * 인자로 쓰인 것까지 걸리므로, "거쳐 갔는가"를 본다)
     */
    it('앱 payload 로 콜을 조립하는 곳은 evolveOrder 를 거친다', () => {
        const 처음_보는_자리 = ['routes/orders.ts'];
        const 위반 = files
            .filter(f => !처음_보는_자리.some(a => f.endsWith(a)))
            .filter(f => {
                const code = codeOnly(readFileSync(f, 'utf8'));
                return /\.\.\.payload\.order/.test(code) && !/evolveOrder\s*\(/.test(code);
            })
            .map(f => f.replace(SRC, 'src'));

        expect(위반).toEqual([]);
    });

    it('evolveOrder 는 patch 에 없는 키를 앞의 기억에서 살려 온다', () => {
        const { evolveOrder } = require('../../src/state/orderMemory');
        const session: any = {
            pendingOrdersData: new Map([['A', { id: 'A', targetApp: 'insung', fare: 50000 }]]),
        };
        const next = evolveOrder(session, 'A', { id: 'A', fare: 61000, status: 'X' });

        expect(next.targetApp).toBe('insung');   // payload 에 없던 키가 살아남는다
        expect(next.fare).toBe(61000);           // 새로 알아낸 값이 이긴다
        expect(next.status).toBe('X');
    });

    it('앞의 기억이 없으면 patch 그대로다 (콜을 처음 보는 자리)', () => {
        const { evolveOrder } = require('../../src/state/orderMemory');
        const session: any = { pendingOrdersData: new Map() };
        expect(evolveOrder(session, '없음', { id: 'B', fare: 1 })).toEqual({ id: 'B', fare: 1 });
    });
});
