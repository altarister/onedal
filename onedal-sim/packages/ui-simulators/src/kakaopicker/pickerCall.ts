/**
 * 🚚 **카카오T픽커 화면만 쓰는 것** — 콜 칸 · 지역 줄임 표기 (2026-09-14 · 카카오픽커_시뮬레이터.md §9 · 2단계 2-1)
 *
 * 인성·화물24시는 «원·차종»으로 콜을 말하고, 픽커는 «P·물품 크기·태그»로 말한다. 그래서 요금 식도 칸도 따로다.
 * 🔴 기준은 원달앱 픽커 파서(`onedal-app/.../kakaopicker/KakaoPickerParser.kt`)가 **이미 찾고 있는 글자꼴**이다 —
 *    시뮬레이터가 파서에 맞춰 주면 파서를 시험하지 못한다. 실물 캡처(`ex_images/카카오픽커/실물_2026/` 02 · 07)와 실물 화면 덤프
 *    (`log/카카오픽커/화면덤프/09_리스트_퀵7건.xml`)에서 뽑았다.
 */
import type { BaseCall } from '@altari/core-simulator';
import type { CallDraft, CallOptions, RandomSource } from '@altari/core-simulator';
import { pickWith } from '@altari/core-simulator';

/** 🚚 픽커 화면이 읽는 콜 — 공통 칸(`BaseCall`) + 픽커 칸. 차종 칸이 없다 (물품 크기가 대신한다) */
export type PickerCall = BaseCall & {
    net: 'kakaopicker';
    itemSize: '초소형' | '소형' | '중형' | '대형';
    /** 태그줄 앞머리 — 첫째는 늘 «퀵» (지금은 퀵 배송 탭만 흉내 낸다) */
    pickerTags: string[];
    /** 준비 N분 — `null` 이면 «준비 완료» */
    prepMinutes: number | null;
    /** 예약 콜의 시각 «17:00» — 없으면 보통 콜 */
    reservedAt?: string;
    /** 배송비 (P) */
    deliveryFee: number;
    /** 프로모션 (P) — `fare = deliveryFee + promotion` (실물 07 «최종 수익» 분해) */
    promotion: number;
    /** 오더번호 15자리 — 리스트엔 없고 상세에만 보인다 (실물 20 · 23) */
    orderNo: string;
};

/**
 * 🗺️ **픽커 지역 줄임 표기** (§9-2 · 실물 02 · 덤프 09) — 구가 있으면 구에서 «구»를, 없으면 시에서 «시/군»을 떼고, 동에서 «동»을 뗀다.
 *
 *   경기 성남시 분당구 … · 서현1동  →  분당 / 서현1
 *   서울 강남구 …        · 삼성2동  →  강남 / 삼성2
 *   경기 광주시 …        · 신현동   →  광주 / 신현
 *
 * 동이 아닌 이름(모의 데이터의 «매산로» 같은 도로명)은 **그대로 둔다** — 지어내지 않는다 (규칙 ④).
 */
export function formatPickerRegion(addressDetail?: string, region?: string): { city: string; dong: string } {
    const tokens = (addressDetail ?? '').split(' ').filter(Boolean);
    const gu = tokens.slice(1, 3).find(t => t.endsWith('구'));
    const city = gu ? gu.replace(/구$/, '') : (tokens[1] ?? '').replace(/[시군]$/, '');
    const dong = (region ?? '').replace(/동$/, '');
    return { city, dong };
}

/** 물품 크기 — 실물 리스트는 «소형»이 대부분이다 (덤프 09: 7건 중 6건) */
const ITEM_SIZE_POOL: PickerCall['itemSize'][] = ['소형', '소형', '소형', '소형', '초소형', '중형', '대형'];

/** 단거리 태그를 붙이는 배송 거리 (km) — 실물 02 의 단거리 콜은 2천~5천 P 대였다. 지금은 눈대중 경계다 */
const SHORT_DISTANCE_KM = 8;

/**
 * 💰 배송비 식 — 실물 02·덤프 09 의 요금 폭(2,350 ~ 16,870 P)에 들게 맞춘 **시뮬레이터 값**이다.
 * ⚠️ 픽커의 실제 요금 규칙은 모른다 (6단계 «픽커 요금 규칙»에서 다룬다). 10 P 단위로 내린다.
 */
const FEE_BASE = 2000;
const FEE_PER_KM = 550;
const FEE_RANDOM_EXTRA = 800;

/**
 * 🎨 **픽커 칸을 입힌다** (2단계 2-1) — 공통 칸만 있는 콜에 물품 크기 · 태그 · 준비 시간 · 예약 · 배송비 · 프로모션 · 오더번호.
 *
 * - 공통 칸은 한 칸도 안 바꾼다 (`tests/pickerCall.test.ts`)
 * - `opts.minFare` 는 **안 쓴다** — 설정 화면의 최소 요금(1만~10만 원)은 인성·화물24시 원 단위라 P 에 맞지 않는다
 * - 🔴 문제지의 정해진 요금(`opts.forced.fare`)은 배송비로 그대로 쓴다 — 그래도 인성·화물24시 문제지는 원 단위라
 *   픽커 화면에 띄우지 않는다 (배차 화면이 막는다 · §9-3)
 */
export function toPickerCall(draft: CallDraft, opts: CallOptions, rng: RandomSource = Math.random): PickerCall {
    const pick = pickWith(rng);
    const itemSize = pick(ITEM_SIZE_POOL);
    const isShort = draft.distanceKm < SHORT_DISTANCE_KM;
    const prepMinutes = rng() < 0.3 ? null : 1 + Math.floor(rng() * 40);
    const reservedAt = rng() < 0.1 ? draft.pickupTime : undefined;
    const deliveryFee = opts.forced?.fare
        ?? Math.floor((FEE_BASE + draft.distanceKm * FEE_PER_KM + rng() * FEE_RANDOM_EXTRA) / 10) * 10;
    const promotion = opts.forced ? 0 : (rng() < 0.2 ? 100 * (1 + Math.floor(rng() * 10)) : 0);
    const orderNo = orderNumber(rng);

    const pickerTags = ['퀵', ...(isShort ? ['단거리'] : [])];
    return {
        ...draft,
        net: 'kakaopicker',
        itemSize,
        pickerTags,
        prepMinutes,
        ...(reservedAt ? { reservedAt } : {}),
        deliveryFee,
        promotion,
        fare: deliveryFee + promotion,
        orderNo,
    };
}

/** 오더번호 «260902091827593» 꼴 — 연월일시분초 12자리 + 3자리. 시각은 지금, 꼬리는 난수 */
function orderNumber(rng: RandomSource): string {
    const d = new Date();
    const two = (n: number) => n.toString().padStart(2, '0');
    const stamp = `${two(d.getFullYear() % 100)}${two(d.getMonth() + 1)}${two(d.getDate())}${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
    return stamp + Math.floor(rng() * 1000).toString().padStart(3, '0');
}
