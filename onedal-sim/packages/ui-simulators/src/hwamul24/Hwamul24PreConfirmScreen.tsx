import type { Hwamul24Call } from './hwamul24Call';
import { formatHwamul24Vehicle, hwamul24RegionOf } from './hwamul24Call';

interface PreConfirmProps {
  call: Hwamul24Call;
  onClose: () => void;
  onAccept: (call: Hwamul24Call) => void;
}

/** 실물 18 의 수수료 줄 «(운송료+부가세) x1.298%» — 수납금액은 거기서 수수료를 뺀 값(60,000 · 6,000 → 65,144) */
const FEE_RATE = 0.01298;

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <tr className="border-b border-gray-200">
    <td className="bg-gray-50 text-gray-600 px-3 py-3 w-[90px] text-center align-top text-[15px]">{label}</td>
    <td className="px-3 py-3" colSpan={3}>{children}</td>
  </tr>
);

const Pair = ({ a, av, b, bv, className = 'text-[#4e7d0f]' }: { a: string; av: React.ReactNode; b: string; bv: React.ReactNode; className?: string }) => (
  <tr className="border-b border-gray-200 text-[15px]">
    <td className="bg-gray-50 text-gray-600 px-3 py-3 w-[90px] text-center">{a}</td>
    <td className={`px-3 py-3 ${className}`}>{av}</td>
    <td className="bg-gray-50 text-gray-600 px-3 py-3 w-[80px] text-center">{b}</td>
    <td className={`px-3 py-3 ${className}`}>{bv}</td>
  </tr>
);

const Badge = ({ text, color }: { text: string; color: string }) => (
  <span className={`${color} text-white font-bold text-[12px] px-1 py-0.5 rounded-sm`}>{text}</span>
);

// ═══════════════════════════════════════════════════════════════
// 실물 18 «화물상세정보» — 잡기 전 상세(배차신청 · 돌아가기)
// 잡은 뒤(배차내역 탭에서 연 콜)는 Hwamul24CallDetailScreen 이다
// ═══════════════════════════════════════════════════════════════
export const Hwamul24PreConfirmScreen = ({ call, onClose, onAccept }: PreConfirmProps) => {
  const pickup = hwamul24RegionOf(call.pickups[0].fullName, call.pickupDetails?.[0]?.region);
  const dropoff = hwamul24RegionOf(call.dropoffs[0].fullName, call.dropoffDetails?.[0]?.region);
  // 🔴 문제지는 차종을 한 번만 적는다 — 여기서 화물24시 말로 옮긴다 (승용차 → 승용)
  const tonnage = call.tonnage || formatHwamul24Vehicle(call.vehicleType);
  const vehicleSpec = call.vehicleSpec || '전체';
  const loadingWeight = call.loadingWeight || tonnage;
  const tripType = call.tripType || '편도';
  const loadingType = call.loadingType || '독차';
  const loadingMethod = call.loadingMethod || '당상';
  const unloadingMethod = call.unloadingMethod || '당착';
  const itemDesc = call.itemSummary || call.itemDescription || '일반 화물';
  const companyName = call.companyName || '화물과퀵';
  const freightId = call.freightId || `${Math.floor(Math.random() * 9)}-${Math.floor(Math.random() * 9000 + 1000)}-${Math.floor(Math.random() * 9000 + 1000)}`;
  const registered = call.registeredAt || `${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}분`;
  const pickupKm = call.pickupDistanceKm?.toFixed(0) || '0';
  const distKm = call.distanceKm?.toFixed(0) || '0';
  const fare = call.fare;
  const vat = Math.round(fare * 0.1);
  const received = Math.ceil((fare + vat) * (1 - FEE_RATE));

  return (
    <div className="w-full h-full flex flex-col bg-white font-sans text-black select-none overflow-hidden">

      {/* ══ 머리: 화물상세정보 ══ */}
      <div className="flex items-center gap-3 bg-[#e53920] px-3 py-2.5 shrink-0">
        <span className="text-white text-[16px] bg-black rounded-full w-8 h-8 flex items-center justify-center font-bold cursor-pointer" onClick={onClose}>‹</span>
        <span className="text-white text-[20px] font-extrabold tracking-wide">화물상세정보</span>
      </div>

      {/* ══ ID · 잔액 ══ */}
      <div className="flex items-center justify-between bg-[#3a3a3a] px-3 py-2 shrink-0 text-[15px]">
        <span className="text-gray-300">ID : <span className="text-[#ff5a3c] font-bold">{Math.floor(Math.random() * 90000 + 10000)}</span></span>
        <span className="text-gray-300">잔액 : <span className="text-white font-bold">{(Math.floor(Math.random() * 100) * 10000).toLocaleString()}원</span></span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ══ 화주 · 화물번호 · 등록시간 ══ */}
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[20px] font-extrabold">{companyName}</span>
              <span className="bg-[#8bc34a] text-white text-[12px] font-bold w-5 h-5 rounded-full flex items-center justify-center">A</span>
            </div>
            <span className="bg-[#9c6b3c] text-white text-[14px] font-bold px-3 py-1 rounded-md">60분 안보기</span>
          </div>
          <div className="flex justify-between text-[13px] text-gray-500 mt-1">
            <span>화물번호:{freightId}</span>
            <span>[ 등록시간:{registered} ]</span>
          </div>
        </div>

        {/* ══ 상차지 · 하차지 · 화물정보 · 톤수 · 적재중량 ══ */}
        <table className="w-full border-collapse border-t border-gray-200">
          <tbody>
            <Row label="상차지">
              <div className="text-[16px] font-bold">{pickup}</div>
              <div className="flex items-center justify-between mt-1">
                <span className="flex gap-1"><Badge text={loadingMethod} color="bg-[#1e88e5]" /><Badge text="수" color="bg-[#fbc02d]" /></span>
                <span className="text-gray-500 italic font-bold text-[13px]">{pickupKm}Km</span>
              </div>
            </Row>
            <Row label="하차지">
              <div className="text-[16px] font-bold text-[#1a7f8e]">{dropoff}</div>
              <div className="flex items-center justify-between mt-1">
                <span className="flex gap-1"><Badge text={unloadingMethod} color="bg-[#1e88e5]" /><Badge text="수" color="bg-[#fbc02d]" /></span>
                <span className="text-gray-500 italic font-bold text-[13px]">{distKm}Km</span>
              </div>
            </Row>
            <Row label="화물정보">
              <div className="text-[15px]">{itemDesc}</div>
              <div className="mt-1"><span className="bg-[#424242] text-white font-bold text-[12px] px-1.5 py-0.5 rounded-sm">{loadingType}</span></div>
            </Row>
            <Pair a="톤수" av={tonnage} b="차종" bv={vehicleSpec} />
            <Pair a="적재중량" av={loadingWeight} b="운행방" bv={tripType} />
          </tbody>
        </table>

        {/* ══ 수수료 · 운송료 · 부가세 · 결제방법 · 수납금액 ══ */}
        <div className="px-4 py-2 text-[13px] text-[#d32f2f]">[수수료 = (운송료+부가세) x1.298% ]</div>
        <table className="w-full border-collapse border-t border-gray-200">
          <tbody>
            <Pair a="운송료" av={fare.toLocaleString()} b="부가세" bv={vat.toLocaleString()} className="text-[#e65100] text-right" />
            <Pair a="결제방법" av={call.paymentType || '카드'} b="수납금액" bv={<b>{received.toLocaleString()}</b>} className="text-gray-900" />
          </tbody>
        </table>
        <div className="px-4 py-2 text-[13px] text-[#d32f2f]">[산재보험료(차주부담액): {Math.round(fare * 0.0043).toLocaleString()}원]</div>
      </div>

      {/* ══ 바닥: 배차신청 · 돌아가기 ══ */}
      <div className="flex gap-2 px-3 py-2 shrink-0">
        <button className="flex-1 py-3 rounded-lg bg-[#2a8aa0] text-white font-extrabold text-[16px] active:bg-[#21707f]" onClick={() => onAccept(call)}>
          배차신청
        </button>
        <button className="flex-1 py-3 rounded-lg bg-[#9e9e9e] text-white font-extrabold text-[16px] active:bg-[#757575]" onClick={onClose}>
          돌아가기
        </button>
      </div>
    </div>
  );
};
