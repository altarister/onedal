import React from 'react';

interface NoticeDialogProps {
  title: string;
  message: string;
  onClose: () => void;
}

/**
 * 실물 인성의 알림 대화상자 — 제목 · 글 · «확인» (인성설명서 영상 1328 «알림 / 오더 선택 잠금 상태 입니다» · 1611 «오더 상세 / 자료가 존재하지 않습니다»).
 * 목록 위에 뜨고 «확인» 으로만 닫는다 — 바깥을 눌러도 안 닫히는 알림 대화상자의 모양이다.
 */
export const InsungNoticeDialog: React.FC<NoticeDialogProps> = ({ title, message, onClose }) => (
  <>
    <div className="absolute inset-0 bg-black/30 z-[95]" />
    <div className="absolute left-4 right-4 top-1/3 bg-white text-black shadow-2xl z-[100] p-4">
      <div className="text-[16px] font-bold">{title}</div>
      <div className="mt-4 text-[14px]">{message}</div>
      <div className="mt-6 flex justify-end">
        <button className="px-2 py-1 text-[14px] font-bold text-green-700" onClick={onClose}>
          확인
        </button>
      </div>
    </div>
  </>
);
