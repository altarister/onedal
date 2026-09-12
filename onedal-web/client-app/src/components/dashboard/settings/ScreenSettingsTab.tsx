import { useState, useEffect } from "react";
import { apiClient } from "../../../api/apiClient";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { MOTION_HOLD_SEC_DEFAULT } from "@onedal/shared";
import { useSettingsStore } from "../../../stores/settingsStore";

/**
 * 🖥️ **화면 설정 탭** — «화면이 어떻게 반응하나»를 정하는 자리 (기사님 제안 2026-09-12).
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
        <div className="space-y-4">
            <div className="rounded-lg border border-border-card p-3 space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                    <label htmlFor="motion-hold" className="text-[13px] font-black text-text-primary">
                        ⏱️ 주행·정차로 굳는 시간
                    </label>
                    <div className="flex items-center gap-1.5">
                        <Input id="motion-hold" type="number" min={1} max={60}
                            value={motionHoldSec}
                            onChange={e => setMotionHoldSec(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
                            className="w-20 text-right tabular-nums" />
                        <span className="text-[12px] font-bold text-text-muted">초</span>
                    </div>
                </div>
                <p className="text-[11.5px] font-bold text-text-muted leading-relaxed">
                    20km/h 를 넘는 상태가 이 시간만큼 이어지면 <b className="text-text-primary">주행 중</b>,
                    5km/h 아래로 이 시간만큼 있으면 <b className="text-text-primary">정차</b>로 봅니다.
                    주행 중에는 시트가 내려가 지도가 넓어집니다.
                </p>
                {/**
                 * 🔴 **왜 고칠 수 있어야 하나** (기사님 지시 2026-09-12).
                 *    모의 주행은 배속이 빨라 정거장 사이를 2~7초에 지나간다 — 10초를
                 *    **채울 수가 없어** «주행 중»이 한 번도 성립하지 않았다.
                 *    기사님: *"모의주행할 때는 그걸 줄이고 시험하고 진짜 때는 10으로"*
                 */}
                <p className="text-[11px] font-bold text-warning leading-relaxed">
                    🎭 모의 주행으로 시험할 때는 <b>2~3초</b>로 줄이십시오 — 배속이 빨라
                    정거장 사이를 몇 초에 지나가므로 {MOTION_HOLD_SEC_DEFAULT}초로는 주행이
                    한 번도 성립하지 않습니다. <b>실제 운행은 {MOTION_HOLD_SEC_DEFAULT}초</b>가 맞습니다.
                </p>
            </div>

            <div className="flex items-center gap-2">
                <Button onClick={save} className="font-black">저장</Button>
                {saved && <span className="text-[12px] font-black text-success">저장했습니다</span>}
            </div>
        </div>
    );
}
