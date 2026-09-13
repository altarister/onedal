/**
 * 🚚 **배차 리스트** (`/dispatch?net=inseong|hwamul24`) — 기사님 확정 2026-09-11
 *
 * 🔴 **갈라지는 것은 «그리는 화면» 하나뿐이다.** 앱 파서가 **화면에 적힌 글자**를 읽기
 *    때문이다 — 인성은 차종 약자(오·다·라)를 앵커로 요금을 읽고, 화물24시는
 *    «1톤/전체 · 독차» 판이다. 그 아래(문제지·주소·콜 생성·현위치·채움)는 전부 공용이다.
 *
 * 예전에는 이 페이지가 배차망마다 한 벌씩 있었고, 그래서 **한쪽만 자랐다** —
 * 화물24시 쪽은 `fillers` 를 안 읽어 **채움 콜이 전부 흘렀다.** 같은 질문에 두 답이
 * 있으면 언젠가 갈라진다 (규칙 ③).
 */
import { useState, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { SimulationProvider, useSimulationContext } from '@altari/ui-simulators';
import { useSimStreaming } from '@altari/ui-simulators';
import { InseongDispatchBoard, InseongCallDetailScreen, InseongOngoingDetailScreen, InseongDropdownMenu } from '@altari/ui-simulators';
import { Hwamul24DispatchBoard, Hwamul24CallDetailScreen } from '@altari/ui-simulators';
import { toInsungCall, toHwamul24Call } from '@altari/ui-simulators';
import { getPreset, PRESET_KEYS } from '@altari/core-simulator';
import type { SimCall } from '@altari/ui-simulators';
import type { NetKey } from './SetupPage';

function DispatchContent({ net }: { net: NetKey }) {
  const navigate = useNavigate();
  const {
    streamingCalls, confirmedCalls, setConfirmedCalls,
    setStreamingCalls, selectedCallId, setSelectedCallId,
    activeTab, setActiveTab, appendCall,
    isFetchingOrder, setIsFetchingOrder,
    isTimerPaused, setIsTimerPaused,
    driverLocation, simConfig,
  } = useSimulationContext();

  const [selectedCall, setSelectedCall] = useState<SimCall | null>(null);
  const [showMenu, setShowMenu] = useState(false);

  // 스트리밍 엔진 가동
  const generatorConfig = useMemo(() => ({
    driverLon: driverLocation.lon,
    driverLat: driverLocation.lat,
    maxPickupKm: simConfig.maxPickupKm,
    minFare: simConfig.minFare,
    targetRegion: simConfig.targetRegion,
  }), [driverLocation, simConfig]);

  const [presetParams] = useSearchParams();

  /**
   * 🧱 **`?fillers=N` — 시간을 만드는 채움 콜을 앞에서 N개만 쓴다** (기사님 확정 2026-08-26).
   *
   * 모의 주행은 **40초**(15배속·25km)인데 실주행은 **40분**이다. 텀 하나로는 둘을 못 맞춘다 —
   * 텀을 1초로 내리면 첫짐·합짐을 결재할 시간이 사라진다. 그래서 **개수**를 따로 조절한다.
   *
   *   (채움 N + 1) × 텀  ≈  주행시간 ÷ 2      ← 주행중 합짐이 한가운데 오게
   *
   * 🔴 깃발 없는 문제(잡는 콜 · 국면 전용 축)는 **N 과 무관하게 전부 남는다.**
   */
  const fillerLimit = Number(presetParams.get('fillers') ?? '99');

  /**
   * 🔴 **이름을 못 찾으면 조용히 랜덤으로 돌던 자리다** (2026-09-06 실사고).
   *
   * 기사님: *"시뮬레이터 값이 이상한 것이 들어 있어. 분당구 출발하는 것으로 나오고 있어."*
   * 문제지를 넷으로 쪼개며 키가 바뀌었는데(`볼첨지` → `볼첨지대전`), 옛 URL 로 열자
   * `getPreset` 이 `null` 을 주고 **화면은 아무 말 없이 랜덤 콜을 흘렸다.**
   * 채점 판인 줄 알고 30분을 보면 그 30분이 통째로 헛것이다 —
   * 「빈 필터는 제한 없음이 아니라 고장이다」(규칙 ④)와 같은 자리다.
   */
  const presetName = presetParams.get('preset');
  const presetMissing = !!presetName && !getPreset(presetName);
  const preset = useMemo(() => {
    const all = getPreset(presetParams.get('preset'));
    if (!all) return all;
    let used = 0;
    return all.filter(p => !p.filler || used++ < fillerLimit);
  }, [presetParams, fillerLimit]);

  /**
   * 🔁 `?loop=1` — 문제지를 다 내면 처음으로 되돌린다 (기본값 아님).
   * 채점은 한 바퀴가 한 판이라 되돌리면 흐려진다. 주행 시험처럼 오래 흘려야 할 때만 켠다.
   */
  const loop = presetParams.get('loop') === '1';

  useSimStreaming({
    config: generatorConfig,
    // 🎨 공통 칸만 만드는 생성기에 배차망 칸을 입힌다 (0단계 0-2 ④) — 배차망을 전부 아는 곳은 ⑤ 에서 nets.ts 로 모은다
    toCall: net === 'hwamul24' ? toHwamul24Call : toInsungCall,
    appendCall,
    setIsFetchingOrder,
    isTimerPaused,
    intervalMs: simConfig.intervalMs,
    initialCount: 5,
    preset,
    loop,
  });

  const handleCallClick = useCallback((call: SimCall) => {
    setSelectedCall(call);
    setSelectedCallId(call.id);
  }, [setSelectedCallId]);

  const handleCloseDetail = useCallback(() => {
    setSelectedCall(null);
    setSelectedCallId(null);
  }, [setSelectedCallId]);

  /** 콜 수락 — 인성은 «탁송», 화물24시는 «배차신청» 이라 부른다 */
  const handleAcceptCall = useCallback((call: SimCall) => {
    setStreamingCalls(prev => prev.filter(c => c.id !== call.id));
    setConfirmedCalls(prev => {
      if (prev.find(c => c.id === call.id)) return prev;
      return [...prev, call];
    });
    setSelectedCallId(call.id);
    // 화물24시는 신청하면 그 자리에서 «배차» 탭으로 넘어간다 (실 화면이 그렇다)
    if (net === 'hwamul24') {
      handleCloseDetail();
      setActiveTab('CONFIRMED');
    }
  }, [net, setStreamingCalls, setConfirmedCalls, setSelectedCallId, setActiveTab, handleCloseDetail]);

  const handleCancelCall = useCallback((call: SimCall) => {
    setConfirmedCalls(prev => prev.filter(c => c.id !== call.id));
    handleCloseDetail();
  }, [setConfirmedCalls, handleCloseDetail]);

  const handleCompleteDelivery = useCallback((call: SimCall) => {
    setConfirmedCalls(prev => prev.filter(c => c.id !== call.id));
    handleCloseDetail();
  }, [setConfirmedCalls, handleCloseDetail]);

  // ── 상세 보기 ──
  if (selectedCall) {
    if (net === 'hwamul24') {
      return (
        <Hwamul24CallDetailScreen
          call={selectedCall}
          onClose={handleCloseDetail}
          onAccept={handleAcceptCall}
        />
      );
    }
    const isConfirmed = confirmedCalls.some(c => c.id === selectedCall.id);
    if (isConfirmed) {
      return (
        <InseongOngoingDetailScreen
          call={selectedCall}
          onClose={handleCloseDetail}
          onConfirm={handleCompleteDelivery}
          onCancel={handleCancelCall}
        />
      );
    }
    return (
      <InseongCallDetailScreen
        call={selectedCall}
        feedback={null}
        isConfirmed={false}
        onClose={handleCloseDetail}
        onAccept={handleAcceptCall}
      />
    );
  }

  // 🔴 문제지 이름을 못 찾았다 — 랜덤으로 흘리지 않고 멈춘다 (위 주석 참조)
  if (presetMissing) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-red-50 p-6 text-center">
        <div className="text-3xl">🎯</div>
        <div className="text-lg font-bold text-red-700">문제지 «{presetName}» 가 없습니다</div>
        <div className="text-sm text-red-600">
          이름을 못 찾아서 <b>콜을 흘리지 않습니다.</b><br />
          그대로 두면 랜덤 콜이 섞여 채점이 통째로 헛것이 됩니다.
        </div>
        <div className="mt-2 text-xs text-gray-700">
          <div className="mb-1 font-bold">쓸 수 있는 이름</div>
          <div className="flex flex-wrap justify-center gap-1">
            {PRESET_KEYS.map(k => (
              <code key={k} className="rounded bg-white px-2 py-0.5 border border-red-200">{k}</code>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── 리스트 ──
  if (net === 'hwamul24') {
    return (
      <div className="relative w-full h-full">
        <Hwamul24DispatchBoard
          streamingCalls={streamingCalls}
          confirmedCalls={confirmedCalls}
          activeTab={activeTab}
          onTabSelect={setActiveTab}
          onCallClick={handleCallClick}
          onSettingsClick={() => navigate('/')}
          isTimerPaused={isTimerPaused}
          onToggleTimer={() => setIsTimerPaused(!isTimerPaused)}
          isFetchingOrder={isFetchingOrder}
        />
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <InseongDispatchBoard
        streamingCalls={streamingCalls}
        confirmedCalls={confirmedCalls}
        activeTab={activeTab}
        onTabSelect={setActiveTab}
        onCallClick={handleCallClick}
        onStartClick={() => navigate('/')}
        onSettingsClick={() => navigate('/')}
        onMenuClick={() => setShowMenu(true)}
        isTimerPaused={isTimerPaused}
        onToggleTimer={() => setIsTimerPaused(!isTimerPaused)}
        isFetchingOrder={isFetchingOrder}
        selectedCallId={selectedCallId}
        maxPickupKm={simConfig.maxPickupKm}
      />
      {showMenu && <InseongDropdownMenu onClose={() => setShowMenu(false)} />}
    </div>
  );
}

export function DispatchPage() {
  const [searchParams] = useSearchParams();
  const net: NetKey = searchParams.get('net') === 'hwamul24' ? 'hwamul24' : 'inseong';

  const driverLocation = {
    lon: Number(searchParams.get('lon') || '127.2553'),
    lat: Number(searchParams.get('lat') || '37.4095'),
    name: searchParams.get('name') || '경기 광주시',
  };

  const simConfig = {
    maxPickupKm: Number(searchParams.get('maxKm') || '15'),
    minFare: Number(searchParams.get('minFare') || '30000'),
    targetRegion: searchParams.get('target') || '',
    /**
     * 🕐 콜이 뜨는 간격 — 실제 배차망처럼 **5초**(기사님 확정 2026-08-22).
     * 설정 화면은 10초로 시작한다(앱이 콜 하나를 처리하는 데 약 12초).
     * 천천히 보고 싶으면 `?interval=20000` 처럼 직접 지정한다.
     */
    intervalMs: Number(searchParams.get('interval') || '5000'),
  };

  return (
    <SimulationProvider initialDriver={driverLocation} initialConfig={simConfig}>
      {/* 인성은 검은 테두리 안의 창, 화물24시는 흰 바탕 — 각 실 화면을 흉내 낸다 */}
      <div className={net === 'hwamul24'
        ? 'w-full h-dvh bg-gray-100 overflow-hidden relative font-sans text-black'
        : 'w-full h-dvh py-10 bg-[#111] overflow-hidden relative font-sans text-black'}>
        <DispatchContent net={net} />
      </div>
    </SimulationProvider>
  );
}
