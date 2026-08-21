import { useState } from 'react';
import type { CallItem } from '@altari/core-simulator';
import type { LocationDetailInfo } from '@altari/core-simulator';
import { formatRegionName, formatRegionFullName } from '@altari/core-simulator';
import { InseongLocationDetailScreen } from './InseongLocationDetailScreen';
import { InseongMemoDetailScreen } from './InseongMemoDetailScreen';
import { getNextPickupDetail, getNextDropoffDetail } from '@altari/core-simulator';


interface Props {
  call: CallItem;
  feedback?: { isCorrect?: boolean; message?: string } | null;
  isConfirmed?: boolean;
  onClose: () => void;
  onAccept?: (call: CallItem) => void;
  onConfirm?: (call: CallItem) => void;
  onCancel?: (call: CallItem) => void;
}

export const InseongOngoingDetailScreen = ({ call, onClose, onConfirm, onCancel }: Props) => {
  // 출발지/도착지 및 적요 상세 팝업 상태
  const [locationPopup, setLocationPopup] = useState<{ type: 'PICKUP' | 'DROPOFF'; detail: LocationDetailInfo } | null>(null);
  const [showMemoPopup, setShowMemoPopup] = useState(false);

  const fareFormatted = call.fare.toLocaleString();
  const distPickup = call.pickupDistanceKm?.toFixed(1) || '0.0';
  const distDelivery = call.distanceKm.toFixed(1);

  return (
    <div className="relative w-full h-full flex flex-col bg-[#eef1f6] font-sans text-black select-none tracking-tight">

      {/* 1. Top Header */}
      <div className="bg-[#455a64] text-white flex justify-between items-center px-2 py-1.5 shrink-0 border-b border-gray-600 z-10">
        <div className="flex items-center">
          <span className="font-bold text-[17px] tracking-tight text-[#ffee58]">고양퀵서비스-031-932-7722</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-[42px] h-[32px] bg-[#8bc34a] rounded shadow-sm border border-[#689f38] flex justify-center items-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56M15.78 14.16l-2.03 2.03C10.63 14.6 8.4 12.38 6.8 9.24l2.03-2.03M4.61 8.62C4.24 7.51 4.04 6.32 4.04 5.09M20.01 15.38c.55 0 1 .45 1 1v3.58c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1H7.6c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57M15.78 14.16c.39.39.39 1.02 0 1.41M6.8 9.24c-.39-.39-1.02-.39-1.41 0" stroke="white" strokeWidth="2" fill="none" /></svg>
          </div>
          <button className="h-[32px] px-4 font-bold text-[14px] bg-[#e0e0e0] text-gray-800 rounded shadow-sm border border-gray-400">전표</button>
        </div>
      </div>

      {/* Info Area Base - Pale Green Background like screenshot */}
      <div className="flex-1 overflow-y-auto bg-[#e8f5e9]">

        {/* 2. Status & Item */}
        <div className="flex justify-between items-center px-4 py-3 border-b border-[#aed581]/40">
          <div className="flex gap-8 text-[15px] font-bold text-gray-800 tracking-tight">
            <span>상태 : <span className="text-gray-900 ml-1">{call.status || '배송'}</span></span>
            <span>물품 : <span className="text-gray-900 ml-1">{call.itemDescription || '--'}</span></span>
          </div>
          <button onClick={() => {
            if (onCancel) onCancel(call);
            else onClose();
          }} className="px-5 py-2 bg-white border border-gray-300 font-bold text-[14px] rounded shadow-sm text-gray-600 active:bg-gray-100">
            취소
          </button>
        </div>

        {/* 3. Vehicle & Freight Fee (2-row layout) */}
        <div className="flex flex-col px-4 py-3 border-b border-[#aed581]/40">
          <div className="flex gap-6 text-[15px] font-bold text-gray-800 tracking-tight">
            <span>차량 : <span className="text-gray-900 ml-1">{call.vehicleType || '다마스'}</span></span>
            <span className="ml-auto">탁송료 : <span className="text-gray-900 ml-1">{call.freightFee ?? 0}</span></span>
          </div>
          <div className="flex mt-1">
            <span className="ml-auto text-[14px] font-bold text-red-500">수수료 : 23%</span>
          </div>
        </div>

        {/* 4. Fare */}
        <div className="flex px-4 py-4 border-b border-[#aed581]/40">
          <div className="font-extrabold text-[22px] text-[#d32f2f] tracking-tighter">
            요금 : {fareFormatted}({call.paymentType || '신용'})
          </div>
        </div>

        {/* 5. Category & Type */}
        <div className="flex px-4 py-4 border-b border-[#aed581]/40 mb-2">
          <div className="flex gap-10 text-[15px] font-bold text-gray-800 tracking-tight">
            <span>구분 : <span className="text-gray-900 ml-1">편도</span></span>
            <span>형태 : <span className="text-gray-900 ml-1">{call.callCategory || '보통'}</span></span>
          </div>
        </div>

        {/* 6. Details & Distances Box */}
        <div className="flex px-3 gap-2 h-[100px] mb-2">
          {/* Left buttons */}
          <div className="flex flex-col gap-1.5 w-[90px] shrink-0">
            <button onClick={() => setShowMemoPopup(true)} className="flex-1 bg-white border border-gray-300 flex items-center justify-center font-bold text-[14px] text-gray-800 shadow-sm active:bg-gray-50">
              적요상세
            </button>
            <button className="flex-1 bg-white border border-gray-300 flex items-center justify-center font-bold text-[13px] text-gray-800 shadow-sm active:bg-gray-50">
              인수증 전송
            </button>
          </div>
          {/* Right Dark Box */}
          <div className="flex-1 bg-[#455a64] text-white flex flex-col justify-start px-2 py-1 shadow-inner border border-gray-500 overflow-hidden leading-[1.2]">
            <span className="text-[#ffee58] font-bold text-[13.5px] tracking-tight whitespace-pre-wrap">
              *카고 입니다.{'\n'}
              세금계산서필 {call.pickupTime}상차. 마스크 카톤{call.itemDescription || '박스 10개'}명세서폐기. 현위치 ➔ 상차지 {distPickup}KM. 상차지 ➔ 하차지 {distDelivery}KM
            </span>
          </div>
        </div>

        {/* 7. Addresses */}
        <div className="flex flex-col gap-2 p-3 pb-8">

          <div className="flex items-stretch gap-1 h-[42px]">
            <div className="w-[65px] bg-white border border-gray-300 flex items-center justify-center font-bold text-[13px] text-gray-600 shadow-sm shrink-0">
              의뢰지
            </div>
            <div className="w-[55px] bg-[#ffb74d] text-gray-800 flex items-center justify-center font-bold text-[14px] shadow-sm shrink-0">
              픽업
            </div>
            <div className="flex-1 bg-white border border-gray-300 flex items-center px-2 font-bold text-[15px] text-gray-900 shadow-sm truncate">
              {formatRegionName(call.pickups[0].name)} / ()
            </div>
          </div>

          <div className="flex items-stretch gap-1 h-[42px] cursor-pointer" onClick={() => setLocationPopup({ type: 'PICKUP', detail: call.pickupDetails?.[0] || getNextPickupDetail(call.pickups[0].fullName) })}>
            <div className="w-[65px] bg-white border border-gray-300 flex items-center justify-center font-bold text-[13px] text-gray-600 shadow-sm shrink-0">
              출발지
            </div>
            <div className="w-[55px] bg-[#fb8c00] text-gray-800 flex items-center justify-center font-bold text-[14px] shadow-sm shrink-0">
              서명
            </div>
            <div className="flex-1 bg-white border border-gray-300 flex items-center px-2 font-bold text-[15px] text-gray-900 shadow-sm truncate pb-0.5">
              {call.companyName || '태양메디스'} / {call.pickupTime} / {call.pickupDetails?.[0]?.region || formatRegionFullName(call.pickups[0].fullName)}
            </div>
          </div>

          <div className="flex items-stretch gap-1 h-[56px] cursor-pointer" onClick={() => setLocationPopup({ type: 'DROPOFF', detail: call.dropoffDetails?.[0] || getNextDropoffDetail(call.dropoffs[0].fullName) })}>
            <div className="w-[65px] bg-white border border-gray-300 flex items-center justify-center font-bold text-[13px] text-gray-600 shadow-sm shrink-0">
              도착지
            </div>
            <div className="w-[55px] bg-[#fb8c00] text-gray-800 flex items-center justify-center font-bold text-[14px] shadow-sm shrink-0">
              서명
            </div>
            <div className="flex-1 bg-white border border-gray-300 flex items-center px-2 font-bold text-[15px] text-gray-900 shadow-sm overflow-hidden whitespace-normal line-clamp-2 leading-tight py-1">
              {call.dropoffDetails?.[0]?.region || call.dropoffs[0].fullName} / {call.recipientName || ''}
            </div>
          </div>

        </div>

      </div>

      {/* 출발지/도착지 상세 팝업 오버레이 */}
      {locationPopup && (
        <InseongLocationDetailScreen
          type={locationPopup.type}
          detail={locationPopup.detail}
          onClose={() => setLocationPopup(null)}
        />
      )}

      {/* 적요상세 팝업 오버레이 */}
      {showMemoPopup && (
        <InseongMemoDetailScreen
          call={call}
          distPickup={distPickup}
          distDelivery={distDelivery}
          onClose={() => setShowMemoPopup(false)}
        />
      )}

      {/* 8. Bottom Action Bar (Ongoing Mode) */}
      <div className="h-[65px] bg-[#263238] px-2 flex gap-2 items-center justify-between border-t border-gray-800 shrink-0 shadow-[0_-2px_10px_rgba(0,0,0,0.1)]">
        <button
          onClick={onClose}
          className="h-12 px-6 flex items-center justify-center font-extrabold text-[15px] text-white bg-[#26a69a] rounded-sm shadow-sm border border-[#00897b] active:scale-95 transition-transform"
        >
          닫기
        </button>
        <button
          className="h-12 px-6 flex items-center justify-center font-bold text-[14px] text-gray-800 bg-white rounded-sm shadow-sm border border-gray-400 active:scale-95 transition-transform"
        >
          카드 승인
        </button>
        <button
          onClick={() => {
            if (onConfirm) onConfirm(call);
            else onClose();
          }}
          className="flex-1 h-12 flex items-center justify-center font-extrabold text-xl rounded-sm shadow-sm bg-[#ffb300] text-gray-800 border-2 border-orange-400 active:scale-95 transition-transform"
        >
          탁송
        </button>
      </div>

    </div>
  );
};
