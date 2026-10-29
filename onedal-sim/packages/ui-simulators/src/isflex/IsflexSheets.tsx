/**
 * 🧾 **목록 위 시트 둘** — S5 «오더 목록 거리 설정»[실물 05] · S6 «오더 사이즈 설정»[실물 06]
 *
 * 🔴 시트가 떠 있는 동안 뒤 목록은 글자를 하나도 안 준다(실물 05 · 06) — 부르는 쪽(`IsflexSimScreen`)이 뒤 목록에 `aria-hidden` 을 단다.
 * 🔴 S6 견본 줄은 진짜 줄과 같은 부품(`IsflexOrderRow`) · 실물 글자 그대로 — 원달앱이 이 줄을 콜로 읽지 않는지 시험하는 재료.
 * 시뮬은 S6 막대 값을 바꾸지도 저장하지도 않는다 — «저장»은 시트만 닫는다[지어냄].
 * 글자 없는 단추(✕ · 되돌리기)는 빈 `button`. 고른 줄의 ✓ 는 실물에서 글자로 안 온다 → `aria-hidden`.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { ISFLEX_SAMPLE_ROW } from './isflexCall';
import { IsflexOrderRow } from './IsflexOrderRow';
import { ISFLEX_DISTANCE_LIMITS } from './IsflexOrderBoard';

const SheetFrame = ({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) => (
  <div className="absolute inset-0 z-20 flex flex-col justify-end">
    {/* 바깥 어두운 막 — 누르면 닫힌다(실물 touch_outside) */}
    <div className="absolute inset-0 bg-black/50" onClick={onClose} />
    <div className="relative rounded-t-2xl bg-white px-5 pt-5 pb-4 text-[#1f1f1f]">
      <div className="flex items-center">
        <div className="text-[19px] font-bold">{title}</div>
        <button onClick={onClose} className="ml-auto w-6 h-6 rounded-full border-2 border-[#222]" />
      </div>
      {children}
    </div>
  </div>
);

/** S5 오더 목록 거리 설정 — 처음 값 «전체» */
export const IsflexDistanceSheet = ({ value, onSave, onClose }: { value: string; onSave: (label: string) => void; onClose: () => void }) => {
  const [pick, setPick] = useState(value);
  return (
    <SheetFrame title="오더 목록 거리 설정" onClose={onClose}>
      <div className="mt-4">
        {ISFLEX_DISTANCE_LIMITS.map(o => (
          <div key={o.label} onClick={() => setPick(o.label)} className="flex items-center h-[48px] cursor-pointer">
            <div className={`text-[16px] ${pick === o.label ? 'font-bold text-[#1f6fd1]' : ''}`}>{o.label}</div>
            {pick === o.label && <div aria-hidden="true" className="ml-auto text-[#1f6fd1] text-[18px]">✓</div>}
          </div>
        ))}
      </div>
      <button onClick={() => onSave(pick)} className="mt-3 w-full h-[50px] rounded-lg bg-[#0b4ea2] text-white text-[17px] font-bold">저장</button>
    </SheetFrame>
  );
};

/** 막대 하나 — 실물은 설명 «Value, N» 만 준다 */
const SizeBar = ({ title, value }: { title: string; value: number }) => (
  <div className="mt-4">
    <div className="text-[15px]">{title}</div>
    <div className="relative mt-2 h-[24px]">
      <div aria-hidden="true" className="absolute left-0 right-0 top-[11px] h-[2px] bg-gray-300" />
      <div role="slider" aria-label={`Value, ${value}`} className="absolute top-0 w-[24px] h-[24px] rounded-full bg-[#1f6fd1]" style={{ left: `${(value - 1) * 18}%` }} />
    </div>
  </div>
);

/** S6 오더 사이즈 설정 — 견본 줄 · 막대 셋 (값은 실물 06 그대로) */
export const IsflexSizeSheet = ({ onClose }: { onClose: () => void }) => (
  <SheetFrame title="오더 사이즈 설정" onClose={onClose}>
    <div className="mt-3 border border-gray-200 rounded">
      <IsflexOrderRow texts={ISFLEX_SAMPLE_ROW} />
    </div>
    <div className="flex items-center mt-2">
      <div className="flex-1"><SizeBar title="글자 크기 변경" value={1} /></div>
      <button className="ml-3 w-6 h-6 rounded-full border-2 border-gray-400" />
    </div>
    <SizeBar title="상하 여백 크기 변경" value={3} />
    <SizeBar title="좌우 여백 크기 변경" value={5} />
    <button onClick={onClose} className="mt-5 w-full h-[50px] rounded-lg bg-[#0b4ea2] text-white text-[17px] font-bold">저장</button>
  </SheetFrame>
);
