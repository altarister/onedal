/**
 * 📋 **픽커 리스트** — 실물 캡처 02 · 실물 화면 덤프 09
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
 *   🔴 눈으로 맞추지 않는다 — `scripts/pickerDumpCheck.mjs` 가 폰 화면 구조로 확인한다.
 *
 * 🔴 **글자 덩어리마다 `div` 하나** — 웹뷰는 `span` 만 담은 줄 하나를 **글자 하나로 뭉쳐** 넘긴다.
 *    `span` 줄로 두면 `퀵준비 완료대형` · `2.0km광주초월읍` · `서포트모드카드설정수요지도` 처럼 붙어 오고,
 *    원달앱은 거리·크기·태그를 못 뽑아 전부 «지역»으로 읽는다 (서버 intel 출발지가 «분당 12.3km광주신현» 꼴이 된다).
 *    카드에 바로 붙은 글자(도착 시·동 · 요금)는 따로 온다 — 줄 안의 `span` 이 문제다. 그래서 줄 안 글자를 **블록 요소(div)** 로 둔다.
 *    `pickerDumpCheck.mjs` 검사 ⑥ 이 폰 화면에서 이것을 본다 (픽커는 네이티브 앱이라 실물은 덩어리가 따로 온다).
 */
import React from 'react';
import type { PickerCall, PickerKind } from './pickerCall';
import { formatPickerRegion, formatPickerAddressLine, minutesLeftToday, pickerKindOf, pickerTagChipClass } from './pickerCall';
import type { PickerOngoingStep } from './PickerOngoingScreen';

interface BoardProps {
  calls: PickerCall[];
  activeTab: 'ALL' | 'CONFIRMED';
  onTabSelect: (tab: 'ALL' | 'CONFIRMED') => void;
  myOrderCount: number;
  /** «내 오더» 탭에 보일 잡은 콜 (실물 15) */
  myOrders?: PickerCall[];
  /** 잡은 콜이 지금 어느 단계인가 — 카드 머리가 «픽업 준비» · «배송 시간»으로 갈린다 (배차 화면이 콜마다 기억한다) */
  stepOf?: (callId: string) => PickerOngoingStep | undefined;
  /** 신규 탭 카드 — 수락 전 상세로 (오래 떠 있던 콜은 남이 가져갔다 — 부르는 쪽이 가린다) */
  onCallClick: (call: PickerCall) => void;
  /**
   * «내 오더» 탭 카드 — **인성 리스트의 «완료» 탭과 같다**: 내가 수락한 콜이라 누르면 그 콜의 운행(픽업 이동)이 바로 열린다.
   * 🔴 신규 카드 누르기(`onCallClick`)를 같이 쓰지 않는다 — «남이 가져갔다» 토스트가 내 콜을 막는다. 안 주면 `onCallClick`.
   */
  onMyOrderClick?: (call: PickerCall) => void;
  onMenuClick: () => void;
}

/** 픽업거리 — 1km 미만은 «581m» (실물 실측 · 원달앱 `M_REGEX`) */
export const formatPickerDistance = (km?: number): string => {
  if (km == null) return '';
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
};

/** 요금 «16,870» — 쉼표 필수 · «P»·«원» 을 붙이지 않는다 (원달앱 `FARE_REGEX`) */
export const formatPickerFare = (fare: number): string => fare.toLocaleString('ko-KR');

/** 카드 한 장 높이 (CSS px) — 실물 덤프 09 의 카드 간격 163px ÷ 폰 배율 2.81 */
export const PICKER_CARD_HEIGHT = 58;

/**
 * 🪟 **스크롤 칸 안에 온전히 보이는 카드 범위** `[first, last)`.
 *
 * 🔴 웹뷰는 스크롤 칸이 가린 카드도 **제 위치 그대로** 원달앱에 넘기고, 화면 끝을 넘은 카드는 **높이 0 으로 한 줄에 겹쳐** 넘긴다.
 *    그러면 화면 밖 카드들이 한 줄로 와 원달앱이 «퀵 퀵 퀵 …» 카드 한 장으로 묶고,
 *    탭 바 뒤에 숨은 카드는 탭 글자(«신규» · «내 오더»)와 붙어 서버 출발지가 «신규 내 오더 강남» 꼴이 된다.
 *    실물 픽커는 목록 앱이라 **보이는 카드만** 넘긴다 — 그래서 시뮬레이터도 보이는 카드만 그린다.
 * 반쯤 가린 맨 아래 카드는 **안 그린다** (실물은 가린 부분을 잘라 넘기지만 웹뷰는 자르지 않는다 — 온전한 카드만이 안전하다).
 * 칸 높이를 모르면(`viewportHeight` 0 — 서버 렌더·검사) 전부 그린다.
 */
export function visibleCardRange(scrollTop: number, viewportHeight: number, count: number, cardHeight = PICKER_CARD_HEIGHT): [number, number] {
  if (viewportHeight <= 0) return [0, count];
  const first = Math.min(count, Math.ceil(scrollTop / cardHeight));
  const last = Math.min(count, Math.max(first, Math.floor((scrollTop + viewportHeight) / cardHeight)));
  return [first, last];
}

const TABS = ['퀵 배송', '도보배송', '대리', '한차배송'];
/** 누르면 그 종류 콜만 보이는 탭 — 대리 · 한차배송은 시뮬레이터에 콜이 없어 누를 수 없다 */
const TAB_KIND: Partial<Record<string, PickerKind>> = { '퀵 배송': '퀵', '도보배송': '도보' };
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
        <div className={`${pickerTagChipClass(pickerKindOf(call))} font-bold px-[3px] rounded-sm`}>{pickerKindOf(call)}</div>
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

/**
 * 📦 **«내 오더» 한 줄** (실물 15) — 누르면 수락 뒤 단계로.
 * 🔴 **요금을 «쉼표 든 숫자» 덩어리로 쓰지 않는다** — 원달앱이 그 모양을 리스트 카드 요금으로 알아보므로, 잡은 콜을 새 카드로 다시 읽는다. «P» 를 붙인다.
 */
const MyOrderRow = ({ call, step, onClick }: { call: PickerCall; step?: PickerOngoingStep; onClick: (call: PickerCall) => void }) => {
  const kind = pickerKindOf(call);
  const delivering = !!step && step !== 'OVERVIEW' && step !== 'DEPART' && step !== 'TO_PICKUP' && step !== 'AT_PICKUP';
  const pickupLeft = minutesLeftToday(call.pickupTime);
  const deliveryLeft = minutesLeftToday(call.deliveryTime);
  const place = delivering ? call.dropoffDetails?.[0] : call.pickupDetails?.[0];
  const dropoff = call.dropoffDetails?.[0];
  /**
   * 카드 모양이 배송 종류마다 다르다 (실물 15-2):
   * - 🚶 도보 — 픽업 전 «픽업 준비 N분 남음» · 픽업 뒤 보라 «배송 N분 남음» · 가게 이름 · 배송지 주소
   *   🔴 «배송 시간»을 쓰지 않는다 — 실물 카드에 없고, 원달앱이 배송 중 단계 글자로 읽는다
   * - 🚚 퀵 — «HH:MM까지»(픽업 마감) · 픽업 동 이름 · 배송지 동 이름 · 물품 크기
   *   ⚠️ 픽업 뒤 모양은 사진이 없다 — 배송 마감 «HH:MM까지» · 배송 동 이름으로 추정
   */
  const head = kind === '도보'
    ? (delivering
      ? (deliveryLeft === null ? '' : `배송 ${Math.max(0, deliveryLeft)}분 남음`)
      : (pickupLeft === null ? '픽업 준비' : pickupLeft > 0 ? `픽업 준비 ${pickupLeft}분 남음` : '픽업 준비 완료'))
    : (() => { const at = delivering ? call.deliveryTime : call.pickupTime; return at ? `${at}까지` : ''; })();
  const placeName = kind === '도보'
    ? (place?.customerName ?? formatPickerAddressLine(place?.addressDetail, place?.region))
    : (place?.region ?? formatPickerAddressLine(place?.addressDetail, place?.region));
  return (
    <div data-my-order={kind} className="mx-[12px] mt-[12px] rounded-xl bg-white px-[16px] py-[14px] flex flex-col gap-[6px] shadow-sm active:bg-gray-50 cursor-pointer" onClick={() => onClick(call)}>
      <div className="flex items-start justify-between gap-2">
        {head && <div className="text-[17px] font-bold" style={kind === '도보' && delivering ? { color: '#7646d6' } : undefined}>{head}</div>}
        {/* 오른쪽 위 배송 종류 딱지 — 퀵 녹색 · 도보 보라 */}
        <div className={`shrink-0 ml-auto rounded px-2 py-[2px] text-[13px] font-bold ${pickerTagChipClass(kind)}`}>{kind}</div>
      </div>
      <div className="flex items-center gap-2">
        <div className="rounded px-2 py-[2px] text-[13px] font-bold text-white" style={{ background: delivering ? '#7646d6' : '#4a74db' }}>{delivering ? '배송' : '픽업'}</div>
        <div className="text-[18px] font-bold">{placeName}</div>
      </div>
      {!delivering && (
        <div className="text-[14px] text-gray-500">
          {`배송지: ${kind === '도보' ? formatPickerAddressLine(dropoff?.addressDetail, dropoff?.region) : (dropoff?.region ?? '')}`}
        </div>
      )}
      {kind === '퀵' && <div className="text-[14px] text-gray-500">{call.itemSize}</div>}
    </div>
  );
};

export const PickerDispatchBoard = ({ calls, activeTab, onTabSelect, myOrderCount, myOrders = [], stepOf, onCallClick, onMyOrderClick, onMenuClick }: BoardProps) => {
  // 🔴 «높은 가격순» — 머리줄이 그렇게 적혀 있으니 실제로 그 순서로 늘어놓는다
  const sorted = React.useMemo(() => [...calls].sort((a, b) => b.fare - a.fare), [calls]);

  // 🪟 보이는 카드만 — 스크롤 칸의 높이·위치를 재어 둔다 (visibleCardRange 머리 주석)
  const listRef = React.useRef<HTMLDivElement>(null);
  const [view, setView] = React.useState({ top: 0, height: 0 });
  React.useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => setView({ top: el.scrollTop, height: el.clientHeight });
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => { el.removeEventListener('scroll', measure); window.removeEventListener('resize', measure); };
  }, []);
  /** 신규 리스트의 배송 종류 탭 — 처음엔 «퀵 배송» (차로 일하는 기사님의 탭) */
  const [kindTab, setKindTab] = React.useState<PickerKind>('퀵');
  const kindCalls = React.useMemo(() => sorted.filter(c => pickerKindOf(c) === kindTab), [sorted, kindTab]);
  const shown = activeTab === 'ALL' ? kindCalls : [];
  /** «내 오더» 탭 (실물 15) — 머리 «목록 | 지도» · 배송 종류 탭 · 서포트 모드 · 오더카드가 없다 */
  const mine = activeTab === 'CONFIRMED';
  const [first, last] = visibleCardRange(view.top, view.height, shown.length);

  return (
    <div className="relative w-full h-full flex flex-col bg-white text-[#1f1f1f] select-none overflow-x-hidden">
      {/* 머리 — 홈 · (내 오더 탭에만) «목록 | 지도» · 알림 · 메뉴 (실물 02 · 15) */}
      <div className="relative flex items-center justify-between px-4 h-[48px] shrink-0 bg-white">
        <div className="w-6 h-6 rounded-md border-2 border-[#333]" />
        {mine && (
          <div className="absolute left-1/2 -translate-x-1/2 flex rounded-full bg-[#f2f3f5] p-[3px] text-[15px]">
            <div className="rounded-full bg-white px-[18px] py-[4px] font-bold">목록</div>
            <div className="px-[18px] py-[4px] text-gray-500">지도</div>
          </div>
        )}
        <div className="flex items-center gap-4">
          <button aria-label="알림" className="w-6 h-6 rounded-full border-2 border-[#333]" />
          <button aria-label="메뉴" onClick={onMenuClick} className="w-6 h-5 border-y-2 border-[#333]" />
        </div>
      </div>

      {!mine && (<>
      {/* 배송 종류 탭 */}
      <div className="flex gap-[6px] px-[10px] pb-[10px] shrink-0">
        {TABS.map(t => {
          const kind = TAB_KIND[t];
          const look = `rounded-full px-3 py-[5px] text-[13px] font-bold whitespace-nowrap border ${kind === kindTab ? 'border-[#3d6de0] border-2' : 'border-gray-300 text-gray-600'}`;
          return kind
            ? <button key={t} onClick={() => setKindTab(kind)} className={look}>{t}</button>
            : <div key={t} className={look}>{t}</div>;
        })}
      </div>

      {/* 서포트 모드 · 오더카드 자리 — 오더카드는 기본 꺼짐 */}
      <div className="bg-[#f2f3f5] px-[10px] pt-[8px] pb-[10px] shrink-0">
        <div className="flex justify-center items-center gap-[6px] text-[13px] mb-[8px]">
          <div>퀵 서포트 모드 1장 받기</div>
          <div className="text-[#3d6de0]">0/1건</div>
        </div>
        <div className="rounded-lg bg-[#e8eaf0] h-[56px] flex items-center justify-center text-[16px] font-bold">퀵 오더카드 대기 중...</div>
      </div>
      </>)}

      {/* 🔴 「리스트 설정」 줄 — 오더카드(위)와 리스트 카드(아래)의 경계 · 원달앱이 리스트를 알아보는 글자
          «내 오더» 탭에는 두지 않는다 — 있으면 원달앱이 잡은 콜 목록을 리스트로 읽고 새 콜처럼 알람을 울린다 */}
      {activeTab === 'ALL' && (
        <div className="h-[60px] flex items-center gap-[6px] px-[10px] border-b border-[#e5e5e5] shrink-0">
          {HEADER_CHIPS.map(c => (
            <div key={c} className="bg-[#f5f6f8] rounded px-[10px] py-[5px] text-[13px] text-gray-600 whitespace-nowrap">{c}</div>
          ))}
          <span className="ml-auto w-[22px] h-[22px] rounded-full border border-gray-300" />
        </div>
      )}

      {/* 카드 목록 */}
      <div ref={listRef} className={`relative flex-1 overflow-y-auto ${mine ? 'bg-[#f2f3f5]' : ''}`}>
        {mine ? (
          <>
            {myOrders.map(call => <MyOrderRow key={call.id} call={call} step={stepOf?.(call.id)} onClick={onMyOrderClick ?? onCallClick} />)}
            {/* 실물 15 — 카드 아래 «한차배송 신청내역 보기» (시뮬레이터에서는 아무 일도 안 한다) */}
            <div className="mx-[24px] mt-[14px] h-[48px] rounded bg-white flex items-center justify-center text-[15px] font-bold">한차배송 신청내역 보기</div>
          </>
        ) : (
          <>
            {/* 안 보이는 카드 자리는 글자 없는 빈 칸 — 스크롤 길이는 그대로 둔다 */}
            <div style={{ height: first * PICKER_CARD_HEIGHT }} />
            {shown.slice(first, last).map(call => (
              <PickerCallCard key={call.id} call={call} onCardClick={onCallClick} />
            ))}
            <div style={{ height: (shown.length - last) * PICKER_CARD_HEIGHT }} />
          </>
        )}
      </div>

      {/* 떠 있는 메뉴 — 실물처럼 맨 아래 카드 위에 걸친다 (원달앱은 이 낱말을 버린다 · NOISE_WORDS) */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-[62px] flex items-center gap-[14px] rounded-full bg-[#eef1fb] shadow px-[18px] py-[8px] text-[14px] font-bold whitespace-nowrap">
        {!mine && <div>서포트모드</div>}
        <div>카드설정</div>
        {!mine && <div>수요지도</div>}
      </div>

      {/* 아래 탭 — 신규 / 내 오더 */}
      <div className="flex h-[52px] border-t border-[#e5e5e5] shrink-0 text-[16px] font-bold">
        <button className={`flex-1 ${activeTab === 'ALL' ? 'text-[#3d6de0]' : 'text-gray-500 bg-[#f7f7f7]'}`} onClick={() => onTabSelect('ALL')}>신규</button>
        <button className={`flex-1 ${activeTab === 'CONFIRMED' ? 'text-[#3d6de0]' : 'text-gray-500 bg-[#f7f7f7]'}`} onClick={() => onTabSelect('CONFIRMED')}>
          <div className="flex items-center justify-center gap-[6px]">
            <div>내 오더</div>
            {/* 실물 15 — 파란 동그라미 숫자 */}
            {myOrderCount > 0 && <div className="min-w-[22px] h-[22px] px-[6px] rounded-full bg-[#3d6de0] text-white text-[13px] flex items-center justify-center">{myOrderCount}</div>}
          </div>
        </button>
      </div>
    </div>
  );
};
