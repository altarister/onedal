/**
 * 📋 **인성플렉스 목록 줄 하나** — 실물 02 · 07(목록) · 06(사이즈 설정 시트 견본 줄)
 *
 * 🔴 칸마다 `div` 하나 — 실물은 칸마다 글자 노드가 따로 온다(xml `tv_pick_up_distance` · `tv_car_type` · `tv_pick_up_dong` ·
 *    `tv_distance` · `tv_dest_dong` · `tv_money` · `tv_cost_type`). 웹뷰는 `span` 만 든 줄을 한 글자로 뭉쳐 넘기므로 블록 요소로 둔다.
 * 🔴 DOM 차례 = 실물 xml 차례: 거리 · 차종 · 출발지 · 운행 거리 · 도착지 · 수입 · 결제. 빈 칸은 요소를 안 만든다(결제가 없는 콜은 노드도 없다).
 * 진짜 줄과 사이즈 시트 견본 줄이 이 한 부품을 쓴다 — 원달앱이 견본 줄을 콜로 읽지 않는지 시험하는 재료다.
 */
import type { IsflexRowTexts } from './isflexCall';

/** 줄 높이(CSS px) — 실물 07 줄 간격 약 210~234px ÷ 폰 배율 2.81 [눈대중] */
export const ISFLEX_ROW_HEIGHT = 80;

/** 한 글자 덩어리 — 빈 글자는 요소를 안 만든다 */
export const IsflexChunk = ({ text, className }: { text?: string; className?: string }) =>
  text ? <div className={className}>{text}</div> : null;

interface Props {
  texts: IsflexRowTexts;
  onClick?: () => void;
}

export const IsflexOrderRow = ({ texts, onClick }: Props) => (
  <div
    className={`h-[80px] grid grid-cols-[23%_27%_27%_23%] items-center border-b border-[#eeeeee] bg-white text-[#1f1f1f] ${onClick ? 'cursor-pointer active:bg-gray-50' : ''}`}
    onClick={onClick}
  >
    <div className="pl-[6px]">
      <IsflexChunk text={texts.pickupKm} className="text-[16px] font-bold leading-[20px]" />
      <IsflexChunk text={texts.vehicle} className="text-[13px] leading-[16px] text-gray-700" />
    </div>
    <div className="pl-[4px] pr-[4px]">
      <IsflexChunk text={texts.pickup} className="text-[15px] font-bold leading-[19px] break-all" />
      <IsflexChunk text={texts.run} className="text-[13px] leading-[16px] text-gray-600" />
    </div>
    <div className="pl-[4px] pr-[4px]">
      <IsflexChunk text={texts.dropoff} className="text-[15px] font-bold leading-[19px] break-all" />
    </div>
    <div className="pr-[8px] flex flex-col items-end">
      <IsflexChunk text={texts.fare} className="text-[15px] font-bold leading-[19px] tabular-nums" />
      <IsflexChunk text={texts.payment} className="mt-[2px] px-[3px] border border-[#2f6fd6] rounded-sm text-[11px] leading-[14px] text-[#2f6fd6]" />
    </div>
  </div>
);
