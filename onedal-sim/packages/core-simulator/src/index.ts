// ═══════════════════════════════════════════════════════════════
// @altari/core-simulator — 배럴 Export
// ═══════════════════════════════════════════════════════════════

// 타입
export type {
  LocationPoint,
  LocationDetailInfo,
  BaseCall,
  AutoDispatchFilter,
  RegionIntel,
  OrderVolume,
} from './types';

// 콜 생성기
export { generateBaseCall, findMockEntry, MOCK_DATA, pickWith } from './generator';
export { distanceFare, pickFreightFields, FREIGHT_OPTIONS } from './freight';
export type { FreightFields } from './freight';
export type { SimGeneratorConfig, ForcedPair, MockEntry, RandomSource, CallDraft, CallOptions } from './generator';

// 🎯 문제지 — 정해진 콜을 순서대로 (조건을 시험하려고 랜덤을 기다리지 않는다)
export { PRESETS, PRESET_MENU, PRESET_KEYS, PRESET_REQUIRES, getPreset, getPresetFrom, SHARED_PRESET_BOOK, toForcedPair } from './presets';
export type { PresetRequires, PresetBook } from './presets';
export type { PresetProblem } from './presets';

// 🚚 개별콜 — 서버가 들고 있다가 넘기는 콜 (현황판에서 한 건씩)
export { toInjectedForced, takeInjected } from './injectedCall';
export type { InjectedCall, InjectedPlace, InjectedBatch } from './injectedCall';

// 유틸리티
export { calculateDistanceKm } from './geo';
