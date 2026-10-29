/**
 * 📋 **인성플렉스 목록 화면** — 머리 · «목록 | 지도» · «신규 | 진행중» 탭 · 띠 · 칩 · 칸 머리 · 줄 목록
 *
 * - S2 «신규» 탭 [실물 02 · 07] — 줄은 «출발지까지» 가까운 순(실물 07) · 칩과 거리 설정으로 거른다[추정] · 보이는 줄만 그린다
 * - S3 «지도» 보기 [실물 03] — 탭 · 칩 · 칸 머리가 없다 · 지도는 설명(«Google 지도» · «지도 마커»)만 · 지명 글자 없음
 * - S4 «진행중» 탭 빈 상태 [실물 04] — «진행중인 오더가 없습니다»뿐(띠 · 칩 · 칸 머리 없음)
 * - S14 «진행중» 탭 한 건 [지어냄] — 🔴 칸 머리(«출발지까지» · «수입») · 칩 · 띠 · 거리 칸을 넣지 않는다.
 *   넣으면 원달앱이 이 화면을 신규 목록으로 읽어 상세 → 진행중 넘어감을 손 수락으로 못 알아본다. 🔴 «완료» 글자 금지(인성 «완료 탭» 표식)
 *
 * 🔴 «목록 | 지도» · «신규 | 진행중» · 칩은 고른 표시를 색으로만 한다 — 실물은 고른 상태를 글자로 안 준다(`role="tab"` · `aria-selected` 안 씀).
 * 🔴 글자 없는 아이콘(편지 · 사람 · 깔때기 · 넓히기 · 현위치)은 빈 `button` — `aria-label` 안 붙임.
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { visibleRowRange } from '@altari/core-simulator';
import type { IsflexCall, IsflexVehicleKind } from './isflexCall';
import { ISFLEX_VEHICLE_KINDS, isflexDropoffLabel, isflexFare, isflexPickupLabel, isflexRowTexts } from './isflexCall';
import { IsflexChunk, IsflexOrderRow, ISFLEX_ROW_HEIGHT } from './IsflexOrderRow';

/** 칩 — «전체» + 차종 넷 [실물 02] */
export type IsflexChip = '전체' | IsflexVehicleKind;
export const ISFLEX_CHIPS: IsflexChip[] = ['전체', ...ISFLEX_VEHICLE_KINDS];

/** 거리 설정 시트의 고를 것 [실물 05] — 값은 km(전체는 제한 없음) */
export const ISFLEX_DISTANCE_LIMITS: Array<{ label: string; km: number | null }> = [
  { label: '전체', km: null },
  { label: '500m 이내', km: 0.5 },
  { label: '1km 이내', km: 1 },
  { label: '3km 이내', km: 3 },
  { label: '5km 이내', km: 5 },
  { label: '10km 이내', km: 10 },
];

/** 신규 목록에 보일 줄 — 칩 · 거리로 거르고 «출발지까지» 가까운 순 */
export function isflexShownCalls(calls: IsflexCall[], chip: IsflexChip, limitKm: number | null): IsflexCall[] {
  return calls
    .filter(c => chip === '전체' || c.vehicleKind === chip)
    .filter(c => limitKm == null || (c.pickupDistanceKm ?? Infinity) <= limitKm)
    .slice()
    .sort((a, b) => (a.pickupDistanceKm ?? Infinity) - (b.pickupDistanceKm ?? Infinity));
}

/** 머리 줄 — S2 · S3 · S4 · S14 가 함께 쓴다 */
export const IsflexHeader = ({ mapMode, onMapMode, onMessage, onMy }: {
  mapMode: boolean; onMapMode: (map: boolean) => void; onMessage: () => void; onMy: () => void;
}) => (
  <div className="relative flex items-center px-3 h-[48px] shrink-0 bg-white">
    <button className="text-[15px] font-bold">퇴근하기</button>
    <div className="absolute left-1/2 -translate-x-1/2 flex rounded-full bg-[#eceef1] p-[3px] text-[14px]">
      <div onClick={() => onMapMode(false)} className={`cursor-pointer rounded-full px-[14px] py-[3px] ${mapMode ? 'text-gray-500' : 'bg-[#444] text-white font-bold'}`}>목록</div>
      <div onClick={() => onMapMode(true)} className={`cursor-pointer rounded-full px-[14px] py-[3px] ${mapMode ? 'bg-[#444] text-white font-bold' : 'text-gray-500'}`}>지도</div>
    </div>
    <div className="ml-auto flex items-center gap-4">
      <button onClick={onMessage} className="w-6 h-[18px] rounded-sm bg-[#222]" />
      <button onClick={onMy} className="w-6 h-6 rounded-full bg-[#222]" />
    </div>
  </div>
);

interface Props {
  calls: IsflexCall[];
  myOrders: IsflexCall[];
  activeTab: 'ALL' | 'CONFIRMED';
  onTabSelect: (tab: 'ALL' | 'CONFIRMED') => void;
  onCallClick: (call: IsflexCall) => void;
  onMyOrderClick: (call: IsflexCall) => void;
  mapMode: boolean;
  onMapMode: (map: boolean) => void;
  chip: IsflexChip;
  onChip: (chip: IsflexChip) => void;
  /** 거리 설정 값(km · null = 전체) */
  limitKm: number | null;
  onDistanceSheet: () => void;
  onSizeSheet: () => void;
  onMessage: () => void;
  onMy: () => void;
}

export const IsflexOrderBoard = (p: Props) => {
  const listRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, height: 0 });
  const listShown = !p.mapMode && p.activeTab === 'ALL';
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => setView({ top: el.scrollTop, height: el.clientHeight });
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => { el.removeEventListener('scroll', measure); window.removeEventListener('resize', measure); };
  }, [listShown]);

  const shown = useMemo(() => isflexShownCalls(p.calls, p.chip, p.limitKm), [p.calls, p.chip, p.limitKm]);
  const [first, last] = visibleRowRange(view.top, view.height, shown.length, ISFLEX_ROW_HEIGHT);
  const header = <IsflexHeader mapMode={p.mapMode} onMapMode={p.onMapMode} onMessage={p.onMessage} onMy={p.onMy} />;

  /* S3 지도 보기 — 탭 · 칩 · 칸 머리 없음 [실물 03] */
  if (p.mapMode) {
    return (
      <div className="relative w-full h-full flex flex-col bg-white text-[#1f1f1f] select-none overflow-hidden">
        {header}
        <div role="img" aria-label="Google 지도" className="relative flex-1 bg-[#e8eef3] cursor-pointer">
          {shown.map((c, i) => (
            <div key={c.id} role="img" aria-label="지도 마커"
              className="absolute w-[26px] h-[26px] rounded-full bg-[#1f6fd1] border-2 border-white shadow"
              style={{ left: `${15 + ((i * 37) % 70)}%`, top: `${15 + ((i * 53) % 65)}%` }} />
          ))}
          <button className="absolute right-3 bottom-3 w-10 h-10 rounded-full bg-white shadow" />
        </div>
      </div>
    );
  }

  const tabs = (
    <div className="flex h-[40px] shrink-0 border-b border-[#e5e5e5] text-[16px]">
      <div onClick={() => p.onTabSelect('ALL')} className={`flex-1 flex items-center justify-center cursor-pointer ${p.activeTab === 'ALL' ? 'text-[#1f6fd1] font-bold border-b-2 border-[#1f6fd1]' : 'text-gray-400'}`}>신규</div>
      <div onClick={() => p.onTabSelect('CONFIRMED')} className={`flex-1 flex items-center justify-center cursor-pointer ${p.activeTab === 'CONFIRMED' ? 'text-[#1f6fd1] font-bold border-b-2 border-[#1f6fd1]' : 'text-gray-400'}`}>진행중</div>
    </div>
  );

  /* S4 · S14 진행중 탭 */
  if (p.activeTab === 'CONFIRMED') {
    return (
      <div className="relative w-full h-full flex flex-col bg-white text-[#1f1f1f] select-none overflow-hidden">
        {header}
        {tabs}
        <div className="flex-1 overflow-y-auto bg-[#f5f6f8]">
          {p.myOrders.length === 0
            ? <div className="pt-[45%] text-center text-[15px] text-gray-500">진행중인 오더가 없습니다</div>
            : p.myOrders.map(c => (
              <div key={c.id} onClick={() => p.onMyOrderClick(c)} className="mx-3 mt-3 rounded-lg bg-white px-4 py-3 cursor-pointer">
                <div className="text-[13px] font-bold text-[#1f6fd1]">진행중</div>
                <div className="mt-1 text-[16px] font-bold">{isflexPickupLabel(c)}</div>
                <div className="text-[16px] font-bold">{isflexDropoffLabel(c)}</div>
                <div className="mt-1 flex items-center justify-end gap-2">
                  <IsflexChunk text={c.paymentType} className="px-[3px] border border-[#2f6fd6] rounded-sm text-[11px] text-[#2f6fd6]" />
                  <div className="text-[16px] font-bold tabular-nums">{isflexFare(c.fare)}</div>
                </div>
              </div>
            ))}
        </div>
      </div>
    );
  }

  /* S2 신규 탭 */
  return (
    <div className="relative w-full h-full flex flex-col bg-white text-[#1f1f1f] select-none overflow-hidden">
      {header}
      {tabs}
      {/* 띠 — 목록을 조금이라도 밀면 사라진다 [실물 07] */}
      {view.top === 0 && (
        <div className="h-[64px] shrink-0 bg-[#f2f3f5] flex flex-col items-center justify-center">
          <div className="text-[16px] font-bold">AI 배차 대기중</div>
          <div aria-hidden="true" className="mt-1 flex gap-1"><i className="w-[6px] h-[6px] rounded-full bg-gray-300" /><i className="w-[6px] h-[6px] rounded-full bg-gray-300" /><i className="w-[6px] h-[6px] rounded-full bg-gray-500" /></div>
        </div>
      )}
      {/* 칩 · 깔때기 · 넓히기 */}
      <div className="flex items-center gap-[6px] px-[10px] py-[8px] shrink-0">
        <div className="flex gap-[6px] overflow-x-auto">
          {ISFLEX_CHIPS.map(c => (
            <div key={c} onClick={() => p.onChip(c)}
              className={`cursor-pointer whitespace-nowrap rounded-lg border px-3 py-[6px] text-[13px] ${p.chip === c ? 'bg-[#0b4ea2] border-[#0b4ea2] text-white font-bold' : 'border-gray-300'}`}>{c}</div>
          ))}
        </div>
        <button onClick={p.onDistanceSheet} className="shrink-0 w-[22px] h-[22px] border-2 border-[#222] rounded-sm" />
        <button onClick={p.onSizeSheet} className="shrink-0 w-[22px] h-[22px] border-2 border-[#222]" />
      </div>
      {/* 칸 머리 */}
      <div className="grid grid-cols-[23%_27%_27%_23%] items-center h-[44px] shrink-0 bg-[#f2f3f5] text-[12px] text-gray-600">
        <div className="pl-[6px] leading-[15px] whitespace-pre-line">{'출발지까지\n(km)'}</div>
        <div className="pl-[4px]">출발지</div>
        <div className="pl-[4px]">도착지</div>
        <div className="pr-[8px] text-right">수입</div>
      </div>
      {/* 줄 — 안 보이는 줄 자리는 글자 없는 빈 칸(스크롤 길이는 그대로) */}
      <div ref={listRef} className="relative flex-1 overflow-y-auto">
        <div style={{ height: first * ISFLEX_ROW_HEIGHT }} />
        {shown.slice(first, last).map(c => <IsflexOrderRow key={c.id} texts={isflexRowTexts(c)} onClick={() => p.onCallClick(c)} />)}
        <div style={{ height: (shown.length - last) * ISFLEX_ROW_HEIGHT }} />
      </div>
    </div>
  );
};
