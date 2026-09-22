/**
 * 🌐 **배차망을 전부 아는 곳**
 *
 * 공통 코드(core-simulator)는 배차망을 모르고, 배차망 폴더(insung · hwamul24 · kakaopicker)는 서로를 모른다.
 * 둘을 함께 알아야 하는 것은 여기에만 둔다 — 서버의 PluginFactory · 원달앱의 TargetApp.kt 와 같은 자리다.
 *
 * 배차망 하나가 채울 칸은 `SimNet` 인터페이스가 정한다. 새 배차망을 붙일 때
 * 칸을 빠뜨리면 타입 검사가 잡는다 — 설정 화면(SetupPage)과 배차 화면(DispatchPage)은 안 고치고 여기 `SIM_NETS` 에 한 줄 더한다.
 *
 * ⚠️ 배차 화면이 `net === 'hwamul24' ? … : …` 로 부품을 고르거나 설정 화면이 배차망 목록을 따로 들면 두 곳이 갈라진다.
 */
import type { ComponentType } from 'react';
import type { CallDraft, CallOptions, PresetBook, RandomSource } from '@altari/core-simulator';
import { SHARED_PRESET_BOOK } from '@altari/core-simulator';
import type { InsungCall } from './insung/insungCall';
import { toInsungCall } from './insung/insungCall';
import type { Hwamul24Call } from './hwamul24/hwamul24Call';
import { toHwamul24Call } from './hwamul24/hwamul24Call';
import type { PickerCall } from './kakaopicker/pickerCall';
import { toPickerCall } from './kakaopicker/pickerCall';
import { PICKER_PRESET_BOOK } from './kakaopicker/pickerPresets';
import { InsungSimScreen } from './insung/InsungSimScreen';
import { Hwamul24SimScreen } from './hwamul24/Hwamul24SimScreen';
import { PickerSimScreen } from './kakaopicker/PickerSimScreen';

/** 시뮬레이터 리스트·잡은 콜이 담는 콜 — 배차망마다 칸이 다르다 */
export type SimCall = InsungCall | Hwamul24Call | PickerCall;

/**
 * 주소(`?net=`)에 쓰는 배차망 이름 — 서버·원달앱과 같은 값이다.
 * 시뮬레이터는 `shared` 를 일부러 안 가져다 쓰므로 코드로 묶지 않고 값만 맞춘다.
 */
export type NetKey = 'insung' | 'hwamul24' | 'kakaopicker';

/**
 * 배차 화면이 배차망 화면에 넘기는 것 — 콜 목록 · 고른 콜 · 공통 동작.
 * 🔴 **무엇을 그릴지(리스트·상세·수락 뒤 탭)는 배차망 화면이 정한다.** 배차 화면은 배차망을 모른다.
 */
export interface NetScreenProps {
  streamingCalls: SimCall[];
  confirmedCalls: SimCall[];
  activeTab: 'ALL' | 'CONFIRMED';
  setActiveTab: (tab: 'ALL' | 'CONFIRMED') => void;
  /** 누른 콜 — 있으면 상세, 없으면 리스트 */
  selectedCall: SimCall | null;
  selectedCallId: string | null;
  openCall: (call: SimCall) => void;
  closeDetail: () => void;
  /** 리스트에서 빼고 잡은 콜에 넣는다 (수락 뒤 무엇을 보일지는 배차망 화면이 정한다) */
  acceptCall: (call: SimCall) => void;
  cancelCall: (call: SimCall) => void;
  /** 🚚 배송을 끝냈다 — 잡은 콜에서 빼고 상세를 닫는다 (픽커 수락 뒤 단계의 «확인»). 취소와 하는 일은 같지만 뜻이 다르다 */
  finishCall: (call: SimCall) => void;
  isTimerPaused: boolean;
  toggleTimer: () => void;
  isFetchingOrder: boolean;
  maxPickupKm: number;
  /** 설정 화면(`/`)으로 */
  goSetup: () => void;
}

/** 🧩 배차망 하나가 채울 칸 — 서버의 `IAppPlugin` 과 같은 짜임 */
export interface SimNet {
  key: NetKey;
  /** 설정 화면에 보일 이름 */
  label: string;
  /** 공통 칸만 있는 콜에 이 배차망 칸을 입힌다 */
  toCall: (draft: CallDraft, opts: CallOptions, rng?: RandomSource) => SimCall;
  /** 겉 테두리 — 인성은 검은 테두리 안의 창, 화물24시는 흰 바탕 (각 실 화면을 흉내 낸다) */
  frameClassName: string;
  /** 리스트·상세를 그리는 이 배차망의 화면 */
  Screen: ComponentType<NetScreenProps>;
  /**
   * 설정 화면에서 이 배차망을 골랐을 때의 색 — 배차망 버튼 · 시작 버튼.
   * 설정 화면은 색을 직접 고르지 않고 이 칸을 읽는다.
   */
  setupColors: { toggle: string; start: string };
  /**
   * 🎯 이 배차망이 쓰는 **문제지 책**.
   * 인성·화물24시는 지금 문제지(`presets.ts` — 요금 **원** 단위 · 정답이 인성 콜 필터 기준)를 함께 쓰고, 픽커는 제 책(P 단위)을 쓴다.
   * 배차 화면은 이 책에서만 이름을 찾는다 — 남의 책 이름이면 «문제지가 없다»로 멈춘다.
   */
  presetBook: PresetBook;
  /**
   * 🔙 상세를 열 때 방문 기록에 한 칸 남기나.
   * 원달앱은 알람으로 상세에 들어간 뒤 30초 무응답이면 «뒤로 가기»를 누른다. 상세가 방문 기록에 없으면
   * 그 한 번에 설정 화면까지 나가 버린다. 인성·화물24시는 `false` — 상태만 바꾼다.
   */
  detailInHistory: boolean;
}

export const SIM_NETS: Record<NetKey, SimNet> = {
  insung: {
    key: 'insung',
    label: '인성콜',
    toCall: toInsungCall,
    frameClassName: 'w-full h-dvh py-10 bg-[#111] overflow-hidden relative font-sans text-black',
    Screen: InsungSimScreen,
    setupColors: { toggle: 'bg-blue-600 text-white', start: 'bg-gradient-to-r from-blue-600 to-indigo-600 shadow-blue-900/40' },
    presetBook: SHARED_PRESET_BOOK,
    detailInHistory: false,
  },
  hwamul24: {
    key: 'hwamul24',
    label: '화물24시',
    toCall: toHwamul24Call,
    frameClassName: 'w-full h-dvh bg-gray-100 overflow-hidden relative font-sans text-black',
    Screen: Hwamul24SimScreen,
    setupColors: { toggle: 'bg-[#c62828] text-white', start: 'bg-gradient-to-r from-[#c62828] to-[#8e1b1b] shadow-red-900/40' },
    presetBook: SHARED_PRESET_BOOK,
    detailInHistory: false,
  },
  kakaopicker: {
    key: 'kakaopicker',
    label: '픽커',
    toCall: toPickerCall,
    // 흰 바탕 · 테두리 없음 — 카드 위치를 폰 픽셀로 맞추므로 여백을 두지 않는다 (PickerDispatchBoard 머리 주석)
    frameClassName: 'w-full h-dvh bg-white overflow-hidden relative font-sans text-black',
    Screen: PickerSimScreen,
    setupColors: { toggle: 'bg-[#4a74da] text-white', start: 'bg-gradient-to-r from-[#4a74da] to-[#2f55b8] shadow-blue-900/40' },
    presetBook: PICKER_PRESET_BOOK,
    detailInHistory: true,
  },
};

/** 설정 화면에 늘어놓는 순서 */
export const SIM_NET_LIST: SimNet[] = [SIM_NETS.insung, SIM_NETS.hwamul24, SIM_NETS.kakaopicker];

/**
 * 주소의 `?net=` → 배차망. 🔴 **모르는 값·없는 값은 `null` 이다** — 부르는 쪽이 멈추고 알린다.
 * 짐작해서 한 배차망으로 그리면, 그 배차망인 줄 모르고 30분 시험한 그 30분이 헛것이 된다.
 */
export function simNetOf(key: string | null): SimNet | null {
  return SIM_NET_LIST.find(n => n.key === key) ?? null;
}

/**
 * 🔀 바뀐 옛 이름 → 새 이름. 폰 북마크와 기록 문서의 옛 주소를 살린다.
 * 옛 이름을 아는 곳은 여기와 옛 경로를 받는 `App.tsx` 뿐이다 (`tests/boundaries.test.ts` 규칙 ④).
 */
const RENAMED_NET_KEYS: Record<string, NetKey> = { inseong: 'insung' };

/** 옛 이름이면 새 이름, 아니면 `null` */
export function renamedNetKey(key: string | null): NetKey | null {
  return key != null && Object.hasOwn(RENAMED_NET_KEYS, key) ? RENAMED_NET_KEYS[key] : null;
}
