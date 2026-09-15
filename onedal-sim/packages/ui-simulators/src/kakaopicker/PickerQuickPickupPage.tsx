/**
 * 🚚 **퀵 — 흰 페이지** — 실물 17-1 «픽업 출발» · 17-2 «픽업 이동» · 22-1 «배송» (카카오픽커_시뮬레이터.md §8-2)
 *
 * 퀵과 도보는 잡은 뒤 **루틴은 같고 페이지가 다르다** — 도보는 지도 위 시트 + «밀어서 …»(16~22), 퀵은 흰 페이지 + 바닥 버튼:
 *   17-1 «픽업 출발» ─「픽업 출발하기」→ 17-2 «픽업 이동» ─「픽업 완료하기」→ 22-1 «배송» ─「배송 완료하기」→ 인증사진 촬영 …
 *   색도 단계를 따른다 — 픽업은 파랑, 배송은 보라 (22-1 «배송 완료해주세요» · «배송 완료하기»)
 *   ⚠️ 22-1 뒤(사진 · 문자 · 완료)는 사진이 없어 도보와 같은 페이지를 쓴다 (`PickerOngoingScreen`) — 사진이 생기면 따로 만든다
 *
 * 📜 **원달앱이 읽는 글자는 실물 로그에 맞춘다** — `log/1dal-주행로그-20260913/폰로그/A24_logcat_전체_1000-1210.log` 11:55:15 · 11:56:24~35
 *   (`1DAL_PICKER ❓ [모르는 화면]`). 실물 17-1 에서 원달앱이 받은 순서:
 *   픽업지 정보 · 주소 · «픽업지 주소 복사하기» · 가게 · «픽업지에 전화하기» · 도착지 정보 · … · «도착지에 전화하기» ·
 *   픽업 장소 · 매장 직원에게 문의 · 오더번호 · 물품 정보 · … · 최종 수익 · 배송비 · 프로모션 · 오더 수행 팁 · 고객센터 연결 · **끝에** 뒤로가기 · 배정 취소 · 픽업 출발하기
 * - 🔴 **머리(지연 · «지금 바로 출발해 주세요» · 마감 · 딱지)와 «길안내»는 실물에서 안 읽힌다** — `aria-hidden` 으로 웹뷰가 넘기지 않게 한다.
 *   화면에는 보인다. 원달앱이 머리 글자로 단계를 알아볼 수 있다고 믿으면 실물에서 틀린다
 * - 🔴 위 «뒤로가기 · 배정 취소»와 바닥 버튼은 **코드 순서상 맨 뒤** — 화면 위치(`absolute`)와 읽히는 순서가 다르다 (실물도 끝에 읽힌다)
 * - 🔴 글자 덩어리마다 `div` 하나 (웹뷰가 `span` 줄을 뭉친다 · `PickerDispatchBoard` 머리 주석)
 * - ⚠️ 추정: 늦지 않았을 때 픽업 머리(«픽업 N분 남음») · 17-2 · 22-1 의 읽히는 글자(로그가 없다 — 17-1 과 같게 둔다) ·
 *   배송이 늦었을 때의 머리 · 픽업 장소 «매장 직원에게 문의»(17-2 는 «직접 전달»)
 * - 🔴 모르는 칸은 안 그린다 — 오더 코드(DJYZ914 꼴) · 메뉴 · 고객사 주문번호 · 물품 설명 딱지(«전자제품이에요») · 접수자 이름
 */
import type { PickerCall } from './pickerCall';
import { minutesLeftToday, PICKER_ITEM_SPEC, pickerTagChipClass } from './pickerCall';
import { formatPickerDistance, formatPickerFare } from './PickerDispatchBoard';

/** 퀵 흰 페이지의 단계 — 17-1 · 17-2 · 22-1 */
export type PickerQuickPhase = 'DEPART' | 'TO_PICKUP' | 'TO_DROPOFF';

interface Props {
  call: PickerCall;
  phase: PickerQuickPhase;
  onDepart: () => void;
  onPickedUp: () => void;
  onDelivered: () => void;
  onBack: () => void;
  /** 17-1 오른쪽 위 «배정 취소» */
  onCancel: () => void;
}

const LATE_RED = '#c8364f';
const PICKUP_BLUE = '#4a74db';
const DROPOFF_PURPLE = '#7646d6';
const DONE_GRAY = '#b5b5b5';
const HEADER_PX = 52;
const BOTTOM_PX = 64;

export const PickerQuickPickupPage = ({ call, phase, onDepart, onPickedUp, onDelivered, onBack, onCancel }: Props) => {
  const delivering = phase === 'TO_DROPOFF';
  const left = minutesLeftToday(call.pickupTime);
  /** 픽업 마감이 지난 분 — 안 지났으면 null */
  const late = !delivering && left !== null && left < 0 ? -left : null;
  const red = late !== null ? { color: LATE_RED } : undefined;
  const purple = { color: DROPOFF_PURPLE };
  const dropoff = call.dropoffDetails?.[0];
  const places = [
    { detail: call.pickupDetails?.[0], dot: delivering ? DONE_GRAY : PICKUP_BLUE, name: '픽업지' },
    { detail: dropoff, dot: delivering ? DROPOFF_PURPLE : DONE_GRAY, name: '도착지' },
  ];
  const spec = delivering ? PICKER_ITEM_SPEC[call.itemSize] : undefined;
  const action = {
    DEPART: { label: '픽업 출발하기', color: PICKUP_BLUE, onClick: onDepart },
    TO_PICKUP: { label: '픽업 완료하기', color: PICKUP_BLUE, onClick: onPickedUp },
    TO_DROPOFF: { label: '배송 완료하기', color: DROPOFF_PURPLE, onClick: onDelivered },
  }[phase];

  return (
    <div className="relative w-full h-full bg-white text-[#1f1f1f] select-none">
      <div className="absolute inset-0 overflow-y-auto" style={{ paddingTop: HEADER_PX, paddingBottom: BOTTOM_PX + 12 }}>
        {/* 머리 — 딱지 · 무엇을 할 차례인가 · 마감 | 거리. 🔴 실물에서 원달앱이 못 읽는다 (A24 로그) */}
        <div aria-hidden="true" className="px-[16px] pt-[10px] pb-[14px] border-b-8 border-[#f2f3f5]">
          <div className="flex justify-end gap-[4px] text-[13px]">
            {call.pickerTags.map(t => <div key={t} className={`font-bold px-[4px] rounded-sm ${pickerTagChipClass(t)}`}>{t}</div>)}
          </div>
          {phase === 'DEPART' && (
            <>
              {late !== null
                ? <div className="text-[22px] font-bold" style={red}>{`픽업 ${late}분 지연 중 (픽업 준비 완료)`}</div>
                : left !== null && <div className="text-[22px] font-bold">{`픽업 ${left}분 남음`}</div>}
              <div className="text-[22px] font-bold" style={red}>지금 바로 출발해 주세요</div>
            </>
          )}
          {phase === 'TO_PICKUP' && (
            late !== null
              ? <div className="text-[24px] font-bold" style={red}>픽업이 지연되고 있어요</div>
              : left !== null && <div className="text-[24px] font-bold">{`픽업 ${left}분 남음`}</div>
          )}
          {delivering && <div className="text-[24px] font-bold" style={purple}>배송 완료해주세요</div>}
          <div className="mt-[6px] flex items-center gap-[6px] text-[14px]">
            {delivering
              ? call.deliveryTime && <div style={purple}>{`${call.deliveryTime}까지 배송완료`}</div>
              : phase === 'TO_PICKUP' && late !== null
                ? <div style={red}>{`${late}분 지연`}</div>
                : call.pickupTime && <div style={red}>{`${call.pickupTime}까지 픽업완료`}</div>}
            <div className="text-gray-300">|</div>
            {delivering
              ? <div className="text-gray-600">{`배송지 ${call.distanceKm.toFixed(1)}km`}</div>
              : <div className="text-gray-600">{`픽업지 ${formatPickerDistance(call.pickupDistanceKm)}`}</div>}
          </div>
        </div>

        {/* 픽업지 · 도착지 — «○○ 정보»는 화면에 안 보이고 원달앱에만 읽힌다 · 복사 · 전화 버튼 이름도 실물 로그 그대로 */}
        <div className="px-[16px] py-[14px] flex flex-col gap-[16px]">
          {places.map(({ detail, dot, name }) => (
            <div key={name} className="flex gap-3 items-start">
              <div className="mt-[9px] w-[8px] h-[8px] rounded-full shrink-0" style={{ background: dot }} />
              <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
                <div className="sr-only">{`${name} 정보`}</div>
                <div className="flex items-center gap-2">
                  {detail?.addressDetail && <div className="text-[18px] font-bold">{detail.addressDetail}</div>}
                  <button aria-label={`${name} 주소 복사하기`} className="shrink-0 border border-gray-300 px-[5px] text-[12px] text-gray-500">복사</button>
                </div>
                {detail?.region && <div className="text-[15px] text-gray-500">{detail.region}</div>}
                {detail?.customerName && <div className="text-[15px] text-gray-600">{detail.customerName}</div>}
              </div>
              <button aria-label={`${name}에 전화하기`} className="w-11 h-11 rounded-full bg-[#f0f0f0] shrink-0" />
            </div>
          ))}
        </div>

        {/* 픽업 장소 · 오더번호 — 픽업까지만 (실물 로그에서 한 칸에 이어 읽힌다 · 22-1 에는 안 보인다) */}
        {!delivering && (
          <div className="mx-[16px] mb-[10px] rounded-lg bg-[#f5f6f8] px-[14px] py-[12px] flex flex-col gap-[8px] text-[14px]">
            <div className="flex gap-3">
              <div className="w-[64px] shrink-0 text-gray-500">픽업 장소</div>
              <div className="font-bold">매장 직원에게 문의</div>
            </div>
            <div className="flex gap-3">
              <div className="w-[64px] shrink-0 text-gray-500">오더번호</div>
              <div className="font-bold tabular-nums">{call.orderNo}</div>
            </div>
          </div>
        )}

        {/* 물품 정보 (22-1 은 규격까지) · 유의사항 (22-1) */}
        <div className="mx-[16px] rounded-lg bg-[#f5f6f8] px-[14px] py-[12px] flex flex-col gap-[10px] text-[14px]">
          <div className="flex gap-3">
            <div className="w-[64px] shrink-0 text-gray-500">물품 정보</div>
            <div className="flex flex-wrap items-baseline gap-x-[6px]">
              <div className="font-bold">{call.itemSize}</div>
              {spec && <div className="text-gray-600">{spec}</div>}
            </div>
          </div>
          {delivering && dropoff?.memo && (
            <div className="flex gap-3">
              <div className="w-[64px] shrink-0 text-gray-500">유의사항</div>
              <div>{dropoff.memo}</div>
            </div>
          )}
        </div>

        {/* 수익 — 17-1 로그 · 22-1 사진은 «최종 수익», 17-2 사진은 «총 수익» */}
        <div className="mx-[16px] mt-[10px] rounded-lg bg-[#f2f3f5] px-[14px] py-[12px] flex flex-col gap-[8px]">
          <div className="flex items-center justify-between">
            <div className="text-[18px] font-bold">{phase === 'TO_PICKUP' ? '총 수익' : '최종 수익'}</div>
            <div className="flex items-center gap-[6px]">
              <div className="text-[22px] font-bold tabular-nums">{formatPickerFare(call.fare)}</div>
              <div aria-hidden="true" className="w-[22px] h-[22px] rounded-full bg-[#ffc400] text-[12px] font-bold text-[#8a5a00] flex items-center justify-center">P</div>
            </div>
          </div>
          <div className="flex justify-between text-[14px] text-gray-500"><div>배송비</div><div>{`${formatPickerFare(call.deliveryFee)}P`}</div></div>
          {call.promotion > 0 && <div className="flex justify-between text-[14px] text-gray-500"><div>프로모션</div><div>{`${formatPickerFare(call.promotion)}P`}</div></div>}
        </div>

        {/* 실물 로그 끝자락 — 시뮬레이터에서는 아무 일도 안 한다 */}
        <div className="mx-[16px] mt-[14px] flex flex-col gap-[8px] text-[14px] text-gray-600">
          <div>오더 수행 팁</div>
          <div>고객센터 연결</div>
        </div>
      </div>

      {/* 위 — 뒤로가기 · (17-1) 배정 취소. 🔴 코드 순서는 맨 뒤 — 실물도 끝에 읽힌다 */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-3 bg-white border-b border-[#eeeeee]" style={{ height: HEADER_PX }}>
        <button aria-label="뒤로가기" onClick={onBack} className="w-9 h-9 flex items-center justify-center">
          <div className="w-3 h-3 border-l-2 border-b-2 border-[#333] rotate-45" />
        </button>
        {phase === 'DEPART' && <button onClick={onCancel} className="px-2 text-[15px] text-gray-600">배정 취소</button>}
      </div>

      {/* 바닥 — 길안내(🔴 실물에서 안 읽힌다 · 시뮬레이터에서는 아무 일도 안 한다) · 단계 버튼 (픽업 파랑 · 배송 보라) */}
      <div className="absolute inset-x-0 bottom-0 flex text-white font-bold" style={{ height: BOTTOM_PX }}>
        <button aria-hidden="true" tabIndex={-1} className="w-[34%] bg-[#56585c] text-[17px]">길안내</button>
        <button className="flex-1 text-[20px]" style={{ background: action.color }} onClick={action.onClick}>{action.label}</button>
      </div>
    </div>
  );
};
