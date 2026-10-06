import type { NetHomeProps } from '../nets';

/**
 * 🏠 **인성 첫 화면 «인성퀵화면분할»** — 실물 캡처 `ex_images/인성/인성홈.png` (reviews/46).
 *
 * 원달앱은 글자로 화면을 가른다 — «인성퀵화면분할»은 배차망을 알아보는 글자(networkPages 인성 networkMarkers)라
 * **한 칸으로** 그린다(웹뷰는 칸 글자를 이어 붙여 «들어 있나»로 본다 · 둘로 쪼개면 안 맞는다).
 * «실행»을 누르면 목록 — 방문 기록에 한 칸 쌓여 목록에서 «뒤로»면 이 화면으로 돌아온다.
 */
export const InsungHomeScreen = ({ onEnter, goSetup }: NetHomeProps) => (
  <div className="relative w-full h-full flex flex-col items-center bg-gradient-to-b from-[#0b3a6e] via-[#1d5c9c] to-[#0b3a6e] text-white select-none px-4 pt-10">
    <div className="text-[22px] font-bold tracking-tight mb-6">인성퀵화면분할</div>

    <div className="w-full flex flex-col gap-2 rounded-lg border border-white/40 bg-white/10 p-2">
      {['인성1,5,6,7그룹', '인성2,3,4그룹'].map(g => (
        <div key={g} className="flex items-center gap-2">
          <div className="w-12 h-12 rounded bg-white/20 flex items-center justify-center text-[28px] text-[#7cd14a]">✔</div>
          <div className="flex-1 h-12 rounded bg-white/20 flex items-center justify-center text-[16px] font-bold">{g}</div>
        </div>
      ))}
    </div>

    <div className="w-full grid grid-cols-2 gap-2 mt-3 rounded-lg border border-white/40 bg-white/10 p-2 text-[15px] font-bold">
      <button onClick={onEnter} className="h-10 rounded bg-white/20">실행</button>
      <button onClick={goSetup} className="h-10 rounded bg-white/20">설정</button>
      <button className="h-10 rounded bg-white/20">5:5</button>
      <button onClick={goSetup} className="h-10 rounded bg-white/20">종료</button>
    </div>

    <button className="mt-8 self-start rounded border border-white/60 bg-white/90 px-4 py-2 text-[15px] font-bold text-[#d32f2f]">원격지원요청</button>
    <div className="absolute bottom-3 right-4 text-[12px] font-bold opacity-80">INSUNG DATA</div>
  </div>
);
