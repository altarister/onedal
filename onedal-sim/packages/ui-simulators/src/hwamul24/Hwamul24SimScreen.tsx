/**
 * 🚚 **화물24시 배차 화면** — 리스트·상세·수락 뒤를 화물24시가 정한다
 *
 * 화물24시는 신청하면 그 자리에서 «배차내역» 탭으로 넘어간다 (실 화면이 그렇다) — 수락 → 상세 닫기 → 탭 순서다.
 * 🔴 훅을 쓰지 않는다 — 검사가 이 함수를 직접 불러 «수락 뒤» 순서를 대조한다 (`tests/netScreens.test.tsx`).
 */
import type { NetScreenProps } from '../nets';
import { Hwamul24DispatchBoard } from './Hwamul24DispatchBoard';
import { Hwamul24CallDetailScreen } from './Hwamul24CallDetailScreen';
import { Hwamul24PreConfirmScreen } from './Hwamul24PreConfirmScreen';

export const Hwamul24SimScreen = (p: NetScreenProps) => {
  // ── 상세 보기 — 잡은 콜은 배차내역 상세(실물 04 · 05 · 21 · 22), 안 잡은 콜은 화물상세정보(실물 18) ──
  const selected = p.selectedCall;
  const accept = (call: NonNullable<NetScreenProps['selectedCall']>) => {
    p.acceptCall(call);
    p.closeDetail();
    p.setActiveTab('CONFIRMED');
  };
  if (selected && p.confirmedCalls.some(c => c.id === selected.id)) {
    return <Hwamul24CallDetailScreen call={selected} onClose={p.closeDetail} onAccept={accept} />;
  }
  if (selected) {
    return <Hwamul24PreConfirmScreen call={selected} onClose={p.closeDetail} onAccept={accept} />;
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
