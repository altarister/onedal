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

/**
 * 🔴 **인성 배차망 차종 약자** — 시뮬 화면은 인성 화면을 흉내 낸다.
 *
 * 실제 인성은 차종을 **약자**로 표시한다 (오·다·라·1t·5t…). 앱 파서
 * (`InsungParser.kt` 의 `vehicleRegex`)가 그 약자를 앵커로 요금을 읽으므로,
 * 시뮬이 풀네임("다마스")을 그대로 뿌리면 파서가 요금을 못 읽는다
 * (2026-08-24 실측: 여주 문제지의 다마스·라보·승용차 콜이 전부 요금 못 읽음).
 *
 * 승용차는 인성에서 **«승»** 이다 (기사님 확정 2026-08-24). 파서 필터 매칭도
 * `"승용차" -> p.contains("승")` 으로 이미 «승» 을 쓴다 — 요금 앵커링만 빠져 있었다.
 */
const INSUNG_VEHICLE_ABBR: Record<string, string> = {
  '오토바이': '오',
  '다마스': '다',
  '라보': '라',
  '승용차': '승',
  '1t': '1t', '1.4t': '1.4', '2.5t': '2.5t', '3.5t': '3.5t',
  '5t': '5t', '11t': '11t', '14t': '14t', '18t': '18t', '25t': '25t',
};

export const formatInsungVehicle = (vehicleType?: string | null): string => {
  if (!vehicleType) return '오';
  return INSUNG_VEHICLE_ABBR[vehicleType] ?? vehicleType;
};

/**
 * 🔴 **화물24시 차종 표기** — 같은 값을 **자기 말로 옮겨 적는다** (2026-09-11 신설).
 *
 * 문제지는 차종을 한 번만 적는다(`vehicleType: '승용차'`). 그런데 화물24시 화면은
 * 인성과 **다른 말**을 쓴다 — 인성이 «승» 이라 적는 자리를 화물24시는 «승용» 이라 적고,
 * `1t` 를 «1톤» 이라 적는다.
 *
 * 그래서 값은 하나로 두고(규칙 ③ — 파생값의 입력은 한 곳), **읽는 쪽이 각자 옮긴다.**
 * 예전에는 화물24시 보드가 `call.tonnage` 만 봤는데 생성기가 그 칸을 안 채워서,
 * **문제지의 승용차 콜이 화면에 「1톤」으로 나왔다** (2026-09-11 실측).
 */
const HWAMUL24_VEHICLE_NAME: Record<string, string> = {
  '오토바이': '오토바이', '다마스': '다마스', '라보': '라보', '승용차': '승용',
  '1t': '1톤', '1.4t': '1.4톤', '2.5t': '2.5톤', '3.5t': '3.5톤',
  '5t': '5톤', '11t': '11톤', '14t': '14톤', '18t': '18톤', '25t': '25톤',
};

export const formatHwamul24Vehicle = (vehicleType?: string | null): string => {
  if (!vehicleType) return '1톤';
  return HWAMUL24_VEHICLE_NAME[vehicleType] ?? vehicleType;
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
