export * from './paymentTypes';
export * from './callStatus';
export * from './milestones';
export * from './cargo/cargoReport';
export * from './callDeck';
export * from './arrivalReasons';
export * from './orderSync';
export * from './time/waitTimes';
export * from './dispatchApi';
export * from './device/deviceModes';
export * from './screenKinds';
export * from './device/deviceSession';
export * from './orderShapes';
export * from './dispatchFilter';

export { LET_GO_STATUSES, isLetGoStatus, type LetGoStatus, DECISION_STATUSES, type DecisionStatus } from './orderStatuses';

export * from './device/deviceOffline';

export * from './targetApps';

export * from './map/callBands';
export * from './device/modeTable';
export * from './device/bleProtocol';
export * from './openBlocked';
export * from './common/mask';
export * from './common/format';
export * from './map/mapTile';
export * from './replies';
export * from './filterTally';
export * from './common/jsonArray';
export * from './judge/verdict';
export * from './map/routeReuse';
export * from './judge/fuelCost';
export * from './cargo/vehicles';
export * from './device/deviceLink';
export * from './ops/releases';
export * from './device/allowance';
export * from './regionMatch';
export * from './judge/pricing';
export * from './phases';
export * from './ops/ops';
export * from './ops/anomalyKinds';
export * from './ops/join';
export * from './callTargetDay';
export * from './pickupList';
export * from './filterArea';
export * from './cargo/cargoHints';
export * from './cargo/cargoTags';
export * from './cargo/cargoUnits';

export * from './callSteps';
export * from './callOptions';
export * from './cargo/cargoSpec';
export * from './stepTables';
export * from './stepRecords';
export * from './time/timing';
export * from './judge/dryRun';
/**
 * 🔴 콜의 **색을 정하는 곳 — 여기 하나뿐이다**.
 *    이 파일은 아무것도 import 하지 않는다 — 순환 참조를 만들지 않으려는 것이다.
 */
export * from './judge/judgment';
export * from './judge/judge';
export * from './judge/criteria';

/** 🏷️ 화면 이름표 — 배차망별로 갈라 둔다 (기사님 설계) */
export * from './screenLabels';
export * from './map/naviLink';
/** ⏱️ 밀림 — 한 콜이 앞선 정거장을 몇 분 밀었나, 누가 밀었나 (실험실에서 올림) */
export * from './judge/stopImpact';
/** 🎨 구간별 선 — 통짜 폴리라인 + 경계로 자른다 */
export * from './map/sectionLine';
/**
 * 🕸️ **콜 그물·2단계 판정** — 지도 실험실이 나흘 동안 기사님과 맞춰 온 계산
 *    (기사님 확정: *«실험실 계산을 올린다»*).
 *    마름모·라인 띠·든 동·제외 지역·정거장 재배치가 전부 여기 있다.
 * 🔴 **실물이 원천이고 실험실이 그것을 부른다** — 화면과 서버가 같은 계산을 봐야
 *    «화면은 든다는데 판정은 탈락»이 안 생긴다 (규칙 ③).
 */
export * from './callNet';
export * from './trappedRegions';

export * from './common/logTags';
export * from './pageFields';
export * from './sigungu';
export * from './adminDongMatch';
export * from './networkPages';
export * from './collectList';
export * from './ops/flowViews';
export * from './pageRead';
