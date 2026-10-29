/**
 * ⚠️ **상세 위 팝업 둘** — **[지어냄]** 글자 (실물 화면 없음 · 정의 표 상세 줄 덧칸 «수락 실패 팝업» · «확정 제한 팝업»은 `UNKNOWN`)
 *
 * - S16 수락 실패: 적립금(`ISFLEX_POINT`)이 0 이면 착불 콜의 «수행하기»는 늘 이 팝업이다(페이지표 14 «현금(착불) 오더는 이용료만큼 적립금이 있어야 수락»).
 * - S17 확정 제한: 규칙은 실물 18 공지 본문(«운행 확정 후 취소 1회마다 다음 오더의 운행 확정이 10초간 제한»). 시뮬에는 기사가 스스로
 *   취소하는 길이 없어(실물 20) 띄우는 길은 두지 않고 부품만 둔다.
 * 뒤 상세는 부르는 쪽이 `aria-hidden` 을 단다. «확인»은 팝업만 닫는다(상세 그대로 · 잡은 콜에 안 넣음).
 */
export type IsflexPopupKind = 'POINT_SHORT' | 'CONFIRM_LIMIT';

const POPUP_TEXT: Record<IsflexPopupKind, string> = {
  POINT_SHORT: '적립금이 부족합니다',
  CONFIRM_LIMIT: '취소 이력으로 10초간 운행 확정이 제한됩니다',
};

export const IsflexPopup = ({ kind, onOk }: { kind: IsflexPopupKind; onOk: () => void }) => (
  <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 px-8">
    <div className="w-full rounded-xl bg-white px-5 pt-6 pb-4 text-center text-[#1f1f1f]">
      <div className="text-[16px] leading-[22px]">{POPUP_TEXT[kind]}</div>
      <button onClick={onOk} className="mt-5 w-full h-[46px] rounded-lg bg-[#0b4ea2] text-white text-[16px] font-bold">확인</button>
    </div>
  </div>
);
