/**
 * 인성 시뮬레이터 배차 리스트 페이지 (/inseong/dispatch)
 * 
 * URL 파라미터에서 설정을 읽어 SimulationContext를 구성하고
 * 시뮬레이터 전용 UI 컴포넌트를 사용합니다.
 * GameContext 의존성 없음.
 */
import { useState, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { SimulationProvider, useSimulationContext } from '@altari/ui-simulators';
import { useSimStreaming } from '@altari/ui-simulators';
import { InseongDispatchBoard } from '@altari/ui-simulators';
import { InseongCallDetailScreen } from '@altari/ui-simulators';
import { InseongOngoingDetailScreen } from '@altari/ui-simulators';
import { InseongDropdownMenu } from '@altari/ui-simulators';
import type { CallItem } from '@altari/core-simulator';

function SimDispatchContent() {
  const navigate = useNavigate();
  const {
    streamingCalls, confirmedCalls, setConfirmedCalls,
    setStreamingCalls, selectedCallId, setSelectedCallId,
    activeTab, setActiveTab, appendCall,
    isFetchingOrder, setIsFetchingOrder,
    isTimerPaused, setIsTimerPaused,
    driverLocation, simConfig
  } = useSimulationContext();

  const [selectedCall, setSelectedCall] = useState<CallItem | null>(null);
  const [showMenu, setShowMenu] = useState(false);

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

  // 콜 수락 (탁송)
  const handleAcceptCall = useCallback((call: CallItem) => {
    setStreamingCalls(prev => prev.filter(c => c.id !== call.id));
    setConfirmedCalls(prev => {
      if (prev.find(c => c.id === call.id)) return prev;
      return [...prev, call];
    });
    setSelectedCallId(call.id);
  }, [setStreamingCalls, setConfirmedCalls, setSelectedCallId]);

  // 배차 취소
  const handleCancelCall = useCallback((call: CallItem) => {
    setConfirmedCalls(prev => prev.filter(c => c.id !== call.id));
    handleCloseDetail();
  }, [setConfirmedCalls, handleCloseDetail]);

  // 배송 완료
  const handleCompleteDelivery = useCallback((call: CallItem) => {
    setConfirmedCalls(prev => prev.filter(c => c.id !== call.id));
    handleCloseDetail();
  }, [setConfirmedCalls, handleCloseDetail]);

  // 상세 보기 분기
  const displayCall = selectedCall;
  if (displayCall) {
    const isConfirmed = confirmedCalls.some(c => c.id === displayCall.id);

    if (isConfirmed) {
      return (
        <InseongOngoingDetailScreen
          call={displayCall}
          onClose={handleCloseDetail}
          onConfirm={handleCompleteDelivery}
          onCancel={handleCancelCall}
        />
      );
    }

    return (
      <InseongCallDetailScreen
        call={displayCall}
        feedback={null}
        isConfirmed={false}
        onClose={handleCloseDetail}
        onAccept={handleAcceptCall}
      />
    );
  }

  // 메인 리스트
  return (
    <div className="relative w-full h-full">
      <InseongDispatchBoard
        streamingCalls={streamingCalls}
        confirmedCalls={confirmedCalls}
        activeTab={activeTab}
        onTabSelect={setActiveTab}
        onCallClick={handleCallClick}
        onStartClick={() => navigate('/inseong')}
        onSettingsClick={() => navigate('/inseong')}
        onMenuClick={() => setShowMenu(true)}
        isTimerPaused={isTimerPaused}
        onToggleTimer={() => setIsTimerPaused(!isTimerPaused)}
        isFetchingOrder={isFetchingOrder}
        selectedCallId={selectedCallId}
        maxPickupKm={simConfig.maxPickupKm}
      />
      {showMenu && (
        <InseongDropdownMenu onClose={() => setShowMenu(false)} />
      )}
    </div>
  );
}

export function InseongDispatchPage() {
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
      <div className="w-full h-dvh py-10 bg-[#111] overflow-hidden relative font-sans text-black">
        <SimDispatchContent />
      </div>
    </SimulationProvider>
  );
}
