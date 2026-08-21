/**
 * @altari/ui-simulators — 시뮬레이터 전용 독립 Context
 * 
 * 오직 배차 콜 리스트와 기사 위치만 관리.
 * GameContext, DispatchContext 의존성 없음.
 */
import React, { createContext, useContext, useState, useCallback } from 'react';
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
