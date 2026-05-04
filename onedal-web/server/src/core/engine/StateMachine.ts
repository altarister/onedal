import { AutoDispatchFilter, MyOrder, PendingOrder } from "@onedal/shared";
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
        order: MyOrder | PendingOrder,
        destinationKeywords: string[],
        sharedVehicleTypes: string[]
    ): StateTransitionResult {
        const currentPhase = session.activeFilter.dispatchPhase || 'STANDBY';
        
        const newFilter: Partial<AutoDispatchFilter> = {
            isSharedMode: true,
            isActive: true,
            destinationKeywords,
            allowedVehicleTypes: sharedVehicleTypes,
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
        // 이미 멈춰있지 않고 탐색 중이거나 합짐 상태일 때만 필터를 재조정
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
                // 본콜이 남아있는 경우 → 현재 상태(GATHERING/DRIVING)를 그대로 유지
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
