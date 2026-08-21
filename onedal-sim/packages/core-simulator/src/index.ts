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
export { generateSimCall } from './generator';
export type { SimGeneratorConfig } from './generator';

// 유틸리티
export { calculateDistanceKm } from './geo';
export { formatRegionName, formatRegionFullName, formatHwamul24Region } from './format';
export { getNextPickupDetail, getNextDropoffDetail } from './data/mockLocationDetails';
