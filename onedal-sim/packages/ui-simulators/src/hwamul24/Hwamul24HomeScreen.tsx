import type { NetHomeProps } from '../nets';

/**
 * 🏠 **화물24시 첫 화면 «전국24시콜화물» 메인 홈** — 실물 캡처 `ex_images/화물24시/01_메인_홈화면.png` (reviews/46).
 *
 * 원달앱은 «전국24시콜화물»(networkPages 화물24시 홈 · networkMarkers)로 이 화면을 알아본다 — 한 칸으로 그린다.
 * «화물정보»(가운데 칸 · 아래 탭)를 누르면 목록 — 방문 기록에 한 칸 쌓여 목록에서 «뒤로»면 이 화면으로 돌아온다.
 * 🔴 «화물정보» 글자는 목록 머리에도 있다 — 홈을 가르는 것은 «전국24시콜화물»이다(목록에는 «자동새로고침»).
 */
const TILES: { label: string; enter?: boolean }[] = [
  { label: '화물정보', enter: true }, { label: '배차내역' }, { label: '화물등록' }, { label: '음성등록' },
];
const SMALL = ['스마트배차', '협력업체', '고객센터'];
const COLORED = [
  { label: '공지사항', bg: 'bg-[#1fa3b8]' }, { label: '가상계좌', bg: 'bg-[#8bc34a]' }, { label: '차량조회', bg: 'bg-[#f4b400]' },
];

export const Hwamul24HomeScreen = ({ onEnter, goSetup }: NetHomeProps) => (
  <div className="relative w-full h-full flex flex-col bg-[#3a3f47] text-white select-none">
    <div className="flex items-center justify-between bg-[#d32f2f] px-3 h-[52px] shrink-0">
      <div className="text-[18px] font-bold">전국24시콜화물</div>
      <div className="flex items-center gap-2">
        <button className="rounded bg-white/90 px-2 py-1 text-[13px] font-bold text-[#d32f2f]">주요공지</button>
        <button onClick={goSetup} aria-label="종료" className="w-8 h-8 rounded bg-white/90 text-[#d32f2f] font-bold">⏻</button>
      </div>
    </div>
    <div className="flex justify-between bg-white px-3 py-1.5 text-[13px] text-black">
      <span>위치 : <b className="text-[#d32f2f]">인천/미추홀구</b></span>
      <span>잔액 : <b>10,000원</b></span>
    </div>
    <div className="px-3 py-2 text-center text-[12px]">정보망서비스 이용약관 <span className="text-[#ff8a80]">위반시 사용정지</span> 됩니다.</div>

    <div className="flex-1 overflow-y-auto px-3 pb-[70px] flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        {TILES.map(t => (
          <button key={t.label} onClick={t.enter ? onEnter : undefined}
            className="h-24 rounded-lg bg-white text-black text-[22px] font-bold">{t.label}</button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {SMALL.map(l => <button key={l} className="h-16 rounded-lg bg-white text-black text-[14px] font-bold">{l}</button>)}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {COLORED.map(c => <button key={c.label} className={`h-16 rounded-lg ${c.bg} text-black text-[14px] font-bold`}>{c.label}</button>)}
      </div>
      <div className="self-center mt-1 rounded-full bg-black/30 px-3 py-1 text-[12px]">개인정보처리방침</div>
    </div>

    <div className="absolute bottom-0 inset-x-0 h-[56px] grid grid-cols-4 bg-[#2b2f35] text-[12px]">
      <button className="flex flex-col items-center justify-center">홈</button>
      <button onClick={onEnter} className="flex flex-col items-center justify-center">화물정보</button>
      <button className="flex flex-col items-center justify-center">마이페이지</button>
      <button className="flex flex-col items-center justify-center">환경설정</button>
    </div>
  </div>
);
