import { useState, useEffect } from "react";
import { apiClient } from "../../../api/apiClient";
import { useCityOptions, resolveCity } from "../../../lib/cityOptions";
import { VEHICLE_OPTIONS } from "@onedal/shared";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

interface Props {
  onClose: () => void;
}

export default function PricingSettingsTab({ onClose }: Props) {
  const [vehicleRates, setVehicleRates] = useState<Record<string, number>>({});
  const [agencyFeePercent, setAgencyFeePercent] = useState(23);
  const [maxDiscountPercent, setMaxDiscountPercent] = useState(10);
  const [minFare, setMinFare] = useState<number | undefined>();
  const [maxFare, setMaxFare] = useState<number | undefined>();
  const [pickupRadiusKm, setPickupRadiusKm] = useState<number | undefined>();
  const [excludedKeywords, setExcludedKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState("");
  const [destinationCity, setDestinationCity] = useState<string>("");
  const [destinationRadiusKm, setDestinationRadiusKm] = useState<string>("");
  const [corridorRadiusKm, setCorridorRadiusKm] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  const cityGroups = useCityOptions();
  const knownCities = cityGroups.flatMap(g => g.cities);
  // 옛 저장값(`파주`)을 정식 이름(`파주시`)으로 끌어올린다 — 못 찾으면 그대로 둔다
  useEffect(() => {
    if (!destinationCity || !cityGroups.length) return;
    if (knownCities.includes(destinationCity)) return;
    const resolved = resolveCity(destinationCity, cityGroups);
    if (resolved) setDestinationCity(resolved);
  }, [cityGroups, destinationCity]);

  useEffect(() => {
    loadPricing();
  }, []);

  const loadPricing = async () => {
    try {
      setIsLoading(true);
      const [pricingRes, settingsRes] = await Promise.all([
        apiClient.get('/settings/pricing'),
        apiClient.get('/settings'),
      ]);
      const p = pricingRes.data;
      const s = settingsRes.data;
      setVehicleRates(p.vehicleRates || {});
      setAgencyFeePercent(p.agencyFeePercent ?? 23);
      setMaxDiscountPercent(p.maxDiscountPercent ?? 10);
      setMinFare(p.minFare);
      setMaxFare(p.maxFare);
      setPickupRadiusKm(p.pickupRadiusKm);
      setExcludedKeywords(p.excludedKeywords || []);
      setDestinationCity(s.destinationCity || "");
      setDestinationRadiusKm(s.destinationRadiusKm?.toString() || "");
      setCorridorRadiusKm(s.corridorRadiusKm?.toString() || "");
    } catch (e) {
      console.error("Failed to load pricing:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSavePricing = async () => {
    try {
      setIsLoading(true);
      await apiClient.put('/settings/pricing', {
        vehicleRates, agencyFeePercent, maxDiscountPercent, excludedKeywords, minFare, maxFare, pickupRadiusKm
      });
      await apiClient.put('/settings', {
        destinationCity,
        destinationRadiusKm: destinationRadiusKm ? parseInt(destinationRadiusKm, 10) : undefined,
        corridorRadiusKm: corridorRadiusKm ? parseInt(corridorRadiusKm, 10) : undefined,
      });
      onClose();
    } catch (e) {
      console.error("Failed to save pricing:", e);
      alert("요율 설정 저장에 실패했습니다.");
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
      {/* 차종별 단가 */}
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-text-muted">💰 차종별 km당 적정 단가 (원)</label>
        <div className="grid grid-cols-3 gap-2">
          {VEHICLE_OPTIONS.map((vType) => (
            <div key={vType} className="flex items-center gap-1">
              <span className="text-[11px] text-text-muted w-12 shrink-0 text-right">{vType}</span>
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
          <label className="text-xs font-semibold text-text-muted">📊 퀵사 수수료율 (%)</label>
          <Input type="number" value={agencyFeePercent} onChange={(e) => setAgencyFeePercent(Number(e.target.value) || 0)} className="h-9 text-center font-bold" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-text-muted">🔻 최대 할인율 (%)</label>
          <Input type="number" value={maxDiscountPercent} onChange={(e) => setMaxDiscountPercent(Number(e.target.value) || 0)} className="h-9 text-center font-bold" />
        </div>
      </div>

      {/* 하한가 & 상한가 */}
      <div className="grid grid-cols-2 gap-3 pt-2 border-t">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-text-muted">⬇️ 첫짐 절대 하한가 (원)</label>
          <Input type="number" value={minFare || ''} onChange={(e) => setMinFare(Number(e.target.value) || 0)} placeholder="30000" className="h-9 font-bold" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-text-muted">⬆️ 절대 상한가 (원)</label>
          <Input type="number" value={maxFare || ''} onChange={(e) => setMaxFare(Number(e.target.value) || 0)} placeholder="1000000" className="h-9 font-bold" />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-text-muted">🎯 상차 반경 (km)</label>
        <Input type="number" value={pickupRadiusKm || ''} onChange={(e) => setPickupRadiusKm(Number(e.target.value) || 0)} placeholder="10" className="h-9 font-bold" />
      </div>

      {/* 블랙리스트 */}
      <div className="space-y-1.5 pt-2 border-t">
        <label className="text-sm font-semibold text-text-muted">🚫 블랙리스트 키워드</label>
        <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
          {excludedKeywords.map((kw, i) => (
            <span key={i} className="inline-flex items-center gap-1 bg-destructive/10 text-destructive text-[11px] font-bold px-2 py-0.5 rounded-full border border-destructive/20">
              {kw}
              <button onClick={() => setExcludedKeywords(prev => prev.filter((_, idx) => idx !== i))} className="hover:opacity-70">×</button>
            </span>
          ))}
        </div>
        <Input
          type="text" value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newKeyword.trim()) {
              setExcludedKeywords(prev => [...prev, newKeyword.trim()]);
              setNewKeyword('');
            }
          }}
          placeholder="제외할 키워드 입력 후 Enter" className="h-9"
        />
      </div>

      {/* 기본 노선 */}
      <div className="space-y-1.5 pt-2 border-t">
        <label className="text-sm font-semibold text-text-muted">📍 내 노선 기본 설정</label>
        {/* 관제탑의 돋보기 필터와 **다른 값**이다. 화면에 그 구분이 없어서
            "설정에는 파주인데 필터를 열면 용인" 이 되었다 */}
        <p className="text-[10px] text-text-muted break-keep">
          <b>매일 아침 여기서 시작</b>합니다. 오늘만 다르게 사냥하려면 관제탑의 🔍 필터에서 바꾸세요 —
          그 값은 자정에 여기로 돌아옵니다.
        </p>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-text-muted">도착 시/군</label>
            {/* 자유 입력이었을 때 `파주` 가 저장됐고, 필터 모달의 고정 목록(`파주시`)과
                맞지 않아 화면이 엉뚱한 도시를 보여줬다. 두 화면이 같은 목록을 쓴다 */}
            <select
              value={destinationCity}
              onChange={(e) => setDestinationCity(e.target.value)}
              className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {!knownCities.includes(destinationCity) && (
                <option value={destinationCity} className="bg-surface-alt">
                  {destinationCity ? `⚠️ ${destinationCity} (목록에 없음)` : '— 선택 —'}
                </option>
              )}
              {cityGroups.map(g => (
                <optgroup key={g.sido} label={g.sido}>
                  {g.cities.map(c => <option key={c} value={c} className="bg-surface-alt">{c}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-text-muted">도착 반경(km)</label>
            <Input type="number" value={destinationRadiusKm} onChange={(e) => setDestinationRadiusKm(e.target.value)} placeholder="10" className="h-8 text-xs" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-text-muted">우회 허용(km)</label>
            <Input type="number" value={corridorRadiusKm} onChange={(e) => setCorridorRadiusKm(e.target.value)} placeholder="1" className="h-8 text-xs" />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-2">
        <Button variant="ghost" onClick={onClose}>취소</Button>
        <Button onClick={handleSavePricing}>설정 저장</Button>
      </div>
    </div>
  );
}
