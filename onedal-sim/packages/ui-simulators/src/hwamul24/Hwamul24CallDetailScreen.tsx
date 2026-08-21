import { useState } from 'react';
import type { CallItem } from '@altari/core-simulator';
import { formatHwamul24Region } from '@altari/core-simulator';

interface DetailProps {
  call: CallItem;
  onClose: () => void;
  onAccept: (call: CallItem) => void;
}

type DetailTab = 'cargo' | 'shipper' | 'payment';

// ── 헬퍼 ──
const mockPhone = () => `0${Math.floor(Math.random() * 2) === 0 ? '10' : '31'}-${Math.floor(Math.random() * 9000 + 1000)}-${Math.floor(Math.random() * 9000 + 1000)}`;
const mockBizNo = () => `${Math.floor(Math.random() * 900 + 100)}-${Math.floor(Math.random() * 90 + 10)}-${Math.floor(Math.random() * 90000 + 10000)}`;

// ═══════════════════════════════════════════════════════════════
// 스크린샷 04, 05, 21, 22 기반 — 배차상세 3탭 화면
// ═══════════════════════════════════════════════════════════════
export const Hwamul24CallDetailScreen = ({ call, onClose, onAccept }: DetailProps) => {
  const [activeTab, setActiveTab] = useState<DetailTab>('cargo');

  // ── 공통 데이터 ──
  const pickupFull = call.pickupDetails?.[0]?.addressDetail || formatHwamul24Region(call.pickups[0].fullName);
  const dropoffFull = call.dropoffDetails?.[0]?.addressDetail || formatHwamul24Region(call.dropoffs[0].fullName);
  const pickupPhone = call.pickupDetails?.[0]?.phone1 || mockPhone();
  const dropoffPhone = call.dropoffDetails?.[0]?.phone1 || mockPhone();
  const tonnage = call.tonnage || '1톤';
  const vehicleSpec = call.vehicleSpec || '전체';
  const loadingType = call.loadingType || '독차';
  const tripType = call.tripType || '편도';
  const loadingWeight = call.loadingWeight || tonnage;
  const itemDesc = call.itemSummary || call.itemDescription || '일반 화물';
  const freightId = call.freightId || `${Math.floor(Math.random() * 9)}-${Math.floor(Math.random() * 9000 + 1000)}-${Math.floor(Math.random() * 9000 + 1000)}`;
  const loadingMethod = call.loadingMethod || '당상';
  const unloadingMethod = call.unloadingMethod || '당착';
  const companyName = call.companyName || '화물과퀵';
  const distKm = call.distanceKm?.toFixed(0) || '0';

  // 날짜/시간
  const now = new Date();
  const dispatchTime = `${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${call.pickupTime || '13:43'}`;

  return (
    <div className="w-full h-full flex flex-col bg-white font-sans text-black select-none overflow-hidden">

      {/* ══ 상단 헤더: 배차내역 ══ */}
      <div className="flex items-center justify-between bg-gradient-to-r from-[#d32f2f] to-[#c62828] px-3 py-2.5 shrink-0">
        <div className="flex items-center gap-2">
          <span
            className="text-white text-[12px] bg-black/30 rounded-full w-6 h-6 flex items-center justify-center font-bold cursor-pointer"
            onClick={onClose}
          >‹</span>
          <span className="text-white text-[17px] font-extrabold tracking-wide">배차내역</span>
        </div>
        <span className="text-white/80 text-[12px] font-medium">마이페이지</span>
      </div>

      {/* ══ 서브 헤더: 오더/잔액 ══ */}
      <div className="flex items-center justify-between bg-[#3a3a3a] px-3 py-1.5 shrink-0 text-[12px]">
        <span className="text-[#ffab00] font-bold">오더 : <span className="text-white">{Math.floor(Math.random() * 900 + 100)}건</span></span>
        <span className="text-white font-bold">잔액 : <span className="text-[#ffab00]">{(Math.floor(Math.random() * 5000000) + 50000).toLocaleString()}</span>원</span>
      </div>

      {/* ══ 전자세금계산서 배너 ══ */}
      <div className="flex items-center justify-between bg-[#e8f5e9] px-3 py-2 shrink-0 border-b border-gray-300">
        <div className="flex items-center gap-2">
          <span className="bg-[#4caf50] text-white text-[10px] font-bold px-1.5 py-0.5 rounded">W</span>
          <span className="text-[13px] font-bold text-gray-800">전자세금계산서</span>
        </div>
        <span className="bg-gray-200 text-gray-600 text-[11px] font-bold px-2 py-0.5 rounded">미발행 상태</span>
      </div>

      {/* ══ 3탭 네비게이션 ══ */}
      <div className="flex shrink-0 border-b-2 border-gray-300 bg-white">
        {([
          { key: 'cargo' as DetailTab, label: '01 화물정보' },
          { key: 'shipper' as DetailTab, label: '02 화주정보' },
          { key: 'payment' as DetailTab, label: '03 결제정보' },
        ]).map(tab => (
          <button
            key={tab.key}
            className={`flex-1 py-2.5 text-[13px] font-bold transition-colors border-b-2 -mb-[2px]
              ${activeTab === tab.key
                ? 'text-[#d32f2f] border-[#d32f2f]'
                : 'text-gray-500 border-transparent'
              }`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ══ 탭 콘텐츠 (스크롤) ══ */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'cargo' && (
          <CargoInfoTab
            dispatchTime={dispatchTime}
            freightId={freightId}
            pickupFull={pickupFull}
            dropoffFull={dropoffFull}
            pickupPhone={pickupPhone}
            dropoffPhone={dropoffPhone}
            loadingMethod={loadingMethod}
            unloadingMethod={unloadingMethod}
            distKm={distKm}
            itemDesc={itemDesc}
            companyName={companyName}
            loadingType={loadingType}
            tonnage={tonnage}
            vehicleSpec={vehicleSpec}
            loadingWeight={loadingWeight}
            tripType={tripType}
          />
        )}
        {activeTab === 'shipper' && (
          <ShipperInfoTab companyName={companyName} />
        )}
        {activeTab === 'payment' && (
          <PaymentInfoTab call={call} />
        )}
      </div>

      {/* ══ 전자세금계산서 발행 버튼 ══ */}
      <div className="px-4 py-2 shrink-0 border-t border-gray-200">
        <div className="border-2 border-[#c8e6c9] rounded-md py-2.5 text-center">
          <span className="text-[#4caf50] font-bold text-[14px]">전자세금계산서 발행</span>
        </div>
        <div className="text-[10px] text-gray-500 mt-1 space-y-0.5 px-1">
          <div>※ 전자세금계산서는 배차 후, <span className="text-[#d32f2f] font-bold">3시간 후에 발행</span>이 가능합니다.</div>
          <div>※ 전자세금계산서 문의 : ☏ 032-811-2404(월~금,09:00~17:30)</div>
          <div>※ 인수증은 <span className="font-bold">최대 3개</span> 까지 전송이 가능합니다.</div>
        </div>
      </div>

      {/* ══ 하단 4개 액션 버튼 ══ */}
      <div className="flex shrink-0 border-t border-gray-300">
        <button className="flex-1 py-3 text-center bg-[#e65100] text-white font-extrabold text-[13px] active:bg-[#bf360c]">
          인수증전송
        </button>
        <button
          className="flex-1 py-3 text-center bg-[#d32f2f] text-white font-extrabold text-[13px] active:bg-[#b71c1c]"
          onClick={() => onAccept(call)}
        >
          하차완료
        </button>
        <button
          className="flex-1 py-3 text-center bg-[#616161] text-white font-extrabold text-[13px] active:bg-[#424242]"
          onClick={onClose}
        >
          돌아가기
        </button>
        <button className="flex-1 py-3 text-center bg-[#757575] text-white font-extrabold text-[13px] active:bg-[#616161]">
          요약정보
        </button>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// 01 화물정보 탭 (스크린샷 04, 05)
// ═══════════════════════════════════════════════════════════════
const CargoInfoTab = ({
  dispatchTime, freightId, pickupFull, dropoffFull, pickupPhone, dropoffPhone,
  loadingMethod, unloadingMethod, distKm, itemDesc, companyName, loadingType,
  tonnage, vehicleSpec, loadingWeight, tripType
}: {
  dispatchTime: string; freightId: string; pickupFull: string; dropoffFull: string;
  pickupPhone: string; dropoffPhone: string; loadingMethod: string; unloadingMethod: string;
  distKm: string; itemDesc: string; companyName: string; loadingType: string;
  tonnage: string; vehicleSpec: string; loadingWeight: string; tripType: string;
}) => {
  const loadColor = loadingMethod === '당상' ? 'bg-[#4caf50]' : 'bg-[#ff9800]';
  const unloadColor = unloadingMethod === '당착' ? 'bg-[#ff9800]' : 'bg-[#ff9800]';

  return (
    <div>
      {/* 배차시간 */}
      <div className="px-4 py-2.5 border-b border-gray-200 text-[13px] text-gray-600">
        배차시간: <span className="font-bold text-gray-800">{dispatchTime}</span>
      </div>

      {/* 테이블 형태 정보 */}
      <table className="w-full text-[13px] border-collapse">
        <tbody>
          {/* 화물번호 */}
          <tr className="border-b border-gray-200">
            <td className="bg-gray-100 text-gray-600 font-bold px-3 py-3 w-[80px] text-center align-top">화물번호</td>
            <td className="px-3 py-3 font-bold text-gray-900" colSpan={2}>{freightId}</td>
          </tr>

          {/* 상차지 */}
          <tr className="border-b border-gray-200">
            <td className="bg-gray-100 text-gray-600 font-bold px-3 py-3 w-[80px] text-center align-top" rowSpan={2}>상차지</td>
            <td className="px-3 pt-3 pb-1">
              <div className="font-extrabold text-[15px] text-gray-900 leading-snug">{pickupFull}</div>
              <div className="flex items-center gap-1 mt-1">
                <span className={`${loadColor} text-white font-bold text-[10px] px-1.5 py-0.5 rounded-sm`}>
                  {loadingMethod}
                </span>
                <span className="bg-[#2196f3] text-white font-bold text-[10px] px-1 py-0.5 rounded-sm">지</span>
              </div>
            </td>
            <td className="px-3 pt-3 pb-1 align-top text-right w-[70px]">
              <span className="bg-[#616161] text-white text-[10px] font-bold px-2 py-1 rounded">서명</span>
            </td>
          </tr>
          <tr className="border-b border-gray-200">
            <td className="px-3 pb-3 pt-1">
              <span className="text-[13px] text-gray-700">{pickupPhone}</span>
            </td>
            <td className="px-3 pb-3 pt-1 text-right">
              <span className="inline-flex items-center justify-center w-8 h-8 bg-[#4caf50] rounded-md text-white text-[16px]">📞</span>
            </td>
          </tr>

          {/* 하차지 */}
          <tr className="border-b border-gray-200">
            <td className="bg-gray-100 text-gray-600 font-bold px-3 py-3 w-[80px] text-center align-top" rowSpan={2}>하차지</td>
            <td className="px-3 pt-3 pb-1">
              <div className="font-extrabold text-[15px] text-[#ff6600] leading-snug">{dropoffFull}</div>
              <div className="flex items-center gap-1 mt-1">
                <span className={`${unloadColor} text-white font-bold text-[10px] px-1.5 py-0.5 rounded-sm`}>
                  {unloadingMethod === '당착' ? '내착' : unloadingMethod}
                </span>
                <span className="bg-[#2196f3] text-white font-bold text-[10px] px-1 py-0.5 rounded-sm">지</span>
                <span className="text-gray-600 font-bold text-[12px] ml-1">{distKm}Km</span>
              </div>
            </td>
            <td className="px-3 pt-3 pb-1 align-top text-right w-[70px]">
              <span className="bg-[#616161] text-white text-[10px] font-bold px-2 py-1 rounded">서명</span>
            </td>
          </tr>
          <tr className="border-b border-gray-200">
            <td className="px-3 pb-3 pt-1">
              <span className="text-[13px] text-gray-700">{dropoffPhone}</span>
            </td>
            <td className="px-3 pb-3 pt-1 text-right">
              <span className="inline-flex items-center justify-center w-8 h-8 bg-[#4caf50] rounded-md text-white text-[16px]">📞</span>
            </td>
          </tr>
        </tbody>
      </table>

      {/* 서명·인수증 안내 */}
      <div className="px-4 py-2.5 text-center text-[12px] text-[#d32f2f] font-medium border-b border-gray-200">
        서명·인수증은 법적분쟁 시, 증빙자료로 활용가능합니다.
      </div>

      {/* 화물정보 */}
      <table className="w-full text-[13px] border-collapse">
        <tbody>
          <tr className="border-b border-gray-200">
            <td className="bg-gray-100 text-gray-600 font-bold px-3 py-3 w-[80px] text-center align-top">화물정보</td>
            <td className="px-3 py-3" colSpan={2}>
              <div className="text-[13px] text-gray-800 leading-snug">{itemDesc} / 화주: {companyName}</div>
              <div className="mt-1">
                <span className="border border-gray-500 text-gray-700 font-bold text-[11px] px-2 py-0.5 bg-gray-50">{loadingType}</span>
              </div>
            </td>
          </tr>

          {/* 톤수 / 차종 */}
          <tr className="border-b border-gray-200">
            <td className="bg-gray-100 text-gray-600 font-bold px-3 py-3 w-[80px] text-center">톤 수</td>
            <td className="px-3 py-3 font-bold text-gray-900">{tonnage}</td>
            <td className="px-3 py-3">
              <span className="text-gray-500 text-[12px] mr-1">차 종</span>
              <span className="font-bold text-gray-900">{vehicleSpec}</span>
            </td>
          </tr>

          {/* 적재중량 / 운행방법 */}
          <tr className="border-b border-gray-200">
            <td className="bg-gray-100 text-gray-600 font-bold px-3 py-3 w-[80px] text-center">적재중량</td>
            <td className="px-3 py-3 font-bold text-gray-900">{loadingWeight}</td>
            <td className="px-3 py-3">
              <span className="text-gray-500 text-[12px] mr-1">운행방법</span>
              <span className="font-bold text-gray-900">{tripType}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// 02 화주정보 탭 (스크린샷 21)
// ═══════════════════════════════════════════════════════════════
const ShipperInfoTab = ({ companyName }: { companyName: string }) => {
  const phone = mockPhone();
  const bizNo = mockBizNo();

  return (
    <table className="w-full text-[13px] border-collapse">
      <tbody>
        <tr className="border-b border-gray-200">
          <td className="bg-gray-100 text-gray-600 font-bold px-3 py-3 w-[90px] text-center">업 태</td>
          <td className="px-3 py-3 text-gray-900">운수업</td>
        </tr>
        <tr className="border-b border-gray-200">
          <td className="bg-gray-100 text-gray-600 font-bold px-3 py-3 w-[90px] text-center">업 종</td>
          <td className="px-3 py-3 text-gray-900">{companyName} (화물운송주선)</td>
        </tr>
        <tr className="border-b border-gray-200">
          <td className="bg-gray-100 text-gray-600 font-bold px-3 py-3 w-[90px] text-center align-top">사업장주소</td>
          <td className="px-3 py-3 text-gray-900 leading-snug">
            경기도 시흥시 정왕동 산업단지로 XX번길 XX
            <div className="text-gray-400 text-[11px] mt-0.5">(시뮬레이터 모의 데이터)</div>
          </td>
        </tr>
        <tr className="border-b border-gray-200">
          <td className="bg-gray-100 text-gray-600 font-bold px-3 py-3 w-[90px] text-center">연락처</td>
          <td className="px-3 py-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-900 font-bold text-[16px] tracking-wider">{phone}</span>
              <span className="inline-flex items-center justify-center w-9 h-9 bg-[#4caf50] rounded-md text-white text-[18px]">📞</span>
            </div>
          </td>
        </tr>
        <tr className="border-b border-gray-200">
          <td className="bg-gray-100 text-gray-600 font-bold px-3 py-3 w-[90px] text-center align-top">우편물주소</td>
          <td className="px-3 py-3 text-gray-900 leading-snug">
            경기도 시흥시 정왕동 산업단지로 XX번길 XX
          </td>
        </tr>
        <tr className="border-b border-gray-200">
          <td className="bg-gray-100 text-gray-600 font-bold px-3 py-3 w-[90px] text-center">전자우편</td>
          <td className="px-3 py-3 text-gray-900">info@{companyName.replace(/\s/g, '')}.co.kr</td>
        </tr>
        <tr className="border-b border-gray-200">
          <td className="bg-gray-100 text-gray-600 font-bold px-3 py-3 w-[90px] text-center align-top leading-tight">
            <div>산재보험</div>
            <div>이용개시번호</div>
          </td>
          <td className="px-3 py-3 text-gray-900">{bizNo}</td>
        </tr>
      </tbody>
    </table>
  );
};

// ═══════════════════════════════════════════════════════════════
// 03 결제정보 탭 (스크린샷 22)
// ═══════════════════════════════════════════════════════════════
const PaymentInfoTab = ({ call }: { call: CallItem }) => {
  const baseFare = call.fare;
  const receiptStatus = call.receiptType || '인수증';
  const billingStatus = call.billingType || '계산서';

  return (
    <table className="w-full text-[13px] border-collapse">
      <tbody>
        <tr className="border-b border-gray-200">
          <td className="bg-gray-100 text-gray-600 font-bold px-3 py-3 w-[80px] text-center">수금상태</td>
          <td className="px-3 py-3">
            <span className="text-gray-900 font-bold">&lt;미수금&gt;</span>
            <span className="ml-2 bg-[#ff9800] text-white text-[10px] font-bold px-2 py-0.5 rounded">수금확인</span>
          </td>
        </tr>
        <tr className="border-b border-gray-200">
          <td className="bg-gray-100 text-gray-600 font-bold px-3 py-3 w-[80px] text-center">인수증</td>
          <td className="px-3 py-3 text-[#2196f3] font-medium">미전송</td>
        </tr>
        <tr className="border-b border-gray-200">
          <td className="bg-gray-100 text-gray-600 font-bold px-3 py-3 w-[80px] text-center">계산서</td>
          <td className="px-3 py-3 text-[#2196f3] font-medium">미발해</td>
        </tr>
        <tr className="border-b border-gray-200">
          <td className="bg-gray-100 text-gray-600 font-bold px-3 py-3 w-[80px] text-center align-top">입금계좌</td>
          <td className="px-3 py-3">
            <div className="text-gray-900 leading-snug text-[12px] space-y-0.5">
              <div>국민은행 XXX-XXXX-XXXX-XX</div>
              <div>농협은행 XXX-XXXX-XXXX-XX</div>
              <div>신한은행 XXX-XXXX-XXXX-XX</div>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-gray-500 text-[12px]">상 태</span>
              <span className="border border-gray-400 text-gray-700 font-bold text-[11px] px-2 py-0.5">공유</span>
              <span className="bg-[#616161] text-white text-[10px] font-bold px-2 py-0.5 rounded">상태변경</span>
            </div>
            <div className="mt-2">
              <span className="border-2 border-[#2196f3] text-[#2196f3] font-bold text-[12px] px-3 py-1 rounded inline-flex items-center gap-1">
                🔍 계좌선택
              </span>
            </div>
          </td>
        </tr>
        <tr className="border-b border-gray-200">
          <td className="bg-gray-100 text-gray-600 font-bold px-3 py-3 w-[80px] text-center">운송료</td>
          <td className="px-3 py-3 font-extrabold text-[#e65100] text-[16px]">{baseFare.toLocaleString()}원</td>
        </tr>
        <tr className="border-b border-gray-200">
          <td className="bg-gray-100 text-gray-600 font-bold px-3 py-3 w-[80px] text-center">결제방법</td>
          <td className="px-3 py-3 font-bold text-gray-900">{call.paymentType || '카드'}</td>
        </tr>
        <tr className="border-b border-gray-200">
          <td className="bg-gray-100 text-gray-600 font-bold px-3 py-3 w-[80px] text-center">{receiptStatus}</td>
          <td className="px-3 py-3 font-bold text-gray-900">{billingStatus}</td>
        </tr>
      </tbody>
    </table>
  );
};
