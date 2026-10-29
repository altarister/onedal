/**
 * 🏠 **인성플렉스 홈(출근 전)** — 실물 01 · 01_2 (파란 머리 · 흰 카드 · «출근하기» 진파랑 큰 단추)
 *
 * 원달앱은 «출근하기» + «현재 선택된 배송 수단»으로 홈을 알아본다(정의 표 `networkPages.isflex.ts` 홈 줄 · 표식).
 * 🔴 «시작하기» 글자를 쓰지 않는다(픽커 홈 표식).
 * 🔴 실물은 편지 · 사람 아이콘에 글자도 설명도 없다 — `aria-label` 을 붙이지 않는다(붙이면 실물에 없는 글자가 생긴다).
 *    홈은 배차 화면(`SimNet.Home`)이 그려 메뉴 화면으로 넘어가는 길이 없다 — 두 아이콘은 눌러도 아무 일 없다.
 * 공지 띠는 실물처럼 제목이 돌아가며 바뀐다(간격 8초는 지어냄) — 원달앱이 이 글자에 기대지 않는지 보는 재료다.
 * «출근하기»를 누르면 목록 — 방문 기록에 한 칸 쌓여 원달앱 «뒤로»가 목록 → 홈으로 돈다.
 */
import { useEffect, useState } from 'react';
import type { NetHomeProps } from '../nets';

/** 공지 띠 제목 둘 [실물 01 xml · 01 사진] — 처음 제목은 실물 01 xml 과 같다 */
const NOTICE_TITLES = ['[퀵서비스협회x안전보건공단 교육 이수 인증 이벤트]', '운행취소 패널티 시행 안내'];
const NOTICE_TURN_MS = 8_000;

export const IsflexHomeScreen = ({ onEnter }: NetHomeProps) => {
  const [turn, setTurn] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTurn(n => n + 1), NOTICE_TURN_MS);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative w-full h-full flex flex-col bg-[#1f6fd1] text-[#1f1f1f] select-none overflow-hidden">
      {/* 머리 — 편지 · 사람 (글자 없음) */}
      <div className="flex justify-end items-center gap-4 px-4 h-[48px] shrink-0">
        <button className="w-6 h-[18px] rounded-sm bg-white" />
        <button className="w-6 h-6 rounded-full bg-white" />
      </div>

      <div className="flex-1 overflow-y-auto px-[14px] flex flex-col gap-3">
        {/* 공지 띠 */}
        <div className="rounded-lg bg-white/20 px-3 py-[9px] text-white text-[14px] truncate cursor-pointer">
          <div className="truncate">{NOTICE_TITLES[turn % NOTICE_TITLES.length]}</div>
        </div>

        {/* 배너 — 그림은 글자로 안 온다 · «2» · «4» · «모두보기» */}
        <div className="relative rounded-lg bg-[#dbe9fb] h-[74px] cursor-pointer">
          <div aria-hidden="true" className="absolute left-3 top-3 text-[20px] font-black text-[#1f6fd1]">AI배차</div>
          <div className="absolute right-3 bottom-2 flex items-center gap-[2px] rounded-full bg-black/40 px-2 text-white text-[11px]">
            <div>2</div>
            <div aria-hidden="true">/</div>
            <div>4</div>
            <div className="ml-1">모두보기</div>
          </div>
        </div>

        {/* 카드 */}
        <div className="rounded-2xl bg-white px-5 py-5">
          <div className="text-[22px] font-bold mb-2">퀵서비스</div>
          <div className="text-[14px] leading-[22px] text-gray-700 whitespace-pre-line">{'도보 배송부터 화물 배송까지\n내 근처 오더를 간편하게 수행해보세요!'}</div>
          <div className="mt-5 rounded-lg bg-[#f5f6f8] px-4 py-3">
            <div className="text-[12px] text-gray-500">현재 선택된 배송 수단</div>
            <div className="mt-1 flex items-center gap-2">
              <div className="text-[15px] font-bold">승용/소형</div>
              <button className="rounded-full border border-gray-300 bg-white px-3 py-[2px] text-[12px]">변경</button>
            </div>
          </div>
          <button onClick={onEnter} className="mt-5 w-full h-[48px] rounded-lg bg-[#0b4ea2] text-white text-[17px] font-bold">출근하기</button>
        </div>
      </div>

      {/* 바닥 — 회사 이름(접힘 틀) · 개인정보 처리방침 */}
      <div className="bg-[#f2f3f5] px-4 py-3 shrink-0 text-[12px] text-gray-600">
        <div className="cursor-pointer">로지웨이(주)</div>
        <div className="mt-2 underline cursor-pointer">개인정보 처리방침</div>
      </div>
    </div>
  );
};
