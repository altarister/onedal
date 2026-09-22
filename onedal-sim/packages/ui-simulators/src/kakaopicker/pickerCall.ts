/**
 * 🚚 **카카오T픽커 화면만 쓰는 것** — 콜 칸 · 지역 줄임 표기 (카카오픽커_시뮬레이터.md §9 · 2단계 2-1)
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
    /** 태그줄 앞머리 — 첫째는 배송 종류 «퀵» · «도보» (`pickerKindOf` · 실물 15-2) */
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

/**
 * 🏠 **상세의 주소 줄** — 시도 · 시(또는 구) · [구] · 동 (실물 05 «경기 성남시 분당구 서현1동» · 06 «경기 성남시 중원구 은행2동»).
 * 도로명·번지는 안 싣는다 (실물 상세 첫 줄에 없다 — 건물 이름은 둘째 줄). 모르면 빈칸.
 */
export function formatPickerAddressLine(addressDetail?: string, region?: string): string {
    const tokens = (addressDetail ?? '').split(' ').filter(Boolean);
    if (!tokens.length) return '';
    const head = tokens.slice(0, 2);
    if (tokens[2]?.endsWith('구')) head.push(tokens[2]);
    return [...head, region ?? ''].filter(Boolean).join(' ');
}

/**
 * 🚚 **배송 종류** — 태그 첫째 (실물 15-2). 잡은 뒤 **루틴은 같고 페이지 묶음이 종류마다 다르다**:
 *   퀵 = 흰 페이지 + 바닥 버튼 (17-1 · 17-2 · `PickerQuickPickupPage`) · 도보 = 지도 위 시트 + «밀어서 …» (16~22 · `PickerOngoingScreen`)
 */
export type PickerKind = '퀵' | '도보';
export const pickerKindOf = (call: PickerCall): PickerKind => (call.pickerTags[0] === '도보' ? '도보' : '퀵');

/** 태그 딱지 색 — 퀵 녹색 · 도보 · 단거리 보라 (실물 15-2 · 17-1). 리스트 · 상세 · 내 오더 · 퀵 페이지가 이 한 곳을 쓴다 */
export const pickerTagChipClass = (tag: string): string =>
    tag === '도보' || tag === '단거리' ? 'bg-[#efe6fb] text-[#8a4fd6]' : 'bg-[#e3f6f1] text-[#1aa37a]';

/** 물품 크기 규격 — 실물에서 본 것만 (05 · 06 소형 · 덤프 11 · 33 · 22-1 초소형). 나머지는 모른다 · 상세와 퀵 배송 페이지가 이 한 곳을 쓴다 */
export const PICKER_ITEM_SPEC: Partial<Record<PickerCall['itemSize'], string>> = {
    '초소형': '세 변의 합 70cm ∙ 2kg 이하',
    '소형': '세 변의 합 100cm ∙ 5kg 이하',
};

/** 가까운 랜덤 콜 10건 중 이만큼을 도보로 둔다 — 시뮬레이터 값 (실물 비율은 모른다) */
const WALK_SHARE_OF_10 = 4;

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
 * - 🔴 문제지의 정해진 요금(`opts.forced.fare`)은 배송비로 그대로 쓰고 프로모션은 0 — 픽커 문제지(`pickerPresets.ts` · P 단위)만 온다.
 *   인성·화물24시 문제지(원 단위)는 픽커의 문제지 책에 없어서 배차 화면이 «문제지가 없다»로 멈춘다 (§9-3 · 3단계 3-2)
 */
export function toPickerCall(draft: CallDraft, opts: CallOptions, rng: RandomSource = Math.random): PickerCall {
    const pick = pickWith(rng);
    const itemSize = pick(ITEM_SIZE_POOL);
    const isShort = draft.distanceKm < SHORT_DISTANCE_KM;
    const prepMinutes = rng() < 0.3 ? null : 1 + Math.floor(rng() * 40);
    /**
     * 예약 — 문제지가 정했으면(`netFields.reservedAt` · 3단계 3-2) 그것, 문제지 콜이면 **섞지 않는다**, 랜덤 콜이면 10%.
     * 🔴 랜덤 콜의 난수 뽑는 순서는 예전 그대로 둔다 — 같은 씨앗이면 같은 콜 (`tests/pickerCall.test.ts`).
     */
    const forcedReservedAt = opts.forced?.netFields?.reservedAt;
    const reservedAt = opts.forced
        ? (typeof forcedReservedAt === 'string' ? forcedReservedAt : undefined)
        : (rng() < 0.1 ? draft.pickupTime : undefined);
    const deliveryFee = opts.forced?.fare
        ?? Math.floor((FEE_BASE + draft.distanceKm * FEE_PER_KM + rng() * FEE_RANDOM_EXTRA) / 10) * 10;
    const promotion = opts.forced ? 0 : (rng() < 0.2 ? 100 * (1 + Math.floor(rng() * 10)) : 0);
    const orderNo = orderNumber(rng);
    /**
     * 🚶 도보 — 랜덤 콜 중 **가까운 콜** 일부 (걸어서 가는 거리). 딱지는 «도보» 하나.
     * 🔴 난수를 더 뽑지 않는다 — 오더번호 꼬리(난수 3자리)로 가른다. 같은 씨앗이면 같은 콜 · 뽑는 순서도 그대로.
     * 문제지 콜은 **섞지 않는다**(늘 퀵) — 예약과 같은 규칙.
     */
    const isWalk = !opts.forced && isShort && Number(orderNo.slice(-3)) % 10 < WALK_SHARE_OF_10;
    const pickerTags = isWalk ? ['도보'] : ['퀵', ...(isShort ? ['단거리'] : [])];
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

/**
 * «HH:MM» 까지 **오늘** 남은 분 — 지났으면 0 이하 · 모르면 `null`.
 * ⚠️ 상세의 `minutesUntil` 과 **일부러 다르다** — 상세는 수락 전이라 지난 시각을 «다음 날 마감»으로 보지만,
 *    수락 뒤에는 이미 잡은 콜의 마감이라 지났으면 «준비 완료»다 (실물 18 «픽업 준비 완료»).
 * 읽는 곳: 수락 뒤 화면(`PickerOngoingScreen`) · «내 오더» 카드(`PickerDispatchBoard`).
 */
export function minutesLeftToday(hhmm?: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '');
  if (!m) return null;
  const now = new Date();
  const target = new Date(now);
  target.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 60_000);
}

