import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient } from "../../api/apiClient";
import { socket } from "../../lib/socket";
import { VEHICLE_OPTIONS } from "@onedal/shared";
import { soundManager } from "../../lib/soundManager";

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
  }, []);

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
        corridorRadiusKm: corridorRadiusKm ? parseInt(corridorRadiusKm, 10) : undefined
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
        corridorRadiusKm: corridorRadiusKm ? parseInt(corridorRadiusKm as string, 10) : undefined
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

  if (!isOpen) return null;

  // ═══ PIN 발급 팝업 (overlay) ═══
  const renderPinOverlay = () => {
    if (!pinCode) return null;
    return (
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-950/95 rounded-2xl">
        <p className="text-sm text-gray-400 mb-2 font-semibold">앱에서 아래 코드를 입력하세요</p>
        <div className="flex gap-2 mb-4">
          {pinCode.split("").map((digit, i) => (
            <span key={i} className="text-4xl font-black text-accent bg-accent/10 border-2 border-accent/30 rounded-xl w-14 h-16 flex items-center justify-center">
              {digit}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 mb-6">
          <div className={`w-2 h-2 rounded-full ${pinRemainingSeconds > 30 ? 'bg-success' : 'bg-warning animate-pulse'}`} />
          <span className={`text-sm font-bold ${pinRemainingSeconds > 30 ? 'text-success' : 'text-warning'}`}>
            {Math.floor(pinRemainingSeconds / 60)}:{(pinRemainingSeconds % 60).toString().padStart(2, "0")} 남음
          </span>
        </div>
        <button
          onClick={() => setPinCode(null)}
          className="px-4 py-2 rounded-lg bg-gray-800 text-gray-400 text-sm font-semibold hover:bg-gray-700 transition-colors"
        >
          취소
        </button>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative bg-gray-900 border border-gray-800 p-6 rounded-2xl w-full max-w-md shadow-2xl">
        {renderPinOverlay()}

        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">사용자 설정</h2>
          <button
            onClick={() => {
              logout();
              onClose();
            }}
            className="text-xs font-bold text-red-400 hover:text-red-300 bg-red-950/30 hover:bg-red-900/40 px-3 py-1.5 rounded-lg border border-red-900/50 transition-all"
          >
            로그아웃
          </button>
        </div>

        {/* 탭 네비게이션 */}
        <div className="flex gap-1 mb-5 bg-gray-950 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab("settings")}
            className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${activeTab === "settings" ? "bg-accent text-white" : "text-gray-500 hover:text-gray-300"
              }`}
          >
            기본 설정
          </button>
          <button
            onClick={() => setActiveTab("dispatch")}
            className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${activeTab === "dispatch" ? "bg-accent text-white" : "text-gray-500 hover:text-gray-300"
              }`}
          >
            요율/필터
          </button>
          <button
            onClick={() => setActiveTab("devices")}
            className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${activeTab === "devices" ? "bg-accent text-white" : "text-gray-500 hover:text-gray-300"
              }`}
          >
            기기 설정
          </button>
        </div>

        {/* ═══ 기본 설정 탭 ═══ */}
        {activeTab === "settings" && (
          isLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {/* 내 차량 종류 */}
              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-2">내 차량 종류</label>
                <select
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 text-white text-sm rounded-lg p-3 outline-none focus:border-accent transition-colors"
                >
                  {VEHICLE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              {/* 카카오 경로 + 집 주소 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">경로 탐색 옵션</label>
                  <select
                    value={defaultPriority}
                    onChange={(e) => setDefaultPriority(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-800 text-white text-xs rounded-lg p-2.5 outline-none focus:border-accent transition-colors"
                  >
                    <option value="RECOMMEND">추천</option>
                    <option value="TIME">최단시간</option>
                    <option value="DISTANCE">최단거리</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">🏠 집 주소</label>
                  <input
                    type="text"
                    value={homeAddress}
                    onChange={(e) => setHomeAddress(e.target.value)}
                    placeholder="경기 광주시 오포읍..."
                    className="w-full bg-gray-950 border border-gray-800 text-white text-xs rounded-lg p-2.5 outline-none focus:border-violet-500 transition-colors"
                  />
                </div>
              </div>

              <div className="h-px bg-gray-800/50 w-full" />

              {/* 시스템 알림 볼륨 */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="text-sm font-semibold text-gray-400">시스템 알림 볼륨</label>
                  <span className="text-xs font-mono text-accent bg-accent/10 px-2 py-0.5 rounded">{volume}%</span>
                </div>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={volume}
                    onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
                    className="flex-1 h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-accent"
                  />
                  <button
                    onClick={handleTestSound}
                    className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 text-xs font-bold hover:bg-gray-700 hover:text-white transition-all border border-gray-700"
                  >
                    🔊 테스트
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 font-semibold hover:bg-gray-700 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleSaveSettings}
                  className="px-4 py-2 rounded-lg bg-accent text-white font-bold hover:bg-violet-500 transition-colors"
                >
                  설정 저장
                </button>
              </div>
            </div>
          )
        )}

        {/* ═══ 요율/필터 설정 탭 ═══ */}
        {activeTab === "dispatch" && (
          isPricingLoading || isLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (
            <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-1">

              {/* 차종별 km당 단가 입력기 */}
              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-2">💰 차종별 km당 적정 단가 (원)</label>
                <div className="grid grid-cols-3 gap-2">
                  {VEHICLE_OPTIONS.map((vType) => (
                    <div key={vType} className="flex items-center gap-1">
                      <span className="text-[11px] text-gray-500 w-12 shrink-0 text-right">{vType}</span>
                      <input
                        type="number"
                        value={vehicleRates[vType] || ''}
                        onChange={(e) => setVehicleRates(prev => ({ ...prev, [vType]: Number(e.target.value) || 0 }))}
                        className="w-full bg-gray-950 border border-gray-800 text-white text-xs rounded px-2 py-1.5 outline-none focus:border-accent transition-colors text-right"
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* 수수료 & 할인율 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">📊 퀵사 수수료율 (%)</label>
                  <input
                    type="number"
                    value={agencyFeePercent}
                    onChange={(e) => setAgencyFeePercent(Number(e.target.value) || 0)}
                    className="w-full bg-gray-950 border border-gray-800 text-white text-sm rounded-lg p-2.5 outline-none focus:border-accent transition-colors text-center font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">🔻 최대 할인율 (%)</label>
                  <input
                    type="number"
                    value={maxDiscountPercent}
                    onChange={(e) => setMaxDiscountPercent(Number(e.target.value) || 0)}
                    className="w-full bg-gray-950 border border-gray-800 text-white text-sm rounded-lg p-2.5 outline-none focus:border-accent transition-colors text-center font-bold"
                  />
                </div>
              </div>
              <p className="text-[10px] text-gray-600 -mt-2">
                예) 1t 100km 콜 → 적정: {((vehicleRates['1t'] || 1000) * 100 * (1 - agencyFeePercent / 100)).toLocaleString()}원,
                하한: {((vehicleRates['1t'] || 1000) * 100 * (1 - agencyFeePercent / 100) * (1 - maxDiscountPercent / 100)).toLocaleString()}원
              </p>

              <div className="h-px bg-gray-800/50 w-full" />

              {/* 하한가 & 상한가 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">⬇️ 첫짐 절대 하한가 (원)</label>
                  <input
                    type="number"
                    value={minFare || ''}
                    onChange={(e) => setMinFare(Number(e.target.value) || 0)}
                    placeholder="예: 30000"
                    className="w-full bg-gray-950 border border-gray-800 text-white text-sm rounded-lg p-2.5 outline-none focus:border-accent transition-colors font-bold"
                  />
                  <p className="mt-1 text-[10px] text-gray-600">
                    * 첫 콜을 잡을 때 무조건 이 금액 이상만 잡습니다. (합짐 모드에서는 무시됨)
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">⬆️ 절대 상한가 (원)</label>
                  <input
                    type="number"
                    value={maxFare || ''}
                    onChange={(e) => setMaxFare(Number(e.target.value) || 0)}
                    placeholder="예: 1000000"
                    className="w-full bg-gray-950 border border-gray-800 text-white text-sm rounded-lg p-2.5 outline-none focus:border-accent transition-colors font-bold"
                  />
                  <p className="mt-1 text-[10px] text-gray-600">
                    * 최대 운임 상한선 (기본값: 1,000,000원)
                  </p>
                </div>
              </div>

              <div className="mt-3">
                <label className="block text-xs font-semibold text-gray-500 mb-1">🎯 상차 반경 (km)</label>
                <input
                  type="number"
                  value={pickupRadiusKm || ''}
                  onChange={(e) => setPickupRadiusKm(Number(e.target.value) || 0)}
                  placeholder="예: 10"
                  className="w-full bg-gray-950 border border-gray-800 text-white text-sm rounded-lg p-2.5 outline-none focus:border-accent transition-colors font-bold"
                />
                <p className="mt-1 text-[10px] text-gray-600">
                  * 내 위치 기준 상차지 제한 거리 (기본값: 10km)
                </p>
              </div>

              <div className="h-px bg-gray-800/50 w-full" />

              {/* 블랙리스트 */}
              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-2">🚫 블랙리스트 키워드</label>
                <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
                  {excludedKeywords.map((kw, i) => (
                    <span key={i} className="inline-flex items-center gap-1 bg-red-950/50 border border-red-800/30 text-red-400 text-[11px] font-bold px-2 py-0.5 rounded-full">
                      {kw}
                      <button onClick={() => setExcludedKeywords(prev => prev.filter((_, idx) => idx !== i))} className="hover:text-red-200">×</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
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
                    className="flex-1 bg-gray-950 border border-gray-800 text-white text-xs rounded-lg px-3 py-2 outline-none focus:border-red-500 transition-colors"
                  />
                </div>
              </div>
              <div className="h-px bg-gray-800/50 w-full mt-3 mb-2" />

              {/* 내 노선 기본 설정 */}
              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-2">📍 내 노선 기본 설정</label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">도착 희망 시/도</label>
                    <input
                      type="text"
                      value={destinationCity}
                      onChange={(e) => setDestinationCity(e.target.value)}
                      placeholder="예: 경기"
                      className="w-full bg-gray-950 border border-gray-800 text-white text-sm rounded-lg p-2.5 outline-none focus:border-accent transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">도착 반경 (km)</label>
                    <input
                      type="number"
                      value={destinationRadiusKm}
                      onChange={(e) => setDestinationRadiusKm(e.target.value)}
                      placeholder="기본 10km"
                      className="w-full bg-gray-950 border border-gray-800 text-white text-sm rounded-lg p-2.5 outline-none focus:border-accent transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">우회 허용 반경 (km)</label>
                    <input
                      type="number"
                      value={corridorRadiusKm}
                      onChange={(e) => setCorridorRadiusKm(e.target.value)}
                      placeholder="기본 1km"
                      className="w-full bg-gray-950 border border-gray-800 text-white text-sm rounded-lg p-2.5 outline-none focus:border-accent transition-colors"
                    />
                  </div>
                </div>
                <p className="mt-1 text-[10px] text-gray-600">
                  * 관제탑 필터 모달의 기본값으로 동작하며, DB에 영구 저장됩니다.
                </p>
              </div>

              <div className="flex justify-end gap-3 mt-4">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 font-semibold hover:bg-gray-700 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleSavePricing}
                  className="px-4 py-2 rounded-lg bg-accent text-white font-bold hover:bg-violet-500 transition-colors"
                >
                  설정 저장
                </button>
              </div>
            </div>
          )
        )}

        {/* ═══ 기기 관리 탭 ═══ */}
        {activeTab === "devices" && (
          <div className="flex flex-col gap-4">
            {isDevicesLoading ? (
              <div className="flex justify-center py-10">
                <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : registeredDevices.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500 text-sm mb-1">등록된 기기가 없습니다</p>
                <p className="text-gray-600 text-xs">아래 버튼으로 안드로이드 앱폰을 연동해주세요</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                {registeredDevices.map((device) => (
                  <div key={device.device_id} className="flex items-center justify-between bg-gray-950 p-3 rounded-lg border border-gray-800">
                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                      {editingDeviceId === device.device_id ? (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            placeholder="기기 별명 입력"
                            className="flex-1 bg-gray-900 border border-accent/50 text-white text-sm rounded px-2 py-1 outline-none"
                            autoFocus
                            onKeyDown={(e) => e.key === "Enter" && handleSaveDeviceName(device.device_id)}
                          />
                          <button
                            onClick={() => handleSaveDeviceName(device.device_id)}
                            className="text-xs text-violet-400 font-bold hover:text-violet-300"
                          >확인</button>
                          <button
                            onClick={() => setEditingDeviceId(null)}
                            className="text-xs text-gray-500 font-bold hover:text-gray-400"
                          >취소</button>
                        </div>
                      ) : (
                        <>
                          <span className="text-sm font-bold text-white truncate">
                            {device.device_name || device.device_id.slice(0, 12) + "…"}
                          </span>
                          <span className="text-[10px] text-gray-600 font-mono truncate">{device.device_id.slice(0, 16)}…</span>
                        </>
                      )}
                    </div>
                    {editingDeviceId !== device.device_id && (
                      <div className="flex items-center gap-2 ml-2 shrink-0">
                        <button
                          onClick={() => {
                            setEditingDeviceId(device.device_id);
                            setEditingName(device.device_name || "");
                          }}
                          className="text-[10px] text-accent hover:brightness-125 font-bold"
                        >별명수정</button>
                        <button
                          onClick={() => handleDeleteDevice(device.device_id)}
                          className="text-[10px] text-danger hover:brightness-125 font-bold"
                        >해제</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 새 기기 연동 버튼 */}
            <button
              onClick={handleRequestPin}
              className="w-full py-3 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-success font-bold text-sm hover:bg-emerald-600/30 transition-colors"
            >
              + 새 기기 연동하기
            </button>

            <div className="flex justify-end mt-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 font-semibold hover:bg-gray-700 transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
