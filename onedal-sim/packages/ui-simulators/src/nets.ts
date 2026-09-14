/**
 * 🌐 **배차망을 전부 아는 곳** (2026-09-14 · 카카오픽커_시뮬레이터.md §3-3 · 0단계 0-2 ⑤)
 *
 * 공통 코드(core-simulator)는 배차망을 모르고, 배차망 폴더(inseong · hwamul24)는 서로를 모른다.
 * 둘을 함께 알아야 하는 것은 여기에만 둔다 — 서버의 PluginFactory · 원달앱의 TargetApp.kt 와 같은 자리다.
 *
 * 배차망 하나가 채울 칸은 `SimNet` 인터페이스가 정한다. 넷째 배차망(픽커)을 붙일 때
 * 칸을 빠뜨리면 타입 검사가 잡는다 — 설정 화면(SetupPage)과 배차 화면(DispatchPage)은 안 고친다.
 *
 * ⚠️ 예전엔 DispatchPage 가 `net === 'hwamul24' ? … : …` 로 부품을 골랐고, SetupPage 가 배차망 목록을 따로 들고 있었다.
 */
import type { ComponentType } from 'react';
import type { CallDraft, CallOptions, RandomSource } from '@altari/core-simulator';
import type { InsungCall } from './inseong/insungCall';
import { toInsungCall } from './inseong/insungCall';
import type { Hwamul24Call } from './hwamul24/hwamul24Call';
import { toHwamul24Call } from './hwamul24/hwamul24Call';
import { InsungSimScreen } from './inseong/InsungSimScreen';
import { Hwamul24SimScreen } from './hwamul24/Hwamul24SimScreen';

/** 시뮬레이터 리스트·잡은 콜이 담는 콜 — 배차망마다 칸이 다르다 */
export type SimCall = InsungCall | Hwamul24Call;

/** 주소(`?net=`)에 쓰는 배차망 이름 — ⏳ 0단계 0-4 에서 서버·원달앱과 같은 `insung` 으로 맞춘다 */
export type NetKey = 'inseong' | 'hwamul24';

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
   * 설정 화면에서 이 배차망을 골랐을 때의 색 — 배차망 버튼 · 시작 버튼 (0단계 0-3).
   * 예전엔 설정 화면이 `net === 'hwamul24' ? 빨강 : 파랑` 으로 직접 골랐다.
   */
  setupColors: { toggle: string; start: string };
}

export const SIM_NETS: Record<NetKey, SimNet> = {
  inseong: {
    key: 'inseong',
    label: '인성콜',
    toCall: toInsungCall,
    frameClassName: 'w-full h-dvh py-10 bg-[#111] overflow-hidden relative font-sans text-black',
    Screen: InsungSimScreen,
    setupColors: { toggle: 'bg-blue-600 text-white', start: 'bg-gradient-to-r from-blue-600 to-indigo-600 shadow-blue-900/40' },
  },
  hwamul24: {
    key: 'hwamul24',
    label: '화물24시',
    toCall: toHwamul24Call,
    frameClassName: 'w-full h-dvh bg-gray-100 overflow-hidden relative font-sans text-black',
    Screen: Hwamul24SimScreen,
    setupColors: { toggle: 'bg-[#c62828] text-white', start: 'bg-gradient-to-r from-[#c62828] to-[#8e1b1b] shadow-red-900/40' },
  },
};

/** 설정 화면에 늘어놓는 순서 */
export const SIM_NET_LIST: SimNet[] = [SIM_NETS.inseong, SIM_NETS.hwamul24];

/**
 * 주소의 `?net=` → 배차망.
 * ⏳ **모르는 값·없는 값은 지금은 인성이다** — 예전 동작 그대로. 0단계 0-4 에서 «멈추고 알린다»로 바꾼다 (계획서 §3-3).
 */
export function simNetOf(key: string | null): SimNet {
  return key === 'hwamul24' ? SIM_NETS.hwamul24 : SIM_NETS.inseong;
}
