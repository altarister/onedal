/**
 * 🛵 **인성플렉스 배차 화면** — 목록 → 상세 → 진행중을 인성플렉스가 정한다 (기획서 61 부록 A 1-2 상태 전이)
 *
 * - 홈(출근 전)은 배차 화면이 `SimNet.Home`(`IsflexHomeScreen`)으로 그린다 — «출근하기»로 들어오면 여기
 * - 목록 줄을 누르면 상세(S7) — 방문 기록에 한 칸(원달앱 «뒤로»가 상세만 닫는다)
 * - «…원 수행하기»: 착불이고 적립금(`ISFLEX_POINT`)이 0 이면 «적립금이 부족합니다» 팝업(S16 · 상세 그대로) ·
 *   그 밖은 잡은 콜로 옮기고 → «진행중» 탭 → 상세 닫기(픽커와 같은 차례). «수행하기» 직후 화면은 실물을 몰라 따로 안 그린다
 * - «진행중» 탭 줄을 누르면 내 오더 콜(S15 · 지어냄) — 단계는 콜마다 기억 · 맨 끝 «완료»는 잡은 콜에서 뺀다
 * - 지도 · 시트 · 메뉴 · 칩 · 거리 설정은 화면 안 상태 — 방문 기록에 안 쌓인다
 * - 🔴 시트 · 팝업이 떠 있으면 뒤 화면에 `aria-hidden` — 실물은 덧칸 뒤 글자를 하나도 안 준다(05 · 06)
 * - «다른 기사가 가져감»은 개별콜 `withdrawn` 이 공통으로 줄을 뺀다 — 눌렀을 때 토스트는 두지 않는다(실물 글자를 모른다)
 */
import { useState } from 'react';
import type { NetScreenProps, SimCall } from '../nets';
import type { IsflexCall } from './isflexCall';
import { ISFLEX_POINT } from './isflexCall';
import { IsflexOrderBoard, ISFLEX_DISTANCE_LIMITS } from './IsflexOrderBoard';
import type { IsflexChip } from './IsflexOrderBoard';
import { IsflexCallDetailScreen } from './IsflexCallDetailScreen';
import { IsflexOngoingScreen } from './IsflexOngoingScreen';
import type { IsflexOngoingStep } from './IsflexOngoingScreen';
import { IsflexDistanceSheet, IsflexSizeSheet } from './IsflexSheets';
import { IsflexPopup } from './IsflexPopups';
import type { IsflexPopupKind } from './IsflexPopups';
import { IsflexMenuScreens } from './IsflexMenuScreens';
import type { IsflexMenu } from './IsflexMenuScreens';

/** 인성플렉스 칸이 입혀진 콜만 — 다른 배차망 콜이 섞여 들어오면 그리지 않는다 */
const isIsflexCall = (c: SimCall): c is IsflexCall => 'net' in c && c.net === 'isflex';

/** «수행하기»가 막히나 — 착불 콜은 적립금이 있어야 수락된다(이용료 값은 몰라 셈하지 않는다 · 적립금 0 이면 늘 막힘) */
export const isflexAcceptBlocked = (call: IsflexCall, point = ISFLEX_POINT): IsflexPopupKind | null =>
  call.paymentType === '착불' && point <= 0 ? 'POINT_SHORT' : null;

export const IsflexSimScreen = (p: NetScreenProps) => {
  const [mapMode, setMapMode] = useState(false);
  const [sheet, setSheet] = useState<'DISTANCE' | 'SIZE' | null>(null);
  const [menus, setMenus] = useState<IsflexMenu[]>([]);
  const [chip, setChip] = useState<IsflexChip>('전체');
  const [distance, setDistance] = useState('전체');
  /** 떠 있는 팝업 — 어느 콜의 상세 위인가 (다른 콜 상세에는 안 뜬다) */
  const [popup, setPopup] = useState<{ callId: string; kind: IsflexPopupKind } | null>(null);
  const [steps, setSteps] = useState<Record<string, IsflexOngoingStep>>({});

  if (p.selectedCall && isIsflexCall(p.selectedCall)) {
    const call = p.selectedCall;
    if (p.confirmedCalls.some(c => c.id === call.id)) {
      return (
        <IsflexOngoingScreen
          key={call.id}
          call={call}
          step={steps[call.id] ?? 'PICKUP'}
          onStepChange={s => setSteps(prev => ({ ...prev, [call.id]: s }))}
          onBack={p.closeDetail}
          onFinish={c => { p.finishCall(c); p.setActiveTab('CONFIRMED'); }}
        />
      );
    }
    const shownPopup = popup?.callId === call.id ? popup.kind : null;
    return (
      <div className="relative w-full h-full">
        <div className="w-full h-full" aria-hidden={shownPopup ? true : undefined}>
          <IsflexCallDetailScreen
            call={call}
            onClose={() => { setPopup(null); p.closeDetail(); }}
            onAccept={() => {
              const blocked = isflexAcceptBlocked(call);
              if (blocked) { setPopup({ callId: call.id, kind: blocked }); return; }
              p.acceptCall(call); p.setActiveTab('CONFIRMED'); p.closeDetail();
            }}
          />
        </div>
        {shownPopup && <IsflexPopup kind={shownPopup} onOk={() => setPopup(null)} />}
      </div>
    );
  }

  const menu = menus[menus.length - 1];
  if (menu) {
    return (
      <IsflexMenuScreens
        menu={menu}
        now={new Date()}
        onBack={() => setMenus(m => m.slice(0, -1))}
        onOpen={next => setMenus(m => [...m, next])}
      />
    );
  }

  return (
    <div className="relative w-full h-full">
      <div className="w-full h-full" aria-hidden={sheet ? true : undefined}>
        <IsflexOrderBoard
          calls={p.streamingCalls.filter(isIsflexCall)}
          myOrders={p.confirmedCalls.filter(isIsflexCall)}
          activeTab={p.activeTab}
          onTabSelect={p.setActiveTab}
          onCallClick={p.openCall}
          onMyOrderClick={p.openCall}
          mapMode={mapMode}
          onMapMode={setMapMode}
          chip={chip}
          onChip={setChip}
          limitKm={ISFLEX_DISTANCE_LIMITS.find(o => o.label === distance)?.km ?? null}
          onDistanceSheet={() => setSheet('DISTANCE')}
          onSizeSheet={() => setSheet('SIZE')}
          onMessage={() => setMenus(['MESSAGE'])}
          onMy={() => setMenus(['MY'])}
        />
      </div>
      {sheet === 'DISTANCE' && <IsflexDistanceSheet value={distance} onSave={v => { setDistance(v); setSheet(null); }} onClose={() => setSheet(null)} />}
      {sheet === 'SIZE' && <IsflexSizeSheet onClose={() => setSheet(null)} />}
    </div>
  );
};
