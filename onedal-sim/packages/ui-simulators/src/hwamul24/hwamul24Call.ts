/**
 * 🚚 **화물24시 화면만 쓰는 것** — 표기 함수
 *
 * 화물24시 화면만 쓰는 것은 공통 코드(`core-simulator`)에 두지 않고 이 폴더에 둔다 — 공통 코드는 배차망 이름을 모른다
 * (`tests/boundaries.test.ts` 규칙 ①). 화면 글자는 스냅숏(`tests/screens.test.tsx`)이 문다.
 */

import type { BaseCall } from '@altari/core-simulator';
import type { CallDraft, CallOptions, RandomSource } from '@altari/core-simulator';
import { distanceFare, pickFreightFields } from '@altari/core-simulator';

/** 🚚 화물24시 화면이 읽는 콜 — 공통 칸(`BaseCall`) + 화물24시 칸 */
export type Hwamul24Call = BaseCall & {
    // 화물 배차망 둘(인성·화물24시)이 함께 읽는 칸 — 값은 각자 입힌다
    paymentType?: '신용' | '선불' | '착불' | '카드';
    billingType?: '계산서' | '인수증' | '무과세';
    vehicleType?: string;
    itemDescription?: string;
    companyName?: string;
    tonnage?: string;
    vehicleSpec?: string;
    loadingType?: '독차' | '혼적';
    tripType?: '편도' | '왕복';
    loadingMethod?: '당상' | '지상';
    unloadingMethod?: '당착' | '지착';
    freightId?: string;
    registeredAt?: string;
    receiptType?: '인수증' | '계산서';
    loadingWeight?: string;
    itemSummary?: string;
};

/**
 * 🔴 **화물24시 차종 표기** — 같은 값을 **자기 말로 옮겨 적는다**.
 *
 * 문제지는 차종을 한 번만 적는다(`vehicleType: '승용차'`). 그런데 화물24시 화면은
 * 인성과 **다른 말**을 쓴다 — 인성이 «승» 이라 적는 자리를 화물24시는 «승용» 이라 적고,
 * `1t` 를 «1톤» 이라 적는다.
 *
 * 그래서 값은 하나로 두고(규칙 ③ — 파생값의 입력은 한 곳), **읽는 쪽이 각자 옮긴다.**
 * 생성기는 `tonnage` 칸을 안 채운다 — 화면이 `tonnage` 만 보면 **문제지의 승용차 콜이 「1톤」으로 나온다**.
 * 그래서 `tonnage` 가 비면 `vehicleType` 을 이 표로 옮겨 쓴다.
 */
const HWAMUL24_VEHICLE_NAME: Record<string, string> = {
  '오토바이': '오토바이', '다마스': '다마스', '라보': '라보', '승용차': '승용',
  '1t': '1톤', '1.4t': '1.4톤', '2.5t': '2.5톤', '3.5t': '3.5톤',
  '5t': '5톤', '11t': '11톤', '14t': '14톤', '18t': '18톤', '25t': '25톤',
};

export const formatHwamul24Vehicle = (vehicleType?: string | null): string => {
  if (!vehicleType) return '1톤';
  return HWAMUL24_VEHICLE_NAME[vehicleType] ?? vehicleType;
};

/** 화물24시 전용: "경기 / 광주시 / 경안동" → "경기 광주 경안동" */
export const formatHwamul24Region = (fullName: string): string => {
  if (!fullName) return '';
  return fullName
    .split('/')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.replace(/시$/, '').replace(/군$/, ''))
    .join(' ');
};

/**
 * 🎨 **화물24시 칸을 입힌다** — 공통 칸만 있는 콜에 요금·결제·계산서·차종·물품·회사.
 * 인성 칸(합짐·급송·분류·상태)은 화물24시 화면이 안 읽으므로 채우지 않는다.
 * 톤수·독차·당상 같은 화물24시 칸은 비워 두고 화면이 기본값을 쓴다.
 */
export function toHwamul24Call(draft: CallDraft, opts: CallOptions, rng: RandomSource = Math.random): Hwamul24Call {
  const fare = opts.forced?.fare ?? distanceFare(draft.distanceKm, opts.minFare, rng);
  const freight = pickFreightFields(rng, opts.forced?.vehicleType);
  return { ...draft, fare, ...freight };
}
