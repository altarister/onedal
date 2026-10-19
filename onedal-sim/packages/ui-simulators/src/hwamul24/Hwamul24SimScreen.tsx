/**
 * 🚚 **화물24시 배차 화면** — 리스트·상세·수락 뒤를 화물24시가 정한다
 *
 * 화물24시는 배차신청하면 같은 «화물상세정보»에 머물고 위에 «배차취소하기» 막대가 시간 동안 뜬다(실물 54) — 그 뒤 취소는 전화만.
 * 바닥 «배차내역»을 누르면 상세를 닫고 «배차내역» 탭으로 간다.
 * 🔴 훅을 쓰지 않는다 — 검사가 이 함수를 직접 불러 «수락 뒤» 순서를 대조한다 (`tests/netScreens.test.tsx`).
 */
import type { NetScreenProps } from '../nets';
import { Hwamul24DispatchBoard } from './Hwamul24DispatchBoard';
import { Hwamul24CallDetailScreen } from './Hwamul24CallDetailScreen';
import { Hwamul24PreConfirmScreen } from './Hwamul24PreConfirmScreen';

export const Hwamul24SimScreen = (p: NetScreenProps) => {
  const selected = p.selectedCall;
  const toMyOrders = () => {
    p.closeDetail();
    p.setActiveTab('CONFIRMED');
  };
  if (selected && p.confirmedCalls.some(c => c.id === selected.id)) {
    // ── 배차내역 탭에서 연 잡은 콜은 배차내역 상세(실물 04 · 05 · 21 · 22) — «하차완료»도 닫고 배차내역 탭으로 ──
    if (p.activeTab === 'CONFIRMED') {
      return <Hwamul24CallDetailScreen call={selected} onClose={p.closeDetail} onAccept={(call) => { p.acceptCall(call); toMyOrders(); }} />;
    }
    // ── 실시간 목록에서 연 콜이 잡은 콜에 들었다 — 방금 배차신청한 같은 화면(실물 54) ──
    return <Hwamul24PreConfirmScreen call={selected} onClose={p.closeDetail} onAccept={p.acceptCall} onMyOrders={toMyOrders} onCancelApply={p.cancelCall} />;
  }
  if (selected) {
    // ── 안 잡은 콜은 화물상세정보(실물 18 · 53) ──
    return <Hwamul24PreConfirmScreen call={selected} onClose={p.closeDetail} onAccept={p.acceptCall} />;
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
