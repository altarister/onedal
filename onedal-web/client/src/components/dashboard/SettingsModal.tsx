import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient } from "../../api/apiClient";
import { socket } from "../../lib/socket";
import { VEHICLE_OPTIONS } from "@onedal/shared";
import { soundManager } from "../../lib/soundManager";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Switch } from "../ui/switch";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
// removed Select

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface RegisteredDevice {
  device_id: string;
  device_name: string | null;
  registered_at: string;
}

type TabType = "settings" | "dispatch" | "devices";

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>("settings");
  const [volume, setVolume] = useState(50); // 0-100

  // ═══ 기본 설정 탭 상태 ═══
  const [vehicleType, setVehicleType] = useState<string>("1t");
  const [defaultPriority, setDefaultPriority] = useState<string>("RECOMMEND");
  const [homeAddress, setHomeAddress] = useState<string>("");
  const [destinationCity, setDestinationCity] = useState<string>("");
  const [destinationRadiusKm, setDestinationRadiusKm] = useState<string>("");
  const [corridorRadiusKm, setCorridorRadiusKm] = useState<string>("");
  const [isActive, setIsActive] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(false);

  // ═══ 요율/필터 설정 탭 상태 ═══
  const [vehicleRates, setVehicleRates] = useState<Record<string, number>>({});
  const [agencyFeePercent, setAgencyFeePercent] = useState(23);
  const [maxDiscountPercent, setMaxDiscountPercent] = useState(10);
  const [minFare, setMinFare] = useState<number | undefined>();
  const [maxFare, setMaxFare] = useState<number | undefined>();
  const [pickupRadiusKm, setPickupRadiusKm] = useState<number | undefined>();
  const [excludedKeywords, setExcludedKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState("");
  const [isPricingLoading, setIsPricingLoading] = useState(false);

  // ═══ 기기 관리 탭 상태 ═══
  const [registeredDevices, setRegisteredDevices] = useState<RegisteredDevice[]>([]);
  const [isDevicesLoading, setIsDevicesLoading] = useState(false);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  // ═══ PIN 페어링 팝업 상태 ═══
  const [pinCode, setPinCode] = useState<string | null>(null);
  const [pinExpiresAt, setPinExpiresAt] = useState<number>(0);
  const [pinRemainingSeconds, setPinRemainingSeconds] = useState(0);

  // ═══ 기기 관리 로직 ═══
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
    if (isOpen) {
      if (activeTab === "dispatch") { loadPricing(); }
      if (activeTab === "settings") {
        loadSettings();
        setVolume(Math.round(soundManager.getVolume() * 100));
      }
      if (activeTab === "devices") loadRegisteredDevices();
    }
  }, [isOpen, activeTab]);

  // PIN 카운트다운 타이머
  useEffect(() => {
    if (!pinCode) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((pinExpiresAt - Date.now()) / 1000));
      setPinRemainingSeconds(remaining);
      if (remaining <= 0) {
        setPinCode(null); // 만료 시 자동 닫힘
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [pinCode, pinExpiresAt]);

  // 소켓 이벤트: 앱에서 PIN 입력 완료 시 자동 새로고침
  useEffect(() => {
    const onDevicePaired = () => {
      setPinCode(null); // PIN 팝업 닫기
      loadRegisteredDevices(); // 기기 목록 새로고침
    };
    socket.on("device-paired", onDevicePaired);
    return () => { socket.off("device-paired", onDevicePaired); };
  }, [loadRegisteredDevices]);

  // ═══ 기본 설정 로직 ═══
  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const { data } = await apiClient.get('/settings');
      setVehicleType(data.vehicleType || "1t");
      setDefaultPriority(data.defaultPriority || 'RECOMMEND');
      setHomeAddress(data.homeAddress || "");
      setDestinationCity(data.destinationCity || "");
      setDestinationRadiusKm(data.destinationRadiusKm?.toString() || "");
      setCorridorRadiusKm(data.corridorRadiusKm?.toString() || "");
      setIsActive(data.isActive || false);
    } catch (e) {
      console.error("Failed to load settings:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setIsLoading(true);
      await apiClient.put('/settings', { 
        vehicleType, 
        defaultPriority, 
        homeAddress,
        destinationCity,
        destinationRadiusKm: destinationRadiusKm ? parseInt(destinationRadiusKm, 10) : undefined,
        corridorRadiusKm: corridorRadiusKm ? parseInt(corridorRadiusKm, 10) : undefined,
        isActive
      });
      onClose();
    } catch (e) {
      console.error("Failed to save settings:", e);
      alert("설정 저장에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  // ═══ 요율/필터 설정 로직 ═══
  const loadPricing = async () => {
    try {
      setIsPricingLoading(true);
      const { data } = await apiClient.get('/settings/pricing');
      setVehicleRates(data.vehicleRates || {});
      setAgencyFeePercent(data.agencyFeePercent ?? 23);
      setMaxDiscountPercent(data.maxDiscountPercent ?? 10);
      setMinFare(data.minFare);
      setMaxFare(data.maxFare);
      setPickupRadiusKm(data.pickupRadiusKm);
      setExcludedKeywords(data.excludedKeywords || []);
    } catch (e) {
      console.error("Failed to load pricing:", e);
    } finally {
      setIsPricingLoading(false);
    }
  };

  const handleSavePricing = async () => {
    try {
      setIsPricingLoading(true);
      await apiClient.put('/settings/pricing', {
        vehicleRates, agencyFeePercent, maxDiscountPercent, excludedKeywords, minFare, maxFare, pickupRadiusKm
      });
      // 차종, 경로 등 기본 설정도 동시 저장
      await apiClient.put('/settings', { 
        vehicleType, 
        defaultPriority, 
        homeAddress,
        destinationCity,
        destinationRadiusKm: destinationRadiusKm ? parseInt(destinationRadiusKm as string, 10) : undefined,
        corridorRadiusKm: corridorRadiusKm ? parseInt(corridorRadiusKm as string, 10) : undefined,
        isActive
      });
      onClose();
    } catch (e) {
      console.error("Failed to save pricing:", e);
      alert("요율 설정 저장에 실패했습니다.");
    } finally {
      setIsPricingLoading(false);
    }
  };

  // ═══ 기기 관리 로직 ═══


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

  const handleVolumeChange = (v: number) => {
    setVolume(v);
    soundManager.setVolume(v / 100);
  };

  const handleTestSound = () => {
    soundManager.playBeep();
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

  // ═══ PIN 발급 팝업 (overlay) ═══
  const renderPinOverlay = () => {
    if (!pinCode) return null;
    return (
      <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm rounded-lg">
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
        <Button variant="secondary" onClick={() => setPinCode(null)}>
          취소
        </Button>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-card border-border text-card-foreground">
        <DialogHeader className="mb-2">
          <DialogTitle className="flex justify-between items-center text-xl font-bold">
            사용자 설정
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                logout();
                onClose();
              }}
            >
              로그아웃
            </Button>
          </DialogTitle>
        </DialogHeader>

        {renderPinOverlay()}

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="settings">기본 설정</TabsTrigger>
            <TabsTrigger value="dispatch">요율/필터</TabsTrigger>
            <TabsTrigger value="devices">기기 설정</TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="space-y-4 outline-none">
            {isLoading ? (
              <div className="flex justify-center py-10">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* 무인 서핑 모드 */}
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-bold">🚀 무인 서핑 모드 (Full Auto)</h3>
                    <p className="text-[10px] text-muted-foreground">이 모드를 켜면 꿀콜을 자동으로 낚아채고 평가합니다.</p>
                  </div>
                  <Switch checked={isActive} onCheckedChange={setIsActive} />
                </div>

                {/* 내 차량 종류 */}
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-muted-foreground">내 차량 종류</label>
                  <select
                    value={vehicleType}
                    onChange={(e) => setVehicleType(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {VEHICLE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt} className="bg-background">{opt}</option>
                    ))}
                  </select>
                </div>

                {/* 경로/집 */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">경로 탐색 옵션</label>
                    <select
                      value={defaultPriority}
                      onChange={(e) => setDefaultPriority(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="RECOMMEND" className="bg-background">추천</option>
                      <option value="TIME" className="bg-background">최단시간</option>
                      <option value="DISTANCE" className="bg-background">최단거리</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">🏠 집 주소</label>
                    <Input
                      type="text"
                      value={homeAddress}
                      onChange={(e) => setHomeAddress(e.target.value)}
                      placeholder="경기 광주시 오포읍..."
                      className="h-9"
                    />
                  </div>
                </div>

                {/* 볼륨 */}
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-semibold text-muted-foreground">시스템 알림 볼륨</label>
                    <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">{volume}%</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={volume}
                      onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
                      className="flex-1 h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                    <Button variant="outline" size="sm" onClick={handleTestSound}>🔊 테스트</Button>
                  </div>
                </div>

                <div className="flex justify-end gap-2 mt-2">
                  <Button variant="ghost" onClick={onClose}>취소</Button>
                  <Button onClick={handleSaveSettings}>설정 저장</Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="dispatch" className="space-y-4 outline-none max-h-[60vh] overflow-y-auto pr-1">
            {isPricingLoading || isLoading ? (
              <div className="flex justify-center py-10">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* 차종별 단가 */}
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-muted-foreground">💰 차종별 km당 적정 단가 (원)</label>
                  <div className="grid grid-cols-3 gap-2">
                    {VEHICLE_OPTIONS.map((vType) => (
                      <div key={vType} className="flex items-center gap-1">
                        <span className="text-[11px] text-muted-foreground w-12 shrink-0 text-right">{vType}</span>
                        <Input
                          type="number"
                          value={vehicleRates[vType] || ''}
                          onChange={(e) => setVehicleRates(prev => ({ ...prev, [vType]: Number(e.target.value) || 0 }))}
                          className="h-8 text-right"
                          placeholder="0"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* 수수료 & 할인율 */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">📊 퀵사 수수료율 (%)</label>
                    <Input
                      type="number"
                      value={agencyFeePercent}
                      onChange={(e) => setAgencyFeePercent(Number(e.target.value) || 0)}
                      className="h-9 text-center font-bold"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">🔻 최대 할인율 (%)</label>
                    <Input
                      type="number"
                      value={maxDiscountPercent}
                      onChange={(e) => setMaxDiscountPercent(Number(e.target.value) || 0)}
                      className="h-9 text-center font-bold"
                    />
                  </div>
                </div>

                {/* 하한가 & 상한가 */}
                <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">⬇️ 첫짐 절대 하한가 (원)</label>
                    <Input
                      type="number"
                      value={minFare || ''}
                      onChange={(e) => setMinFare(Number(e.target.value) || 0)}
                      placeholder="30000"
                      className="h-9 font-bold"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">⬆️ 절대 상한가 (원)</label>
                    <Input
                      type="number"
                      value={maxFare || ''}
                      onChange={(e) => setMaxFare(Number(e.target.value) || 0)}
                      placeholder="1000000"
                      className="h-9 font-bold"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">🎯 상차 반경 (km)</label>
                  <Input
                    type="number"
                    value={pickupRadiusKm || ''}
                    onChange={(e) => setPickupRadiusKm(Number(e.target.value) || 0)}
                    placeholder="10"
                    className="h-9 font-bold"
                  />
                </div>

                {/* 블랙리스트 */}
                <div className="space-y-1.5 pt-2 border-t">
                  <label className="text-sm font-semibold text-muted-foreground">🚫 블랙리스트 키워드</label>
                  <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
                    {excludedKeywords.map((kw, i) => (
                      <span key={i} className="inline-flex items-center gap-1 bg-destructive/10 text-destructive text-[11px] font-bold px-2 py-0.5 rounded-full border border-destructive/20">
                        {kw}
                        <button onClick={() => setExcludedKeywords(prev => prev.filter((_, idx) => idx !== i))} className="hover:opacity-70">×</button>
                      </span>
                    ))}
                  </div>
                  <Input
                    type="text"
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newKeyword.trim()) {
                        setExcludedKeywords(prev => [...prev, newKeyword.trim()]);
                        setNewKeyword('');
                      }
                    }}
                    placeholder="제외할 키워드 입력 후 Enter"
                    className="h-9"
                  />
                </div>

                {/* 기본 노선 */}
                <div className="space-y-1.5 pt-2 border-t">
                  <label className="text-sm font-semibold text-muted-foreground">📍 내 노선 기본 설정</label>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-semibold text-muted-foreground">도착 시/도</label>
                      <Input
                        type="text"
                        value={destinationCity}
                        onChange={(e) => setDestinationCity(e.target.value)}
                        placeholder="경기"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-semibold text-muted-foreground">도착 반경(km)</label>
                      <Input
                        type="number"
                        value={destinationRadiusKm}
                        onChange={(e) => setDestinationRadiusKm(e.target.value)}
                        placeholder="10"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-semibold text-muted-foreground">우회 허용(km)</label>
                      <Input
                        type="number"
                        value={corridorRadiusKm}
                        onChange={(e) => setCorridorRadiusKm(e.target.value)}
                        placeholder="1"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 mt-2">
                  <Button variant="ghost" onClick={onClose}>취소</Button>
                  <Button onClick={handleSavePricing}>설정 저장</Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="devices" className="space-y-4 outline-none">
            {isDevicesLoading ? (
              <div className="flex justify-center py-10">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : registeredDevices.length === 0 ? (
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
                          <Input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            placeholder="기기 별명 입력"
                            className="h-7 text-xs flex-1"
                            autoFocus
                            onKeyDown={(e) => e.key === "Enter" && handleSaveDeviceName(device.device_id)}
                          />
                          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => handleSaveDeviceName(device.device_id)}>확인</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => setEditingDeviceId(null)}>취소</Button>
                        </div>
                      ) : (
                        <>
                          <span className="text-sm font-bold truncate">
                            {device.device_name || device.device_id.slice(0, 12) + "…"}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono truncate">{device.device_id.slice(0, 16)}…</span>
                        </>
                      )}
                    </div>
                    {editingDeviceId !== device.device_id && (
                      <div className="flex items-center gap-1 ml-2 shrink-0">
                        <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => {
                            setEditingDeviceId(device.device_id);
                            setEditingName(device.device_name || "");
                        }}>별명수정</Button>
                        <Button size="sm" variant="destructive" className="h-7 text-[10px]" onClick={() => handleDeleteDevice(device.device_id)}>해제</Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <Button
              variant="outline"
              className="w-full h-12 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10"
              onClick={handleRequestPin}
            >
              + 새 기기 연동하기
            </Button>

            <div className="flex justify-end mt-2">
              <Button variant="ghost" onClick={onClose}>닫기</Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
