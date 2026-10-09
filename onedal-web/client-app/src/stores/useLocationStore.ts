import { create } from 'zustand';

export interface LocationState {
    lat: number | null;
    lng: number | null;
    accuracy: number | null;
    /** 📍 GPS 측정 시각(`position.timestamp`) — **한 점의 이름**. 좌표가 같아도 새 측정이면 바뀌고, 캐시된 같은 측정이면 그대로다 (38 F09) */
    timestamp: number | null;
    isTracking: boolean;
    error: string | null;

    setLocation: (lat: number, lng: number, accuracy: number, fixAt?: number) => void;
    setTracking: (isTracking: boolean) => void;
    setError: (error: string | null) => void;
}

export const useLocationStore = create<LocationState>((set) => ({
    lat: null,
    lng: null,
    accuracy: null,
    timestamp: null,
    isTracking: false,
    error: null,

    setLocation: (lat, lng, accuracy, fixAt) =>
        set({ lat, lng, accuracy, timestamp: fixAt ?? Date.now(), error: null }),

    setTracking: (isTracking) => set({ isTracking }),

    setError: (error) => set({ error, isTracking: false }),
}));
