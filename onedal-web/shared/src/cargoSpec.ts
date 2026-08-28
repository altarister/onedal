/**
 * 📦 **짐 — 한 정거장에서 다루는 값 묶음** (2026-08-20 신설)
 *
 * 6단계 전수 조사(docs/결정_이력.md «콜 하나의 생애는 여섯 단계다»)의 값들을 타입으로 세운다.
 *
 * 🔴 **개별 타입은 이미 다 있었다** (`CargoUnit`·`HandlingMethod`·`Protection`…).
 *    없던 것은 **그것들을 묶는 이름**이다. 그래서 지금 코드는 짐을 넘길 때마다
 *    `unit, quantity, handling, protections…` 를 **낱개로 들고 다닌다** —
 *    함수 시그니처가 길어지고, 하나를 빠뜨려도 타입이 안 잡는다.
 *    (`dwellMinutes(handling, points, stop, unk, protections, afterworks)` 가 그 증상이다)
 *
 * ⚠️ **이 파일은 아직 아무도 안 쓴다.** 타입만 세워 두고, 연결은 다음 단계에서.
 */

import type { CargoUnit, Protection, Afterwork } from './cargoUnits';
import type { HandlingMethod } from './index';
import type { CargoTag } from './cargoTags';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. 짐 그 자체 — 화면의 다섯 줄
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 통화 시트·현장 시트가 다루는 **짐 한 벌**.
 *
 * 화면의 다섯 줄이 그대로 다섯 필드다 —
 * `단위 · 수량 · 상하차 방법 · 보호(상차)/후작업(하차) · 성질`
 *
 * 🔴 **모르는 값은 `null` 이다.** `0` 이 아니다 —
 *    `0` 은 *"없다"* 이고 `null` 은 *"모른다"* 다 (규칙 ④).
 *    특히 `unit: '기타'` 는 **부피를 환산할 수 없다**는 뜻이라 `null` 과도 다르다.
 */
export interface CargoSpec {
    /** 파레트 · 라면박스 · 마대 · 서류봉투 · 기타 */
    unit: CargoUnit | null;
    /** 그 단위로 몇 개인가 */
    quantity: number | null;
    /** 지게차 · 수작업 */
    handling: HandlingMethod | null;
    /** 🔒 **상차 전용** — 결박 · 그물망 · 호루 · 탑박스 (복수) */
    protections: Protection[];
    /** 🧹 **하차 전용** — 정리 · 검수 (복수) */
    afterworks: Afterwork[];
    /** 일반화물 · 농산물 · 파손주의 … (복수) */
    tags: CargoTag[];
}

/** 아무것도 모르는 상태 — 화면을 처음 열 때의 바닥 */
export const EMPTY_CARGO: CargoSpec = {
    unit: null, quantity: null, handling: null,
    protections: [], afterworks: [], tags: [],
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. 그 값이 **어디서 왔나** — 숫자만으로는 알 수 없다
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 🔴 **같은 `파레트 2개` 라도 출처가 다르면 믿음이 다르다** (규칙 ⑤-2).
 *
 *   `VEHICLE`  차종에서 미리 눌러 둔 값 — **미확인**. 화면이 그렇게 표시해야 한다
 *   `MEMO`     적요에서 읽은 값 — 부정확할 수 있다
 *   `DECLARED` 통화로 들은 값
 *   `ACTUAL`   현장에서 실제로 보고 적은 값 — **실측 통계에 쓰는 유일한 값**
 *
 * 이 구분이 없으면 *"신고 대비 실측이 몇 배"* (`cargoMismatchRatio`)를 잴 수 없고,
 * 화면이 **추정을 확정처럼** 보여 준다.
 */
export const CARGO_SOURCES = ['VEHICLE', 'MEMO', 'DECLARED', 'ACTUAL'] as const;
export type CargoSource = typeof CARGO_SOURCES[number];

/** 짐 + 그 값의 출처 */
export interface SourcedCargo extends CargoSpec {
    source: CargoSource;
    /** 언제 이 값이 되었나 (ISO) */
    at: string;
}

/**
 * 🔴 **계획과 실측을 한 자리에 둔다** — 지금 구조가 못 하는 것.
 *
 * 전수 조사 §3 의 시나리오가 이 타입의 존재 이유다:
 * *"1t 콜 → 파레트 2개가 눌린 채 통화 스킵 → 상차 완료에서 라면박스로 변경"*
 * 지금은 **계획(파레트 2개)이 어디에도 안 남아** 오차를 못 잰다.
 *
 * 여기서는 `planned` 와 `actual` 이 **같은 행에** 있어 조인 없이 비교된다.
 */
export interface CargoRecord {
    /** 콜을 잡는 순간 정해진 값 (차종 기본 → 적요 → 통화 순으로 덮인다) */
    planned: SourcedCargo;
    /** 현장에서 실제로 본 값. 아직 안 봤으면 `null` */
    actual: SourcedCargo | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. 짐에서 **나오는 값** — 저장하지 않고 파생한다
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 짐 하나가 만들어 내는 숫자들. **저장하지 않는다** — 옵션 값이 바뀌면 같이 바뀌어야 하므로
 * (규칙 ③ · 예: 기사님이 `지게차 0.05 → 0.08` 로 고치면 정차 시간이 저절로 늘어난다).
 */
export interface CargoDerived {
    /** 라면박스 환산 — 적재의 축 (용어집 §5) */
    points: number;
    /** 이 정거장의 정차 시간(분) = 방법 × 박스 + 보호(상차) 또는 후작업(하차) */
    dwellMinutes: number;
    /** 🔴 **일반값으로 때웠는가** — 화면이 `미확인` 을 띄우는 근거 (규칙 ⑤-2) */
    assumed: boolean;
}

/**
 * 신고 대비 실측이 몇 배인가. `null` 이면 **잴 수 없다** (둘 중 하나가 없다).
 *
 * ⚠️ 지금 코드(`cargoMismatchRatio`)는 `DECLARED` 행과 `ACTUAL` 행을 찾아 비교하는데,
 *    통화를 건너뛰면 `DECLARED` 가 없어 **오차를 못 잰다.** `CargoRecord` 는
 *    계획이 늘 있으므로 그 구멍이 없다.
 */
export interface CargoMismatch {
    ratio: number | null;
    /** 경고를 띄울 만큼 어긋났는가 (1.5배 이상 또는 0.5배 이하) */
    severe: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. 정거장에 따라 **쓰는 필드가 다르다**
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 🔒 보호는 상차에만, 🧹 후작업은 하차에만 붙는다 (용어집 §4).
 * **묶는 자리는 상차이고, 검수는 내린 뒤의 일**이라 서로 자리를 바꿀 수 없다.
 *
 * 타입으로 못 막는 대신 이 함수 하나를 거치게 한다 —
 * 저장 직전에 부르면 잘못된 필드가 딸려 들어가지 않는다.
 */
export function cargoForStop(c: CargoSpec, stopType: 'pickup' | 'dropoff'): CargoSpec {
    return stopType === 'pickup'
        ? { ...c, afterworks: [] }
        : { ...c, protections: [] };
}

/** 짐을 아는가 — 하나라도 비면 `미확인` 이다 */
export function isCargoKnown(c: CargoSpec): boolean {
    return c.unit != null && c.quantity != null && c.handling != null;
}
