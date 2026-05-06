import { create } from 'zustand';

export interface LocationState {
    lat: number | null;
    lng: number | null;
    accuracy: number | null;
    timestamp: number | null;
    isTracking: boolean;
    error: string | null;

    setLocation: (lat: number, lng: number, accuracy: number) => void;
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

    setLocation: (lat, lng, accuracy) =>
        set({ lat, lng, accuracy, timestamp: Date.now(), error: null }),

    setTracking: (isTracking) => set({ isTracking }),

    setError: (error) => set({ error, isTracking: false }),
}));
