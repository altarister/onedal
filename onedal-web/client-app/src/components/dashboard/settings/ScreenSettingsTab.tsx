import { useState, useEffect } from "react";
import { apiClient } from "../../../api/apiClient";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { MOTION_HOLD_SEC_DEFAULT } from "@onedal/shared";
import { useSettingsStore } from "../../../stores/settingsStore";

/**
 * 🖥️ **화면 설정 탭** — «화면이 어떻게 반응하나»를 정하는 자리 (기사님 제안).
 *
 * 기사님: *"기본 설정 / 요율·필터 / 판정 기준 / 기기 설정 … 여기에 **화면 설정**
 * 이렇게 탭을 하나 더 만들면 어때?"*
 *
 * 🔴 **다른 탭과 답하는 질문이 다르다** — 요율·판정은 «콜을 어떻게 고르나»이고,
 *    여기는 «내가 보는 화면이 언제 어떻게 움직이나»다. 섞으면 한 탭이 두 얘기를 한다.
 */
export default function ScreenSettingsTab() {
    const [motionHoldSec, setMotionHoldSec] = useState<number>(MOTION_HOLD_SEC_DEFAULT);
    const [loading, setLoading] = useState(true);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await apiClient.get('/settings');
                setMotionHoldSec(data?.motionHoldSec ?? MOTION_HOLD_SEC_DEFAULT);
            } catch (e) {
                console.error("화면 설정을 못 읽었습니다:", e);
            } finally { setLoading(false); }
        })();
    }, []);

    const save = async () => {
        try {
            await apiClient.put('/settings', { motionHoldSec });
            /* 🔴 저장했으면 **그 자리에서** 스토어도 고친다 — 다시 묻지 않고, 화면이 곧바로 따른다 */
            useSettingsStore.getState().setMotionHoldSec(motionHoldSec);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (e) {
            console.error("화면 설정 저장 실패:", e);
        }
    };

    if (loading) return <div className="text-[12px] font-bold text-text-muted">읽는 중…</div>;

    return (
        <div className="space-y-3.5">
            <div className="rounded-lg border border-border-card p-3.5 bg-surface-alt/20 space-y-3">
                <div className="flex items-center justify-between border-b border-border-card pb-2">
                    <div>
                        <span className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                            ⏱️ 주행 · 정차 감지 및 시트 전환 시간
                        </span>
                        <p className="text-[10.5px] text-text-muted mt-0.5">속도 변화 감지 후 화면 시트가 자동으로 접히고 펴지는 대기 시간입니다.</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Input id="motion-hold" type="number" min={1} max={60}
                            value={motionHoldSec}
                            onChange={e => setMotionHoldSec(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
                            className="w-18 h-8 text-right text-xs font-bold tabular-nums" />
                        <span className="text-xs text-text-muted">초</span>
                    </div>
                </div>

                {/* 빠른 설정 칩 */}
                <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-text-muted font-medium mr-1">추천 설정:</span>
                    {[5, 10, 15, 30].map(sec => (
                        <button
                            key={sec}
                            type="button"
                            onClick={() => setMotionHoldSec(sec)}
                            className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                                motionHoldSec === sec
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-surface border border-border text-text-muted hover:text-text-primary'
                            }`}
                        >
                            {sec}초
                        </button>
                    ))}
                </div>

                {/* 동작 가이드 카드 */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="bg-surface/70 rounded p-2 border border-border/50">
                        <span className="text-xs font-bold text-primary block mb-0.5">🚗 20km/h 초과 시 (주행)</span>
                        <p className="text-[10.5px] text-text-muted leading-relaxed">
                            {motionHoldSec}초 동안 유지되면 <b>주행 중</b>으로 판정하여 시트가 자동으로 내려가 지도가 넓어집니다.
                        </p>
                    </div>
                    <div className="bg-surface/70 rounded p-2 border border-border/50">
                        <span className="text-xs font-bold text-success block mb-0.5">🅿️ 5km/h 미만 시 (정차)</span>
                        <p className="text-[10.5px] text-text-muted leading-relaxed">
                            {motionHoldSec}초 동안 머물면 <b>정차</b>로 판정하여 콜 목록과 상세 시트가 다시 펼쳐집니다.
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border-card">
                <div>
                    {saved && <span className="text-xs font-bold text-success">✅ 화면 설정이 저장되었습니다</span>}
                </div>
                <Button size="sm" onClick={save} className="font-bold">저장하기</Button>
            </div>
        </div>
    );
}
