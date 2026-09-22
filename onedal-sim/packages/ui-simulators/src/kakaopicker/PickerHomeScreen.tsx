/**
 * 🏠 **픽커 홈 (출근 전)** — 실물 캡처 01 · 실물 덤프 `01_홈.xml` (카카오픽커_시뮬레이터.md §8-1 · 2단계 2-2)
 *
 * 원달앱은 **「시작하기」 버튼**으로 홈을 알아본다 (`KakaoPickerKeywords.STAGE_WORDS` · 기사님 확정 2026-09-02).
 * 🔴 미션 문구 «퀵 1건 배송완료하고» 를 **실물 그대로** 둔다 — 원달앱은 홈을 먼저 봐서 이 글자가 «배송 단계»로
 *    잘못 읽히지 않게 했다. 시뮬레이터가 이 글자를 빼면 그 순서를 시험하지 못한다.
 * 글자 덩어리마다 요소 하나 — 픽커는 네이티브 앱이라 덩어리가 따로 온다 (§7-2).
 */
interface Props {
  onStart: () => void;
  onMenuClick: () => void;
}

const MISSIONS = [1, 3, 5];

export const PickerHomeScreen = ({ onStart, onMenuClick }: Props) => (
  <div className="relative w-full h-full flex flex-col bg-[#f2f3f5] text-[#1f1f1f] select-none">
    {/* 머리 — 로고 · 알림 · 메뉴 */}
    <div className="flex items-center justify-between px-4 h-[56px] shrink-0">
      <div className="w-7 h-7 rounded-full bg-[#ffc400]" />
      <div className="flex items-center gap-4">
        <button aria-label="알림" className="w-6 h-6 rounded-full border-2 border-[#333]" />
        <button aria-label="메뉴" onClick={onMenuClick} className="w-6 h-5 border-y-2 border-[#333]" />
      </div>
    </div>

    <div className="flex-1 overflow-y-auto px-3 pb-[90px] flex flex-col gap-2">
      <div className="rounded-xl bg-[#e9ebef] px-4 py-4">
        <div className="text-[15px] font-bold">최대 1000원 프로모션 진행</div>
      </div>

      <div className="rounded-xl bg-white px-4 py-3 flex items-center gap-2">
        <span className="border border-gray-300 rounded px-1 text-[11px] text-gray-600">공통</span>
        <span className="flex-1 truncate text-[13px]">카카오 T 픽커 및 퀵/도보배송 이용 약관 개정 안내</span>
        <span className="text-[12px] text-gray-400">더보기</span>
      </div>

      <div className="rounded-xl bg-white px-4 py-4">
        <div className="flex items-center mb-2">
          <span className="text-[19px] font-bold">미션</span>
          <span className="ml-1 text-[19px] font-bold text-[#4a74da]">{MISSIONS.length}</span>
          <span className="ml-auto text-[12px] text-gray-400">더보기</span>
        </div>
        {MISSIONS.map(n => (
          <div key={n} className="py-1.5">
            <div className="text-[15px] font-bold">퀵 {n}건 배송완료하고</div>
            <div className="text-[13px] text-gray-500">서포트 모드 1장 받기</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-white px-4 py-4">
        <div className="text-[19px] font-bold">이런 일거리 어떤가요?</div>
      </div>
    </div>

    {/* 🔴 「시작하기」 — 원달앱이 홈을 알아보는 단 하나의 글자 */}
    <button
      onClick={onStart}
      className="absolute left-0 right-0 bottom-0 h-[80px] bg-[#4a74da] text-white text-[22px] font-bold"
    >
      시작하기
    </button>
  </div>
);
