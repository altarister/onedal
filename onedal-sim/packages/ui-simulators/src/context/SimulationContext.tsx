/**
 * @altari/ui-simulators — 시뮬레이터 전용 독립 Context
 * 
 * 오직 배차 콜 리스트와 기사 위치만 관리.
 * GameContext, DispatchContext 의존성 없음.
 */
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { CallItem } from '@altari/core-simulator';

const MAX_STREAMING_CALLS = 50;

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
  streamingCalls: CallItem[];
  setStreamingCalls: React.Dispatch<React.SetStateAction<CallItem[]>>;
  confirmedCalls: CallItem[];
  setConfirmedCalls: React.Dispatch<React.SetStateAction<CallItem[]>>;
  selectedCallId: string | null;
  setSelectedCallId: (id: string | null) => void;
  activeTab: 'ALL' | 'CONFIRMED';
  setActiveTab: (tab: 'ALL' | 'CONFIRMED') => void;
  appendCall: (call: CallItem) => void;
  isFetchingOrder: boolean;
  setIsFetchingOrder: (fetching: boolean) => void;
  isTimerPaused: boolean;
  setIsTimerPaused: (paused: boolean) => void;
  driverLocation: DriverLocation;
  setDriverLocation: (loc: DriverLocation) => void;
  simConfig: SimulationConfig;
  setSimConfig: (config: SimulationConfig) => void;
}

const SimulationContext = createContext<SimulationContextType | undefined>(undefined);

interface SimulationProviderProps {
  children: ReactNode;
  initialDriver: DriverLocation;
  initialConfig: SimulationConfig;
}

export const SimulationProvider = ({ children, initialDriver, initialConfig }: SimulationProviderProps) => {
  const [streamingCalls, setStreamingCalls] = useState<CallItem[]>([]);
  const [confirmedCalls, setConfirmedCalls] = useState<CallItem[]>([]);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ALL' | 'CONFIRMED'>('ALL');
  const [isFetchingOrder, setIsFetchingOrder] = useState(false);
  const [isTimerPaused, setIsTimerPaused] = useState(false);

  const [driverLocation, setDriverLocation] = useState<DriverLocation>(initialDriver);
  const [simConfig, setSimConfig] = useState<SimulationConfig>(initialConfig);

  /**
   * 📍 **기사님 현위치를 따라간다** (기사님 확정 2026-08-31).
   *
   * 콜의 «현위치 → 상차지 N KM» 은 이 좌표에서 잰다. 예전엔 URL 로 한 번 고른 뒤
   * **움직이지 않아서**, 기사님은 달리는데 숫자는 그대로였다 — 상차 반경 축이
   * 실제 지리와 무관한 값으로 채점됐다 (실측: 적요 7.2km · 실제 11.4km · 22.4km 뒤
   * 상차지가 통과). 실제 인성은 배차망이 매번 계산해 띄운다. 여기도 같게 만든다.
   *
   * 🔴 **못 받으면 있던 값을 그대로 쓴다** — 서버가 꺼져 있어도 시뮬은 돌아야 한다.
   *    (폰이 이 화면을 열 때 서버는 같은 맥의 :4000 이므로 호스트만 빌린다)
   */
  useEffect(() => {
    let alive = true;
    const api = `http://${window.location.hostname}:4000/api/sim/driver-location`;
    const pull = async () => {
      try {
        const r = await fetch(api);
        const d = await r.json();
        if (!alive || !d?.ok || typeof d.x !== 'number' || typeof d.y !== 'number') return;
        setDriverLocation(prev =>
          (prev.lon === d.x && prev.lat === d.y) ? prev
            : { lon: d.x, lat: d.y, name: d.isFallback ? '기사님 내 주소' : '기사님 현위치' });
      } catch { /* 서버가 없으면 고정 좌표로 계속 — 조용히 넘어간다 */ }
    };
    pull();
    const t = setInterval(pull, 3000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const appendCall = useCallback((call: CallItem) => {
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
      simConfig, setSimConfig
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
