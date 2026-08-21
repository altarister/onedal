import React from 'react';
import { formatHwamul24Region } from '@altari/core-simulator';
import type { CallItem } from '@altari/core-simulator';

interface BoardProps {
  streamingCalls: CallItem[];
  confirmedCalls: CallItem[];
  activeTab: 'ALL' | 'CONFIRMED';
  onTabSelect: (tab: 'ALL' | 'CONFIRMED') => void;
  onCallClick: (call: CallItem) => void;
  onSettingsClick: () => void;
  isTimerPaused: boolean;
  onToggleTimer: () => void;
  isFetchingOrder?: boolean;
}

// 요금 포맷 헬퍼 (60000 -> "60,000")
const formatFareWon = (fare: number) => {
  return fare.toLocaleString();
};

// ── 카드형 리스트 아이템 (스크린샷 32, 36 기반) ──
const Hwamul24CallCard = React.memo(({
  call,
  onCardClick
}: {
  call: CallItem;
  onCardClick: (call: CallItem) => void;
}) => {
  const pickupRegion = formatHwamul24Region(call.pickups[0].fullName);
  const dropoffRegion = formatHwamul24Region(call.dropoffs[0].fullName);
  const tonnage = call.tonnage || '1톤';
  const vehicleSpec = call.vehicleSpec || '전체';
  const loadingType = call.loadingType || '독차';
  const receiptType = call.receiptType || call.billingType || '인수증';
  const loadingMethod = call.loadingMethod || '당상';
  const unloadingMethod = call.unloadingMethod || '당착';
  const pickupDist = call.pickupDistanceKm?.toFixed(0) || '0';
  const deliveryTime = call.deliveryTime || call.pickupTime || '--:--';
  const itemDesc = call.itemSummary || call.itemDescription || '';

  // 색상 뱃지: 당상=초록, 지상=파란
  const loadBadgeColor = loadingMethod === '당상' ? 'bg-[#4caf50]' : 'bg-[#2196f3]';
  const unloadBadgeColor = unloadingMethod === '당착' ? 'bg-[#2196f3]' : 'bg-[#ff9800]';

  // 수/지 뱃지 텍스트
  const loadBadgeText = loadingMethod === '당상' ? '수' : '지';
  const unloadBadgeText = unloadingMethod === '당착' ? '수' : '지';

  return (
    <div
      className="border-b-[3px] border-gray-200 bg-white active:bg-gray-100 cursor-pointer px-3 py-3"
      onClick={() => onCardClick(call)}
    >
      {/* 1행: 출발지 → 도착지 */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-[16px] font-extrabold text-gray-900 truncate max-w-[45%]">
          {pickupRegion}
        </span>
        <span className="text-gray-400 text-[18px] mx-1 font-light">›</span>
        <span className="text-[16px] font-extrabold text-[#ff6600] truncate max-w-[45%] text-right">
          {dropoffRegion}
        </span>
      </div>

      {/* 2행: 뱃지들 + 거리 + 시간 */}
      <div className="flex items-center gap-1 mb-1 text-[12px]">
        <span className={`${loadBadgeColor} text-white font-bold px-1.5 py-0.5 rounded-sm text-[10px]`}>
          {loadingMethod === '당상' ? '당상' : '지상'}
        </span>
        <span className={`${loadBadgeColor} text-white font-bold px-1 py-0.5 rounded-sm text-[10px]`}>
          {loadBadgeText}
        </span>
        <span className="text-[#2196f3] font-bold">{pickupDist}Km</span>

        <span className="flex-1" />

        <span className="text-gray-800 font-bold">{deliveryTime}</span>
        <span className={`${unloadBadgeColor} text-white font-bold px-1 py-0.5 rounded-sm text-[10px]`}>
          {unloadBadgeText}
        </span>
        <span className={`${unloadBadgeColor} text-white font-bold px-1.5 py-0.5 rounded-sm text-[10px]`}>
          {unloadingMethod === '당착' ? '당착' : '지착'}
        </span>
      </div>

      {/* 3행: 톤수 / 차종 / 화물 정보 */}
      <div className="text-[13px] text-[#e65100] font-bold mb-1 truncate">
        <span>{tonnage}/{vehicleSpec}</span>
        {itemDesc && <span className="text-gray-700 font-normal ml-1">{itemDesc}</span>}
      </div>

      {/* 4행: 독차/혼적 + 인수증/계산서 + 금액 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="border border-gray-500 text-gray-700 font-bold text-[11px] px-1.5 py-0.5 bg-gray-100">
            {loadingType}
          </span>
          <span className="text-gray-700 font-bold text-[13px]">{receiptType}</span>
        </div>
        <span className="text-[#e65100] font-extrabold text-[18px]">
          {formatFareWon(call.fare)}<span className="text-[14px]">원</span>
        </span>
      </div>
    </div>
  );
});

export const Hwamul24DispatchBoard = ({
  streamingCalls,
  confirmedCalls,
  activeTab,
  onTabSelect,
  onCallClick,
  onSettingsClick,
  isTimerPaused,
  onToggleTimer,
  isFetchingOrder
}: BoardProps) => {

  const calls = activeTab === 'ALL' ? streamingCalls : confirmedCalls;

  const handleCardClick = React.useCallback((call: CallItem) => {
    if (onCallClick) onCallClick(call);
  }, [onCallClick]);

  return (
    <div className="relative w-full h-full flex flex-col bg-[#2a2a2a] font-sans text-black select-none overflow-x-hidden">

      {/* ── 상단 헤더 바: 화물정보 타이틀 ── */}
      <div className="flex items-center justify-between bg-gradient-to-r from-[#d32f2f] to-[#c62828] px-3 py-2.5 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-white text-[12px] bg-black/30 rounded-full w-6 h-6 flex items-center justify-center font-bold">‹</span>
          <span className="text-white text-[17px] font-extrabold tracking-wide">{activeTab === 'CONFIRMED' ? '배차내역' : '화물정보'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white text-[12px] font-medium">자동새로침</span>
          <div className={`w-10 h-5 rounded-full flex items-center px-0.5 cursor-pointer transition-colors ${!isTimerPaused ? 'bg-[#4caf50]' : 'bg-gray-500'}`} onClick={onToggleTimer}>
            <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${!isTimerPaused ? 'translate-x-5' : 'translate-x-0'}`} />
          </div>
        </div>
      </div>

      {/* ── 서브 헤더: ID / 오더검색 / 잔액 ── */}
      <div className="flex items-center justify-between bg-[#3a3a3a] px-3 py-1.5 shrink-0 text-[12px]">
        <span className="text-[#ffab00] font-bold">ID : {Math.floor(Math.random() * 90000 + 10000)}</span>
        <button className="bg-[#ff9800] text-white font-bold text-[11px] px-3 py-1 rounded-sm" onClick={onSettingsClick}>
          오더검색
          <span className="block text-[10px] text-center">🔍</span>
        </button>
        <span className="text-white font-bold">잔액 : <span className="text-[#ffab00]">{(Math.floor(Math.random() * 500000) + 50000).toLocaleString()}</span>원</span>
      </div>

      {/* ── 자동터치 / 성공 건 표시줄 ── */}
      <div className="flex items-center justify-between bg-white border-b border-gray-300 px-3 py-1.5 shrink-0 text-[12px]">
        <div className="flex items-center gap-2">
          <span className="text-gray-700 font-bold">자동터치</span>
          <span className="bg-gray-400 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">OFF</span>
          <span className="text-gray-400 text-[14px] font-bold">❓</span>
        </div>
        <span className="text-gray-700 font-bold">성공<span className="text-[#ff6600]">{confirmedCalls.length}</span>건/최대<span className="text-[#ff6600]">15</span>건</span>
      </div>

      {/* ── 리스트 본문 ── */}
      <div className="relative flex flex-col overflow-y-auto flex-1 bg-white">
        {calls.length === 0 && (
          <div className="w-full h-full flex items-center justify-center text-gray-400 font-bold text-[15px]">
            {activeTab === 'CONFIRMED' ? '배차 완료된 오더가 없습니다.' : '오더가 없습니다.'}
          </div>
        )}

        {isFetchingOrder && activeTab === 'ALL' && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/60 px-4 py-2 rounded-md shadow-lg z-20 pointer-events-none">
            <span className="text-white font-bold text-[14px]">오더 조회 중 입니다...</span>
          </div>
        )}

        {calls.map((call) => (
          <Hwamul24CallCard
            key={call.id}
            call={call}
            onCardClick={handleCardClick}
          />
        ))}
      </div>

      {/* ── 하단 네비게이션 바 ── */}
      <div className="flex bg-[#2a2a2a] border-t border-gray-600 shrink-0">
        <button
          className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 transition-colors ${activeTab === 'ALL' ? 'text-white' : 'text-gray-500'}`}
          onClick={() => onTabSelect('ALL')}
        >
          <span className="text-[16px]">🏠</span>
          <span className="text-[10px] font-bold">홈</span>
        </button>
        <button
          className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 transition-colors ${activeTab === 'ALL' ? 'text-[#ff9800]' : 'text-gray-500'}`}
          onClick={() => onTabSelect('ALL')}
        >
          <span className="text-[16px]">🔍</span>
          <span className="text-[10px] font-bold">화물정보</span>
        </button>
        <button
          className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 transition-colors ${activeTab === 'CONFIRMED' ? 'text-[#ff9800]' : 'text-gray-500'}`}
          onClick={() => onTabSelect('CONFIRMED')}
        >
          <span className="text-[16px]">🚚</span>
          <span className="text-[10px] font-bold">배차내역</span>
        </button>
        <button className="flex-1 py-2.5 flex flex-col items-center gap-0.5 text-gray-500">
          <span className="text-[16px]">⚙️</span>
          <span className="text-[10px] font-bold">환경설정</span>
        </button>
      </div>
    </div>
  );
};
