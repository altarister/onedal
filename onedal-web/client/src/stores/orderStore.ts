import { create } from 'zustand';
import type { SecuredOrder, SimplifiedOfficeOrder } from '@onedal/shared';

/**
 * 오더 글로벌 상태 스토어
 * 
 * useOrderEngine 훅의 useState 묶음을 대체합니다.
 * 소켓 이벤트 핸들러에서 직접 store.set()을 호출하여 상태를 갱신합니다.
 */
interface OrderState {
    /** 현재 활성 경로 (심사 중 + 확정된 오더 통합 목록) */
    activeRoute: SecuredOrder[];
    /** 서버 미전달 대기 오더 (앱폰이 긁어왔으나 아직 서버 응답 전) */
    pendingOrders: SimplifiedOfficeOrder[];
    /** 소켓 연결 상태 */
    isConnected: boolean;
    /** 데스밸리 경고 표시 중인 오더 ID */
    deathvalleyOrderId: string | null;

    // ── Actions ──
    setActiveRoute: (orders: SecuredOrder[]) => void;
    updateOrder: (id: string, patch: Partial<SecuredOrder>) => void;
    addPendingOrder: (order: SimplifiedOfficeOrder) => void;
    removePendingOrder: (id: string) => void;
    setConnected: (connected: boolean) => void;
    setDeathvalleyOrderId: (id: string | null) => void;
}

export const useOrderStore = create<OrderState>((set) => ({
    activeRoute: [],
    pendingOrders: [],
    isConnected: false,
    deathvalleyOrderId: null,

    setActiveRoute: (orders) => set({ activeRoute: orders }),

    updateOrder: (id, patch) => set((state) => ({
        activeRoute: state.activeRoute.map(o =>
            o.id === id ? { ...o, ...patch } : o
        ),
    })),

    addPendingOrder: (order) => set((state) => ({
        pendingOrders: [...state.pendingOrders, order],
    })),

    removePendingOrder: (id) => set((state) => ({
        pendingOrders: state.pendingOrders.filter(o => o.id !== id),
    })),

    setConnected: (connected) => set({ isConnected: connected }),

    setDeathvalleyOrderId: (id) => set({ deathvalleyOrderId: id }),
}));
