/**
 * 📋 **픽커 리스트** — 실물 캡처 02 · 실물 덤프 `09_리스트_퀵7건.xml` (2026-09-14 · 카카오픽커_시뮬레이터.md §7-2 · §8-1 · 2단계 2-2)
 *
 * 원달앱 픽커 파서(`KakaoPickerParser.kt`)는 **글자와 화면 위치를 함께** 본다:
 *   - 요금 = 쉼표 든 숫자 + 글자 가운데가 **가로 600px 이상** (폰 픽셀)
 *   - 한 카드 = 요금 글자에 **가장 가까운** 글자들 (±60px 안)
 *   - 「리스트 설정」 줄 **아래**의 요금만 리스트 카드 (위는 오더카드)
 *   - 지역 순서는 좌표 정렬(위→왼쪽)에서 나온다: [도착 시(윗줄 오른쪽) · 출발 시 · 출발 동 · 도착 동]
 *
 * 📏 **크기는 실물 덤프를 폰 배율로 나눈 값이다** — 폰 `SM-A245N` 1080px · 밀도 450 → CSS 1px = 폰 2.81px.
 *   카드 163px → **58px** · 태그줄 가운데 카드 위에서 48px → **17px** · 지역줄 112px → **40px** ·
 *   도착 칸 490px → **174px** · 요금 오른쪽 끝 1052px → **오른쪽 10px** · 「리스트 설정」 줄 가운데에서 첫 요금까지 166px → 줄 높이 **60px**.
 *   🔴 눈으로 맞추지 않는다 — 2-3 의 `pickerDumpCheck.mjs`(신설)가 폰 화면 구조로 확인한다.
 *
 * 🔴 **글자 덩어리마다 `div` 하나** — 웹뷰는 `span` 만 담은 줄 하나를 **글자 하나로 뭉쳐** 넘긴다.
 *    2026-09-14 첫 폰 판에서 `퀵준비 완료대형` · `2.0km광주초월읍` · `서포트모드카드설정수요지도` 가 그렇게 왔고,
 *    원달앱은 거리·크기·태그를 못 뽑아 전부 «지역»으로 읽었다 (서버 intel 출발지 «분당 12.3km광주신현»).
 *    카드에 바로 붙은 글자(도착 시·동 · 요금)는 따로 왔다 — 줄 안의 `span` 이 문제였다. 그래서 줄 안 글자를 **블록 요소(div)** 로 둔다.
 *    `pickerDumpCheck.mjs` 검사 ⑥ 이 폰 화면에서 이것을 본다 (픽커는 네이티브 앱이라 실물은 덩어리가 따로 온다).
 */
import React from 'react';
import type { PickerCall } from './pickerCall';
import { formatPickerRegion } from './pickerCall';

interface BoardProps {
  calls: PickerCall[];
  activeTab: 'ALL' | 'CONFIRMED';
  onTabSelect: (tab: 'ALL' | 'CONFIRMED') => void;
  myOrderCount: number;
  onCallClick: (call: PickerCall) => void;
  onMenuClick: () => void;
}

/** 픽업거리 — 1km 미만은 «581m» (0831 실측 · 원달앱 `M_REGEX`) */
export const formatPickerDistance = (km?: number): string => {
  if (km == null) return '';
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
};

/** 요금 «16,870» — 쉼표 필수 · «P»·«원» 을 붙이지 않는다 (원달앱 `FARE_REGEX`) */
export const formatPickerFare = (fare: number): string => fare.toLocaleString('ko-KR');

const TABS = ['퀵 배송', '도보배송', '대리', '한차배송'];
const HEADER_CHIPS = ['리스트 설정', '높은 가격순', '20km'];

/** 한 글자 덩어리 — 빈 글자는 요소를 안 만든다 (빈 노드가 카드에 붙지 않게) */
const Chunk = ({ text, className }: { text: string; className: string }) =>
  text ? <div className={className}>{text}</div> : null;

const PickerCallCard = React.memo(({ call, onCardClick }: { call: PickerCall; onCardClick: (call: PickerCall) => void }) => {
  const from = formatPickerRegion(call.pickupDetails?.[0]?.addressDetail, call.pickupDetails?.[0]?.region);
  const to = formatPickerRegion(call.dropoffDetails?.[0]?.addressDetail, call.dropoffDetails?.[0]?.region);
  const isShort = call.pickerTags.includes('단거리');

  return (
    <div
      className="relative h-[58px] border-b border-[#eeeeee] bg-white active:bg-gray-50 cursor-pointer"
      onClick={() => onCardClick(call)}
    >
      {/* 윗줄 — 퀵 · [단거리] · [준비 N분 | 준비 완료] · 크기 · [예약 시각] (실물 02 순서) */}
      <div className="absolute left-[10px] top-[9px] h-[16px] flex items-center gap-[4px] text-[13px] leading-[16px] whitespace-nowrap">
        <div className="bg-[#e3f6f1] text-[#1aa37a] font-bold px-[3px] rounded-sm">퀵</div>
        {isShort && <div className="bg-[#efe6fb] text-[#8a4fd6] font-bold px-[3px] rounded-sm">단거리</div>}
        {!call.reservedAt && (
          call.prepMinutes === null
            ? <div className="text-[#3d6de0]">준비 완료</div>
            : <div className="text-gray-500">{`준비 ${call.prepMinutes}분`}</div>
        )}
        <div className="text-gray-500">{call.itemSize}</div>
        {call.reservedAt && <div className="border border-gray-300 px-[2px] font-bold text-gray-700">예약</div>}
        {call.reservedAt && <div className="font-bold text-gray-700">{call.reservedAt}</div>}
      </div>
      <Chunk text={to.city} className="absolute left-[174px] top-[9px] text-[13px] leading-[16px] text-gray-500" />

      {/* 아랫줄 — 픽업거리 · 출발 시 · 출발 동 / 도착 동 */}
      <div className="absolute left-[10px] top-[30px] h-[19px] flex items-center gap-[4px] text-[15px] leading-[19px] whitespace-nowrap">
        <Chunk text={formatPickerDistance(call.pickupDistanceKm)} className="font-bold" />
        <Chunk text={from.city} className="text-gray-700" />
        <Chunk text={from.dong} className="font-bold" />
      </div>
      <Chunk text={to.dong} className="absolute left-[174px] top-[30px] text-[15px] leading-[19px] font-bold" />

      {/* 요금 — 오른쪽 끝 · 카드 가운데 높이 */}
      <div className="absolute right-[10px] top-1/2 -translate-y-1/2 text-[21px] leading-[24px] font-bold tabular-nums">
        {formatPickerFare(call.fare)}
      </div>
    </div>
  );
});

export const PickerDispatchBoard = ({ calls, activeTab, onTabSelect, myOrderCount, onCallClick, onMenuClick }: BoardProps) => {
  // 🔴 «높은 가격순» — 머리줄이 그렇게 적혀 있으니 실제로 그 순서로 늘어놓는다
  const sorted = React.useMemo(() => [...calls].sort((a, b) => b.fare - a.fare), [calls]);

  return (
    <div className="relative w-full h-full flex flex-col bg-white text-[#1f1f1f] select-none overflow-x-hidden">
      {/* 머리 — 홈 · 알림 · 메뉴 */}
      <div className="flex items-center justify-between px-4 h-[48px] shrink-0">
        <div className="w-6 h-6 rounded-md border-2 border-[#333]" />
        <div className="flex items-center gap-4">
          <button aria-label="알림" className="w-6 h-6 rounded-full border-2 border-[#333]" />
          <button aria-label="메뉴" onClick={onMenuClick} className="w-6 h-5 border-y-2 border-[#333]" />
        </div>
      </div>

      {/* 배송 종류 탭 */}
      <div className="flex gap-[6px] px-[10px] pb-[10px] shrink-0">
        {TABS.map((t, i) => (
          <div key={t} className={`rounded-full px-3 py-[5px] text-[13px] font-bold whitespace-nowrap border ${i === 0 ? 'border-[#3d6de0] border-2' : 'border-gray-300 text-gray-600'}`}>{t}</div>
        ))}
      </div>

      {/* 서포트 모드 · 오더카드 자리 — 오더카드는 기본 꺼짐 (5단계) */}
      <div className="bg-[#f2f3f5] px-[10px] pt-[8px] pb-[10px] shrink-0">
        <div className="flex justify-center items-center gap-[6px] text-[13px] mb-[8px]">
          <div>퀵 서포트 모드 1장 받기</div>
          <div className="text-[#3d6de0]">0/1건</div>
        </div>
        <div className="rounded-lg bg-[#e8eaf0] h-[56px] flex items-center justify-center text-[16px] font-bold">퀵 오더카드 대기 중...</div>
      </div>

      {/* 🔴 「리스트 설정」 줄 — 오더카드(위)와 리스트 카드(아래)의 경계 · 원달앱이 리스트를 알아보는 글자 */}
      <div className="h-[60px] flex items-center gap-[6px] px-[10px] border-b border-[#e5e5e5] shrink-0">
        {HEADER_CHIPS.map(c => (
          <div key={c} className="bg-[#f5f6f8] rounded px-[10px] py-[5px] text-[13px] text-gray-600 whitespace-nowrap">{c}</div>
        ))}
        <span className="ml-auto w-[22px] h-[22px] rounded-full border border-gray-300" />
      </div>

      {/* 카드 목록 */}
      <div className="relative flex-1 overflow-y-auto pb-[64px]">
        {(activeTab === 'ALL' ? sorted : []).map(call => (
          <PickerCallCard key={call.id} call={call} onCardClick={onCallClick} />
        ))}
      </div>

      {/* 떠 있는 메뉴 — 실물처럼 맨 아래 카드 위에 걸친다 (원달앱은 이 낱말을 버린다 · NOISE_WORDS) */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-[62px] flex items-center gap-[14px] rounded-full bg-[#eef1fb] shadow px-[18px] py-[8px] text-[14px] font-bold whitespace-nowrap">
        <div>서포트모드</div>
        <div>카드설정</div>
        <div>수요지도</div>
      </div>

      {/* 아래 탭 — 신규 / 내 오더 */}
      <div className="flex h-[52px] border-t border-[#e5e5e5] shrink-0 text-[16px] font-bold">
        <button className={`flex-1 ${activeTab === 'ALL' ? 'text-[#3d6de0]' : 'text-gray-500 bg-[#f7f7f7]'}`} onClick={() => onTabSelect('ALL')}>신규</button>
        <button className={`flex-1 ${activeTab === 'CONFIRMED' ? 'text-[#3d6de0]' : 'text-gray-500 bg-[#f7f7f7]'}`} onClick={() => onTabSelect('CONFIRMED')}>
          {myOrderCount > 0 ? `내 오더 ${myOrderCount}` : '내 오더'}
        </button>
      </div>
    </div>
  );
};
