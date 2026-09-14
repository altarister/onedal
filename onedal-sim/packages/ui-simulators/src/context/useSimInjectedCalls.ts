/**
 * 🚚 **개별콜을 받아 목록에 넣는 훅** (기사님 지시 2026-09-15 · `@altari/core-simulator` 의 `injectedCall.ts` 머리)
 *
 * 서버(`GET /api/sim/calls`)에 3초마다 «마지막으로 받은 번호 뒤»를 묻고, 받은 콜을 문제지 콜과 같은 길(강제 쌍)로 만든다.
 *
 * 🔴 **개별콜 화면에서만 받는다** (`enabled` · 설정 화면 «🚚 개별콜» 탭) — 랜덤·문제지 콜과 섞이면 폰이 무엇을 거르고 잡았는지 떼어 볼 수 없다.
 * 🔴 **기사님 위치를 받은 뒤에 묻기 시작한다** — 상차 거리를 기본 자리에서 재지 않는다 (`useSimStreaming` 의 `ready` 와 같다).
 * 🔴 **회차가 바뀌면 목록을 비운다** (`resetCalls`) — 시나리오를 다시 시작하면 서버가 이전 콜을 리셋한다. 옛 콜이 남으면 같은 콜이 두 개가 된다.
 * 🔴 **서버가 없으면 조용히 넘어간다** — 개별콜이 없을 뿐 시뮬레이터는 돈다 (필드에서 라이브 서버는 이 문을 닫아 둔다).
 */
import { useEffect, useRef } from 'react';
import { generateBaseCall, takeInjected, toInjectedForced } from '@altari/core-simulator';
import type { SimGeneratorConfig, CallDraft, CallOptions, InjectedBatch, InjectedCursor } from '@altari/core-simulator';
import type { SimCall } from '../nets';
import { simApiBase } from './simApi';

/** 서버에 묻는 간격 — 위치를 묻는 간격과 같다 */
export const INJECTED_POLL_MS = 3000;

interface UseSimInjectedCallsProps {
  config: SimGeneratorConfig;
  /** 배차망 칸을 입히는 함수 — `useSimStreaming` 과 같은 것을 받는다 */
  toCall: (draft: CallDraft, opts: CallOptions) => SimCall;
  appendCall: (call: SimCall) => void;
  /** 목록 비우기 — 서버 회차가 바뀌었을 때 (열린 상세·확정 목록까지 화면이 정한다) */
  resetCalls: () => void;
  /** 기사님 위치를 받았나 — 받기 전에는 묻지 않는다 */
  ready?: boolean;
  /** 받나 — 개별콜 화면에서만 `true` */
  enabled: boolean;
}

export const useSimInjectedCalls = ({ config, toCall, appendCall, resetCalls, ready = true, enabled }: UseSimInjectedCallsProps) => {
  const latest = useRef({ config, toCall, appendCall, resetCalls });
  useEffect(() => {
    latest.current = { config, toCall, appendCall, resetCalls };
  }, [config, toCall, appendCall, resetCalls]);

  useEffect(() => {
    if (!ready || !enabled) return;
    let alive = true;
    let busy = false;
    /** 마지막으로 받은 번호·회차 — null 이면 아직 한 번도 안 물었다 */
    let cursor: InjectedCursor | null = null;

    const pull = async () => {
      if (busy) return;
      busy = true;
      try {
        const r = await fetch(`${simApiBase()}/api/sim/calls${cursor === null ? '' : `?after=${cursor.seq}`}`);
        const d = await r.json();
        if (!alive || !d?.ok) return;
        const taken = takeInjected(cursor, d as InjectedBatch);
        cursor = taken.cursor;
        const { config: cfg, toCall: dress, appendCall: add, resetCalls } = latest.current;
        if (taken.clear) console.log(`🧹 [개별콜] 회차 ${taken.cursor.round} — 이전 콜을 리셋한다 (목록 비움)`);
        if (taken.clear) resetCalls();
        for (const c of taken.calls) {
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
  }, [ready, enabled]);
};
