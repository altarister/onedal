/**
 * 📄 **인성플렉스 상세(확정 전)** — 실물 08~12 (위 지도 · 칸 · 아래 «닫기» 검정 · «…원 수행하기» 파랑)
 *
 * 원달앱은 «총 수입» + «수행하기»로 이 화면을 알아본다(정의 표 상세 줄 · 표식). 상세 칸은 **바로 앞 제목 글자**와 짝 지어 읽는다.
 * - 🔴 칸마다 `div` 하나 · DOM 차례 = 실물 xml 차례. 출발 주소가 한 줄을 넘으면(18자 초과 [추정 — 실물 08 13자 한 줄 · 10 27자 두 줄])
 *   «약 N km»가 주소보다 먼저 온다(실물 10) — 그래서 DOM 차례도 바꾼다
 * - 🔴 전화 · 상호 · 상차 시각 칸이 없다(실물 08~12)
 * - 🔴 적요 견본에 «요금» 낱말 금지(`isflexCall.ts`) — 인성 상세 표식 «적요상세» + «요금»과 겹친다
 * - 지도에는 설명(«Google 지도» · «지도 마커»)만 — «출발» · «도착» 핀 글자는 `aria-hidden`
 * - 머리 제목은 눈으로만 자른다(`truncate`) — 글자는 끝까지
 * - «…원 수행하기»는 곧 계약이다 — 원달앱은 어떤 모드에서도 누르지 않는다. 누르면 무엇이 되는지는 `IsflexSimScreen` 이 정한다
 */
import type { IsflexCall } from './isflexCall';
import {
  isflexAcceptLabel, isflexDetailKm, isflexDropoffPoint, isflexFareWon, isflexPickupPoint, isflexRunKm, isflexTitle,
} from './isflexCall';
import { IsflexChunk } from './IsflexOrderRow';

/** 이 글자 수를 넘으면 출발 주소가 두 줄이 된다고 본다 [추정] */
const ONE_LINE_CHARS = 18;

interface Props {
  call: IsflexCall;
  onClose: () => void;
  onAccept: () => void;
}

export const IsflexCallDetailScreen = ({ call, onClose, onAccept }: Props) => {
  const pickupPoint = isflexPickupPoint(call);
  const twoLines = pickupPoint.length > ONE_LINE_CHARS;
  const run = <div className="text-[12px] text-gray-500 pl-[2px]">{isflexRunKm(call.distanceKm)}</div>;
  const pickup = <div className="text-[16px] font-bold leading-[22px] break-all">{pickupPoint}</div>;

  return (
    <div className="relative w-full h-full flex flex-col bg-white text-[#1f1f1f] select-none overflow-hidden">
      {/* 머리 — ← · 제목 */}
      <div className="flex items-center h-[48px] px-3 shrink-0">
        <button onClick={onClose} className="w-6 h-6 border-l-2 border-b-2 border-[#222] rotate-45" />
        <div className="flex-1 min-w-0 px-3 text-center text-[17px] font-bold truncate">{isflexTitle(call)}</div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 지도 — 설명만 */}
        <div role="img" aria-label="Google 지도" className="relative h-[190px] bg-[#e8eef3]">
          <div role="img" aria-label="지도 마커" className="absolute left-[20%] top-[18%] w-[30px] h-[30px] rounded-full bg-[#e53935]"><div aria-hidden="true" className="text-white text-[10px] text-center leading-[30px]">출발</div></div>
          <div role="img" aria-label="지도 마커" className="absolute left-[28%] top-[12%] w-[30px] h-[30px] rounded-full bg-[#333]"><div aria-hidden="true" className="text-white text-[10px] text-center leading-[30px]">도착</div></div>
          <div role="img" aria-label="지도 마커" className="absolute right-[18%] bottom-[10%] w-[18px] h-[18px] rounded-full bg-[#1f6fd1] border-2 border-white" />
          <button className="absolute right-3 bottom-3 w-9 h-9 rounded-full bg-white shadow" />
        </div>

        {/* 첫 줄 — 출발지까지 · km · 차종 · [꼬리표] (구분선은 테두리) */}
        <div className="flex items-center gap-2 px-4 h-[44px] border-b border-gray-100 text-[14px]">
          <div className="whitespace-pre">{'출발지까지 '}</div>
          <div className="font-bold -ml-2">{isflexDetailKm(call.pickupDistanceKm)}</div>
          <div className="pl-2 border-l border-gray-300">{call.vehicleWord}</div>
          {call.tags.map(t => <div key={t} className="pl-2 border-l border-gray-300 text-[#e53935] font-bold">{t}</div>)}
        </div>

        {/* 출발 · 도착 */}
        <div className="px-6 pt-5 grid grid-cols-[52px_1fr] gap-y-2">
          <div className="text-[15px] text-gray-600">출발</div>
          {twoLines ? <div>{run}{pickup}</div> : <div>{pickup}{run}</div>}
          <div className="text-[15px] text-gray-600">도착</div>
          <div className="text-[16px] font-bold leading-[22px] break-all">{isflexDropoffPoint(call)}</div>
        </div>

        {/* 적요 · 결제 */}
        <div className="px-6 pt-4 grid grid-cols-[70px_1fr] gap-y-2 text-[14px]">
          <div className="text-gray-500">적요상세</div>
          <div className="break-all">{call.memo}</div>
          <div />
          <div><IsflexChunk text={call.paymentType} className="inline-block px-[4px] border border-[#e53935] rounded-sm text-[12px] text-[#e53935]" /></div>
        </div>

        {/* 총 수입 */}
        <div className="mx-4 mt-6 mb-4 rounded-xl bg-[#f5f6f8] px-5 py-4 flex items-center">
          <div className="text-[17px] font-bold text-[#0b4ea2]">총 수입</div>
          <div aria-hidden="true" className="ml-auto mr-1 text-[#0b4ea2] font-bold">₩</div>
          <div className="text-[18px] font-bold">{isflexFareWon(call.fare)}</div>
        </div>
      </div>

      {/* 아래 단추 — 닫기 · …원 수행하기 */}
      <div className="flex gap-2 px-3 pb-3 pt-2 shrink-0">
        <button onClick={onClose} className="w-[30%] h-[72px] rounded-xl bg-[#333] text-white text-[18px] font-bold">닫기</button>
        <button onClick={onAccept} className="flex-1 h-[72px] rounded-xl bg-[#0b5cad] text-white text-[17px] font-bold leading-[24px] whitespace-pre-line">{isflexAcceptLabel(call.fare)}</button>
      </div>
    </div>
  );
};
