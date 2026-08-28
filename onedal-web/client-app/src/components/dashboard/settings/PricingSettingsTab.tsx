import { useState, useEffect } from "react";
import { apiClient } from "../../../api/apiClient";
import { VEHICLE_OPTIONS } from "@onedal/shared";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";

interface Props {
  onClose: () => void;
}

/**
 * 요율/필터 탭 — **금액 축의 원천만 남는다** (필터 확정안 v2 구현 3 · 기사님 확정 2026-08-21).
 *
 * 🔴 걷어낸 것 (전수 조사 8장의 폐기 확정):
 *   · "내 노선 기본 설정" 4칸(도착 시/군·도착 반경·상차 반경·우회 허용) — 국면 첫짐
 *     탭과 **같은 값의 두 번째 편집 화면**이었다. 평면 1km vs 국면 15km 로 갈라진
 *     "두 벌 값" 사고의 뿌리. 이제 편집 자리는 🔍 필터의 국면 탭 하나다.
 *   · 절대 하한가·상한가 — "하한 금액을 입력하지 않는다"(명세 08-13 원칙 3) 관철.
 *     하한은 단가표 × 콜할인율에서 파생된다. ⚠️ 앱 피기백의 minFare 키는 산다 —
 *     화물24 파서가 아직 그걸로 거른다 (확정안 ①-삭제 · 앱 트랙).
 *   · 평면 콜할인율 — 국면별 콜할인율(5개)이 원천 (이전 정리에서 이미 제거됨).
 */
export default function PricingSettingsTab({ onClose }: Props) {
  const [vehicleRates, setVehicleRates] = useState<Record<string, number>>({});
  const [agencyFeePercent, setAgencyFeePercent] = useState(23);
  const [excludedKeywords, setExcludedKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadPricing();
  }, []);

  const loadPricing = async () => {
    try {
      setIsLoading(true);
      const { data: p } = await apiClient.get('/settings/pricing');
      setVehicleRates(p.vehicleRates || {});
      setAgencyFeePercent(p.agencyFeePercent ?? 23);
      setExcludedKeywords(p.excludedKeywords || []);
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
        vehicleRates, agencyFeePercent, excludedKeywords,
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
      {/* 차종별 단가 — 금액 축의 원천 (정의서 3장: 통과 = 요금 ≥ 거리 × 단가 × (1−콜할인율)) */}
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

      {/* 수수료 — 할인율은 필터의 콜할인율(국면별)가 대체했다 (docs/지금/필터.md) */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-text-muted">📊 퀵사 수수료율 (%)</label>
        <Input type="number" value={agencyFeePercent} onChange={(e) => setAgencyFeePercent(Number(e.target.value) || 0)} className="h-9 text-center font-bold" />
        <p className="text-[10px] text-text-muted/70">
          🔻 할인율은 <b>🔍 필터의 국면별 콜할인율</b>에서 정합니다 — 같은 뜻의 값이 두 곳에 있으면 어느 게 진짜인지 알 수 없습니다
        </p>
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

      {/* 노선·반경의 편집 자리는 하나다 — 두 번째 편집 화면을 되살리지 않는다 */}
      <p className="text-[10px] text-text-muted break-keep pt-2 border-t">
        📍 노선·반경(도착 목표 · 상차 반경 · 우회 허용 · 하차지 주변)은 <b>관제탑 🔍 필터의 국면 탭</b>에서
        정합니다 — <b>평소값까지 변경</b>으로 저장하면 매일 아침 그 값으로 시작합니다.
        하한 금액은 입력하지 않습니다 — 단가표 × 콜할인율에서 파생됩니다.
      </p>

      <div className="flex justify-end gap-2 mt-2">
        <Button variant="ghost" onClick={onClose}>취소</Button>
        <Button onClick={handleSavePricing}>설정 저장</Button>
      </div>
    </div>
  );
}
