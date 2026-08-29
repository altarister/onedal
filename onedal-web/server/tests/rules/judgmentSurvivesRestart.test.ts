import { readFileSync } from 'fs';
import { join } from 'path';
import db from '../../src/db';
import { OrderRepository } from '../../src/repositories/OrderRepository';

/**
 * 🎨 **서버가 다시 떠도 색은 그대로다** (2026-08-29 · 4단계에서 발견)
 *
 * 색은 **심사 1회 고정**이다 (판정색 확정안 v2 ③④ · 기사님 확정 2026-08-21):
 * *"파란색이면 믿고 누른다 — 누른 뒤 색이 바뀌면 그 신뢰가 무너진다."*
 * 그래서 판정을 `order_judgments` 에 스냅샷으로 남긴다.
 *
 * ── 그런데 되살리지 않고 있었다 ──
 *
 * 서버가 다시 뜨면 콜을 DB 에서 다시 만드는데(`restoreAndRecalculateSession`)
 * **판정만 안 붙였다.** 스냅샷은 멀쩡히 있는데 화면에는 안 갔다.
 *
 * 화면은 판정 값이 없으면 **문장을 뒤져** 색을 정한다. 그리고 재탐색이 쓰는 문구는
 * `🍯 (꿀)`(괄호)라 따옴표를 찾는 옛 방식이 **못 잡는다** →
 * **꿀콜이 「보통」 초록으로 떨어졌다.** 🚨 `(사고)` 도 마찬가지였다.
 *
 * → 되살린다. 새로 재는 것이 아니라 **그때 그 값을 그대로** 꺼내는 것이다.
 */

const ID = 'TEST-JUDGMENT-RESTORE';
const USER: string = (db.prepare(`SELECT id FROM users LIMIT 1`).get() as any)?.id;
const maybe = USER ? describe : describe.skip;

afterAll(() => {
    db.prepare(`DELETE FROM order_judgments WHERE orderId = ?`).run(ID);
    db.prepare(`DELETE FROM orders WHERE id = ?`).run(ID);
});

maybe('🎨 판정 스냅샷은 통째로 되살아난다', () => {
    it('저장한 그대로 나온다 — 색·점수·기준·조건·딱지', () => {
        db.prepare(`DELETE FROM order_judgments WHERE orderId = ?`).run(ID);
        OrderRepository.saveJudgment(ID, USER, {
            color: '꿀', score: 83,
            axes: [{ key: 'revenuePerDetour', name: '우회 시급', score: 100, weight: 1, raw: '5.0만 ÷ 31분' }],
            gates: [{ key: 'routePromiseGuard', name: '기존 콜 약속 보존', pass: true, why: null }],
            tags: ['배송주행 추정(일반값)'],
        });

        const v = OrderRepository.getJudgmentVerdict(ID);
        expect(v).not.toBeNull();
        expect(v!.color).toBe('꿀');
        expect(v!.score).toBe(83);
        expect(v!.axes).toHaveLength(1);
        expect(v!.gates[0].pass).toBe(true);
        expect(v!.tags).toEqual(['배송주행 추정(일반값)']);
    });

    it('심사한 적 없는 콜은 색을 지어내지 않는다', () => {
        expect(OrderRepository.getJudgmentVerdict('없는-콜')).toBeNull();
    });

    /**
     * 🔴 값이 있어도 **붙여 보내지 않으면 없는 것**이다. 이 레포가 여러 번 당한 형태라
     *    (「고쳤는데 안 돌고 있는 것」) 복구가 실제로 붙이는지 소스로 확인한다.
     */
    it('🔴 재시작 복구가 판정을 콜에 붙인다', () => {
        const src = readFileSync(join(__dirname, '../../src/services/dispatchEngine.ts'), 'utf8');
        const 복구 = src.slice(src.indexOf('export async function restoreAndRecalculateSession'));
        expect(복구).toMatch(/getJudgmentVerdict\(/);
    });
});
