import { useState, useEffect } from "react";
import { apiClient } from "../../../api/apiClient";
import { VEHICLE_OPTIONS, RADIUS_BASE_KM_DEFAULT } from "@onedal/shared";
import { useFilterConfig } from "../../../hooks/useFilterConfig";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

interface Props {
  onClose: () => void;
}

/**
 * 요율/필터 탭 — **금액 축의 원천만 둔다** (기사님 확정).
 *
 * 🔴 이 탭에 두지 않는 것:
 *   · 노선 값(도착 시/군·도착 반경·상차 반경·우회 허용) — 편집 자리는 🔍 필터 하나다.
 *     같은 값을 두 화면에서 고치면 값이 두 벌로 갈라진다.
 *   · 절대 하한가·상한가 — 하한 금액은 입력받지 않고 단가표 × 콜할인율에서 파생한다.
 *     ⚠️ 앱에 보내는 minFare 키는 남아 있다 — 화물24 파서는 단가표가 없으면 그것으로 거른다.
 *   · 평면 콜할인율 — `user_filters.call_discount_pct` 한 벌이 원천이고, 🔍 필터에서 고친다.
 */
export default function PricingSettingsTab({ onClose }: Props) {
  /* 📏 기준거리는 **필터 값**이라 필터 훅을 지난다 — 설정 API 가 아니다 (규칙 ③) */
  const { filter, updateFilter } = useFilterConfig();
  const [vehicleRates, setVehicleRates] = useState<Record<string, number>>({});
  const [agencyFeePercent, setAgencyFeePercent] = useState(23);
  const [radiusBaseKm, setRadiusBaseKm] = useState<number>(filter?.radiusBaseKm ?? RADIUS_BASE_KM_DEFAULT);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (filter?.radiusBaseKm !== undefined) {
      setRadiusBaseKm(filter.radiusBaseKm);
    }
  }, [filter?.radiusBaseKm]);

  const loadPricing = async () => {
    try {
      setIsLoading(true);
      const { data: p } = await apiClient.get('/settings/pricing');
      setVehicleRates(p.vehicleRates || {});
      setAgencyFeePercent(p.agencyFeePercent ?? 23);
    } catch (e) {
      console.error("Failed to load pricing:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPricing();
  }, []);


  const handleSavePricing = async () => {
    try {
      setIsLoading(true);
      /* 📏 기준거리는 사용자가 [설정 저장]을 누를 때 단가표와 함께 영구 저장한다 (취소 시 롤백 보장) */
      if (radiusBaseKm !== filter?.radiusBaseKm) {
        const v = radiusBaseKm;
        updateFilter({ radiusBaseKm: v }, true);
      }
      await apiClient.put('/settings/pricing', {
        vehicleRates, agencyFeePercent,
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
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* 좌측: 기준거리 및 수수료 */}
        <div className="space-y-3 rounded-lg border border-border-card p-3 bg-surface-alt/20 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="border-b border-border-card pb-1.5">
              <span className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                📏 기준거리 및 수수료 환경
              </span>
              <p className="text-[10.5px] text-text-muted mt-0.5">거리 비례 자동 반경 축소 및 퀵사 수수료율 기준입니다.</p>
            </div>

            {/* 반경 기준거리 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="radius-base" className="text-xs font-semibold text-text-muted">📏 반경 기준거리 (km)</label>
                <div className="flex items-center gap-1">
                  <Input id="radius-base" type="number" min={10} max={100} step={5}
                    value={radiusBaseKm}
                    onChange={(e) => {
                      const v = Math.max(10, Math.min(100, Number(e.target.value) || RADIUS_BASE_KM_DEFAULT));
                      setRadiusBaseKm(v);
                    }}
                    className="h-8 w-20 text-right text-xs font-bold tabular-nums" />
                  <span className="text-xs text-text-muted">km</span>
                </div>
              </div>
              <p className="text-[10.5px] text-text-muted leading-relaxed">
                반경이 <b className="text-text-primary">자동</b>일 때, 목적지가 이 거리보다 가까우면 그에 맞춰 반경을 줄입니다.
              </p>
            </div>

            {/* 퀵사 수수료율 */}
            <div className="space-y-1.5 pt-2 border-t border-border-card">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-text-muted">📊 퀵사 기본 수수료율 (%)</label>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    value={agencyFeePercent}
                    onChange={(e) => setAgencyFeePercent(Number(e.target.value) || 0)}
                    className="h-8 w-20 text-right text-xs font-bold tabular-nums"
                  />
                  <span className="text-xs text-text-muted">%</span>
                </div>
              </div>
              <p className="text-[10px] text-text-muted/70">
                🔻 할인율은 <b>🔍 필터의 국면별 콜할인율</b>에서 정합니다.
              </p>
            </div>
          </div>
        </div>

        {/* 우측: 차종별 km당 적정 단가 */}
        <div className="space-y-3 rounded-lg border border-border-card p-3 bg-surface-alt/20 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="border-b border-border-card pb-1.5">
              <span className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                💰 차종별 km당 적정 단가 (원)
              </span>
              <p className="text-[10.5px] text-text-muted mt-0.5">통과 판정식: 요금 ≥ 거리 × 단가 × (1 − 콜할인율)</p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              {VEHICLE_OPTIONS.map((vType) => (
                <div key={vType} className="flex items-center justify-between bg-surface/60 rounded px-2.5 py-1.5 border border-border/50">
                  <span className="text-xs font-medium text-text-primary">{vType}</span>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      value={vehicleRates[vType] || ''}
                      onChange={(e) => setVehicleRates(prev => ({ ...prev, [vType]: Number(e.target.value) || 0 }))}
                      className="h-7 w-20 text-right text-xs tabular-nums font-semibold"
                      placeholder="0"
                    />
                    <span className="text-[10.5px] text-text-muted">원</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 하단 안내 및 버튼 */}
      <div className="pt-2 border-t border-border-card flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <p className="text-[10px] text-text-muted leading-tight">
          📍 목적지 · 제외 키워드 · 반경은 <b>관제탑 🔍 필터</b>에서 실시간 관리됩니다.
        </p>
        <div className="flex justify-end gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose}>취소</Button>
          <Button size="sm" onClick={handleSavePricing}>설정 저장</Button>
        </div>
      </div>
    </div>
  );
}
