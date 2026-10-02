import { AutoDispatchFilter } from "@onedal/shared";
import { UserSession } from "../../state/userSessionStore";

export interface StateTransitionResult {
    /** 필터 변경 발생 여부 (true일 경우 UI 소켓 브로드캐스팅 필요) */
    changed: boolean;
    /** 변경할(덮어씌울) 새 필터 객체(부분) */
    newFilter?: Partial<AutoDispatchFilter>;
    /** 로깅을 위한 상태 전이 사유 */
    reason?: string;
}

export class StateMachine {
    /**
     * 오더가 확정(KEEP)되었을 때 상태를 전진시킵니다.
     */
    public static advanceOnKeep(
        session: UserSession,
    ): StateTransitionResult {
        const currentPhase = session.activeFilter.dispatchPhase || 'STANDBY';

        /**
         * 🔴 **경유 한 벌(키워드·묶음·별칭)은 여기서 싣지 않는다** (#81).
         *
         * 전이 직전에 `syncDetourFilter` 가 셋을 **한 벌로** 이미 넣었다. 여기서 키워드만 다시 실으면
         * 필터 매니저가 «묶음이 없으니 별칭을 못 만든다 → 비운다»로 **방금 채운 별칭을 지운다** —
         * 빈 별칭이 앱에 내려가면 동명이동 검증이 주의 동(중리동 등) 하차 콜을 전부 죽인다.
         * 전이의 일은 국면과 합짐 표시뿐이다 (규칙 ③).
         *
         * 🚚 **차종(`allowedVehicleTypes`)도 싣지 않는다** — 넘기지 않으면 필터 매니저가 지금 콜들의
         *    «함께 실리는 최대»(실린 것 · 실릴 것)로 다시 구한다(`recalculateDerivedFields`). 여기서 따로 세어 넘기면
         *    그 셈을 건너뛰어 두 셈이 갈라지고, 잡은 콜을 다 더한 거짓 만석이 원달앱에 간다.
         */
        const newFilter: Partial<AutoDispatchFilter> = {
            isSharedMode: true,
            isActive: true,
        };

        if (currentPhase === 'STANDBY') {
            newFilter.dispatchPhase = 'GATHERING';
            return { 
                changed: true, 
                newFilter, 
                reason: `첫짐 확정 (STANDBY → GATHERING)` 
            };
        } else if (currentPhase === 'GATHERING') {
            return { 
                changed: true, 
                newFilter, 
                reason: `추가 콜 확정 (GATHERING 유지)` 
            };
        } else {
            return { 
                changed: true, 
                newFilter, 
                reason: `가는길 추가 콜 확정 (DRIVING 유지)` 
            };
        }
    }

    /**
     * 오더가 취소/방출(CANCEL)되었을 때 상태를 롤백시킵니다.
     */
    public static rollbackOnCancel(
        session: UserSession, 
        activeCallsCount: number
    ): StateTransitionResult {
        // 콜 잡기가 꺼져 있거나(선점 중이라 서버가 내려 둔 상태) 합짐 상태일 때만 필터를 재조정
        if (!session.activeFilter.isActive || session.activeFilter.isSharedMode) {
            const resetFilter: Partial<AutoDispatchFilter> = { isActive: true };

            if (activeCallsCount === 0) {
                // 잡은 콜이 하나도 안 남았을 경우 → 완전히 초기화 (STANDBY)
                resetFilter.isSharedMode = false;
                resetFilter.dispatchPhase = 'STANDBY';
                resetFilter.driverAction = 'WAITING';
                return { 
                    changed: true, 
                    newFilter: resetFilter, 
                    reason: "모든 콜이 취소되어 완전 초기화(STANDBY) 복귀" 
                };
            } else {
                // 잡아 둔 콜이 남아있는 경우 → 현재 상태(GATHERING/DRIVING)를 그대로 유지
                return { 
                    changed: true, 
                    newFilter: resetFilter, 
                    reason: `서브콜 취소, 현재 상태(${session.activeFilter.dispatchPhase}) 유지하며 탐색 재개` 
                };
            }
        }
        return { changed: false };
    }
}
