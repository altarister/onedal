/**
 * 🚚 **인성플렉스 내 오더 콜(운행)** — S15 · **[지어냄]** (실물 캡처 없음 · 정의 표 «내 오더 콜» 줄 `seen: SIM`)
 *
 * 머리 · 칸 이름은 실물 상세에서 빌렸다(«출발» · «도착» · «적요상세» · «총 수입»). 단계 단추 낱말은 지어냈다:
 *   «픽업완료» → «배송완료» → «서명받기» → 서명 칸(«서명받기» · «서명» · «완료»)
 * 🔴 «수행하기» 글자 금지(확정 전 상세 표식) · 픽커 표식(«픽업 완료하기» · «배송 완료하기» · «픽업지 정보» · «도착지 정보» · «배송 시간») 금지
 *    · 인성 «확정 뒤 상세» 글자(«인수증 전송» · «카드 승인») 금지.
 * 🔴 서명 단계에도 «서명받기» 글자를 둔다 — 정의 표가 이 화면을 단계 단추 글자 하나(«픽업완료» · «배송완료» · «서명받기»)로 알아본다.
 * 원달앱은 이 화면에서 아무것도 누르지 않는다(완료 · 서명은 기사님 손). 맨 끝 «완료»는 잡은 콜에서 빼고 진행중 탭으로.
 * 확정 뒤 전화가 보인다는 것은 페이지표 짐작(08 메모)이다.
 */
import type { IsflexCall } from './isflexCall';
import { isflexDropoffPoint, isflexFareWon, isflexPickupPoint, isflexTitle } from './isflexCall';
import { IsflexChunk } from './IsflexOrderRow';

export type IsflexOngoingStep = 'PICKUP' | 'DELIVERY' | 'SIGN' | 'SIGNING';
const NEXT: Record<Exclude<IsflexOngoingStep, 'SIGNING'>, { label: string; next: IsflexOngoingStep }> = {
  PICKUP: { label: '픽업완료', next: 'DELIVERY' },
  DELIVERY: { label: '배송완료', next: 'SIGN' },
  SIGN: { label: '서명받기', next: 'SIGNING' },
};

interface Props {
  call: IsflexCall;
  step: IsflexOngoingStep;
  onStepChange: (step: IsflexOngoingStep) => void;
  onBack: () => void;
  onFinish: (call: IsflexCall) => void;
}

export const IsflexOngoingScreen = ({ call, step, onStepChange, onBack, onFinish }: Props) => (
  <div className="relative w-full h-full flex flex-col bg-white text-[#1f1f1f] select-none overflow-hidden">
    <div className="flex items-center h-[48px] px-3 shrink-0">
      <button onClick={onBack} className="w-6 h-6 border-l-2 border-b-2 border-[#222] rotate-45" />
      <div className="flex-1 min-w-0 px-3 text-center text-[17px] font-bold truncate">{isflexTitle(call)}</div>
    </div>

    <div className="flex-1 overflow-y-auto px-6 pt-4">
      <div className="grid grid-cols-[70px_1fr] gap-y-3 text-[15px]">
        <div className="text-gray-600">출발</div>
        <div className="font-bold break-all">{isflexPickupPoint(call)}</div>
        <div className="text-gray-600">도착</div>
        <div className="font-bold break-all">{isflexDropoffPoint(call)}</div>
        <div className="text-gray-500 text-[14px]">적요상세</div>
        <div className="text-[14px] break-all">{call.memo}</div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <button className="h-[44px] rounded-lg border border-gray-300 text-[14px]">출발지 전화</button>
        <button className="h-[44px] rounded-lg border border-gray-300 text-[14px]">도착지 전화</button>
      </div>
      <IsflexChunk text={call.pickupDetails?.[0]?.phone1} className="mt-2 text-[13px] text-gray-500" />

      {step === 'SIGNING' && (
        <div className="mt-5">
          <div className="text-[15px] font-bold">서명받기</div>
          <div className="mt-2 h-[140px] rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400">서명</div>
        </div>
      )}

      <div className="mt-5 mb-4 rounded-xl bg-[#f5f6f8] px-5 py-4 flex items-center">
        <div className="text-[16px] font-bold text-[#0b4ea2]">총 수입</div>
        <div className="ml-auto text-[17px] font-bold">{isflexFareWon(call.fare)}</div>
      </div>
    </div>

    <div className="px-3 pb-3 pt-2 shrink-0">
      {step === 'SIGNING'
        ? <button onClick={() => onFinish(call)} className="w-full h-[60px] rounded-xl bg-[#0b5cad] text-white text-[18px] font-bold">완료</button>
        : <button onClick={() => onStepChange(NEXT[step].next)} className="w-full h-[60px] rounded-xl bg-[#0b5cad] text-white text-[18px] font-bold">{NEXT[step].label}</button>}
    </div>
  </div>
);
