/**
 * 🚚 **개별콜을 받아 목록에 넣는 훅** (기사님 지시 2026-09-15 · `@altari/core-simulator` 의 `injectedCall.ts` 머리)
 *
 * 서버(`GET /api/sim/calls`)에 3초마다 «마지막으로 받은 번호 뒤»를 묻고, 받은 콜을 문제지 콜과 같은 길(강제 쌍)로 만든다.
 *
 * 🔴 **멈춤(isTimerPaused)과 상관없이 받는다** — 랜덤 콜을 멈추고 한 건씩 넣어 보는 것이 쓰임새다.
 * 🔴 **기사님 위치를 받은 뒤에 묻기 시작한다** — 상차 거리를 기본 자리에서 재지 않는다 (`useSimStreaming` 의 `ready` 와 같다).
 * 🔴 **서버가 없으면 조용히 넘어간다** — 개별콜이 없을 뿐 시뮬레이터는 돈다 (필드에서 라이브 서버는 이 문을 닫아 둔다).
 */
import { useEffect, useRef } from 'react';
import { generateBaseCall, takeInjected, toInjectedForced } from '@altari/core-simulator';
import type { SimGeneratorConfig, CallDraft, CallOptions, InjectedBatch } from '@altari/core-simulator';
import type { SimCall } from '../nets';
import { simApiBase } from './simApi';

/** 서버에 묻는 간격 — 위치를 묻는 간격과 같다 */
export const INJECTED_POLL_MS = 3000;

interface UseSimInjectedCallsProps {
  config: SimGeneratorConfig;
  /** 배차망 칸을 입히는 함수 — `useSimStreaming` 과 같은 것을 받는다 */
  toCall: (draft: CallDraft, opts: CallOptions) => SimCall;
  appendCall: (call: SimCall) => void;
  /** 기사님 위치를 받았나 — 받기 전에는 묻지 않는다 */
  ready?: boolean;
}

export const useSimInjectedCalls = ({ config, toCall, appendCall, ready = true }: UseSimInjectedCallsProps) => {
  const latest = useRef({ config, toCall, appendCall });
  useEffect(() => {
    latest.current = { config, toCall, appendCall };
  }, [config, toCall, appendCall]);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    let busy = false;
    /** 마지막으로 받은 번호 — null 이면 아직 한 번도 안 물었다 */
    let cursor: number | null = null;

    const pull = async () => {
      if (busy) return;
      busy = true;
      try {
        const r = await fetch(`${simApiBase()}/api/sim/calls${cursor === null ? '' : `?after=${cursor}`}`);
        const d = await r.json();
        if (!alive || !d?.ok) return;
        const taken = takeInjected(cursor, d as InjectedBatch);
        cursor = taken.cursor;
        for (const c of taken.calls) {
          const { config: cfg, toCall: dress, appendCall: add } = latest.current;
          const forced = toInjectedForced(c);
          const draft = generateBaseCall(cfg, forced);
          if (!draft) continue;
          console.log(`🚚 [개별콜] #${c.seq} 목록에 넣음 — ${c.pickup.region} → ${c.dropoff.region} · ${c.fare}`);
          add(dress(draft, { minFare: cfg.minFare, forced }));
        }
      } catch { /* 서버가 없다 — 개별콜이 없을 뿐이다 */ }
      finally { busy = false; }
    };

    void pull();
    const t = setInterval(() => { void pull(); }, INJECTED_POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [ready]);
};
