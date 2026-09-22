/**
 * @altari/ui-simulators — 시뮬레이터 전용 독립 Context
 * 
 * 오직 배차 콜 리스트와 기사 위치만 관리.
 * GameContext, DispatchContext 의존성 없음.
 */
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { SimCall } from '../nets';
import { simApiBase } from './simApi';

const MAX_STREAMING_CALLS = 50;

/**
 * ⏳ **위치를 기다리는 최대 시간** — 서버도 폰도 이만큼 안에 답이 없으면 기본 자리로 시작한다.
 * 시뮬은 어떤 경우에도 돌아야 한다(필드에서 라이브 서버는 위치 문을 닫아 둔다). 그때 화면이 경고한다.
 */
export const LOCATION_WAIT_MS = 5000;

export interface DriverLocation {
  lon: number;
  lat: number;
  name: string;
}

export interface SimulationConfig {
  maxPickupKm: number;
  minFare: number;
  targetRegion: string;
  intervalMs: number;
}

interface SimulationContextType {
  streamingCalls: SimCall[];
  setStreamingCalls: React.Dispatch<React.SetStateAction<SimCall[]>>;
  confirmedCalls: SimCall[];
  setConfirmedCalls: React.Dispatch<React.SetStateAction<SimCall[]>>;
  selectedCallId: string | null;
  setSelectedCallId: (id: string | null) => void;
  activeTab: 'ALL' | 'CONFIRMED';
  setActiveTab: (tab: 'ALL' | 'CONFIRMED') => void;
  appendCall: (call: SimCall) => void;
  isFetchingOrder: boolean;
  setIsFetchingOrder: (fetching: boolean) => void;
  isTimerPaused: boolean;
  setIsTimerPaused: (paused: boolean) => void;
  driverLocation: DriverLocation;
  setDriverLocation: (loc: DriverLocation) => void;
  simConfig: SimulationConfig;
  setSimConfig: (config: SimulationConfig) => void;
  /** 📍 기사님 위치를 받았나 — 받기 전에는 첫 콜을 안 낸다 */
  locationReady: boolean;
  /** ⚠️ 끝내 위치를 못 받아 기본 자리로 시작했나 — 화면이 «거리가 틀릴 수 있음»을 띄운다 */
  locationFallback: boolean;
}

const SimulationContext = createContext<SimulationContextType | undefined>(undefined);

interface SimulationProviderProps {
  children: ReactNode;
  initialDriver: DriverLocation;
  initialConfig: SimulationConfig;
  /** 📍 주소창에 위치(`?lon=&lat=`)를 넣고 열었나 — 그러면 처음부터 «받았음»이다 */
  initialLocationKnown?: boolean;
}

export const SimulationProvider = ({ children, initialDriver, initialConfig, initialLocationKnown }: SimulationProviderProps) => {
  const [streamingCalls, setStreamingCalls] = useState<SimCall[]>([]);
  const [confirmedCalls, setConfirmedCalls] = useState<SimCall[]>([]);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ALL' | 'CONFIRMED'>('ALL');
  const [isFetchingOrder, setIsFetchingOrder] = useState(false);
  const [isTimerPaused, setIsTimerPaused] = useState(false);

  const [driverLocation, setDriverLocation] = useState<DriverLocation>(initialDriver);
  const [simConfig, setSimConfig] = useState<SimulationConfig>(initialConfig);
  const [locationReady, setLocationReady] = useState(!!initialLocationKnown);
  const [locationFallback, setLocationFallback] = useState(false);

  /**
   * 📍 **기사님 현위치를 따라간다 — 두 출처, 순서가 있다** (기사님 확정).
   *
   * 콜의 «현위치 → 상차지 N KM» 과 축 문제지의 «거리 띠»가 이 좌표에서 나온다. 3초마다 다시 읽는다 —
   * 한 번 고른 뒤 멈춰 있으면 기사님이 움직여도 상차 거리가 처음 자리 기준으로 적혀 **먼 콜이 필터를 통과**한다.
   *
   *   ① **서버**(`/api/sim/driver-location`) — 책상 시험의 정답. 모의 주행 중이면 그 **가상
   *      위치**를 준다. 폰 GPS 를 쓰면 책상에 앉아 있는 좌표가 나와 주행이 반영되지 않는다
   *   ② **폰 GPS** — 서버가 못 답할 때(필드에서 라이브 서버는 이 문을 닫아 둔다). 시뮬
   *      화면은 폰 안에서 도니 그 폰의 위치가 곧 기사님 위치다
   *
   * 🔴 **둘 다 없으면 있던 좌표를 그대로 쓴다** — 시뮬은 어떤 경우에도 돌아야 한다.
   * 서버 주소는 `?api=` 로 바꿀 수 있다 (기본은 같은 호스트의 :4000 — 폰이 맥을 본다).
   */
  useEffect(() => {
    let alive = true;
    const api = simApiBase();
    let got = false;
    const apply = (lon: number, lat: number, name: string) => {
      if (!alive) return;
      got = true;
      setDriverLocation(prev => (prev.lon === lon && prev.lat === lat) ? prev : { lon, lat, name });
      /* 📍 같은 렌더에 위치와 «받았음»이 함께 선다 — 첫 콜이 이 위치로 거리를 잰다 */
      setLocationReady(true);
      setLocationFallback(false);
    };
    /* ⏳ 끝내 답이 없으면 기본 자리로 시작한다 — 시뮬은 어떤 경우에도 돌아야 한다. 대신 화면이 경고한다 */
    const waitT = setTimeout(() => {
      if (!alive || got) return;
      console.warn(`📍 [시뮬] ${LOCATION_WAIT_MS / 1000}초 동안 위치를 못 받았다 — 기본 자리로 첫 콜을 낸다 (상차 거리가 틀릴 수 있다)`);
      setLocationFallback(true);
      setLocationReady(true);
    }, LOCATION_WAIT_MS);
    /** 폰 GPS — 서버가 못 답할 때만. 실패해도 조용히 넘어간다 */
    const fromPhone = () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        pos => apply(pos.coords.longitude, pos.coords.latitude, '기사님 현위치(폰)'),
        () => { /* 권한 거부·실패 — 있던 좌표를 쓴다 */ },
        { enableHighAccuracy: true, maximumAge: 10_000, timeout: 5_000 },
      );
    };
    const pull = async () => {
      try {
        const r = await fetch(`${api}/api/sim/driver-location`);
        const d = await r.json();
        if (d?.ok && typeof d.x === 'number' && typeof d.y === 'number') {
          apply(d.x, d.y, d.isFallback ? '기사님 내 주소' : '기사님 현위치');
          return;
        }
      } catch { /* 서버가 없다 — 폰에게 묻는다 */ }
      fromPhone();
    };
    pull();
    const t = setInterval(pull, 3000);
    return () => { alive = false; clearInterval(t); clearTimeout(waitT); };
  }, []);

  const appendCall = useCallback((call: SimCall) => {
    setStreamingCalls(prev => {
      const next = [call, ...prev];
      return next.length > MAX_STREAMING_CALLS ? next.slice(0, MAX_STREAMING_CALLS) : next;
    });
  }, []);

  return (
    <SimulationContext.Provider value={{
      streamingCalls, setStreamingCalls,
      confirmedCalls, setConfirmedCalls,
      selectedCallId, setSelectedCallId,
      activeTab, setActiveTab,
      appendCall,
      isFetchingOrder, setIsFetchingOrder,
      isTimerPaused, setIsTimerPaused,
      driverLocation, setDriverLocation,
      simConfig, setSimConfig,
      locationReady, locationFallback,
    }}>
      {children}
    </SimulationContext.Provider>
  );
};

export const useSimulationContext = () => {
  const ctx = useContext(SimulationContext);
  if (!ctx) throw new Error('useSimulationContext must be used within SimulationProvider');
  return ctx;
};
