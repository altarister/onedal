import { create } from 'zustand';
import type { DeviceSession } from '@onedal/shared';

/**
 * 기기 텔레메트리 글로벌 상태 스토어
 * 
 * useDevices 훅의 useState를 대체합니다.
 * 소켓 telemetry-devices 이벤트에서 상태를 갱신합니다.
 */
interface DeviceState {
    /** 등록된 전체 기기 목록 (앱폰) */
    devices: DeviceSession[];

    // ── Actions ──
    setDevices: (devices: DeviceSession[]) => void;
    updateDevice: (deviceId: string, patch: Partial<DeviceSession>) => void;
}

export const useDeviceStore = create<DeviceState>((set) => ({
    devices: [],

    setDevices: (devices) => set({ devices }),

    updateDevice: (deviceId, patch) => set((state) => ({
        devices: state.devices.map(d =>
            d.deviceId === deviceId ? { ...d, ...patch } : d
        ),
    })),
}));
