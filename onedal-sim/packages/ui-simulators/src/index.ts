// ═══════════════════════════════════════════════════════════════
// @altari/ui-simulators — 배럴 Export
// ═══════════════════════════════════════════════════════════════

// 컨텍스트 및 훅
export { SimulationProvider, useSimulationContext } from './context/SimulationContext';
export { useSimStreaming } from './context/useSimStreaming';
export type { SimulationConfig, DriverLocation } from './context/SimulationContext';

// 🌐 배차망을 전부 아는 곳 — 콜 타입 묶음 (0단계 0-2 ③)
export type { SimCall, SimNet, NetKey, NetScreenProps } from './nets';
export { SIM_NETS, SIM_NET_LIST, simNetOf, renamedNetKey } from './nets';
export { InsungSimScreen } from './insung/InsungSimScreen';
export { Hwamul24SimScreen } from './hwamul24/Hwamul24SimScreen';
export type { InsungCall } from './insung/insungCall';
export type { Hwamul24Call } from './hwamul24/hwamul24Call';

// 인성 UI
export { SimDispatchBoard as InsungDispatchBoard } from './insung/SimDispatchBoard';
export { InsungCallDetailScreen } from './insung/InsungCallDetailScreen';
export { InsungOngoingDetailScreen } from './insung/InsungOngoingDetailScreen';
export { InsungLocationDetailScreen } from './insung/InsungLocationDetailScreen';
export { InsungMemoDetailScreen } from './insung/InsungMemoDetailScreen';
export { InsungDropdownMenu } from './insung/InsungDropdownMenu';

// 인성 표기 — 인성 화면만 쓴다 (0단계 0-2 에서 공통 코드에서 옮겨 왔다)
export { formatRegionName, formatRegionFullName, formatInsungVehicle, toInsungCall } from './insung/insungCall';
export { getNextPickupDetail, getNextDropoffDetail } from './insung/insungContacts';

// 화물24 UI
export { Hwamul24DispatchBoard } from './hwamul24/Hwamul24DispatchBoard';
export { Hwamul24CallDetailScreen } from './hwamul24/Hwamul24CallDetailScreen';

// 화물24 표기 — 화물24시 화면만 쓴다 (0단계 0-2 에서 공통 코드에서 옮겨 왔다)
export { formatHwamul24Region, formatHwamul24Vehicle, toHwamul24Call } from './hwamul24/hwamul24Call';

// 카카오T픽커 — 콜 칸 · 지역 줄임 표기 (2단계 2-1) · 홈 · 리스트 · 배차 화면 (2-2)
export { formatPickerAddressLine, formatPickerRegion, toPickerCall } from './kakaopicker/pickerCall';
export { PickerCallDetailScreen } from './kakaopicker/PickerCallDetailScreen';
export { PICKER_PRESET_BOOK } from './kakaopicker/pickerPresets';
export type { PickerCall } from './kakaopicker/pickerCall';
export { PickerHomeScreen } from './kakaopicker/PickerHomeScreen';
export { PickerDispatchBoard, formatPickerDistance, formatPickerFare, visibleCardRange, PICKER_CARD_HEIGHT } from './kakaopicker/PickerDispatchBoard';
export { PickerSimScreen } from './kakaopicker/PickerSimScreen';
