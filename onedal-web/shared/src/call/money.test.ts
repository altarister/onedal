import { describe, expect, it } from 'vitest';
import { collectOf, incomeOf, moneyOf, type CallMoney, type MoneyLine } from './money';

/**
 * 💰 **돈 묶음 — 기사님 몫 · 받을 돈은 돈 줄에서 꺼낸다**.
 * 돈 예시 여섯(`sample.ts` 의 `MONEY_EXAMPLE_*`)의 돈 줄을 옮겨, 꺼낸 값이 견본에 적혀 있던 기사님 몫 · 받을 돈과 같은지 묻는다.
 */
const moneyWith = (lines: MoneyLine[]): CallMoney =>
    ({ lines, feeRateText: null, paymentType: null, paymentShown: null, billingType: null, billingShown: null });

const EXAMPLES: { name: string; lines: MoneyLine[]; income: number | null; collect: number | null }[] = [
    { name: '인성 착불', income: 34650, collect: 45000, lines: [
        { kind: 'income', won: 34650, shown: '실운임 : 34,650(착불)' },
        { kind: 'collect', won: 45000, shown: '고객에게 받을 금액 45,000' },
        { kind: 'consign', won: 0, shown: '탁송료 0' },
    ] },
    { name: '화물24시 인수증', income: 140000, collect: null, lines: [
        { kind: 'income', won: 140000, shown: '운송료 140,000' },
        { kind: 'fee', won: 0, shown: '수수료 0' },
        { kind: 'total', won: 140000, shown: '합계금액 140,000' },
        { kind: 'insurance', won: 610, shown: '[산재보험료(차주부담액): 610원]' },
    ] },
    { name: '화물24시 카드', income: 60000, collect: null, lines: [
        { kind: 'income', won: 60000, shown: '운송료 60,000' },
        { kind: 'vat', won: 6000, shown: '부가세 6,000' },
        { kind: 'unknown', won: 65144, shown: '수납금액 65,144' },
        { kind: 'insurance', won: 260, shown: '[산재보험…(가려짐): 260원]' },
    ] },
    { name: '카카오 픽커', income: 5600, collect: null, lines: [
        { kind: 'income', won: 5600, shown: '5,600 P' },
        { kind: 'deliveryFee', won: 5500, shown: '배송비 5,500P' },
        { kind: 'promo', won: 100, shown: '프로모션 100P' },
    ] },
    { name: '인성플렉스', income: 21252, collect: null, lines: [
        { kind: 'income', won: 21252, shown: '21,252원' },
    ] },
    { name: '인성플렉스 현금', income: null, collect: 123000, lines: [
        { kind: 'collect', won: 123000, shown: '받으실 현금 123,000원' },
        { kind: 'unknown', won: 25000, shown: '탁송 금액 25,000원' },
    ] },
];

describe('💰 돈 묶음', () => {
    it.each(EXAMPLES)('$name — 돈 줄에서 꺼낸 기사님 몫 · 받을 돈이 견본에 적힌 값과 같다', ({ lines, income, collect }) => {
        const m = moneyWith(lines);
        expect(incomeOf(m)).toBe(income);
        expect(collectOf(m)).toBe(collect);
    });

    it('콜 한 칸의 돈 덩어리를 그대로 되살린다', () => {
        const m: CallMoney = { ...moneyWith(EXAMPLES[0].lines), paymentType: '착불', paymentShown: '착불' };
        expect(moneyOf(JSON.stringify(m))).toEqual(m);
    });

    it('비었거나 깨진 글이면 빈 묶음(줄 없음)', () => {
        const empty = moneyWith([]);
        for (const json of [null, '', '{', 'null', '[]', '"글자"']) expect(moneyOf(json)).toEqual(empty);
        expect(incomeOf(moneyOf('{'))).toBeNull();
    });
});
