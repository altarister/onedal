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
import { InsungNoticeDialog } from './InsungNoticeDialog';

export const InsungSimScreen = (p: NetScreenProps) => {
  const [showMenu, setShowMenu] = useState(false);
  const [orderLocked, setOrderLocked] = useState(false);
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);

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
        onTabSelect={(tab) => {
          // 실물: 잡은 콜이 없을 때 «완료» 를 누르면 완료 탭으로 안 넘어가고 목록 위에 알림이 뜬다(영상 1611)
          if (tab === 'CONFIRMED' && p.confirmedCalls.length === 0) setNotice({ title: '오더 상세', message: '자료가 존재하지 않습니다' });
          else p.setActiveTab(tab);
        }}
        onCallClick={(call) => {
          // 실물: 오더 선택 잠금이 켜져 있으면 콜을 눌러도 상세가 안 열리고 알림이 뜬다(영상 1328)
          if (orderLocked) setNotice({ title: '알림', message: '오더 선택 잠금 상태 입니다' });
          else p.openCall(call);
        }}
        onStartClick={p.goSetup}
        onSettingsClick={p.goSetup}
        onMenuClick={() => setShowMenu(true)}
        isTimerPaused={p.isTimerPaused}
        onToggleTimer={p.toggleTimer}
        isOrderLocked={orderLocked}
        onToggleOrderLock={() => setOrderLocked(!orderLocked)}
        isFetchingOrder={p.isFetchingOrder}
        selectedCallId={p.selectedCallId}
        maxPickupKm={p.maxPickupKm}
      />
      {showMenu && <InsungDropdownMenu onClose={() => setShowMenu(false)} />}
      {notice && <InsungNoticeDialog title={notice.title} message={notice.message} onClose={() => setNotice(null)} />}
    </div>
  );
};
