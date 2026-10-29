/**
 * 🛵 **인성플렉스 화면만 쓰는 것** — 콜 칸 · 화면 글자
 *
 * 글자 꼴의 기준은 실물 캡처(`ex_images/인성플렉스/` 02 · 07 목록 · 08~12 상세)의 접근성 글자다.
 * 🔴 원달앱 파서가 찾는 글자꼴에 맞추지 않는다 — 실물 글자에 맞춘다(그래야 파서를 시험한다).
 * 화면은 이 파일의 글자 함수만 부른다 — 같은 콜이 목록 · 상세 · 진행중에서 같은 글자로 보이게.
 *
 * 🔴 글자 금지(원달앱이 배차망을 화면 글자로 가른다): 적요 견본에 «요금»(인성 상세 표식 «적요상세» + «요금»과 겹침) · «완료».
 */
import { dayOffset, distanceFare } from '@altari/core-simulator';
import type { BaseCall, CallDraft, CallOptions, LocationDetailInfo, LocationPoint, RandomSource } from '@altari/core-simulator';

/** 칩 글자 [실물 02] — 목록 칩 · 홈 배송 수단이 같은 말을 쓴다 */
export type IsflexVehicleKind = '도보' | '개인이동수단' | '오토바이' | '승용/소형';
export const ISFLEX_VEHICLE_KINDS: IsflexVehicleKind[] = ['도보', '개인이동수단', '오토바이', '승용/소형'];

/** 🛵 인성플렉스 화면이 읽는 콜 — 공통 칸(`BaseCall`) + 인성플렉스 칸 */
export type IsflexCall = BaseCall & {
  net: 'isflex';
  /** 칩 거르기 */
  vehicleKind: IsflexVehicleKind;
  /** 목록 줄 · 상세 차종 글자 — 오토바이는 «오토»[실물] · 그 밖은 칩 글자 그대로[지어냄] · 문제지가 정한 다른 차종은 그 낱말 그대로 */
  vehicleWord: string;
  /** 출발지 앞 예약 «낼08:20/» · «낼8:30)» · «낼09시/» [실물 꼴] — 없으면 빈 글자 */
  reservePrefix: string;
  /** 도착지 앞 마감 «10:20전/» [실물 꼴] — 없으면 빈 글자 */
  deadlinePrefix: string;
  /** 출발 동 글자 — 일부는 시 이름이 붙는다(«수원이의동») */
  pickupDong: string;
  /** 도착 동 글자 («구리수택동» · «김포통진읍») */
  dropoffDong: string;
  /** 꼬리표 «과적» [실물] · «급송» [추정] */
  tags: string[];
  /** 적요 — 빈 적요는 «없음» [실물 12] */
  memo: string;
  /** 결제 — 없을 수 있다 [실물 10 · 11 · 12] */
  paymentType?: '선불' | '착불';
};

/** 🔢 기사님 적립금(원) — 시뮬 값. 0 이면 착불 콜의 «수행하기»는 늘 «적립금이 부족합니다»(실물 15 적립금 0원) */
export const ISFLEX_POINT = 0;

/** 랜덤 콜의 수입 = 거리 요금 × 이 값 [추정 — 실물 8,500 = 10,000 × 0.85] */
const INCOME_RATE = 0.85;

/** 적요 견본 — 실물 적요 꼴(08 · 09 · 10 · 11). 🔴 «요금» · «완료» 낱말 금지 */
export const ISFLEX_MEMO_SAMPLES = [
  '1박스 3층 계단물건 있음',
  '큰봉투1개(80L이하)',
  '박스1개 친절하게 부탁합니다',
  '과적 아이스박스1(제품샘플)-착지시간꼭엄수',
];
const EMPTY_MEMO = '없음';

/** 🛵 사이즈 설정 시트 안 견본 줄 [실물 06 그대로] — 콜이 아니다 */
export const ISFLEX_SAMPLE_ROW: IsflexRowTexts = {
  pickupKm: '33.3', vehicle: '오토', pickup: '출발지 위치 미리보기', run: '약 2.0km', dropoff: '도착지 위치 미리보기', fare: '30,000',
};

/** 목록 줄 하나의 칸 일곱 — 실물 xml 차례(거리 · 차종 · 출발지 · 운행 거리 · 도착지 · 수입 · 결제) */
export interface IsflexRowTexts {
  pickupKm: string;
  vehicle: string;
  pickup: string;
  run: string;
  dropoff: string;
  fare: string;
  payment?: string;
}

const two = (n: number) => n.toString().padStart(2, '0');

/** «24.3» — 소수 한 자리 · 단위 없음 [실물 02] */
export const isflexListKm = (km?: number): string => (km == null ? '' : km.toFixed(1));
/** «24.4km» [실물 08] */
export const isflexDetailKm = (km?: number): string => (km == null ? '' : `${km.toFixed(1)}km`);
/** «약 30.1km» [실물 02 · 08] — 시뮬은 직선 거리 */
export const isflexRunKm = (km: number): string => `약 ${km.toFixed(1)}km`;
/** «21,252» — 목록 수입(«원» 없음) [실물 02] */
export const isflexFare = (fare: number): string => fare.toLocaleString('ko-KR');
/** «21,252원» — 상세 «총 수입» [실물 08] */
export const isflexFareWon = (fare: number): string => `${isflexFare(fare)}원`;
/** «21,252원 \n수행하기» — 상세 단추 한 덩어리(«원» 뒤 빈칸 + 줄바꿈) [실물 08 tv_accept] */
export const isflexAcceptLabel = (fare: number): string => `${isflexFareWon(fare)} \n수행하기`;

/** 출발지 칸 «@낼08:20/수원이의동» [실물 02] */
export const isflexPickupLabel = (c: IsflexCall): string => `@${c.reservePrefix}${c.pickupDong}`;
/** 도착지 칸 «10:20전/쌍림동» [실물 02] */
export const isflexDropoffLabel = (c: IsflexCall): string => `${c.deadlinePrefix}${c.dropoffDong}`;
/** 상세 머리 «@낼08:20/수원이의동 → 10:20전/쌍림동» [실물 10] */
export const isflexTitle = (c: IsflexCall): string => `${isflexPickupLabel(c)} → ${isflexDropoffLabel(c)}`;

/** 모의 주소에서 시도 · 시군구(붙임) · 시 짧은 이름 — «경기 수원시 영통구 …» → 경기 · 수원시영통구 · 수원 */
function placeOf(detail?: LocationDetailInfo, point?: LocationPoint): { sido: string; sigungu: string; city: string; dong: string } {
  const tokens = detail?.addressDetail
    ? detail.addressDetail.split(' ').filter(Boolean)
    : (point?.fullName ?? '').split(' / ').filter(Boolean);
  const sido = tokens[0] ?? '';
  const first = tokens[1] ?? '';
  const sigungu = first + (tokens[2]?.endsWith('구') && /[시군]$/.test(first) ? tokens[2] : '');
  const city = /[시군]$/.test(first) ? first.replace(/[시군]$/, '') : '';
  const dong = detail?.region ?? point?.name ?? '';
  return { sido, sigungu, city, dong };
}

/** 상세 출발 «@경기 수원시영통구 @낼08:20/수원이의동» — 시군구는 시+구를 붙인다 [실물 10 · 08 · 12] */
export function isflexPickupPoint(c: IsflexCall): string {
  const p = placeOf(c.pickupDetails?.[0], c.pickups[0]);
  return `@${[p.sido, p.sigungu].filter(Boolean).join(' ')} @${c.reservePrefix}${c.pickupDong}`;
}

/** 상세 도착 «서울 중구 10:20전/쌍림동» [실물 08 · 10 · 12] */
export function isflexDropoffPoint(c: IsflexCall): string {
  const p = placeOf(c.dropoffDetails?.[0], c.dropoffs[0]);
  return [p.sido, p.sigungu, `${c.deadlinePrefix}${c.dropoffDong}`].filter(Boolean).join(' ');
}

/** 목록 줄 칸 일곱 — 진짜 줄과 사이즈 시트 견본 줄이 같은 모양을 쓴다 */
export const isflexRowTexts = (c: IsflexCall): IsflexRowTexts => ({
  pickupKm: isflexListKm(c.pickupDistanceKm),
  vehicle: c.vehicleWord,
  pickup: isflexPickupLabel(c),
  run: isflexRunKm(c.distanceKm),
  dropoff: isflexDropoffLabel(c),
  fare: isflexFare(c.fare),
  ...(c.paymentType ? { payment: c.paymentType } : {}),
});

/** 오토바이 → «오토»[실물] · 그 밖 → 칩 글자 그대로[지어냄] */
const wordOfKind = (k: IsflexVehicleKind): string => (k === '오토바이' ? '오토' : k);

/** 문제지 · 개별콜이 정한 차종(표준 이름) → 칩 · 화면 글자. 차종이 없으면 오토바이(실물 목록은 «오토»뿐) */
function kindOfForced(vehicleType?: string): { vehicleKind: IsflexVehicleKind; vehicleWord: string } {
  if (!vehicleType || vehicleType === '오토바이') return { vehicleKind: '오토바이', vehicleWord: '오토' };
  if (vehicleType === '승용차') return { vehicleKind: '승용/소형', vehicleWord: '승용/소형' };
  if ((ISFLEX_VEHICLE_KINDS as string[]).includes(vehicleType)) {
    const k = vehicleType as IsflexVehicleKind;
    return { vehicleKind: k, vehicleWord: wordOfKind(k) };
  }
  /* 다마스 · 라보 · 1t … — 인성플렉스 칩에 없는 차종은 승용/소형 칩에 두고 글자는 받은 낱말 그대로(원달앱 «모르는 차종» 기록 재료) */
  return { vehicleKind: '승용/소형', vehicleWord: vehicleType };
}

/** 예약 앞글자 세 꼴 [실물] — «낼08:20/» · «낼8:30)» · «낼09시/»(분이 00 일 때만) */
function reservePrefixOf(at: Date, roll: number): string {
  const h = at.getHours();
  const m = at.getMinutes();
  const forms = [`낼${two(h)}:${two(m)}/`, `낼${h}:${two(m)})`, ...(m === 0 ? [`낼${two(h)}시/`] : [])];
  return forms[Math.floor(roll * forms.length)];
}

const strOf = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/**
 * 🎨 **인성플렉스 칸을 입힌다** — 차종 · 예약 · 마감 · 동 글자 · 꼬리표 · 적요 · 결제 · 수입.
 *
 * - 공통 칸은 한 칸도 안 바꾼다(`tests/isflexCall.test.ts` · `tests/injectedCall.test.ts`)
 * - 🔴 난수는 맨 앞에서 정해진 수만큼 한 번에 뽑는다 — 콜마다 갈래가 달라도 같은 씨앗이면 같은 콜
 * - 문제지 · 개별콜(`opts.forced`)은 무작위로 섞지 않는다 — 접두 · 꼬리표 · 적요 · 결제는 `netFields` 가 정한 것만 · 수입은 `forced.fare` 그대로
 */
export function toIsflexCall(draft: CallDraft, opts: CallOptions, rng: RandomSource = Math.random): IsflexCall {
  const r = Array.from({ length: 11 }, () => rng());
  const forced = opts.forced;
  const nf = forced?.netFields ?? {};

  if (forced) {
    const { vehicleKind, vehicleWord } = kindOfForced(forced.vehicleType);
    const payment = strOf(nf.paymentType);
    return {
      ...draft,
      net: 'isflex',
      vehicleKind,
      vehicleWord,
      reservePrefix: strOf(nf.reservePrefix) ?? '',
      deadlinePrefix: strOf(nf.deadlinePrefix) ?? '',
      pickupDong: draft.pickupDetails?.[0]?.region ?? draft.pickups[0]?.name ?? '',
      dropoffDong: draft.dropoffDetails?.[0]?.region ?? draft.dropoffs[0]?.name ?? '',
      tags: (strOf(nf.tags) ?? '').split(',').map(t => t.trim()).filter(Boolean),
      memo: strOf(nf.memo) ?? EMPTY_MEMO,
      ...(payment === '선불' || payment === '착불' ? { paymentType: payment } : {}),
      fare: forced.fare ?? Math.round(distanceFare(draft.distanceKm, opts.minFare, () => r[0]) * INCOME_RATE),
    };
  }

  /* 차종 — 오토바이 70% · 승용/소형 20% · 도보 5% · 개인이동수단 5% [비율 지어냄] */
  const vehicleKind: IsflexVehicleKind = r[1] < 0.7 ? '오토바이' : r[1] < 0.9 ? '승용/소형' : r[1] < 0.95 ? '도보' : '개인이동수단';
  /* 예약 — 상차가 내일이면 «낼» 앞글자 · 오늘이면 안 붙임(오늘 예약 꼴은 모른다) */
  const pickupAt = draft.pickupAt ? new Date(draft.pickupAt) : null;
  const reservePrefix = pickupAt && dayOffset(draft.pickupAt, new Date()) === 1 ? reservePrefixOf(pickupAt, r[2]) : '';
  /* 마감 — 20% [비율 지어냄] */
  const deliveryAt = draft.deliveryAt ? new Date(draft.deliveryAt) : null;
  const deadlinePrefix = deliveryAt && r[3] < 0.2 ? `${two(deliveryAt.getHours())}:${two(deliveryAt.getMinutes())}전/` : '';
  /* 동 글자 — 서울 밖 시 · 군이면 25% 로 시 이름을 앞에 붙인다(«수원이의동») [비율 지어냄] */
  const from = placeOf(draft.pickupDetails?.[0], draft.pickups[0]);
  const to = placeOf(draft.dropoffDetails?.[0], draft.dropoffs[0]);
  const pickupDong = (from.city && r[4] < 0.25 ? from.city : '') + from.dong;
  const dropoffDong = (to.city && r[5] < 0.25 ? to.city : '') + to.dong;
  /* 꼬리표 — 과적 10% · 급송 5% */
  const tags = [...(r[6] < 0.1 ? ['과적'] : []), ...(r[7] < 0.05 ? ['급송'] : [])];
  /* 적요 — 50% «없음» */
  const memo = r[8] < 0.5 ? EMPTY_MEMO : ISFLEX_MEMO_SAMPLES[Math.floor(((r[8] - 0.5) / 0.5) * ISFLEX_MEMO_SAMPLES.length)];
  /* 결제 — 착불 30% · 선불 20% · 없음 50% */
  const paymentType = r[9] < 0.3 ? '착불' as const : r[9] < 0.5 ? '선불' as const : undefined;
  /* 수입 — 거리 요금 × 0.85 · 원 단위 끝을 흩뜨린다(실물 «21,252» · «10,626») */
  const fare = Math.round((distanceFare(draft.distanceKm, opts.minFare, () => r[0]) + r[10] * 1000) * INCOME_RATE);

  return {
    ...draft,
    net: 'isflex',
    vehicleKind,
    vehicleWord: wordOfKind(vehicleKind),
    reservePrefix,
    deadlinePrefix,
    pickupDong,
    dropoffDong,
    tags,
    memo,
    ...(paymentType ? { paymentType } : {}),
    fare,
  };
}
