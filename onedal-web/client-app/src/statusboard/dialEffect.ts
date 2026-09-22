/**
 * 🎚️ **연기 눈금으로 «무엇을 못 보게 되나» — 순수 함수**.
 *
 * ── 왜 있나 ──
 * 관제웹의 주행/정차 판정(`useDriveMotion`)은 «5km/h↓ 가 「굳는 시간」만큼 이어져야 정차»다.
 * 모의 주행 눈금의 정차 연기가 그보다 짧으면(예: **정차 5초**) «정차» 상태가
 * **구조적으로 한 번도 안 나온다.** 화면이 그 눈금을 **조용히 받으면** 기사님은 모른 채 시험을 도신다.
 *
 * 🔴 **눈금을 잠그지 않는다.** 정하는 것은 기사님이고(규칙 ①),
 *    **무엇을 못 보게 되는지 말하는 것**이 화면의 일이다. 조용히 받으면
 *    「화면이 조용히 거짓말한다」가 된다.
 *
 * 🔴 **문턱을 여기 적지 않는다.** 정차가 얼마여야 하는가는 ⚙️ 설정의 「굳는 시간」이
 *    답한다(`user_settings.motion_hold_sec`) — 그 값을 **넘겨받아** 견준다. 10 을 박아 두면
 *    기사님이 1초로 바꾼 날 화면이 박아 둔 문턱으로 거짓말한다 (규칙 ③).
 * 🔴 **걸음식도 새로 짜지 않는다.** `KM_PER_TICK`·`STOP_OFF_ROAD_KM` 을 **넘겨받아**
 *    `simStep` 과 같은 식으로 센다 — 식이 갈리면 «화면이 말하는 걸음»과 «시뮬이 걷는 걸음»이
 *    달라지고, 그러면 진단 화면이 오진을 늘린다.
 * ⚠️ **경고는 정차 하나뿐이다.** 「걸음·닿는 거리」는 **사실만** 적는다 —
 *    어느 배속이 위험한가는 표본이 없어서 모른다. 모르는 문턱으로 경고를 지어내지 않는다 (규칙 ④).
 *
 * 🔬 검사는 `dialEffect.test.ts`.
 */
export interface DialEffectInput {
    /** ⏸️ 정거장에서 서 있는 실초 */ dwellSec: number;
    /** 🐢 서행에 드는 반경(km) */ approachKm: number;
    /** 🐢 서행할 때 걸음을 몇 분의 일로 */ slowFactor: number;
    /** 🐢🚗🚀 배속 */ speed: number;
    /** ⏱️ ⚙️ 설정의 「주행·정차로 굳는 시간」(초) */ holdSec: number;
    /** 🛣️ 한 틱의 기본 걸음(km) — `simStep.KM_PER_TICK` */ kmPerTick: number;
    /** 🏭 정거장이 도로에서 벗어난 폭(km) — `simStep.STOP_OFF_ROAD_KM` */ offRoadKm: number;
}

export interface DialEffect {
    /** 🔴 이 정차로는 «정차» 상태가 안 굳는다 */ dwellShort: boolean;
    /** 굳으려면 정차가 최소 몇 초여야 하나 */ requiredDwellSec: number;
    /** 순항 한 걸음(km) */ cruiseKm: number;
    /** 서행 한 걸음(km) */ slowKm: number;
    /** 서행 연기를 실제로 하나 */ slows: boolean;
    /** 이번 걸음으로 «지나쳤다»고 볼 거리(km) */ reachKm: number;
}

export function dialEffectOf(i: DialEffectInput): DialEffect {
    /**
     * ⏸️ 정차 연기는 **1초에 한 점씩 같은 자리**를 낸다 — 점이 `dwellSec` 개면
     *    처음과 끝 사이는 `dwellSec − 1` 초다. 그래서 「굳는 시간」과 **같기만 해선 1초 모자라다.**
     */
    const requiredDwellSec = i.holdSec + 1;
    const cruiseKm = i.kmPerTick * i.speed;
    return {
        dwellShort: i.dwellSec < requiredDwellSec,
        requiredDwellSec,
        cruiseKm,
        slowKm: cruiseKm / Math.max(1, i.slowFactor),
        slows: i.approachKm > 0 && i.slowFactor > 1,
        /* 📏 `simStep` 의 그 식이다 — 이탈폭은 배속에 딸려 줄지 않는다 (물리 상수다) */
        reachKm: Math.max(cruiseKm, i.offRoadKm) + i.offRoadKm,
    };
}
