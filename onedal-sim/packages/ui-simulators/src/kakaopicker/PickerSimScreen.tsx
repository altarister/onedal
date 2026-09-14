/**
 * 🚚 **픽커 배차 화면** — 홈 → 리스트 → 상세를 픽커가 정한다 (2026-09-14 · 카카오픽커_시뮬레이터.md §8 · 2단계 2-2 · 3단계 3-1)
 *
 * - 처음엔 **홈**이다 (실물도 출근 전 홈에서 「시작하기」를 눌러 리스트로 간다)
 * - 콜을 누르면 **수락 전 상세** (`PickerCallDetailScreen` · 실물 05~07) — 「넘기기」 · 「←」 는 리스트로, 「수락하기」는 4단계 전까지 아무 일도 안 한다
 * - 상세를 열면 방문 기록에 한 칸 남는다 (`nets.ts` 의 `detailInHistory` · §7-3) — 원달앱의 «뒤로 가기»가 상세만 닫는다
 */
import { useState } from 'react';
import type { NetScreenProps, SimCall } from '../nets';
import type { PickerCall } from './pickerCall';
import { PickerDispatchBoard } from './PickerDispatchBoard';
import { PickerHomeScreen } from './PickerHomeScreen';
import { PickerCallDetailScreen } from './PickerCallDetailScreen';

/** 픽커 칸이 입혀진 콜만 — 다른 배차망 콜이 섞여 들어오면 그리지 않는다 */
const isPickerCall = (c: SimCall): c is PickerCall => 'net' in c && c.net === 'kakaopicker';

export const PickerSimScreen = (p: NetScreenProps) => {
  const [started, setStarted] = useState(false);

  if (p.selectedCall && isPickerCall(p.selectedCall)) {
    return <PickerCallDetailScreen call={p.selectedCall} onClose={p.closeDetail} />;
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
