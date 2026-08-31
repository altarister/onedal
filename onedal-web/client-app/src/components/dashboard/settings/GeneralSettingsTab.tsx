import { useState, useEffect } from "react";
import { apiClient } from "../../../api/apiClient";
import { VEHICLE_OPTIONS } from "@onedal/shared";
import { soundManager } from "../../../lib/soundManager";
import { Switch } from "../../ui/switch";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

interface Props {
  onClose: () => void;
}

export default function GeneralSettingsTab({ onClose }: Props) {
  const [vehicleType, setVehicleType] = useState<string>("1t");
  const [defaultPriority, setDefaultPriority] = useState<string>("RECOMMEND");
  const [homeAddress, setHomeAddress] = useState<string>("");
  const [homeCoords, setHomeCoords] = useState<{ x: number; y: number } | null>(null);
  const [isGeocodingLoading, setIsGeocodingLoading] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [isActive, setIsActive] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(false);
  const [volume, setVolume] = useState(50);
  const [pickerAlarmMinFare, setPickerAlarmMinFare] = useState(10000);

  useEffect(() => {
    loadSettings();
    setVolume(Math.round(soundManager.getVolume() * 100));
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const { data } = await apiClient.get('/settings');
      setVehicleType(data.vehicleType || "1t");
      setDefaultPriority(data.defaultPriority || 'RECOMMEND');
      setHomeAddress(data.homeAddress || "");
      setHomeCoords(null);
      setGeocodeError(null);
      setIsActive(data.isActive || false);
      setPickerAlarmMinFare(data.pickerAlarmMinFare ?? 10000);
    } catch (e) {
      console.error("Failed to load settings:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyAddress = async () => {
    if (!homeAddress.trim()) return;
    try {
      setIsGeocodingLoading(true);
      setGeocodeError(null);
      const { data } = await apiClient.get(`/settings/geocode?address=${encodeURIComponent(homeAddress.trim())}`);
      setHomeCoords({ x: data.x, y: data.y });
    } catch (e: any) {
      setHomeCoords(null);
      setGeocodeError(e?.response?.data?.error || "주소 검증에 실패했습니다.");
    } finally {
      setIsGeocodingLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setIsLoading(true);
      // 노선·반경은 여기서 보내지 않는다 — 편집 자리는 🔍 필터 국면 탭 하나 (④ 철거)
      await apiClient.put('/settings', {
        vehicleType, defaultPriority, homeAddress,
        homeX: homeCoords?.x, homeY: homeCoords?.y,
        isActive,
        pickerAlarmMinFare
      });
      onClose();
    } catch (e) {
      console.error("Failed to save settings:", e);
      alert("설정 저장에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVolumeChange = (v: number) => {
    setVolume(v);
    soundManager.setVolume(v / 100);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/*
        🎛️ **콜 필터 켬/끔** — 용어집 §1 의 그 스위치다 (`isActive`).
        기기별 모드(`mode: AUTO/MANUAL`)의 **집계**라 이름이 같다 —
        AUTO 기기가 하나라도 있으면 켜진 것으로 파생된다 (`devices.ts` 의 hasAnyAutoDevice).

        ⚠️ 이름을 두 번 고쳤다 (2026-08-29): «무인 서핑 모드»는 용어집이 폐기한 말이었고,
           그 대응어 «상세 수집»(팝업을 넘겨 적요를 읽는 것)은 **이 스위치가 아니다.**
           잠시 «자동 콜 잡기»로 뒀다가, 기기 모드와 같은 개념임이 확인돼 용어집 등재어로 맞췄다
      */}
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="space-y-0.5">
          <h3 className="text-sm font-bold">🚀 콜 필터 (Full Auto)</h3>
          <p className="text-[10px] text-text-muted">켜면 앱이 필터로 콜을 잡습니다 (필터콜). 끄면 보고만 하고 못 잡습니다.</p>
        </div>
        <Switch checked={isActive} onCheckedChange={setIsActive} />
      </div>

      {/* 내 차량 종류 */}
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-text-muted">내 차량 종류</label>
        <select
          value={vehicleType}
          onChange={(e) => setVehicleType(e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {VEHICLE_OPTIONS.map((opt) => (
            <option key={opt} value={opt} className="bg-surface-alt">{opt}</option>
          ))}
        </select>
      </div>

      {/* 경로/집 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-text-muted">경로 탐색 옵션</label>
          <select
            value={defaultPriority}
            onChange={(e) => setDefaultPriority(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="RECOMMEND" className="bg-surface-alt">추천</option>
            <option value="TIME" className="bg-surface-alt">최단시간</option>
            <option value="DISTANCE" className="bg-surface-alt">최단거리</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-text-muted">🏠 집 주소</label>
          <div className="flex gap-1.5">
            <Input
              type="text"
              value={homeAddress}
              onChange={(e) => { setHomeAddress(e.target.value); setHomeCoords(null); setGeocodeError(null); }}
              placeholder="경기 광주시 오포읍..."
              className="h-9 flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleVerifyAddress}
              disabled={isGeocodingLoading || !homeAddress.trim()}
              className="h-9 px-2 text-[11px] shrink-0 whitespace-nowrap"
            >
              {isGeocodingLoading ? '⏳' : '📍 위치 확인'}
            </Button>
          </div>
          {homeCoords && (
            <p className="text-[10px] text-success font-semibold">✅ 좌표 확인 완료 ({homeCoords.x.toFixed(5)}, {homeCoords.y.toFixed(5)})</p>
          )}
          {geocodeError && (
            <p className="text-[10px] text-destructive font-semibold">❌ {geocodeError}</p>
          )}
        </div>
      </div>

      {/* 🔔 픽커 알람 하한 — 픽커는 배송거리가 없어 단가식이 안 되는 판이라 하한 하나로 거른다 (픽커_수집.md 3단계) */}
      <div className="space-y-1 pt-2 border-t">
        <label className="text-sm font-semibold text-text-muted">픽커 알람 요금 하한 (원)</label>
        <input
          type="number" min="0" step="1000"
          value={pickerAlarmMinFare}
          onChange={(e) => setPickerAlarmMinFare(parseInt(e.target.value) || 0)}
          className="w-full h-9 px-2 rounded border border-border bg-surface text-sm"
        />
        <p className="text-[10px] text-text-muted">이 금액 이상인 픽커 콜만 알람이 울립니다. 상차 반경은 필터 국면 탭의 값을 함께 씁니다.</p>
      </div>

      {/* 🎭 새 화면 미리보기 (화면개편 2단계) — 켜면 지도 배경+3단 시트 무대, 끄면 즉시 옛 화면 */}
            <div className="flex items-center justify-between pt-2 border-t">
                <div>
                    <label className="text-sm font-semibold text-text-muted">🎭 새 화면 미리보기</label>
                    <p className="text-[10px] text-text-muted">지도 배경 + 끌어올리는 시트 — 비교 운행용. 언제든 꺼서 옛 화면으로</p>
                </div>
                <input type="checkbox" className="w-5 h-5 accent-blue-500"
                    defaultChecked={localStorage.getItem('stagePreview') === '1'}
                    onChange={(e) => {
                        localStorage.setItem('stagePreview', e.target.checked ? '1' : '0');
                        window.dispatchEvent(new Event('stage-preview-changed'));
                    }} />
            </div>

            {/* 볼륨 */}
      <div className="space-y-2 pt-2 border-t">
        <div className="flex justify-between items-center">
          <label className="text-sm font-semibold text-text-muted">시스템 알림 볼륨</label>
          <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">{volume}%</span>
        </div>
        <div className="flex items-center gap-4">
          <input
            type="range" min="0" max="100"
            value={volume}
            onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
            className="flex-1 h-1.5 bg-surface-alt rounded-lg appearance-none cursor-pointer accent-primary"
          />
          <Button variant="outline" size="sm" onClick={() => soundManager.playBeep()}>🔊 테스트</Button>
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-2">
        <Button variant="ghost" onClick={onClose}>취소</Button>
        <Button onClick={handleSaveSettings}>설정 저장</Button>
      </div>
    </div>
  );
}
