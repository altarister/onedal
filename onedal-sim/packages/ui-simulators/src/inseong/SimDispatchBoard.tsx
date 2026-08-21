/**
 * 시뮬레이터 전용 배차 보드 (InseongDispatchBoard 1:1 복제)
 * 
 * 기존 InseongDispatchBoard와 100% 동일한 UI.
 * 유일한 차이: useGame()/useDispatchContext() 대신 모든 데이터를 props로 받음.
 */
import React from 'react';
import { formatRegionName } from '@altari/core-simulator';
import type { CallItem } from '@altari/core-simulator';

interface SimBoardProps {
  streamingCalls: CallItem[];
  confirmedCalls: CallItem[];
  activeTab: 'ALL' | 'CONFIRMED';
  onTabSelect: (tab: 'ALL' | 'CONFIRMED') => void;
  onCallClick: (call: CallItem) => void;
  onStartClick: () => void;
  onSettingsClick: () => void;
  onMenuClick: () => void;
  isTimerPaused: boolean;
  onToggleTimer: () => void;
  isFetchingOrder: boolean;
  selectedCallId: string | null;
  maxPickupKm: number;
}

// 요금 포맷 헬퍼 (예: 30000 -> "3.0")
const formatFare = (fare: number) => {
  return (fare / 10000).toFixed(1);
};

// 시간/조건 접두어 생성 헬퍼
const formatTimePrefix = (call: CallItem) => {
  if (call.callCategory === '예약' && call.pickupTime) {
    const [hStr, mStr] = call.pickupTime.split(':');
    if (!hStr || !mStr) return null;
    
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    
    let timeStr = '';
    let isTomorrow = false;

    if (h <= 9) {
      timeStr = `낼${h}시`;
      isTomorrow = true;
    } else if (h >= 18) {
      timeStr = `저녁${h > 12 ? h - 12 : h}시`;
    } else if (h > 12) {
      timeStr = `오후${h - 12}시`;
    } else if (h === 12) {
      timeStr = `낮12시`;
    } else {
      timeStr = `오전${h}시`;
    }

    if (m > 0 && m !== 30) timeStr += `${m}`;
    else if (m === 30) timeStr += '반';

    // 내일 예약이거나 오전 일찍이면 강조색(빨강), 그 외는 파랑
    const colorClass = isTomorrow ? 'text-[#ff3300]' : 'text-[#0052a3]';
    return <span className={`${colorClass} font-bold mr-0.5 whitespace-nowrap tracking-tighter`}>{timeStr}/</span>;
  }

  if (call.isExpress) {
    return <span className="text-[#ff3300] font-bold mr-0.5 whitespace-nowrap tracking-tighter">급송/</span>;
  }
  
  return null;
};

// 불필요한 리렌더링 방지를 위해 React.memo 적용된 행 컴포넌트
const CallRow = React.memo(({
  call,
  idx,
  isSelected,
  activeTab,
  onRowClick
}: {
  call: CallItem,
  idx: number,
  isSelected: boolean,
  activeTab: 'ALL' | 'CONFIRMED',
  onRowClick: (call: CallItem) => void
}) => {
  let bgColor = idx % 2 === 0 ? 'bg-white' : 'bg-[#fcfcfa]';
  let isExpressTheme = false;

  // 우선순위 1: 급송 (노란 바탕, 빨간 글씨)
  if (call.isExpress) {
    bgColor = 'bg-[#ffeb3b]';
    isExpressTheme = true;
  }
  // 우선순위 2: 계산서 (파란(Cyan) 바탕)
  else if (call.billingType === '계산서') {
    bgColor = 'bg-[#80deea]';
  }
  // 우선순위 3: 다중 상하차 경유콜 (보라색 바탕)
  else if (call.pickups.length > 1 || call.dropoffs.length > 1) {
    bgColor = 'bg-[#d0c6ff]';
  }

  if (isSelected) {
    bgColor = 'bg-[#c9d3f8]';
  }

  // 헬퍼: 급송이면 텍스트 컬러 강제 덮어쓰기
  const cxText = (defaultColor: string) => isExpressTheme ? 'text-[#ff3300]' : defaultColor;

  if (activeTab === 'CONFIRMED') {
    return (
      <div
        className={`flex items-center border-b border-gray-300 hover:bg-[#c9d3f8] cursor-pointer ${bgColor} active:bg-[#a9bdf8] py-2`}
        onClick={() => onRowClick(call)}
      >
        <div className="w-[15%] flex justify-center">
          <div className="border border-green-500 text-green-600 font-bold text-[11px] px-1 py-0.5 bg-white tracking-widest whitespace-nowrap">
            완료
          </div>
        </div>
        <div className={`w-[35%] font-bold text-[15px] truncate px-1 text-center tracking-tighter ${cxText('text-gray-900')}`}>
          {call.companyName || '태양메디스'}
        </div>
        <div className={`w-[15%] font-bold text-[14px] text-center tracking-tighter pr-2 ${cxText('text-black')}`}>
          {call.pickupTime || '12:19'}
        </div>
        <div className={`w-[15%] font-bold text-[14px] text-center tracking-tighter pl-2 border-l border-gray-200 ${cxText('text-black')}`}>
          {call.deliveryTime || '15:46'}
        </div>
        <div className={`w-[20%] font-bold text-[14px] truncate pl-2 pr-2 text-right ${cxText('text-gray-900')}`}>
          {call.dropoffDetails?.[0]?.region || call.dropoffs[0].name}
        </div>
      </div>
    );
  }

  return (
    <div id={`call-row-${call.id}`}
      className={`flex border-b border-gray-300 hover:bg-[#c9d3f8] cursor-pointer ${bgColor} active:bg-[#a9bdf8]`}
      onClick={() => onRowClick(call)}
    >
      {/* 거리 (상단: 공차거리, 하단: 운행거리) */}
      <div className={`w-[12%] py-1 flex flex-col justify-center px-1 border-r border-gray-200 font-bold text-[13px] leading-[1.1] ${cxText('text-black')}`}>
        <div className={`text-[12px] tracking-tighter ${cxText('text-gray-600')}`}>
          {call.pickupDistanceKm?.toFixed(1) || '0.0'}
        </div>
        <div>{call.distanceKm.toFixed(1)}</div>
      </div>

      {/* 출발지 */}
      <div className="w-[30%] px-1 py-1 flex flex-col justify-center border-r border-gray-200 truncate leading-tight">
        <div className="flex items-start whitespace-nowrap overflow-hidden text-clip">
          {call.isShared && <div className={`inline text-[14px] font-bold ${cxText('text-black')}`}>@</div>}
          <div className={`inline font-bold text-[14px] ${call.isShared ? '' : 'ml-0.5'} ${cxText('text-gray-900')}`}>
            {formatTimePrefix(call)}
            {call.pickupDetails?.[0]?.region || formatRegionName(call.pickups[0].name)}
          </div>
        </div>
      </div>

      {/* 도착지 */}
      <div className={`w-[38%] px-1 flex flex-col justify-center border-r border-gray-200 font-bold text-[14px] leading-tight ${cxText('text-black')}`}>
        <div className={`whitespace-normal line-clamp-2`}>{call.dropoffDetails?.[0]?.region || call.dropoffs[0].name}</div>
      </div>

      {/* 차종 */}
      <div className={`w-[10%] flex justify-center items-center border-r border-gray-200 text-[13px] font-bold `}>
        {call.vehicleType || '오토'}
      </div>

      {/* 요금 */}
      <div className={`w-[10%] flex justify-center items-center font-bold text-[14px] ${cxText('text-black')}`}>
        {formatFare(call.fare)}
      </div>
    </div>
  );
});

export const SimDispatchBoard = ({
  streamingCalls,
  confirmedCalls,
  activeTab,
  onTabSelect,
  onCallClick,
  onStartClick,
  onSettingsClick,
  onMenuClick,
  isTimerPaused,
  onToggleTimer,
  isFetchingOrder,
  selectedCallId,
  maxPickupKm
}: SimBoardProps) => {

  // 탭에 따라 전체 콜을 보여줄지 확정(내 장부) 콜을 보여줄지 분기
  const calls = activeTab === 'ALL' ? streamingCalls : confirmedCalls;

  const handleRowClick = React.useCallback((call: CallItem) => {
    if (onCallClick) onCallClick(call);
  }, [onCallClick]);

  return (
    <div className="relative w-full h-full flex flex-col bg-[#eef1f6] font-sans tracking-tight text-black select-none">

      {/* 상단 파란색 탭 메뉴 */}
      <div className="flex bg-[#0052a3] text-white text-[15px] font-bold border-b-2 border-slate-500 cursor-pointer">
        <div
          className={`flex-1 py-1.5 text-center transition-colors ${activeTab === 'ALL' ? 'bg-[#0066cc] border-b-4 border-[#ffb400]' : 'bg-[#0052a3]'}`}
          onClick={() => onTabSelect('ALL')}
        >
          신규
        </div>
        <div
          className={`flex-1 py-1.5 text-center transition-colors ${activeTab === 'CONFIRMED' ? 'bg-[#0066cc] border-b-4 border-[#ffb400]' : 'bg-[#0052a3]'}`}
          onClick={() => onTabSelect('CONFIRMED')}
        >
          완료({confirmedCalls.length})
        </div>
        <div className="flex-1 py-1.5 text-center bg-[#0052a3] text-gray-300">메시지함</div>
        <div className="flex-1 py-1.5 text-center bg-[#0052a3] text-gray-300">GPS</div>
      </div>

      {/* 서브 툴바 */}
      {activeTab === 'ALL' && (
        <div className="flex bg-[#e4e4e4] border-b border-gray-400 text-xs text-gray-700 h-7 items-center px-1 gap-1">
          <button className="bg-[#0052a3] text-white px-3 py-0.5 border border-gray-500 text-[10px] font-bold" onClick={onSettingsClick}>
            원터치
          </button>
          <button className="bg-[#0052a3] text-white px-3 py-0.5 border border-gray-500 text-[10px] font-bold" onClick={onSettingsClick}>
            그룹공지
          </button>
          <button className="bg-gray-200 px-3 py-0.5 border border-gray-400 text-[10px] font-bold text-gray-700">
            장터게시판
          </button>
          <button
            className={`px-3 py-0.5 border border-gray-400 text-[10px] font-bold ${isTimerPaused ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-700'}`}
            onClick={onToggleTimer}
          >
            {isTimerPaused ? '잠금해제' : '잠금'}
          </button>
          <button className="bg-[#facc15] text-black px-3 py-0.5 border border-gray-500 text-[10px] font-bold" onClick={onSettingsClick}>
            빠른설정
          </button>
        </div>
      )}

      {/* 리스트 헤더 (신규 탭 전용) */}
      {activeTab === 'ALL' && (
        <div className="flex bg-white border-b-2 border-gray-400 text-center font-bold text-[12px] text-[#ff3300] py-1 shadow-sm leading-tight tracking-tighter">
          <div className="w-[12%] border-r border-gray-300">거리</div>
          <div className="w-[30%] border-r border-gray-300">출발지</div>
          <div className="w-[38%] border-r border-gray-300">도착지</div>
          <div className="w-[10%] border-r border-gray-300">차종</div>
          <div className="w-[10%]">요금</div>
        </div>
      )}

      {/* 리스트 본문 */}
      <div className="relative flex flex-col overflow-y-auto flex-1 bg-white">
        {calls.length === 0 && (
          <div className="w-full h-full flex items-center justify-center text-gray-400 font-bold text-[15px]">
            {activeTab === 'CONFIRMED' ? '아직 확정(배차 수락)된 오더가 없습니다.' : '대기 중인 오더가 없습니다.'}
          </div>
        )}

        {isFetchingOrder && activeTab === 'ALL' && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/60 px-4 py-2 rounded-md shadow-lg z-20 pointer-events-none">
            <span className="text-white font-bold text-[14px]">오더 조회 중 입니다...</span>
          </div>
        )}

        {calls.map((call, idx) => (
          <CallRow
            key={call.id}
            call={call}
            idx={idx}
            isSelected={selectedCallId === call.id}
            activeTab={activeTab}
            onRowClick={handleRowClick}
          />
        ))}
      </div>

      {/* 하단 페이지네이션 및 액션 바 (신규 탭 전용) */}
      {activeTab === 'ALL' && (
        <div className="bg-[#e4e4e4] border-t-2 border-gray-400 p-1 flex justify-between items-center text-xs h-8">
          <div className="flex items-center">
            <button className="px-2 py-0.5 border border-gray-400 bg-white shadow-sm font-bold text-blue-600">◀</button>
            <span className="mx-3 font-bold">1 / 1</span>
            <button className="px-2 py-0.5 border border-gray-400 bg-white shadow-sm font-bold text-blue-600">▶</button>
          </div>
          <button
            className="bg-[#facc15] text-black px-2 py-0.5 border border-gray-500 text-[10px] font-bold hover:bg-yellow-500 transition-colors"
            onClick={onSettingsClick}
          >
            {maxPickupKm}km
          </button>
          <button className="bg-[#facc15] text-black px-2 py-0.5 border border-gray-500 text-[10px] font-bold">전체</button>
          <button className="bg-[#facc15] text-black px-2 py-0.5 border border-gray-500 text-[10px] font-bold">리셋</button>
        </div>
      )}

      {/* 하단 네비게이션 바 */}
      <div className="flex bg-[#0052a3] text-white text-[15px] font-bold border-b-2 border-slate-500 cursor-pointer">
        <div
          className="flex-1 py-1.5 text-center bg-[#0052a3] text-gray-300 hover:bg-blue-800 transition-colors"
          onClick={onStartClick}
        >시작</div>
        <div
          className="flex-1 py-1.5 text-center text-white font-extrabold hover:bg-blue-800 transition-colors"
          onClick={onSettingsClick}
        >설정</div>
        <div
          className="flex-1 py-1.5 text-center bg-[#0052a3] text-gray-300 hover:bg-blue-800 transition-colors"
          onClick={onMenuClick}
        >메뉴</div>
        <div className="flex-1 py-1.5 text-center bg-[#0052a3] text-gray-300 cursor-not-allowed">
          정산
        </div>
      </div>
    </div>
  );
};
