/**
 * 🚚 **픽커 수락 뒤 단계** — 실물 15~31 (기사님 완주 기록 2026-09-02 · 레포에는 글만 · `ex_images/카카오픽커/README.md`)
 * (2026-09-14 · 카카오픽커_시뮬레이터.md §8-2 · 4단계)
 *
 * 픽업 이동(16·18) → 픽업지 아래 창(17) → 배송 이동(21) → 배송지 아래 창(22) → 사진·문자(24~30 · 한 장으로 줄인다) → 완료(31)
 *
 * 원달앱은 화면 글자로 운행 단계를 안다 (`KakaoPickerKeywords.STAGE_WORDS`):
 *   픽업 이동 «픽업 준비» · 픽업지 «밀어서 픽업 완료» · 배송 이동 «배송 시간»·«물품 파손» · 배송지 «밀어서 사진 촬영» · 완료 «물품이 안전하게 전달»
 * 🔴 **한 화면에 다른 단계 글자를 섞지 않는다** — 픽업 이동 화면에도 «배송 N분 남음»이 있다. «배송 시간»은 배송 이동 화면에만 쓴다.
 * 🔴 **아래 창은 위 화면을 덮을 뿐 지우지 않는다** — 실물도 시트가 헤더를 덮고, 원달앱은 가려진 헤더까지 읽는다.
 *    그래서 원달앱은 «밀어서 …»를 먼저 본다 (STAGE_WORDS 순서).
 * 🔴 사진·문자 한 장에는 원달앱이 아는 단계 글자가 없다 — 카메라·문자 앱은 픽커 밖이다 (계획서 §8-2).
 * 🔴 모르는 칸은 안 그린다 — 고객 요청 · 오늘 배송 건수·수익(시뮬레이터가 모른다).
 */
import { useEffect, useRef, useState } from 'react';
import type { PickerCall } from './pickerCall';
import { formatPickerAddressLine } from './pickerCall';
import { formatPickerFare } from './PickerDispatchBoard';

/** 수락 뒤 단계 — 원달앱 `KakaoPickerKeywords.Stage` 와 같은 이름 (`PHOTO` 는 원달앱이 모르는 한 장) */
export type PickerOngoingStep = 'TO_PICKUP' | 'AT_PICKUP' | 'TO_DROPOFF' | 'AT_DROPOFF' | 'PHOTO' | 'DONE';

interface Props {
  call: PickerCall;
  /** 처음 보일 단계 — 배차 화면이 콜마다 기억해 둔다 (내 오더에서 다시 열 때) */
  initialStep?: PickerOngoingStep;
  onStepChange?: (step: PickerOngoingStep) => void;
  /** «←» — 내 오더 목록으로 */
  onBack: () => void;
  /** 완료 화면의 «확인» — 잡은 콜에서 뺀다 */
  onFinish: (call: PickerCall) => void;
}

/**
 * «HH:MM» 까지 **오늘** 남은 분 — 지났으면 0 이하.
 * ⚠️ 상세의 `minutesUntil` 과 **일부러 다르다** — 상세는 수락 전이라 지난 시각을 «다음 날 마감»으로 보지만,
 *    수락 뒤에는 이미 잡은 콜의 마감이라 지났으면 «준비 완료»다 (실물 18 «픽업 준비 완료»).
 */
function minutesLeftToday(hhmm?: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '');
  if (!m) return null;
  const now = new Date();
  const target = new Date(now);
  target.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 60_000);
}

/** 옆으로 밀어서 넘기는 거리 (CSS px) */
const SLIDE_PX = 120;

/**
 * «밀어서 …» — 실물은 밀기 · 시뮬레이터는 **누르기와 밀기 둘 다** 받는다 (계획서 §8-2).
 * 🔴 밀기는 **한 박자 뒤**에 넘긴다 — 손을 뗄 때 «누르기»가 따라오는데, 먼저 넘기면 그 누르기가 새 화면의 같은 자리 버튼을 누른다.
 */
const SlideButton = ({ label, onDone }: { label: string; onDone: () => void }) => {
  const startX = useRef<number | null>(null);
  const swiped = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <button
      className="w-full h-[56px] rounded-full bg-[#2aa69a] text-white text-[18px] font-bold"
      onPointerDown={e => { startX.current = e.clientX; }}
      onPointerUp={e => {
        if (startX.current != null && e.clientX - startX.current > SLIDE_PX) {
          swiped.current = true;
          timer.current = setTimeout(onDone, 0);
        }
        startX.current = null;
      }}
      onClick={() => {
        if (swiped.current) { swiped.current = false; return; }   // 밀기 뒤 따라온 누르기 — 이미 넘겼다
        onDone();
      }}
    >{label}</button>
  );
};

export const PickerOngoingScreen = ({ call, initialStep = 'TO_PICKUP', onStepChange, onBack, onFinish }: Props) => {
  const [step, setStepState] = useState<PickerOngoingStep>(initialStep);
  const [cancelBlocked, setCancelBlocked] = useState(false);
  const setStep = (s: PickerOngoingStep) => { setStepState(s); onStepChange?.(s); };

  const pickup = call.pickupDetails?.[0];
  const dropoff = call.dropoffDetails?.[0];
  const pickupLine = formatPickerAddressLine(pickup?.addressDetail, pickup?.region);
  const dropoffLine = formatPickerAddressLine(dropoff?.addressDetail, dropoff?.region);
  const pickupLeft = minutesLeftToday(call.pickupTime);
  const deliveryLeft = minutesLeftToday(call.deliveryTime);
  const fareP = `${formatPickerFare(call.fare)}P`;

  if (step === 'PHOTO') {
    // 📷 사진·문자 (실물 24~30) — 한 장으로 줄인다 · 원달앱이 아는 단계 글자가 없다
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-[18px] bg-white text-[#1f1f1f] px-6 select-none">
        <div className="text-[20px] font-bold">배송을 완료하셨나요?</div>
        <div className="text-[14px] text-gray-500">인증사진 · 문자 전송은 시뮬레이터에서 생략합니다</div>
        <button className="w-full h-[56px] rounded-lg bg-[#2aa69a] text-white text-[18px] font-bold" onClick={() => setStep('DONE')}>배송 완료</button>
      </div>
    );
  }

  if (step === 'DONE') {
    // ✅ 완료 (실물 31) — 오늘 건수·수익은 시뮬레이터가 모른다 · 안 그린다
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-[12px] bg-white text-[#1f1f1f] px-6 select-none">
        <div className="text-[22px] font-bold">배송 완료</div>
        <div className="text-[28px] font-bold tabular-nums">{fareP}</div>
        <div className="text-[15px] text-gray-600">물품이 안전하게 전달되었습니다</div>
        <button className="mt-[18px] w-full h-[52px] rounded-lg bg-[#3d6de0] text-white text-[17px] font-bold" onClick={() => onFinish(call)}>확인</button>
      </div>
    );
  }

  const toDropoff = step === 'TO_DROPOFF' || step === 'AT_DROPOFF';
  const sheetOpen = step === 'AT_PICKUP' || step === 'AT_DROPOFF';

  return (
    <div className="relative w-full h-full flex flex-col bg-white text-[#1f1f1f] select-none">
      {/* 머리 — 뒤로 · (픽업 이동에만) 배정 취소 (실물 16) */}
      <div className="h-[48px] flex items-center justify-between px-3 border-b border-[#eeeeee] shrink-0">
        <button aria-label="뒤로가기" onClick={onBack} className="w-8 h-8 flex items-center justify-center">
          <div className="w-3 h-3 border-l-2 border-b-2 border-[#333] rotate-45" />
        </button>
        {!toDropoff && <button className="text-[14px] text-gray-600" onClick={() => setCancelBlocked(true)}>배정 취소</button>}
      </div>

      {/* 지도 자리 — 글자를 안 둔다 */}
      <div className="h-[140px] bg-[#e9efe7] shrink-0" />

      {/* 남은 시간 — 단계마다 원달앱이 읽는 글자가 다르다 */}
      <div className="mx-[14px] mt-[12px] rounded-lg bg-[#eef2fb] py-[12px] flex flex-col items-center gap-[4px]">
        {toDropoff ? (
          <>
            {deliveryLeft !== null && <div className="text-[17px] font-bold">{`배송 시간 ${Math.max(0, deliveryLeft)}분 남음`}</div>}
            <div className="text-[13px] text-gray-600">물품 파손/분실을 주의해 이동해주세요</div>
          </>
        ) : (
          <>
            <div className="text-[17px] font-bold">{pickupLeft === null ? '픽업 준비' : pickupLeft > 0 ? `픽업 준비 ${pickupLeft}분 남음` : '픽업 준비 완료'}</div>
            {deliveryLeft !== null && <div className="text-[13px] text-gray-600">{`배송 ${Math.max(0, deliveryLeft)}분 남음`}</div>}
          </>
        )}
      </div>

      {/* 가는 곳 */}
      <div className="px-[14px] pt-[14px] flex flex-col gap-[4px]">
        <div className="text-[13px] text-gray-500">{toDropoff ? '배송지' : '픽업지'}</div>
        <div className="text-[17px] font-bold">{toDropoff ? dropoffLine : pickupLine}</div>
        {(toDropoff ? dropoff : pickup)?.customerName && <div className="text-[14px] text-gray-500">{(toDropoff ? dropoff : pickup)!.customerName}</div>}
      </div>

      {/* 아래 창 올리기 — 창이 열리면 숨긴다 */}
      {!sheetOpen && (
        <div className="absolute left-0 right-0 bottom-0 p-[12px]">
          <button className="w-full h-[52px] rounded-lg border border-[#d0d0d0] text-[16px] font-bold" onClick={() => setStep(step === 'TO_PICKUP' ? 'AT_PICKUP' : 'AT_DROPOFF')}>오더 확인</button>
        </div>
      )}

      {/* 아래에서 올라오는 창 (실물 17 · 22) — 위 화면을 덮을 뿐 지우지 않는다 */}
      {sheetOpen && (
        <div className="absolute left-0 right-0 bottom-0 rounded-t-2xl bg-white shadow-[0_-4px_16px_rgba(0,0,0,0.12)] px-[16px] pt-[16px] pb-[16px] flex flex-col gap-[10px]">
          <div className="text-[15px] font-bold">{`오더 확인 ${call.orderNo}`}</div>
          <div className="flex gap-3 text-[14px]">
            <div className="w-[64px] shrink-0 text-gray-500">배송지</div>
            <div className="font-bold">{dropoffLine}</div>
          </div>
          <div className="flex gap-3 text-[14px]">
            <div className="w-[64px] shrink-0 text-gray-500">배송 물품</div>
            <div className="font-bold">{call.itemSize}</div>
          </div>
          {step === 'AT_PICKUP'
            ? <SlideButton label="밀어서 픽업 완료" onDone={() => setStep('TO_DROPOFF')} />
            : <SlideButton label="밀어서 사진 촬영" onDone={() => setStep('PHOTO')} />}
        </div>
      )}

      {/* 배정 취소 불가 (실물 19) — 픽커는 수락이 곧 계약이다 */}
      {cancelBlocked && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center px-8">
          <div className="w-full rounded-xl bg-white p-[18px] flex flex-col gap-[10px]">
            <div className="text-[17px] font-bold">배정 취소 불가</div>
            {/* ⚠️ 뒷부분은 추정이다 — 실물 19 는 «취소 가능 시간이 초과되어…»까지만 적어 뒀다 · 원달앱은 이 글자를 안 읽는다 */}
            <div className="text-[14px] text-gray-600">취소 가능 시간이 초과되어 배정을 취소할 수 없습니다</div>
            <button className="mt-[6px] h-[44px] rounded-lg bg-[#3d6de0] text-white font-bold" onClick={() => setCancelBlocked(false)}>확인</button>
          </div>
        </div>
      )}
    </div>
  );
};
