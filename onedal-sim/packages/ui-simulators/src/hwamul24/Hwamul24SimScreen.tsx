/**
 * 🚚 **화물24시 배차 화면** — 리스트·상세·수락 뒤를 화물24시가 정한다 (카카오픽커_시뮬레이터.md 0단계 0-2 ⑤)
 *
 * 예전엔 DispatchPage 안에 `net === 'hwamul24'` 갈래로 적혀 있던 것을 그대로 옮겼다.
 * 화물24시는 신청하면 그 자리에서 «배차내역» 탭으로 넘어간다 (실 화면이 그렇다) — 수락 → 상세 닫기 → 탭 순서도 예전 그대로.
 * 🔴 훅을 쓰지 않는다 — 검사가 이 함수를 직접 불러 «수락 뒤» 순서를 대조한다 (`tests/netScreens.test.tsx`).
 */
import type { NetScreenProps } from '../nets';
import { Hwamul24DispatchBoard } from './Hwamul24DispatchBoard';
import { Hwamul24CallDetailScreen } from './Hwamul24CallDetailScreen';

export const Hwamul24SimScreen = (p: NetScreenProps) => {
  // ── 상세 보기 ──
  if (p.selectedCall) {
    return (
      <Hwamul24CallDetailScreen
        call={p.selectedCall}
        onClose={p.closeDetail}
        onAccept={(call) => {
          p.acceptCall(call);
          p.closeDetail();
          p.setActiveTab('CONFIRMED');
        }}
      />
    );
  }

  // ── 리스트 ──
  return (
    <div className="relative w-full h-full">
      <Hwamul24DispatchBoard
        streamingCalls={p.streamingCalls}
        confirmedCalls={p.confirmedCalls}
        activeTab={p.activeTab}
        onTabSelect={p.setActiveTab}
        onCallClick={p.openCall}
        onSettingsClick={p.goSetup}
        isTimerPaused={p.isTimerPaused}
        onToggleTimer={p.toggleTimer}
        isFetchingOrder={p.isFetchingOrder}
      />
    </div>
  );
};
