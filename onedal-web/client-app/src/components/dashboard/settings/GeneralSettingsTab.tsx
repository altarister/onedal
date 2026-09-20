import { useState, useEffect, useRef } from "react";
import { apiClient } from "../../../api/apiClient";
import { VEHICLE_OPTIONS, DEFAULT_WAIT_TIMES, waitSecOrNull } from "@onedal/shared";
import type { WaitTimes } from "@onedal/shared";
import { useSettingsStore } from "../../../stores/settingsStore";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { useAuth } from "../../../contexts/AuthContext";

interface Props {
  onClose: () => void;
}

export default function GeneralSettingsTab({ onClose }: Props) {
  const { logout } = useAuth();
  const [vehicleType, setVehicleType] = useState<string>("1t");
  const [defaultPriority, setDefaultPriority] = useState<string>("RECOMMEND");
  const [homeAddress, setHomeAddress] = useState<string>("");
  const [homeCoords, setHomeCoords] = useState<{ x: number; y: number } | null>(null);
  const [isGeocodingLoading, setIsGeocodingLoading] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pickerAlarmMinFare, setPickerAlarmMinFare] = useState(10000);
  /** ⏱️ 배차망별 대기 시간 (docs/지금/배차망별_대기_시간.md) */
  const [waitTimes, setWaitTimes] = useState<WaitTimes>(DEFAULT_WAIT_TIMES);
  /** 서버에서 불러온 값 — 칸을 비우거나 0 을 넣고 저장하면 이 값으로 되돌린다 (1초 미만은 고장 · waitSecOrNull) */
  const loadedWaitTimes = useRef<WaitTimes>(DEFAULT_WAIT_TIMES);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const { data } = await apiClient.get('/settings');
      setVehicleType(data.vehicleType || "1t");
      setDefaultPriority(data.defaultPriority || 'RECOMMEND');
      setHomeAddress(data.homeAddress || "");
      setHomeCoords(null);
      setGeocodeError(null);
      setPickerAlarmMinFare(data.pickerAlarmMinFare ?? 10000);
      const loaded: WaitTimes = {
        safeCancelSecInsung: data.safeCancelSecInsung ?? DEFAULT_WAIT_TIMES.safeCancelSecInsung,
        safeCancelSecHwamul24: data.safeCancelSecHwamul24 ?? DEFAULT_WAIT_TIMES.safeCancelSecHwamul24,
        pickerAlarmDetailSec: data.pickerAlarmDetailSec ?? DEFAULT_WAIT_TIMES.pickerAlarmDetailSec,
      };
      loadedWaitTimes.current = loaded;
      setWaitTimes(loaded);
    } catch (e) {
      console.error("Failed to load settings:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);


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
      // 🔴 1초 미만(빈 칸·0)은 고장이다 — 불러온 값으로 되돌려 보낸다. 서버도 같은 함수로 막는다 (waitSecOrNull)
      const prev = loadedWaitTimes.current;
      const safeWaitTimes: WaitTimes = {
        safeCancelSecInsung: waitSecOrNull(waitTimes.safeCancelSecInsung) ?? prev.safeCancelSecInsung,
        safeCancelSecHwamul24: waitSecOrNull(waitTimes.safeCancelSecHwamul24) ?? prev.safeCancelSecHwamul24,
        pickerAlarmDetailSec: waitSecOrNull(waitTimes.pickerAlarmDetailSec) ?? prev.pickerAlarmDetailSec,
      };
      // 노선·반경은 여기서 보내지 않는다 — 편집 자리는 🔍 필터 국면 탭 하나 (④ 철거)
      await apiClient.put('/settings', {
        vehicleType, defaultPriority, homeAddress,
        homeX: homeCoords?.x, homeY: homeCoords?.y,
        pickerAlarmMinFare,
        ...safeWaitTimes
      });
      // 판정석 장막 · 홀드 진행 막대가 새 값을 바로 쓰게 — 다시 묻지 않는다 (settingsStore)
      useSettingsStore.getState().setWaitTimes(safeWaitTimes);
      onClose();
    } catch (e) {
      console.error("Failed to save settings:", e);
      alert("설정 저장에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
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
        <p className="text-[10px] text-text-muted">이 금액 이상인 픽커 콜만 알람이 울립니다. 현위반경은 🔍 필터의 값을 함께 씁니다.</p>
      </div>

      {/* ⏱️ 배차망별 대기 시간 — 원천은 서버 DB, 원달앱은 받아 쓴다 (docs/지금/배차망별_대기_시간.md)
          🔴 인성 값에 상한을 걸지 않는다 — 옆 안내를 보고 기사님이 정하신다 (기사님 확정 2026-09-14) */}
      <div className="space-y-2 pt-2 border-t">
        {([
          { key: 'safeCancelSecInsung', label: '인성 안전취소 시간 (초)', hint: '인성 취소 가능 시간 1분' },
          { key: 'safeCancelSecHwamul24', label: '화물24시 안전취소 시간 (초)', hint: '화물24시 취소 가능 시간은 미확인' },
          { key: 'pickerAlarmDetailSec', label: '픽커 상세 대기 시간 (초)', hint: '상세를(알람이 열었든 손으로 열었든) 이 시간 뒤 닫고 리스트로 돌아갑니다' },
        ] as { key: keyof WaitTimes; label: string; hint: string }[]).map(({ key, label, hint }) => (
          <div key={key} className="space-y-1">
            <label className="text-sm font-semibold text-text-muted">{label}</label>
            <input
              type="number" min="1" step="1"
              value={waitTimes[key]}
              onChange={(e) => setWaitTimes(prev => ({ ...prev, [key]: parseInt(e.target.value) || 0 }))}
              className="w-full h-9 px-2 rounded border border-border bg-surface text-sm"
            />
            <p className="text-[10px] text-text-muted">{hint}</p>
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center pt-3 border-t mt-2">
        <Button
          variant="destructive"
          size="sm"
          onClick={async () => {
            if (window.confirm("정말 로그아웃 하시겠습니까?")) {
              await logout();
              onClose();
            }
          }}
        >
          로그아웃
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>취소</Button>
          <Button onClick={handleSaveSettings}>설정 저장</Button>
        </div>
      </div>
    </div>
  );
}
