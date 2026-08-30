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
        sharedVehicleTypes: string[]
    ): StateTransitionResult {
        const currentPhase = session.activeFilter.dispatchPhase || 'STANDBY';

        /**
         * 🔴 **경유 한 벌(키워드·묶음·별칭)은 여기서 싣지 않는다** (#81 · 2026-08-30).
         *
         * 전이 직전에 `syncDetourFilter` 가 셋을 **한 벌로** 이미 넣었다. 예전엔 여기서
         * `destinationKeywords` 만 다시 실었는데, 키워드만 오면 필터 매니저의 별칭
         * 재생성 가드가 «묶음이 없으니 별칭을 못 만든다 → 비운다»로 동작해 **방금 채운
         * 별칭을 지웠다.** 빈 별칭이 앱에 내려가면 3단계 동명이동 검증이 빈손이 되어
         * 주의 동(중리동 등) 하차 콜을 전부 «동명이동!»으로 죽인다 — 7지점 05가
         * 세 판 연속 확정 직전에 죽은 이유다. 전이의 일은 국면·차종뿐이다 (규칙 ③).
         */
        const newFilter: Partial<AutoDispatchFilter> = {
            isSharedMode: true,
            isActive: true,
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
        // 콜 잡기가 꺼져 있거나(선점 중이라 서버가 내려 둔 상태) 합짐 상태일 때만 필터를 재조정
        // ⚠️ 예전 주석은 "멈춰있지 **않고**" 라 조건을 정반대로 적고 있었다 (2026-08-29 정정)
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
