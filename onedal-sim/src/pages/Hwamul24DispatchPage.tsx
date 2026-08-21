/**
 * 화물24시 시뮬레이터 배차 리스트 페이지 (/hwamul24/dispatch)
 * 
 * URL 파라미터에서 설정을 읽어 SimulationContext를 구성하고
 * 시뮬레이터 전용 UI 컴포넌트를 사용합니다.
 * GameContext 의존성 없음.
 */
import { useState, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { SimulationProvider, useSimulationContext } from '@altari/ui-simulators';
import { useSimStreaming } from '@altari/ui-simulators';
import { Hwamul24DispatchBoard } from '@altari/ui-simulators';
import { Hwamul24CallDetailScreen } from '@altari/ui-simulators';
import type { CallItem } from '@altari/core-simulator';

function Hwamul24DispatchContent() {
  const navigate = useNavigate();
  const {
    streamingCalls, confirmedCalls, setConfirmedCalls,
    setStreamingCalls, setSelectedCallId,
    activeTab, setActiveTab, appendCall,
    isFetchingOrder, setIsFetchingOrder,
    isTimerPaused, setIsTimerPaused,
    driverLocation, simConfig
  } = useSimulationContext();

  const [selectedCall, setSelectedCall] = useState<CallItem | null>(null);

  // 스트리밍 엔진 가동
  const generatorConfig = useMemo(() => ({
    driverLon: driverLocation.lon,
    driverLat: driverLocation.lat,
    maxPickupKm: simConfig.maxPickupKm,
    minFare: simConfig.minFare,
    targetRegion: simConfig.targetRegion
  }), [driverLocation, simConfig]);

  useSimStreaming({
    config: generatorConfig,
    appendCall,
    setIsFetchingOrder,
    isTimerPaused,
    intervalMs: simConfig.intervalMs,
    initialCount: 5
  });

  // 콜 클릭
  const handleCallClick = useCallback((call: CallItem) => {
    setSelectedCall(call);
    setSelectedCallId(call.id);
  }, [setSelectedCallId]);

  // 상세 닫기
  const handleCloseDetail = useCallback(() => {
    setSelectedCall(null);
    setSelectedCallId(null);
  }, [setSelectedCallId]);

  // 콜 수락 (배차신청)
  const handleAcceptCall = useCallback((call: CallItem) => {
    setStreamingCalls(prev => prev.filter(c => c.id !== call.id));
    setConfirmedCalls(prev => {
      if (prev.find(c => c.id === call.id)) return prev;
      return [...prev, call];
    });
    handleCloseDetail();
    setActiveTab('CONFIRMED');
  }, [setStreamingCalls, setConfirmedCalls, setActiveTab, handleCloseDetail]);

  // 상세 보기 분기
  const displayCall = selectedCall;
  if (displayCall) {
    // 화물24시도 확정된 오더 상세를 볼 수 있게 하려면 여기에 분기 추가 가능
    // 현재는 바로 배차신청 모달만 띄우도록 유지
    return (
      <Hwamul24CallDetailScreen
        call={displayCall}
        onClose={handleCloseDetail}
        onAccept={handleAcceptCall}
      />
    );
  }

  // 메인 리스트
  return (
    <div className="relative w-full h-full">
      <Hwamul24DispatchBoard
        streamingCalls={streamingCalls}
        confirmedCalls={confirmedCalls}
        activeTab={activeTab}
        onTabSelect={setActiveTab}
        onCallClick={handleCallClick}
        onSettingsClick={() => navigate('/hwamul24')}
        isTimerPaused={isTimerPaused}
        onToggleTimer={() => setIsTimerPaused(!isTimerPaused)}
        isFetchingOrder={isFetchingOrder}
      />
    </div>
  );
}

export function Hwamul24DispatchPage() {
  const [searchParams] = useSearchParams();

  const driverLocation = {
    lon: Number(searchParams.get('lon') || '127.2553'),
    lat: Number(searchParams.get('lat') || '37.4095'),
    name: searchParams.get('name') || '경기 광주시'
  };

  const simConfig = {
    maxPickupKm: Number(searchParams.get('maxKm') || '15'),
    minFare: Number(searchParams.get('minFare') || '30000'),
    targetRegion: searchParams.get('target') || '',
    intervalMs: Number(searchParams.get('interval') || '5000')
  };

  return (
    <SimulationProvider initialDriver={driverLocation} initialConfig={simConfig}>
      {/* 화물24시는 흰색 계열 배경이 어울림 */}
      <div className="w-full h-dvh bg-gray-100 overflow-hidden relative font-sans text-black">
        <Hwamul24DispatchContent />
      </div>
    </SimulationProvider>
  );
}
