// ═══════════════════════════════════════════════════════════════
// @altari/ui-simulators — 배럴 Export
// ═══════════════════════════════════════════════════════════════

// 컨텍스트 및 훅
export { SimulationProvider, useSimulationContext } from './context/SimulationContext';
export { useSimStreaming } from './context/useSimStreaming';
export type { SimulationConfig, DriverLocation } from './context/SimulationContext';

// 🌐 배차망을 전부 아는 곳 — 콜 타입 묶음 (0단계 0-2 ③)
export type { SimCall } from './nets';
export type { InsungCall } from './inseong/insungCall';
export type { Hwamul24Call } from './hwamul24/hwamul24Call';

// 인성 UI
export { SimDispatchBoard as InseongDispatchBoard } from './inseong/SimDispatchBoard';
export { InseongCallDetailScreen } from './inseong/InseongCallDetailScreen';
export { InseongOngoingDetailScreen } from './inseong/InseongOngoingDetailScreen';
export { InseongLocationDetailScreen } from './inseong/InseongLocationDetailScreen';
export { InseongMemoDetailScreen } from './inseong/InseongMemoDetailScreen';
export { InseongDropdownMenu } from './inseong/InseongDropdownMenu';

// 인성 표기 — 인성 화면만 쓴다 (0단계 0-2 에서 공통 코드에서 옮겨 왔다)
export { formatRegionName, formatRegionFullName, formatInsungVehicle, toInsungCall } from './inseong/insungCall';
export { getNextPickupDetail, getNextDropoffDetail } from './inseong/insungContacts';

// 화물24 UI
export { Hwamul24DispatchBoard } from './hwamul24/Hwamul24DispatchBoard';
export { Hwamul24CallDetailScreen } from './hwamul24/Hwamul24CallDetailScreen';

// 화물24 표기 — 화물24시 화면만 쓴다 (0단계 0-2 에서 공통 코드에서 옮겨 왔다)
export { formatHwamul24Region, formatHwamul24Vehicle, toHwamul24Call } from './hwamul24/hwamul24Call';
