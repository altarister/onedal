import { useState, useEffect, useCallback } from "react";
import { apiClient } from "../../../api/apiClient";
import { socket } from "../../../lib/socket";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

interface RegisteredDevice {
  device_id: string;
  device_name: string | null;
  registered_at: string;
}

interface Props {
  onClose: () => void;
}

export default function DeviceSettingsTab({ onClose }: Props) {
  const [registeredDevices, setRegisteredDevices] = useState<RegisteredDevice[]>([]);
  const [isDevicesLoading, setIsDevicesLoading] = useState(false);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [pinCode, setPinCode] = useState<string | null>(null);
  const [pinExpiresAt, setPinExpiresAt] = useState<number>(0);
  const [pinRemainingSeconds, setPinRemainingSeconds] = useState(0);

  const loadRegisteredDevices = useCallback(async () => {
    try {
      setIsDevicesLoading(true);
      const { data } = await apiClient.get('/devices/registered');
      setRegisteredDevices(data.devices || []);
    } catch (e) {
      console.error("Failed to load devices:", e);
    } finally {
      setIsDevicesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRegisteredDevices();
  }, [loadRegisteredDevices]);

  // PIN 카운트다운 타이머
  useEffect(() => {
    if (!pinCode) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((pinExpiresAt - Date.now()) / 1000));
      setPinRemainingSeconds(remaining);
      if (remaining <= 0) {
        setPinCode(null);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [pinCode, pinExpiresAt]);

  // 소켓 이벤트: 앱에서 PIN 입력 완료 시 자동 새로고침
  useEffect(() => {
    const onDevicePaired = () => {
      setPinCode(null);
      loadRegisteredDevices();
    };
    socket.on("device-paired", onDevicePaired);
    return () => { socket.off("device-paired", onDevicePaired); };
  }, [loadRegisteredDevices]);

  const handleRequestPin = async () => {
    try {
      const { data } = await apiClient.post('/devices/pin');
      setPinCode(data.pin);
      setPinExpiresAt(Date.now() + (data.expiresIn * 1000));
      setPinRemainingSeconds(data.expiresIn);
    } catch (e) {
      console.error("PIN 발급 실패:", e);
      alert("PIN 발급에 실패했습니다.");
    }
  };

  const handleDeleteDevice = async (deviceId: string) => {
    if (!confirm("이 기기의 연동을 해제하시겠습니까?\n해제 후 해당 기기에서는 콜 수집이 중단됩니다.")) return;
    try {
      await apiClient.delete(`/devices/${deviceId}`);
      setRegisteredDevices(prev => prev.filter(d => d.device_id !== deviceId));
    } catch (e) {
      console.error("기기 해제 실패:", e);
      alert("기기 해제에 실패했습니다.");
    }
  };

  const handleSaveDeviceName = async (deviceId: string) => {
    try {
      await apiClient.put(`/devices/${deviceId}/name`, { deviceName: editingName });
      setRegisteredDevices(prev =>
        prev.map(d => d.device_id === deviceId ? { ...d, device_name: editingName } : d)
      );
      setEditingDeviceId(null);
    } catch (e) {
      console.error("이름 변경 실패:", e);
      alert("이름 변경에 실패했습니다.");
    }
  };

  // PIN 팝업 오버레이
  if (pinCode) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <p className="text-sm text-muted-foreground mb-2 font-semibold">앱에서 아래 코드를 입력하세요</p>
        <div className="flex gap-2 mb-4">
          {pinCode.split("").map((digit, i) => (
            <span key={i} className="text-4xl font-black text-primary bg-primary/10 border-2 border-primary/30 rounded-xl w-14 h-16 flex items-center justify-center">
              {digit}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 mb-6">
          <div className={`w-2 h-2 rounded-full ${pinRemainingSeconds > 30 ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
          <span className={`text-sm font-bold ${pinRemainingSeconds > 30 ? 'text-emerald-500' : 'text-amber-500'}`}>
            {Math.floor(pinRemainingSeconds / 60)}:{(pinRemainingSeconds % 60).toString().padStart(2, "0")} 남음
          </span>
        </div>
        <Button variant="secondary" onClick={() => setPinCode(null)}>취소</Button>
      </div>
    );
  }

  if (isDevicesLoading) {
    return (
      <div className="flex justify-center py-10">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {registeredDevices.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground text-sm mb-1">등록된 기기가 없습니다</p>
          <p className="text-muted-foreground/70 text-xs">아래 버튼으로 안드로이드 앱폰을 연동해주세요</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
          {registeredDevices.map((device) => (
            <div key={device.device_id} className="flex items-center justify-between bg-muted/30 p-3 rounded-lg border border-border">
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                {editingDeviceId === device.device_id ? (
                  <div className="flex gap-2">
                    <Input type="text" value={editingName} onChange={(e) => setEditingName(e.target.value)}
                      placeholder="기기 별명 입력" className="h-7 text-xs flex-1" autoFocus
                      onKeyDown={(e) => e.key === "Enter" && handleSaveDeviceName(device.device_id)} />
                    <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => handleSaveDeviceName(device.device_id)}>확인</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => setEditingDeviceId(null)}>취소</Button>
                  </div>
                ) : (
                  <>
                    <span className="text-sm font-bold truncate">{device.device_name || device.device_id.slice(0, 12) + "…"}</span>
                    <span className="text-[10px] text-muted-foreground font-mono truncate">{device.device_id.slice(0, 16)}…</span>
                  </>
                )}
              </div>
              {editingDeviceId !== device.device_id && (
                <div className="flex items-center gap-1 ml-2 shrink-0">
                  <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => { setEditingDeviceId(device.device_id); setEditingName(device.device_name || ""); }}>별명수정</Button>
                  <Button size="sm" variant="destructive" className="h-7 text-[10px]" onClick={() => handleDeleteDevice(device.device_id)}>해제</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Button variant="outline" className="w-full h-12 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10" onClick={handleRequestPin}>
        + 새 기기 연동하기
      </Button>

      <div className="flex justify-end mt-2">
        <Button variant="ghost" onClick={onClose}>닫기</Button>
      </div>
    </div>
  );
}
