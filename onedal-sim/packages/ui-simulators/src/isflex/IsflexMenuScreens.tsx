/**
 * 📁 **인성플렉스 메뉴 화면** — S8 메세지함[실물 13] · S9 마이플렉스[실물 14] · S10 적립금 내역[실물 15] ·
 *    S11 수행내역[실물 16] · S12 공지사항[실물 17] · S13 공지 본문[실물 18]
 *
 * 글자는 실물 그대로 — 달만 지금 달. 🔴 개인 정보는 옮기지 않는다: 이름 · 전화는 지어낸 값(«기사님» · «010-0000-0000») ·
 * 메세지함은 통과 문구 한 건만(나머지 두 건은 기사님 개인 심사 결과).
 * 원달앱은 이 화면들에서 아무것도 누르지 않는다(«충전» · «출금»은 누르면 아무 일 없음 — 원달앱이 누르지 않는지 보는 재료).
 * 메뉴는 화면 안 상태라 방문 기록에 안 쌓인다 — 원달앱 «뒤로»는 실물(들어온 화면)과 달리 홈으로 간다(알려진 차이).
 */
import type { ReactNode } from 'react';
import { ISFLEX_POINT } from './isflexCall';

export type IsflexMenu = 'MESSAGE' | 'MY' | 'POINT' | 'HISTORY' | 'NOTICES' | 'NOTICE';

/** 공지 줄 아홉 [실물 17] — 둘째(운행취소 패널티)만 본문이 있다 */
const NOTICES: Array<[string, string]> = [
  ['[퀵서비스협회x안전보건공단 교육 이수 인증 이벤트]', '26-09-22'],
  ['운행취소 패널티 시행 안내 ', '26-07-28'],
  ['유상운송보험 가입 의무화 안내', '26-05-11'],
  ['배차미인지 및 배송지연 안내', '26-02-06'],
  ['<개인영업 행위 근절>', '26-01-20'],
  ['<공유 업무 가이드>', '26-01-13'],
  ['퀵서비스협회 기사 도움터', '25-04-18'],
  ['퀵서비스 종사자 의견수렴', '25-02-28'],
  ['공유거래시스템 이용가이드 필독', '22-09-13'],
];
/** 운행취소 패널티 본문 — 첫 두 줄만 [실물 18] */
const PENALTY_BODY = '[2026년 7월 28일 시행]\n※ 금일부터 운행 확정 후 취소 1회 시, 다음 오더의 운행 확정이 10초간 제한됩니다※';

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

const Frame = ({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) => (
  <div className="relative w-full h-full flex flex-col bg-white text-[#1f1f1f] select-none overflow-hidden">
    <div className="flex items-center h-[48px] px-3 shrink-0">
      <button onClick={onBack} className="w-6 h-6 border-l-2 border-b-2 border-[#222] rotate-45" />
      <div className="flex-1 text-center text-[17px] font-bold pr-6">{title}</div>
    </div>
    <div className="flex-1 overflow-y-auto">{children}</div>
  </div>
);

const Row = ({ label, value, onClick }: { label: string; value?: string; onClick?: () => void }) => (
  <div onClick={onClick} className={`flex items-center h-[56px] px-4 border-b border-gray-100 text-[15px] ${onClick ? 'cursor-pointer' : ''}`}>
    <div>{label}</div>
    {value && <div className="ml-auto text-gray-600">{value}</div>}
  </div>
);

interface Props {
  menu: IsflexMenu;
  now: Date;
  onBack: () => void;
  onOpen: (menu: IsflexMenu) => void;
}

export const IsflexMenuScreens = ({ menu, now, onBack, onOpen }: Props) => {
  const month = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;
  const m = now.getMonth() + 1;

  if (menu === 'MESSAGE') return (
    <Frame title="메세지함" onBack={onBack}>
      <div className="text-center py-3 text-[16px] font-bold">{month}</div>
      <div className="flex gap-2 px-4">
        <div className="rounded-lg border border-[#1f6fd1] text-[#1f6fd1] px-3 py-[5px] text-[13px] cursor-pointer">전체</div>
        <div className="rounded-lg border border-gray-300 px-3 py-[5px] text-[13px] cursor-pointer">안읽음</div>
      </div>
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="flex"><div className="text-[13px] font-bold">심사메시지</div><div className="ml-auto text-[12px] text-gray-500">1시간전</div></div>
        <div className="mt-1 text-[14px] truncate">축하드립니다.플렉스 등록 심사를 통과 하셨습니다. Y</div>
      </div>
    </Frame>
  );

  if (menu === 'MY') return (
    <Frame title="마이플렉스" onBack={onBack}>
      <div className="px-4 py-4">
        <div className="text-[20px] font-bold">기사님</div>
        <div className="text-[14px] text-gray-600">010-0000-0000</div>
        <div className="mt-4 rounded-xl bg-[#eef4fd] px-4 py-3 text-[14px] font-bold text-[#0b4ea2] whitespace-pre-line cursor-pointer">{'더 많은 혜택!\n프리미엄 기사로 전환하기'}</div>
      </div>
      <Row label="적립금내역" value={won(ISFLEX_POINT)} onClick={() => onOpen('POINT')} />
      <Row label="수행내역" onClick={() => onOpen('HISTORY')} />
      <Row label="미션 이벤트 내역" />
      <Row label="보험안내 및 접수" />
      <Row label="내 정보 관리" />
      <Row label="내 배송 수단 관리" />
      <Row label="이용안내" />
      <Row label="공지사항" onClick={() => onOpen('NOTICES')} />
    </Frame>
  );

  if (menu === 'POINT') return (
    <Frame title="적립금 내역" onBack={onBack}>
      <div className="mx-4 mt-3 rounded-xl bg-[#f5f6f8] px-4 py-4">
        <div className="text-[14px] text-gray-600">출금 가능 금액</div>
        <div className="flex items-center mt-1">
          <div className="text-[24px] font-bold">{won(ISFLEX_POINT)}</div>
          <button className="ml-auto rounded-lg bg-white border border-gray-300 px-3 py-1 text-[13px]">충전</button>
          <button className="ml-2 rounded-lg bg-white border border-gray-300 px-3 py-1 text-[13px]">출금</button>
        </div>
        <div className="mt-2 text-[11px] text-gray-500">* 출금가능금액은 오더 완료 후 2일뒤 반영됩니다.</div>
      </div>
      <div className="px-4 pt-4 grid grid-cols-[1fr_auto] gap-y-2 text-[14px]">
        <div>보유 적립금</div><div>{won(ISFLEX_POINT)}</div>
        <div>(-) 출금 예정 금액</div><div>{won(0)}</div>
        <div className="text-gray-500">{`└  예상 고용 보험료 (${m}월)`}</div><div>{won(0)}</div>
        <div className="text-gray-500">{`└  예상 산재 보험료 (${m}월)`}</div><div>{won(0)}</div>
      </div>
      <div className="text-center pt-6 pb-3 text-[16px] font-bold">{month}</div>
      <div className="flex gap-2 px-4">
        {['전체', '충전', '출금', '보험료'].map(t => <div key={t} className="rounded-lg border border-gray-300 px-3 py-[5px] text-[13px] cursor-pointer">{t}</div>)}
      </div>
    </Frame>
  );

  if (menu === 'HISTORY') return (
    <Frame title="수행내역" onBack={onBack}>
      <div className="text-center pt-5 text-[16px] font-bold">{month}</div>
      <div className="flex justify-center gap-6 pt-3 text-[15px] font-bold"><div>0건</div><div>0원</div></div>
      <div className="text-center pt-3 text-[12px] text-gray-500">* 금액은 완료된 건만 표시됩니다.</div>
      <div className="text-center pt-1 text-[12px] text-gray-500 whitespace-pre-line">{'* 일별 운행정보는 매일 오전 2시부터\n익일 오전 1시59분까지 운행한 정보가 보여집니다.'}</div>
      <div className="text-center pt-24 text-[15px] text-gray-500">수행내역이 없습니다.</div>
    </Frame>
  );

  if (menu === 'NOTICES') return (
    <Frame title="공지사항" onBack={onBack}>
      {NOTICES.map(([title, date], i) => (
        <div key={title} onClick={i === 1 ? () => onOpen('NOTICE') : undefined} className="px-4 py-3 border-b border-gray-100 cursor-pointer">
          <div className="text-[15px] truncate">{title}</div>
          <div className="mt-1 flex gap-2 text-[11px]"><div className="text-[#e53935]">필수공지</div><div className="text-gray-500">{date}</div></div>
        </div>
      ))}
    </Frame>
  );

  return (
    <Frame title="공지사항" onBack={onBack}>
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="text-[15px] font-bold">{NOTICES[1][0]}</div>
        <div className="mt-1 flex gap-2 text-[11px]"><div className="text-[#e53935]">필수공지</div><div className="text-gray-500">2026-07-28</div></div>
      </div>
      <div className="px-4 py-4 text-[14px] leading-[22px] whitespace-pre-line">{PENALTY_BODY}</div>
    </Frame>
  );
};
