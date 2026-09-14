/**
 * 🚚 **인성 배차 화면** — 리스트·상세를 무엇으로 그릴지 인성이 정한다 (2026-09-14 · 카카오픽커_시뮬레이터.md 0단계 0-2 ⑤)
 *
 * 예전엔 DispatchPage 안에 `net` 갈래로 적혀 있던 것을 그대로 옮겼다 — 고른 콜이 없으면 리스트(+ 메뉴),
 * 고른 콜이 이미 잡은 콜이면 진행 중 상세, 아니면 수락 전 상세. `tests/netScreens.test.tsx` 가 옮기기 전 부품과 대조한다.
 */
import { useState } from 'react';
import type { NetScreenProps } from '../nets';
import { SimDispatchBoard } from './SimDispatchBoard';
import { InseongCallDetailScreen } from './InseongCallDetailScreen';
import { InseongOngoingDetailScreen } from './InseongOngoingDetailScreen';
import { InseongDropdownMenu } from './InseongDropdownMenu';

export const InsungSimScreen = (p: NetScreenProps) => {
  const [showMenu, setShowMenu] = useState(false);

  // ── 상세 보기 ──
  if (p.selectedCall) {
    const selected = p.selectedCall;
    const isConfirmed = p.confirmedCalls.some(c => c.id === selected.id);
    if (isConfirmed) {
      return (
        <InseongOngoingDetailScreen
          call={selected}
          onClose={p.closeDetail}
          onCancel={p.cancelCall}
        />
      );
    }
    return (
      <InseongCallDetailScreen
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
      {showMenu && <InseongDropdownMenu onClose={() => setShowMenu(false)} />}
    </div>
  );
};
