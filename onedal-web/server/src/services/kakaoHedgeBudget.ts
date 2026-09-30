import { AsyncLocalStorage } from "node:async_hooks";

/**
 * 🪞 **판정 한 번의 «나란히 한 번 더» 추가 호출 칸** — 판정기(`OrderEvaluator.evaluate`)가 판정마다 새 칸을 열고,
 * 카카오 호출(`kakaoService.kakaoJsonHedged`)이 문턱을 넘길 때 여기서 하나씩 쓴다. 칸이 없으면(판정 밖) 한 번 더 보내지 않는다.
 * 카카오 모듈과 떼어 둔다 — 판정기 검사가 카카오 모듈을 통째로 가짜로 바꿔도 칸은 진짜로 돈다.
 */
export const hedgeBudget = new AsyncLocalStorage<{ left: number; used: number }>();
