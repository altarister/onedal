/**
 * 🚚 **화물24시 화면만 쓰는 것** — 표기 함수 (2026-09-14 · 카카오픽커_시뮬레이터.md 0단계 0-2)
 *
 * 예전엔 공통 코드(`core-simulator/src/format.ts`)에 있었다. **본문은 한 글자도 안 고치고 옮겼다** —
 * 화면 글자 스냅숏(`tests/screens.test.tsx`)이 그대로 초록인 것이 그 증거다.
 */

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
