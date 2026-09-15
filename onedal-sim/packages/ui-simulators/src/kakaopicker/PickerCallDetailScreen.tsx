/**
 * 📄 **픽커 상세 (수락 전)** — 실물 캡처 05 · 06 · 07 · 10-1~10-3 · 33 · 실물 덤프 `11_상세_초소형8200_접힘.xml` · `12_…펼침.xml`
 * (카카오픽커_시뮬레이터.md §8-1 · 3단계 3-1)
 *
 * 원달앱은 **«넘기기» + «수락하기» 둘이 다 보이면** 수락 전 상세로 알아보고(`KakaoPickerKeywords.PICKER.detailKeywords`),
 * 상세 글자 원문을 미리보기 콜로 서버에 올린다(`sendPickerPreview`). 30초 동안 손대지 않으면 «뒤로 가기»로 리스트에 돌아간다.
 *
 * 🧱 **층이 셋이다** (실물 10-1~10-3):
 *   맨 아래 지도(화면 전체) → 그 위 시트(끌어서 하 · 중 · 상) → 맨 위 «넘기기 · 수락하기»(화면 바닥에 붙어 늘 보인다)
 * - 처음엔 **중** — 실물 05 · 33 이 상세를 열자마자 지도가 위 약 1/3 이다
 * - 하 · 중 에서는 지도 위에 둥근 뒤로가기, 상 에서는 흰 머리줄 뒤로가기 (실물 10-1 · 06) — 🔴 한 화면에 뒤로가기는 하나
 * - 실물은 끌기만 받는다 · 시뮬레이터는 **손잡이 누르기 · 끌기 · 내용 스크롤** 셋 다 받는다
 *
 * - 「넘기기」 · 「←」 — 리스트로
 * - 「수락하기」 — 누르는 순간 계약이다(픽커는 되돌릴 창이 없다). 잡은 콜로 옮기고 수락 뒤 단계로 간다 (`PickerOngoingScreen` · 4단계).
 *   🔴 원달앱은 이 버튼을 **절대 안 누른다**(`clickSafe`) — 사람이 누른다
 * - 🔴 글자 덩어리마다 `div` 하나 (2단계 2-2 에서 웹뷰가 `span` 줄을 뭉친 것을 봤다)
 * - 🔴 지도에 글자를 두지 않는다 — 실물 지도의 지명 · «픽업»/«배송» 핀 글자는 원달앱·서버 글자인식이 주소로 잘못 집는다
 * - 🔴 모르는 칸은 안 그린다 — 유의사항(모의 데이터에 메모가 없다) · 프로모션 0 · 규격을 모르는 물품 크기
 * - 🔴 수락 뒤 단계 글자(«픽업 준비» · «배송 시간» · «밀어서 …»)를 쓰지 않는다 — 원달앱이 수락 뒤 화면으로 읽는다
 * ⚠️ 시트를 «하»로 내려도 가려진 글자가 웹뷰 접근성에는 남는다 — 실물 픽커가 가려진 글자를 내주는지는 모른다.
 * ⚠️ 실물 픽커는 상세의 배송지를 접근성에 안 넘긴다(덤프 11 · 서버 글자인식이 대신 읽는다). 그 흉내는 계획서 §10 «나중»이다 — 지금은 보인다.
 */
import { useState } from 'react';
import type { PickerCall } from './pickerCall';
import { formatPickerAddressLine, pickerTagChipClass } from './pickerCall';
import { formatPickerDistance, formatPickerFare } from './PickerDispatchBoard';
import { PickerMapBackdrop, usePickerSheetDrag } from './PickerMapSheet';

interface Props {
  call: PickerCall;
  onClose: () => void;
  /** 「수락하기」 — 잡은 콜로 옮긴다 (배차 화면이 정한다) */
  onAccept?: () => void;
}

/** 시트 높이 — 실물 10-3 · 10-2 · 10-1 */
type SheetLevel = 'LOW' | 'MID' | 'HIGH';
const LEVELS: SheetLevel[] = ['LOW', 'MID', 'HIGH'];
/** 시트 윗변 자리 — 하 는 손잡이 · 태그 · 남은 시간 상자만 버튼 위에 보인다 */
const SHEET_TOP: Record<SheetLevel, string> = { LOW: 'calc(100% - 216px)', MID: '36%', HIGH: '0px' };
/** «중» 이하에서 내용을 이만큼 끌어 올리면(스크롤) «상» (CSS px) */
const SHEET_PULL_PX = 24;
/** 바닥 버튼 높이 — 시트 내용이 그 밑에 숨지 않게 아래를 비운다 */
const BUTTONS_PX = 64;

/** 물품 크기 규격 — 실물에서 본 것만 (05 · 06 소형 · 덤프 11 · 33 초소형). 나머지는 모른다 */
const ITEM_SPEC: Partial<Record<PickerCall['itemSize'], string>> = {
  '초소형': '세 변의 합 70cm ∙ 2kg 이하',
  '소형': '세 변의 합 100cm ∙ 5kg 이하',
};

/** «HH:MM» 이 오늘 몇 시인가 — 지난 시각이면 다음 날로 본다 (자정을 넘긴 마감 · 내일 예약) */
function targetOf(hhmm?: string): { at: Date; nextDay: boolean } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '');
  if (!m) return null;
  const now = new Date();
  const at = new Date(now);
  at.setHours(Number(m[1]), Number(m[2]), 0, 0);
  const nextDay = at.getTime() < now.getTime() - 60_000;
  if (nextDay) at.setDate(at.getDate() + 1);
  return { at, nextDay };
}

function minutesUntil(hhmm?: string): number | null {
  const t = targetOf(hhmm);
  return t ? Math.max(0, Math.round((t.at.getTime() - Date.now()) / 60_000)) : null;
}

const pointP = (n: number) => `${n.toLocaleString('ko-KR')}P`;

const BackArrow = () => <div className="w-3 h-3 border-l-2 border-b-2 border-[#333] rotate-45" />;

/** 🔵 시계 표시 — 남은 시간 · 예약 상자 머리 */
const ClockIcon = ({ color }: { color: string }) => (
  <div className="relative w-[18px] h-[18px] rounded-full shrink-0" style={{ background: color }}>
    <div className="absolute left-1/2 top-[4px] w-[2px] h-[6px] -translate-x-1/2 bg-white" />
    <div className="absolute left-1/2 top-[9px] w-[5px] h-[2px] bg-white" />
  </div>
);

export const PickerCallDetailScreen = ({ call, onClose, onAccept }: Props) => {
  const [level, setLevel] = useState<SheetLevel>('MID');
  const step = (by: 1 | -1) => setLevel(l => LEVELS[Math.min(LEVELS.length - 1, Math.max(0, LEVELS.indexOf(l) + by))]);
  const { dragHandlers, onTap } = usePickerSheetDrag(step);

  const pickup = call.pickupDetails?.[0];
  const dropoff = call.dropoffDetails?.[0];
  const pickupLine = formatPickerAddressLine(pickup?.addressDetail, pickup?.region) || call.pickups[0]?.fullName.replace(/ \/ /g, ' ') || '';
  const dropoffLine = formatPickerAddressLine(dropoff?.addressDetail, dropoff?.region) || call.dropoffs[0]?.fullName.replace(/ \/ /g, ' ') || '';
  const leftMinutes = minutesUntil(call.deliveryTime);
  const reserved = targetOf(call.reservedAt);
  const spec = ITEM_SPEC[call.itemSize];
  const memo = dropoff?.memo;
  const high = level === 'HIGH';

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#e9efe7] text-[#1f1f1f] select-none">
      {/* 맨 아래 — 지도 자리 (실물 05 · 10-2 · 33) */}
      <PickerMapBackdrop>
        {!high && (
          <button aria-label="뒤로가기" onClick={onClose} className="absolute left-3 top-3 w-11 h-11 rounded-full bg-white shadow flex items-center justify-center">
            <BackArrow />
          </button>
        )}
      </PickerMapBackdrop>

      {/* 가운데 — 시트. 윗변 자리만 바뀐다 */}
      <div
        data-sheet={level}
        className={`absolute inset-x-0 bottom-0 flex flex-col bg-white transition-[top] duration-200 ${high ? '' : 'rounded-t-2xl shadow-[0_-2px_8px_rgba(0,0,0,0.08)]'}`}
        style={{ top: SHEET_TOP[level] }}
      >
        {high ? (
          /* 머리 — 뒤로가기 (실물 10-1 · 06 · 덤프 12: content-desc «뒤로가기»). 아래로 끌면 «중» */
          <div {...dragHandlers} className="h-[48px] flex items-center px-3 border-b border-[#eeeeee] shrink-0 touch-none">
            <button aria-label="뒤로가기" onClick={onClose} className="w-8 h-8 flex items-center justify-center">
              <BackArrow />
            </button>
          </div>
        ) : (
          <button
            {...dragHandlers}
            aria-label="아래 창 올리기"
            onClick={onTap(() => step(1))}
            className="h-[28px] w-full flex items-center justify-center shrink-0 touch-none"
          >
            <div className="w-[44px] h-[4px] rounded-full bg-[#c8c8c8]" />
          </button>
        )}

        <div
          data-sheet-scroll
          className="flex-1 min-h-0 overflow-y-auto"
          style={{ paddingBottom: BUTTONS_PX + 12 }}
          onScroll={e => { if (!high && e.currentTarget.scrollTop > SHEET_PULL_PX) setLevel('HIGH'); }}
        >
          {/* 태그 — 예약이면 «예약» 태그만 (시각은 아래 상자에) */}
          <div className="px-[14px] pt-[8px] flex items-center gap-[4px] text-[13px]">
            {call.pickerTags.map(t => (
              <div key={t} className={`font-bold px-[4px] rounded-sm ${pickerTagChipClass(t)}`}>{t}</div>
            ))}
            {reserved && <div className="border border-gray-300 px-[3px] font-bold text-gray-700">예약</div>}
          </div>

          {/* 예약콜은 «오늘/내일 HH:MM 픽업예약» (실물 10-1 · 33) · 아니면 «배송 N분 남음 · 준비 N분 포함» (실물 06) */}
          {reserved ? (
            <div className="mx-[14px] mt-[10px] rounded-lg bg-[#eef2fb] py-[10px] flex items-center justify-center gap-[6px] text-[15px]">
              <ClockIcon color="#3d6de0" />
              <div className="font-bold">
                <span className="text-[#3d6de0]">{`${reserved.nextDay ? '내일' : '오늘'} ${call.reservedAt}`}</span>{' 픽업예약'}
              </div>
            </div>
          ) : leftMinutes !== null && (
            <div className="mx-[14px] mt-[10px] rounded-lg bg-[#eef2fb] py-[10px] flex items-center justify-center gap-[6px] text-[15px]">
              <ClockIcon color="#a0a4ab" />
              <div className="font-bold">{`배송 ${leftMinutes}분 남음`}</div>
              {call.prepMinutes !== null && <div className="text-gray-600 text-[13px]">{`준비 ${call.prepMinutes}분 포함`}</div>}
            </div>
          )}

          {/* 픽업 · 배송 */}
          <div className="px-[14px] pt-[16px] flex flex-col gap-[14px] border-t border-[#eeeeee] mt-[12px]">
            <div className="flex justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[17px] font-bold">{pickupLine}</div>
                {pickup?.customerName && <div className="text-[14px] text-gray-500">{pickup.customerName}</div>}
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[15px] font-bold text-[#3d6de0]">{`픽업 ${formatPickerDistance(call.pickupDistanceKm)}`}</div>
                {call.pickupTime && <div className="text-[12px] text-gray-500">{`${call.pickupTime}까지 픽업`}</div>}
              </div>
            </div>
            <div className="flex justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[17px] font-bold">{dropoffLine}</div>
                {dropoff?.customerName && <div className="text-[14px] text-gray-500">{dropoff.customerName}</div>}
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[15px] font-bold text-[#7b3fd6]">{`배송 ${call.distanceKm.toFixed(1)}km`}</div>
                {call.deliveryTime && <div className="text-[12px] text-gray-500">{`${call.deliveryTime}까지 배송`}</div>}
              </div>
            </div>
          </div>

          {/* 픽업 장소 · 물품 정보 · 유의사항 */}
          <div className="mx-[14px] mt-[16px] rounded-lg bg-[#f5f6f8] px-[12px] py-[10px] flex flex-col gap-[10px] text-[14px]">
            <div className="flex gap-3">
              <div className="w-[72px] shrink-0 text-gray-500">픽업 장소</div>
              <div className="flex flex-col">
                <div className="font-bold">매장 직원에게 문의</div>
                <div className="font-bold">{`오더번호 ${call.orderNo}`}</div>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-[72px] shrink-0 text-gray-500">물품 정보</div>
              <div className="flex flex-col">
                <div className="font-bold">{call.itemSize}</div>
                {spec && <div className="text-gray-600">{spec}</div>}
              </div>
            </div>
            {memo && (
              <div className="flex gap-3">
                <div className="w-[72px] shrink-0 text-gray-500">유의사항</div>
                <div>{memo}</div>
              </div>
            )}
          </div>

          {/* 최종 수익 = 배송비 + 프로모션 (실물 07) */}
          <div className="mx-[14px] mt-[12px] rounded-lg bg-[#f5f6f8] px-[12px] py-[12px] flex flex-col gap-[6px]">
            <div className="flex items-center justify-between">
              <div className="text-[17px] font-bold">최종 수익</div>
              <div className="flex items-center gap-[6px]">
                <div className="text-[22px] font-bold tabular-nums">{formatPickerFare(call.fare)}</div>
                <div className="w-[22px] h-[22px] rounded-full bg-[#ffc400] text-[12px] font-bold text-[#8a5a00] flex items-center justify-center">P</div>
              </div>
            </div>
            <div className="flex justify-between text-[13px] text-gray-500">
              <div>배송비</div>
              <div>{pointP(call.deliveryFee)}</div>
            </div>
            {call.promotion > 0 && (
              <div className="flex justify-between text-[13px] text-gray-500">
                <div>프로모션</div>
                <div>{pointP(call.promotion)}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 맨 위 — 넘기기 / 수락하기. 시트 밖이라 시트가 어느 높이든 바닥에 붙어 보인다 */}
      <div className="absolute left-0 right-0 bottom-0 flex text-[20px] font-bold text-white" style={{ height: BUTTONS_PX }}>
        <button onClick={onClose} className="w-[40%] bg-[#76777b]">넘기기</button>
        {/* 수락 = 계약 — 잡은 콜로 옮기고 «내 오더» · 수락 뒤 단계로 (4단계) */}
        <button onClick={onAccept} className="flex-1 bg-[#2aa69a]">수락하기</button>
      </div>
    </div>
  );
};
