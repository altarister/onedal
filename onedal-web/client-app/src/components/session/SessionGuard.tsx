import { useEffect, useState } from "react";
import { socket } from "../../lib/socket";

interface SessionConflictData {
  existingDeviceInfo: string;
  connectedAt: number;
}

interface SessionSupersededData {
  message?: string;
  newDeviceInfo?: string;
}

export function SessionGuard() {
  const [conflict, setConflict] = useState<SessionConflictData | null>(null);
  const [isTakingOver, setIsTakingOver] = useState(false);
  const [superseded, setSuperseded] = useState<SessionSupersededData | null>(null);
  const [isCancelled, setIsCancelled] = useState(false);


  useEffect(() => {
    // 1. 다른 기기에서 이미 관제 중일 때 수신
    const onConflict = (data: SessionConflictData) => {
      console.warn("⚠️ [세션 충돌] 기존 세션 감지됨:", data);
      setConflict(data);
      setIsTakingOver(false);
      setIsCancelled(false);
    };

    // 2. 인계 승인 완료 시 모달 닫기
    const onApproved = () => {
      console.log("✅ [세션 인계] 현재 기기로 관제탑 세션 전환 승인됨");
      setConflict(null);
      setIsTakingOver(false);
      setIsCancelled(false);
    };

    // 3. 다른 기기가 세션을 인계받아 현재 기기가 종료되었을 때
    const onSuperseded = (data: SessionSupersededData) => {
      console.warn("🛑 [세션 종료] 다른 기기에서 관제탑을 시작함:", data);
      setSuperseded(data);
    };

    socket.on("session-conflict", onConflict);
    socket.on("takeover-approved", onApproved);
    socket.on("session-superseded", onSuperseded);

    // 마운트 시 서버에 현재 세션 상태 재확인 요청 (초기 연결 레이스 컨디션 방지)
    socket.emit("check-session-conflict");

    return () => {
      socket.off("session-conflict", onConflict);
      socket.off("takeover-approved", onApproved);
      socket.off("session-superseded", onSuperseded);
    };
  }, []);

  const handleTakeover = () => {
    setIsTakingOver(true);
    socket.emit("takeover-session");
  };

  const handleCancel = () => {
    socket.emit("cancel-takeover");
    setConflict(null);
    setIsCancelled(true);
  };


  const formatTime = (ts?: number) => {
    if (!ts) return "";
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  };

  // 1. 기존 기기가 다른 기기에 의해 종료되었을 때 (Full Overlay)
  if (superseded) {
    return (
      <div className="fixed inset-0 z-[99999] bg-bg-base/90 backdrop-blur-md flex items-center justify-center p-4">
        <div className="bg-surface border border-border-base rounded-2xl p-6 max-w-md w-full shadow-2xl text-center animate-fade-in">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-warning/10 text-warning flex items-center justify-center text-2xl font-bold">
            📱
          </div>
          <h2 className="text-xl font-black text-text-base mb-2">관제 세션이 종료되었습니다</h2>
          <p className="text-text-muted text-sm leading-relaxed mb-4">
            {superseded.message || "다른 기기(또는 새 창)에서 관제탑을 시작하여 현재 기기의 연결이 안전하게 종료되었습니다."}
          </p>
          {superseded.newDeviceInfo && (
            <div className="bg-bg-base rounded-xl p-3 mb-6 text-xs text-text-muted border border-border-base">
              새로 열린 기기: <span className="text-text-base font-semibold">{superseded.newDeviceInfo}</span>
            </div>
          )}
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3.5 bg-info text-white font-black rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-info/20"
          >
            이 기기에서 다시 시작
          </button>
        </div>
      </div>
    );
  }

  // 2. 새 기기 접속 시 충돌 안내 팝업
  if (conflict) {
    return (
      <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-surface border border-border-base rounded-2xl p-6 max-w-md w-full shadow-2xl animate-fade-in">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-info/10 text-info flex items-center justify-center text-xl font-bold">
              🔄
            </div>
            <div>
              <h2 className="text-lg font-black text-text-base">기존 관제 세션 감지</h2>
              <p className="text-xs text-text-muted">다른 기기에서 이미 관제탑이 실행 중입니다</p>
            </div>
          </div>

          <div className="bg-bg-base border border-border-base rounded-xl p-3.5 mb-5 text-sm space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-text-muted">현재 열려 있는 기기</span>
              <span className="text-text-base font-bold">{conflict.existingDeviceInfo}</span>
            </div>
            {conflict.connectedAt > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-text-muted">접속 시각</span>
                <span className="text-text-base">{formatTime(conflict.connectedAt)}</span>
              </div>
            )}
          </div>

          <p className="text-sm text-text-muted mb-6 leading-relaxed">
            기존 기기의 관제탑을 닫고, <b>이 기기로 관제를 진행할까요?</b>
          </p>

          <div className="flex gap-3">
            <button
              onClick={handleCancel}
              disabled={isTakingOver}
              className="flex-1 py-3 bg-surface hover:bg-bg-base border border-border-base text-text-muted font-bold rounded-xl transition-all active:scale-95 disabled:opacity-50"
            >
              취소
            </button>
            <button
              onClick={handleTakeover}
              disabled={isTakingOver}
              className="flex-1 py-3 bg-info text-white font-black rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-info/20 flex items-center justify-center gap-2 disabled:opacity-75"
            >
              {isTakingOver ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  전환 중...
                </>
              ) : (
                "이 기기로 전환"
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. 인계 취소한 경우 안내 바
  if (isCancelled) {
    return (
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[99999] bg-surface/95 border border-border-base rounded-xl px-4 py-2.5 shadow-xl text-xs text-text-muted flex items-center gap-3">
        <span>기존 기기에서 관제가 유지 중입니다.</span>
        <button
          onClick={() => window.location.reload()}
          className="text-info font-black underline hover:brightness-110"
        >
          새로고침
        </button>
      </div>
    );
  }

  return null;
}
