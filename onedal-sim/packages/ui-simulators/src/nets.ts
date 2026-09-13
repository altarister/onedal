/**
 * 🌐 **배차망을 전부 아는 곳** (2026-09-14 · 카카오픽커_시뮬레이터.md §3-3 · 0단계 0-2)
 *
 * 공통 코드(core-simulator)는 배차망을 모르고, 배차망 폴더(inseong · hwamul24)는 서로를 모른다.
 * 둘을 함께 알아야 하는 것은 여기에만 둔다 — 서버의 PluginFactory · 원달앱의 TargetApp.kt 와 같은 자리다.
 *
 * 지금은 콜 타입 묶음 하나뿐이다. 입히기 함수·화면을 고르는 `SimNet` 인터페이스는 0-2 ⑤ 에서 더한다.
 */
import type { InsungCall } from './inseong/insungCall';
import type { Hwamul24Call } from './hwamul24/hwamul24Call';

/** 시뮬레이터 리스트·잡은 콜이 담는 콜 — 배차망마다 칸이 다르다 */
export type SimCall = InsungCall | Hwamul24Call;
