/**
 * 🚚 **배차 리스트** (`/dispatch?net=insung|hwamul24|kakaopicker`) — 기사님 확정 2026-09-11 · 이름은 2026-09-14 에 서버·원달앱과 맞췄다
 *
 * 🔴 **갈라지는 것은 «그리는 화면» 하나뿐이다.** 앱 파서가 **화면에 적힌 글자**를 읽기
 *    때문이다 — 인성은 차종 약자(오·다·라)를 앵커로 요금을 읽고, 화물24시는
 *    «1톤/전체 · 독차» 판이다. 그 아래(문제지·주소·콜 생성·현위치·채움)는 전부 공용이다.
 *
 * 예전에는 이 페이지가 배차망마다 한 벌씩 있었고, 그래서 **한쪽만 자랐다** —
 * 화물24시 쪽은 `fillers` 를 안 읽어 **채움 콜이 전부 흘렀다.** 같은 질문에 두 답이
 * 있으면 언젠가 갈라진다 (규칙 ③).
 */
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate, Navigate, Link } from 'react-router-dom';
import { SimulationProvider, useSimulationContext } from '@altari/ui-simulators';
import { useSimStreaming } from '@altari/ui-simulators';
import { simNetOf, renamedNetKey, SIM_NET_LIST } from '@altari/ui-simulators';
import { getPresetFrom } from '@altari/core-simulator';
import type { SimCall } from '@altari/ui-simulators';
import type { SimNet } from '@altari/ui-simulators';
import { SIM_DEFAULT_START } from './preflightRows';

/**
 * 🔴 **배차망 이름을 모를 때의 멈춤 화면** (2026-09-14 · 0단계 0-4)
 *
 * 예전엔 `?net=` 이 모르는 값이거나 아예 없으면 한 배차망 화면으로 조용히 그렸다.
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
  /**
   * 📚 **이 배차망의 문제지 책에서만** 찾는다 (`nets.ts` 의 `presetBook` · 3단계 3-2) — 인성·화물24시는 원 단위 문제지,
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
   * 채점은 한 바퀴가 한 판이라 되돌리면 흐려진다. 주행 시험처럼 오래 흘려야 할 때만 켠다.
   */
  const loop = presetParams.get('loop') === '1';

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
  });

  /**
   * 🔙 **상세를 방문 기록에 남기는 배차망** (`SimNet.detailInHistory` · 계획서 §7-3 · 2단계 2-2).
   * 원달앱의 «뒤로 가기»(시뮬레이터 앱은 웹뷰 방문 기록으로 넘긴다)가 상세만 닫게, 상세를 열 때 `?detail=<콜 id>` 를 **한 칸 쌓는다.**
   * 닫을 때는 그 칸을 되돌리고, 주소에서 `detail` 이 사라지면(뒤로 가기) 상세를 닫는다 — 닫는 길이 둘이어도 답은 주소 하나다.
   * 인성·화물24시는 예전 그대로다 (상태만 바꾼다).
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
   *    «없다»만 보면 그 순간을 뒤로 가기로 읽어 **연 상세를 곧바로 닫는다** (2단계 2-2 검사에서 실제로 났다).
   */
  const prevDetailId = useRef<string | null>(null);
  useEffect(() => {
    if (simNet.detailInHistory && prevDetailId.current && !detailId && selectedCall) clearSelection();
    prevDetailId.current = detailId;
  }, [simNet.detailInHistory, detailId, selectedCall, clearSelection]);

  /**
   * 콜 수락 — 인성은 «확정», 화물24시(실물)는 «배차신청» 이다.
   * 🔴 인성 «탁송»은 수락이 아니다 (기사님 2026-09-14) — 버튼마다 하는 일은 docs/지금/시뮬레이터_화면과_버튼.md
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

  // 🔴 문제지 이름을 못 찾았다 — 랜덤으로 흘리지 않고 멈춘다 (위 주석 참조)
  // 콜을 고른 상태면 상세가 먼저다 — 예전 순서(상세 → 문제지 없음 → 리스트) 그대로
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

  // ── 배차망 화면 — 리스트·상세·수락 뒤를 무엇으로 그릴지는 배차망이 정한다 (nets.ts · 0단계 0-2 ⑤) ──
  const Screen = simNet.Screen;
  return (
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
      isTimerPaused={isTimerPaused}
      toggleTimer={() => setIsTimerPaused(!isTimerPaused)}
      isFetchingOrder={isFetchingOrder}
      maxPickupKm={simConfig.maxPickupKm}
      goSetup={() => navigate('/')}
    />
  );
}

export function DispatchPage() {
  const [searchParams] = useSearchParams();
  const netKey = searchParams.get('net');

  // 🔀 바뀐 옛 이름 — 나머지 쿼리(문제지·간격)를 그대로 들고 새 이름으로 넘긴다 (0단계 0-4)
  const renamed = renamedNetKey(netKey);
  if (renamed) {
    const params = new URLSearchParams(searchParams);
    params.set('net', renamed);
    return <Navigate to={`/dispatch?${params.toString()}`} replace />;
  }

  // 🔴 모르는 배차망이면 멈춘다 — 짐작해서 한 배차망으로 그리지 않는다 (nets.ts · 계획서 §3-3)
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
     * 🕐 콜이 뜨는 간격 — 실제 배차망처럼 **5초**(기사님 확정 2026-08-22).
     * 설정 화면은 10초로 시작한다(앱이 콜 하나를 처리하는 데 약 12초).
     * 천천히 보고 싶으면 `?interval=20000` 처럼 직접 지정한다.
     */
    intervalMs: Number(searchParams.get('interval') || '5000'),
  };

  return (
    <SimulationProvider initialDriver={driverLocation} initialConfig={simConfig}>
      {/* 겉 테두리도 배차망마다 다르다 — 인성은 검은 테두리 안의 창, 화물24시는 흰 바탕 (nets.ts) */}
      <div className={simNet.frameClassName}>
        <DispatchContent simNet={simNet} />
      </div>
    </SimulationProvider>
  );
}
