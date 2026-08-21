import type { LocationDetailInfo } from '@altari/core-simulator';

interface Props {
  type: 'PICKUP' | 'DROPOFF';
  detail: LocationDetailInfo;
  onClose: () => void;
}

export const InseongLocationDetailScreen = ({ type, detail, onClose }: Props) => {
  const isPickup = type === 'PICKUP';
  const title = isPickup ? '출발지 상세' : '도착지 상세';
  const label = isPickup ? '출발' : '도착';

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-[#eef1f6] font-sans text-black select-none tracking-tight">

      {/* 1. 타이틀 바 (초록 라운드) */}
      <div className="bg-[#66bb6a] text-white flex justify-center items-center py-2.5 shrink-0 shadow-md relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 w-[28px] h-[28px] rounded-full bg-[#81c784] flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
        </div>
        <span className="font-extrabold text-[17px] tracking-wide">{title}</span>
      </div>

      {/* 2. 정보 영역 (연초록 바탕 스크롤) */}
      <div className="flex-1 overflow-y-auto bg-[#e8f5e9]">

        {/* 고객 */}
        <div className="flex items-center px-4 py-5 border-b border-[#c8e6c9]">
          <span className="w-[55px] text-[14px] font-bold text-gray-600 shrink-0">고객</span>
          <div className="flex-1 bg-[#616161] text-white font-bold text-[16px] px-3 py-3 rounded-sm shadow-sm">
            {detail.customerName || '*'}
          </div>
        </div>

        {/* 부서 */}
        <div className="flex items-center px-4 py-5 border-b border-[#c8e6c9]">
          <span className="w-[55px] text-[14px] font-bold text-gray-600 shrink-0">부서</span>
          <span className="font-bold text-[16px] text-gray-900">{detail.department || '*'}</span>
        </div>

        {/* 담당 + 마일리지 */}
        <div className="flex items-center px-4 py-5 border-b border-[#c8e6c9]">
          <span className="w-[55px] text-[14px] font-bold text-gray-600 shrink-0">담당</span>
          <span className="font-bold text-[16px] text-gray-900">{detail.contactName || '*'}</span>
          <span className="ml-auto text-[14px] font-bold text-gray-500">마일리지</span>
          <span className="ml-3 font-bold text-[16px] text-gray-900">{detail.mileage ?? 0}</span>
        </div>

        {/* 전화1 */}
        <div className="flex items-center px-4 py-3 border-b border-[#c8e6c9]">
          <span className="w-[55px] text-[14px] font-bold text-gray-600 shrink-0">전화1</span>
          <div className="flex-1 bg-[#616161] text-white font-bold text-[17px] px-3 py-3 rounded-sm shadow-sm">
            {detail.phone1 || '*'}
          </div>
          <button className="ml-2 w-[48px] h-[48px] bg-[#8bc34a] rounded-md shadow-sm border border-[#689f38] flex items-center justify-center shrink-0 active:scale-95 transition-transform">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="white"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
          </button>
        </div>

        {/* 전화2 */}
        <div className="flex items-center px-4 py-3 border-b border-[#c8e6c9]">
          <span className="w-[55px] text-[14px] font-bold text-gray-600 shrink-0">전화2</span>
          <div className="flex-1 bg-[#616161] text-white font-bold text-[17px] px-3 py-3 rounded-sm shadow-sm">
            {detail.phone2 || '*'}
          </div>
          <button className="ml-2 w-[48px] h-[48px] bg-[#8bc34a] rounded-md shadow-sm border border-[#689f38] flex items-center justify-center shrink-0 active:scale-95 transition-transform">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="white"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
          </button>
        </div>

        {/* 출발/도착 지역명 */}
        <div className="flex items-center px-4 py-5 border-b border-[#c8e6c9]">
          <span className="w-[55px] text-[15px] font-extrabold text-red-500 shrink-0">{label}</span>
          <span className="font-extrabold text-[18px] text-gray-900">{detail.region || '-'}</span>
        </div>

        {/* 위치 상세 주소 */}
        <div className="flex px-4 py-5">
          <span className="w-[55px] text-[14px] font-bold text-gray-600 shrink-0 pt-1">위치</span>
          <div className="flex-1 bg-[#e0e0e0] border border-gray-300 rounded-sm px-3 py-3 font-bold text-[15px] text-gray-900 leading-relaxed min-h-[100px] shadow-inner">
            {detail.addressDetail || '-'}
          </div>
        </div>

      </div>

      {/* 3. 하단 4버튼 바 */}
      <div className="h-[56px] bg-white border-t-2 border-gray-300 flex shrink-0">
        <button
          onClick={onClose}
          className="flex-1 flex items-center justify-center font-extrabold text-[16px] text-gray-800 border-r border-gray-300 active:bg-gray-100 transition-colors"
        >
          닫기
        </button>
        <button className="flex-1 flex items-center justify-center font-extrabold text-[16px] text-gray-800 border-r border-gray-300 active:bg-gray-100 transition-colors">
          위치보기
        </button>
        <button className="flex-1 flex items-center justify-center font-extrabold text-[16px] text-gray-800 bg-[#e0e0e0] border-r border-gray-300 active:bg-gray-200 transition-colors">
          위치저장
        </button>
        <button className="flex-1 flex items-center justify-center font-extrabold text-[16px] text-gray-800 active:bg-gray-100 transition-colors">
          길안내
        </button>
      </div>

    </div>
  );
};
