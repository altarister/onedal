import type { CallItem } from '@altari/core-simulator';

interface Props {
  call: CallItem;
  distPickup: string;
  distDelivery: string;
  onClose: () => void;
}

export const InseongMemoDetailScreen = ({ call, distPickup, distDelivery, onClose }: Props) => {
  return (
    <div className="absolute inset-0 z-[60] flex flex-col bg-[#eef1f6] font-sans text-black select-none tracking-tight">

      {/* 1. 타이틀 바 (초록 라운드) */}
      <div className="bg-[#66bb6a] text-white flex justify-center items-center py-2.5 shrink-0 shadow-md relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 w-[28px] h-[28px] rounded-full bg-[#81c784] flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
        </div>
        <span className="font-extrabold text-[17px] tracking-wide">적요 상세</span>
      </div>

      {/* 2. 정보 영역 (연초록 바탕 스크롤) */}
      <div className="flex-1 overflow-y-auto bg-[#e8f5e9] p-4 flex flex-col">
        <span className="text-[15px] font-bold text-gray-700 shrink-0 mb-2 px-1">적요 내용</span>
        <div className="bg-[#e0e0e0] border border-gray-300 rounded-sm px-4 py-4 font-bold text-[16px] text-gray-900 leading-relaxed min-h-[200px] shadow-inner whitespace-pre-wrap">
*카고 입니다.
세금계산서필 {call.pickupTime}상차. 마스크 카톤{call.itemDescription || '박스 10개'}명세서폐기. 현위치 ➔ 상차지 {distPickup}KM. 상차지 ➔ 하차지 {distDelivery}KM{call.pickupDetails?.[0]?.memo ? `\n\n${call.pickupDetails[0].memo}` : ''}
        </div>
      </div>

      {/* 3. 하단 액션 바 */}
      <div className="h-[56px] bg-white border-t-2 border-gray-300 flex shrink-0">
        <button
          onClick={onClose}
          className="flex-1 flex items-center justify-center font-extrabold text-[16px] text-gray-800 active:bg-gray-100 transition-colors"
        >
          닫기
        </button>
      </div>

    </div>
  );
};
