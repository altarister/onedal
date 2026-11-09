import { describe, expect, it } from 'vitest';
import { collectOf, incomeOf, moneyOf, paymentOf, withDetailMoney, type CallMoney, type MoneyLine } from './money';

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

    it('틀린 줄(모르는 갈래 · 숫자 아닌 원)은 버리고 나머지는 남긴다', () => {
        const json = '{"lines":[{"kind":"income","won":5000,"shown":"5,000"},{"kind":"bonus","won":1,"shown":"x"},{"kind":"fee","won":"2","shown":"2"}]}';
        expect(moneyOf(json).lines).toEqual([{ kind: 'income', won: 5000, shown: '5,000' }]);
    });
});

describe('💳 결제 · 증빙 화면 글자 → 값', () => {
    it.each([
        ['선/착불', { paymentType: '선/착불', paymentShown: '선/착불', billingType: null, billingShown: null }],
        ['카드', { paymentType: '카드', paymentShown: '카드', billingType: null, billingShown: null }],
        ['인수증', { paymentType: null, paymentShown: null, billingType: '인수증', billingShown: '인수증' }],
        ['계좌이체', { paymentType: '모름', paymentShown: '계좌이체', billingType: null, billingShown: null }],
        ['모름', { paymentType: '모름', paymentShown: '모름', billingType: null, billingShown: null }],
    ] as const)('%s', (shown, want) => {
        expect(paymentOf(shown)).toEqual(want);
    });
    it('글자가 없으면 모두 빈 값 — «모름»과 «없음»을 가른다', () => {
        for (const shown of [null, '', '  ']) expect(paymentOf(shown)).toEqual({ paymentType: null, paymentShown: null, billingType: null, billingShown: null });
    });
});

describe('💰 상세 돈 묶음을 보고 위에 — 갈래마다 덮고 결제 · 증빙은 글자가 있을 때만', () => {
    const reported: CallMoney = { ...moneyWith([{ kind: 'income', won: 70000, shown: '70,000원' }, { kind: 'total', won: 70000, shown: '70,000원' }]), billingType: '인수증', billingShown: '인수증' };
    it('상세 줄 갈래는 상세 값 · 없는 갈래는 보고 그대로 · 증빙은 보고 그대로', () => {
        const detail = moneyWith([{ kind: 'total', won: 140000, shown: '140,000' }, { kind: 'fee', won: 0, shown: '0' }]);
        const m = withDetailMoney(reported, detail)!;
        expect(m.lines.map(l => [l.kind, l.won])).toEqual([['total', 140000], ['fee', 0], ['income', 70000]]);
        expect(incomeOf(m)).toBe(70000);
        expect([m.billingType, m.billingShown]).toEqual(['인수증', '인수증']);
    });
    it('줄 없는 상세(결제 글자만) — 줄은 보고 그대로 · 결제만 얹는다 · 상세가 없으면 보고 그대로', () => {
        const m = withDetailMoney(reported, { ...moneyWith([]), paymentType: '신용', paymentShown: '신용' })!;
        expect(m.lines).toEqual(reported.lines);
        expect(m.paymentType).toBe('신용');
        expect(withDetailMoney(reported, undefined)).toBe(reported);
        expect(withDetailMoney(undefined, reported)).toBe(reported);
    });
    it('🔴 상세 기사님 몫이 보고 기사님 몫과 여덟 배 넘게 다르면 사진 숫자 오독 — 상세 줄을 버리고 보고 값 · 두 배 인상은 믿는다', () => {
        const listed = moneyWith([{ kind: 'income', won: 12000, shown: '12,000' }]);
        const slip = withDetailMoney(listed, moneyWith([{ kind: 'income', won: 120000, shown: '120,000' }, { kind: 'deliveryFee', won: 9730, shown: '9,730' }]))!;
        expect(incomeOf(slip)).toBe(12000);
        expect(slip.lines.map(l => [l.kind, l.won])).toEqual([['deliveryFee', 9730], ['income', 12000]]);
        expect(incomeOf(withDetailMoney(listed, moneyWith([{ kind: 'income', won: 1200, shown: '1,200' }]))!)).toBe(12000);
        expect(incomeOf(withDetailMoney(listed, moneyWith([{ kind: 'income', won: 24000, shown: '24,000' }]))!)).toBe(24000);
    });
    it('🔴 상세 기사님 몫이 0 원 이하면 없는 값 — 상세 줄을 버리고 보고 값(원달앱 `detailFare` 와 같다)', () => {
        const listed = moneyWith([{ kind: 'income', won: 12000, shown: '12,000' }]);
        expect(incomeOf(withDetailMoney(listed, moneyWith([{ kind: 'income', won: 0, shown: '0' }]))!)).toBe(12000);
    });
});
