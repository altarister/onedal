// ═══════════════════════════════════════════════════════════════
// @altari/core-simulator — 포맷팅 유틸리티
// React 의존성 ZERO.
// ═══════════════════════════════════════════════════════════════

/** 인성 전용: fullName에서 마지막 세그먼트(동 단위)만 추출 */
export const formatRegionName = (name: string): string => {
  if (!name) return '';
  return name.split(' ')[0];
};

/** fullName "경기 / 수원시 / 영통구" → "영통구" (마지막 세그먼트) */
export const formatRegionFullName = (fullName: string): string => {
  if (!fullName) return '';
  return fullName.split('/').pop() || fullName;
};

/** 화물24시 전용: "경기 / 광주시 / 경안동" → "경기 광주 경안동" */
export const formatHwamul24Region = (fullName: string): string => {
  if (!fullName) return '';
  return fullName
    .split('/')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.replace(/시$/, '').replace(/군$/, ''))
    .join(' ');
};
