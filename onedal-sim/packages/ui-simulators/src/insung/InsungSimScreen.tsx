/**
 * 🚚 **인성 배차 화면** — 리스트·상세를 무엇으로 그릴지 인성이 정한다
 *
 * 고른 콜이 없으면 리스트(+ 메뉴), 고른 콜이 이미 잡은 콜이면 진행 중 상세, 아니면 수락 전 상세.
 * `tests/netScreens.test.tsx` 가 그 부품을 직접 그린 것과 글자 하나까지 대조한다.
 */
import { useState } from 'react';
import type { NetScreenProps } from '../nets';
import { SimDispatchBoard } from './SimDispatchBoard';
import { InsungCallDetailScreen } from './InsungCallDetailScreen';
import { InsungOngoingDetailScreen } from './InsungOngoingDetailScreen';
import { InsungDropdownMenu } from './InsungDropdownMenu';

export const InsungSimScreen = (p: NetScreenProps) => {
  const [showMenu, setShowMenu] = useState(false);

  // ── 상세 보기 ──
  if (p.selectedCall) {
    const selected = p.selectedCall;
    const isConfirmed = p.confirmedCalls.some(c => c.id === selected.id);
    if (isConfirmed) {
      return (
        <InsungOngoingDetailScreen
          call={selected}
          onClose={p.closeDetail}
          onCancel={p.cancelCall}
        />
      );
    }
    return (
      <InsungCallDetailScreen
        call={selected}
        feedback={null}
        isConfirmed={false}
        onClose={p.closeDetail}
        onAccept={p.acceptCall}
      />
    );
  }

  // ── 리스트 ──
  return (
    <div className="relative w-full h-full">
      <SimDispatchBoard
        streamingCalls={p.streamingCalls}
        confirmedCalls={p.confirmedCalls}
        activeTab={p.activeTab}
        onTabSelect={p.setActiveTab}
        onCallClick={p.openCall}
        onStartClick={p.goSetup}
        onSettingsClick={p.goSetup}
        onMenuClick={() => setShowMenu(true)}
        isTimerPaused={p.isTimerPaused}
        onToggleTimer={p.toggleTimer}
        isFetchingOrder={p.isFetchingOrder}
        selectedCallId={p.selectedCallId}
        maxPickupKm={p.maxPickupKm}
      />
      {showMenu && <InsungDropdownMenu onClose={() => setShowMenu(false)} />}
    </div>
  );
};
