/**
 * 🚚 **배차 리스트** (`/dispatch?net=insung|hwamul24|kakaopicker`) — 기사님 확정 · 배차망 이름은 서버·원달앱과 같다
 *
 * 🔴 **갈라지는 것은 «그리는 화면» 하나뿐이다.** 앱 파서가 **화면에 적힌 글자**를 읽기
 *    때문이다 — 인성은 차종 약자(오·다·라)를 앵커로 요금을 읽고, 화물24시는
 *    «1톤/전체 · 독차» 글자를 읽는다. 그 아래(문제지·주소·콜 생성·현위치·채움)는 전부 공용이다.
 *
 * 이 페이지는 배차망마다 한 벌씩 두지 않는다 — 한 벌씩이면 **한쪽만 자라** 한 배차망만 `fillers` 를 안 읽는 식으로
 * 갈라진다. 같은 질문에 두 답이 있으면 언젠가 갈라진다 (규칙 ③).
 */
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate, Navigate, Link } from 'react-router-dom';
import { SimulationProvider, useSimulationContext } from '@altari/ui-simulators';
import { useSimStreaming, useSimInjectedCalls } from '@altari/ui-simulators';
import { simNetOf, renamedNetKey, SIM_NET_LIST } from '@altari/ui-simulators';
import { getPresetFrom } from '@altari/core-simulator';
import type { SimCall } from '@altari/ui-simulators';
import type { SimNet } from '@altari/ui-simulators';
import { SIM_DEFAULT_START } from './preflightRows';

/** 🧹 리셋 준비 화면을 띄워 두는 시간 — 폰 접근성 이벤트는 곧바로 오니 사람 눈에 한 번 보일 만큼이면 된다 */
const ROUND_CURTAIN_MS = 1500;

/**
 * 🔴 **배차망 이름을 모를 때의 멈춤 화면**
 *
 * `?net=` 이 모르는 값이거나 아예 없으면 한 배차망 화면으로 조용히 그리지 않고 멈춘다.
 * 그 배차망인 줄 모르고 시험하면 그 시간이 통째로 헛것이다 — 아래 «문제지가 없다» 멈춤과 같은 자리다.
 */
function UnknownNetScreen({ netKey }: { netKey: string | null }) {
  return (
    <div className="w-full h-dvh flex flex-col items-center justify-center gap-3 bg-red-50 p-6 text-center">
      <div className="text-3xl">🚚</div>
      <div className="text-lg font-bold text-red-700">
        {netKey ? <>배차망 «{netKey}» 가 없습니다</> : <>주소에 배차망 이름(net)이 없습니다</>}
      </div>
      <div className="text-sm text-red-600">
        어느 배차망 화면인지 몰라서 <b>콜을 흘리지 않습니다.</b><br />
        짐작해서 한 배차망으로 그리면, 그 배차망인 줄 모르고 시험한 시간이 헛것이 됩니다.
      </div>
      <div className="mt-2 text-xs text-gray-700">
        <div className="mb-1 font-bold">쓸 수 있는 이름 (<code>?net=</code>)</div>
        <div className="flex flex-wrap justify-center gap-1">
          {SIM_NET_LIST.map(n => (
            <code key={n.key} className="rounded bg-white px-2 py-0.5 border border-red-200">{n.key}</code>
          ))}
        </div>
      </div>
      <Link to="/" className="mt-3 rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white">설정 화면으로</Link>
    </div>
  );
}

function DispatchContent({ simNet }: { simNet: SimNet }) {
  const navigate = useNavigate();
  const {
    streamingCalls, confirmedCalls, setConfirmedCalls,
    setStreamingCalls, selectedCallId, setSelectedCallId,
    activeTab, setActiveTab, appendCall,
    isFetchingOrder, setIsFetchingOrder,
    isTimerPaused, setIsTimerPaused,
    driverLocation, simConfig,
    locationReady, locationFallback,
  } = useSimulationContext();

  const [selectedCall, setSelectedCall] = useState<SimCall | null>(null);

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
   * 🧱 **`?fillers=N` — 시간을 만드는 채움 콜을 앞에서 N개만 쓴다** (기사님 확정).
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
   * 🔴 **문제지 이름을 못 찾으면 멈춘다** — 조용히 랜덤 콜을 흘리지 않는다.
   *
   * 문제지 키가 바뀐 뒤 옛 URL 로 열면 `getPreset` 이 `null` 을 준다. 그때 랜덤 콜을 흘리면
   * 채점 시험인 줄 알고 본 30분이 통째로 헛것이 된다 —
   * 「빈 필터는 제한 없음이 아니라 고장이다」(규칙 ④)와 같은 자리다.
   */
  const presetName = presetParams.get('preset');
  /**
   * 📚 **이 배차망의 문제지 책에서만** 찾는다 (`nets.ts` 의 `presetBook`) — 인성·화물24시는 원 단위 문제지,
   * 픽커는 P 단위 문제지. 남의 책 이름이면 아래 «문제지가 없다»로 멈춘다 (요금 크기가 틀린 채점을 흘리지 않는다).
   */
  const presetMissing = !!presetName && !getPresetFrom(simNet.presetBook, presetName);
  const preset = useMemo(() => {
    const all = getPresetFrom(simNet.presetBook, presetParams.get('preset'));
    if (!all) return all;
    let used = 0;
    return all.filter(p => !p.filler || used++ < fillerLimit);
  }, [simNet.presetBook, presetParams, fillerLimit]);

  /**
   * 🔁 `?loop=1` — 문제지를 다 내면 처음으로 되돌린다 (기본값 아님).
   * 채점은 한 바퀴가 한 차례라 되돌리면 흐려진다. 주행 시험처럼 오래 흘려야 할 때만 켠다.
   */
  const loop = presetParams.get('loop') === '1';

  /**
   * 🚚 **`?calls=individual` — 개별콜 화면** (기사님 지시: 메인 메뉴 «시나리오콜 · 랜덤콜 · 개별콜»).
   * 빈 리스트로 시작해 현황판에서 보낸 콜만 받는다. 🔴 **한 번에 한 종류만 흐른다** —
   * 개별콜 화면에는 랜덤·문제지 콜이 없고, 랜덤·문제지 화면은 현황판 콜을 안 받는다. 섞이면 폰이 무엇을 거르고 잡았는지 떼어 볼 수 없다.
   */
  const individual = presetParams.get('calls') === 'individual';

  useSimStreaming({
    config: generatorConfig,
    // 🎨 공통 칸만 만드는 생성기에 배차망 칸을 입힌다 — 무엇으로 입힐지는 배차망이 안다 (nets.ts)
    toCall: simNet.toCall,
    appendCall,
    setIsFetchingOrder,
    isTimerPaused,
    intervalMs: simConfig.intervalMs,
    initialCount: 5,
    preset,
    loop,
    /* 📍 기사님 위치를 받은 뒤에 첫 콜 — 기본 자리로 상차 거리를 재지 않는다 */
    ready: locationReady,
    /* 🚚 개별콜 화면은 흘리지 않는다 — 시드 5건도 주기 콜도 없다 */
    enabled: !individual,
  });

  /**
   * 🔙 **상세를 방문 기록에 남기는 배차망** (`SimNet.detailInHistory`).
   * 원달앱의 «뒤로 가기»(시뮬레이터 앱은 웹뷰 방문 기록으로 넘긴다)가 상세만 닫게, 상세를 열 때 `?detail=<콜 id>` 를 **한 칸 쌓는다.**
   * 닫을 때는 그 칸을 되돌리고, 주소에서 `detail` 이 사라지면(뒤로 가기) 상세를 닫는다 — 닫는 길이 둘이어도 답은 주소 하나다.
   * 인성·화물24시는 방문 기록에 쌓지 않고 상태만 바꾼다.
   */
  const detailId = simNet.detailInHistory ? presetParams.get('detail') : null;

  const handleCallClick = useCallback((call: SimCall) => {
    setSelectedCall(call);
    setSelectedCallId(call.id);
    if (simNet.detailInHistory) {
      const next = new URLSearchParams(presetParams);
      next.set('detail', call.id);
      navigate(`/dispatch?${next.toString()}`);
    }
  }, [setSelectedCallId, simNet.detailInHistory, presetParams, navigate]);

  const clearSelection = useCallback(() => {
    setSelectedCall(null);
    setSelectedCallId(null);
  }, [setSelectedCallId]);

  const handleCloseDetail = useCallback(() => {
    // 방문 기록에 쌓은 칸이 있으면 되돌린다 — 아래 useEffect 가 상세를 닫는다
    if (simNet.detailInHistory && presetParams.get('detail')) navigate(-1);
    else clearSelection();
  }, [simNet.detailInHistory, presetParams, navigate, clearSelection]);

  /**
   * 주소의 `detail` 이 **있다가 사라지면** 닫는다 — «없다»만 보면 안 된다.
   * 🔴 라우터는 주소 바꾸기를 한 박자 늦게 그린다. 그래서 «고른 콜은 들어갔는데 주소엔 아직 detail 이 없는» 한 순간이 있고,
   *    «없다»만 보면 그 순간을 뒤로 가기로 읽어 **연 상세를 곧바로 닫는다**.
   */
  const prevDetailId = useRef<string | null>(null);
  useEffect(() => {
    if (simNet.detailInHistory && prevDetailId.current && !detailId && selectedCall) clearSelection();
    prevDetailId.current = detailId;
  }, [simNet.detailInHistory, detailId, selectedCall, clearSelection]);

  /**
   * 콜 수락 — 인성은 «확정», 화물24시(실물)는 «배차신청» 이다.
   * 🔴 인성 «탁송»은 수락이 아니다 (기사님)
   */
  const handleAcceptCall = useCallback((call: SimCall) => {
    setStreamingCalls(prev => prev.filter(c => c.id !== call.id));
    setConfirmedCalls(prev => {
      if (prev.find(c => c.id === call.id)) return prev;
      return [...prev, call];
    });
    setSelectedCallId(call.id);
    // 수락 뒤에 무엇을 보일지는 배차망 화면이 정한다 — 화물24시는 «배차내역» 탭으로 넘어간다 (Hwamul24SimScreen)
  }, [setStreamingCalls, setConfirmedCalls, setSelectedCallId]);

  const handleCancelCall = useCallback((call: SimCall) => {
    setConfirmedCalls(prev => prev.filter(c => c.id !== call.id));
    handleCloseDetail();
  }, [setConfirmedCalls, handleCloseDetail]);

  /** 🚚 배송 완료 — 잡은 콜에서 빼고 상세를 닫는다 (픽커 수락 뒤 단계). 하는 일은 취소와 같지만 이름을 가른다 — 로그·검사가 뜻을 읽게 */
  const handleFinishCall = useCallback((call: SimCall) => {
    setConfirmedCalls(prev => prev.filter(c => c.id !== call.id));
    handleCloseDetail();
  }, [setConfirmedCalls, handleCloseDetail]);

  /**
   * 🧹 **이전 콜 리셋** — 서버 회차가 바뀌면(시나리오 다시 시작) 목록·확정 목록을 비운다.
   * 🔴 열린 상세는 **닫는 길(`handleCloseDetail`)로** 닫는다 — 픽커는 상세가 방문 기록(`?detail=`)에 쌓여 있어 상태만 지우면 뒤로 가기가 꼬인다 (onedal-49).
   */
  /**
   * 🧹 **리셋하면 목록 대신 준비 화면을 잠깐 그린다** — 원달앱은 화면 «종류»가 바뀔 때만 서버에 바로 묻는다
   *    (`HijackService.updateScreenContext`). 목록이 이미 비어 있으면 바뀔 것이 없어 폰이 새 회차를 60초 주기에야 받고,
   *    서버는 그때까지 첫 콜을 안 낸다. 목록 → 준비 → 목록으로 종류를 두 번 바꿔 곧바로 받게 한다.
   */
  const [roundCurtain, setRoundCurtain] = useState(false);
  useEffect(() => {
    if (!roundCurtain) return;
    const t = setTimeout(() => setRoundCurtain(false), ROUND_CURTAIN_MS);
    return () => clearTimeout(t);
  }, [roundCurtain]);
  const resetCalls = useCallback(() => {
    handleCloseDetail();
    setStreamingCalls([]);
    setConfirmedCalls([]);
    /* 픽커 탭도 «신규»로 — 수락 뒤 «내 오더»에 남은 채 새 회차가 오면 새 콜 카드가 안 보인다 (#152) */
    setActiveTab('ALL');
    setRoundCurtain(true);
  }, [handleCloseDetail, setStreamingCalls, setConfirmedCalls, setActiveTab]);

  /**
   * 🚚 **개별콜 — 현황판에서 낸 콜을 이 목록에 넣는다** (기사님 지시).
   * 서버가 들고 있다가 3초마다 넘긴다. 문제지 콜과 같은 길(강제 쌍)로 이 배차망 콜을 입힌다 — 무엇으로 입힐지는 배차망이 안다.
   * 🔴 개별콜 화면에서만 받는다 (위 `individual`). 닫는 길을 쓰므로 그것보다 아래에 둔다.
   */
  /**
   * 🫳 **거둔 콜을 목록에서 뺀다** — 서버가 채점을 마친 문제지 줄의 콜을 거뒀다 (실주행에서 남이 잡으면 목록에서 사라지는 것과 같다 · onedal-b5).
   * 🔴 **목록 행만 뺀다** — 이미 잡은 콜(확정 목록)과 폰이 열어 둔 상세는 그대로 둔다. 상세를 도중에 닫으면 폰 원달앱이 멀쩡한 확정 흐름에서 튕긴다.
   */
  const removeCalls = useCallback((ids: string[]) => {
    const gone = new Set(ids);
    setStreamingCalls(prev => prev.filter(c => !gone.has(c.id) || c.id === selectedCallId));
  }, [setStreamingCalls, selectedCallId]);

  useSimInjectedCalls({ config: generatorConfig, toCall: simNet.toCall, appendCall, resetCalls, removeCalls, ready: locationReady, enabled: individual });

  // 🔴 문제지 이름을 못 찾았다 — 랜덤으로 흘리지 않고 멈춘다 (위 주석 참조)
  // 콜을 고른 상태면 상세가 먼저다 — 순서는 상세 → 문제지 없음 → 리스트
  if (!selectedCall && presetMissing) {
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
            {simNet.presetBook.keys.map(k => (
              <code key={k} className="rounded bg-white px-2 py-0.5 border border-red-200">{k}</code>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── 배차망 화면 — 리스트·상세·수락 뒤를 무엇으로 그릴지는 배차망이 정한다 (nets.ts) ──
  const Screen = simNet.Screen;
  return (
    <>
    {/* 🧹 준비 화면 — 배차망 화면은 **내리지 않고 감춘다**(아래 겉싸개). 내리면 픽커의 «시작 → 목록» 같은 화면 상태가 홈으로 돌아간다.
        감춘 화면은 폰 접근성에서도 빠져 목록 글자가 안 읽히니, 폰은 화면 종류가 바뀐 것으로 본다 */}
    {roundCurtain && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white text-lg font-bold text-gray-700">
        🧹 새 회차 준비 중
      </div>
    )}
    {/* ⚠️ 끝내 위치를 못 받아 기본 자리로 시작했다 — 상차 거리가 틀린 채 채점이 흐르지 않게 화면이 말한다 */}
    {locationFallback && (
      <div className="fixed top-0 inset-x-0 z-50 bg-amber-100 border-b border-amber-300 px-3 py-1 text-center text-xs font-bold text-amber-800">
        📍 기사님 위치를 못 받아 기본 자리({driverLocation.name})로 시작했습니다 — 상차 거리가 틀릴 수 있습니다
      </div>
    )}
    <div className="contents" style={{ visibility: roundCurtain ? 'hidden' : 'visible' }}>
    <Screen
      streamingCalls={streamingCalls}
      confirmedCalls={confirmedCalls}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      selectedCall={selectedCall}
      selectedCallId={selectedCallId}
      openCall={handleCallClick}
      closeDetail={handleCloseDetail}
      acceptCall={handleAcceptCall}
      cancelCall={handleCancelCall}
      finishCall={handleFinishCall}
      isTimerPaused={isTimerPaused}
      toggleTimer={() => setIsTimerPaused(!isTimerPaused)}
      isFetchingOrder={isFetchingOrder}
      maxPickupKm={simConfig.maxPickupKm}
      goSetup={() => navigate('/')}
    />
    </div>
    </>
  );
}

export function DispatchPage() {
  const [searchParams] = useSearchParams();
  const netKey = searchParams.get('net');

  // 🔀 바뀐 옛 이름 — 나머지 쿼리(문제지·간격)를 그대로 들고 새 이름으로 넘긴다
  const renamed = renamedNetKey(netKey);
  if (renamed) {
    const params = new URLSearchParams(searchParams);
    params.set('net', renamed);
    return <Navigate to={`/dispatch?${params.toString()}`} replace />;
  }

  // 🔴 모르는 배차망이면 멈춘다 — 짐작해서 한 배차망으로 그리지 않는다 (nets.ts)
  const simNet = simNetOf(netKey);
  if (!simNet) return <UnknownNetScreen netKey={netKey} />;


  const driverLocation = {
    /* 📍 기본값은 시작 전 점검과 한 곳에서 — 점검이 «첫 문제는 여기서 잰다»를 같은 값으로 말한다 */
    lon: Number(searchParams.get('lon') || String(SIM_DEFAULT_START.lon)),
    lat: Number(searchParams.get('lat') || String(SIM_DEFAULT_START.lat)),
    name: searchParams.get('name') || SIM_DEFAULT_START.name,
  };

  const simConfig = {
    maxPickupKm: Number(searchParams.get('maxKm') || '15'),
    minFare: Number(searchParams.get('minFare') || '30000'),
    targetRegion: searchParams.get('target') || '',
    /**
     * 🕐 콜이 뜨는 간격 — 실제 배차망처럼 **5초**(기사님 확정).
     * 설정 화면은 10초로 시작한다(앱이 콜 하나를 처리하는 데 약 12초).
     * 천천히 보고 싶으면 `?interval=20000` 처럼 직접 지정한다.
     */
    intervalMs: Number(searchParams.get('interval') || '5000'),
  };

  return (
    <SimulationProvider initialDriver={driverLocation} initialConfig={simConfig}
      initialLocationKnown={searchParams.has('lon') && searchParams.has('lat')}>
      {/* 겉 테두리도 배차망마다 다르다 — 인성은 검은 테두리 안의 창, 화물24시는 흰 바탕 (nets.ts) */}
      <div className={simNet.frameClassName}>
        <DispatchContent simNet={simNet} />
      </div>
    </SimulationProvider>
  );
}
