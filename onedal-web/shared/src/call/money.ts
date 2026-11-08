/**
 * 콜의 돈
 * 누가: 서버 페이지 읽기 · 파서 · 콜 모양
 * 언제: 배차망 화면의 돈 줄 · 결제 · 증빙 글자를 담고 꺼낼 때
 * 어디서: 콜 한 건의 돈 묶음
 * 무엇을: MONEY_KINDS · PAYMENT_TYPES · BILLING_TYPES · CallMoney · incomeOf · collectOf · moneyOf · moneyFrom · paymentOf
 * 어떻게: 화면에 보인 돈 줄만 담고 기사님 몫 · 받을 돈은 그 갈래 줄에서 꺼낸다
 * 왜: 배차망마다 뜻이 다른 숫자 하나에 기사님 몫과 받을 돈이 섞이지 않게 하기 위해서다
 */
/* 💰 아무것도 가져오지 않는 작은 파일로 둔다 — shared 안 파일(pageRead)이 `./index` 에서 런타임 값을 가져오지 않게(순환) */

/* 돈 줄 갈래 — 목록이 원천, 타입은 파생 */
export const MONEY_KINDS = ['income', 'total', 'fee', 'collect', 'consign', 'vat',
                            'insurance', 'deliveryFee', 'promo', 'unknown'] as const;
export type MoneyKind = typeof MONEY_KINDS[number];
export const MONEY_KIND_LABEL: Record<MoneyKind, string> = {
    income: '기사님 몫', total: '합계', fee: '수수료', collect: '받을 돈', consign: '탁송료',
    vat: '부가세', insurance: '보험료', deliveryFee: '배송비', promo: '프로모션', unknown: '뜻 모름',
};

/**
 * 결제 · 증빙 — «모름» = 화면 글자는 있는데 목록에 없는 낱말(글자는 *Shown 에 그대로) · null = 화면에 글자 없음.
 * 파서가 괄호 안 자유 글(«협의» 등)을 결제로 잘못 읽지 않으려면 런타임에 검사할 목록이 필요해 배열을 원천으로 두고 타입을 파생한다.
 */
export const PAYMENT_TYPES = ['신용', '선불', '착불', '카드', '현금', '선/착불', '모름'] as const;
export type PaymentType = typeof PAYMENT_TYPES[number];
export const BILLING_TYPES = ['계산서', '인수증', '무과세', '모름'] as const;
export type BillingType = typeof BILLING_TYPES[number];

/** 화면에 적힌 돈 한 줄 — 글자는 그대로 남긴다 */
export interface MoneyLine {
    kind: MoneyKind;
    won: number;          // 원(픽커 P 는 1P = 1원)
    shown: string;        // 읽는 법이 잡은 글자 «2,387» · 쌍둥이 콜은 고른 목록 줄의 요금 글자 «6,160»
}

/** 콜 한 건의 돈 — 돈 줄만. 기사님 몫 · 받을 돈은 아래 함수로 꺼낸다 */
export interface CallMoney {
    lines: MoneyLine[];             // 화면에 보인 돈 줄 전부 · 기사님 몫 줄 · 받을 돈 줄은 많아야 하나씩
    feeRateText: string | null;     // 화면의 수수료율 · 계산법 글자 «23%»
    paymentType: PaymentType | null;
    paymentShown: string | null;    // 결제 화면 글자 그대로(«모름»일 때 무슨 글자였나)
    billingType: BillingType | null;
    billingShown: string | null;    // 증빙 화면 글자 그대로
}

/** 기사님 몫 — 갈래 income 줄의 금액 · 없으면 null (판정 · 요금 거르기 · 화면 금액 · 저장 사본 incomeWon) */
export const incomeOf = (m: CallMoney): number | null => m.lines.find(l => l.kind === 'income')?.won ?? null;
/** 받을 돈 — 갈래 collect 줄의 금액 · 없으면 null (착불 안내 · 하차 칸 · 받았음/못 받음 · 미수금) */
export const collectOf = (m: CallMoney): number | null => m.lines.find(l => l.kind === 'collect')?.won ?? null;

const textOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const oneOf = <T extends string>(list: readonly T[], v: unknown): T | null =>
    (typeof v === 'string' && (list as readonly string[]).includes(v) ? v as T : null);

/**
 * 결제 · 증빙 화면 글자 → 값 · 화면 글자 — 결제 목록 낱말이면 결제, 증빙 목록 낱말이면 증빙(결제는 빈 값),
 * 둘 다 아니면 결제 «모름» + 화면 글자 그대로 · 글자가 없으면 모두 null(«모름»과 «없음»을 가른다)
 */
export function paymentOf(shown: string | null): Pick<CallMoney, 'paymentType' | 'paymentShown' | 'billingType' | 'billingShown'> {
    const text = shown?.trim() || null;
    const none = { paymentType: null, paymentShown: null, billingType: null, billingShown: null };
    if (!text) return none;
    const bill = oneOf(BILLING_TYPES, text);
    if (bill && bill !== '모름') return { ...none, billingType: bill, billingShown: text };
    return { ...none, paymentType: oneOf(PAYMENT_TYPES, text) ?? '모름', paymentShown: text };
}

const emptyMoney = (): CallMoney => ({ lines: [], feeRateText: null, paymentType: null, paymentShown: null, billingType: null, billingShown: null });

/** 글(JSON)로 쓴 돈 덩어리 → 돈 묶음 · 비었거나 깨졌으면 빈 묶음(줄 없음) · 푼 뒤는 moneyFrom 과 같다 */
export function moneyOf(json: string | null): CallMoney {
    if (!json) return emptyMoney();
    let raw: unknown;
    try { raw = JSON.parse(json); } catch { return emptyMoney(); }
    return moneyFrom(raw);
}

/** 콜 한 칸(orders.callShape)을 푼 money 덩어리 → 돈 묶음 · 객체가 아니면 빈 묶음 · 모양이 틀린 줄 · 목록 밖 값은 담지 않는다 */
export function moneyFrom(raw: unknown): CallMoney {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyMoney();
    const o = raw as Record<string, unknown>;
    const lines = (Array.isArray(o.lines) ? o.lines : []).flatMap((l): MoneyLine[] => {
        if (!l || typeof l !== 'object') return [];
        const { kind, won, shown } = l as Record<string, unknown>;
        const k = oneOf(MONEY_KINDS, kind);
        return k && typeof won === 'number' && Number.isFinite(won) && typeof shown === 'string' ? [{ kind: k, won, shown }] : [];
    });
    return {
        lines,
        feeRateText: textOrNull(o.feeRateText),
        paymentType: oneOf(PAYMENT_TYPES, o.paymentType),
        paymentShown: textOrNull(o.paymentShown),
        billingType: oneOf(BILLING_TYPES, o.billingType),
        billingShown: textOrNull(o.billingShown),
    };
}
