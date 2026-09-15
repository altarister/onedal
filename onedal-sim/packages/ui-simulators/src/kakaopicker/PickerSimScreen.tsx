/**
 * 🚚 **픽커 배차 화면** — 홈 → 리스트 → 상세를 픽커가 정한다 (2026-09-14 · 카카오픽커_시뮬레이터.md §8 · 2단계 2-2 · 3단계 3-1 · 3-3)
 *
 * - 처음엔 **홈**이다 (실물도 출근 전 홈에서 「시작하기」를 눌러 리스트로 간다)
 * - 콜을 누르면 **수락 전 상세** (`PickerCallDetailScreen` · 실물 05~07) — 「넘기기」 · 「←」 는 리스트로, 「수락하기」는 잡은 콜로 옮기고 «내 오더» 탭
 * - 잡은 콜을 고르면 **수락 뒤 단계** (`PickerOngoingScreen` · 실물 15~31 · 4단계) — 완료하면 잡은 콜에서 빼고 리스트로
 * - 상세를 열면 방문 기록에 한 칸 남는다 (`nets.ts` 의 `detailInHistory` · §7-3) — 원달앱의 «뒤로 가기»가 상세만 닫는다
 * - 🚫 **리스트에 오래 떠 있던 콜은 남이 가져갔다** — 누르면 상세 대신 «이미 배정이 완료된 오더입니다» 토스트 (실물 캡처 03 · 3-3)
 */
import { useEffect, useRef, useState } from 'react';
import type { NetScreenProps, SimCall } from '../nets';
import type { PickerCall } from './pickerCall';
import { PickerDispatchBoard } from './PickerDispatchBoard';
import { PickerHomeScreen } from './PickerHomeScreen';
import { PickerCallDetailScreen } from './PickerCallDetailScreen';
import { PickerOngoingScreen } from './PickerOngoingScreen';
import type { PickerOngoingStep } from './PickerOngoingScreen';

/** 픽커 칸이 입혀진 콜만 — 다른 배차망 콜이 섞여 들어오면 그리지 않는다 */
const isPickerCall = (c: SimCall): c is PickerCall => 'net' in c && c.net === 'kakaopicker';

/**
 * 🚫 **이 콜을 남이 가져가는 시각** — 리스트에 뜬 뒤 몇 ms (시뮬레이터 값 · 2026-09-14).
 *
 * 🔴 **원달앱의 시간과 무관하다.** 처음엔 «알람 상세 30초 자동 복귀»에 맞춰 모든 콜을 30초로 두었는데,
 *    진짜 픽커는 원달앱이 몇 초 뒤 돌아오는지 모른다 (기사님: *"시뮬레이터는 진짜 픽커 처럼 작동해야"* ·
 *    `docs/지금/배차망별_대기_시간.md`). 실제로 언제 가져가는지도 모른다.
 * 콜마다 20초~3분 사이에서 콜 id 로 정한다 — 같은 콜은 늘 같은 시각이라 검사가 흔들리지 않는다.
 */
export function pickerTakenAfterMs(callId: string): number {
  let h = 0;
  for (let i = 0; i < callId.length; i++) h = (Math.imul(h, 31) + callId.charCodeAt(i)) >>> 0;
  return 20_000 + (h % 161) * 1_000;
}
/** 토스트가 떠 있는 시간 (실물 캡처 03 · 안드로이드 토스트 짧은 길이에 가깝게) */
export const PICKER_TOAST_MS = 2_500;

/**
 * 🔴 **실물 글자 그대로 · 줄바꿈이 든 한 덩어리** — 09-02 실주행에서 원달앱이 이 모양 그대로 읽어 카드 출발지로 넣었다
 *    (`log/1dal-주행로그-20260902/표/버려진콜_intel.json` · 출발지 «이미 배정이 완료된⏎오더입니다.»).
 *    글자를 고치거나 두 덩어리로 나누면 원달앱이 실물에서 겪는 것을 시험하지 못한다.
 */
const ASSIGNED_TOAST_TEXT = '이미 배정이 완료된\n오더입니다.';

export const PickerSimScreen = (p: NetScreenProps) => {
  const [started, setStarted] = useState(false);
  /** 콜이 리스트에 처음 보인 때 (id → ms) */
  const firstSeen = useRef(new Map<string, number>());
  /** 남이 가져간 콜 — 리스트에서 뺀다 (배차 화면의 콜 목록은 안 건드린다) */
  const [taken, setTaken] = useState<Set<string>>(() => new Set());
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 🚚 잡은 콜마다 수락 뒤 어느 단계까지 왔나 — 내 오더에서 다시 열어도 이어진다 */
  const [steps, setSteps] = useState<Record<string, PickerOngoingStep>>({});

  useEffect(() => {
    const now = Date.now();
    p.streamingCalls.forEach(c => { if (!firstSeen.current.has(c.id)) firstSeen.current.set(c.id, now); });
  }, [p.streamingCalls]);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const openOrTaken = (call: SimCall) => {
    const seenAt = firstSeen.current.get(call.id) ?? Date.now();
    if (Date.now() - seenAt < pickerTakenAfterMs(call.id)) {
      p.openCall(call);
      return;
    }
    setTaken(prev => new Set(prev).add(call.id));
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), PICKER_TOAST_MS);
  };

  if (p.selectedCall && isPickerCall(p.selectedCall)) {
    const call = p.selectedCall;
    /* 🚚 잡은 콜이면 수락 뒤 단계 — 수락 전 상세(«넘기기»·«수락하기»)를 다시 그리지 않는다 (4단계) */
    if (p.confirmedCalls.some(c => c.id === call.id)) {
      return (
        <PickerOngoingScreen
          key={call.id}
          call={call}
          /* 처음 열면 수락 직후 «오더 전체»(실물 23) — ✕ 로 내 오더 탭에 가면 그 뒤로는 픽업 이동부터 */
          initialStep={steps[call.id] ?? 'OVERVIEW'}
          onStepChange={s => setSteps(prev => ({ ...prev, [call.id]: s }))}
          onBack={p.closeDetail}
          onFinish={c => { p.finishCall(c); p.setActiveTab('ALL'); }}
        />
      );
    }
    return (
      <PickerCallDetailScreen
        call={call}
        onClose={p.closeDetail}
        onAccept={() => { p.acceptCall(call); p.setActiveTab('CONFIRMED'); }}
      />
    );
  }

  if (!started) {
    return <PickerHomeScreen onStart={() => setStarted(true)} onMenuClick={p.goSetup} />;
  }

  return (
    <div className="relative w-full h-full">
      <PickerDispatchBoard
        calls={p.streamingCalls.filter(isPickerCall).filter(c => !taken.has(c.id))}
        activeTab={p.activeTab}
        onTabSelect={p.setActiveTab}
        myOrderCount={p.confirmedCalls.length}
        myOrders={p.confirmedCalls.filter(isPickerCall)}
        stepOf={id => steps[id]}
        onCallClick={openOrTaken}
        onMenuClick={p.goSetup}
      />
      {toastVisible && (
        /* 실물 캡처 03 — 아래 탭 위에 걸친 검은 토스트 */
        <div className="absolute left-1/2 -translate-x-1/2 bottom-[40px] rounded-lg bg-black/75 px-[18px] py-[10px] pointer-events-none">
          <div className="text-white text-[15px] leading-[20px] text-center whitespace-pre-line">{ASSIGNED_TOAST_TEXT}</div>
        </div>
      )}
    </div>
  );
};
