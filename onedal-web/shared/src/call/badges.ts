/**
 * 콜의 표시 글자 뜻
 * 누가: 콜 모양 · 배차망 정의 표 · 서버 급송 저장 · 관제웹 «급송» 표시
 * 언제: 배차망 화면의 표시 글자(배지 · 꼬리표)에 뜻을 붙이거나 구분 · 형태 값을 다룰 때
 * 어디서: 콜 한 건의 구분 · 형태 값 칸과 정의 표의 «글자 → 뜻» 줄
 * 무엇을: TRIP_TYPES · ORDER_FORMS · BADGE_PLACES · BADGE_MEANINGS · BadgeWord · isExpressForm · tripTypeOfLedger · orderFormOfLedger
 * 어떻게: 값 목록을 원천으로 두고 타입은 거기서 파생한다 · 글자의 자리 · 뜻은 콜이 아니라 정의 표 줄이 준다
 * 왜: 네 배차망의 같은 뜻 글자가 한 값 칸으로 모이고, 급송을 가르는 곳이 같은 답을 보게 하기 위해서다
 */
/* 🏷️ 아무것도 가져오지 않는 작은 파일로 둔다 — shared 안 파일끼리 런타임 값을 주고받다 순환이 생기지 않게 */

/* 구분 · 형태 — 목록이 원천, 타입은 파생 · «모름» = 자리에 글자가 있는데 목록에 없음 · null = 화면에 그 자리 · 글자가 없음 */
export const TRIP_TYPES = ['편도', '왕복', '경유', '모름'] as const;
export type TripType = typeof TRIP_TYPES[number];
export const ORDER_FORMS = ['보통', '급송', '모름'] as const;
export type OrderForm = typeof ORDER_FORMS[number];

/* 표시 글자가 붙은 자리 — 정의 표 badgeWords 가 쓴다 */
export const BADGE_PLACES = ['row', 'pickup', 'dropoff', 'cargo'] as const;
export type BadgePlace = typeof BADGE_PLACES[number];
export const BADGE_PLACE_LABEL: Record<BadgePlace, string> = {
    row: '줄', pickup: '상차지 칸', dropoff: '하차지 칸', cargo: '화물 글',
};

/* 뜻 갈래 — 값 칸이 다른 계획에 있는 갈래도 여기 이름만 둔다 */
export const BADGE_MEANINGS = ['tripType', 'orderForm', 'noMixedLoad', 'product', 'loadingMethod',
                               'promiseDay', 'reserved', 'payment', 'billing', 'vehicle', 'itemSize', 'postedBy', 'unknown'] as const;
export type BadgeMeaning = typeof BADGE_MEANINGS[number];
export const BADGE_MEANING_LABEL: Record<BadgeMeaning, string> = {
    tripType: '구분', orderForm: '형태', noMixedLoad: '혼적 안 됨', product: '배송 상품',
    loadingMethod: '상하차 방법', promiseDay: '날', reserved: '예약', payment: '결제', billing: '증빙',
    vehicle: '차종', itemSize: '짐 크기', postedBy: '출처', unknown: '뜻 모름',
};

/** 정의 표 한 줄 — 배차망마다 다른 것은 이 데이터뿐 */
export interface BadgeWord {
    text: string;                   // 화면 글자 «독차» · «왕» · «급송/»
    at: BadgePlace;
    meaning: BadgeMeaning;
    value?: TripType | OrderForm;   // 구분 · 형태 갈래만 — «왕» → '왕복'
}

/** 급송 콜인가 — 서버 isExpress · 관제웹 «급송» 표시가 같이 부른다 */
export function isExpressForm(orderForm: OrderForm | null | undefined): boolean {
    return orderForm === '급송';
}

/** 장부 · 콜 한 칸에 적힌 구분 글자 → 값 — 값 목록 안이면 그 값 · 밖이면 null(장부에는 배차망 낱말이 아니라 칸 값만 있다) */
export function tripTypeOfLedger(text: string | null | undefined): TripType | null {
    return (TRIP_TYPES as readonly string[]).includes(text ?? '') ? text as TripType : null;
}

/** 장부 · 콜 한 칸에 적힌 형태 글자 → 값 — 값 목록 안이면 그 값 · 밖이면 null(옛 줄의 «예약» → null) */
export function orderFormOfLedger(text: string | null | undefined): OrderForm | null {
    return (ORDER_FORMS as readonly string[]).includes(text ?? '') ? text as OrderForm : null;
}
