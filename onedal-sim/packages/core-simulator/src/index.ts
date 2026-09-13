// ═══════════════════════════════════════════════════════════════
// @altari/core-simulator — 배럴 Export
// ═══════════════════════════════════════════════════════════════

// 타입
export type {
  LocationPoint,
  LocationDetailInfo,
  CallItem,
  AutoDispatchFilter,
  RegionIntel,
  OrderVolume,
} from './types';

// 콜 생성기
export { generateSimCall, findMockEntry } from './generator';
export type { SimGeneratorConfig, ForcedPair, MockEntry } from './generator';

// 🎯 문제지 — 정해진 콜을 순서대로 (조건을 시험하려고 랜덤을 기다리지 않는다)
export { PRESETS, PRESET_MENU, PRESET_KEYS, PRESET_REQUIRES, getPreset, toForcedPair } from './presets';
export type { PresetRequires } from './presets';
export type { PresetProblem } from './presets';

// 유틸리티
export { calculateDistanceKm } from './geo';
export { getNextPickupDetail, getNextDropoffDetail } from './data/mockLocationDetails';
