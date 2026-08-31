/**
 * @altari/ui-simulators — 시뮬레이터 전용 스트리밍 훅
 * 
 * GameContext 의존성 없음. 마운트 즉시 스트리밍 시작.
 */
import { useEffect, useRef } from 'react';
import { generateSimCall, toForcedPair } from '@altari/core-simulator';
import type { SimGeneratorConfig, CallItem, PresetProblem } from '@altari/core-simulator';

interface UseSimStreamingProps {
  config: SimGeneratorConfig;
  appendCall: (call: CallItem) => void;
  setIsFetchingOrder: (fetching: boolean) => void;
  isTimerPaused: boolean;
  intervalMs?: number;
  initialCount?: number;
  /**
   * 🎯 문제지 — 있으면 **랜덤 대신 이 목록을 순서대로** 흘린다 (다 흘리면 멈춘다).
   * 특정 조건(예: 인천 남동구행)을 시험하려고 복권을 긁지 않기 위한 것이다.
   */
  preset?: PresetProblem[] | null;
  /**
   * 🔁 **문제지를 다 내면 처음으로 되돌린다** (기사님 요청 2026-08-23 — v2 실주행 시험).
   *
   * 기본값 `false` 라 **채점 모드는 그대로다** — 채점은 한 바퀴가 곧 한 판이고,
   * 되돌아 흘리면 몇 번째 시도인지가 흐려진다.
   *
   * 주행 시험은 반대다. 8문제 × 45초면 6분인데 **주행은 1시간**이라, 되돌리지 않으면
   * 초반 몇 분만 콜이 오고 나머지는 조용하다. 그때의 `훑음 0` 은 필터 문제로 잘못 읽힌다.
   */
  loop?: boolean;
}

export const useSimStreaming = ({
  config,
  appendCall,
  setIsFetchingOrder,
  isTimerPaused,
  intervalMs = 5000,
  initialCount = 5,
  preset = null,
  loop = false
}: UseSimStreamingProps) => {

  const configRef = useRef({ config, appendCall, setIsFetchingOrder, intervalMs, preset, loop });
  const seededRef = useRef(false);
  // 문제지를 어디까지 냈는가 — 한 문제씩 순서대로 낸다
  const presetIdxRef = useRef(0);

  useEffect(() => {
    configRef.current = { config, appendCall, setIsFetchingOrder, intervalMs, preset, loop };
  }, [config, appendCall, setIsFetchingOrder, intervalMs, preset, loop]);

  /**
   * 다음 콜 하나 — 문제지가 있으면 그 다음 문제, 없으면 랜덤.
   * 문제지를 다 냈으면 null(더 안 낸다) — 랜덤으로 되돌아가면 채점이 흐려진다.
   * 🔁 `loop` 면 **처음으로 되돌린다** — 주행 시험처럼 오래 흘려야 할 때만 (기본값 아님).
   */
  const nextCall = () => {
    const cfg = configRef.current;
    if (cfg.preset && cfg.preset.length > 0) {
      if (cfg.loop && presetIdxRef.current >= cfg.preset.length) {
        presetIdxRef.current = 0;
        console.log(`🔁 [문제지] 한 바퀴 끝 — 처음부터 다시 흘립니다 (${cfg.preset.length}문제)`);
      }
      const p = cfg.preset[presetIdxRef.current];
      if (!p) return null;
      presetIdxRef.current += 1;
      // 📍 띠 문제는 «지금 어디»에서 푼다 — 출제 순간의 좌표라야 정답이 어디서든 같다 (0831)
      const forced = toForcedPair(p, {
          driverLon: cfg.config.driverLon,
          driverLat: cfg.config.driverLat,
          maxPickupKm: cfg.config.maxPickupKm,
      });
      if (!forced) return null;
      console.log(`🎯 [문제지] ${p.label} — 앱이 ${p.expect === 'BLOCK' ? '걸러야' : '올려야'} 한다 · ${p.why}`);
      return generateSimCall(cfg.config, forced);
    }
    return generateSimCall(cfg.config);
  };

  useEffect(() => {
    if (isTimerPaused) return;

    // 초기 시드: 최초 마운트 시 한 번만 실행
    // 🎯 문제지 모드에서는 **한 문제씩** 봐야 하므로 미리 쏟지 않는다
    if (!seededRef.current) {
      const cfg = configRef.current;
      const seedCount = cfg.preset ? 1 : initialCount;
      for (let i = 0; i < seedCount; i++) {
        const call = nextCall();
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
        const call = nextCall();
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
