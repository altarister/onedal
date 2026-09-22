/**
 * 🚚 **픽커 수락 뒤 단계** — 실물 `ex_images/카카오픽커/실물_2026/` 16~31
 *
 * 실물 순서 — 모양은 달라도 **단계와 버튼 순서는 같다** (기사님: «이미지와 같지는 않아도 단계는 같아야»):
 *   수락 → 내 오더 탭(15 · `PickerDispatchBoard`) ─카드→ 픽업 이동(16) ─아래 창 끌어 올리기→ «밀어서 픽업 완료»(17) → 배송 중(21) ─끌어 올리기→ «밀어서 사진 촬영»(22)
 *   → 인증사진 촬영(25) → 촬영 확인 · «문자 전송»(26) → «문자 전송 후 배송 완료버튼을 눌러주세요» · «배송 완료»(30)
 *   → 배송 완료 · «오더 목록 보기»(31)
 * 문자 앱 고르기 · 문자 쓰기(27~29)는 픽커 밖 화면이라 건너뛴다.
 *
 * 원달앱은 화면 글자로 운행 단계를 안다 (`KakaoPickerKeywords.STAGE_WORDS`):
 *   픽업 이동 «픽업 준비»·«픽업지 근처에» · 픽업지 «밀어서 픽업 완료» · 배송 중 «배송 시간»·«물품 파손» · 배송지 «밀어서 사진 촬영» · 완료 «물품이 안전하게 전달»
 * 🔴 **한 화면에 다른 단계 글자를 섞지 않는다** — 픽업 이동 화면의 «배송 N분 남음»에 «배송 시간»을 쓰지 않는다.
 * 🔴 **«밀어서 …»는 창을 올려야 그린다** — 실물도 시트를 끌어 올려야 나온다. 먼저 그리면 원달앱이 창을 올리기 전부터 «도착»으로 읽는다.
 * 🔴 사진 · 촬영 확인 · 문자 전송에는 원달앱이 아는 단계 글자가 없다.
 * 🔴 모르는 칸은 안 그린다 — 고객 요청 · 오늘 배송 건수·수익(시뮬레이터가 모른다).
 */
import { useEffect, useRef, useState } from 'react';
import type { PickerCall } from './pickerCall';
import { formatPickerAddressLine, minutesLeftToday, pickerKindOf } from './pickerCall';
import { formatPickerFare } from './PickerDispatchBoard';
import { PickerMapBackdrop, usePickerSheetDrag } from './PickerMapSheet';
import { PickerQuickPickupPage } from './PickerQuickPickupPage';

/**
 * 수락 뒤 단계 — 원달앱 `KakaoPickerKeywords.Stage` 와 같은 이름
 * (`OVERVIEW` · `DEPART` · `PHOTO` · `PHOTO_CHECK` · `SMS` 는 원달앱이 모르는 화면).
 * `DEPART` · `DROPOFF_DEPART` 는 퀵만 거친다 — 실물 17-1 «픽업 출발» · 22-1 «배송 출발» (도보는 바로 `TO_PICKUP` · `TO_DROPOFF`)
 */
export type PickerOngoingStep = 'OVERVIEW' | 'DEPART' | 'TO_PICKUP' | 'AT_PICKUP' | 'DROPOFF_DEPART' | 'TO_DROPOFF' | 'AT_DROPOFF' | 'PHOTO' | 'PHOTO_CHECK' | 'SMS' | 'DONE';

interface Props {
  call: PickerCall;
  /** 처음 보일 단계 — 배차 화면이 콜마다 기억해 둔다 (내 오더에서 다시 열 때) */
  initialStep?: PickerOngoingStep;
  onStepChange?: (step: PickerOngoingStep) => void;
  /** «←» — 내 오더 목록으로 */
  onBack: () => void;
  /** 완료 화면의 «오더 목록 보기» — 잡은 콜에서 뺀다 */
  onFinish: (call: PickerCall) => void;
}

/** 옆으로 밀어서 넘기는 거리 (CSS px) */
const SLIDE_PX = 120;
/** 아래 창을 이만큼 끌어 올리면(스크롤) 창이 올라온다 (CSS px) */
const SHEET_PULL_PX = 24;
/** 시트 «중» 윗변 — 지도가 위 절반쯤 보인다 (실물 16 · 18 · 21) */
const SHEET_MID_TOP_PCT = 52;
/** 시트 «상» 윗변 — 지도가 맨 위 한 줄만 남는다 (실물 17 · 22) */
const SHEET_HIGH_TOP = '28px';

/**
 * «밀어서 …» — 실물은 밀기 · 시뮬레이터는 **누르기와 밀기 둘 다** 받는다.
 * 🔴 밀기는 **한 박자 뒤**에 넘긴다 — 손을 뗄 때 «누르기»가 따라오는데, 먼저 넘기면 그 누르기가 새 화면의 같은 자리 버튼을 누른다.
 */
const SlideButton = ({ label, color, onDone }: { label: string; color: string; onDone: () => void }) => {
  const startX = useRef<number | null>(null);
  const swiped = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <button
      className="w-full h-[58px] rounded-lg text-white text-[19px] font-bold shrink-0"
      style={{ background: color }}
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

const BackButton = ({ onClick }: { onClick: () => void }) => (
  <button aria-label="뒤로가기" onClick={onClick} className="w-9 h-9 flex items-center justify-center">
    <div className="w-3 h-3 border-l-2 border-b-2 border-[#333] rotate-45" />
  </button>
);

const PICKUP_BLUE = '#4a74db';
const DROPOFF_PURPLE = '#7646d6';

export const PickerOngoingScreen = ({ call, initialStep = 'TO_PICKUP', onStepChange, onBack, onFinish }: Props) => {
  const [step, setStepState] = useState<PickerOngoingStep>(initialStep);
  const [cancelBlocked, setCancelBlocked] = useState(false);
  const setStep = (s: PickerOngoingStep) => { setStepState(s); onStepChange?.(s); };
  const toDropoff = step === 'TO_DROPOFF' || step === 'AT_DROPOFF';
  /** 아래 창이 올라왔나 (실물 17 · 22) — 올라와야 «밀어서 …»가 보인다 */
  const raised = step === 'AT_PICKUP' || step === 'AT_DROPOFF';
  const raise = () => setStep(toDropoff ? 'AT_DROPOFF' : 'AT_PICKUP');
  const lower = () => setStep(toDropoff ? 'TO_DROPOFF' : 'TO_PICKUP');
  /* 훅이라 아래의 화면별 return 보다 먼저 부른다 */
  const { dragHandlers, onTap } = usePickerSheetDrag(dir => (dir > 0 ? raise() : lower()));

  const pickup = call.pickupDetails?.[0];
  const dropoff = call.dropoffDetails?.[0];
  const pickupLine = formatPickerAddressLine(pickup?.addressDetail, pickup?.region);
  const dropoffLine = formatPickerAddressLine(dropoff?.addressDetail, dropoff?.region);
  const pickupLeft = minutesLeftToday(call.pickupTime);
  const deliveryLeft = minutesLeftToday(call.deliveryTime);
  const fareP = `${formatPickerFare(call.fare)}P`;

  /* 배정 취소 불가 (실물 19) — 픽커는 수락이 곧 계약이다. 퀵 17-1 의 «배정 취소»도 같은 팝업을 쓴다 (⚠️ 퀵은 추정) */
  const cancelPopup = cancelBlocked && (
    <div className="absolute inset-0 bg-black/40 flex items-center justify-center px-8">
      <div className="w-full rounded-xl bg-white p-[18px] flex flex-col gap-[10px]">
        <div className="text-[17px] font-bold">배정 취소 불가</div>
        {/* ⚠️ 뒷부분은 추정이다 — 실물 19 는 «취소 가능 시간이 초과되어…»까지만 적어 뒀다 · 원달앱은 이 글자를 안 읽는다 */}
        <div className="text-[14px] text-gray-600">취소 가능 시간이 초과되어 배정을 취소할 수 없습니다</div>
        <button className="mt-[6px] h-[44px] rounded-lg bg-[#3d6de0] text-white font-bold" onClick={() => setCancelBlocked(false)}>확인</button>
      </div>
    </div>
  );

  /* 🚚 퀵은 픽업 · 배송 모두 흰 페이지 (실물 17-1 · 17-2 · 22-1) — 도보의 지도 위 시트와 **다른 페이지**다. 루틴(단계)은 같다.
     22-1 「배송 완료하기」 뒤(사진 · 문자 · 완료)는 사진이 없어 아래 도보와 같은 페이지를 쓴다 (추정) */
  const quickPhase = pickerKindOf(call) !== '퀵' ? null
    : step === 'DEPART' ? 'DEPART'
    : step === 'TO_PICKUP' || step === 'AT_PICKUP' ? 'TO_PICKUP'
    : step === 'DROPOFF_DEPART' ? 'DROPOFF_DEPART'
    : step === 'TO_DROPOFF' || step === 'AT_DROPOFF' ? 'TO_DROPOFF'
    : null;
  if (quickPhase) {
    return (
      <div className="relative w-full h-full">
        <PickerQuickPickupPage
          call={call}
          phase={quickPhase}
          onDepart={() => setStep('TO_PICKUP')}
          onPickedUp={() => setStep('DROPOFF_DEPART')}
          onDropoffDepart={() => setStep('TO_DROPOFF')}
          onDelivered={() => setStep('PHOTO')}
          onBack={onBack}
          onCancel={() => setCancelBlocked(true)}
        />
        {cancelPopup}
      </div>
    );
  }

  if (step === 'OVERVIEW') {
    // 📋 오더 전체 (실물 23) — 실물에서 어디서 여는지 몰라 지금은 들어가는 길이 없다. ✕ 는 내 오더 탭으로 · 원달앱이 아는 단계 글자가 없다
    return (
      <div className="w-full h-full flex flex-col bg-white text-[#1f1f1f] select-none overflow-y-auto">
        <div className="h-[56px] flex items-center px-3 shrink-0">
          <button aria-label="닫기" onClick={() => { setStep('TO_PICKUP'); onBack(); }} className="w-9 h-9 flex items-center justify-center">
            <div className="relative w-5 h-5"><div className="absolute inset-x-0 top-1/2 h-[2px] bg-[#333] rotate-45" /><div className="absolute inset-x-0 top-1/2 h-[2px] bg-[#333] -rotate-45" /></div>
          </button>
        </div>
        <div className="px-[20px] flex flex-col gap-[18px]">
          <div className="flex gap-3">
            <div className="mt-[9px] w-[9px] h-[9px] rounded-full shrink-0" style={{ background: PICKUP_BLUE }} />
            <div className="flex flex-col gap-[2px]">
              {pickup?.customerName && <div className="text-[20px] font-bold">{pickup.customerName}</div>}
              <div className="text-[15px] text-gray-500">{pickupLine}</div>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="mt-[9px] w-[9px] h-[9px] rounded-full shrink-0" style={{ background: DROPOFF_PURPLE }} />
            <div className="flex flex-col gap-[2px]">
              {dropoff?.customerName && <div className="text-[20px] font-bold">{dropoff.customerName}</div>}
              <div className="text-[15px] text-gray-500">{dropoffLine}</div>
            </div>
          </div>
        </div>
        <div className="mx-[16px] mt-[22px] rounded-lg bg-[#f5f7fc] px-[16px] py-[14px] flex flex-col gap-[10px]">
          <div className="text-[16px] font-bold">오더 정보</div>
          <div className="flex gap-3 items-baseline">
            <div className="w-[64px] shrink-0 text-[14px] text-gray-500">오더 확인</div>
            <div className="text-[17px] font-bold tabular-nums">{call.orderNo}</div>
          </div>
          <div className="flex gap-3 text-[14px]">
            <div className="w-[64px] shrink-0 text-gray-500">배송 물품</div>
            <div className="font-bold">{call.itemSize}</div>
          </div>
        </div>
        <div className="mx-[16px] mt-[12px] mb-[16px] rounded-lg bg-[#f2f3f5] px-[16px] py-[14px] flex flex-col gap-[10px]">
          <div className="flex items-center justify-between">
            <div className="text-[18px] font-bold">최종 수익</div>
            <div className="flex items-center gap-[6px]">
              <div className="text-[24px] font-bold tabular-nums">{formatPickerFare(call.fare)}</div>
              <div className="w-6 h-6 rounded-full bg-[#f5c518] text-[#9a6a00] text-[13px] font-bold flex items-center justify-center">P</div>
            </div>
          </div>
          <div className="flex justify-between text-[14px] text-gray-500"><div>배송비</div><div>{`${formatPickerFare(call.deliveryFee)}P`}</div></div>
          {call.promotion > 0 && <div className="flex justify-between text-[14px] text-gray-500"><div>프로모션</div><div>{`${formatPickerFare(call.promotion)}P`}</div></div>}
        </div>
      </div>
    );
  }

  if (step === 'PHOTO') {
    // 📷 인증사진 촬영 (실물 25)
    return (
      <div className="w-full h-full flex flex-col bg-[#3b3432] text-white select-none">
        <div className="h-[52px] flex items-center px-3 shrink-0">
          <button aria-label="촬영 닫기" onClick={() => setStep('AT_DROPOFF')} className="w-9 h-9 flex items-center justify-center">
            <div className="relative w-5 h-5"><div className="absolute inset-x-0 top-1/2 h-[2px] bg-white rotate-45" /><div className="absolute inset-x-0 top-1/2 h-[2px] bg-white -rotate-45" /></div>
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-[6px] px-6 text-center">
          <div className="text-[22px] font-bold">{dropoff?.customerName ?? dropoffLine}</div>
          <div className="text-[18px] font-bold">{dropoffLine}</div>
          <div className="text-[17px] font-bold tabular-nums">{call.orderNo}</div>
        </div>
        <div className="bg-white text-[#6b3fd1] text-[14px] py-[10px] text-center shrink-0">물품과 장소가 함께 보이도록 촬영해주세요</div>
        <button className="h-[58px] text-white text-[19px] font-bold shrink-0" style={{ background: DROPOFF_PURPLE }} onClick={() => setStep('PHOTO_CHECK')}>인증사진 촬영</button>
      </div>
    );
  }

  if (step === 'PHOTO_CHECK') {
    // 🖼️ 촬영 확인 · 문자 전송 (실물 26)
    return (
      <div className="w-full h-full flex flex-col bg-white text-[#1f1f1f] select-none">
        <div className="h-[52px] flex items-center gap-2 px-3 shrink-0">
          <BackButton onClick={() => setStep('PHOTO')} />
          <div className="text-[18px]">촬영 확인</div>
        </div>
        <div className="h-[38%] bg-[#d9d6d2] shrink-0" />
        <div className="flex-1 flex flex-col items-center gap-[4px] px-6 pt-[16px] text-center">
          <div className="text-[17px] font-bold">{dropoff?.customerName ?? dropoffLine}</div>
          <div className="text-[15px]">{dropoffLine}</div>
          <div className="text-[16px] tabular-nums">{call.orderNo}</div>
        </div>
        <div className="flex flex-col items-center gap-[4px] pb-[14px] shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded" style={{ background: DROPOFF_PURPLE }} />
            <div className="text-[15px] font-bold">고객에게 문자로 사진 전송</div>
            <div className="rounded-full bg-[#f1ecfb] px-2 py-[2px] text-[12px] text-[#6b3fd1]">문자비용 발생</div>
          </div>
          <div className="text-[13px] text-gray-500">위 사진을 포함하여 문자를 전송합니다.</div>
        </div>
        <div className="flex h-[58px] shrink-0">
          <button className="w-[34%] bg-[#56585c] text-white text-[19px] font-bold" onClick={() => setStep('PHOTO')}>재촬영</button>
          <button className="flex-1 text-white text-[19px] font-bold" style={{ background: DROPOFF_PURPLE }} onClick={() => setStep('SMS')}>문자 전송</button>
        </div>
      </div>
    );
  }

  if (step === 'SMS') {
    // ✉️ 문자 전송 후 배송 완료 (실물 30) — 문자 앱(27~29)은 픽커 밖이라 건너뛴다
    return (
      <div className="w-full h-full flex flex-col bg-white text-[#1f1f1f] select-none">
        <div className="h-[52px] flex items-center gap-2 px-3 shrink-0">
          <BackButton onClick={() => setStep('PHOTO_CHECK')} />
          <div className="text-[18px]">문자 전송</div>
        </div>
        <div className="flex-1 flex flex-col justify-center gap-[10px] px-[16px]">
          <div className="flex flex-col items-center text-[16px] mb-[14px]">
            <div>문자 전송 후</div>
            <div>배송 완료버튼을 눌러주세요.</div>
          </div>
          <button className="w-full h-[52px] rounded-lg border border-[#d8d8d8] text-[17px]" onClick={() => {}}>문자 재전송</button>
          <button className="w-full h-[52px] rounded-lg text-white text-[17px] font-bold" style={{ background: PICKUP_BLUE }} onClick={() => setStep('DONE')}>배송 완료</button>
        </div>
      </div>
    );
  }

  if (step === 'DONE') {
    // ✅ 배송 완료 (실물 31) — 오늘 건수·수익은 시뮬레이터가 모른다 · 안 그린다
    return (
      <div className="w-full h-full flex flex-col bg-white text-[#1f1f1f] px-[16px] select-none">
        <div className="flex-1 flex flex-col gap-[10px] pt-[64px]">
          <div className="text-[24px] font-bold">배송 완료</div>
          <div className="text-[36px] font-bold tabular-nums">{fareP}</div>
          <div className="text-[16px] mt-[18px]">물품이 안전하게 전달되었습니다</div>
        </div>
        <button className="mb-[16px] w-full h-[54px] rounded-lg text-white text-[18px] font-bold shrink-0" style={{ background: PICKUP_BLUE }} onClick={() => onFinish(call)}>오더 목록 보기</button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#e9efe7] text-[#1f1f1f] select-none">
      {/* 맨 아래 — 지도가 화면 전체 (실물 16 · 21). 창이 올라오면 위 한 줄만 남는다 (실물 17 · 22)
          지도 위 — 뒤로 · (픽업 이동에만) 배정 취소 · 내 위치 · 안내 띠. 창이 올라오면 시트에 덮여 안 그린다 */}
      <PickerMapBackdrop>
        {!raised && (<>
          <button aria-label="뒤로가기" onClick={onBack} className="absolute left-3 top-3 w-11 h-11 rounded-full bg-white shadow flex items-center justify-center">
            <div className="w-3 h-3 border-l-2 border-b-2 border-[#333] rotate-45" />
          </button>
          {!toDropoff && <button className="absolute right-3 top-3 h-11 px-4 rounded-full bg-white shadow text-[15px] font-bold" onClick={() => setCancelBlocked(true)}>배정 취소</button>}
          <button aria-label="내 위치" className="absolute right-3 w-11 h-11 rounded-full bg-white shadow flex items-center justify-center" style={{ bottom: `calc(${100 - SHEET_MID_TOP_PCT}% + 84px)` }}>
            <div className="w-4 h-4 rounded-full border-2 border-[#333]" />
          </button>
          <div className="absolute left-3 right-3 rounded-lg bg-black/60 px-3 py-[10px] text-white text-[14px]" style={{ bottom: `calc(${100 - SHEET_MID_TOP_PCT}% + 20px)` }}>
            {toDropoff ? '물품 파손/분실을 주의해 이동해주세요' : '픽업지 근처에 가시면 오더 정보를 확인하세요'}
          </div>
        </>)}
      </PickerMapBackdrop>

      {/* 가운데 — 시트. «중»(실물 16 · 21) ↔ «상»(실물 17 · 22) · 손잡이 누르기 · 끌기 · 내용 끌어 올리기(스크롤) */}
      <div
        data-sheet={raised ? 'HIGH' : 'MID'}
        className="absolute inset-x-0 bottom-0 flex flex-col bg-white rounded-t-2xl shadow-[0_-2px_8px_rgba(0,0,0,0.08)] transition-[top] duration-200"
        style={{ top: raised ? SHEET_HIGH_TOP : `${SHEET_MID_TOP_PCT}%` }}
      >
        <button
          {...dragHandlers}
          aria-label={raised ? '아래 창 내리기' : '아래 창 올리기'}
          onClick={onTap(raised ? lower : raise)}
          className="h-[24px] w-full flex items-center justify-center shrink-0 touch-none"
        >
          <div className="w-[44px] h-[4px] rounded-full bg-[#c8c8c8]" />
        </button>
        <div
          data-sheet-scroll
          className="flex-1 min-h-0 overflow-y-auto px-[16px] pb-[16px] flex flex-col gap-[12px]"
          onScroll={e => { if (!raised && e.currentTarget.scrollTop > SHEET_PULL_PX) raise(); }}
        >
          {toDropoff ? (
            <>
              {deliveryLeft !== null && <div className="text-[20px] font-bold" style={{ color: DROPOFF_PURPLE }}>{`배송 시간 ${Math.max(0, deliveryLeft)}분 남음`}</div>}
              {dropoff?.customerName && <div className="text-[23px] font-bold">{dropoff.customerName}</div>}
              <div className="text-[15px] text-gray-500">{dropoffLine}</div>
            </>
          ) : (
            <>
              <div className="text-[20px] font-bold" style={{ color: PICKUP_BLUE }}>{pickupLeft === null ? '픽업 준비' : pickupLeft > 0 ? `픽업 준비 ${pickupLeft}분 남음` : '픽업 준비 완료'}</div>
              {pickup?.customerName && <div className="text-[23px] font-bold">{pickup.customerName}</div>}
              <div className="text-[15px] text-gray-500">{pickupLine}</div>
              {deliveryLeft !== null && (
                <div className="rounded-lg bg-[#f2f3f5] py-[10px] flex justify-center items-baseline gap-2">
                  <div className="text-[17px] font-bold">{`배송 ${Math.max(0, deliveryLeft)}분 남음`}</div>
                  {pickupLeft !== null && pickupLeft > 0 && <div className="text-[13px] text-gray-600">{`준비 ${pickupLeft}분 포함`}</div>}
                </div>
              )}
              <div className="rounded-lg bg-[#eef1fb] px-[14px] py-[12px] text-[14px]">
                <div className="font-bold" style={{ color: PICKUP_BLUE }}>"배송 물품 가지러 왔습니다"라고</div>
                <div>인사 후 아래 정보를 전달하세요.</div>
              </div>
            </>
          )}

          <div className="rounded-lg bg-[#f5f7fc] px-[14px] py-[12px] flex flex-col gap-[10px]">
            <div className="flex gap-3 items-baseline">
              <div className="w-[64px] shrink-0 text-[14px] text-gray-500">오더 확인</div>
              <div className="text-[20px] font-bold tabular-nums">{call.orderNo}</div>
            </div>
            {!toDropoff && (
              <div className="flex gap-3 text-[14px]">
                <div className="w-[64px] shrink-0 text-gray-500">배송지</div>
                <div className="font-bold">{dropoffLine}</div>
              </div>
            )}
            <div className="flex gap-3 text-[14px]">
              <div className="w-[64px] shrink-0 text-gray-500">배송 물품</div>
              <div className="font-bold">{call.itemSize}</div>
            </div>
          </div>
          <div className="h-[48px] rounded-lg border border-[#dddddd] flex items-center justify-center text-[15px] shrink-0">도움이 필요하신가요?</div>

          {/* 🔴 «밀어서 …»는 창이 올라왔을 때만 — 내려 있는 동안은 끌어 올릴 자리를 남긴다 */}
          {raised
            ? <SlideButton label={toDropoff ? '밀어서 사진 촬영' : '밀어서 픽업 완료'} color={toDropoff ? DROPOFF_PURPLE : PICKUP_BLUE} onDone={() => setStep(toDropoff ? 'PHOTO' : 'TO_DROPOFF')} />
            : <div className="h-[220px] shrink-0" />}
        </div>
      </div>

      {cancelPopup}
    </div>
  );
};
