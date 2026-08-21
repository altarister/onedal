/**
 * @altari/ui-simulators — 시뮬레이터 전용 스트리밍 훅
 * 
 * GameContext 의존성 없음. 마운트 즉시 스트리밍 시작.
 */
import { useEffect, useRef } from 'react';
import { generateSimCall } from '@altari/core-simulator';
import type { SimGeneratorConfig, CallItem } from '@altari/core-simulator';

interface UseSimStreamingProps {
  config: SimGeneratorConfig;
  appendCall: (call: CallItem) => void;
  setIsFetchingOrder: (fetching: boolean) => void;
  isTimerPaused: boolean;
  intervalMs?: number;
  initialCount?: number;
}

export const useSimStreaming = ({
  config,
  appendCall,
  setIsFetchingOrder,
  isTimerPaused,
  intervalMs = 5000,
  initialCount = 5
}: UseSimStreamingProps) => {

  const configRef = useRef({ config, appendCall, setIsFetchingOrder, intervalMs });
  const seededRef = useRef(false);

  useEffect(() => {
    configRef.current = { config, appendCall, setIsFetchingOrder, intervalMs };
  }, [config, appendCall, setIsFetchingOrder, intervalMs]);

  useEffect(() => {
    if (isTimerPaused) return;

    // 초기 시드: 최초 마운트 시 한 번만 실행
    if (!seededRef.current) {
      const cfg = configRef.current;
      for (let i = 0; i < initialCount; i++) {
        const call = generateSimCall(cfg.config);
        if (call) cfg.appendCall(call);
      }
      seededRef.current = true;
    }

    // 주기적 스트리밍
    let innerTimeoutId: ReturnType<typeof setTimeout> | null = null;
    const intervalId = setInterval(() => {
      const cfg = configRef.current;
      cfg.setIsFetchingOrder(true);
      const loadingTime = Math.min(cfg.intervalMs / 2, 500);

      innerTimeoutId = setTimeout(() => {
        const call = generateSimCall(cfg.config);
        if (call) cfg.appendCall(call);
        cfg.setIsFetchingOrder(false);
      }, loadingTime);
    }, configRef.current.intervalMs);

    return () => {
      clearInterval(intervalId);
      if (innerTimeoutId) clearTimeout(innerTimeoutId);
      configRef.current.setIsFetchingOrder(false);
    };
  }, [isTimerPaused, initialCount]);
};
