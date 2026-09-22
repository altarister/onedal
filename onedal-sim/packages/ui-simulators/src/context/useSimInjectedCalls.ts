/**
 * 🚚 **개별콜을 받아 목록에 넣는 훅** (기사님 지시 · `@altari/core-simulator` 의 `injectedCall.ts` 머리)
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
  /**
   * 🫳 목록에서 빼기 — 서버가 거둔 콜 (채점이 끝난 문제지 줄 · «다른 기사가 가져갔다» · onedal-b5 2026-09-15).
   * 🔴 무엇을 남길지(이미 잡은 콜 · 열어 둔 상세)는 화면이 정한다 — 여기는 «이 콜들을 거뒀다»만 알린다.
   */
  removeCalls: (ids: string[]) => void;
  /** 기사님 위치를 받았나 — 받기 전에는 묻지 않는다 */
  ready?: boolean;
  /** 받나 — 개별콜 화면에서만 `true` */
  enabled: boolean;
}

export const useSimInjectedCalls = ({ config, toCall, appendCall, resetCalls, removeCalls, ready = true, enabled }: UseSimInjectedCallsProps) => {
  const latest = useRef({ config, toCall, appendCall, resetCalls, removeCalls });
  useEffect(() => {
    latest.current = { config, toCall, appendCall, resetCalls, removeCalls };
  }, [config, toCall, appendCall, resetCalls, removeCalls]);

  useEffect(() => {
    if (!ready || !enabled) return;
    let alive = true;
    let busy = false;
    /** 마지막으로 받은 번호·회차 — null 이면 아직 한 번도 안 물었다 */
    let cursor: InjectedCursor | null = null;
    /** 🫳 번호 → 목록 콜 id — 서버가 거둔 번호를 목록 행으로 찾는다. 뺀 번호는 지운다(두 번 안 뺀다) */
    const idOfSeq = new Map<number, string>();

    const pull = async () => {
      if (busy) return;
      busy = true;
      try {
        const r = await fetch(`${simApiBase()}/api/sim/calls${cursor === null ? '' : `?after=${cursor.seq}`}`);
        const d = await r.json();
        if (!alive || !d?.ok) return;
        const taken = takeInjected(cursor, d as InjectedBatch);
        cursor = taken.cursor;
        const { config: cfg, toCall: dress, appendCall: add, resetCalls, removeCalls } = latest.current;
        if (taken.clear) console.log(`🧹 [개별콜] 회차 ${taken.cursor.round} — 이전 콜을 리셋한다 (목록 비움)`);
        if (taken.clear) { resetCalls(); idOfSeq.clear(); }
        for (const c of taken.calls) {
          const forced = toInjectedForced(c);
          const draft = generateBaseCall(cfg, forced);
          if (!draft) continue;
          console.log(`🚚 [개별콜] #${c.seq} 목록에 넣음 — ${c.pickup.region} → ${c.dropoff.region} · ${c.fare}`);
          const call = dress(draft, { minFare: cfg.minFare, forced });
          idOfSeq.set(c.seq, call.id);
          add(call);
        }
        /* 🫳 서버가 거둔 콜 — 받은 적 있고 아직 안 뺀 번호만. 거둔 목록은 누적이라 뺀 번호는 지워 두 번 안 뺀다 */
        const gone = taken.withdrawn.filter(seq => idOfSeq.has(seq));
        if (gone.length) {
          console.log(`🫳 [개별콜] #${gone.join(', #')} 목록에서 뺌 — 채점이 끝난 줄 (다른 기사가 가져갔다)`);
          removeCalls(gone.map(seq => idOfSeq.get(seq)!));
          for (const seq of gone) idOfSeq.delete(seq);
        }
      } catch { /* 서버가 없다 — 개별콜이 없을 뿐이다 */ }
      finally { busy = false; }
    };

    void pull();
    const t = setInterval(() => { void pull(); }, INJECTED_POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [ready, enabled]);
};
