/**
 * 🚚 **픽커 배차 화면** — 홈 → 리스트 → 상세 자리를 픽커가 정한다 (2026-09-14 · 카카오픽커_시뮬레이터.md §8 · 2단계 2-2)
 *
 * - 처음엔 **홈**이다 (실물도 출근 전 홈에서 「시작하기」를 눌러 리스트로 간다)
 * - 콜을 누르면 **상세 자리** — 상세 화면은 3단계에서 만든다. 지금은 원달앱이 상세로 알아볼 글자(`넘기기`·`수락하기`)를 **일부러 안 넣는다**
 * - 상세를 열면 방문 기록에 한 칸 남는다 (`nets.ts` 의 `detailInHistory` · §7-3) — 원달앱의 «뒤로 가기»가 상세만 닫는다
 */
import { useState } from 'react';
import type { NetScreenProps, SimCall } from '../nets';
import type { PickerCall } from './pickerCall';
import { formatPickerFare, PickerDispatchBoard } from './PickerDispatchBoard';
import { PickerHomeScreen } from './PickerHomeScreen';

/** 픽커 칸이 입혀진 콜만 — 다른 배차망 콜이 섞여 들어오면 그리지 않는다 */
const isPickerCall = (c: SimCall): c is PickerCall => 'net' in c && c.net === 'kakaopicker';

/** ⏳ 상세 자리 (3단계에서 실물 05~07 로 바꾼다) */
const PickerDetailPlaceholder = ({ call, onClose }: { call: PickerCall; onClose: () => void }) => (
  <div className="w-full h-full bg-white flex flex-col items-center justify-center gap-3 p-6 text-center">
    <div className="text-[17px] font-bold">픽커 상세 자리</div>
    <div className="text-[13px] text-gray-500">3단계에서 실물 화면으로 만든다</div>
    <div className="text-[13px] text-gray-700">최종 수익 {formatPickerFare(call.fare)}P · 오더번호 {call.orderNo}</div>
    <button onClick={onClose} className="mt-2 rounded-lg bg-slate-800 px-4 py-2 text-[14px] font-bold text-white">리스트로</button>
  </div>
);

export const PickerSimScreen = (p: NetScreenProps) => {
  const [started, setStarted] = useState(false);

  if (p.selectedCall && isPickerCall(p.selectedCall)) {
    return <PickerDetailPlaceholder call={p.selectedCall} onClose={p.closeDetail} />;
  }

  if (!started) {
    return <PickerHomeScreen onStart={() => setStarted(true)} onMenuClick={p.goSetup} />;
  }

  return (
    <PickerDispatchBoard
      calls={p.streamingCalls.filter(isPickerCall)}
      activeTab={p.activeTab}
      onTabSelect={p.setActiveTab}
      myOrderCount={p.confirmedCalls.length}
      onCallClick={p.openCall}
      onMenuClick={p.goSetup}
    />
  );
};
