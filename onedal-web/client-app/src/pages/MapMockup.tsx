import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
/* 🎛️ 고르기 칸은 실물과 **같은 부품**을 쓴다 (이식 C2-2 · 규칙 ③) */
import { PickLayer, useCloseOnOutside } from '../components/ui/PickLayer';
import {
    rateFloorsFrom,
    NET_RATE_PER_KM, VEHICLE_CAPACITY, CALL_TARGET_LABEL,
    dwellMinutes, judge, CRITERIA, DEFAULT_JUDGMENT, toSnapshot,
    type FieldMode,
} from '@onedal/shared';
import { buildAppFilterOutput, TRUCK_CAPACITY_SLOTS } from './labFilterOutput';
/**
 * ⚖️ **실물 심사석을 그대로 띄운다** (기사님 2026-09-10:
 * *"우리 프로젝트에서 심사판 2종류 있는데 그걸 우리 목업 프로젝트 오른쪽 사이드바에 붙여 줘"* ·
 * *"**기존 프로젝트는 건드리면 안 돼** 알지?"*).
 *
 * 🔴 **베끼지 않고 부른다.** 실물 `JudgmentSeat` 을 **읽기만** 하고 그 파일은 한 글자도 안 고쳤다.
 *    베껴 두면 실물이 바뀔 때 목업만 옛 모양으로 남아 «실험이 거짓말»을 한다
 *    (`labJudge`·`labPortMap` 과 같은 규약 — 실물이 원천이다).
 * 🔴 실물이 그리는 판은 **둘**이다 — `isManualLineage(type) || isPreview` 면 «물든 판(보기만)»,
 *    아니면 «자동콜: 아래 전체가 35:65 버튼». 그래서 여기서도 둘을 나란히 띄운다.
 */
import JudgmentSeat from '../components/dashboard/JudgmentSeat';
/**
 * 🎨 **정거장 동그라미 색은 실물 팔레트가 정한다** (기사님 2026-09-10:
 * *"색 아이콘은 상차지 색, 하차지 색으로 바꾸면 영역을 확보 많이 할 것 같은데"*).
 * 🔴 공간을 아끼는 것보다 큰 것이 있다 — **지도 마커가 이미 이 색을 쓴다.**
 *    타이틀 줄이 같은 색을 쓰면 시트와 지도가 **같은 말**을 한다 (상차는 밝고 선명, 하차는 깊게).
 */
import { callNodeFill, callNodeText, stopBoxBg, callTextColor, PROMISE_CALLED } from '../styles/callPalette';
import { useTheme } from '../contexts/ThemeContext';
import type { SecuredOrder } from '@onedal/shared';
// 🎨 판정 사실을 실물 모양으로 옮기는 곳 — 채점은 실물 엔진(judge)이 한다
import { buildLabFacts, extraDriveMin } from './labJudge';
// 🚚 이식 대응표가 이 타입의 원천이다 — 실물 `step_*` 칸과 맞는지는 labPortMap.test.ts 가 지킨다
import { promiseTimes, impactOfStop, splitDropImpact, type StopStep } from './labPortMap';
// ⏱️ 시간·정거장 이름은 한 곳에서 만든다 (labTime.test.ts 가 지킨다)
import { circled, hhmm, cumMinutes, arrivalAt, visitOrder } from './labTime';
// 🧪 콜 문제 — **화면이 버튼으로 그리고, 검사(`pnpm lab`)가 그 버튼을 누른다** (원천 하나)
import { LAB_PROBLEMS, LAB_START, type LabProblem, type LabStep } from './labProblems';
import {
    netForGoal, lineZoneOf, progressAlongKm, sidoList, sggList, dongList, isRegionExcluded, isWholeRegionExcluded, excludedLabel, mergeGoalNets, judgeGoals, activeGoals, nearestDong, orderStopsInsert, pickNextTarget, legSound, foldChainOrder, cityCenter, isLocalPhase, NET_SRC, NET_DST,
    GONJIAM_DROP, DONGWON_DROP, BORAM_DROP,
    GONJIAM_CALL_PATH, DONGWON_CALL_PATH, BORAM_CALL_PATH,
    type NetPoint, type TwoStageVerdict,
} from '@onedal/shared';
import sidoDataRaw from '../mapData/sidoData.json';
import { apiBase } from '../lib/serverTarget';

/**
 * 🛣️ **카카오를 부를 때 쓰는 경로 축 — «추천» 하나다** (기사님 2026-09-09 *"길찾기는 지워"*).
 *
 * 2026-09-08 까지는 기사님이 「길 찾기」로 다섯 옵션(추천·최단시간·최단거리·고속도로 피하기·
 * 톨게이트 피하기)의 대안 경로를 받아 **하나를 골랐고**, 그 길 옆이 그물이었다.
 * 지금은 **잡은 콜들이 라인을 만들므로** 길을 미리 고를 이유가 없다.
 * ⚠️ 그래서 «고속도로냐 국도냐»를 고르는 축이 지금은 없다 — 별건으로 낸다 (todo 0-I).
 */
const ROUTE_COMBO: { priority: string; avoid?: string; label: string } = { priority: 'RECOMMEND', label: '추천' };

/**
 * 🧳 **정거장에 머무는 분 — 짐을 모르므로 «일반값»이다** (기사님 2026-09-09 *"넣어줘"* · 규칙 ⑤-2).
 *
 * 실물과 **같은 함수**(shared `dwellMinutes`)를 읽는다 — 목업이 제 셈을 따로 두면 실험이 거짓말이 된다.
 * 지도 실험실의 콜은 지도를 두 번 눌러 만든 것이라 짐(박스 수·상하차 방법)이 없다.
 * 그래서 방법을 `null` 로 넘기고, 함수가 일반값을 돌려준다 — **상차 15분 · 하차 10분**
 * (상차가 긴 이유는 결박이 붙어서다).
 *
 * 🔴 **화면에 «짐 미확인»을 함께 적는다.** 표시 없이 값만 쓰면 규칙 ④ 위반이다 (규칙 ⑤-2).
 * 🔴 도착 시각에는 안 붙고 **떠나는 시각**에 붙는다 — `cumMinutes` 참조.
 */
/**
 * 🧳 **정거장에 머무는 분 — 짐을 넘긴다** (기사님 확정 2026-09-10:
 * *"15분(양촌읍 상차)이 잘못된 부분이구나. **볼트는 승용차로 하니까 박스 하나씩** 했을 거야"*).
 *
 * 🔴 전에는 `dwellMinutes(null, 0, …)` 이라 **늘 «모를 때 값»(상차 15 · 하차 10)** 이 나왔다.
 *    그건 **1톤에 짐을 모를 때**의 값이다(*"상차에는 결박이 붙는다"*) — 승용차 박스 하나엔 과하다.
 *    실험실은 콜마다 **박스 수를 알고 있는데**(기사님이 넣는다) 그걸 안 넘기고 있었다.
 * 🔴 짐 다루는 법은 **«수작업»으로 본다** — 실측 78%가 수작업이다 (규칙 ⑤-2: 가장 흔한 값).
 * ⚠️ **하한 3분을 둔다.** 실물 계수는 «기본 0분 + 수작업 박스당 20초»라 1박스면 **0분**이 된다 —
 *    그건 «차 대고 받아서 서명하는» 시간조차 없다는 뜻이라 또 다른 거짓말이다.
 *    3분은 **실측이 아니라 이 목업의 하한**이고, 실물 상수를 고치는 것은 별개 판이다
 *    (`todo.md` ② 「정차 시간이 차종을 안 본다」).
 */
const LAB_DWELL_FLOOR_MIN = 3;
const labDwellOfBoxes = (boxes: number, label: string) =>
    Math.max(LAB_DWELL_FLOOR_MIN, dwellMinutes('수작업', boxes, label.endsWith('하차') ? 'dropoff' : 'pickup'));

/**
 * 🎨 **그물 색 — 한 벌** (기사님 지시 2026-09-09: *"선택 영역이 일관성이 없어 보여. 색도 라인도
 * 투명도도"* · *"**사용자가 볼 때 «아 이 영역에서 콜을 부를 거구나»** 하고 생각할 수 있게"*).
 *
 * 🔴 예전엔 조각마다 색이 달랐다 — 마름모는 하늘색 실선에 옅은 채움, 라인 띠는 진파랑 반투명에
 *    테두리 없음, 원 둘은 주황 점선에 채움 없음. **한 영역인데 셋으로 보였다.**
 *
 * 그래서 **뜻이 같으면 모양도 같게** 한다:
 *   · 콜이 오는 곳(마름모 · 라인 띠 · 목적지 원)  →  같은 파랑 채움 + 같은 테두리
 *   · 내가 지금 갈 수 있는 거리(내 위치 원)        →  같은 파랑이되 **점선** (뜻이 다르다)
 *
 * 🔴 **면은 한 번에 칠한다** (기사님 2026-09-09 *"좀 더 진해도 될 것 같고 마름모 라인을 지울 수 있을까?"*).
 *    조각마다 따로 칠하면 겹치는 자리(마름모 ∩ 원)가 **두 겹이 되어 얼룩진다** — 테두리를 지우고
 *    채움을 진하게 할수록 더 도드라진다. 그래서 마름모·원을 **한 path 에 모아 한 번** 칠한다
 *    (캔버스 nonzero 규칙 — 겹쳐도 한 겹). 그러면 «영역 하나»로 보인다.
 */
const NET_SOLID = '#2563eb';               // 그물을 전용 캔버스에 그릴 때 쓰는 **불투명** 색
const NET_ALPHA = 0.22;                    // 그 캔버스를 지도에 얹는 투명도 — 겹쳐도 한 겹이다
const NET_EDGE = 'rgba(37,99,235,.85)';    // 경계선 — 지금은 «내 위치 원»(점선)에만 쓴다
const NET_EDGE_W = 2;

/**
 * 🎚️ **실험실 기본값 — 여기 하나에 모은다** (기사님 지시 2026-09-09:
 * *"사용 컴포넌트에서는 변수로 바꿔서 상단에 기본값들을 다 모아줘"*).
 *
 * 🔴 `useState` 초기값에 흩어져 있으면 «지금 기본이 얼마인가»를 찾으러 파일을 훑어야 한다.
 *    값이 태어난 근거도 그 자리에 흩어진다 — 한 곳에 두고 근거를 옆에 적는다.
 *
 * 실물에서는 이 자리가 **DB**(`user_filter_phases` 등)다. 실험실은 DB 를 안 쓰므로
 * 이 상수가 그 노릇을 한다 — 이식 때 여기 값이 DB 기본값으로 간다.
 */
const LAB_DEFAULTS = {
    /** 🛣️ 기본은 **노선** (기사님 2026-09-09) */
    routeMode: true,
    /**
     * 📐 **각 110° · 마름모 반경 25km** — 기사님이 화면에서 돌려 보고 정하셨다 (2026-09-09):
     * *"**뒤로 많이 가는 것만 빼고 잡자** 이런 느낌으로."*
     * 110° 는 반각 55° — 옆으로는 넉넉히 열고 **등 뒤만 닫는다.** 25km 가 그 부채꼴의
     * 배부른 가운데를 잘라 축에서 멀어지는 콜을 막는다.
     */
    srcAngleDeg: 110, dstAngleDeg: 110, quadRadiusKm: 25,
    /** 📍 상차 반경 10km · 하차지 주변 15km · 라인 반경 6km (기사님 2026-09-09) */
    pickupRadiusKm: 10, dropoffRadiusKm: 15, lineRadiusKm: 6,
    /** 💰 시세 대비 10% 까지 (실물 DB 기본값과 같다) */
    discountPct: 10,
    /** 🚚 받을 짐 차종 · 🚫 제외 단어 — DTO 예시 그대로의 목업값 */
    vehicles: ['1t', '다마스'],
    excludedWords: ['착불', '수거'],
    /** 📦 후보콜의 짐 — 볼트 표를 셀 때 쓴 «모든 콜 = 1박스» 가정 */
    candBoxes: 1,
    /**
     * 💰 후보콜의 요금 — **늘 20만원** (기사님 확정 2026-09-10).
     * 지도 클릭으로 만든 콜은 가격을 알 수 없다. 지어낸 값이 콜마다 달라지면
     * «필터가 통과했나»를 보려는데 **돈이 화면을 흔든다.**
     */
    candFare: 200_000,
};

/**
 * ⛔ **제외지역 기본값 — «들어가면 못 빠져나오는 곳»** (기사님 확정 2026-09-09 · 「다 + 가」).
 *
 * 출처는 노하우 영상 「이 선을 넘지 마세요」 —
 * `docs/자료/노하우/일하는_법/노하우_추출.md` §9 에 이유와 함께 적혀 있다.
 *
 * 🔴 **영상의 선을 통째로 옮기지 않았다.** 그 선은 볼트(김포) 기준이고 기사님 집은 광주 초월이라
 *    경계가 다르다. 여기 넣은 것은 **집 위치와 무관하게 «빈차로 돌아오는»** 여덟 곳뿐이다.
 * 🔴 **기사님이 칩을 눌러 언제든 되살린다** — 잠그는 것이 아니라 미리 눌러 둔 것이다.
 * 🔴 `intel`(실측)이 «그 동네에서 다음 콜이 몇 분 만에 떴나»를 답하기 시작하면 이 목록은
 *    참고가 되고 그 숫자가 원천이 된다.
 */
const LAB_DEFAULT_EXCLUDED = [
    /**
     * 🔴 **서울** — ⑭ 「서울은 뺀다」. *"서울은 그 어디보다도 콜이 많은 곳이다. 사람이 많으니까
     * 트래픽도 대단해서 한 콜 하는 데 엄청난 시간이 필요하다. 그럼으로 안 간다."*
     * 2026-09-09 까지 **`collectDongs` 안에 코드로 박혀 있었다** — 필터 어디에도 안 보이는 채로.
     * 기사님이 잡으셨다: *"필터에 서울이 없는데 서울 값들이 들어와야 할 것 같아."*
     * 이제 여기 있다 — **보이고, 되살릴 수 있다.**
     */
    'S|서울',
    'R|인천 강화군',            // 빠져나오기 어렵다
    'R|연천군',                 // «거의 연천이야» — 꼭대기 밖
    'R|가평군',                 // «낚여서 가지 마세요»
    'D|남양주시|수동면',        // 「남양주에서 피해야 될 곳」
    'D|포천시|영북면',          // 산정호수 — «절대 안 돼»
    'D|광주시|남한산성면',      // «올라가시는 분들 계신데 가면 안 돼요»
    'D|화성시 만세구|서신면',   // 고수도 안 가는 곳
    'D|화성시 만세구|송산면',   // 같은 자리
];

/**
 * 💰 **콜이 잘 나오는 곳** (기사님 2026-09-09 *"잘 나오는 곳도 표시되면 좋을 것 같은데"*).
 *
 * 같은 영상에서 **콕 집어 «많다»고 한 곳**만 담았다. *"저기도 많은데"* 정도로 지나간 곳
 * (평택·안성·인천 전역)은 안 넣는다 — 다 칠하면 표시가 뜻을 잃는다.
 *
 * 🔴 **이건 «가라»가 아니라 «여기서 다음 콜이 붙기 쉽다»는 표시다.** 판정에 안 쓴다 —
 *    지도에 색으로만 뜬다 (규칙 ①: 고르는 것은 기사님이다).
 * ⚠️ 김포 월곶·하성·통진은 **일부러 뺐다.** 영상이 *"콜이 많은 게 아니라 기사가 없어서
 *    떠 있는 것"* 이라고 갈라 말했다 — 아침 일찍이라는 조건이 붙는다.
 */
const LAB_CALL_RICH = new Set([
    'D|김포시|대곶면', 'D|김포시|양촌읍',       // «대곶·검단·양촌이 엄청 많다»
    'R|인천 검단구', 'R|인천 서해구',           // 「인천 서구 쪽」 — 행정구역 개편 뒤 이름
    'R|고양시 일산동구', 'R|고양시 일산서구',   // «일산은 볼 거 없어요, 그냥 다 동그라미»
    'D|광주시|태전동',                          // «태전 근처로 나름 많이 뜬다»
    'R|성남시 분당구',                          // «분당도 괜찮고»
    'D|여주시|세종대왕면',                      // «세종대왕면 좋아한다 — 많이 뜬다»
    'D|이천시|신둔면',                          // 이천~여주 사이 작은 회사·도예촌
]);
/** 그 동이 «잘 나오는 곳»인가 — 시군구 전체 지정과 동 지정 둘 다 본다 */
const isCallRich = (region: string, name: string) =>
    LAB_CALL_RICH.has(`R|${region}`) || LAB_CALL_RICH.has(`D|${region}|${name}`);

/** 시도 + 경기 시·군·구 경계 60구역 — 시트 목업 지도(PinnedRouteCanvas)와 같은 재료 */
const SIDO = (sidoDataRaw as { features: Array<{ properties: { name: string }; geometry: { type: string; coordinates: number[][][][] | number[][][] } }> }).features;

/**
 * 🗺️ **지도 실험실** — `/mockup/map` (기사님 요청 2026-09-07: *"지도만 테스트, 다른 것에 영향 없이"*
 * → *"배경 지도, 오른쪽에 버튼 영역"*)
 *
 * 배경은 **OSM 타일** — 시트 목업의 지도(PinnedRouteCanvas)와 같은 원천이다.
 * 🔴 카카오 지도(SDK)는 **버렸다** (기사님 결정 2026-09-07: *"미리 지도를 가져오는 것이
 * 아니라서 사용자가 포커스를 자꾸 잃는다"*). 카카오는 남의 DOM 위에 우리 캔버스를 얹는
 * 2층이라 z-index 묻힘·줌 애니메이션 배율 어긋남·접착 루프가 다 그 틈에서 났다.
 * OSM 은 한 캔버스에 타일과 도형을 같은 투영으로 그리는 1층이라 어긋날 자리가 없고,
 * 타일 캐시도 우리 손에 있다. **길찾기(REST·콜 확정 시 실경로)는 카카오 그대로 쓴다** — 서버가 부른다.
 *
 * 무엇을 검증하나 — **필터 두 단계** (같은 날 확정):
 *   1단계 · 영역 — 하차지가 그물 안 + 상차지가 현위치 둘레 안 (어디까지 보나)
 *   2단계 · 거리 — 목적지까지 «상차 : 하차 : 현위치»로 역주행 둘을 자른다 (어느 쪽으로 가나)
 *
 * 쓰는 법: 오른쪽 패널에서 국면을 고르고, **지도를 두 번 클릭**하면 콜이 된다
 * (첫 클릭 = 상차 ▲ · 둘째 = 하차 ▼) — 판정 카드가 그 자리에서 나온다.
 *
 * 🔒 다른 화면에 영향 없음: 자기 캔버스·자기 타일 캐시로 그리고, 계산은 callNet(순수 함수)을
 * 읽기만 한다. 판정 수식은 callNet.test.ts 가 잠근다.
 * 🔴 사각형의 기점은 **내 위치**다 (기사님 재확정 2026-09-07 오후 — 하차지 기점은 출발 전
 * 내 앞길 콜을 버린다). 내 위치는 「📍 내 위치 찍기」로 옮긴다.
 */

interface Stage { label: string; vertex: NetPoint; path: Array<{ x: number; y: number; label: string; color?: string }> }
const STAGES: Stage[] = [
    { label: '⏳ 대기 — 초월(집)', vertex: NET_SRC, path: [] },
    { label: '① 곤지암성당 하차 후', vertex: GONJIAM_DROP, path: GONJIAM_CALL_PATH },
    { label: '② 동원대 하차 후', vertex: DONGWON_DROP, path: DONGWON_CALL_PATH },
    { label: '③ 보람여주 하차 후', vertex: BORAM_DROP, path: BORAM_CALL_PATH },
];

type Pt = { lng: number; lat: number };
/**
 * 라인 모드에서 그물의 anchor 는 안 읽힌다 (`netForGoal` — line 이 있으면 buildLineNet 만 탄다).
 * 🔴 읽히기 시작하면 바로 티가 나도록 NaN — 검사(callNet.test «라인이 있으면 anchor 를 안 읽는다»)와 한 짝.
 */
const LINE_ANCHOR_UNUSED = { name: '라인-무사용', lng: NaN, lat: NaN };
/** 전체 경로의 한 구간 — 카카오가 나눠 준 그대로 (기사님 2026-09-08) */
type ChainLeg = {
    from: string | null; to: string | null;
    /** 🔴 못 잰 구간은 null 이다 — 0 이라고 지어내지 않는다 (서버가 구간별로 격리해 준다) */
    distKm: number | null; durMin: number | null; failed?: boolean;
    line: Array<{ x: number; y: number }>;
};

/**
 * 🎯 **목적지는 시군구에서 고른다 — 도를 먼저, 시를 다음** (기사님 확정 2026-09-09:
 * *"시군구로 표기가 되어야 할 것 같고. 선택이 어려우니 **도를 선택하고 시를 선택**하게 할까?"*).
 *
 * 🔴 예전엔 여덟 곳만 코드에 박혀 있었다 — 나머지 111개 시군구는 **아예 못 골랐다.**
 *    그게 «선택이 어렵다»의 실체였다. 시도가 동 표에 붙으며(2026-09-09) 두 걸음이 가능해졌다.
 * 목적지 좌표는 그 시군구의 «시내»(법정동 평균)다 — 점 하나가 아니라 도시의 가운데라야
 * 마름모의 끝 꼭짓점으로 뜻이 선다.
 */
const DEFAULT_SIDO = '경기', DEFAULT_SGG = '파주시';

/**
 * 🚚 **받을 짐 차종을 한 자로** (기사님 2026-09-09: *"한 자씩 표현하면 될 듯. 다/라/승/오/1t"*).
 * 칸이 화면의 1/3 이라 «1t · 다마스»가 벌써 잘린다 — **닫힌 줄에서만** 줄이고,
 * 레이어를 열면 온전한 이름이 보인다.
 */
const VEHICLE_SHORT: Record<string, string> = { 오토바이: '오', 승용차: '승', 다마스: '다', 라보: '라', '1t': '1t' };

/** 콜 번호별 경로 색 — ①은 프리셋 경로의 기본색과 같은 장미로 잇는다 */
/**
 * ☎️ **통화로 정한 약속의 색** — 보라 (기사님 지정 2026-09-10).
 * 판정색 넷(파랑·초록·노랑·빨강)과 안 겹치는 유일한 색이라 **다른 층의 말**로 읽힌다.
 */
// 🔴 `PROMISE_CALLED` 는 `styles/callPalette` 로 옮겼다 (2026-09-11) — 실물 타이틀과 한 벌이다


/**
 * ▒ **정거장 상자의 바탕 — 콜의 색** (기사님 확정 2026-09-10:
 * *"상차와 하차 모두 박스를 만들어 넣어 줘. 색을 콜의 색으로 배경을 넣어 주고"*).
 *
 * 🔴 **둘 다 상자다.** 앞서 상차에만 옅은 바탕을 깔았더니 «한쪽만 상자»라 짝이 안 맞았다.
 *    둘 다 상자면 «콜 하나 = 상자 둘»이 되어 **덩어리가 눈에 먼저** 들어온다.
 * 🔴 **색이 콜을 가리킨다** — 지도 마커·경로와 같은 색조다(`callTone`). 상차는 밝고 하차는 깊게라
 *    한 콜 안에서도 두 상자가 갈린다. 글자를 덮으면 안 되므로 **투명도로만** 깐다.
 * 🔴 **지나간 정거장은 회색 상자다** — 색이 남으면 눈이 그리로 간다(흑백 원칙).
 */
// 🔴 `stopBoxBg` 도 `styles/callPalette` 로 옮겼다 — 같은 이유

const CALL_COLORS = ['#e11d48', '#a78bfa', '#2dd4bf', '#fb923c', '#facc15', '#34d399', '#60a5fa', '#f472b6'];

/* ── 웹 메르카토르 — OSM 타일과 같은 투영이라야 배경과 도형이 어긋나지 않는다 ── */
const TILE = 256;
const worldPx = (lng: number, lat: number, z: number): [number, number] => {
    const n = TILE * 2 ** z;
    const x = (lng + 180) / 360 * n;
    const s = Math.sin(lat * Math.PI / 180);
    const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
    return [x, y];
};
const fromWorldPx = (x: number, y: number, z: number): Pt => {
    const n = TILE * 2 ** z;
    const lng = x / n * 360 - 180;
    const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
    return { lng, lat };
};

/** 타일은 페이지 수명 동안 캐시 — 국면을 오가도 다시 안 받는다 */
const tileCache = new Map<string, HTMLImageElement>();

/** 주행 속도 — 한 틱(120ms)에 가는 km. 버튼이 순환시킨다 (기사님 2026-09-07 «너무 빨라») */
const SPEEDS = [
    { label: '🐢 느림', kmPerTick: 0.08 },
    { label: '🚗 보통', kmPerTick: 0.2 },
    { label: '🚀 빠름', kmPerTick: 0.5 },
] as const;

/** 판정 칩 — 통과/탈락 한 줄 */
function Chip({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
    return (
        <span className={`px-2 py-0.5 rounded-md text-[12px] font-black ${ok ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}>
            {ok ? `✅ ${yes}` : `❌ ${no}`}
        </span>
    );
}

/**
 * 🧩 **실물로 들고 갈 공용 부품** (기사님 2026-09-07: *"왼쪽 필터와 오른쪽 필터옵션은
 * 컴포넌트 단위 구조·레이아웃을 같이 — 그래야 가져가기 편하다"*).
 * 두 사이드바가 똑같이 `FilterPanel > NumRow/TextRow` 로 조립된다. 디자인 최소 — 로직이 주인공.
 * `mode` 는 실물 `PHASE_FIELDS` 의 FieldMode 그대로: input/override = 고침, auto = 보이되 잠김, hidden = 없음.
 */
/**
 * 🚚 **잡은 콜 하나** — 이식 대응표(`labPortMap`)가 이 칸들을 실물 자리와 맞물린다.
 * 취소된 콜도 **같은 모양 그대로** 남긴다 (기록이 목적이라 값을 잘라내면 안 된다).
 */
type LabCall = {
        id: number; pickup: Pt; drop: Pt;
        /**
         * 📦 **이 콜의 짐(박스)** — 적재는 **콜이 들고 있고 합은 파생된다** (기사님 2026-09-09:
         * *"적재는 상태값이니 필요 없고"*). 실물도 같다: 서버가 잡은 콜들의 짐 점수를 더해
         * `slotsUsed` 를 만든다 — 기사님이 손으로 넣는 값이 아니다.
         */
        boxes: number;
        /**
         * 배송(상차→하차) 실측 — 확정 순간 카카오 1회.
         * 🔴 **못 쟀으면 값이 없다** (규칙 ④ · 2026-09-09). 예전엔 직선 km 를 지어내고
         *    `straight: true` 를 붙였는데, 그 숫자가 시급(요금 ÷ 분)에 들어가면 **색이 틀린다.**
         *    실물도 카카오가 실패하면 `kakaoSoloDurationMin` 을 null 로 남긴다.
         */
        distKm?: number | null; durMin?: number | null; tollWon?: number | null; optionUsed?: string;
        /**
         * 🕗 **경로를 언제 쟀나** — 실물 `orders.routeComputedAt` 자리.
         * 「아직 응답 안 옴」과 「재 봤는데 못 쟀다」를 가르는 유일한 값이다:
         *   `null` = 아직 · 값 있고 `durMin == null` = 못 쟀다
         */
        routeComputedAt?: number | null;
        /**
         * 상차지까지(잡을 때의 내 위치 → 상차) 실측 — 🔴 **올릴 때 이미 잰 것을 그대로 저장한다**
         * (기사님 순서 ⑦ 2026-09-08: *"그 정보로 첫 콜 정보창에 1번 상차시간 2번 배송시간을 저장하고"*).
         * 저장을 안 해서 «그림은 그려져 있는데 기존 경로는 ?» 이 나왔다.
         */
        approachKm?: number | null; approachMin?: number | null;
        /**
         * 🔴 **최초 약속 — 확정한 순간에 못 박고 다시는 안 바꾼다** (기사님 2026-09-08:
         * *"앞자리는 최초 약속 시간인 거고 뒤 시간은 이 콜을 받았을 때 수정될 시간"*,
         * *"n분 늦어짐의 값이 같이 늘어나야 해"*).
         *
         * «분»이 아니라 **시각**으로 저장한다 — 분으로 두면 시간이 흐를수록 약속이 함께
         * 밀려서 지연이 영영 0 으로 보인다. 합짐을 둘 셋 얹어도 지연은 이 시각을 기준으로
         * **쌓인다.**
         */
        steps: { pickup: StopStep; dropoff: StopStep };
        /** 잡을 당시의 목적지 — 판 그룹 경로의 열쇠 (기사님 2026-09-08: 다음 판 콜을 미리 잡아 공백을 줄인다) */
        destName: string;
};

function FilterPanel({ title, children, className = '', tone }: {
    title: ReactNode; children: ReactNode; className?: string;
    /** 층을 색으로 가른다 — 'filter'(집기 전·파랑) · 'judge'(집은 뒤·주황). 없으면 평범한 구획 */
    tone?: 'filter' | 'judge';
}) {
    if (tone) {
        const c = tone === 'filter'
            ? { box: 'border-info/45 bg-info/[0.06]', head: 'bg-info/15 text-info' }
            : { box: 'border-warning/45 bg-warning/[0.06]', head: 'bg-warning/15 text-warning' };
        return (
            <div className={`shrink-0 rounded-[10px] border ${c.box} overflow-hidden ${className}`}>
                <div className={`px-2 py-1 text-[11px] font-black ${c.head}`}>{title}</div>
                <div className="p-2 flex flex-col gap-1">{children}</div>
            </div>
        );
    }
    return (
        <div className={`border-t border-border-card pt-2 flex flex-col gap-1 ${className}`}>
            <span className="text-[10.5px] font-black text-text-muted">{title}</span>
            {children}
        </div>
    );
}
function NumRow({ label, value, onChange, min = 0, max = 999, mode = 'input', autoWhy }: {
    label: string; value: number; onChange: (v: number) => void;
    min?: number; max?: number; mode?: FieldMode; autoWhy?: string;
}) {
    if (mode === 'hidden') return null;
    const locked = mode === 'auto';
    return (
        <label className="flex flex-col gap-0.5 text-[10.5px] font-bold text-text-muted">
            <span>{label}{locked && <span className="font-normal"> · 자동{autoWhy ? ` — ${autoWhy}` : ''}</span>}</span>
            <input type="number" inputMode="numeric" value={value} min={min} max={max} disabled={locked}
                onChange={e => onChange(Number(e.target.value))}
                className={`px-2 py-1 rounded-[6px] border border-border-hover bg-background text-[13px] font-black text-text-primary ${locked ? 'opacity-60' : ''}`} />
        </label>
    );
}
/**
 * 📋 **목록에서 하나 고르기 — 값 슬라이더와 같은 모양** (기사님 2026-09-09:
 * *"UI 가 아래처럼 레이어 처리하면 어떨까? **통일성이 떨어진다.**"*).
 *
 * 평소엔 «이름 · 지금 값» 한 칸, 누르면 그 자리에 레이어가 떠서 목록을 고른다.
 * 🔴 `<select>`(네이티브 드롭다운)를 쓰면 폰마다 생김새가 달라지고, 이 화면의 다른 입력과
 *    조작이 갈린다. **같은 자리에서 같은 방식으로** 고르게 한다.
 */

/**
 * ⚖️ **심사 영역 — 시트 맨 아래 붙박이** (v17 B안 · 기사님 확정 2026-09-10).
 *
 * 세 가지를 **시선 세 번, 각 0.5초**로 가른다 (근거: NHTSA «한 시선 2초 이하»):
 *   ① 색      카드가 물든 색 + KEEP 버튼 색이 곧 결정이다 (규칙 ⑤-3)
 *   ② 영향줄  정거장 세로 목록 — **밀리는 줄만** 색으로 말한다
 *   ③ ☎️ 줄   결론은 숫자가 아니라 **«누구에게 전화하나»** 다
 *
 * 🔴 **나쁜 콜이면 버튼 비율이 뒤집힌다**(35:65 → 65:35). 막는 것이 아니라 **기울이는 것**이다 —
 *    그래도 KEEP 할 수 있다 (규칙 ①: 콜의 주인은 기사님이다).
 * 🔴 여기 버튼은 **모양만**이다. 결재는 왼쪽 ⑤ 에서 한다.
 */

/**
 * 🎨 **정거장 번호를 «글자 색»으로 쓸 때의 색** (기사님 2026-09-10:
 * *"동그라미 붉은색 1 + 송정동 을 **붉은색 1 송정동**으로 하면 영역을 줄일 수 있어"*).
 *
 * 🔴 **마커 바탕색을 그대로 글자에 쓰면 안 읽힌다.** `callNodeFill` 은 **흰 글자를 얹으려고**
 *    어둡게 잡은 값이다(밝기 26~47%). 어두운 바탕에 그 색으로 글자를 쓰면 초록 하차(L26)는
 *    거의 안 보인다 — 실물 팔레트 주석이 *"값은 흰 글자 대비를 재서 잡았다"* 고 못박아 뒀다.
 * 🔴 그래서 **색조와 채도는 그대로 두고 밝기만 올린다** — 원천은 같은 `callTone` 하나라
 *    색이 갈라지지 않는다 (규칙 ③). 「상차는 밝고 하차는 깊게」도 그대로 산다.
 */
// 🔴 `callTextColor` 도 `styles/callPalette` 로 옮겼다 — 같은 이유

function SheetJudgeCard({ seat, impacts, confirmedCount, safeCancelLeft, driveMin }: {
    seat: (SecuredOrder & { soloMin?: number | null }) | null;
    impacts: Array<{ no: string; disp: string; isNew: boolean; where: string;
        stops: Array<{ kind: string; seq: number | null; label: string; promisedAt: number | null; etaAt: number | null; passedAt: number | null }> }>;
    confirmedCount: number;
    safeCancelLeft: number | null;
    /** 🚚 이 콜 때문에 **더 쓰는** 시간 — 시급의 분모다. «이 콜만»과 다른 값이라 이름을 달리 적는다 */
    driveMin: number | null;
}) {
    if (!seat) return (
        <div className="rounded-[10px] border border-border-card bg-background px-2 py-2 text-[10.5px] text-text-muted leading-snug">
            ⚖️ 심사 영역 — 지도를 두 번 클릭해 콜을 만들면 여기 뜹니다
        </div>
    );
    const color = seat.judgment?.color ?? null;
    const tone = color === '꿀' ? { bd: 'border-info/55', bg: 'from-info/25', tx: 'text-info', btn: 'bg-info text-background' }
        : color === '보통' ? { bd: 'border-success/55', bg: 'from-success/25', tx: 'text-success', btn: 'bg-success text-background' }
            : color === '똥' ? { bd: 'border-warning/55', bg: 'from-warning/25', tx: 'text-warning', btn: 'bg-warning text-background' }
                : { bd: 'border-danger/55', bg: 'from-danger/25', tx: 'text-danger', btn: 'bg-danger text-background' };
    /** 🔴 잡으면 사고인 콜 — 버튼 비율이 뒤집히는 조건 */
    const bad = color === '사고' || color === '똥';
    const hourly = seat.judgment?.axes?.find(a => a.key === 'money')?.value ?? null;
    /** ☎️ 전화할 곳 — 가장 크게 밀리는 기존 정거장 하나 */
    const worst = impacts.filter(ci => !ci.isNew).flatMap(ci => ci.stops.map(st => {
        const real = st.passedAt ?? st.etaAt;
        return { where: (ci.where.split(' → ')[st.kind === '상차' ? 0 : 1]) ?? st.label, seq: st.seq, kind: st.kind,
            min: real != null && st.promisedAt != null ? Math.round((real - st.promisedAt) / 60000) : 0 };
    })).reduce((w, x) => (x.min > (w?.min ?? 0) ? x : w), null as null | { where: string; seq: number | null; kind: string; min: number });
    return (
        <div className={`relative overflow-hidden rounded-[10px] border ${tone.bd} bg-background`}>
            <div className={`absolute inset-0 bg-gradient-to-b ${tone.bg} to-transparent pointer-events-none`} />
            {/* ① 머리줄 — 번호 · 호칭 · 상차→하차 · 금액 (실물 심사석 문법) */}
            <div className="relative flex items-center gap-1.5 px-2 pt-1.5 text-[12px]">
                <span className={`shrink-0 font-black ${tone.tx}`}>{confirmedCount + 1}</span>
                <span className="shrink-0 font-black text-[12.5px]">
                    {confirmedCount === 0 ? '노선 후보콜' : `노선 합짐${confirmedCount} 후보콜`}
                </span>
                <span className="min-w-0 truncate text-text-muted font-bold text-[11px]">{seat.pickup} → {seat.dropoff}</span>
                <span className="ml-auto shrink-0 font-black text-[15px] tabular-nums">{(seat.fare / 10000).toFixed(1)}만</span>
            </div>
            {/* 시급 — 기사님이 가장 먼저 읽는 숫자 */}
            <div className="relative px-2 text-[19px] font-black tabular-nums leading-tight">
                {hourly != null ? <>{hourly.toFixed(1)}만<span className="text-[11px] font-bold text-text-muted">/h</span></>
                    : <span className="text-[13px] text-text-muted">시급 못 잼</span>}
                {/**
                  * 🔴 **km 와 분이 다른 것을 재고 있었다** (2026-09-10 화면 실측:
                  * 실물 심사석 «70.6km · 60분» ↔ 여기 «70.6km · 154분»).
                  * km 는 «이 콜만»(`distanceKm`)인데 분은 «전체 경로 증가분»(`driveMin`)이었다.
                  * 🔴 **둘을 나란히 적으면 «이 콜은 70km 를 154분에 간다»로 읽힌다** — 거짓말이다.
                  *    이 줄은 **이 콜만**으로 맞추고, «더 쓰는 시간»은 이름을 붙여 아래에 적는다.
                  */}
                {seat.soloMin != null && <span className="ml-2 text-[12px] font-black">{seat.distanceKm ?? '--'}km · {seat.soloMin}분</span>}
            </div>
            {driveMin != null && (
                <div className="relative px-2 text-[9.5px] font-bold text-text-muted">
                    더 쓰는 시간 <b className="text-text-primary">{driveMin}분</b>{confirmedCount > 0 ? ' (전체 경로가 늘어나는 만큼)' : ''}
                </div>
            )}
            {/* ② 영향줄 — **밀리는 줄만** 적는다. 안 밀리는 정거장은 볼 이유가 없다 */}
            <div className="relative px-2 pt-1 flex flex-col gap-0.5 text-[10.5px] tabular-nums">
                {impacts.filter(ci => !ci.isNew).flatMap(ci => ci.stops.map(st => {
                    const real = st.passedAt ?? st.etaAt;
                    const d = real != null && st.promisedAt != null ? Math.round((real - st.promisedAt) / 60000) : null;
                    if (st.passedAt != null || d == null || d <= 0) return null;
                    return (
                        <div key={`${ci.no}${st.kind}`} className="flex justify-between gap-1">
                            <span className="font-bold">{st.seq ?? '?'} {(ci.where.split(' → ')[st.kind === '상차' ? 0 : 1]) ?? ''} {st.kind}</span>
                            <span><span className="text-text-muted">{hhmm(st.promisedAt)} → </span>
                                <b className="text-warning">{hhmm(real)}</b> <b className="text-warning">+{d}분</b></span>
                        </div>
                    );
                })).filter(Boolean)}
                {/* 🔴 **첫짐이면 «안 밀린다»가 아니다** (2026-09-10 화면 실측) — 밀릴 콜이 없는 것이다.
                    초록 «안 밀린다»는 «따져 봤다»로 읽히는데, 따질 것이 없었으면 그렇게 적으면 안 된다 */}
                {confirmedCount === 0
                    ? <div className="text-text-muted font-bold">첫짐 — 밀릴 콜이 없다</div>
                    : !worst || worst.min <= 0
                        ? <div className="text-success font-bold">✅ 기존 콜은 안 밀린다</div>
                        : null}
            </div>
            {/* ③ ☎️ 줄 — 늦어짐의 결론은 «몇 분»이 아니라 «누구에게 전화하나»다 */}
            {worst && worst.min > 0 && (
                <div className="relative mx-2 mt-1 px-1.5 py-1 rounded-md bg-danger/12 border border-danger/40 text-[11px] font-black text-danger">
                    ☎️ {worst.seq ?? '?'} {worst.where} {worst.kind} — {worst.min}분 늦어짐, 전화
                </div>
            )}
            {/* 버튼 — 나쁜 콜이면 35:65 가 뒤집힌다 */}
            <div className="relative flex gap-1.5 p-1.5">
                <button type="button" disabled
                    className={`${bad ? 'basis-[65%]' : 'basis-[35%]'} py-2 rounded-lg border border-danger/40 bg-danger/12 text-danger text-[12px] font-black`}>
                    ❌ 취소
                </button>
                <button type="button" disabled
                    className={`${bad ? 'basis-[35%]' : 'basis-[65%]'} relative overflow-hidden py-2 rounded-lg text-[12px] font-black ${bad
                        ? 'border border-border-hover bg-background text-text-muted' : tone.btn}`}>
                    {/* ⏳ 안전취소 30초가 줄어드는 장막 */}
                    {safeCancelLeft != null && (
                        <span className="absolute inset-y-0 right-0 bg-black/25 border-l-2 border-black/40"
                            style={{ width: `${Math.max(0, 100 - (safeCancelLeft / 30) * 100)}%` }} />
                    )}
                    <span className="relative">{bad ? '그래도 KEEP' : 'KEEP'}{seat.judgment?.score != null ? ` ${seat.judgment.score}` : ''}</span>
                </button>
            </div>
        </div>
    );
}

/** 🎚️ 값 하나의 정의 — 화면과 계산이 같은 목록을 읽는다 */
type KnobDef = { key: string; label: string; unit: string; value: number; max: number; step?: number; set: (v: number) => void; dim?: boolean };

/**
 * 🎚️ **값 여섯을 한 묶음으로 — 누르면 슬라이더가 «레이어»로 뜬다**
 * (기사님 2026-09-09: *"클릭하면 슬라이더가 보이는 건 어때?"* ·
 *  *"**밀리는 것 없이 레이어로** 처리하는 것이 좋을 것 같아"* · *"한 줄에 3개도 넣을 수 있을 듯"*).
 *
 * 🔴 숫자 입력칸은 폰에서 나쁘다 — *"커서 확인하고 숫자 지우고 입력하고 힘들어."*
 *    **손가락으로 끌어 크게 옮기고, ± 로 한 칸씩 다듬는다.** 숫자판을 안 띄운다.
 * 🔴 **펼쳐도 아래가 안 밀린다** — 묶음 위에 겹쳐 뜬다. 아래로 밀면 폰에서 보던 자리가 사라진다.
 * 🔴 레이어는 **셀이 아니라 묶음 전체 폭**을 쓴다 — 셀(1/3) 안에 슬라이더를 넣으면 못 끈다.
 */
/**
 * 🖱️ **레이어 바깥을 눌렀을 때만 닫는다** (기사님 2026-09-09 *"지금 오작동하는 거 같아"*).
 *
 * 🔴 **온 화면 덮개(`fixed inset-0`)를 쓰고 있었다.** 그래서 레이어가 열려 있는 동안
 *    **다른 칸을 누르면 그 클릭을 덮개가 삼켰다** — 첫 번째 누름은 덮개를 닫기만 하고
 *    아무 일도 안 일어나서, 두 번 눌러야 열렸다. «느린 것»처럼 보인 것이 이것이다.
 * 🔴 덮개는 애초에 필요 없다: 열린 칸은 `openKnob` **하나뿐**이라 다른 칸을 열면
 *    이 칸은 저절로 닫힌다. 그러니 «칸이 아닌 곳»만 감시하면 된다 (`data-pick`).
 */

function KnobGrid({ knobs, open, onOpen }: { knobs: KnobDef[]; open: string | null; onOpen: (k: string | null) => void }) {
    const cur = knobs.find(k => k.key === open) ?? null;
    useCloseOnOutside(!!cur, useCallback(() => onOpen(null), [onOpen]));
    const clamp = (k: KnobDef, v: number) => Math.min(k.max, Math.max(0, v));
    return (
        <div className="relative">
            <div className="grid grid-cols-3 gap-1">
                {knobs.map(k => (
                    <button key={k.key} type="button" data-pick onClick={() => onOpen(open === k.key ? null : k.key)}
                        className={`flex flex-col items-start gap-0 px-1.5 py-1 rounded-lg border text-left ${k.dim ? 'opacity-50' : ''} ${
                            open === k.key ? 'border-info/55 bg-info/10' : 'border-border-card bg-background hover:border-border-hover'}`}>
                        <span className="text-[9.5px] font-bold text-text-muted leading-tight">{k.label}</span>
                        <span className="text-[14px] font-black text-text-primary tabular-nums leading-tight">
                            {k.value}<span className="text-[9.5px] font-bold text-text-muted">{k.unit}</span>
                        </span>
                    </button>
                ))}
            </div>
            {/**
              * 🔴 **닫는 길을 셋 둔다** (기사님 2026-09-09 *"닫히는 것도 해줘"*):
              *   ① 레이어의 «✕»  ② **바깥 아무 데나 누르기**  ③ Esc
              * 레이어가 값 버튼을 덮으므로 «같은 버튼 다시 누르기»만으로는 못 닫는다.
              * 바깥 클릭은 투명한 층으로 받는다 — 지도에 실수로 콜이 찍히는 것도 함께 막힌다.
              */}
            {cur && (
                <div data-pick className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1.5
                                rounded-xl border border-info/55 bg-surface shadow-lg px-1.5 py-2">
                    <button type="button" onClick={() => onOpen(null)}
                        className="shrink-0 text-[10px] font-black text-text-muted px-0.5">{cur.label} ✕</button>
                    <button type="button" onClick={() => cur.set(clamp(cur, cur.value - (cur.step ?? 1)))}
                        className="w-8 h-8 shrink-0 rounded-lg border border-border-hover bg-background text-[16px] font-black">−</button>
                    <input type="range" min={0} max={cur.max} step={cur.step ?? 1} value={cur.value}
                        onChange={e => cur.set(Number(e.target.value))}
                        className="flex-1 min-w-0 accent-[#0284c7]" />
                    <button type="button" onClick={() => cur.set(clamp(cur, cur.value + (cur.step ?? 1)))}
                        className="w-8 h-8 shrink-0 rounded-lg border border-border-hover bg-background text-[16px] font-black">+</button>
                    <span className="shrink-0 w-[48px] text-right text-[14px] font-black text-info tabular-nums">
                        {cur.value}<span className="text-[9px] font-bold">{cur.unit}</span>
                    </span>
                </div>
            )}
        </div>
    );
}
/** 아웃풋 키-값 한 줄 — 하단 분류 표의 기본 단위. 숨김(undefined)도 «숨김»으로 보여준다 (화면이 거짓말 안 하게) */
/**
 * 📦 하단 footer — **memo 부품** (실측 2026-09-11: 틱마다 화면 전체가 재생성되며 주행이 무거웠다).
 * 원문 JSON 의 stringify(수 KB)가 접혀 있어도 매 렌더 돌았고, 지역 목록(수백 동)도 매 틱 다시
 * 만들어졌다. props(아웃풋 참조)가 안 바뀌면 통째로 건너뛴다 — 내용·모양은 그대로다.
 */
const FilterFooter = memo(function FilterFooter({ out, callTarget, lineOn, routeMode }: {
    out: ReturnType<typeof buildAppFilterOutput>;
    callTarget: keyof typeof CALL_TARGET_LABEL; lineOn: boolean; routeMode: boolean;
}) {
    return (
        <>
        {/* 📦 하단 — 필터로 나갈 값. 축별 6열 분류 (기사님 2026-09-07: «키우고 잘 분류해서 — 스크롤 없이») */}
        <footer className="shrink-0 border-t border-border-card bg-surface px-3 py-2 flex gap-3 h-[400px] text-[11px]">
            {/* 열 1 · 국면 축 */}
            <section className="w-[200px] shrink-0 rounded-xl border border-border-card bg-background p-2.5 overflow-y-auto">
                <h2 className="text-[11px] font-black text-info mb-1">🧭 국면 축</h2>
                <OutKv k="callTarget" v={`${out.callTarget} (${CALL_TARGET_LABEL[callTarget]})`} />
                <OutKv k="dispatchPhase" v={out.dispatchPhase} />
                {/* 🔴 국면(파생)을 뺐다 — 값이 한 벌이라 «어느 벌인가»가 없다 (2026-09-09) */}
                <OutKv k="그물" v={lineOn ? '노선 (라인 ∪ 남은 마름모)' : routeMode ? '노선 — 경로 대기 (마름모 하나)' : '동선 (마름모 하나)'} />
                <OutKv k="driverAction" v={out.driverAction} />
                <OutKv k="isSharedMode" v={String(out.isSharedMode)} />
                <OutKv k="isActive" v={String(out.isActive)} />
            </section>
            {/* 열 2 · 어디로 (지역 손잡이) */}
            <section className="w-[230px] shrink-0 rounded-xl border border-border-card bg-background p-2.5 overflow-y-auto">
                <h2 className="text-[11px] font-black text-info mb-1">🎯 어디로</h2>
                <OutKv k="destinationCity" v={out.destinationCity} />
                <OutKv k="pickupRadiusKm" v={out.pickupRadiusKm} />
                <OutKv k="destinationRadiusKm" v={out.destinationRadiusKm} />
                <OutKv k="detourRadiusKm" v={out.detourRadiusKm} />
                <OutKv k="mode" v={out.mode} />
            </section>
            {/* 열 3 · 돈 축 */}
            <section className="w-[230px] shrink-0 rounded-xl border border-border-card bg-background p-2.5 overflow-y-auto">
                <h2 className="text-[11px] font-black text-info mb-1">💰 돈 축</h2>
                <OutKv k="callDiscountPct" v={out.callDiscountPct !== undefined ? `${out.callDiscountPct}%` : undefined} />
                <OutKv k="minFare" v={out.minFare?.toLocaleString()} />
                <OutKv k="maxFare" v={out.maxFare?.toLocaleString()} />
                <div className="mt-1 text-text-muted font-bold">ratePerKm (하한 원/km)</div>
                {Object.entries(out.ratePerKm ?? {}).map(([veh, rate]) => (
                    <OutKv key={veh} k={veh} v={`≥ ${rate}`} />
                ))}
            </section>
            {/* 열 4 · 콜 속성 축 */}
            <section className="w-[220px] shrink-0 rounded-xl border border-border-card bg-background p-2.5 overflow-y-auto">
                <h2 className="text-[11px] font-black text-info mb-1">📦 콜 속성 축</h2>
                <OutKv k="allowedVehicleTypes" v={out.allowedVehicleTypes?.join(' · ') || '전체'} />
                <OutKv k="excludedKeywords" v={out.excludedKeywords?.join(' · ') || '없음'} />
                <OutKv k="slotsUsed" v={`${out.slotsUsed} / ${TRUCK_CAPACITY_SLOTS}`} />
                <OutKv k="capacityConfidence" v={out.capacityConfidence} />
            </section>
            {/* 열 5 · 지역 목록 — 제일 크다 */}
            <section className="flex-1 min-w-0 rounded-xl border border-border-card bg-background p-2.5 overflow-y-auto">
                <h2 className="text-[11px] font-black text-info mb-1">
                    🗂️ 지역 목록 — keywords {out.destinationKeywords.length} · 좌표 dongs {out.destinationDongs.length}
                    {out.excludedRegions.length > 0 && <span className="text-danger"> · 제외 {out.excludedRegions.join(' · ')}</span>}
                </h2>
                <div className="flex flex-col gap-1 leading-snug">
                    {Object.entries(out.destinationGroups).map(([region, names]) => (
                        <div key={region}>
                            <b>{region} {names.length}</b>
                            <span className="text-text-muted"> — {names.join(' · ')}</span>
                        </div>
                    ))}
                </div>
            </section>
            {/* 열 6 · 원문 JSON — 접어 두고 복사만 바로 */}
            <section className="w-[260px] shrink-0 rounded-xl border border-warning/40 bg-background p-2.5 overflow-y-auto">
                <div className="flex items-center justify-between mb-1">
                    <h2 className="text-[11px] font-black text-warning">📦 원문 JSON</h2>
                    <button type="button"
                        onClick={() => { navigator.clipboard?.writeText(JSON.stringify(out, null, 2)).catch(() => { /* 클립보드 막힘 — 무시 */ }); }}
                        className="text-[10.5px] font-black text-text-muted hover:text-warning">📋 복사</button>
                </div>
                <details>
                    <summary className="cursor-pointer text-[10.5px] font-bold text-text-muted">펼쳐 보기 (앱 피기백 그대로)</summary>
                    <pre className="mt-1 text-[9.5px] leading-snug whitespace-pre-wrap break-all text-text-primary">{JSON.stringify(out, null, 1)}</pre>
                </details>
                <p className="mt-1 text-[10px] text-text-muted leading-snug">─ 하늘 사각형 = 동선 그물 · 파란 점 = 든 동 · 색 선 = 잡은 콜 경로 · 회색 선 = 지나온 길 · 띠 = 길 경유 띠</p>
            </section>
        </footer>
        </>
    );
});

/** 🗂️ 영역 시군구별 목록 — memo 부품 (동 수백 항목이 틱마다 재생성되던 것을 끊는다 · FilterFooter 와 같은 판) */
const RegionAreaList = memo(function RegionAreaList({ groups, excluded }: {
    groups: ReadonlyArray<{ region: string; names: string[] }>; excluded: readonly string[];
}) {
    return (
        <div className="mt-1 flex flex-col gap-1 text-[10.5px] leading-snug">
            {groups.map(g => {
                const regionOut = isWholeRegionExcluded(excluded, g.region);
                return (
                    <div key={g.region}>
                        <b className={regionOut ? 'line-through text-text-muted' : ''}>{g.region} {g.names.length}</b>{' — '}
                        {g.names.map((n, i) => (
                            <span key={n} className={regionOut || isRegionExcluded(excluded, g.region, n) ? 'line-through text-text-muted' : ''}>
                                {n}{i < g.names.length - 1 ? ' · ' : ''}
                            </span>
                        ))}
                    </div>
                );
            })}
        </div>
    );
});

function OutKv({ k, v }: { k: string; v: ReactNode }) {
    const hiddenVal = v === undefined || v === null;
    return (
        <div className="flex justify-between gap-2 py-0.5 border-b border-border-card/50 last:border-0">
            <span className="text-text-muted font-bold shrink-0">{k}</span>
            <span className={`text-right break-all ${hiddenVal ? 'text-text-muted/60 font-bold' : 'font-black'}`}>
                {hiddenVal ? '— 숨김' : v}
            </span>
        </div>
    );
}


export default function MapMockup() {
    const stageIdx = 0;   // 국면 프리셋 버튼은 2026-09-07 삭제(기사님) — 대기 판 고정. STAGES 데이터는 남긴다
    const [pickup, setPickup] = useState<Pt | null>(null);
    const [drop, setDrop] = useState<Pt | null>(null);
    /**
     * 💰📦 **후보콜의 요금과 짐** (기사님 2026-09-09 «필터를 만들어 보자» 판).
     *
     * 지도를 두 번 눌러 만든 콜이라 **배차망이 줄 값이 없다.** 그래서 기사님이 넣는다 —
     * 화면의 「② 후보콜에 대한 추가정보 요청」이 원래 그 자리였고, 지금까지 «—» 로 비어 있었다.
     *
     * 🔴 **이 둘이 없으면 색이 안 나온다.** 돈은 «요금 ÷ 더 쓰는 시간»이고 공간은
     *    «용량 − 쓴 박스 − 이 콜»이라, 둘 다 이 콜의 값을 필요로 한다.
     * 기본값: 요금은 **배송거리 × 단가**(앱 필터가 통과시키는 최소선) · 짐은 **1박스**
     *   (볼트 이틀 표를 정리할 때 기사님이 «모든 콜 = 1박스»로 가정하신 그 값).
     */
    const [candFare, setCandFare] = useState(LAB_DEFAULTS.candFare);
    const [candBoxes, setCandBoxes] = useState(LAB_DEFAULTS.candBoxes);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const boxRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ w: 900, h: 640 });
    /** 화면px ↔ 좌표 역변환 재료 (클릭용) */
    const viewRef = useRef({ z: 10, originX: 0, originY: 0 });
    const drawRef = useRef<() => void>(() => { });

    /**
     * 🎚️ 그물 셋업 — 각도 둘·반경 둘 (기사님 요청 2026-09-07 «아까처럼 만들어 넣어줘»).
     * 사각형의 기점 = 내 위치라 현위치각·출발각은 같은 자리 — 각도는 둘만 받는다.
     * 현위치 반경은 그물의 출발 원이면서 **상차 반경(1단계)과 ② 여유값**까지 겸한다 — 판정과 한 값.
     */
    /**
     * 🎚️ **필터 값 — 한 벌이다** (기사님 확정 2026-09-09).
     *
     * 기사님: *"모두 꺼내 두고 노선이면 라인값을 사용하고 동선이면 사용 안 하면 되니까."*
     *
     * 🔴 **2026-09-08 까지는 국면 다섯 벌이었다**(`user_filter_phases` 를 그대로 흉내 냈다).
     *    그런데 열어 보니 다섯 벌이 하는 일은 «값을 여러 벌 두는 것»이 아니라
     *    **«지금 안 쓰는 칸을 감추는 것»**(`PHASE_FIELDS` 의 `hidden`)이었다.
     *    감추면 화면이 조용히 거짓말하고, 국면이 바뀔 때 **다른 벌이 읽혀 값이 갈린다** —
     *    기사님이 화면에서 잡으셨다: *"우리 설정과 다른 값을 쓰고 있고."*
     *
     * 🔴 **지금 안 쓰는 값은 그냥 안 읽힐 뿐이다.** 라인 반경은 노선일 때만 쓰이고,
     *    상차 반경은 콜을 쥐면 라인이 대신 판단한다 — 값을 감추거나 벌을 나눌 이유가 없다.
     *
     * ⚠️ 실물(`user_filter_phases`)은 아직 다섯 벌이다. 그 차이는 이식 계획에 적어 뒀다.
     */
    const [knobs, setKnobs] = useState({
        srcAngleDeg: LAB_DEFAULTS.srcAngleDeg, dstAngleDeg: LAB_DEFAULTS.dstAngleDeg,
        pickupRadiusKm: LAB_DEFAULTS.pickupRadiusKm, dropoffRadiusKm: LAB_DEFAULTS.dropoffRadiusKm,
        quadRadiusKm: LAB_DEFAULTS.quadRadiusKm, discountPct: LAB_DEFAULTS.discountPct,
    });
    /** 값 하나를 고친다 — 국면이 없으니 «어느 벌»을 고를 일이 없다 */
    const patchKnob = (patch: Partial<typeof knobs>) => setKnobs(k => ({ ...k, ...patch }));

    /**
     * ✅ 확정한 콜들 (기사님 요청 2026-09-07 «확정하면 콜 리스트로, 지도에 색·경유 번호로»).
     * 확정해도 그물은 안 움직인다 — 그물의 기점은 내 위치이고, 확정은 경로와
     * «첫 콜을 잡았다»(상차 영역이 ∩ 로 조여짐)만 바꾼다. 국면을 바꾸면 판이 새로 시작된다.
     */
    const [confirmed, setConfirmed] = useState<LabCall[]>([]);
    /** 📦 쓴 박스 = 잡은 콜들의 짐 합 (위 주석 참조 — 손잡이가 아니라 파생이다) */
    const slotsUsed = useMemo(() => confirmed.reduce((a, c) => a + (c.boxes ?? 0), 0), [confirmed]);
    /**
     * 📍 내 위치 (기사님 확정 2026-09-07 오후) — **사각형의 기점은 마지막 하차지가 아니라 현위치다.**
     * 하차지 기점이면 출발 전에 내 앞길(현위치~하차지 사이) 콜을 통째로 버린다 — 실측으로 잡힌 문제.
     * 국면 버튼은 «그 하차를 마치고 거기 서 있다»는 가정으로 내 위치를 옮겨 줄 뿐이고,
     * 「내 위치 찍기」로 아무 데나 옮겨 실험할 수 있다.
     */
    const [myPos, setMyPos] = useState<Pt>({ lng: NET_SRC.lng, lat: NET_SRC.lat });
    const [clickMode, setClickMode] = useState<'call' | 'me'>('call');
    /** 🎯 목적지 — **도를 고르고 시를 고른다** (기사님 확정 2026-09-09 · 위 DEFAULT_SIDO 주석 참조) */
    const [dstSido, setDstSido] = useState(DEFAULT_SIDO);
    const [dstSgg, setDstSgg] = useState<string>(DEFAULT_SGG);
    /**
     * ↩️ **행선 — 목적지행 ↔ 복귀** (기사님 확정 2026-09-08). 복귀를 누르면:
     *   · 방식(노선/동선)은 그 자리에서 그대로 — 노선이면 집 방향 길 찾기를 «지금» 한다
     *   · 그물 = 관내 원 ∪ 복귀 트랙, **콜 처리 중에도** 양방향 (복귀 콜을 미리 노린다)
     *   · 복귀 콜을 잡으면(homeCaught) 관내는 원 ∩ 복귀 트랙(길목 조각)만 남는다
     */
    const HOME_DST: NetPoint = useMemo(() => ({ ...NET_SRC, name: '복귀(집)' }), []);
    const [homeOn, setHomeOn] = useState(false);
    /** 고른 시군구의 «시내»(법정동 평균)가 목적지 좌표다 — 이름은 시군구 그대로 쓴다 */
    const dst = useMemo<NetPoint>(() => {
        try { return cityCenter(dstSgg, dstSgg); }
        catch { return NET_DST; }          // 지도에 없는 이름이면 기본으로 (조용히 틀리지 않게)
    }, [dstSgg]);
    /** 🎯 살아 있는 목적지들 — 그물·판정·화면이 전부 이 목록 하나를 읽는다 (⑮ 기준 1·2) */
    /**
     * 🏠 **복귀콜을 잡았나** — 잡은 순간부터 복귀가 «진행»된다 (기사님 확정 2026-09-09).
     * 판(`destName`)이 집인 콜이 하나라도 있으면 잡은 것이다.
     *
     * 🔴 **되돌아가는 조건은 «취소» 하나다** (2026-09-09 리뷰 정정 — 주석이 코드와 다른 말을 했다):
     *   · 하차를 **마쳐도** 유지된다 — 끝난 콜도 `confirmed` 에 남기 때문이고, 그게 맞다.
     *     복귀는 그 판의 끝이지 콜 하나의 상태가 아니다
     *   · 복귀콜을 **취소하면** 되돌아간다 — 잡은 복귀콜이 없으니 «복귀 진행»이 아니다.
     *     그때는 목적지가 다시 살아나는 것이 맞다
     */
    const homeCaught = useMemo(() => confirmed.some(c => c.destName === HOME_DST.name), [confirmed, HOME_DST.name]);
    /** 지금 살아 있는 목적지 — 규칙은 `activeGoals()` 한 곳이고 검사가 지킨다 */
    const goals: NetPoint[] = useMemo(() => activeGoals(dst, HOME_DST, { homeOn, homeCaught }),
        [homeOn, homeCaught, dst, HOME_DST]);
    /**
     * ⛔ 제외지역 (기사님 2026-09-07) — 그물에 들어도 필터에 안 싣는 곳.
     * 키 두 모양: `R|시군구`(통째) · `D|시군구|읍면동`(하나). 이름만 쓰면 동명이인(창전동)이 섞인다.
     */
    /**
     * 🎛️ 필터 옵션 (기사님 2026-09-07: 오른쪽 사이드바 — **실물 필터에 있는 요소만**, 값은 목업).
     * 국면 규칙은 실물 원천(`PHASE_FIELDS`)을 그대로 import — 여기 다시 적지 않는다 (규칙 ③).
     * 상차 반경·하차지 주변은 왼쪽 손잡이(knobs)와 **같은 상태**를 읽는다 — 원천 하나.
     */
    // callTarget 은 행선·도착 인지에서 파생된다 — 아래 localMode 뒤에서 계산
    const [vehicles, setVehicles] = useState<string[]>([...LAB_DEFAULTS.vehicles]);
    /**
     * 🚫 **제외 단어 — 입력이 필요하다** (기사님 확정 2026-09-09: *"제외 단어는 입력이 필요하다.
     * 펼치면 내용을 볼 수 있다"*). 실물에서는 앱이 콜 글자에서 이 단어를 찾아 거른다(여섯 축의 «블랙리스트»).
     *
     * 🔴 실험실 콜에는 적요가 없어 **여기서는 걸릴 것이 없다.** 그래도 손잡이는 필요하다 —
     *    «무엇을 안 잡을지»는 기사님이 정하는 값이고, 아웃풋으로 앱에 내려간다.
     *    폰 화면을 생각해 **평소엔 접어 두고 펼쳐서 고른다.**
     *
     * 💡 **기사님 아이디어 (2026-09-09 · 나중에 논의)**: 이 축이 «도착 **위치** 조건»이 될 수도 있다 —
     *    *"아파트 상가 같은?"* 지금은 단어 하나로 «안 잡는다»만 답하는데, «어떤 자리에 내리는가»는
     *    다른 질문이다 (엘리베이터·주차·층수 …). todo 에 있다.
     */
    const [excludedWords, setExcludedWords] = useState<string[]>([...LAB_DEFAULTS.excludedWords]);
    /**
     * 📦 **쓴 박스 — 손잡이가 아니라 파생이다** (기사님 확정 2026-09-09: *"적재는 상태값이니 필요 없고"*).
     * 잡은 콜들의 짐을 더한다. 실물도 같은 방식이고, 그 이유가 실물 주석에 적혀 있다 —
     * *"차종으로 다시 세면 통화로 확인한 실제 짐 양이 반영되지 않아 화면과 판정이 다른 말을 한다."*
     */
    /**
     * 📦 짐을 통화로 **확정했는가** — 실험실 콜에는 짐 정보가 없으므로 늘 «추정»이다.
     * 실물에는 기사님이 누르는 «확정» 버튼이 있다 (통화로 짐 양을 들은 뒤).
     */
    const capacityConfirmed = false;
    /** 🚗 모의 주행 — 경로가 있으면 내 위치가 경로를 따라간다, 없으면 대기 */
    const [driving, setDriving] = useState(false);
    const [speedIdx, setSpeedIdx] = useState(1);
    /**
     * ⏸ 주행 중 새 콜이 생기면 멈추고, 처리(확정/지우기)되면 다시 달린다 (기사님 2026-09-07).
     * 실물의 흐름 그대로다 — 콜이 뜨면 결재하고, 끝나면 계속 간다.
     */
    const [pausedForCall, setPausedForCall] = useState(false);
    /**
     * ⏱️ **안전취소 30초** — 실전에서 콜을 집으면 위약금 없이 무를 수 있는 30초가 흐르고
     * 그 사이 서버가 심사한다. 시뮬도 그 시계를 돌려야 «주행 중 콜»이 실감난다
     * (기사님 2026-09-08: *"좀 더 시뮬레이션처럼"*). 30초가 지나면 그냥 지나갈 뿐 —
     * 자동으로 버리지 않는다 (규칙 ①: 콜의 주인은 기사님).
     */
    /**
     * 🪜 **투 스텝** (기사님 2026-09-08): 콜을 찍으면 ① 앱 필터가 먼저 답하고,
     * **「필터 통과 → 올린다」를 눌러야** ② 서버로 올라가 심사·경로가 시작된다 —
     * 실물 그대로다(앱이 올린 콜만 서버가 본다). 이식 때 ①은 앱, ②는 서버로 간다.
     */
    const [uploaded, setUploaded] = useState(false);
    /**
     * 🗄️ **구간 캐시 — 한 번 그린 궤적을 두 번 그리지 않는다** (기사님 2026-09-08).
     * 키는 «시작→끝+옵션». 올릴 때 받은 곡선을 여기 넣어 두면 확정 후 그 구간은 다시 안 묻는다.
     */
    const legCacheRef = useRef(new Map<string, { line: Pt[]; failed: boolean }>());
    /**
     * 🛰️ **시스템 — 카카오 호출 기록** (기사님 2026-09-08: *"어떤 시점에 어떤 값으로 호출하고
     * 무엇을 리턴받았는지"*). 서버(/api/sim/*)를 거쳐 카카오를 부르는 **모든 자리**가 이 문
     * 하나를 통과한다 — 자리마다 따로 적으면 한 곳을 빼먹는다 (규칙 ③: 원천 하나).
     */
    const [apiLog, setApiLog] = useState<Array<{
        t: string; who: string; path: string; ms: number; req: string; res: string; ok: boolean;
        /** 어느 콜을 올리며 부른 것인가 — 심사 영역이 «이 콜의 호출»만 골라 보여준다 */
        tag?: string;
        /** 보낸 값·받은 값 **전체** (팝업용). 폴리라인은 «점 N개» 로 접는다 — 그대로 두면 수만 자다 */
        reqJson: string; resJson: string;
    }>>([]);
    /** 🔎 팝업으로 펼쳐 볼 호출 하나 (null 이면 닫힘) */
    const [apiPeek, setApiPeek] = useState<number | null>(null);
    /** 📋 저장된 콜 전부를 날것 그대로 — 제목을 누르면 열린다 (기사님 2026-09-09) */
    const [callsPeek, setCallsPeek] = useState(false);
    /**
     * 📍 **정거장 상세** — 콜 리스트의 정거장을 누르면 열린다 (기사님 확정 2026-09-09).
     *
     * 콜 리스트 한 줄은 **달리며 훑는 자리**라 짧아야 한다(괄호 다섯 값 그대로 둔다).
     * 라벨을 펼친 이 화면은 **서서 보는 자리** — 퀵사가 «왜 늦었어» 할 때 여는 곳이다.
     * 3·4단계의 «이유»도 여기 들어간다.
     */
    const [stopPeek, setStopPeek] = useState<{ callId: number; kind: '상차' | '하차' } | null>(null);
    /** 지금 심사 중인 콜의 호출 꼬리표 — 심사 영역이 «이 콜의 카카오 호출»만 골라 보여준다 */
    const [uploadTag, setUploadTag] = useState<string | null>(null);
    /** 좌표 배열은 «점 N개» 로 접는다 — 값을 보러 여는 창인데 폴리라인이 화면을 덮으면 못 본다 */
    const foldLines = (v: unknown) => JSON.stringify(v, (k, val) =>
        (k === 'line' || k === 'vertexes') && Array.isArray(val) ? `«점 ${val.length}개»` : val, 2).slice(0, 20000);
    const callApi = async (who: string, path: string, body: Record<string, unknown>, reqSummary: string, tag?: string) => {
        const t0 = Date.now();
        const t = new Date().toTimeString().slice(0, 8);
        try {
            const r = await fetch(`${apiBase()}${path}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const d = await r.json();
            const res = Array.isArray(d.roads)
                ? `길 ${d.roads.length}개: ${d.roads.map((x: { option: string; distKm: number; durMin: number }) => `${x.option} ${x.distKm}km/${x.durMin}분`).join(' · ')}`
                : Array.isArray(d.legs)
                // 🔴 `/sim/route` 는 legInfo 로, `/sim/chain` 은 legs 안에 값을 담는다 —
                //    legInfo 만 읽어서 전체 경로 응답이 «구간 4: » 로 텅 비어 보였다 (2026-09-08)
                ? `구간 ${d.legs.length}: ${(d.legInfo ?? d.legs).map((li: { distKm: number; durMin: number; tollWon?: number | null; failed?: boolean }) =>
                    li.failed ? '실패(직선)' : `${li.distKm}km/${li.durMin}분${li.tollWon != null ? `/톨${li.tollWon}` : ''}`).join(' · ')}`
                : JSON.stringify(d).slice(0, 80);
            setApiLog(l => [{ t, who, path, ms: Date.now() - t0, req: reqSummary, res, ok: true, tag, reqJson: foldLines(body), resJson: foldLines(d) }, ...l].slice(0, 40));
            return d;
        } catch (err) {
            setApiLog(l => [{ t, who, path, ms: Date.now() - t0, req: reqSummary, res: `❌ ${String((err as Error)?.message ?? err)}`, ok: false, tag, reqJson: foldLines(body), resJson: '(응답 없음)' }, ...l].slice(0, 40));
            throw err;
        }
    };

    /** 올린 콜의 실도로 곡선 — 필터 통과 순간 받아온다 (서버가 심사하며 보는 그 경로) */
    const [uploadedLeg, setUploadedLeg] = useState<Pt[] | null>(null);
    /**
     * 🔴 **합짐의 «지금 경로» 미리보기** (기사님 2026-09-08: *"값은 받아 왔는데 경로를 그리지 않는다"*).
     * ⑮ 고유 호출을 «확정 뒤»로 옮기면서 `uploadedLeg`·`approachLeg` 가 **첫짐일 때만** 채워지게 됐고,
     * 합짐은 ⑬⑭ 전체 경로를 받아 두고도 **그릴 그릇이 없어** 직선 점선만 남았다.
     * 전체 경로는 재배치한 순서 그대로이므로 이걸 그리면 «이 콜을 끼면 이렇게 간다»가 그대로 보인다.
     *
     * 🔴 **⑭ 에서 전부 실선으로 그린다** (기사님 2026-09-08: *"14에서 다 그려야 하는데…
     * 점선이면 사용자가 확정을 해야 할지 취소를 해야 할지 몰라"*). ⑭-1 심사와 ⑭-2 확정은
     * **이 그림을 보고** 하는 것이므로, 전체 경로가 오면 직선 점선은 걷어낸다.
     * `isNew` = 이 콜 때문에 생긴 구간 — 판정색으로 굵게, 나머지는 파랑.
     */
    const [chainPreview, setChainPreview] = useState<Array<{ line: Pt[]; isNew: boolean }> | null>(null);
    /** 🚚 «상차지까지» 구간 — 현위치→상차지. **상차 약속의 재료**다 (몇 분 뒤 도착하나) */
    const [approachLeg, setApproachLeg] = useState<Pt[] | null>(null);
    const [approachInfo, setApproachInfo] = useState<{ distKm: number | null; durMin: number | null; failed?: boolean } | null>(null);
    /** 올릴 때 받은 그 콜의 실측 — 확정하면 그대로 카드에 쓴다 (같은 구간을 두 번 묻지 않는다) */
    const uploadedInfoRef = useRef<{ distKm: number | null; durMin: number | null; tollWon: number | null; failed: boolean } | null>(null);
    const [callSeenAt, setCallSeenAt] = useState<number | null>(null);
    const [nowTick, setNowTick] = useState(Date.now());
    useEffect(() => {
        if (!callSeenAt) return;
        const t = setInterval(() => setNowTick(Date.now()), 250);
        return () => clearInterval(t);
    }, [callSeenAt]);
    const safeCancelLeft = callSeenAt ? Math.max(0, 30 - Math.floor((nowTick - callSeenAt) / 1000)) : null;
    const pauseForCall = () => { if (driving) { setDriving(false); setPausedForCall(true); } };
    const targetIdxRef = useRef(1);
    /** 지금 향하는 정거장 순번 — 왼쪽 노선 패널의 «▶ 다음» 표시용 (ref 를 화면에 비추는 거울) */
    const [targetSeq, setTargetSeq] = useState(1);
    const myPosRef = useRef(myPos);
    useEffect(() => { myPosRef.current = myPos; }, [myPos]);
    /**
     * 🐾 지나온 길 (기사님 2026-09-07 밤 «내가 지나온 길을 표시해 줘») — 주행이 실제로 밟은 점들.
     * 🔴 경로가 다시 짜여도(합짐 수락) 이 흔적은 **지우지 않는다** — 새 경로는 이 위에 더해진다.
     * 구간 배열인 이유: 「내 위치 찍기」 순간이동(>2km 튐)은 주행이 아니다 — 끊고 새 구간을 연다.
     * ref 인 이유: 120ms 틱마다 setState 를 또 하면 재렌더가 두 배가 된다 — 그리기는 myPos 변화가 이미 부른다.
     */
    const trailRef = useRef<Pt[][]>([]);
    useEffect(() => {
        const segs = trailRef.current;
        const seg = segs[segs.length - 1];
        const last = seg?.[seg.length - 1];
        const jumpKm = last ? Math.hypot((myPos.lng - last.lng) * 88.6, (myPos.lat - last.lat) * 110.574) : Infinity;
        if (jumpKm < 0.05) return;                    // 제자리 — 점을 안 쌓는다
        if (jumpKm > 2 || !seg) segs.push([myPos]);   // 순간이동 — 새 구간
        else seg.push(myPos);
    }, [myPos]);
    useEffect(() => {
        setConfirmed([]); setPickup(null); setDrop(null); setDriving(false); setPausedForCall(false);
        const v = STAGES[stageIdx].vertex;
        setMyPos({ lng: v.lng, lat: v.lat });
    }, [stageIdx]);

    const stage = STAGES[stageIdx];
    const baseCallCount = stage.path.length ? (stage.path.length - 1) / 2 : 0;
    /**
     * 🧳 **그 정거장의 짐으로 정차를 낸다** — 라벨(`②상차`)의 콜 번호로 박스 수를 찾는다.
     * 🔴 콜마다 짐이 다르므로 **한 값으로 퉁치지 않는다.** 후보콜(번호가 없는 «상차»·«하차»)은
     *    지금 입력창의 박스 수를 쓴다 — 기사님이 그 자리에서 고치시는 값이다.
     */
    const labDwellOf = useCallback((label: string) => {
        const no = label.charCodeAt(0) - 0x2460 + 1;          // ① → 1 (아니면 범위 밖 → 후보콜)
        const i = no - baseCallCount - 1;
        const boxes = i >= 0 && i < confirmed.length ? confirmed[i].boxes : candBoxes;
        return labDwellOfBoxes(boxes, label);
    }, [confirmed, candBoxes, baseCallCount]);
    /** 첫 콜을 잡았는가 — 프리셋 국면도 콜을 쥔 상태다. 잡았으면 상차 영역 = 내 반경 ∩ 사각형 */
    const routeStarted = confirmed.length > 0 || stage.path.length > 0;
    /**
     * 🏘️ 관내(도착) 인지 — 목적지 원 안 + 출발지(집) 원 밖.
     * 🔴 예전엔 **운행 중 벌로 고정**했다 — 활성 벌을 읽으면 «관내 인지 → 국면 → 벌 → 관내 인지»
     *    순환이 생겨서다. **값이 한 벌이 되며 그 순환이 사라졌다** (2026-09-09).
     *    같이 있던 `Math.max(6, …)` 바닥값도 걷어냈다 — 근거 없는 상수였다.
     */
    const localMode = isLocalPhase({
        srcAngleDeg: knobs.srcAngleDeg, dstAngleDeg: knobs.dstAngleDeg,
        srcDiamKm: knobs.pickupRadiusKm * 2, dstDiamKm: knobs.dropoffRadiusKm * 2,
        quadRadiusKm: knobs.quadRadiusKm,
    }, NET_SRC, dst, myPos);
    /** 콜 타겟 — 행선·도착 인지에서 **파생** (수동 버튼 없음): 복귀행 / 관내 / 노선행 */
    const callTarget: 'DEST' | 'LOCAL' | 'HOME' = homeOn ? 'HOME' : localMode ? 'LOCAL' : 'DEST';
    /** 운행 상태 — 실험실 상태에서 파생: 콜 0 = 대기 · 콜 쥠 = 합짐 수집 · 주행 = 운행 중 */
    const dispatchPhaseSim = confirmed.length > 0 ? (driving ? 'DELIVERING' as const : 'GATHERING' as const) : 'STANDBY' as const;
    const params = useMemo(() => ({
        srcAngleDeg: knobs.srcAngleDeg, dstAngleDeg: knobs.dstAngleDeg,
        srcDiamKm: knobs.pickupRadiusKm * 2, dstDiamKm: knobs.dropoffRadiusKm * 2,
        quadRadiusKm: knobs.quadRadiusKm,
    }), [knobs]);
    /**
     * 🧭 **노선 / 동선** (기사님 확정 2026-09-09) — 입력값은 **한 벌을 같이 쓰고**,
     * 노선일 때만 **라인 반경**을 더 쓴다.
     *
     * | | 그물 |
     * |---|---|
     * | 동선 | 마름모 하나 — 기점은 내 위치 |
     * | 노선 | **잡은 콜들의 실제 경로 양옆 라인 반경** ∪ **마지막 하차지→목적지 마름모** |
     *
     * 🔴 2026-09-07~08 의 노선은 «길 찾기로 고른 직행 길»이었다. 그 길은 **잡아 둔 콜을
     *    안 거치므로**, 콜을 쥐면 틀린 답을 냈다(그래서 잠가 뒀었다). 지금은 **콜이 라인을 만든다.**
     */
    const [routeMode, setRouteMode] = useState(LAB_DEFAULTS.routeMode);
    /**
     * ⛔ **고치는 중(초안) ↔ 실제로 적용된 것** (기사님 2026-09-09:
     * *"이걸 누르면 **너무 쉽게 삭제**되는데.. 바로바로 저장되면 안 될 것 같아.
     * 접기 옆에 **저장 버튼**이 있어야 할 것 같아."*).
     *
     * 🔴 칩 하나를 잘못 누르면 그 지역이 **그 자리에서 그물에 들어왔다.** 운전 중이면 되돌릴
     *    새도 없다. 그래서 고치는 것과 적용하는 것을 갈랐다 — 「💾 저장」을 눌러야 그물이 바뀐다.
     * 🔴 **그물·판정·아웃풋은 `excluded`(적용본)만 읽는다.** 초안(`exDraft`)은 필터 화면만 본다.
     */
    const [excluded, setExcluded] = useState<string[]>(LAB_DEFAULT_EXCLUDED);
    const [exDraft, setExDraft] = useState<string[]>(LAB_DEFAULT_EXCLUDED);
    /** 저장 안 한 고침이 있나 — 순서는 상관없다 */
    const exDirty = useMemo(() => {
        const a = [...excluded].sort(), b = [...exDraft].sort();
        return a.length !== b.length || a.some((v, i) => v !== b[i]);
    }, [excluded, exDraft]);
    /**
     * ⛔ **제외지역도 도 → 시·군·구 → 보기** (기사님 확정 2026-09-09:
     * *"도 특별시 이렇게 2개로 선택하게 하고 마지막은 보기 버튼으로 하면 어때?"*).
     * 앞의 둘은 **어디를 볼지 좁히는 것**이고, 빼고 넣는 것은 「보기」 안에서 한다 —
     * 한 버튼이 «고르기»와 «제외»를 겸하면 누를 때마다 무슨 일이 날지 모른다.
     */
    const [exSido, setExSido] = useState(DEFAULT_SIDO);
    const [exSgg, setExSgg] = useState<string | null>(null);
    /** ⚖️ 심사창에서 접어 둔 것들 — 캘 때만 편다 (기사님 2026-09-10 «심사 부분이 너무 높이가 높아») */
    const [judgeLogOpen, setJudgeLogOpen] = useState(false);
    /** 🪟 시트 아코디언 — **하나만 열린다** (실물 `openIdx` 와 같은 규칙) */
    const [sheetOpenNo, setSheetOpenNo] = useState<string | null>(null);
    const [judgeHelpOpen, setJudgeHelpOpen] = useState(false);
    /** ⛔ 제외 목록을 펼쳤나 — 닫히면 **한 줄**, 누르면 전부 (기사님 2026-09-09) */
    const [exListOpen, setExListOpen] = useState(false);
    /**
     * ⛔ 제외지역은 **노선·동선 공통**이다 (기사님 2026-09-09 «공통으로 빼»).
     * 2026-09-08 에는 노선에서 안 썼다 — 그때 노선은 «길 하나»라 길이 곧 선별이었다.
     * 지금은 노선에도 마름모가 함께 살아서 넓은 구간이 다시 들어온다.
     */
    const isExcluded = (region: string, name: string) => isRegionExcluded(excluded, region, name);
    /**
     * 📏 **라인 반경 km** — 길 중심선에서 **한쪽으로** 몇 km 까지 콜을 받나
     * (기사님 이름 확정 2026-09-09: *"라인 반경"*. 옛 이름 «경유 폭»).
     *
     * 🔴 실물의 **«우회 허용»**(`detour_allow_km` — 카카오가 재는 **총거리 증가분**)과 **다른 값이다.**
     *    둘 다 km 라 한 이름으로 부르면 이식할 때 조용히 섞인다.
     */
    const [lineRadiusKm, setLineRadiusKm] = useState(LAB_DEFAULTS.lineRadiusKm);
    /**
     * 🎨 **그물 전용 캔버스** (기사님 2026-09-09: *"지금은 하나씩 그려서 겹치는 부분만 진한 색인데..
     * 한 번에 그리면 어떨까? 많이 연산해야 해?"*).
     *
     * 🔴 마름모·원은 한 path 로 묶어 겹침을 없앴는데 **라인 띠는 `stroke` 라 그 path 에 못 들어간다** —
     *    그래서 띠와 마름모가 겹치는 자리만 진하게 남았다.
     * 그래서 그물을 **여기에 불투명으로 다 그린 뒤 통째로 한 번** 얹는다 — 겹침이 원리적으로 없다.
     * 연산은 거의 안 는다: 같은 도형을 한 번 더 그리는 것이고, 캔버스는 재사용한다.
     */
    const netLayerRef = useRef<HTMLCanvasElement | null>(null);
    /** 🎚️ 지금 펼친 값 하나 — 여럿을 펼치면 폰에서 화면이 밀린다 (기사님 2026-09-09) */
    const [openKnob, setOpenKnob] = useState<string | null>(null);
    /** 🎨 상차/하차 색은 테마마다 다르다 — 실물 팔레트가 그 규칙을 쥐고 있다 */
    const { theme } = useTheme();
    /**
     * 🛣️ 경로 옵션 — 길 고르기를 걷어낸 뒤로 **«추천» 고정**이다 (기사님 2026-09-09 *"길찾기는 지워"*).
     * 고속도로냐 국도냐를 고르는 축은 별건이다 (todo 0-I) — 그때 여기에 손잡이가 붙는다.
     */
    const routeCombo = ROUTE_COMBO;
    const legKey = (aLng: number, aLat: number, bLng: number, bLat: number) =>
        `${aLng.toFixed(5)},${aLat.toFixed(5)}>${bLng.toFixed(5)},${bLat.toFixed(5)}|${routeCombo.priority}|${routeCombo.avoid ?? ''}`;
    const callSeqRef = useRef(0);
    /**
     * 🧅 레이어 (기사님 2026-09-07 «각각 레이어 처리 — 켜고 끄고») — 그리기 순서의 켜기/끄기.
     * 모든 레이어가 한 투영(줌·원점)을 쓰므로 켜고 꺼도 드래그·줌은 그대로다.
     */
    /**
     * 🔴 **「길」 레이어를 지웠다** (기사님 2026-09-10: *"길 레이어에 라인 반경을 그리고 있는데
     * 이유가 있어? 불필요한 길 레이어 지우고 싶어서"*).
     * 원래 그 자리는 **길 찾기 4옵션**(`liveRoads`)을 그렸다 — 2026-09-09 에 걷어냈고 이름만 남아
     * 라인 반경 띠를 그리고 있었다. 띠는 **그물 그 자체**(노선일 때 콜을 거르는 영역)라
     * 「그물」이 켜고 끈다. 스위치가 둘이면 «그물 켜고 길 끄기»라는 **반쪽 상태**가 생긴다.
     */
    const [layers, setLayers] = useState({ base: true, border: true, net: true, route: true, trail: true, call: true });
    /**
     * 🔍 보기 — 자동 맞춤(내용에 맞춰 줌) ↔ 수동(드래그·휠줌). 움직이면 수동이 되고 ⌖ 가 자동으로 되돌린다.
     */
    /** 🔴 수동 보기의 원천은 viewRef 하나다 — 상태는 «수동인가 + 다시 그려라(rev)»만 든다.
     *  center 를 상태에도 두었더니, 마우스 이벤트가 렌더보다 우선인 탓에 뒤늦게 커밋된 draw 가
     *  viewRef 를 한 발 전으로 되감아 이동분을 잃었다 (기사님 2026-09-11 «자꾸 당기고 튄다» — 실측 24걸음 중 3걸음 유실) */
    const [view, setView] = useState<{ manual: boolean; rev: number }>({ manual: false, rev: 0 });
    const dragRef = useRef({ sx: 0, sy: 0, moved: false, down: false });
    /** 화면을 dx,dy px 만큼 끈다 — 수동 보기로 들어간다.
     *  🔴 viewRef 에 즉시 적는다 — 마우스 이벤트가 그리기보다 빨라서, 묵은 원점에서
     *  다시 계산하면 앞선 이동분이 사라지며 지도가 뒤로 튕긴다 (기사님 2026-09-11 «자꾸 돌아가려 한다») */
    const panBy = (dx: number, dy: number) => {
        const v = viewRef.current;
        viewRef.current = { z: v.z, originX: v.originX - dx, originY: v.originY - dy };
        setView(p => ({ manual: true, rev: p.rev + 1 }));
    };
    /**
     * 📌 지금 화면을 그대로 얼린다 (기사님 2026-09-08 «탭을 바꾸면 원점이 바뀐다») —
     * 자동 맞춤은 «그물 내용»에 맞추므로 노선↔동선 전환 때 담을 도형이 달라져 화면이 점프했다.
     * 내 위치·목적지가 그대로면 화면도 그대로여야 한다. ⌖ 를 누르면 다시 자동 맞춤.
     */
    const freezeView = () => {
        setView(p => ({ manual: true, rev: p.rev + 1 }));
    };
    /** 커서 자리를 고정한 채 줌 — 지도 앱들의 그 손맛. viewRef 즉시 갱신은 panBy 와 같은 이유 */
    const zoomAt = (px: number, py: number, delta: number) => {
        const v = viewRef.current;
        const z2 = Math.max(8, Math.min(13, v.z + delta));
        if (z2 === v.z) return;
        const geo = fromWorldPx(v.originX + px, v.originY + py, v.z);
        const [wx, wy] = worldPx(geo.lng, geo.lat, z2);
        viewRef.current = { z: z2, originX: wx - px, originY: wy - py };
        setView(p => ({ manual: true, rev: p.rev + 1 }));
    };

    /** 프리셋 국면의 콜들 — 경로 상수(출발 + 상차·하차 짝)에서 되꺼낸다 */
    const presetCalls = useMemo(() => {
        const arr: Array<{ pickup: Pt; drop: Pt }> = [];
        for (let i = 1; i + 1 < stage.path.length + 1; i += 2) {
            const a = stage.path[i], b = stage.path[i + 1];
            if (a && b) arr.push({ pickup: { lng: a.x, lat: a.y }, drop: { lng: b.x, lat: b.y } });
        }
        return arr;
    }, [stage.path]);

    /**
     * 🛣️ **경로 순서** (기사님 2026-09-07 «서버가 경로를 수정할 거야» + 2026-09-08 재확정
     * *"가는 중이면 기존 경로 순서 뒤에 오는 번호를 붙여야 — 가까운 경로 찾기 로직을 피해야"*).
     *
     * 🔴 **번호는 약속이다 — 주행을 시작한 뒤에는 재정렬하지 않는다.**
     *   · 출발 전(수집): 가까운 곳 먼저(greedy) — 하차는 제 상차 뒤 (기존 확정)
     *   · 주행 후: 기존 순서 스냅샷 고정, 새 콜은 **맨 뒤에** 상차→하차로 붙는다
     * ⚠️ 이 규칙은 순서만 만진다 — **그물 기점은 내 위치, 고정 끝은 목적지 그대로다**
     *   (09-08 오전: 기점을 «마지막 하차지»로 옮겼다가 그물이 목적지를 안 보게 되어 되돌림.
     *    그물은 목적지를 보는 눈이다 — 기사님: *"목적지를 보고 있어야 해"*).
     */
    const [departed, setDeparted] = useState(false);
    /**
     * 🕒 **모의 시계 — 약속·예정·통과를 한 시계 위에 올린다** (기사님 2026-09-09:
     * *"시간이 빨라진 건 지금 모의 주행이라 차 속도가 엄청 빨라서 … 아닐까?"*).
     *
     * 실측: «보통»이 0.2km/틱 · 120ms → **약 6000km/h**. 약속·예정은 카카오가 준 **실제 분**인데
     * 통과만 벽시계로 찍히니 늘 «40분 빨라짐»이 나왔다 — 사실이 아니라 **시계가 둘이라서** 생긴 값이다.
     * 그래서 주행이 나아간 거리를 그 경로의 속도(㎞/분)로 나눠 **모의 분**을 쌓고, 세 값이 모두
     * 이 시계를 쓴다. 서 있는 동안은 시계도 선다 — 생각하는 사이에 약속이 밀리지 않는다.
     */
    const clockBaseRef = useRef(Date.now());
    const simMinRef = useRef(0);
    const [simMin, setSimMin] = useState(0);
    const clockNow = clockBaseRef.current + simMin * 60000;
    /** ㎞/분 — 지금 경로의 실제 속도. 못 구하면 40km/h 로 본다 */
    const paceRef = useRef(40 / 60);
    // 🔴 주행 버튼에서 이미 켜지만, 다른 길로 주행이 시작될 때를 위한 그물이다 (한 렌더 늦다)
    useEffect(() => { if (driving) setDeparted(true); }, [driving]);
    useEffect(() => { if (confirmed.length === 0) setDeparted(false); }, [confirmed.length]);
    /** 마지막으로 계산한 방문 순서 — 방문 고정(visited)의 원천 */
    const prevOrderRef = useRef<Array<{ call: number; kind: '상차' | '하차' }>>([]);
    /** 재배치 기점 — **주행 전에만** 내 위치를 본다 (주행 중엔 기점이 안 쓰이고, 보면 매 틱 다시 그린다) */
    const orderStart = departed ? null : myPos;
    /**
     * 📍 **출발한 자리 — 주행이 시작되면 얼린다** (2026-09-09 실측으로 잡음).
     *
     * 🔴 «순서를 정하는 기점»과 «경로를 그리는 시작점»은 **다른 것**인데 같은 값을 썼다.
     *    정거장을 지날 때마다 통과 도장을 찍느라 `setConfirmed` 이 돌고 → `confirmed` 가
     *    새 배열이 되고 → `effPath` 가 다시 계산되면서 **시작점이 «지금 내 자리»로 따라왔다.**
     *    그런데 첫 정거장은 여전히 `①상차` 라, «지금 자리 → ①상차» 라는 **유령 구간**이
     *    생겨 지도에 긴 ①색 선이 그어졌다 (실측: 4번을 지나는 순간 의정부→광주 붉은 선).
     */
    const departPosRef = useRef<Pt>(NET_SRC);
    /**
     * 🔴 «몇 정거장 지나왔나»는 targetSeq 로 읽으면 안 된다 (2026-09-08 실측 사고 · 규칙 ⑤-4 ⑤).
     * targetSeq 는 «주행 재개가 다음 향할 점»이고, 재개 로직이 지리적으로 가까운 정거장으로
     * 점프할 수 있다 — 그걸 방문 수로 읽자 안 지나간 정거장까지 잠겼다.
     * 방문 수는 **드라이브가 정거장에 실제로 도달한 순간에만** 여기서 센다.
     */
    const visitedCountRef = useRef(0);
    /**
     * ⏱️ **실제 통과 시각** (기사님 2026-09-08: *"지금 내가 하고 있는 것은 예상 시간인 거고
     * 진짜 통과 시간도 있으면 좋겠다 — 지나간 후 값이 생기면"*).
     * 키는 `①상차` 같은 정거장 이름, 값은 지난 순간의 시각. **지나기 전엔 아예 없다**
     * (0 이나 예상값으로 채우지 않는다 — 규칙 ④).
     */
    /**
     * 🧹 **취소된 콜 — 지우지 않고 옮긴다** (관제웹 규칙 그대로: *"종료된 콜은 사라지지 않고
     * «완료됨 · 취소/방출» 로 이동한다 — 안 보이는 것과 없어진 것은 다르다"*).
     *
     * 예전엔 `confirmed.slice(0, -1)` 로 **통째로 없앴다.** 그러면 «언제 무엇이 빠져서
     * 순서가 바뀌었나»가 사이클에서 사라진다 (기사님 2026-09-09: *"2번째 콜이 취소될 때"*).
     * `confirmed` 는 **활성 콜**만 담고, 경로·순번·판정은 그대로 그것만 본다.
     */
    const [terminated, setTerminated] = useState<Array<LabCall & { terminatedAt: number; no: string }>>([]);
    /**
     * 🔢 **판이 바뀐 횟수** — 확정·취소마다 오른다. 취소는 카카오 응답을 기다렸다가 적립하는데,
     * 그 사이에 판이 또 바뀌면 **인덱스로 만든 라벨이 어긋난다.** 늦게 온 응답을 버리는 열쇠다
     * (`uploadSeqRef` 와 같은 규약 · 2026-09-09 리뷰).
     */
    const planSeqRef = useRef(0);
    /** 🔎 지나는 순간 얼릴 «마지막 예상» — 키는 `콜id-상차/하차` (실물의 `predicted_at` 자리) */
    const etaRef = useRef<Record<string, number | null>>({});
    /**
     * 🛣️ **확정된 콜들의 실도로 경로 — 한 벌** (수술 1단계 · 기사님 승인 2026-09-11).
     *
     * 기사님 설계 그대로다: *"새 경로를 요청할 때는 **새로운 콜이 필터를 타고 왔을 때**야.
     * 그때 지나온 건 빼고 최적화로 섞어 그 값을 카카오에 요청해, 가지고 온 값을 지나온 길과 연결해."*
     *
     * 🔴 그 값이 **이미 와 있었다** — 콜을 올릴 때 받는 `/sim/chain` 응답에 구간별
     *    **폴리라인(`line`)**이 들어 있는데, 화면은 분·km 만 쓰고 선은 버리고 있었다.
     *    그리고 그리기·주행용으로는 옛 계보(`effPath`→`legCache`→`drawLegs`)를 따로 돌렸다 —
     *    「내 위치」가 둘로 뜨고 직선이 날아다닌 뿌리가 그 **두 계보**다.
     * 🔴 여기는 **확정 순간의 chain 을 얼려 둔다.** 콜을 올릴 때마다(=새 콜이 필터를 타고
     *    왔을 때) 내 위치 기준으로 다시 재지니, 확정하면 그 값이 곧 «남은 길»이다.
     *    지나온 길은 궤적(동선)이 잇는다.
     */
    const [routeChain, setRouteChain] = useState<ChainResult | null>(null);
    /** 🛣️ routeChain 을 얼린 순간 «몇 정거장 지나온 뒤»였나 — 주행 seq 를 절대 번호로 잇는 밑변 */
    const routeChainFromRef = useRef(0);
    useEffect(() => { if (confirmed.length === 0) { visitedCountRef.current = 0; setRouteChain(null); } }, [confirmed.length]);
    useEffect(() => { setTerminated([]); }, [stageIdx]);   // 판을 새로 열면 취소 기록도 함께 비운다
    /**
     * 🧭 **정거장 목록을 만드는 규칙 — 한 곳이다** (규칙 ③).
     * 재배치하고, **지나온 곳은 뺀다.** 올릴 때(⑫)와 취소할 때가 같은 규칙을 써야
     * 두 경로가 갈라지지 않는다. 잴 것이 없으면 `null`.
     */
    const stopsFor = (from: Pt, calls: Array<{ pickup: Pt; drop: Pt; destName: string }>) => {
        if (calls.length === 0) return null;
        const visited = departed ? prevOrderRef.current.slice(0, visitedCountRef.current) : [];
        const stops = orderStopsInsert(from, calls, visited)
            .filter(st => !visited.some(v => v.call === st.call && v.kind === st.kind));
        if (stops.length === 0) return null;
        return [{ x: from.lng, y: from.lat, label: '내 위치' },
            ...stops.map(st => ({ x: st.pt.lng, y: st.pt.lat, label: `${circled(st.call)}${st.kind}` }))];
    };
    const effPath = useMemo(() => {
        const allCalls = [
            ...presetCalls.map(c => ({ ...c, destName: dst.name })),
            ...confirmed.map(c => ({ pickup: c.pickup, drop: c.drop, destName: c.destName })),
        ];
        if (allCalls.length === 0) {
            prevOrderRef.current = [];
            return [] as Array<{ x: number; y: number; label: string; color?: string; seq?: number; call?: number }>;
        }
        // 지나간 정거장은 사실 — 그 순서 그대로 고정 (주행 전엔 자유 재배치)
        const visited = departed ? prevOrderRef.current.slice(0, visitedCountRef.current) : [];
        /**
         * 🔴 **기점을 «내 위치»로 맞춘다 — 재배치가 두 벌이면 안 된다** (2026-09-09).
         *
         * 지도 순번은 집(`NET_SRC`), 예정 시각은 내 위치에서 각각 재고 있었다. 같은 화면이
         * 두 순서를 말할 수 있는 자리다. 실측으로 확인한 것:
         * `orderStopsInsert` 는 **지나온 정거장이 있으면 기점을 무시하고** 마지막 방문지에서
         * 잇는다(`locked.length ? … : start`). 그래서 **갈리는 창은 「주행 전」뿐**이고,
         * 그때 내 위치를 옮겨 두면 두 순서가 어긋난다. 기점을 하나로 맞춰 그 창을 닫는다.
         *
         * 🔴 주행 중에는 `myPos` 를 **의존성에서 뺀다** — 매 틱 경로를 다시 그리게 된다
         * (그건 이미 한 번 겪은 사고다). 어차피 그때는 기점이 안 쓰인다.
         */
        const from = departed ? departPosRef.current : (orderStart ?? myPosRef.current);
        /**
         * 🧷 **수술 4단계 — 순번도 «확정 순간의 chain»을 따른다** (기사님 실측 2026-09-11).
         * 재배치를 다시 하면 지나갈 때마다 순서가 흔들려 선(동결 chain)과 바퀴가 갈렸다.
         * chain 이 성하면 그 순서 그대로, 못 접으면(취소 재측정 전 창 등) 옛 재배치로 물러난다.
         */
        const chainLegs = routeChain?.legs;
        const folded = chainLegs && chainLegs.length > 0 && chainLegs.every(legSound)
            ? foldChainOrder(chainLegs.map(l => l.to), allCalls, visited,
                visitedCountRef.current - routeChainFromRef.current)
            : null;
        const ordered = folded ?? orderStopsInsert(from, allCalls, visited);
        prevOrderRef.current = ordered.map(o => ({ call: o.call, kind: o.kind }));
        return [
            { x: from.lng, y: from.lat, label: '내 위치' },
            ...ordered.map((s, i) => ({
                x: s.pt.lng, y: s.pt.lat, seq: i + 1, call: s.call,
                label: `${circled(s.call)} ${s.kind} · ${nearestDong(s.pt).name}`,
                color: CALL_COLORS[(s.call - 1) % CALL_COLORS.length],
            })),
        ];
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [presetCalls, confirmed, departed, dst.name, orderStart, routeChain]);

    const anchor: NetPoint = useMemo(() => ({ name: '내 위치', ...myPos }), [myPos]);
    /**
     * 🐢 **그물용 앵커 — ~300m 격자로 스냅** (실측 2026-09-11: anchor 가 매 틱 새 객체라
     * 그물 만들기(buildLineNet, 라인이 길면 수천만 연산)가 **매 틱** 돌았다 — 주행이 무거웠던
     * 최대 뿌리). 그물은 km 단위 판정이라 300m 스냅은 화면·아웃풋에 안 보인다.
     * 라인 모드에선 anchor 자체가 안 읽혀서(`netForGoal`) 위 스텁으로 참조를 고정한다.
     */
    const gridLng = Math.round(myPos.lng * 300) / 300, gridLat = Math.round(myPos.lat * 300) / 300;
    const netAnchor: NetPoint = useMemo(() => ({ name: '내 위치', lng: gridLng, lat: gridLat }), [gridLng, gridLat]);

    /**
     * 🛣️ 실도로 곡선 (기사님 2026-09-07 «콜을 잡으면 카카오에서 진짜 길찾기») —
     * 경로가 다시 짜일 때 서버(/api/sim/route, 개발 전용)가 카카오를 불러 구간별 폴리라인을 준다.
     * 못 받으면(서버 꺼짐 등) 직선 폴백 — 실험은 계속된다. legs[i] = effPath[i]→effPath[i+1] 구간.
     */
    const [realLegs, setRealLegs] = useState<Pt[][] | null>(null);
    /** 구간별 실측 실패 여부 — 실패 구간은 지도에 점선(도로 탐색 불가를 화면이 말한다) */
    const [legFailed, setLegFailed] = useState<boolean[]>([]);
    const routeFetchSeq = useRef(0);
    /**
     * 🔴 재요청 기준은 **내용(정거장 좌표)**이지 배열 정체성이 아니다 (2026-09-08 실측:
     * 주행 시작 때 departed 가 켜지며 같은 내용의 새 배열이 만들어졌고, 그걸 «경로가
     * 바뀌었다»로 오판해 재호출 — 곡선이 지워졌다 다시 그려졌다).
     */
    const effPathKey = useMemo(() => effPath.map(pt => `${pt.x},${pt.y}`).join('|'), [effPath]);
    useEffect(() => {
        if (effPath.length < 2) { setRealLegs(null); setLegFailed([]); return; }
        // ① 캐시에 있는 구간으로 **먼저** 그린다 — 화면이 비는 순간이 없다
        const cached = effPath.slice(1).map((pt, i) => legCacheRef.current.get(legKey(effPath[i].x, effPath[i].y, pt.x, pt.y)));
        if (cached.every(c => c && !c.failed)) {   // 🔴 실패 구간은 다시 묻는다 (2026-09-08 리뷰)
            setRealLegs(cached.map(c => c!.line));
            setLegFailed(cached.map(c => c!.failed));
            return;                                   // ② 전부 있으면 카카오를 안 부른다
        }
        // ③ 모르는 구간만 묻는다 — 아는 구간은 캐시에서 (카카오 호출을 아낀다)
        const missing: Array<{ i: number; a: typeof effPath[number]; b: typeof effPath[number] }> = [];
        cached.forEach((c, i) => { if (!c) missing.push({ i, a: effPath[i], b: effPath[i + 1] }); });
        const seq = ++routeFetchSeq.current;
        // 🔴 apiBase() 가 이미 `/api` 를 포함한다 — `/api` 를 또 붙이면 404 → 직선 폴백 (2026-09-07 실측)
        Promise.all(missing.map(m =>
            callApi(`🛣️ 경로 구간 ${m.i + 1}`, '/sim/route',
                { points: [{ x: m.a.x, y: m.a.y }, { x: m.b.x, y: m.b.y }], priority: routeCombo.priority, avoid: routeCombo.avoid },
                `${m.a.label?.slice(0, 12) ?? ''} → ${m.b.label?.slice(0, 12) ?? ''}`)
                .then(d => ({ m, line: (d.legs?.[0] ?? []).map((p: { x: number; y: number }) => ({ lng: p.x, lat: p.y })) as Pt[], failed: !!d.legInfo?.[0]?.failed }))
        ))
            .then(got => {
                if (seq !== routeFetchSeq.current) return;
                for (const g of got) if (g.line.length >= 2)
                    legCacheRef.current.set(legKey(g.m.a.x, g.m.a.y, g.m.b.x, g.m.b.y), { line: g.line, failed: g.failed });
                const all = effPath.slice(1).map((pt, i) => legCacheRef.current.get(legKey(effPath[i].x, effPath[i].y, pt.x, pt.y)));
                setRealLegs(all.map(c => c?.line ?? []));
                setLegFailed(all.map(c => c?.failed ?? true));
            })
            // 🔴 폴백에 들어가면 반드시 소리를 낸다 — 조용한 폴백이 /api 이중 붙임 404 를
            //    «원래 직선인가 보다»로 몇 시간 살게 했다 (버그 대장 #101)
            .catch(err => console.warn('[실경로] 못 받아 직선 폴백:', err));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effPathKey, routeCombo.priority, routeCombo.avoid]);

    /**
     * 🖌️ **그릴 곡선 — 상태(realLegs)가 아니라 «캐시 우선»으로 꺼낸다** (기사님 2026-09-08:
     * *"확정하면 직선으로 깜빡인다"*). 확정 순간 effPath 는 새 경로인데 realLegs 는 아직
     * 옛 값/null 이라 **한 박자(0.16초) 직선**이 그려졌다 — 실측(window.__drawLog):
     * `straight:legs=null/2` 두 프레임 뒤 `curve:legs=2/2`. 캐시에 있으면 그 프레임부터 곡선이다.
     */
    const drawLegs = useMemo(() => {
        if (effPath.length < 2) return null;
        const fresh = realLegs && realLegs.length === effPath.length - 1 ? realLegs : null;
        // 구간마다: 캐시 → 방금 받은 값 → **그 구간만** 직선 (전체가 직선으로 떨어지지 않는다)
        return effPath.slice(1).map((pt, i) =>
            legCacheRef.current.get(legKey(effPath[i].x, effPath[i].y, pt.x, pt.y))?.line
            ?? fresh?.[i]
            ?? [{ lng: effPath[i].x, lat: effPath[i].y }, { lng: pt.x, lat: pt.y }]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effPathKey, realLegs, routeCombo.priority, routeCombo.avoid]);

    /** 주행이 따라갈 점 목록 — 실도로가 오면 그 곡선, 아니면 정거장 직선. seq = 향하는 정거장 순번 */
    const drivePath = useMemo(() => {
        /**
         * 🚗 **수술 2단계 — 모의 주행도 «확정 순간의 카카오 경로»를 따른다** (기사님 승인 2026-09-11).
         *
         * `seq` 는 **절대 번호를 유지한다** (얼린 시점의 방문 수 + 구간 번호) — 통과 판정
         * (`passed = seq - 1`)과 방문 순서 패널·`pickNextTarget` 이 전부 절대 번호를 읽는다.
         *
         * 🔴 **가드 — chain 의 정거장 순서가 순번(prevOrderRef)과 글자까지 같을 때만 쓴다.**
         *    통과 시각(`occurredAt`)을 prevOrderRef 로 매기므로, 두 순서가 갈리면 엉뚱한 정거장에
         *    도장이 찍힌다. 수술 4단계(foldChainOrder)로 순번이 chain 을 따르게 접은 뒤로는
         *    평소엔 **항등**이고, 순번이 접기에 실패해 옛 재배치로 물러난 판(취소 재측정 전 창 등)
         *    에서만 갈린다 — 그때 주행도 함께 옛 계보로 물러나 세 원천이 같은 쪽에 선다.
         */
        const legs = routeChain?.legs ?? null;
        const base = routeChainFromRef.current;
        const chainOk = !!legs && legs.length > 0
            && legs.every(legSound)
            && legs.every((l, i) => {
                const v = prevOrderRef.current[base + i];
                return v != null && l.to === `${circled(v.call)}${v.kind}`;
            });
        if (chainOk) {
            const out: Array<{ lng: number; lat: number; seq: number }> = [];
            legs!.forEach((l, i) => {
                for (const pt of l.line) out.push({ lng: pt.x, lat: pt.y, seq: base + i + 1 });
            });
            return out;
        }
        const out: Array<{ lng: number; lat: number; seq: number }> = [];
        if (drawLegs) {
            drawLegs.forEach((leg, i) => {
                for (const pt of leg) out.push({ lng: pt.lng, lat: pt.lat, seq: i + 1 });
                out.push({ lng: effPath[i + 1].x, lat: effPath[i + 1].y, seq: i + 1 });
            });
        } else {
            effPath.slice(1).forEach((p, i) => out.push({ lng: p.x, lat: p.y, seq: i + 1 }));
        }
        return out;
    }, [drawLegs, effPath, routeChain]);

    /**
     * 🛣️ **라인 — 잡은 콜들이 만든 실제 경로** (기사님 확정 2026-09-09).
     * 내 위치 → (재배치된 정거장들) → 마지막 하차지. 이 선 양옆 **라인 반경**이 노선의 그물이다.
     *
     * 🔴 **직선으로 지어내지 않는다** (규칙 ④). 기사님 확정 2026-09-09:
     *    *"경로가 올 때까지는 마름모를 내 위치 기점 그대로 두고, 경로가 도착하면 그때 라인으로 바꾼다."*
     *    그래서 카카오에서 못 받은 구간이 **하나라도 있으면 라인이 없다**(`null`).
     *    직선을 라인으로 쓰면 산·강을 가로지르는 엉뚱한 동네가 그물에 들어온다.
     *
     * ⚠️ `drawLegs`(그리는 곡선)와 다르다 — 그쪽은 못 받은 구간을 **직선으로 그려서라도** 보여 준다.
     *    보여 주는 것과 거르는 것은 다른 일이다.
     */
    const routeLine = useMemo<Array<[number, number]> | null>(() => {
        /**
         * 🕸️ **수술 3단계 — 라인 그물도 «확정 순간의 카카오 경로» 한 벌에서** (기사님 승인 2026-09-11).
         *
         * chain 은 «잰 순간의 내 위치 → 남은 정거장들»이라, 라인이 **남은 길**만 덮는다 —
         * 그게 기사님 설계의 «지나온 건 빼고»의 그물 버전이다. 달리는 동안 라인 시작이
         * 뒤에 남는 몫은 기존 `progressKm` 트림(내 진행도보다 뒤 = 지나온 동)이 그대로 자른다.
         * 🔴 chain 이 없거나(프리셋 판 · 확정 전) 못 잰 구간이 있으면 **옛 계보로 물러난다**.
         */
        const cLegs = routeChain?.legs ?? null;
        if (cLegs && cLegs.length > 0 && cLegs.every(legSound)) {
            const out: Array<[number, number]> = [];
            for (const l of cLegs) for (const p of l.line) out.push([p.x, p.y]);
            if (out.length >= 2) return out;
        }
        if (effPath.length < 2) return null;
        const legs = effPath.slice(1).map((pt, i) => legCacheRef.current.get(legKey(effPath[i].x, effPath[i].y, pt.x, pt.y)));
        if (!legs.every(c => c && !c.failed && c.line.length >= 2)) return null;
        /**
         * 🔴 **라인은 통째로 둔다 — 지나온 자리는 «숫자»로 뺀다** (기사님 2026-09-09:
         * *"매 순간 다시 계산하면 동 1,968개를 계속 훑는 거 아닌가? **한 번 계산된 거 다시 쓰면
         * 될 듯**"*).
         *
         * 라인을 자르면 그물을 **매번 새로 만들어야** 한다 — 동 1,968개를 라인과 재는 일이라
         * 실측 13~42ms 다. 대신 **동마다 «라인 몇 km 지점인가»를 한 번 재 두고**(`progressKm`),
         * 이동하면 «내 진행도보다 앞인가»를 **숫자로 비교**해 거른다.
         * 실물 서버도 같은 이유로 같은 값을 들고 있다 (실측 173ms → 0.14ms).
         */
        const out: Array<[number, number]> = [];
        for (const c of legs) for (const p of c!.line) out.push([p.lng, p.lat]);
        return out.length >= 2 ? out : null;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effPathKey, realLegs, routeChain]);
    /**
     * 📏 **내가 라인의 몇 km 지점에 있나** — 매 틱 다시 재도 싸다(라인 점 수백 개).
     * 이 숫자 하나로 «지나온 동»이 걸러진다.
     */
    const myProgressKm = useMemo(
        () => routeLine && departed ? progressAlongKm(myPos, routeLine) : 0,
        [routeLine, myPos, departed]);
    /** 🛣️ 노선이면서 라인이 실제로 있는가 — 화면·판정·아웃풋이 **이 하나**를 읽는다 (규칙 ③) */
    const lineOn = routeMode && !!routeLine;
    /**
     * 🏁 **마름모가 시작하는 자리 — 마지막 하차지** (기사님 확정 2026-09-09).
     * 라인이 여기서 끝나므로, 아직 안 정한 구간은 «여기 → 목적지»다.
     * 라인이 없으면 `null` — 그때 마름모는 내 위치에서 시작한다(동선과 같다).
     */
    const lastDropRef = useRef<NetPoint | null>(null);
    const lastDrop = useMemo<NetPoint | null>(() => {
        if (!lineOn || effPath.length < 2) return (lastDropRef.current = null);
        const last = effPath[effPath.length - 1];
        /**
         * 🐢 **같은 자리면 같은 객체를 돌려준다** (실측 2026-09-11). 통과 도장마다 effPath 가
         * 재계산되는데 마지막 하차지는 그대로다 — 매번 새 객체를 주면 goalNets(그물 만들기,
         * 라인이 대전~김포면 수천만 연산)가 통과 때마다 통째로 다시 돌았다.
         */
        const prev = lastDropRef.current;
        if (prev && prev.lng === last.x && prev.lat === last.y) return prev;
        return (lastDropRef.current = { name: last.label ?? '마지막 하차지', lng: last.x, lat: last.y });
    }, [lineOn, effPath]);

    /**
     * 🎯 **목적지마다 그물 하나 — 라인은 하나, 마름모는 목적지마다** (기사님 지적 2026-09-09).
     *
     * 🔴 예전엔 라인을 **노선 목적지에만** 걸었다(`g.name === dst.name`). 그래서 **복귀콜을 잡아
     *    목적지가 «집»으로 접히는 순간 라인이 통째로 빠지고** 「내 위치 → 집」 마름모만 남았다 —
     *    기사님이 화면에서 잡으셨다: *"복귀콜로 집에 가는 중인데 이 모습은 첫짐의 동선과 같다.
     *    노선의 동선이 되어야 할 것 같은데."*
     *
     * 🔴 **라인은 목적지에서 나오지 않는다 — 잡은 콜들에서 나온다.** 목적지가 파주든 집이든
     *    달릴 길은 하나뿐이다. 목적지마다 갈리는 것은 **마름모**(마지막 하차지 → 그 목적지)뿐이다.
     */
    /** 그물에 실제로 들어가는 앵커 — 라인 모드면 고정 스텁(안 읽힘), 동선이면 300m 격자 */
    const anchorForNet = lineOn && routeLine ? LINE_ANCHOR_UNUSED : netAnchor;
    const goalNets = useMemo(() => goals.map(g => ({
        goal: g,
        /**
         * 🔴 **«라인 그물로 만들었나»를 계산이 함께 내놓는다** (기사님 지적 2026-09-09).
         *    그리기가 제 조건으로 다시 판단하다가 **계산과 갈라졌다** — 복귀로 목적지가
         *    집이 되자 계산은 라인 그물인데 그리기만 마름모인 척해서, **내 위치 원이 사라지고
         *    목적지 원이 교집합만 그려졌다.** 한 값에서 나오면 갈라질 수 없다 (규칙 ③).
         */
        usedLine: lineOn && !!routeLine,
        net: netForGoal(g, { line: lineOn ? routeLine : null, lineRadiusKm, lastDrop, params, anchor: anchorForNet }),
    })), [goals, lineOn, routeLine, lineRadiusKm, lastDrop, params, anchorForNet]);
    const net = goalNets[0].net;                     // 대표 하나가 필요한 자리 (자동 맞춤 등)
    /** 🔴 판정에 쓰는 영역도 **목적지마다** 만든다 — 라인은 같고 마름모만 갈린다 (위 주석과 한 짝) */
    const zoneOfGoal = useMemo(
        () => (g: NetPoint) => lineOn && routeLine ? lineZoneOf(routeLine, lineRadiusKm, lastDrop, params, g) : undefined,
        [lineOn, routeLine, lineRadiusKm, lastDrop, params]);
    /**
     * 화면·아웃풋이 읽는 영역 = **살아 있는 마름모들의 합집합** (⑮ 기준 3).
     * 합치는 규칙(겹침·지나온 곳·통째 제외)은 `mergeGoalNets` 한 곳에 있다 — 검사가 거기서 잠근다.
     */
    /**
     * 🐢 **지나온 동 «수» — 그물을 다시 합칠지 정하는 숫자 하나** (실측 2026-09-11).
     * `myProgressKm` 은 틱(120ms)마다 바뀌어서, 그대로 의존성에 두면 그물 합치기와
     * 그 아래 파생 전부(아웃풋·지역 목록 JSX)가 **매 틱** 다시 돌았다 — 주행이 무거웠던 뿌리.
     * 숫자 비교(O(동))만 매 틱 하고, 실제로 동이 빠질 때만 합치기를 다시 한다. 화면 결과는 같다.
     */
    const cutCount = useMemo(() => {
        if (!departed) return 0;
        let n = 0;
        for (const g of goalNets) for (const pt of g.net.pass)
            if (pt.progressKm != null && pt.progressKm < myProgressKm) n++;
        return n;
    }, [goalNets, departed, myProgressKm]);
    const areaNet = useMemo(
        () => mergeGoalNets(goalNets.map(g => g.net), { departed, myProgressKm, excluded }),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- myProgressKm 대신 cutCount: 동이 실제로 빠질 때만 (위 주석)
        [goalNets, departed, cutCount, excluded]);
    /**
     * 📦 **앱에 내려갈 필터 아웃풋** (기사님 2026-09-07: *"DB 도 서버통신도 없이, 필터 로직을
     * 잘 만들어 앱에 전달할 아웃풋만 만든다"*) — 실험실 상태에서 곧장 파생하는 순수 계산.
     * 🔴 필드 이름은 실물 규격(shared `AutoDispatchFilter`) 그대로 쓴다 — 이식 때
     * «실험실 아웃풋 ↔ 서버 아웃풋» 대조만으로 끝나게. 제외지역은 여기서 이미 빠져 있다.
     */
    const appFilterOutput = useMemo(() => buildAppFilterOutput({
        callTarget, dispatchPhase: dispatchPhaseSim, driving,
        /**
         * 🔴 **제외지역은 노선·동선 공통이다** (기사님 확정 2026-09-09).
         *    예전엔 `routeMode ? [] : excluded` 였다 — 노선이면 «길이 곧 선별»이라 안 썼다(09-08).
         *    그런데 화면 판정(`isExcluded`)은 이미 공통으로 고쳤는데 **아웃풋만 안 고쳐서**,
         *    노선일 때 «화면에서는 빠진 동이 앱에 내려갈 목록에는 그대로» 있었다.
         */
        dstName: dst.name, groups: areaNet.groups, pass: areaNet.pass, excluded,
        pickupRadiusKm: knobs.pickupRadiusKm, dropoffRadiusKm: knobs.dropoffRadiusKm,
        lineRadiusKm, discountPct: knobs.discountPct,
        vehicles, excludedWords, slotsUsed, capacityConfirmed,
        // 🔴 «무엇으로 재는가»만 적는다 — 관내 여부는 콜마다 갈리므로(목적지별) 여기서 말하지 않는다
        modeDesc: `🎯 ${goals.map(g => g.name).join(' ∪ ')} · ` + (lineOn ? `노선 — 잡은 콜 경로 ±${lineRadiusKm}km` : routeMode ? '노선 (경로 대기 — 마름모로 판단)' : `동선 마름모 ${params.srcAngleDeg}°/${params.dstAngleDeg}°`),
    }), [callTarget, dispatchPhaseSim, driving, dst, areaNet, excluded, knobs, vehicles, excludedWords, slotsUsed, capacityConfirmed, lineOn, routeMode, lineRadiusKm, params, goals]);
    /**
     * 🔴 **«짐을 실은 목적지» — 원천 하나** (2026-09-08 리뷰: 화면과 판정이 다른 답을 냈다).
     * ∩(상차 조이기)를 거는 기준이다. 판정(judgeGoals)·그리기·판정 칩이 **모두 이걸** 읽는다 —
     * 그리기가 옛 전역 routeStarted 를 읽으면 «지도에 안 그린 자리의 콜이 통과»한다.
     */
    const loadedGoalNames = useMemo(() => [...new Set(confirmed.map(c => c.destName))], [confirmed]);
    const isLoaded = (goalName: string) => loadedGoalNames.includes(goalName);
    /** 🎯 목적지별 판정 — 하나라도 통과하면 통과, 둘 다면 복귀 우선 (⑮ 기준 3) */
    /** 🔴 판정의 기준점도 그물과 **같은 값**(netAnchor)이다 — 스냅 앵커와 정밀 앵커가 갈리면
     *  경계 ±200m 에서 «그물은 든다는데 판정은 탈락»이 생긴다 (리뷰 2026-09-11 · 규칙 ③) */
    const goalsVerdict = useMemo(() => pickup && drop
        ? judgeGoals(params, netAnchor, goals, myPos, pickup, drop, {
            loadedNames: loadedGoalNames,     // ∩ 는 «짐을 실은 목적지»에만 (⑮ 기준 5)
            isLocal: g => g.name === dst.name && localMode,
            zoneOf: zoneOfGoal,
            preferName: HOME_DST.name,
        })
        : null, [pickup, drop, params, netAnchor, goals, myPos, loadedGoalNames, localMode, zoneOfGoal, dst.name, HOME_DST.name]);
    const verdict: TwoStageVerdict | null = goalsVerdict?.won ?? goalsVerdict?.results[0]?.verdict ?? null;

    /**
     * 🧮 **합짐 우회 — 실물 계산을 그대로 쓴다** (기사님 확정 2026-09-08:
     * *"합짐 판단은 기존 경로와 지금 경로가 얼마나 차이가 있는가를 아는 것"*).
     *
     * 🔴 직선 근사를 **버렸다.** 서버 `/api/sim/detour` → 실물 `calculateDetourRoute` 가
     * base(기존 전부)와 merged(합짐 낀 경로)를 각각 카카오로 재서 차이를 준다 —
     * 목업이 실물과 다른 답을 내면 실험이 거짓말이 된다 (규칙 ③: 원천 하나).
     * 콜을 **올릴 때 한 번만** 부른다 (심사 = 집은 뒤의 일).
     */
    /**
     * 🧭 **전체 경로 실측 — 구간별로 그대로** (기사님 확정 2026-09-08).
     * 카카오가 구간마다 nkm/n분을 나눠 주므로 **합치지 않는다.** 우회는 같은 구간의
     * «전(기존 경로) vs 후(합짐 낀 경로)» 차이로 여기서 낸다:
     *   우회상차 = (합짐 낀 경로의 내위치→첫콜상차) − (기존 경로의 내위치→첫콜상차)
     *   우회하차 = 하차 구간들의 합 차이
     */
    /**
     * `measuredAt` — 🔴 **이 경로를 «언제» 쟀나** (실물 `orders.routeComputedAt` 자리).
     * 구간 분은 **잰 그 순간의 내 위치**에서 나온 값이라, 예정 시각을 낼 때 «지금»에 더하면
     * 달릴수록 예정이 함께 뒤로 밀린다 — 실측(2026-09-09): 예정 04:42 라 해 놓고 실제로는
     * 03:53 에 닿았다. 30분 달리면 예정도 30분 밀려 있었던 것이다.
     */
    type ChainResult = { legs: ChainLeg[]; totalKm: number | null; totalMin: number | null; partial?: boolean; note?: string; measuredAt?: number; fromVisited?: number };
    const [chainNow, setChainNow] = useState<ChainResult | null>(null);
    const [chainBefore, setChainBefore] = useState<ChainResult | null>(null);
    /**
     * 🗄️ **⑦ 저장 — 콜을 확정한 순간의 전체 경로.** 다음 합짐의 «기존 경로»가 바로 이것이다.
     * 다시 재지 않으므로 카카오 호출이 한 번 줄고, 실패해서 «?» 가 되는 일도 없다.
     */
    const lastChainRef = useRef<ChainResult | null>(null);
    /** ✅ 콜 확정 — 리스트에 넣고, 그 콜의 배송 거리·시간·톨비를 실측해 카드에 붙인다 (기사님 2026-09-08).
     *  ⚠️ 옵션은 카카오 «추천» 하나다 (서버 calculateSoloRoute 기본값) — 길 찾기의 5옵션과 다르다. 카드에 표기함 */
    /**
     * ☎️ **«통화로 정한 약속»을 켜고 끈다** (기사님 2026-09-10).
     * 🔴 값은 **콜이 들고 있다** — 화면이 따로 목록을 두면 두 벌이 되어 갈린다 (규칙 ③).
     */
    const toggleCalled = (disp: string, kind: '상차' | '하차') => {
        setConfirmed(list => list.map((c, i) => {
            if (circled(baseCallCount + i + 1) !== disp) return c;
            const key = kind === '상차' ? 'pickup' : 'dropoff';
            const step = c.steps[key];
            return { ...c, steps: { ...c.steps, [key]: { ...step, promiseBy: step.promiseBy === '통화' ? '추정' : '통화' } } };
        }));
    };

    /** 좌표는 지도 표와 같은 **소수 5자리**로 굳힌다 — 더 적으면 다른 동이 된다 */
    const at5 = (p: Pt) => ({ lng: +p.lng.toFixed(5), lat: +p.lat.toFixed(5) });

    const confirmCall = (p: Pt, d: Pt) => {
        const id = ++callSeqRef.current;
        const caughtDest = goalsVerdict?.wonGoal?.name ?? dst.name;   // 통과한 목적지가 곧 판 (⑮ 기준 3)
        const merge = confirmed.length > 0;                            // 합짐인가 — 첫짐과 저장 경로가 다르다
        const known = uploadedInfoRef.current;   // 🗄️ 첫짐: ⑤⑥ 전체 경로에서 이미 꺼낸 값
        const app = approachInfo;                // 🗄️ 첫짐: 전체 경로의 첫 구간(내 위치→상차)
        planSeqRef.current++;                    // 판이 바뀌었다 — 늦게 오는 취소 적립을 무효로 만든다
        const prevChain = lastChainRef.current;   // 🔴 덮기 전에 붙잡는다 — 적립의 «전» 쪽이다
        lastChainRef.current = chainNow;         // 🗄️ ⑦ 이 전체 경로가 다음 합짐의 «기존 경로»가 된다
        // 🛣️ 그리기·주행·순번이 읽는 «남은 길»도 같은 값이다 (한 벌).
        // 🔴 못 잰 판(빈 legs)이면 동결을 안 덮는다 — 이전 성한 경로가 남고, 순번은 집합
        //    불일치로 재배치에 물러난다 (리뷰 2026-09-11: 독이 든 동결이 다음 판까지 살았다)
        if (chainNow?.measuredAt != null && chainNow.legs.length > 0) {
            setRouteChain(chainNow);
            routeChainFromRef.current = chainNow.fromVisited ?? visitedCountRef.current;
        }
        // ⏰ 최초 약속 — 확정한 이 순간 전체 경로가 말한 도착 시각. 이후 어떤 합짐이 와도 안 바뀐다
        const t0 = clockNow, noNew = circled(confirmed.length + 1);   // 🕒 모의 시계
        /** 병합 경로의 그 정거장까지 누적 분 — 🔴 약속에는 안 쓴다 (`promiseTimes` 참조) */
        const mergedCum = cumMinutes(chainNow?.legs, labDwellOf);
        const chainCum = { pickupMin: mergedCum.get(`${noNew}상차`) ?? null, dropoffMin: mergedCum.get(`${noNew}하차`) ?? null };
        const mkStep = (promisedAt: number | null): StopStep => ({ promisedAt, predictedAt: null, occurredAt: null, source: null, impacts: [] });
        /**
         * ⏰ 약속은 **직행 기준**이다. 첫짐은 ⑤⑥ 전체 경로가 곧 직행이라 지금 바로 서고,
         * 합짐은 ⑮ 가 와야 선다 — 그때까지 **비워 둔다** (병합 값으로 대신 채우지 않는다).
         */
        // 🧳 **약속에 들어가는 정차도 그 콜의 짐으로** — 15분(짐 모를 때 값)을 박아 두면 하차 약속이 늘 늦다
        const p0 = promiseTimes({ confirmedAt: t0, chainCum, pickupDwellMin: labDwellOfBoxes(candBoxes, '상차'),
            direct: merge ? { approachMin: null, durMin: null }
                : { approachMin: app?.durMin ?? null, durMin: known?.durMin ?? null } });
        const steps = { pickup: mkStep(p0.pickupAt), dropoff: mkStep(p0.dropoffAt) };
        /**
         * 🧾 **이 확정이 기존 정거장을 몇 분 밀었나 — 그 자리에 적립한다** (3단계 · 기사님 2026-09-09).
         *
         * «확정 전 경로»와 «확정 후 경로»의 그 정거장까지 누적 차이 — ⑯ 의 우회 정의 그대로다.
         * 지금까지는 이 값을 심사 문단에 **띄우고 버렸다.** 버리지 않고 쌓으면 나중에
         * *"31분이 왜 밀렸나"* 에 한 줄씩 답할 수 있다.
         */
        const orderNow = (chainNow?.legs ?? []).map(l => l.to);
        /** 이미 있던 정거장들 — 새 콜이 «이것들을 경유하느라» 밀리는 원인이 된다 */
        const priorStops = confirmed.flatMap((x, i) => {
            const n = circled(baseCallCount + i + 1);
            return [{ label: `${n}상차`, name: `${nearestDong(x.pickup).name} 상차` },
                    { label: `${n}하차`, name: `${nearestDong(x.drop).name} 하차` }];
        });
        /** 이번에 끼워 넣은 두 정거장 — 밀린 정거장보다 «앞에» 온 것만 원인으로 적는다 */
        const inserted = [
            { label: `${noNew}상차`, name: `${nearestDong(p).name} 상차` },
            { label: `${noNew}하차`, name: `${nearestDong(d).name} 하차` },
        ];
        /**
         * 🔴 **누적 «분»을 그대로 빼지 않는다 — 각자의 «0분»이 다른 자리다** (2026-09-09 리뷰).
         * 두 경로는 잰 시각이 다르므로, 각자의 `measuredAt` 을 더해 **도착 «시각»**으로 만든 뒤 뺀다.
         */
        const impactOf = (label: string) => impactOfStop({
            stopLabel: label,
            beforeAt: arrivalAt(prevChain, label, labDwellOf), afterAt: arrivalAt(chainNow, label, labDwellOf),
            orderNow, inserted, causeCallId: id, at: t0,
        });
        setConfirmed(c => [...c.map((x, i) => {
            const no = circled(baseCallCount + i + 1);
            const up = impactOf(`${no}상차`), dn = impactOf(`${no}하차`);
            if (!up && !dn) return x;
            return { ...x, steps: {
                pickup: up ? { ...x.steps.pickup, impacts: [...x.steps.pickup.impacts, up] } : x.steps.pickup,
                dropoff: dn ? { ...x.steps.dropoff, impacts: [...x.steps.dropoff.impacts, dn] } : x.steps.dropoff,
            } };
        }), { id, pickup: p, drop: d, boxes: candBoxes, optionUsed: routeCombo.label, destName: caughtDest,
            steps,
            ...(app && !merge ? { approachKm: app.distKm, approachMin: app.durMin } : {}),
            ...(merge || !known ? {} : {                     // 🔴 `failed` 는 콜의 칸이 아니다 — 골라 담는다
                distKm: known.failed ? null : known.distKm,
                durMin: known.failed ? null : known.durMin,
                tollWon: known.tollWon, routeComputedAt: Date.now(),
            }) }]);
        if (!merge && known) return;             // 첫짐은 ⑦ 이 이미 끝났다 — 더 안 묻는다
        /**
         * 🔴 **⑮⑯ 합짐 고유 배송 — 확정한 «뒤»에 한 번** (기사님 순서 개정 2026-09-08:
         * *"14-2 기사가 콜 확정을 클릭 · 15. 합짐의 고유의 배송시간을 알기 위해
         * (내위치 - 합짐상차지좌표 - 합짐하차지좌표)로 카카오 api 를 호출해"*).
         *
         * 심사(⑭-1)는 전체 경로만으로 끝난다 — **안 잡을 콜에 카카오를 쓰지 않는다.**
         * 여기서 받은 두 구간이 곧 ⑯ 의 «상차 시간·배송 시간»이다.
         */
        const from = { ...myPos };
        callApi(merge ? '✅ ⑮ 합짐 고유(내 위치→상차→하차)' : '✅ 콜 확정 실측', '/sim/route',
            { points: [{ x: from.lng, y: from.lat }, { x: p.lng, y: p.lat }, { x: d.lng, y: d.lat }], priority: routeCombo.priority, avoid: routeCombo.avoid },
            `내 위치 ${from.lng.toFixed(4)},${from.lat.toFixed(4)} → 상차 ${p.lng.toFixed(4)},${p.lat.toFixed(4)} → 하차 ${d.lng.toFixed(4)},${d.lat.toFixed(4)}`, uploadTag ?? undefined)
            .then(res => {
                const [ai, di] = res.legInfo ?? [];
                const pickMin = ai && !ai.failed ? ai.durMin : null;
                const dropMin = di && !di.failed ? di.durMin : null;
                setConfirmed(c => c.map(x => x.id === id ? {
                    ...x,
                    routeComputedAt: Date.now(),
                    ...(ai ? { approachKm: ai.failed ? null : ai.distKm, approachMin: ai.failed ? null : ai.durMin } : {}),
                    ...(di ? { distKm: di.failed ? null : di.distKm, durMin: di.failed ? null : di.durMin, tollWon: di.tollWon } : {}),
                    /**
                     * ⏰ **약속이 아직 비어 있으면 여기서 세운다** (기사님 2026-09-09:
                     * *"각각 따로 받고 있어 — 상차지까지 시간과 하차지까지 시간. 이 둘을
                     * 킵할 때 저장해 두는 거 아냐?"*).
                     * 전체 경로 호출이 통째로 실패해도 이 두 구간은 따로 잰 값이라 살아 있다 —
                     * 그러면 약속도 서야 한다. 이미 선 약속은 **덮지 않는다**(못 박은 것이다).
                     */
                    steps: (() => {
                        // ⏰ ⑮ 가 왔다 — 직행 기준으로 약속을 세운다 (이미 선 약속은 못 박은 것이라 안 덮는다)
                        const pr = promiseTimes({ confirmedAt: t0, chainCum, pickupDwellMin: labDwellOfBoxes(x.boxes, '상차'),
                            direct: { approachMin: pickMin, durMin: dropMin } });
                        /**
                         * 🧾 **이 콜 자신도 «기존 콜 경유»만큼 밀린 채로 태어난다** (2026-09-09 실측에서 잡힘).
                         *
                         * 약속은 직행(⑮) 기준인데 실제로는 이미 잡아 둔 콜들을 들렀다 간다. 그 차이가
                         * 확정 순간부터 지연으로 잡히는데, `impacts` 는 **나중에 확정된 것**만 쌓으므로
                         * 아무도 안 적어 **「나머지(경로 이탈·교통)」로 흘러갔다.** 원인이 있는 값이다.
                         *   경유분 = (병합 경로 누적) − (직행 누적)
                         * 첫짐은 둘이 같아 0 이라 안 적힌다.
                         */
                        const via = (label: string, direct: number | null) => {
                            // 직행은 «확정 시각» 기준, 병합은 «그 경로를 잰 시각» 기준 — 시각으로 맞춰 뺀다
                            const merged = label.endsWith('상차') ? chainCum.pickupMin : chainCum.dropoffMin;
                            return impactOfStop({
                                stopLabel: label,
                                beforeAt: direct == null ? null : t0 + direct * 60000,
                                afterAt: merged == null || chainNow?.measuredAt == null ? null : chainNow.measuredAt + merged * 60000,
                                orderNow, inserted: priorStops, causeCallId: id, at: t0,
                            });
                        };
                        const vPick = via(`${noNew}상차`, pickMin);
                        const vDrop = via(`${noNew}하차`, pickMin != null && dropMin != null ? pickMin + dropMin : null);
                        /**
                         * ✂️ **하차 밀림은 둘로 갈라 적는다** (기사님 지시 2026-09-09).
                         * «출발이 밀린 몫»과 «이 구간이 꺾인 몫»은 기사님께 다른 뜻이다 —
                         * 한 줄로 적으면 82분이 어느 쪽인지 알 수 없다. 셈은 `splitDropImpact` 가 한다.
                         */
                        return {
                            pickup: { ...x.steps.pickup, promisedAt: x.steps.pickup.promisedAt ?? pr.pickupAt,
                                impacts: vPick ? [...x.steps.pickup.impacts, { ...vPick, causeLabel: `${vPick.causeLabel} 경유` }] : x.steps.pickup.impacts },
                            dropoff: { ...x.steps.dropoff, promisedAt: x.steps.dropoff.promisedAt ?? pr.dropoffAt,
                                impacts: [...x.steps.dropoff.impacts, ...splitDropImpact(vPick, vDrop)] },
                        };
                    })(),
                } : x));
            })
            .catch(err => {
                // 🔴 직선 km 를 지어내지 않는다 — 「재 봤는데 못 쟀다」로 남긴다 (규칙 ④)
                console.warn('[⑮ 고유 배송] 못 받았다 — 값 없이 남긴다:', err);
                setConfirmed(c => c.map(x => x.id === id
                    ? { ...x, distKm: null, durMin: null, tollWon: null, routeComputedAt: Date.now() } : x));
            });
    };

    const [problemOn, setProblemOn] = useState<LabProblem | null>(null);
    /**
     * 📋 **기사님이 찍은 판을 그대로 문제로 뽑는다** (기사님 2026-09-10: *"내가 찍으면
     * **그때 걸 기억하고 넣으라고**"*). 좌표가 아니라 **동 이름**으로 읽히게 «어디였나»를 함께 적는다.
     */
    const [captured, setCaptured] = useState<string | null>(null);

    /**
     * 🧪 **문제 버튼은 «판만 세운다» — 콜은 기사님이 누른다** (기사님 확정 2026-09-10:
     * *"왜 자동이야. **클릭은 내가 할게. 자동 빼.**"*).
     *
     * 🔴 전에는 버튼 하나가 콜을 다 잡고 주행까지 했다. 그러면 **내가 돌린 것**이지
     *    기사님이 보시는 것이 아니다 — 중간에 멈춰 보거나 다르게 눌러 볼 수가 없다.
     *    이제 이 함수는 **판을 비우고 목적지·시작 자리만** 놓는다.
     *    콜은 오른쪽 「🧪 콜 문제」 목록에서 **한 줄씩 눌러** 만든다 (주행도 그 줄이 함께 한다).
     */
    const runProblem = (pr: LabProblem) => {
        setProblemOn(pr);
        setConfirmed([]); setTerminated([]); setPickup(null); setDrop(null);
        setDriving(false); setPausedForCall(false); setUploaded(false); setHomeOn(false);
        setMyPos(pr.start ?? LAB_START);                    // 📍 문제가 시작 자리를 주면 거기서 (안 주면 표의 첫 자리)
        setDstSido(pr.dst.sido); setDstSgg(pr.dst.sgg);
    };

    /**
     * 🧹 **콜 취소 — 지우지 않고 옮긴다** (5단계 · 기사님 2026-09-09 *"2번째 콜이 취소될 때"*).
     *
     * 빠지면 남은 정거장이 **앞당겨진다.** 그 분을 «음수»로 적립해야 사이클이 이어진다 —
     * 확정 때와 같은 셈(`impactOfStop`)이고, 원인은 «빠진 콜의 정거장»이다.
     * 경로도 다시 재야 한다. 콜이 빠졌는데 옛 경로로 계속 가면 화면이 거짓말한다.
     */
    const cancelLastCall = () => {
        const last = confirmed[confirmed.length - 1];
        if (!last) return;
        const at = clockNow, rest = confirmed.slice(0, -1);
        const goneNo = circled(baseCallCount + confirmed.length);
        const gone = [{ label: `${goneNo}상차`, name: `${nearestDong(last.pickup).name} 상차` },
                      { label: `${goneNo}하차`, name: `${nearestDong(last.drop).name} 하차` }];
        // 🔴 **잘라내지 않는다** — 약속·통과·적립까지 그대로 남겨야 «그 콜이 어떻게 됐나»를 답한다
        setTerminated(t => [{ ...last, terminatedAt: at, no: goneNo }, ...t]);
        const seq = ++planSeqRef.current;
        const prevChain = lastChainRef.current;
        const stops = stopsFor(myPos, rest.map(c => ({ pickup: c.pickup, drop: c.drop, destName: c.destName })));
        if (!stops) {   // 남은 정거장이 없다 — 잴 것도 적립할 것도 없다
            setConfirmed(rest); setChainNow(null); setChainBefore(null); setChainPreview(null);
            lastChainRef.current = null; setRouteChain(null);
            return;
        }
        setConfirmed(rest);
        const fromVisited = visitedCountRef.current;   // 🧷 잰 순간의 방문 수 — 응답이 오는 사이 주행이 지나갈 수 있다
        callApi('🧹 취소 후 경로 다시 재기', '/sim/chain',
            { stops, priority: routeCombo.priority, avoid: routeCombo.avoid },
            `정거장 ${stops.length}: ${stops.map(x => x.label).join(' → ')}`)
            .then(d => {
                if (seq !== planSeqRef.current) return;   // 그 사이 판이 또 바뀌었다 — 이 적립은 어긋난다
                const after = { ...d, measuredAt: clockBaseRef.current + simMinRef.current * 60000, fromVisited };
                setChainNow(after); setChainBefore(prevChain); lastChainRef.current = after;
                setRouteChain(after); routeChainFromRef.current = fromVisited;
                const orderBefore = (prevChain?.legs ?? []).map(l => l.to);
                setConfirmed(cs => cs.map((x, k) => {
                    const no = circled(baseCallCount + k + 1);
                    /** 🔴 «앞에 있었나»는 **빠지기 전** 순서로 본다 — 지금 순서엔 그 콜이 없다 */
                    const of = (label: string) => impactOfStop({ stopLabel: label,
                        beforeAt: arrivalAt(prevChain, label, labDwellOf), afterAt: arrivalAt(after, label, labDwellOf),
                        orderNow: orderBefore, inserted: gone, causeCallId: last.id, at });
                    const up = of(`${no}상차`), dn = of(`${no}하차`);
                    if (!up && !dn) return x;
                    return { ...x, steps: {
                        pickup: up ? { ...x.steps.pickup, impacts: [...x.steps.pickup.impacts, { ...up, causeLabel: `${up.causeLabel} 취소` }] } : x.steps.pickup,
                        dropoff: dn ? { ...x.steps.dropoff, impacts: [...x.steps.dropoff.impacts, { ...dn, causeLabel: `${dn.causeLabel} 취소` }] } : x.steps.dropoff,
                    } };
                }));
            })
            .catch(err => console.warn('[취소 후 경로] 못 받았다 — 적립 못 함:', err));
    };

    /** 🔴 올리기 경합 가드 — 늦게 온 옛 콜 응답이 새 콜 값을 덮어쓰면 안 된다 (2026-09-08 리뷰) */
    const uploadSeqRef = useRef(0);
    /**
     * 🔴 콜을 처리하면 시험 콜 상태만 지운다 — **`chainNow` 는 남긴다.**
     * 확정된 콜의 정거장 시각(콜 리스트의 «이동시간 · 지연 · 도착»)을 그 값이 물고 있다.
     * (다음 콜을 올리면 어차피 새 값이 덮는다)
     */
    const resumeAfterCall = () => { setCallSeenAt(null); setUploaded(false); setUploadedLeg(null); setApproachLeg(null); setApproachInfo(null); setChainBefore(null); setChainPreview(null); uploadedInfoRef.current = null; uploadSeqRef.current++; if (pausedForCall) { setPausedForCall(false); setDriving(true); } };
    const uploadCall = () => {
        if (!pickup || !drop) return;
        const seq = ++uploadSeqRef.current;
        const fresh = () => seq === uploadSeqRef.current;
        const callTag = `콜#${seq}`;          // 🔎 이 콜을 올리며 부른 것들 — 심사 영역이 이걸로 고른다
        setUploadTag(callTag);
        setUploaded(true); setCallSeenAt(Date.now()); setNowTick(Date.now()); setUploadedLeg(null); setApproachLeg(null); setApproachInfo(null); uploadedInfoRef.current = null;
        // 🔴 **«상차지까지» 구간(현위치→상차지)을 함께 받는다** (기사님 2026-09-08: *"상차지 약속을
        //    잡을 수 없다 — 얼마나 시간과 거리가 되는지 모르니까"*). 상차 약속의 재료다.
        const me = { ...myPos };
        /**
         * 🔴 **⑮ 는 여기서 안 부른다 — «콜 확정» 뒤다** (기사님 순서 개정 2026-09-08:
         * *"14-1 이 정보들로 심사 진행 · 14-2 기사가 콜 확정을 클릭 · 15. 합짐의 고유의
         * 배송시간을 알기 위해 …"*).
         *
         * 심사(⑭-1)에 쓰는 값은 **전체 경로가 다 준다.** 고유 배송은 «잡은 콜의 장부»에 적을 값이라
         * 확정한 뒤에 한 번 부르면 된다 — 안 잡을 콜에 카카오를 쓰지 않는다. `confirmCall` 참조.
         */

        /**
         * 🧭 **기사님 순서 ②~⑥ · ⑫~⑯** (2026-09-08):
         *   ④⑫ 우리 시스템이 «최적경로»로 재배치 → ⑤⑬ 그 순서로 카카오 1회
         *   → ⑥⑭ **구간별** nkm/n분을 그대로 받는다 (합치지 않는다)
         *   기존 경로도 같은 방식으로 재서, 우회는 **같은 구간의 차이**로 낸다
         */
        setChainNow(null); setChainBefore(null); setChainPreview(null);
        /**
         * ④⑫ 재배치 — 🔴 **기점은 «지금 내 위치»다** (기사님 2026-09-08: *"왜 출발부터 재는 거야?
         * 내 위치에서 상차까지면 훨씬 가까워진 것일 텐데"*).
         *
         * 집(NET_SRC)에서 재면 **이미 지나온 거리가 통째로 들어간다** — 실측에서 159km 가 나왔다.
         * 판단은 «지금 여기서 이 콜을 붙이면»이므로 기점도 지금 자리여야 한다.
         * 지나온 정거장은 빼고 **남은 것만** 재배치한다 (그래야 «가는 길에 하나 더»가 나온다).
         */
        const chainOf = (calls: Array<{ pickup: Pt; drop: Pt; destName: string }>) => stopsFor(me, calls);
        const baseCalls = confirmed.map(c => ({ pickup: c.pickup, drop: c.drop, destName: c.destName }));
        const caught = goalsVerdict?.wonGoal?.name ?? dst.name;
        const withCall = [...baseCalls, { pickup, drop, destName: caught }];
        const nowStops = chainOf(withCall)!;
        const fromVisited = visitedCountRef.current;   // 🧷 이 경로가 «몇 정거장 지나고» 잰 것인지 — 접기(수술 4단계)의 기준점
        callApi('🧭 전체 경로 실측(재배치 후)', '/sim/chain',
            { stops: nowStops, priority: routeCombo.priority, avoid: routeCombo.avoid },
            `정거장 ${nowStops.length}: ${nowStops.map(x => x.label).join(' → ')}`, callTag)
            .then(d => {
                if (!fresh()) return;
                setChainNow({ ...d, measuredAt: clockBaseRef.current + simMinRef.current * 60000, fromVisited });
                const newNo = circled(confirmed.length + 1);   // 전체 경로 라벨은 calls 배열 순번 — 새 콜이 마지막
                setChainPreview((d.legs ?? [])
                    .filter((lg: ChainLeg) => legSound(lg) && lg.line.length >= 2)
                    .map((lg: ChainLeg) => ({
                        line: lg.line.map(q => ({ lng: q.x, lat: q.y })),
                        isNew: lg.from?.startsWith(newNo) === true || lg.to?.startsWith(newNo) === true,
                    })));
                /**
                 * ⑥⑦ 첫짐 — 카카오가 나눠 준 **그 구간 그대로** 저장·표시·궤적에 쓴다
                 * (기사님: *"그 정보로 첫 콜 정보창에 1번 상차시간 2번 배송시간을 저장하고"*).
                 * 합짐일 때는 ⑮ 고유 호출이 이미 채웠으므로 건드리지 않는다.
                 */
                if (confirmed.length === 0) {
                    const [ap, dl] = (d.legs ?? []) as ChainLeg[];
                    if (ap && !ap.failed) {
                        const aline: Pt[] = ap.line.map(q => ({ lng: q.x, lat: q.y }));
                        setApproachLeg(aline);
                        setApproachInfo({ distKm: ap.distKm, durMin: ap.durMin, failed: false });
                    }
                    if (dl && !dl.failed) {
                        setUploadedLeg(dl.line.map(q => ({ lng: q.x, lat: q.y })));
                        uploadedInfoRef.current = { distKm: dl.distKm, durMin: dl.durMin, tollWon: d.tollWon ?? null, failed: false };
                    }
                }
                // 🗄️ 확정되면 이 구간들이 경로에 그대로 들어간다 — 캐시에 넣어 다시 안 묻는다
                (d.legs ?? []).forEach((lg: ChainLeg, i: number) => {
                    const a2 = nowStops[i], b2 = nowStops[i + 1];
                    if (!a2 || !b2 || lg.failed || lg.line.length < 2) return;   // 못 잰 구간은 캐시에 안 넣는다
                    legCacheRef.current.set(legKey(a2.x, a2.y, b2.x, b2.y),
                        { line: lg.line.map(p => ({ lng: p.x, lat: p.y })), failed: false });
                });
            })
            .catch(err => { console.warn('[전체 경로] 못 받음:', err); if (fresh()) setChainNow({ legs: [], totalKm: null, totalMin: null, partial: true, note: `못 쟀다: ${String(err)}` }); });
        /**
         * 🔴 **기존 경로는 다시 재지 않는다 — ⑦ 에 저장해 둔 전체 경로가 곧 «기존»이다**
         * (기사님 2026-09-08: *"저장하라고 했잖아 … 그림까지 그려져 있는데 모른다는 게 말이 되니"*).
         *
         * 재배치는 «가장 싸게 끼워 넣기»라 **기존 콜들의 상대 순서를 안 바꾼다** — 그래서
         * 직전 전체 경로가 그대로 비교 기준이 된다. 다시 부르면 카카오 1회가 더 나가고,
         * 그 호출이 실패하면 «?» 만 남았다 (그 사고를 이걸로 없앤다).
         */
        setChainBefore(confirmed.length === 0
            ? { legs: [], totalKm: null, totalMin: null, note: '첫짐 — 기존 경로가 없다' }
            : lastChainRef.current
                ?? { legs: [], totalKm: null, totalMin: null, note: '직전 전체 경로를 아직 못 쟀다' });
    };
    /**
     * 📌 **기존 콜이 얼마나 밀리나** (기사님 2026-09-08: *"이 합짐이 기존 콜에 얼마나 영향이
     * 있는지 알아야 해 — 첫짐의 상차가 얼마나 늦어지는지, 첫짐이 하차지에 시간 안에 도착할 수
     * 있는지"*).
     *
     * 🔴 구간을 **합치지 않고** 누적한다: 전체 경로의 구간 를 순서대로 더하면 정거장마다 도착까지의
     * 분이 나온다. 같은 정거장을 두 경로(기존 · 합짐 낀)에서 찾아 빼면 **그 정거장이 몇 분
     * 밀리는지**가 나온다 — 총합 하나로는 «어느 약속이 깨지나»를 답할 수 없다.
     */
    /**
     * 🔴 **우회 — «첫짐을 하차지에 언제 가져다 주느냐»** (기사님 2026-09-08).
     *
     * 로직은 하나다: **첫콜 하차까지의 누적을, ⑦ 에 저장한 누적과 견준다.**
     * ```
     * 저장 도착 = (저장 상차지까지) + (저장 배송)
     * 지금 도착 = Σ 지금 전체 경로의  내 위치 → … → 첫콜하차   (사이에 낀 것이 몇이든 다 더한다)
     * 우회하차 = 지금 도착 − 저장 도착
     * ```
     * 🔴 **구간 하나만 보면 안 된다.** 기사님 손식은 `(합짐상차→첫콜하차) − (저장 배송)`
     * 이었는데, 그러면 사이에 낀 `(첫콜상차→합짐상차)` 가 통째로 빠진다 — 실측에서
     * 그 구간이 37분이었고, 13분이라고 답할 뻔한 지연이 실제로는 50분이었다.
     * **누적으로 재면 몇 개가 끼든 저절로 맞는다.**
     *
     * 🔴 **뒤 항(첫콜하차→합짐하차)은 안 더한다** — 기사님 말씀대로 그건 합짐 제 짐을
     * 내리러 더 가는 길이지 첫짐이 늦는 양이 아니다. 누적은 첫콜 하차에서 끊는다.
     *
     * 시한: **저장 배송 × 1.5 + 상차 약속 20분** (콜 시한 규칙). 넘으면 전화로 물린다.
     */
    const detourRows = useMemo(() => {
        if (!chainNow || confirmed.length === 0) return [];
        const first = confirmed[0], firstNo = circled(baseCallCount + 1);
        const rows: Array<{ name: string; min: number; how: string; budget?: { limitAt: number; usedAt: number } }> = [];

        /**
         * 🔴 **분끼리 빼지 않는다 — 시각끼리 뺀다** (2026-09-09에 잡은 버그).
         *
         * 예전엔 `지금 누적분 − 저장 누적분` 이었다. 그런데 «지금 누적»은 **지금 내 위치**에서
         * 재고 «저장 누적»은 **확정하던 그 자리**에서 잰 값이다 — 기준점이 다른 두 분을 빼면
         * **그 사이에 흐른 시간이 통째로 빠진다.** 실측: 콜 리스트는 +70분이라는데 결론줄은
         * +40분이라고 했다(주행 30분이 사라진 것). 약속은 **절대 시각**으로 못 박아 뒀으니
         * 지금 도착 예정도 절대 시각으로 만들어 그것끼리 견준다.
         */
        const etaOf = (label: string) => arrivalAt(chainNow, label, labDwellOf);   // 🕒 «잰 시각 + 누적(정차 포함)» — 한 곳에서
        const lateMin = (etaAt: number | null, promisedAt: number | null | undefined) =>
            etaAt != null && promisedAt != null ? Math.round((etaAt - promisedAt) / 60000) : null;

        const pickEta = etaOf(`${firstNo}상차`), pickLate = lateMin(pickEta, first.steps.pickup.promisedAt);
        if (pickLate != null)
            rows.push({ name: '우회상차', min: pickLate,
                how: `예정 ${hhmm(pickEta!)} − 약속 ${hhmm(first.steps.pickup.promisedAt!)}` });

        const dropEta = etaOf(`${firstNo}하차`), dropLate = lateMin(dropEta, first.steps.dropoff.promisedAt);
        if (dropLate != null && first.approachMin != null && first.durMin != null) {
            // ⏳ 하차 시한도 절대 시각으로 — 확정 순간부터 «배송×1.5 + 상차 약속 20분» 까지
            const confirmedAt = first.steps.dropoff.promisedAt! - (first.approachMin + first.durMin) * 60000;
            const deadlineAt = confirmedAt + (Math.round(first.durMin * 1.5) + 20) * 60000;
            rows.push({ name: '우회하차', min: dropLate,
                how: `예정 ${hhmm(dropEta!)} − 약속 ${hhmm(first.steps.dropoff.promisedAt!)}`,
                budget: { limitAt: deadlineAt, usedAt: dropEta! } });
        }
        return rows;
    }, [chainNow, confirmed, baseCallCount, clockNow]);
    /**
     * 📦 **콜 하나가 한 덩어리** (기사님 2026-09-08: *"좌우로 표현하지 말고 첫콜 합짐1 합짐2
     * 이렇게 순차적으로 덩어리감 있게"*).
     *
     * 기존↔지금을 좌우로 놓으면 «어느 콜이 어떻게 되는가»를 눈이 스스로 짜맞춰야 했다.
     * 콜마다 자기 상차·하차의 «기존 도착 → 지금 도착»을 들고 있게 바꾼다 — 마지막 덩어리가
     * 지금 심사하는 후보콜이다.
     */
    // 🕒 모의 시계의 속도 — 지금 경로가 말하는 ㎞/분 (카카오 실측). 없으면 40km/h 를 쓴다
    useEffect(() => {
        const c = chainNow ?? lastChainRef.current;
        if (c?.totalKm != null && c.totalMin) paceRef.current = c.totalKm / c.totalMin;
    }, [chainNow]);
    const callImpacts = useMemo(() => {
        const cand = !!(pickup && drop);                         // 후보콜은 전체 경로에서 마지막 번호
        const last = confirmed.length + (cand ? 1 : 0);
        /**
         * ⏱️ **예정 시각은 «계산»한다** (기사님 2026-09-09: *"아직 안 지났으면 언제 지날지
         * 예정 시간을 계산해서 넣는 것이 맞아"*).
         *
         * 얼어붙은 약속을 그대로 베끼지 않는다 — 약속은 «그때 정한 것»이고 예정은 «지금 가면
         * 언제 닿나»다. 남은 정거장을 방문 순서대로 걸으며 구간 분을 더한다:
         *   구간 분 = 방금 잰 전체 경로에 있으면 그 값 · 없으면 ⑦ 에 저장해 둔 그 콜의 구간
         * 하나라도 모르면 **거기서 멈춘다** (그 뒤는 빈칸 — 지어내지 않는다).
         */
        /**
         * 🔴 **예정의 원천 경로 — 심사 중이면 그 경로, 아니면 «확정 순간 동결»(routeChain)** (2026-09-11).
         * 지도 클릭으로 새 콜을 찍으면 chainNow 가 비는데, 그때 기준 시각이 «지금 시계»로
         * 떨어져 **달리는 동안 예정·±가 매분 밀렸다** (기사님: *"추가된 시간은 콜을 받을 때만
         * 변해야 하는데"* — 멈추면 안 늘어난 것이 증거). 동결 경로로 물러나면 기준이
         * «콜 받은 순간»에 고정된다.
         */
        // 🔴 못 잰 응답(legs 빈 채 note 만 온 것 — measuredAt 없음)은 심사 경로로 안 친다 (리뷰 2026-09-11)
        const baseChain = chainNow?.measuredAt != null ? chainNow : routeChain;
        const legMin = new Map<string, number | null>();
        for (let n = 1; n <= last; n++) {
            const no = circled(n), c = n <= confirmed.length ? confirmed[n - 1] : null;
            legMin.set(`${no}상차`, c ? c.approachMin ?? null : approachInfo?.durMin ?? null);
            legMin.set(`${no}하차`, c ? c.durMin ?? null : uploadedInfoRef.current?.durMin ?? null);
        }
        for (const lg of baseChain?.legs ?? []) if (lg.to && lg.durMin != null) legMin.set(lg.to, lg.durMin);
        const visitedNow = departed ? prevOrderRef.current.slice(0, visitedCountRef.current) : [];
        const chainOrder = (baseChain?.legs ?? []).map(l => l.to).filter((x): x is string => !!x);
        const order = chainOrder.length ? chainOrder
            : orderStopsInsert(myPos, [
                ...confirmed.map(c => ({ pickup: c.pickup, drop: c.drop, destName: c.destName })),
                ...(cand ? [{ pickup: pickup!, drop: drop!, destName: goalsVerdict?.wonGoal?.name ?? dst.name }] : []),
            ], visitedNow)
                .filter(st => !visitedNow.some(v => v.call === st.call && v.kind === st.kind))
                .map(st => `${circled(st.call)}${st.kind}`);
        /**
         * 🔢 **실제 방문 순번** — 지나온 정거장 다음에 남은 순서가 이어진다.
         *
         * 🔴 **겹치는 것을 빼고 잇는다.** 경로(`chainNow`)는 **주행 전에** 잰 것이라 지금
         * 지나온 정거장까지 그대로 품고 있다. 그냥 이어 붙이면 그 수만큼 번호가 밀린다 —
         * 실측(2026-09-09): 방문 순서 패널은 «4 관산동 · 5 지영동», 콜 리스트 배지는
         * «⑦관산동 · ⑧지영동». 지나온 셋을 두 번 세서 정확히 +3 이었다.
         */
        const visitedLabels = visitedNow.map(v => `${circled(v.call)}${v.kind}`);
        /**
         * 🔴 **후보콜은 번호를 안 먹는다** (기사님 2026-09-10: *"지도의 남은 자리는 8·9·10,
         *    콜 리스트랑 달라"* — 실측 지도 ⑧⑨⑩ ↔ 시트 10·11·12).
         *
         * `chainNow` 는 «후보콜을 낀 전체 경로»라 후보 정거장 **둘**을 품고 있다. 그대로 세면
         * 그 뒤 정거장이 전부 **+2** 로 밀린다. 지도는 후보를 «상/하» 표시로만 그리고 번호를 안 준다 —
         * 잡아야 정거장이 되기 때문이다. **세는 곳이 둘이라 난 사고가 이번이 세 번째**라
         * 계산을 `labTime.visitOrder` 로 꺼내 검사로 잠갔다 (규칙 ③).
         */
        const candLabels = cand ? [`${circled(last)}상차`, `${circled(last)}하차`] : [];
        const fullOrder = visitOrder(visitedLabels, order, candLabels);
        // 🕒 기준은 «지금»이 아니라 **이 경로를 잰 시각**이다 — 안 그러면 달릴수록 예정이 뒤로 도망간다
        const t = baseChain?.measuredAt ?? clockNow;
        const now = new Map<string, number>();
        let acc = 0;
        for (const label of order) {
            const m = legMin.get(label);
            if (m == null) break;                     // 모르는 구간부터는 예정을 못 낸다
            acc += m; now.set(label, t + acc * 60000);
            acc += labDwellOf(label);                 // 🧳 여기 머문 뒤 다음 구간이 시작한다 (짐 미확인 — 일반값)
        }
        return Array.from({ length: last }, (_, i) => {
            const n = i + 1, no = circled(n), isNew = cand && n === last;
            const c = isNew ? null : confirmed[n - 1];
            const from = isNew ? pickup : c!.pickup, to = isNew ? drop : c!.drop;
            return {
                no, disp: circled(baseCallCount + n), isNew, id: c?.id ?? null,
                where: from && to ? `${nearestDong(from).name} → ${nearestDong(to).name}` : '',
                stops: (['상차', '하차'] as const).map(kind => {
                    const label = `${no}${kind}`;
                    /**
                     * 🔴 **줄은 값이 없어도 남긴다** (기사님 2026-09-08: *"값이 없다고 그 줄이
                     * 없어지면 비교가 어려우니 모든 줄을 다 적어줘"*). 지나온 정거장은 전체 경로에
                     * 없으므로 ⑦ 에 저장한 구간을 대신 적고, 없으면 `--` 로 둔다.
                     */
                    const fromChain = baseChain?.legs.find(l => l.to === label) ?? null;
                    /**
                     * 🔴 **덩어리는 «그 콜의 것»만 보인다** (기사님 2026-09-09: *"이 영역은 첫짐의
                     * 영역이니까 첫짐이 가진 저장된 정보만 보여야 하는데"*).
                     *
                     * 지금 경로에서 그 정거장으로 **들어오는** 구간을 적었더니 첫짐 칸에
                     * `②하차 → ①하차 9.4km · 21분` 같은 남의 구간이 들어왔다 — «중대동에서
                     * 탄현동까지 21분» 으로 읽혀 거짓말이 된다. 저장한 자기 두 구간을 먼저 쓴다.
                     */
                    const saved = kind === '상차'
                        ? (c?.approachKm != null ? { from: '내 위치', to: label, distKm: c.approachKm, durMin: c.approachMin ?? null } : null)
                        : (c?.distKm != null ? { from: `${no}상차`, to: label, distKm: c.distKm, durMin: c.durMin ?? null } : null);
                    const step = c ? (kind === '상차' ? c.steps.pickup : c.steps.dropoff) : null;
                    const promised = step?.promisedAt ?? null;
                    /** ☎️ 통화로 정한 약속인가 — 화면이 이 값 하나로 색을 낸다 */
                    const promiseBy = step?.promiseBy ?? null;
                    return {
                        kind, label,
                        leg: saved ?? fromChain, fromSaved: !!saved,
                        seq: fullOrder.indexOf(label) + 1 || null,   // 🔢 실제 방문 순번
                        promisedAt: promised, promiseBy,
                        impacts: step?.impacts ?? [],          // 🧾 앞선 확정들이 이 정거장을 민 내역
                        /**
                         * 🔴 **지나간 정거장에 «예정»은 없다** (기사님 2026-09-09: *"이 지역을
                         * 지나갔으면 … 지나간 시간을 적어 주는 것이 맞을 것 같아"*).
                         * 예정은 «앞으로 언제 닿나»의 답이라, 이미 닿은 곳에서는 **빈칸이 맞다** —
                         * 통과 시각으로 메우면 «예측»과 «사실»이 한 칸에서 섞인다.
                         * 아직 안 지났으면 위에서 **걸으며 계산한** 예정을 쓴다.
                         */
                        etaAt: step?.occurredAt != null ? null : now.get(label) ?? null,
                        passedAt: step?.occurredAt ?? null,
                    };
                }),
            };
        });
    }, [chainNow, routeChain, confirmed, baseCallCount, pickup, drop, departed, myPos, approachInfo, goalsVerdict, dst.name, clockNow]);

    /**
     * 🎨 **후보콜의 색 — 실물 엔진이 채점한다** (기사님 2026-09-09 «필터를 만들어 보자» 판).
     *
     * 🔴 **여기서 채점하지 않는다.** 실험실 상태를 `buildLabFacts` 가 실물이 아는 «사실»로 옮기고,
     *    실물의 `judge(CRITERIA, …, DEFAULT_JUDGMENT)` 가 색을 낸다 — 목업이 제 채점기를 두면
     *    실험이 거짓말이 된다 (규칙 ③).
     *
     * 🔴 **«더 쓰는 시간»은 전체 경로의 전/후 차이다** (2026-09-09 정정). 처음엔 «이 콜 자신의
     *    주행»으로 근사했는데, **올릴 때 이미 «후보콜을 낀 전체 경로»를 재고 있었다** —
     *    있는 값을 안 쓰고 근사한 것이라 합짐에서 시급이 부풀었다. 셈은 `extraDriveMin` 이 한다.
     */
    const candJudge = useMemo(() => {
        if (!pickup || !drop) return null;
        const driveMin = extraDriveMin(chainNow?.totalMin, chainBefore?.totalMin, confirmed.length > 0);
        const stops = callImpacts.flatMap(ci => ci.stops.map(st => ({
            label: `${ci.no}${st.kind}`, promisedAt: st.promisedAt, etaAt: st.etaAt,
        })));
        const facts = buildLabFacts({
            fare: candFare, boxes: candBoxes, driveMin,
            dwellMin: labDwellOf('상차') + labDwellOf('하차'),
            hasExistingCalls: confirmed.length > 0,
            stops, slotsUsed, capacitySlots: TRUCK_CAPACITY_SLOTS,
        });
        return { facts, result: judge(CRITERIA, facts, DEFAULT_JUDGMENT), driveMin };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pickup, drop, candFare, candBoxes, confirmed.length, callImpacts, slotsUsed, chainNow, chainBefore]);
    /**
     * ⚖️ **실물 심사석에 먹일 콜 한 벌** — 실험실 상태를 실물 규격(`SecuredOrder`)으로 옮긴다.
     *
     * 🔴 **판정은 실물이 낸 것 그대로** 싣는다 — `toSnapshot(judge(...))` 은 서버가 쓰는 그 변환이다.
     *    여기서 색을 다시 정하면 «실물 심사석을 띄운다»는 말이 거짓이 된다 (규칙 ③).
     * 🔴 못 잰 값은 **안 싣는다** (`distanceKm` 등) — 0 으로 채우면 심사석이 «0km»라고 적는다.
     */
    const seatOrder = useMemo<(SecuredOrder & { soloMin?: number | null }) | null>(() => {
        if (!pickup || !drop || !candJudge) return null;
        const p = nearestDong(pickup), d = nearestDong(drop);
        const km = uploadedInfoRef.current?.distKm ?? null;
        const min = uploadedInfoRef.current?.durMin ?? null;
        const ap = approachInfo?.durMin ?? null;
        return {
            id: 'lab-seat', type: 'NEW_ORDER',
            pickup: `${p.region} ${p.name}`, dropoff: `${d.region} ${d.name}`,
            fare: candFare, timestamp: new Date().toISOString(),
            status: 'ORDER_AWAITING_DECISION', capturedDeviceId: 'lab', capturedAt: new Date().toISOString(),
            ...(km != null ? { distanceKm: km } : {}),
            // 🚚 «이 콜만» 주행 분 — 시트 카드가 km 와 짝으로 쓴다 (더 쓰는 시간과 다른 값이다)
            soloMin: min,
            // 심사석 둘째 줄이 «소요 N분 / 상차지까지 M분» 을 여기서 읽는다 — 없으면 안 적는다
            kakaoTimeExt: min != null ? `소요 ${min}분${ap != null ? ` · 상차지까지 ${ap}분` : ''}` : '',
            judgment: toSnapshot(candJudge.result),
            /**
             * 🔴 **거절 사유는 «걸리는 것»만이다** (2026-09-10 화면 실측).
             *    전에는 점수를 못 낸 기준을 전부 담아 심사석에
             *    «❌ 지리 안 봄 (가중치 0)» 이 거절 사유로 떴다 — **안 보는 것은 거절이 아니다.**
             *    실물이 «색을 덮은 기준»으로 이미 골라 둔 `gates` 를 그대로 쓴다 (규칙 ③).
             */
            rejectionReasons: toSnapshot(candJudge.result).gates.map(g => g.why ?? g.name),
            approvalReasons: candJudge.result.criteria
                .filter(c => c.outcome.kind === 'scored').map(c => `${c.name} ${c.outcome.why}`),
        } as SecuredOrder;
    }, [pickup, drop, candJudge, candFare, approachInfo]);

    const stopImpacts = useMemo(() => {
        if (!chainNow || !chainBefore) return [];
        /** 🔴 두 경로는 **잰 시각이 다르다** — `arrivalAt` 이 각자의 기준을 더해 «시각»으로 낸다 */
        const rows: Array<{ stop: string; beforeAt: number; nowAt: number; delayMin: number }> = [];
        for (const stop of cumMinutes(chainBefore.legs, labDwellOf).keys()) {
            const beforeAt = arrivalAt(chainBefore, stop), nowAt = arrivalAt(chainNow, stop);
            if (beforeAt == null || nowAt == null) continue;   // 기준 시각이나 구간을 모르면 못 잰다
            rows.push({ stop, beforeAt, nowAt, delayMin: Math.round((nowAt - beforeAt) / 60000) });
        }
        return rows;
    }, [chainNow, chainBefore]);

    /**
     * ⏱️ **확정 경로의 정거장 시각** (기사님 2026-09-08: 콜 리스트에 «(이동시간 − 늦어진 시간, 도착시각)»).
     * 재료는 이미 있다 — `drawLegs`(구간별 실측 곡선)와 같은 순서인 `effPath`.
     * 구간 시간은 캐시된 전체 경로 값에서 오고, 지연은 «이 콜을 잡기 전 경로»과의 차이다.
     * 🔴 못 잰 구간이 있으면 그 뒤는 **null** 이다 — 시각을 지어내지 않는다 (규칙 ④).
     */
    /**
     * ⏱️ **콜 리스트가 쓰는 정거장 시계 — `callImpacts` 에서 파생한다** (규칙 ③: 원천 하나).
     * 두 벌로 세면 같은 정거장이 두 화면에서 다른 시각을 말한다.
     * 다섯 값: 이동분 · 밀리는 분 · **약속**(못 박힌 것) · **예정**(지금 전체 경로) · **통과**(GPS).
     */
    // 🔎 지나는 순간 얼릴 «마지막 예상» 을 늘 최신으로 들고 있는다 (실물 `predicted_at` 자리)
    useEffect(() => {
        const m: Record<string, number | null> = {};
        for (const ci of callImpacts) if (ci.id != null) for (const st of ci.stops) m[`${ci.id}-${st.kind}`] = st.etaAt;
        etaRef.current = m;
    }, [callImpacts]);
    const stopClock = useMemo(() => {
        const out = new Map<string, {
            seq: number | null; legKm: number | null; legMin: number | null; delayMin: number | null;
            promisedAt: number | null; etaAt: number | null; passedAt: number | null;
        }>();
        for (const ci of callImpacts) for (const st of ci.stops) {
            const real = st.passedAt ?? st.etaAt;
            out.set(`${ci.disp}${st.kind}`, {
                seq: st.seq, legKm: st.leg?.distKm ?? null,
                legMin: st.leg?.durMin ?? null,
                delayMin: real != null && st.promisedAt != null ? Math.round((real - st.promisedAt) / 60000) : null,
                promisedAt: st.promisedAt, etaAt: st.etaAt, passedAt: st.passedAt,
            });
        }
        return out;
    }, [callImpacts]);

    /**
     * 🎬 **시트 상태바가 말하는 «다음 갈 곳»** (실물 `sheetStatus` 문법 그대로 —
     * `▶ ② 진건읍 ~14분 · 2번 콜 · 하차 ›`).
     *
     * 🔴 실물이 정한 규칙 둘을 그대로 지킨다:
     *   · **심사 중이라고 «어디로 가는가»를 지우지 않는다** — 판정은 판정 영역이 말한다
     *   · 못 잰 분은 **안 적는다** (`~N분` 이 빈다) — 지어내지 않는다
     */
    const sheetNext = useMemo(() => {
        /**
         * 🔴 **«다음»은 방문 순번(seq)이 정한다 — 콜 번호 순이 아니다** (실측 2026-09-11).
         * 콜 번호 순으로 첫 미통과를 돌려주니, 오송 상차(방문 4·5)를 앞에 두고도
         * 콜① 하차 성거읍(방문 6)이 «다음»으로 떴다 — 상차를 건너뛴 안내다.
         */
        let best: { seq: number; name: string; callNo: number; disp: string; kind: '상차' | '하차'; min: number | null } | null = null;
        for (const ci of callImpacts) for (const st of ci.stops) {
            if (st.passedAt != null || ci.isNew) continue;      // 지난 곳 · 아직 안 잡은 후보는 건너뛴다
            if (st.seq == null) continue;                        // 순번을 모르는 정거장은 «다음»을 못 맡는다
            if (best && st.seq >= best.seq) continue;
            const [from, to] = ci.where.split(' → ');
            best = { seq: st.seq, name: (st.kind === '상차' ? from : to) ?? st.label,
                callNo: Number(ci.no.charCodeAt(0) - 0x2460) + 1, disp: ci.disp, kind: st.kind, min: st.leg?.durMin ?? null };
        }
        return best;
    }, [callImpacts]);

    /**
     * 🔢 **실제로 필터에 실리는 동 수** — 그물에서 «콕 집어 뺀 읍·면·동»을 뺀 것.
     * 통째 제외(도·시군구)는 `mergeGoalNets` 가 이미 뺐고, 여기 남은 것은 지도에 ⛔ 로 그리려고
     * 일부러 둔 것들이다. **제목은 앱에 실릴 수를 말해야 한다** (2026-09-10 실측: 352 ↔ 351).
     */
    const dongOut = useMemo(() => areaNet.pass.filter(p => isExcluded(p.region, p.name)).length,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [areaNet, excluded]);
    const netCount = areaNet.count - dongOut;

    /** ⛔ 제외지역에 걸린 콜 — 필터에 그 동이 안 실리므로 실전에선 애초에 안 올라온다 */
    const exclusionHit = useMemo(() => {
        if (!verdict) return null;
        if (isExcluded(verdict.pickupDong.region, verdict.pickupDong.name)) return `상차 ${verdict.pickupDong.region} ${verdict.pickupDong.name}`;
        if (isExcluded(verdict.dropDong.region, verdict.dropDong.name)) return `하차 ${verdict.dropDong.region} ${verdict.dropDong.name}`;
        return null;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [verdict, excluded]);
    /** 화면·기록이 쓰는 최종 통과 — 기하 판정(verdict.pass)에 제외지역을 겹친 값 */
    const finalPass = !!goalsVerdict?.pass && !exclusionHit;

    /**
     * 📜 판정 기록 (기사님 요청 2026-09-07 «한 바퀴 돌고 검토») — 처리(확정/버림)된 콜만 남긴다.
     * 한 바퀴 돌고 나서 이 목록으로 복기한다 — 최근 것이 위.
     */
    const [logs, setLogs] = useState<Array<{ t: string; from: string; to: string; dists: string; pass: boolean; local: boolean; act: '확정' | '버림' }>>([]);
    const pushLog = (act: '확정' | '버림') => {
        if (!verdict) return;
        const t = new Date().toTimeString().slice(0, 8);
        setLogs(l => [{
            t, from: verdict.pickupDong.name, to: verdict.dropDong.name,
            dists: `${verdict.distPickKm} : ${verdict.distDropKm} : ${verdict.distMeKm}`,
            pass: finalPass, local: verdict.local, act,   // 🔴 모드가 아니라 «이 콜을 관내로 쟀는가»
        }, ...l].slice(0, 40));
    };

    /** 주행 목표를 지금 자리에서 다시 잡는다 — 경로가 다시 짜였거나 주행을 새로 시작할 때 */
    const retarget = () => {
        if (drivePath.length < 1) { targetIdxRef.current = 0; return; }
        /**
         * 🔴 **주행은 되돌아가지 않는다 — «아직 안 지난 구간»에서만 고른다** (2026-09-09 실측).
         *
         * 예전엔 경로 **전체**에서 가장 가까운 점을 골랐다. 수도권에서 정거장이 예닐곱이면
         * 경로가 **제 몸을 스쳐 지나가서**, 지금 자리에서 제일 가까운 점이 «이미 지나온 구간»
         * 일 수 있다. 그러면 목표가 뒤로 뛰고 차가 되돌아간다.
         * `visitedCountRef` 는 `Math.max` 라 잠긴 정거장은 안 풀리는데 **주행 목표만 되돌아가서**,
         * 실측에서 «1→2→3 을 두 번 왕복»이 나왔다. 모의 시계는 그동안 계속 흘러서
         * 08:19 에 다섯째를 지나고 11:57 이 되도록 65분짜리 마지막 구간을 못 끝냈다.
         *
         * 🔴 `retarget` 은 **`drivePath` 가 바뀔 때마다** 돈다 — 구간 곡선이 비동기로 채워질
         *    때도 돈다. 그래서 이 제약이 없으면 주행 중에 몇 번이고 뒤로 튄다.
         */
        targetIdxRef.current = pickNextTarget(drivePath, myPosRef.current, visitedCountRef.current);
        setTargetSeq(drivePath[targetIdxRef.current]?.seq ?? 1);
    };
    useEffect(() => { retarget(); /* 경로(직선→실도로 포함)가 바뀌면 다음 점을 다시 찾는다 */ }, [drivePath]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!driving) return;
        if (drivePath.length < 1) { setDriving(false); return; }
        const STEP_KM = SPEEDS[speedIdx].kmPerTick;
        const id = setInterval(() => {
            simMinRef.current += STEP_KM / paceRef.current;   // 🕒 나아간 거리만큼 «모의 분»을 쌓는다
            setSimMin(simMinRef.current);
            setMyPos(pos => {
                let ti = targetIdxRef.current;
                let remain: number = STEP_KM;
                let cur = pos;
                // 실도로 점은 촘촘하다 — 한 틱 걸음이 남는 만큼 여러 점을 이어 삼킨다
                while (remain > 0 && ti < drivePath.length) {
                    const t = drivePath[ti];
                    const dx = (t.lng - cur.lng) * 88.6, dy = (t.lat - cur.lat) * 110.574;
                    const d = Math.hypot(dx, dy);
                    if (d <= remain) { cur = { lng: t.lng, lat: t.lat }; remain -= d; ti++; setTargetSeq(t.seq);
                        // 🔴 `seq` 는 **향하는** 정거장이다 — 그걸 «지나왔다»고 세면 한 칸 앞서 잠긴다.
                        //    (2026-09-08 실측: 양벌동으로 가는 중인데 주교동까지 방문으로 잠겨
                        //     방문 순서가 양벌→주교→신장→의정부 로 굳었다. 실제 최적은 양벌→신장→의정부→주교)
                        const passed = t.seq - 1;
                        if (passed > visitedCountRef.current) {
                            const now = clockBaseRef.current + simMinRef.current * 60000;   // 🕒 모의 시계로 찍는다
                            const just = prevOrderRef.current.slice(visitedCountRef.current, passed);
                            // ⏱️ 실측(`occurredAt`)과 **그때의 마지막 예상**(`predictedAt`)을 같은 행에 남긴다
                            if (just.length) setConfirmed(cs => cs.map((c, idx) => {
                                const hits = just.filter(v => v.call - 1 - baseCallCount === idx);
                                if (!hits.length) return c;
                                const st = { ...c.steps };
                                for (const v of hits) {
                                    const k = v.kind === '상차' ? 'pickup' : 'dropoff';
                                    if (st[k].occurredAt != null) continue;      // 한 번 지난 곳은 다시 안 덮는다
                                    st[k] = { ...st[k], occurredAt: now, source: '자동(GPS)',
                                        predictedAt: st[k].predictedAt ?? etaRef.current[`${c.id}-${v.kind}`] ?? null };
                                }
                                return { ...c, steps: st };
                            }));
                            visitedCountRef.current = passed;
                        } }
                    else { cur = { lng: cur.lng + dx / d * remain / 88.6, lat: cur.lat + dy / d * remain / 110.574 }; remain = 0; }
                }
                targetIdxRef.current = ti;
                if (ti >= drivePath.length) setDriving(false);   // 경로 끝 — 대기로
                return cur;
            });
        }, 120);
        return () => clearInterval(id);
    }, [driving, drivePath, speedIdx]);

    useEffect(() => {
        const measure = () => {
            const el = boxRef.current;
            if (el) setSize({ w: el.clientWidth, h: el.clientHeight });
        };
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, []);

    // 휠 줌 — 커서 자리를 고정한 채 즉시 건다 (passive:false 라 페이지 스크롤을 막을 수 있다)
    useEffect(() => {
        const el = boxRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const r = el.getBoundingClientRect();
            zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1 : -1);
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [size]);

    useEffect(() => {
        const draw = () => {
            const cv = canvasRef.current;
            if (!cv || size.w < 50) return;
            const dpr = window.devicePixelRatio || 1;
            cv.width = size.w * dpr; cv.height = size.h * dpr;
            const ctx = cv.getContext('2d')!;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            // 범위: 그물 + 경로 + 시험 점 → 다 담기는 줌을 고른다 (9~12)
            // 🔴 내 위치·목적지는 항상 넣는다 — 노선 탭(길 미확정)은 그물이 비어 목적지만 잡히고
            //    내 위치가 화면 밖으로 잘렸다 (기사님 2026-09-07 «노선을 클릭해도 함께 노출»)
            // 🔴 자동 맞춤은 **모든 목적지 마름모**를 담는다 — 첫 목적지만 보면 복귀 마름모가 화면 밖이다
            const pts: Array<[number, number]> = [
                ...goalNets.flatMap(g => g.net.tri), [myPos.lng, myPos.lat],
                ...goals.map(g => [g.lng, g.lat] as [number, number]),
            ];
            if (realLegs) for (const leg of realLegs) for (const p of leg) pts.push([p.lng, p.lat]);
            for (const g of goalNets) for (const c of g.net.circles) pts.push(...c.ring);
            for (const p of effPath) pts.push([p.x, p.y]);
            if (pickup) pts.push([pickup.lng, pickup.lat]);
            if (drop) pts.push([drop.lng, drop.lat]);
            let z: number, originX: number, originY: number;
            if (view.manual) {
                // 🔍 수동 보기 — 드래그·휠줌이 viewRef 에 적은 그대로 읽기만 한다 (여기서 덮어쓰면 이동분을 되감는다)
                ({ z, originX, originY } = viewRef.current);
            } else {
                z = 12;
                for (; z >= 9; z--) {
                    const ws = pts.map(([lng, lat]) => worldPx(lng, lat, z));
                    const spanX = Math.max(...ws.map(w => w[0])) - Math.min(...ws.map(w => w[0]));
                    const spanY = Math.max(...ws.map(w => w[1])) - Math.min(...ws.map(w => w[1]));
                    if (spanX + 60 <= size.w && spanY + 60 <= size.h) break;
                }
                const ws = pts.map(([lng, lat]) => worldPx(lng, lat, z));
                const cx = (Math.max(...ws.map(w => w[0])) + Math.min(...ws.map(w => w[0]))) / 2;
                const cy = (Math.max(...ws.map(w => w[1])) + Math.min(...ws.map(w => w[1]))) / 2;
                originX = cx - size.w / 2; originY = cy - size.h / 2;
            }
            if (!view.manual) viewRef.current = { z, originX, originY };
            const S = (lng: number, lat: number): [number, number] => {
                const [x, y] = worldPx(lng, lat, z);
                return [x - originX, y - originY];
            };

            ctx.fillStyle = '#e8e4dc'; ctx.fillRect(0, 0, size.w, size.h);
            // 🗺️ OSM 타일 — (레이어: 배경 지도)
            if (layers.base) {
            const t0x = Math.floor(originX / TILE), t0y = Math.floor(originY / TILE);
            const t1x = Math.floor((originX + size.w) / TILE), t1y = Math.floor((originY + size.h) / TILE);
            for (let ty = t0y; ty <= t1y; ty++) for (let tx = t0x; tx <= t1x; tx++) {
                const key = `${z}/${tx}/${ty}`;
                let img = tileCache.get(key);
                if (!img) {
                    img = new Image();
                    img.onload = () => drawRef.current();
                    img.src = `https://tile.openstreetmap.org/${key}.png`;
                    tileCache.set(key, img);
                }
                if (img.complete && img.naturalWidth > 0)
                    ctx.drawImage(img, tx * TILE - originX, ty * TILE - originY, TILE, TILE);
            }
            // 도형이 읽히게 타일을 살짝 가라앉힌다
            ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(0, 0, size.w, size.h);
            }

            // 🧭 지역 구분선 — (레이어: 경계선)
            if (layers.border) for (const f of SIDO) {
                const polys = (f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates]) as number[][][][];
                ctx.beginPath();
                let inView = false;
                for (const poly of polys) for (const ring of poly) {
                    ring.forEach(([lng, lat], i) => {
                        const [px, py] = S(lng, lat);
                        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                        if (px > -60 && px < size.w + 60 && py > -60 && py < size.h + 60) inView = true;
                    });
                    ctx.closePath();
                }
                if (!inView) continue;
                ctx.strokeStyle = 'rgba(71,85,105,.6)'; ctx.lineWidth = 1.6; ctx.stroke();
            }

            // km → px 환산 (경유 띠 폭·원을 땅 위 크기로)
            const kmBase = S(dst.lng, dst.lat);
            const kmProbe = S(dst.lng + 1 / (111.32 * Math.cos(dst.lat * Math.PI / 180)), dst.lat);
            const pxPerKm = Math.hypot(kmProbe[0] - kmBase[0], kmProbe[1] - kmBase[1]);

            /**
             * 🎯 **목적지마다 마름모 하나 + 원 둘** (⑮ 동선의 기준 · 기사님 2026-09-08).
             * 목적지가 둘이면 사각형도 둘, **목적지 원도 둘**. 출발각은 각자 제 목적지를 향한다.
             * 첫 콜 뒤에는 내 위치 원을 **그 목적지 원뿔과의 교집합**만 남긴다 (기준 5).
             */
            /**
             * 🎨 **그물은 전용 캔버스에 불투명으로 다 그린 뒤 통째로 한 번 얹는다** (기사님 2026-09-09).
             * 조각마다 반투명으로 칠하면 겹치는 자리가 두 겹이 되어 얼룩진다 —
             * 마름모·원은 한 path 로 묶었지만 **라인 띠는 `stroke` 라 그 path 에 못 들어간다.**
             */
            const netCv = (netLayerRef.current ??= document.createElement('canvas'));
            if (netCv.width !== cv.width || netCv.height !== cv.height) { netCv.width = cv.width; netCv.height = cv.height; }
            const nctx = netCv.getContext('2d')!;
            nctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            nctx.clearRect(0, 0, size.w, size.h);
            if (layers.net) for (const { goal, net: gn, usedLine } of goalNets) {
                /**
                 * 🔴 **«노선 단추»가 아니라 «라인이 실제로 있는가»로 가른다** (기사님 지적 2026-09-09:
                 * *"마름모 없음 — 그리지 않았을 뿐 영역은 있는 것 같음"*).
                 * 예전 조건은 `routeMode` 였다. 그래서 노선을 누르기만 하면 라인이 없어도
                 * **마름모가 화면에서 사라졌는데 판정은 그 마름모로 하고 있었다** —
                 * 화면이 조용히 거짓말한 것이다 (규칙 ⑤-4 ④).
                 *
                 * 🔴 **라인이 있어도 마름모는 그린다.** 노선의 그물은 «라인 ∪ 남은 마름모»라,
                 *    그때 마름모는 «마지막 하차지 → 목적지»다. 안 그리면 그 영역이 또 숨는다.
                 */
                const isLine = usedLine;   // 🔴 여기서 다시 판단하지 않는다 — 계산이 준 값이다
                /**
                 * 🎨 **면은 한 path 에 모아 한 번 칠한다** (기사님 2026-09-09 «마름모 라인을 지울 수 있을까?»).
                 * 조각마다 칠하면 겹치는 자리가 두 겹이 되어 얼룩진다 — 테두리를 지우면 더 도드라진다.
                 * 🔴 **마름모 테두리는 안 그린다.** 「여기서 콜을 부른다」는 면으로 읽히면 되고,
                 *    선이 있으면 실제 경로선(콜 색)과 헷갈린다.
                 */
                nctx.beginPath();
                if (gn.tri.length) {
                    gn.tri.forEach(([lng, lat]: [number, number], i: number) => { const [px, py] = S(lng, lat); i === 0 ? nctx.moveTo(px, py) : nctx.lineTo(px, py); });
                    nctx.closePath();
                }
                gn.circles.forEach((c: { ring: Array<[number, number]> }) => {
                    c.ring.forEach(([lng, lat]: [number, number], i: number) => { const [px, py] = S(lng, lat); i === 0 ? nctx.moveTo(px, py) : nctx.lineTo(px, py); });
                    nctx.closePath();
                });
                // 🔴 노선이면 내 위치 원도 그물의 일부다 — 상차 판정이 그 반경을 쓴다 (2026-09-08 리뷰)
                if (isLine) {
                    const [mx, my] = S(myPos.lng, myPos.lat);
                    nctx.moveTo(mx + (params.srcDiamKm / 2) * pxPerKm, my);
                    nctx.arc(mx, my, (params.srcDiamKm / 2) * pxPerKm, 0, Math.PI * 2);
                }
                nctx.fillStyle = NET_SOLID; nctx.fill();
                /**
                 * ⭕ **테두리는 «원»에만 남긴다** — 마름모·라인 띠는 면으로만 읽는다
                 * (기사님 2026-09-09: «마름모 라인을 지울 수 있을까?» · «목적지 테두리가 없어»).
                 *   · 목적지 원   실선 — 「여기까지가 목적지 둘레」
                 *   · 내 위치 원  점선 — 뜻이 다르다(「지금 갈 수 있는 거리」)
                 * 🔴 테두리는 **본 캔버스**에 그린다. 그물 캔버스에 넣으면 면과 같은 투명도가 걸려 흐려진다.
                 */
                ctx.strokeStyle = NET_EDGE; ctx.lineWidth = NET_EDGE_W;
                gn.circles.forEach((c: { name: string; ring: Array<[number, number]> }) => {
                    if (c.name !== goal.name) return;          // 목적지 원만 (출발 꼭짓점 원은 면으로 충분)
                    ctx.beginPath();
                    c.ring.forEach(([lng, lat], i) => { const [px, py] = S(lng, lat); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
                    ctx.stroke();
                });
                {
                    const [mx, my] = S(myPos.lng, myPos.lat);
                    ctx.beginPath(); ctx.arc(mx, my, (params.srcDiamKm / 2) * pxPerKm, 0, Math.PI * 2);
                    ctx.setLineDash([6, 5]); ctx.stroke();
                    ctx.setLineDash([]);
                }
                const [gx, gy] = S(goal.lng, goal.lat);
                ctx.fillStyle = '#d97706'; ctx.beginPath(); ctx.arc(gx, gy, 5, 0, Math.PI * 2); ctx.fill();
            }
            /**
             * 🛣️ **라인 띠** (레이어: 그물) — **잡은 콜들이 만든 실제 경로** 양옆 라인 반경.
             * 노선일 때 콜을 거르는 영역이 이것이라, 장식이 아니라 **필터를 눈으로 본 것**이다.
             *
             * 🔴 중심선은 여기서 안 그린다 — 그건 아래 «콜 색 곡선»이 이미 그린다.
             *    같은 선을 두 곳에서 그리면 한쪽만 고쳐져 어긋난다 (2026-09-07 유령 선 사고와 같은 클래스).
             * 🔴 라인이 없으면(콜 없음 · 경로 대기 · 카카오 실패) 아무것도 안 그린다 — 그때는 마름모가 그물이다.
             */
            if (layers.net && lineOn && routeLine) {
                /**
                 * 🔴 **띠도 «지나온 만큼» 짧아진다** (기사님 2026-09-09: *"아직도 지나간 길 인식
                 * 못 하고 있거든"*). 판정은 동마다 든 `progressKm` 으로 이미 걸러지는데,
                 * **그리는 띠는 전체가 그대로 칠해지고 있었다** — 라인을 통째로 두기로 하면서
                 * 그림만 따라오지 못했다. 화면과 판정이 또 다른 말을 한 자리다.
                 *
                 * 라인 점을 누적 거리로 훑어 **내 진행도 뒤부터** 긋는다 (그리기는 매 프레임 도는 일이라 싸다).
                 */
                nctx.lineCap = 'round'; nctx.lineJoin = 'round';
                nctx.beginPath();
                let acc = 0, put = 0;
                for (let i = 0; i < routeLine.length; i++) {
                    if (i > 0) {
                        const [ax, ay] = routeLine[i - 1], [bx, by] = routeLine[i];
                        acc += Math.hypot((bx - ax) * 88.6, (by - ay) * 110.574);
                    }
                    if (departed && acc < myProgressKm) continue;      // 지나온 자리 — 안 그린다
                    const [px, py] = S(routeLine[i][0], routeLine[i][1]);
                    put++ === 0 ? nctx.moveTo(px, py) : nctx.lineTo(px, py);
                }
                nctx.strokeStyle = NET_SOLID;
                nctx.lineWidth = Math.max(3, lineRadiusKm * 2 * pxPerKm);
                if (put >= 2) nctx.stroke();
            }
            // 🎨 그물 완성 — 통째로 한 번 얹는다. 이 한 줄이 «겹쳐서 진해지는 것»을 원리적으로 없앤다
            ctx.save(); ctx.globalAlpha = NET_ALPHA; ctx.drawImage(netCv, 0, 0, size.w, size.h); ctx.restore();
            // 그물에 든 동 — 파란 점 · 제외지역은 빨간 ✕ (빠졌다는 것이 지도에서 보여야 한다)
            if (layers.net) for (const p of areaNet.pass) {
                const [px, py] = S(p.x, p.y);
                if (isExcluded(p.region, p.name)) {
                    /**
                     * ⛔ **가지 않는 동 — 작게, 그러나 또렷하게** (기사님 2026-09-09:
                     * *"남한산성 등 가지 말아야 할 곳의 ✕ 표시가 약하다. 지도를 가리지 않는 선에서 강하게"*).
                     *
                     * 🔴 **크기가 아니라 대비로 올린다.** 같은 자리를 흰 선으로 먼저 굵게 긋고 그 위에
                     *    빨간 선을 얹으면, 지도의 어떤 배경(초록 산·회색 시가지·파란 그물) 위에서도 또렷하다.
                     *    ✕ 를 키우면 그만큼 지도를 덮으므로 반지름은 5px 로 작게 둔다.
                     */
                    const r = 5;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(px - r, py - r); ctx.lineTo(px + r, py + r);
                    ctx.moveTo(px + r, py - r); ctx.lineTo(px - r, py + r);
                    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 5; ctx.stroke();   // 배경과 가르는 흰 테두리
                    ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 2.6; ctx.stroke();               // ⛔ 빨강
                    ctx.lineCap = 'butt';
                    continue;
                }
                /**
                 * 💰 **콜이 잘 나오는 곳은 초록으로 크게** (기사님 2026-09-09
                 * *"잘 나오는 곳도 표시되면 좋을 것 같은데"*).
                 * 🔴 판정에는 안 쓴다 — **보이기만 한다.** 고르는 것은 기사님이다 (규칙 ①).
                 */
                const rich = isCallRich(p.region, p.name);
                ctx.fillStyle = rich ? 'rgba(22,163,74,.9)' : 'rgba(2,132,199,.8)';
                ctx.beginPath(); ctx.arc(px, py, rich ? 6 : 4, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = rich ? 1.8 : 1.2; ctx.stroke();
            }
            // 🐾 지나온 길 — 어두운 회색 실선, 경로 아래에 깔린다. 새 경로가 와도 남는다
            /**
             * 🎨 **구간 색 = 그 구간을 «만든» 콜** (기사님 확정 2026-09-09: *"원인색, 그러니까 콜 색"*).
             *
             * 예전엔 «도착하는 정거장»의 색이었다. 그러면 `②상차 → ①하차` 가 **①색**으로 칠해진다 —
             * 도착지가 ①이니까. 그런데 그 구간을 만든 건 **②번 합짐**이다. 합짐이 어디를 늘렸는지가
             * 색에서 사라졌다. 두 정거장 중 **나중에 잡은 콜**이 그 짝을 만든 콜이다.
             */
            const legColor = (i: number) => {
                const from = effPath[i]?.call, to = effPath[i + 1]?.call;
                const call = Math.max(from ?? to ?? 0, to ?? 0);
                return call > 0 ? CALL_COLORS[(call - 1) % CALL_COLORS.length] : (effPath[i + 1]?.color ?? '#e11d48');
            };
            // 잡은 콜 경로 — 구간 색 + 이름표 (레이어: 내 경로). 실도로 곡선이 오면 그걸로 잇는다
            /**
             * 🛣️ **수술 1단계 — 선은 «확정 순간의 카카오 경로» 한 벌로 그린다** (기사님 승인 2026-09-11).
             *
             * 구간마다 콜 색: «to» 정거장의 콜 번호(②상차 → 콜 2)로 칠한다.
             * 🔴 구간 하나라도 못 쟀으면(`failed`) **통째로 옛 방식으로** 물러난다 — 반쪽 그림을
             *    이어 붙이면 다시 두 계보가 된다 (되돌리는 길이기도 하다).
             * 🔴 첫 구간의 시작은 «잰 순간의 내 위치»다 — 달리면 그 뒤를 내가 지나왔으므로
             *    궤적(동선)이 자연히 덮는다. 그게 기사님이 말한 «지나온 길과 연결»이다.
             */
            const chainLegs = routeChain?.legs ?? null;
            const chainDrawable = !!chainLegs && chainLegs.length > 0
                && chainLegs.every(legSound);
            if (layers.route && chainDrawable) {
                for (const l of chainLegs!) {
                    const no = l.to ? (l.to.codePointAt(0)! - 0x2460 + 1) : 0;
                    ctx.beginPath();
                    l.line.forEach((p, j) => { const [px, py] = S(p.x, p.y); j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
                    ctx.strokeStyle = no >= 1 && no <= 40 ? CALL_COLORS[(no - 1) % CALL_COLORS.length] : '#e11d48';
                    ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.stroke();
                }
            } else if (layers.route) {
                if (drawLegs) {
                    drawLegs.forEach((leg, i) => {
                        ctx.beginPath();
                        const legPts = [{ lng: effPath[i].x, lat: effPath[i].y }, ...leg, { lng: effPath[i + 1].x, lat: effPath[i + 1].y }];
                        legPts.forEach((p, j) => { const [px, py] = S(p.lng, p.lat); j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
                        ctx.strokeStyle = legColor(i); ctx.lineWidth = 5; ctx.lineJoin = 'round';
                        if (legFailed[i]) ctx.setLineDash([6, 5]);      // 도로 탐색 불가 — 직선 구간은 점선
                        ctx.stroke(); ctx.setLineDash([]);
                    });
                } else {
                    for (let i = 1; i < effPath.length; i++) {
                        const a = S(effPath[i - 1].x, effPath[i - 1].y), b = S(effPath[i].x, effPath[i].y);
                        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
                        ctx.strokeStyle = legColor(i - 1); ctx.lineWidth = 5; ctx.stroke();
                    }
                }
            }
            /**
             * 🚗 **지나온 궤적은 경로 «위에», 더 가늘게** (기사님 확정 2026-09-09).
             *
             * 순서: 계획한 경로를 깔고 **실제 달린 길을 그 위에** 얹는다 — 나중에 일어난 일이 위다.
             * 토글도 갈랐다(«경로» ↔ «동선») — 계획만, 실제만, 둘 다를 따로 볼 수 있어야
             * 오차가 눈에 든다. 굵기: 경로 5px · 동선 2.5px. 🔴 **덮으면 안 된다** — 기사님이 이 두 줄을 겹쳐 두는
             * 이유가 *"경로와 지나간 길의 오차를 확인하기 위해"* 라서, 궤적이 경로를 가리면
             * 그 목적이 사라진다. 겹치면 색 줄 한가운데 검은 실선, 어긋나면 두 줄이 갈라져 보인다.
             */
            if (layers.trail) for (const seg of trailRef.current) {
                if (seg.length < 2) continue;
                ctx.beginPath();
                seg.forEach((p, i) => { const [px, py] = S(p.lng, p.lat); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
                ctx.strokeStyle = 'rgba(17,24,39,.9)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
            }
            const chip = (px: number, py: number, text: string, tone: string) => {
                ctx.font = '800 11px system-ui';
                const w = ctx.measureText(text).width + 12;
                ctx.fillStyle = 'rgba(255,255,255,.94)';
                ctx.strokeStyle = tone; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.roundRect(px - w / 2, py - 26, w, 18, 6); ctx.fill(); ctx.stroke();
                ctx.fillStyle = '#111827'; ctx.textAlign = 'center'; ctx.fillText(text, px, py - 13);
            };
            /**
             * 🔴 **경로의 첫 점(«내 위치»)에는 이름표를 안 붙인다.** 바로 아래에서 지금 내 위치를
             *    `📍 내 위치` 로 따로 그린다 — 여기서 또 그리면 주행 중 **「내 위치」가 둘**로 뜬다
             *    (옛 자리 + 지금 자리). 출발 전에는 두 점이 겹쳐 안 보였을 뿐이다.
             */
            if (layers.route) for (const p of effPath.slice(1)) {
                const [px, py] = S(p.x, p.y);
                if (p.seq) {
                    // 방문 순번 배지 — 콜 색 원 안에 흰 번호 (기사님 2026-09-07 «경로에 번호»)
                    ctx.fillStyle = p.color ?? '#e11d48';
                    ctx.beginPath(); ctx.arc(px, py, 9.5, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
                    ctx.font = '800 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#fff'; ctx.fillText(String(p.seq), px, py + 0.5);
                    ctx.textBaseline = 'alphabetic';
                } else {
                    ctx.fillStyle = '#111827';
                    ctx.beginPath(); ctx.arc(px, py, 5.5, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill();
                }
                chip(px, py, p.label, p.color ?? '#111827');
            }
            // 꼭짓점(현위치) · 목적지
            for (const [pt, tone, mark] of [[anchor, '#111827', '📍'] as const,
                ...goals.map(g => [g, '#d97706', '🎯'] as const)]) {
                const [px, py] = S(pt.lng, pt.lat);
                ctx.fillStyle = tone; ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
                chip(px, py, `${mark} ${pt.name}`, tone);
            }
            // 시험 콜 — (레이어: 시험 콜)
            if (layers.call && pickup && drop) {
                // ⏱️ 안전취소 30초 동안은 **굵게 깜빡인다** — «지금 결정해야 하는 콜»이라는 신호
                //    (기사님 2026-09-08 «좀 더 시뮬레이션처럼»). 30초가 지나면 조용한 점선으로
                const urgent = (safeCancelLeft ?? 0) > 0;
                const blink = urgent ? 0.45 + 0.55 * Math.abs(Math.sin(nowTick / 260)) : 1;
                // 🧭 «이 콜을 끼면 이렇게 간다» — 재배치한 전체 경로를 먼저 깐다 (합짐의 유일한 그림)
                if (chainPreview) for (const leg of chainPreview) {
                    if (leg.line.length < 2) continue;
                    ctx.beginPath();
                    leg.line.forEach((p, i) => { const [px, py] = S(p.lng, p.lat); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
                    // 이 콜 때문에 생긴 구간은 판정색으로 굵게 — «무엇이 늘었나»가 보여야 확정을 누른다
                    ctx.strokeStyle = leg.isNew ? (finalPass ? '#16a34a' : '#dc2626') : 'rgba(37,99,235,.5)';
                    ctx.lineWidth = leg.isNew ? (urgent ? 5.5 : 4) : 5;
                    ctx.globalAlpha = leg.isNew ? blink : 1;
                    ctx.setLineDash([]); ctx.lineJoin = 'round'; ctx.stroke();
                    ctx.globalAlpha = 1;
                }
                // 🚚 «상차지까지» — 내 위치 → 상차지. 전체 경로가 이미 그 구간을 품고 있으면 겹쳐 긋지 않는다
                //    (첫짐·합짐이 **같은 로직**이어야 한다 — 기사님 2026-09-08)
                if (!chainPreview?.length && approachLeg && approachLeg.length >= 2) {
                    ctx.beginPath();
                    approachLeg.forEach((p, i) => { const [px, py] = S(p.lng, p.lat); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
                    ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 3; ctx.setLineDash([]); ctx.lineJoin = 'round'; ctx.stroke();
                }
                const a = S(pickup.lng, pickup.lat), b = S(drop.lng, drop.lat);
                ctx.globalAlpha = blink;
                // 🔴 전체 경로가 오면 그것이 곧 «지금 경로»다 — 직선 점선을 위에 또 긋지 않는다.
                //    점선은 «아직 안 재 봤다»는 표시일 뿐이라 확정을 판단할 그림이 못 된다
                if (!chainPreview?.length) {
                    ctx.beginPath();
                    if (uploadedLeg && uploadedLeg.length >= 2) {   // 올린 뒤 — 카카오 실도로
                        uploadedLeg.forEach((p, i) => { const [px, py] = S(p.lng, p.lat); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); });
                    } else { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
                    ctx.strokeStyle = finalPass ? '#16a34a' : '#dc2626'; ctx.lineWidth = urgent ? 4.5 : 2.5;
                    ctx.setLineDash(uploadedLeg ? [] : urgent ? [12, 7] : [7, 5]); ctx.stroke(); ctx.setLineDash([]);
                }
                if (urgent) {   // 상차 자리에 퍼지는 고리 — 새 콜이 여기 떴다
                    const r = 12 + 10 * (1 - (safeCancelLeft ?? 0) / 30 % 1);
                    ctx.beginPath(); ctx.arc(a[0], a[1], r, 0, Math.PI * 2);
                    ctx.strokeStyle = finalPass ? 'rgba(22,163,74,.55)' : 'rgba(220,38,38,.55)';
                    ctx.lineWidth = 2; ctx.stroke();
                }
                ctx.globalAlpha = 1;
            }
            /** 상·하차 마커 — 원 안에 「상」「하」 (기사님 2026-09-08: 삼각형은 방향으로 오해된다) */
            const stopDot = (x: number, y: number, label: '상' | '하', tone: string) => {
                ctx.fillStyle = tone; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
                ctx.font = '800 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillStyle = '#fff'; ctx.fillText(label, x, y + 0.5);
                ctx.textBaseline = 'alphabetic';
            };
            if (layers.call && pickup) { const [px, py] = S(pickup.lng, pickup.lat); stopDot(px, py, '상', '#16a34a'); }
            if (layers.call && drop) { const [px, py] = S(drop.lng, drop.lat); stopDot(px, py, '하', '#dc2626'); }
        };
        drawRef.current = draw;
        draw();
    }, [net, areaNet, goalNets, loadedGoalNames, legFailed, approachLeg, chainPreview, safeCancelLeft, nowTick, finalPass, uploadedLeg, effPath, anchor, pickup, drop, verdict, size, params, dst, routeStarted, dstSgg, view, layers, routeMode, lineOn, routeLine, lineRadiusKm, knobs, myPos, drawLegs, excluded]);

    /** 클릭 한 점을 콜/내위치로 배치 */
    const placeAt = (pt: Pt) => {
        if (clickMode === 'me') { setMyPos(pt); setClickMode('call'); return; }
        if (!pickup || (pickup && drop)) { if (pickup && drop) pushLog('버림'); pauseForCall(); setPickup(pt); setDrop(null); setUploaded(false); setUploadedLeg(null); setApproachLeg(null); setApproachInfo(null); setChainNow(null); setChainBefore(null); setChainPreview(null); uploadedInfoRef.current = null; uploadSeqRef.current++; setCallSeenAt(null); }
        else {
            setDrop(pt); setUploadedLeg(null); setApproachLeg(null); setApproachInfo(null); setChainNow(null); setChainBefore(null); setChainPreview(null); uploadedInfoRef.current = null; uploadSeqRef.current++;
            /**
             * 💰 **요금·짐은 20만원·1박스로 고정한다** (기사님 확정 2026-09-10).
             *
             * 기사님: *"요금은 상관없고 지금은 **가는 길에 잘 잡는가, 필터가 통과할 수 있는가**
             * 그런 걸 봐야 하는 거야."* · *"넌 지역·거리·시간은 알지만 그 외 **가격·짐은 알 수가 없어.
             * 그걸 20만원 박스 1개로 만들라는 거야.**"*
             *
             * 🔴 전에는 «직선 km × 하한 단가»로 채웠다 — **콜마다 요금이 달라져** 색이 따라 흔들렸다.
             *    그러면 «필터가 통과했나»를 보려는데 **돈이 화면을 흔든다.**
             *    지도 클릭으로 만든 콜은 애초에 **가격·짐을 알 수 없는 콜**이라, 지어낸 값을 넣느니
             *    **늘 같은 값**을 넣는 것이 정직하다 — 그래야 달라진 것이 «길»뿐이다.
             * ⚠️ 실전에서는 배차망이 그 값을 준다. 이건 **실험실이 콜을 손으로 만들기 때문**에 필요한 것이다.
             */
            setCandFare(LAB_DEFAULTS.candFare);
        }
    };

    const onMapClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const v = viewRef.current;
        if (dragRef.current.moved) { dragRef.current.moved = false; return; }   // 드래그 끝의 클릭은 콜이 아니다
        placeAt(fromWorldPx(v.originX + (e.clientX - rect.left), v.originY + (e.clientY - rect.top), v.z));
    };

    return (
        <div className="h-screen bg-background text-text-primary flex flex-col overflow-hidden">
            {/* 📍 정거장 상세 — 라벨을 펼친다. 퀵사가 «왜 늦었어» 할 때 여는 화면 (기사님 2026-09-09) */}
            {stopPeek && (() => {
                const idx = confirmed.findIndex(c => c.id === stopPeek.callId);
                if (idx < 0) return null;
                const c = confirmed[idx], no = circled(baseCallCount + idx + 1);
                const pt = stopPeek.kind === '상차' ? c.pickup : c.drop;
                const dong = nearestDong(pt);
                const clock = stopClock.get(`${no}${stopPeek.kind}`);
                const rows: Array<[string, string, string]> = [
                    ['실 주행시간', clock?.legMin != null ? `${clock.legMin}분` : '--분',
                        clock?.legKm != null ? `${clock.legKm}km` : ''],
                    ['다른콜로 영향받는시간', clock?.delayMin != null
                        ? `${clock.delayMin > 0 ? '+' : ''}${clock.delayMin}분` : '--분', ''],
                    ['실주행약속시간', hhmm(clock?.promisedAt), '확정 순간에 못 박은 값'],
                    ['도착 예정시간', hhmm(clock?.etaAt), '지금 경로가 말하는 도착'],
                    ['도착 완료시간', hhmm(clock?.passedAt), 'GPS 로 실제 지난 시각'],
                ];
                return (
                    <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4" onClick={() => setStopPeek(null)}>
                        <div className="w-full max-w-[520px] max-h-[85vh] overflow-auto rounded-[10px] border border-border-card bg-surface p-3 flex flex-col gap-2"
                            onClick={e => e.stopPropagation()}>
                            <div className="flex items-start justify-between gap-2">
                                <div className="text-[12px] font-black leading-snug">
                                    📍 {no} {stopPeek.kind}지 · {dong.region} {dong.name}
                                    <div className="text-[10.5px] font-bold text-text-muted">
                                        담당 — · 📞 — <span className="font-normal">(목업에 없는 값 — 지어내지 않는다)</span>
                                    </div>
                                </div>
                                <button type="button" onClick={() => setStopPeek(null)}
                                    className="shrink-0 px-2 py-1 rounded-[8px] border border-border-card text-[11px] font-black">닫기</button>
                            </div>
                            <div className="flex flex-col gap-0.5 text-[11.5px] tabular-nums">
                                {rows.map(([label, value, hint]) => (
                                    <div key={label} className="flex items-baseline justify-between gap-2 border-b border-border-card/60 py-0.5">
                                        <span className="font-bold text-text-muted shrink-0">{label}</span>
                                        <span className="text-right">
                                            <b className="font-black">{value}</b>
                                            {hint && <span className="text-[9.5px] font-normal text-text-muted"> {hint}</span>}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            {/* 🧾 이유 — 시스템이 채운 것과 기사님이 고른 것은 **다른 칸**이다 (규칙 ⑤-4 ⑤) */}
                            {/* 🧾 이유 — 시스템이 채운 것과 기사님이 고른 것은 **다른 줄**이다 (규칙 ⑤-4 ⑤) */}
                            {(() => {
                                const step = stopPeek.kind === '상차' ? c.steps.pickup : c.steps.dropoff;
                                const total = clock?.delayMin ?? null;
                                const known = step.impacts.reduce((t, x) => t + x.min, 0);
                                const rest = total == null ? null : total - known;
                                return (
                                    <div className="text-[11px] leading-snug flex flex-col gap-0.5">
                                        <div className="flex items-baseline gap-2">
                                            <b className="text-text-muted shrink-0 w-[86px]">이유 · 시스템</b>
                                            <span className="flex-1 flex flex-col">
                                                {step.impacts.map((x, k) => (
                                                    <span key={k} className="flex justify-between gap-2">
                                                        {/* 🔴 «확정»이라 박아 두면 취소 줄이 «… 취소 (04:24 확정)» 이 된다 — 시각만 적는다 */}
                                                        <span>{x.causeLabel} <span className="text-text-muted text-[9.5px]">({hhmm(x.at)})</span></span>
                                                        <b className={x.min > 0 ? 'text-warning' : 'text-success'}>{x.min > 0 ? '+' : ''}{x.min}분</b>
                                                    </span>
                                                ))}
                                                {rest != null && rest !== 0 && (
                                                    <span className="flex justify-between gap-2">
                                                        <span className="text-text-muted">나머지 (경로 이탈·교통)</span>
                                                        <b className={rest > 0 ? 'text-warning' : 'text-success'}>{rest > 0 ? '+' : ''}{rest}분</b>
                                                    </span>
                                                )}
                                                {!step.impacts.length && (rest == null || rest === 0) && <span className="text-text-muted">밀린 것 없음</span>}
                                            </span>
                                        </div>
                                        <div className="flex items-baseline gap-2">
                                            <b className="text-text-muted shrink-0 w-[86px]">이유 · 기사님</b>
                                            <span className="text-text-muted">— <span className="text-[9.5px]">(사고·문 잠김 … 실물의 `reasons` 자리 — 목업엔 입력이 없다)</span></span>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                );
            })()}
            {/* 📋 저장된 콜 전부 — 화면이 파생값으로 말하니, 원본도 볼 수 있어야 한다 (기사님 2026-09-09) */}
            {callsPeek && (
                <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4" onClick={() => setCallsPeek(false)}>
                    <div className="w-full max-w-[900px] max-h-[85vh] overflow-auto rounded-[10px] border border-border-card bg-surface p-3 flex flex-col gap-2"
                        onClick={e => e.stopPropagation()}>
                        <div className="flex items-start justify-between gap-2">
                            <div className="text-[12px] font-black leading-snug">
                                📋 저장된 콜 {confirmed.length}건 — 날것 그대로
                                <div className="text-[10.5px] font-bold text-text-muted">
                                    화면의 괄호 다섯 값은 여기서 파생한다 · 시각은 모의 시계 기준
                                </div>
                            </div>
                            <button type="button" onClick={() => setCallsPeek(false)}
                                className="shrink-0 px-2 py-1 rounded-[8px] border border-border-card text-[11px] font-black">닫기</button>
                        </div>
                        {/* 🔴 **날것 그대로 찍는다** (기사님 2026-09-09: *"이런 형식으로 저장하고 있는 거 확실해?"*).
                            보기 좋으라고 이름을 바꿔 찍었더니 «저장 형태»로 읽혔다 — 그러면 팝업이 거짓말이다.
                            동 이름·시:분:초는 **저장된 값이 아니라 파생**이라 여기 안 넣는다. */}
                        <div className="text-[10px] font-black text-text-muted">confirmed — 콜 배열 (그대로)</div>
                        <pre className="text-[10px] leading-snug whitespace-pre-wrap break-all rounded-md border border-border-card bg-background p-1.5 overflow-auto">
{JSON.stringify(confirmed, null, 2)}
                        </pre>
                        {terminated.length > 0 && (<>
                            <div className="text-[10px] font-black text-text-muted">terminated — 취소된 콜 (같은 모양 그대로 남는다)</div>
                            <pre className="text-[10px] leading-snug whitespace-pre-wrap break-all rounded-md border border-border-card bg-background p-1.5 overflow-auto">
{JSON.stringify(terminated, null, 2)}
                            </pre>
                        </>)}
                        <div className="text-[9.5px] text-text-muted leading-snug">
                            시각은 <b>밀리초 숫자</b>로 저장한다(모의 시계 기준) · 동 이름은 좌표에서 그때그때 찾는 값이라 저장하지 않는다 ·
                            <b>steps</b> 는 실물의 <code>step_*</code> 여섯 표와 같은 모양이다 (약속·예상·실측·출처가 한 행에)
                        </div>
                        <div className="text-[9.5px] text-text-muted">null = 아직 못 잰 값. 0 으로 채우지 않는다</div>
                    </div>
                </div>
            )}
            {/* 🔎 카카오 한 건의 전문 — 보낸 값 / 받은 값 (기사님 2026-09-08) */}
            {apiPeek != null && apiLog[apiPeek] && (
                <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4" onClick={() => setApiPeek(null)}>
                    <div className="w-full max-w-[900px] max-h-[85vh] overflow-auto rounded-[10px] border border-border-card bg-surface p-3 flex flex-col gap-2"
                        onClick={e => e.stopPropagation()}>
                        <div className="flex items-start justify-between gap-2">
                            <div className="text-[12px] font-black leading-snug">
                                {apiLog[apiPeek].ok ? '✅' : '❌'} {apiLog[apiPeek].who}
                                <div className="text-[10.5px] font-bold text-text-muted">
                                    {apiLog[apiPeek].path} · {apiLog[apiPeek].ms}ms · {apiLog[apiPeek].t}
                                    {apiLog[apiPeek].tag && ` · ${apiLog[apiPeek].tag}`}
                                </div>
                            </div>
                            <button type="button" onClick={() => setApiPeek(null)}
                                className="shrink-0 px-2 py-1 rounded-[8px] border border-border-card text-[11px] font-black">닫기</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {([['↗ 보낸 값', apiLog[apiPeek].reqJson], ['↙ 받은 값', apiLog[apiPeek].resJson]] as const).map(([t, v]) => (
                                <div key={t} className="flex flex-col gap-1 min-w-0">
                                    <div className="text-[10px] font-black text-text-muted">{t}</div>
                                    <pre className="text-[10px] leading-snug whitespace-pre-wrap break-all rounded-md border border-border-card bg-background p-1.5 max-h-[60vh] overflow-auto">{v}</pre>
                                </div>
                            ))}
                        </div>
                        <div className="text-[9.5px] text-text-muted">좌표 배열은 «점 N개» 로 접었습니다 — 값을 보려고 여는 창이라 폴리라인이 화면을 덮지 않습니다</div>
                    </div>
                </div>
            )}
            {/**
              * 📋 **뽑은 판** — 이 글을 그대로 나에게 주시면 문제 목록에 넣는다.
              * 🔴 화면 밖으로 나가는 유일한 길이라 **글로** 낸다 — 내가 기사님 브라우저를 들여다볼 수는 없다.
              */}
            {captured && (
                <div className="absolute inset-x-0 top-0 z-40 m-3 rounded-xl border border-warning/55 bg-surface shadow-lg p-3 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <b className="text-[12px] text-warning">📋 지금 판을 문제로 — 이 글을 그대로 주세요</b>
                        <button type="button" onClick={() => { navigator.clipboard?.writeText(captured).catch(() => { /* 클립보드 막힘 */ }); }}
                            className="px-2 py-1 rounded-md border border-border-hover bg-background text-[11px] font-black">📋 복사</button>
                        <button type="button" onClick={() => setCaptured(null)}
                            className="ml-auto px-2 py-1 text-[11px] font-black text-text-muted">✕ 닫기</button>
                    </div>
                    <textarea readOnly value={captured} data-captured
                        className="w-full h-[220px] rounded-lg border border-border-card bg-background p-2 text-[10.5px] font-mono leading-snug" />
                </div>
            )}

            {/* ⚙️ 상단 — 설정 모음 (기사님 2026-09-07 «상단은 설정을 모으고») */}
            {/* ⚙️ 상단 — 설정 (필터는 왼쪽 탭으로 — 기사님 2026-09-07) */}
            <header className="shrink-0 border-b border-border-card bg-surface px-3 py-2 flex flex-wrap items-center gap-x-5 gap-y-2">
                <div className="min-w-[150px]">
                    <h1 className="text-[14px] font-black">🗺️ 지도 실험실</h1>
                    <p className="text-[11px] font-bold text-text-muted">
                        🎯 {dst.name} · {localMode ? '🏘️ 관내 자리' : routeStarted ? (driving ? '🚗 주행 중' : '🛣️ 콜을 쥠') : '⏳ 대기'} · 지도 두 번 클릭 = 콜 (▲상차·▼하차)
                    </p>
                </div>
                <button type="button" onClick={() => setClickMode(clickMode === 'me' ? 'call' : 'me')}
                    className={`px-2.5 py-1.5 rounded-[8px] border text-[11.5px] font-black ${clickMode === 'me'
                        ? 'bg-danger/15 border-danger/55 text-danger' : 'border-border-hover bg-background hover:border-danger'}`}>
                    {clickMode === 'me' ? '📍 지도 클릭 → 내 위치…' : '📍 내 위치 찍기'}
                </button>
                {/**
                  * 🧪 **콜 문제 — 상단에 둔다** (기사님 2026-09-10 *"문제 목록을 상단에 넣어 줘"*).
                  *
                  * 🔴 **문제는 화면에 산다.** 검사 스크립트(`pnpm lab`)는 **이 버튼을 누른다** —
                  *    기사님이 누르는 것과 **글자 그대로 같은 것**이 돈다 (규칙 ③: 원천 하나).
                  *    좌표를 스크립트에만 박아 두면 «나만 돌릴 수 있는 것»이 되어 문제가 아니다.
                  * 🔴 상단은 «판을 고르는 자리»다 — 왼쪽은 필터(콜 하나하나의 조건)라 층이 다르다.
                  */}
                <div className="flex flex-col gap-1 min-w-[300px]">
                    <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-[11px] font-black text-info">🧪</span>
                        {LAB_PROBLEMS.map(pr => (
                            <button key={pr.name} type="button" data-problem={pr.name}
                                onClick={() => runProblem(pr)}
                                className={`px-2 py-1 rounded-[7px] border text-[10.5px] font-black ${problemOn?.name === pr.name
                                    ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-background text-text-muted hover:border-info'}`}>
                                {pr.name}
                            </button>
                        ))}
                        {/**
                          * 📋 **지금 판을 문제로** (기사님 2026-09-10: *"내가 찍으면 **그때 걸 기억하고
                          * 넣으라고**"*). 잡아 둔 콜들과 지금 찍어 둔 후보를 **순서 그대로** 뽑는다.
                          * 🔴 내가 좌표를 감으로 고르면 맥락이 없다 — 문제는 **기사님이 실제로 만든 판**이라야 한다.
                          */}
                        <button type="button" data-capture
                            onClick={() => {
                                const calls = [
                                    ...confirmed.map(c => ({ where: `${nearestDong(c.pickup).name} → ${nearestDong(c.drop).name}`,
                                        confirm: true, from: at5(c.pickup), to: at5(c.drop) })),
                                    ...(pickup && drop ? [{ where: `${nearestDong(pickup).name} → ${nearestDong(drop).name}`,
                                        confirm: false, from: at5(pickup), to: at5(drop) }] : []),
                                ];
                                setCaptured(JSON.stringify({
                                    name: '⑤ 기사님 판', why: '(무엇을 보려는 문제인가 — 한 줄로)',
                                    dst: { sido: dstSido, sgg: dstSgg }, calls,
                                }, null, 4));
                            }}
                            className="px-2 py-1 rounded-[7px] border border-warning/55 bg-warning/10 text-warning text-[10.5px] font-black">
                            📋 지금 판을 문제로
                        </button>
                    </div>
                    {/* 🔴 «이 문제가 무엇을 보려는가»를 적는다 — 안 적으면 눌러 놓고 뭘 볼지 모른다 */}
                    <p className="text-[9.5px] text-text-muted leading-snug max-w-[420px]" data-problem-why>
                        {problemOn ? `${problemOn.name} — ${problemOn.why}` : '콜 문제 — 누르면 판이 서고, 콜은 오른쪽 목록에서 한 줄씩 누릅니다'}
                    </p>
                </div>
                <div className="flex items-center gap-1 flex-wrap max-w-[340px]">
                    <span className="text-[11px] font-black text-info">🧅</span>
                    {([['base', '배경'], ['border', '경계'], ['net', '그물'], ['route', '경로'], ['trail', '동선'], ['call', '시험콜']] as const).map(([k, label]) => (
                        <button key={k} type="button" onClick={() => setLayers({ ...layers, [k]: !layers[k] })}
                            className={`px-2 py-1 rounded-[7px] border text-[10.5px] font-black ${layers[k] ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-background text-text-muted'}`}>
                            {layers[k] ? '👁' : '🚫'} {label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-1">
                    <span className="text-[11px] font-black text-info">🚗</span>
                    {effPath.length > 1 ? (
                        <>
                            <button type="button" onClick={() => { if (!driving) { departPosRef.current = { ...myPosRef.current }; setDeparted(true); retarget(); } setDriving(!driving); }}
                                className={`px-2.5 py-1.5 rounded-[8px] border text-[11.5px] font-black ${driving
                                    ? 'bg-success/15 border-success/55 text-success' : 'border-border-hover bg-background hover:border-success'}`}>
                                {driving ? '⏸ 멈춤' : '▶️ 주행'}
                            </button>
                            <span className="px-1.5 py-0.5 rounded-md bg-background border border-border-card text-[10.5px] font-black tabular-nums">
                                🕒 {hhmm(clockNow)}
                                <span className="font-bold text-text-muted"> 모의</span>
                            </span>
                            <button type="button" onClick={() => setSpeedIdx((speedIdx + 1) % SPEEDS.length)}
                                className="px-2 py-1.5 rounded-[8px] border border-border-hover bg-background text-[11.5px] font-black hover:border-info whitespace-nowrap">
                                {SPEEDS[speedIdx].label}
                            </button>
                        </>
                    ) : (
                        <span className="px-2.5 py-1.5 rounded-[8px] border border-border-card bg-background text-[10.5px] text-text-muted font-bold">
                            🅿️ 대기 — 콜 확정 후 주행
                        </span>
                    )}
                    {safeCancelLeft !== null && (
                        <span className={`px-2 py-1 rounded-[8px] border text-[11px] font-black tabular-nums ${safeCancelLeft > 0
                            ? 'border-danger/55 bg-danger/10 text-danger' : 'border-border-hover bg-background text-text-muted'}`}>
                            {safeCancelLeft > 0 ? `⏱️ 안전취소 ${safeCancelLeft}초` : '⏱️ 안전취소 끝 — 결재는 기사님'}
                        </span>
                    )}
                    {pausedForCall && !driving && (
                        <span className="px-2 py-1 rounded-[8px] border border-warning/55 bg-warning/10 text-warning text-[10.5px] font-black">
                            ⏸ 새 콜 — 처리하면 재개
                        </span>
                    )}
                </div>
            </header>

            <div className="flex-1 min-h-0 flex">
                {/* 🗂️ 왼쪽 — 필터 (기사님 2026-09-07 와이어프레임: 필터 → 판정 → 콜 리스트) */}
                <aside className="w-[460px] shrink-0 border-r border-border-card bg-surface p-3 flex flex-col gap-2 overflow-y-auto">
                    {/* 🎯 요약줄 — 실물 규격 그대로 (OrderFilterStatus: «🎯 노선행 · 여기서 10km → 서울 1km · 📦 90/100»).
                        라벨은 shared CALL_TARGET_LABEL, 값은 지금 필터 상태에서 파생 (기사님 2026-09-07) */}
                    <div className="rounded-[8px] border border-border-card bg-background px-2 py-1.5 text-[11px] font-black leading-snug">
                        🎯 {CALL_TARGET_LABEL[callTarget]} · 여기서 {knobs.pickupRadiusKm}km → {goals.map(g => g.name).join(' ∪ ')} {knobs.dropoffRadiusKm}km
                        {' · 📦 '}{slotsUsed}/{TRUCK_CAPACITY_SLOTS}
                    </div>

                    {/* ↩️ 복귀 — «집»을 목적지로 **추가**한다 (⑮ 기준 2: 목적지는 의도다).
                        모드 전환이 아니라 목록에 하나 더 얹는 것 — 기존 목적지도 그대로 살아 있다 */}
                    <div className="flex flex-col gap-1">
                        <p className="text-[10.5px] text-text-muted leading-snug">
                            🎯 목적지 <b className="text-text-primary">{goals.map(g => g.name).join(' · ')}</b> — 마름모 {goals.length}개 ·
                            {' '}운행 <b className="text-text-primary">{dispatchPhaseSim === 'STANDBY' ? '대기' : dispatchPhaseSim === 'GATHERING' ? '콜 쥠' : '주행 중'}</b>
                            {' · '}<b className="text-info">{routeMode ? '🛣️ 노선' : '🔷 동선'}</b>
                        </p>
                    </div>

                    {/* 🔓 **콜을 쥔 뒤에도 노선으로 갈 수 있다** (기사님 지시 2026-09-09 «노선에 락을 풀어 봐»).
                        2026-09-08 에는 잠가 뒀다 — 노선의 띠는 «내 위치 → 목적지» 직행 길 주변이라
                        **이미 잡은 콜들이 만든 실제 경로를 모른다**는 이유였다.
                        🔴 그 사실은 그대로다. 푼 이유는 다르다 — 사각형은 콜을 쥔 뒤에도 그대로 넓어서
                        **이미 잡은 콜과 무관한 콜이 통과한다**(기사님 실측: 탄벌동→고촌읍을 쥔 채 의정부 왕복 콜이 통과).
                        띠로 좁히면 막히는지를 **화면에서 눈으로 확인하려고** 연다.
                        ⚠️ 그러므로 여기서 켜는 띠는 아직 «직행 길 주변»이다 — 이미 잡은 콜을 거치는
                        전체 경로 주변으로 바꾸는 것은 다음 일이다. */}
                    <div className="flex gap-1">
                        <button type="button"
                            onClick={() => { freezeView(); setRouteMode(true); }}
                            className={`flex-1 px-2 py-1.5 rounded-[8px] border text-[12px] font-black ${routeMode
                                ? 'bg-warning/15 border-warning/55 text-warning'
                                : 'border-border-hover bg-background text-text-muted hover:border-warning'}`}>
                            🛣️ 노선
                        </button>
                        <button type="button" onClick={() => { freezeView(); setRouteMode(false); }}
                            className={`flex-1 px-2 py-1.5 rounded-[8px] border text-[12px] font-black ${!routeMode
                                ? 'bg-info/15 border-info/55 text-info' : 'border-border-hover bg-background text-text-muted hover:border-info'}`}>
                            🔷 동선
                        </button>
                    </div>

                    {/**
                      * 🎯 **목적지 — 도 · 시 · 복귀가 한 줄에** (기사님 확정 2026-09-09:
                      * *"선택이 어려우니 도를 선택하고 시를 선택하게 할까?"* ·
                      * *"**복귀도 목적지와 같은 뎁스**니까 목적지 옆에 있는 것이 맞을 것 같아"*).
                      * 복귀는 «어디를 향하나»라는 같은 질문의 다른 답이라 같은 줄에 둔다.
                      */}
                    <div className="relative grid grid-cols-3 gap-1">
                        <PickLayer label="🎯 도" value={dstSido} options={sidoList()}
                            open={openKnob === 'dstSido'} onToggle={() => setOpenKnob(o => o === 'dstSido' ? null : 'dstSido')}
                            onPick={v => { freezeView(); setDstSido(v); setDstSgg(sggList(v)[0]); }} />
                        <PickLayer label="시·군·구" value={dstSgg} options={sggList(dstSido)}
                            open={openKnob === 'dstSgg'} onToggle={() => setOpenKnob(o => o === 'dstSgg' ? null : 'dstSgg')}
                            onPick={v => { freezeView(); setDstSgg(v); }} />
                        {/**
                          * ↩️ **복귀는 토글이다 — 켜졌는지가 한눈에** (기사님 2026-09-09:
                          * *"복귀는 토글로 눈에 띄게 해줘. 목적지 → 복귀"*).
                          * 고르는 값(도·시군구)과 달리 **켜고 끄는 것**이라 모양도 달라야 한다.
                          * 켜면 목적지가 둘이 되고(가는 길에 집 방향 콜도 본다), 복귀콜을 잡으면 집만 남는다.
                          */}
                        <button type="button" onClick={() => { freezeView(); setHomeOn(!homeOn); }}
                            title="켜면 집도 목적지가 된다 — 복귀콜을 잡으면 목적지가 집으로 접힌다"
                            className={`flex flex-col items-start gap-0.5 px-1.5 py-1 rounded-lg border text-left transition-colors ${homeOn
                                ? 'bg-warning/25 border-warning text-warning' : 'border-border-card bg-background hover:border-border-hover'}`}>
                            <span className={`text-[9.5px] font-bold leading-tight ${homeOn ? '' : 'text-text-muted'}`}>↩️ 복귀</span>
                            <span className="flex items-center gap-1">
                                <span className={`w-7 h-4 rounded-full flex items-center px-0.5 transition-colors ${homeOn ? 'bg-warning justify-end' : 'bg-border-card justify-start'}`}>
                                    <span className="w-3 h-3 rounded-full bg-surface shadow" />
                                </span>
                                <span className={`text-[11px] font-black leading-tight ${homeOn ? 'text-warning' : 'text-text-muted'}`}>
                                    {homeOn ? '켬' : '끔'}
                                </span>
                            </span>
                        </button>
                    </div>

                    {/* 🔴 **값은 한 벌이다 — 노선·동선이 같이 쓴다** (기사님 확정 2026-09-09:
                        *"모두 꺼내 두고 노선이면 라인값을 사용하고 동선이면 사용 안 하면 되니까"*).
                        예전엔 탭마다 다른 칸을 보였는데, 그건 «값이 여러 벌»이 아니라
                        «지금 안 쓰는 칸을 감추는 것»이었다 — 감추면 화면이 조용히 거짓말한다. */}
                    <KnobGrid open={openKnob} onOpen={setOpenKnob} knobs={[
                        { key: 'srcAngle', label: '출발각', unit: '°', value: knobs.srcAngleDeg, max: 360, step: 10, set: v => patchKnob({ srcAngleDeg: v }) },
                        { key: 'dstAngle', label: '목적각', unit: '°', value: knobs.dstAngleDeg, max: 360, step: 10, set: v => patchKnob({ dstAngleDeg: v }) },
                        { key: 'quadR', label: '마름모반경', unit: 'km', value: knobs.quadRadiusKm, max: 200, set: v => patchKnob({ quadRadiusKm: v }) },
                        { key: 'pickupR', label: '현위반경', unit: 'km', value: knobs.pickupRadiusKm, max: 100, set: v => patchKnob({ pickupRadiusKm: v }) },
                        { key: 'dropR', label: '목적반경', unit: 'km', value: knobs.dropoffRadiusKm, max: 100, set: v => patchKnob({ dropoffRadiusKm: v }) },
                        // 📏 라인 반경 — 노선일 때만 쓰인다. 감추지 않고 흐리게 둔다
                        { key: 'lineR', label: '라인반경', unit: 'km', value: lineRadiusKm, max: 50, set: setLineRadiusKm, dim: !routeMode },
                    ]} />
                    {/* 🔴 설명 줄을 둘 지웠다 (기사님 2026-09-09: *"이건 무슨 뜻이야 불필요한 거 같은데"* ·
                        *"«콜을 잡으면 그 경로가 라인이 됩니다» 이것도 필요 없어"*).
                        **늘 참인 말은 화면에 안 적는다** — 콜을 안 잡았으면 마름모인 건 당연하고, 동 수는
                        아래 「콜 필터」 제목이 이미 말한다. 남긴 하나는 **이상한 상태**다:
                        콜은 잡았는데 경로가 아직 안 와서 마름모인 것 — 그건 몰라선 안 된다. */}
                    {routeMode && !lineOn && confirmed.length > 0 ? (
                        <p className="text-[10.5px] text-warning font-bold leading-snug">
                            ⏳ 카카오 경로를 기다립니다 — 올 때까지는 마름모로 봅니다 (직선으로 지어내지 않습니다)
                        </p>
                    ) : null}

                    {/**
                      * 💰🚚🚫 **셋도 같은 3칸 레이어로** (기사님 2026-09-09: *"이 부분도 디자인에 맞춰
                      * 이쁘게 바꿔줘"*). 위의 목적지·값들과 **같은 자리·같은 방식**이라야 조작이 하나다.
                      *
                      * · 콜할인율   하나를 고른다. 차종별 단가표는 그 레이어 **안에** 딸려 온다
                      * · 받을 짐 차종 · 제외 단어   **여럿**을 고른다 — 고른 뒤에도 레이어가 안 닫힌다
                      */}
                    <div className="relative grid grid-cols-3 gap-1">
                        <PickLayer label="💰 콜할인율" value={knobs.discountPct === 0 ? '시세' : `-${knobs.discountPct}%`}
                            options={['시세', '-10%', '-20%', '-30%']}
                            open={openKnob === 'discount'} onToggle={() => setOpenKnob(o => o === 'discount' ? null : 'discount')}
                            onPick={v => patchKnob({ discountPct: v === '시세' ? 0 : Number(v.replace(/[-%]/g, '')) })}
                            foot={
                                <div className="flex flex-col gap-0.5 text-[10px] tabular-nums">
                                    <span className="text-[9.5px] font-bold text-text-muted">차종별 하한 — 콜을 찍으면 이 단가로 요금을 미리 채웁니다</span>
                                    {Object.entries(NET_RATE_PER_KM).map(([v, net_]) => (
                                        <div key={v} className="flex justify-between gap-1">
                                            <span><b>{v}</b> <span className="text-text-muted">시세 {net_} · 짐 {VEHICLE_CAPACITY[v] ?? '?'}박스</span></span>
                                            <b className="text-info">≥ {rateFloorsFrom(knobs.discountPct)[v]}원/km</b>
                                        </div>
                                    ))}
                                </div>} />
                        <PickLayer label="🚚 받을 짐" value={vehicles.length ? vehicles.map(v => VEHICLE_SHORT[v] ?? v).join('·') : '모두'}
                            options={['오토바이', '승용차', '다마스', '라보', '1t']} keepOpen selected={vehicles}
                            open={openKnob === 'vehicles'} onToggle={() => setOpenKnob(o => o === 'vehicles' ? null : 'vehicles')}
                            onPick={v => setVehicles(x => x.includes(v) ? x.filter(o => o !== v) : [...x, v])} />
                        <PickLayer label="🚫 제외 단어" value={excludedWords.length ? `${excludedWords.length}개` : '없음'}
                            options={['착불', '수거', '까대기', '직접운반', '왕복', '대기']} keepOpen selected={excludedWords} tone="warning"
                            open={openKnob === 'words'} onToggle={() => setOpenKnob(o => o === 'words' ? null : 'words')}
                            onPick={v => setExcludedWords(x => x.includes(v) ? x.filter(o => o !== v) : [...x, v])} />
                    </div>

                    {/**
                      * ⛔ **제외지역 — 도 · 시·군·구 · 읍·면·동** (기사님 확정 2026-09-09 · 「3단」).
                      * **노선·동선 공통**이다 («공통으로 빼»). 위의 목적지 줄과 **같은 3칸**이라 조작이 하나다.
                      *
                      * 🔴 전에는 `<select>` 팝업이었고 **지금 그물에 든 동만** 목록에 떴다 —
                      *    그물이 강화군에 닿기 전에는 강화군을 뺄 수가 없었다. 이제 **전국에서** 고른다.
                      * 🔴 제외는 **두 층**이다: 강화군은 군 통째(`R|`), 남양주는 수동면 하나(`D|`).
                      *    그래서 «통째»는 시·군·구 칸 안에, «하나»는 읍·면·동 칸에 둔다.
                      * 🔴 시·군·구 칸의 버튼은 **고르기만** 한다 — 한 버튼이 «고르기»와 «제외»를 겸하면
                      *    누를 때마다 무슨 일이 날지 모른다. 통째 제외는 그 아래 **따로 난 버튼**이다.
                      */}
                    <div className="mt-1 border-t border-border-card pt-2 flex flex-col gap-1">
                        <div className="relative grid grid-cols-3 gap-1">
                            {/**
                              * 🔴 **도 한 층이 없었다** (기사님 2026-09-09: *"원래 내가 원한 건 **서울을 빼는**
                              * 거였는데.. 지금 서울을 빼고 있는데"* — 구 **25개**를 하나씩 누르고 계셨다).
                              *
                              * 도 칸은 **고르기**가 본업이라(도를 옮겨 다니는 일이 잦다) 누르면 그냥 옮겨 가고,
                              * 통째 제외는 **아래 따로 난 버튼**이다. 실수로 경기도가 통째로 빠지면 안 된다.
                              */}
                            <PickLayer label="⛔ 제외 도" options={sidoList()}
                                value={`${exSido}${exDraft.includes(`S|${exSido}`) ? ' ⛔' : ''}`}
                                tone="danger" selected={sidoList().filter(v => exDraft.includes(`S|${v}`))}
                                open={openKnob === 'exSido'} onToggle={() => setOpenKnob(o => o === 'exSido' ? null : 'exSido')}
                                onPick={v => { setExSido(v); setExSgg(null); }}
                                foot={
                                    <button type="button"
                                        onClick={() => setExDraft(x => x.includes(`S|${exSido}`) ? x.filter(k => k !== `S|${exSido}`) : [...x, `S|${exSido}`])}
                                        className={`w-full px-2 py-1.5 rounded-md border text-[11px] font-black ${exDraft.includes(`S|${exSido}`)
                                            ? 'bg-danger/15 border-danger/55 text-danger' : 'border-border-card bg-background text-text-muted hover:border-danger'}`}>
                                        ◼ {exSido} 통째로 제외 {exDraft.includes(`S|${exSido}`) ? '⛔ 켬' : '끔'}
                                    </button>} />
                            {/**
                              * 🔴 **여기서는 여럿을 찍는다** (기사님 2026-09-09:
                              * *"시·군·구 모두 선택하고 싶은데 선택하면 레이어가 닫혀"*).
                              * 전에는 «고르기»만 하고 통째 제외는 아래 버튼이었다 — 두 번 눌러야 한 곳이
                              * 빠졌고, 한 곳 찍을 때마다 레이어가 닫혔다.
                              *
                              * 이제 **누르면 그 시·군·구가 통째로 빠진다**(다시 누르면 되살아난다).
                              * 그리고 **마지막에 누른 곳이 읍·면·동 칸의 대상**이 된다 — 수동면 하나만 빼려면
                              * 남양주시를 두 번 눌러(켰다 껐다) 대상으로 삼은 뒤 옆 칸에서 고른다.
                              */}
                            <PickLayer label="시·군·구 ⛔ 통째" keepOpen tone="danger"
                                value={(() => { const n = sggList(exSido).filter(g => exDraft.includes(`R|${g}`)).length; return n ? `${n}곳 제외` : (exSgg ?? '고르기'); })()}
                                options={sggList(exSido)}
                                selected={sggList(exSido).filter(g => exDraft.includes(`R|${g}`))}
                                open={openKnob === 'exSgg'} onToggle={() => setOpenKnob(o => o === 'exSgg' ? null : 'exSgg')}
                                onPick={v => {
                                    setExSgg(v);                       // 읍·면·동 칸이 볼 곳
                                    setExDraft(x => x.includes(`R|${v}`) ? x.filter(k => k !== `R|${v}`) : [...x, `R|${v}`]);
                                }}
                                foot={<span className="text-[9.5px] font-bold text-text-muted leading-snug">
                                    누르면 <b className="text-danger">그 시·군·구가 통째로</b> 빠집니다 · 다시 누르면 되살아납니다 ·
                                    마지막에 누른 곳이 <b>읍·면·동 칸</b>의 대상이 됩니다
                                </span>} />
                            <PickLayer label="읍·면·동"
                                value={exSgg ? (() => { const n = dongList(exSgg).filter(d => exDraft.includes(`D|${exSgg}|${d}`)).length; return n ? `${n}개 제외` : '전부 봄'; })() : '—'}
                                tone="danger" keepOpen options={exSgg ? dongList(exSgg) : []}
                                selected={exSgg ? dongList(exSgg).filter(d => exDraft.includes(`D|${exSgg}|${d}`)) : []}
                                open={openKnob === 'exDong'} onToggle={() => setOpenKnob(o => o === 'exDong' ? null : 'exDong')}
                                onPick={v => { if (!exSgg) return; const key = `D|${exSgg}|${v}`; setExDraft(x => x.includes(key) ? x.filter(k => k !== key) : [...x, key]); }}
                                foot={!exSgg ? <span className="text-[9.5px] font-bold text-text-muted">시·군·구를 먼저 고르세요</span> : null} />
                        </div>
                        {/**
                          * 🔴 «지금 무엇이 빠져 있나»는 **늘 보인다** — 레이어를 열어야 알면 화면이 조용히 거짓말한다.
                          * 다만 여덟 줄을 늘 펴 두면 폰에서 필터가 화면을 다 먹는다. 그래서
                          * **닫히면 한 줄, 누르면 전부**다 (기사님 2026-09-09 *"결과물을 첫 줄만 보여 주고 클릭하면 다"*).
                          * 🔴 **닫힌 줄에서는 지우지 못한다** — 잘린 글을 누르다 실수로 되살아나면 안 된다.
                          *    펼쳐야 ✕ 가 달린 칩이 된다.
                          */}
                        {/* 🔴 **다 지웠어도 줄은 남는다** — 안 그러면 「💾 저장」이 같이 사라져
                            «전부 되살리기»를 적용할 길이 없다 */}
                        {(exDraft.length > 0 || exDirty) && (exListOpen ? (
                            <div className="flex flex-col gap-1">
                                <div className="flex flex-wrap gap-1">
                                    {exDraft.length === 0 && <span className="text-[10.5px] font-bold text-text-muted">제외한 곳이 없습니다 — 저장하면 전국이 그물에 듭니다</span>}
                                    {exDraft.map(k => (
                                        <button key={k} type="button" onClick={() => setExDraft(x => x.filter(v => v !== k))}
                                            title="누르면 되살립니다"
                                            className="px-1.5 py-0.5 rounded-md bg-danger/15 text-danger text-[10.5px] font-black">
                                            ⛔ {excludedLabel(k)} ✕
                                        </button>
                                    ))}
                                </div>
                                {/**
                                  * 💾 **접기 옆에 저장** (기사님 2026-09-09 그대로).
                                  * 고친 것은 **여기를 눌러야** 그물에 들어간다 — 칩 하나 잘못 눌러
                                  * 그 지역이 곧장 살아나던 것을 막는다. 「되돌리기」는 저장 전으로 돌린다.
                                  */}
                                <div className="flex items-center gap-1">
                                    <button type="button" onClick={() => setExListOpen(false)}
                                        className="text-[10px] font-black text-text-muted px-1">▴ 접기</button>
                                    <button type="button" disabled={!exDirty} onClick={() => setExcluded(exDraft)}
                                        className={`px-2 py-1 rounded-md border text-[11px] font-black ${exDirty
                                            ? 'bg-info/15 border-info/55 text-info' : 'border-border-card bg-background text-text-muted opacity-50'}`}>
                                        💾 저장{exDirty ? ` (${exDraft.length}곳)` : ' 완료'}
                                    </button>
                                    {exDirty && (
                                        <button type="button" onClick={() => setExDraft(excluded)}
                                            className="px-2 py-1 rounded-md border border-border-card bg-background text-[11px] font-black text-text-muted">
                                            ↩︎ 되돌리기
                                        </button>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1">
                                <button type="button" onClick={() => setExListOpen(true)}
                                    className={`flex items-center gap-1 min-w-0 flex-1 px-1.5 py-1 rounded-md border bg-background text-left ${
                                        exDirty ? 'border-warning/55' : 'border-border-card hover:border-danger'}`}>
                                    <span className="shrink-0 text-[10.5px] font-black text-danger">⛔ 제외 {exDraft.length}곳</span>
                                    <span className="min-w-0 flex-1 truncate text-[10.5px] font-bold text-text-muted">
                                        {exDraft.map(excludedLabel).join(' · ')}
                                    </span>
                                    <span className="shrink-0 text-[10px] font-black text-text-muted">▾ 전부</span>
                                </button>
                                {/* 🔴 닫아 둔 채로 고쳤어도 «아직 안 들어갔다»가 보여야 한다 — 여기서 바로 저장한다 */}
                                {exDirty && (
                                    <button type="button" onClick={() => setExcluded(exDraft)}
                                        className="shrink-0 px-2 py-1 rounded-md border border-info/55 bg-info/15 text-info text-[11px] font-black">
                                        💾 저장
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* 🧪 판정 — 필터와 콜 리스트 사이 (기사님 2026-09-07 와이어프레임 확정) */}
                    {/* 🔴 두 층은 완전히 격리되어 각각 따로 작동한다 (규칙: 필터=집기 전 · 심사=집은 뒤).
                        기사님 2026-09-08: *"판정영역을 상하로 나눠서 상은 필터가 하는 일, 하는 심사가 하는 일"* */}
                    {/**
                      * 🔴 **제목의 수는 «앱에 실릴 동 수»여야 한다** (2026-09-10 화면 실측).
                      *    화면은 «그물 352동»인데 아웃풋은 «dongs 351» 이었다 — 한 곳 차이의 정체는
                      *    **콕 집어 뺀 읍·면·동**(남한산성면)이다. 그물에는 남겨서 ⛔ 로 그리지만
                      *    **필터에는 안 실린다.** 제목이 그걸 안 빼면 화면이 조용히 거짓말한다.
                      */}
                    <FilterPanel tone="filter" title={`🔍 ① 콜 필터 — 집기 전 · 앱이 하는 일 · 그물 ${netCount}동${dongOut ? ` · ⛔${dongOut}` : ''}${lineOn ? ' · 라인' : ''}`}>
                        {/* 🔴 «관내 모드인가»가 아니라 **«관내 규칙으로 쟀는가»** 를 읽는다 (기사님 지적 2026-09-09).
                            관내 규칙은 그 목적지가 고른 목적지일 때만 돈다 — 복귀로 접히면 안 돈다.
                            모드만 보고 배지를 띄웠더니 화면이 «둘 다 원 안만»이라 적으면서
                            실제로는 라인·마름모로 재고 있었다. */}
                        {verdict?.local && (
                            <div className="px-2 py-1 rounded-lg bg-info/15 text-info text-[11px] font-black">
                                🏘️ 관내 — 방향 안 봄, 둘 다 원 안만
                            </div>
                        )}
                        {localMode && !verdict?.local && (
                            <div className="px-2 py-1 rounded-lg bg-warning/15 text-warning text-[10.5px] font-black leading-snug">
                                🏘️ 관내 자리에 있지만 <b>지금 목적지는 관내가 아닙니다</b> — 라인·마름모로 잽니다
                            </div>
                        )}
                        {!verdict && <p className="text-[10.5px] text-text-muted leading-snug">지도 두 번 클릭으로 콜을 만들면 여기 판정 — 1단계(영역) 뒤 2단계(거리)</p>}
                        {verdict && (
                            <div className="flex flex-col gap-1">
                                <div className="text-[11px]">▲ <b>{verdict.pickupDong.region} {verdict.pickupDong.name}</b> → ▼ <b>{verdict.dropDong.region} {verdict.dropDong.name}</b></div>
                                {/* 찍은 좌표 — 화면만 보고 그대로 재현·검산할 수 있게 (기사님 제안 2026-09-08) */}
                                {pickup && drop && (
                                    <div className="text-[9.5px] font-mono text-text-muted tabular-nums leading-tight">
                                        ▲{pickup.lng.toFixed(5)},{pickup.lat.toFixed(5)} ▼{drop.lng.toFixed(5)},{drop.lat.toFixed(5)} 📍{myPos.lng.toFixed(5)},{myPos.lat.toFixed(5)}
                                    </div>
                                )}
                                <span className={`self-start px-2 py-0.5 rounded-lg text-[12px] font-black ${finalPass ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'}`}>
                                    {finalPass ? '✅ 올린다 (필터 통과)' : exclusionHit ? '⛔ 제외지역 — 안 올린다' : '❌ 안 올린다'}
                                </span>
                                {goalsVerdict && goalsVerdict.results.length > 1 && (
                                    <div className="flex gap-1 flex-wrap items-center">
                                        {goalsVerdict.results.map(r => (
                                            <Chip key={r.goal.name} ok={r.verdict.pass} yes={`${r.goal.name} 안`} no={`${r.goal.name} 밖`} />
                                        ))}
                                        {goalsVerdict.wonGoal && (
                                            <span className="px-2 py-0.5 rounded-md text-[11px] font-black bg-warning/15 text-warning">
                                                판 {goalsVerdict.wonGoal.name}
                                            </span>
                                        )}
                                    </div>
                                )}
                                {exclusionHit && (
                                    <div className="text-[10.5px] text-danger font-bold leading-snug">
                                        ⛔ {exclusionHit} — 제외한 동입니다. 필터에 안 실려 실전에선 이 콜이 안 올라옵니다.
                                    </div>
                                )}
                                <div className="text-[10px] font-black text-text-muted">1단계 · 영역</div>
                                {verdict.local ? (
                                    <div className="flex gap-1 flex-wrap">
                                        <Chip ok={verdict.pickupNearMe} yes="상차 원 안" no="상차 원 밖" />
                                        <Chip ok={verdict.dropInNet} yes="하차 원 안" no="하차 원 밖" />
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex gap-1 flex-wrap">
                                            <Chip ok={verdict.dropInNet} yes="하차 그물 안" no="하차 그물 밖" />
                                            <Chip ok={verdict.pickupNearMe} yes="상차 반경 안" no="상차 반경 밖" />
                                            {/* 🔴 «모드»가 아니라 판정이 말한 «무엇으로 쟀나»(byLine)를 읽는다 (2026-09-09) */}
                                            {isLoaded(goalsVerdict?.wonGoal?.name ?? dst.name) &&
                                                <Chip ok={verdict.pickupInNet} yes={verdict.byLine ? '상차 라인 안' : '상차 마름모 안'} no={verdict.byLine ? '상차 라인 밖' : '상차 마름모 밖(뒤)'} />}
                                        </div>
                                        <div className="text-[10px] font-black text-text-muted">2단계 · 거리(방향)</div>
                                        <div className="font-black tabular-nums text-[12.5px]">{verdict.distPickKm} : {verdict.distDropKm} : {verdict.distMeKm}
                                            <span className="text-[10px] text-text-muted font-bold"> (상차:하차:현위치→목적지)</span></div>
                                        <div className="flex gap-1 flex-wrap">
                                            <Chip ok={!verdict.dropBackward} yes="하차 전진" no="하차 역주행" />
                                            <Chip ok={!verdict.pickupBackward} yes="상차 앞" no="상차 역주행" />
                                        </div>
                                    </>
                                )}
                                {/* 🪜 스텝 1 — 앱이 «올린다». 이걸 눌러야 서버(심사)가 깨어난다 (실물 그대로) */}
                                {/**
                                  * 🔴 **탈락 버튼이 없었다** (기사님 2026-09-10: *"필터에서 통과 버튼만 있어.
                                  * **탈락 버튼도 하나** 만들고"*). 올릴 수만 있고 **버릴 수가 없어서**,
                                  * 안 올릴 콜을 지우려면 지도를 다시 두 번 눌러야 했다.
                                  * 앱이 하는 일은 «올린다»와 «안 올린다» 둘이다 — 화면도 둘이라야 한다.
                                  */}
                                {!uploaded ? (
                                    <div className="flex gap-1.5 flex-wrap">
                                        <button type="button"
                                            onClick={uploadCall}
                                            className={`px-2.5 py-1.5 rounded-[8px] border text-[11.5px] font-black ${finalPass
                                                ? 'border-info/55 bg-info/15 text-info' : 'border-warning/55 bg-warning/10 text-warning'}`}>
                                            {finalPass ? '⬆️ 필터 통과 — 서버로 올린다' : '⚠️ 탈락인데 올려 보기'}
                                        </button>
                                        <button type="button"
                                            onClick={() => { pushLog('버림'); setPickup(null); setDrop(null); setUploaded(false); resumeAfterCall(); }}
                                            className="px-2.5 py-1.5 rounded-[8px] border border-danger/55 bg-danger/10 text-danger text-[11.5px] font-black">
                                            ❌ 탈락 — 안 올린다
                                        </button>
                                    </div>
                                ) : (
                                    <span className="self-start px-2 py-0.5 rounded-md text-[11px] font-black bg-info/15 text-info">
                                        ⬆️ 올렸다 — 서버가 심사 중
                                    </span>
                                )}
                            </div>
                        )}
                    </FilterPanel>

                    <div className="flex items-center gap-1.5 my-0.5">
                        <span className="flex-1 h-px bg-border-card" />
                        <span className="text-[9.5px] font-black text-text-muted">🔒 두 층은 서로 남남 — 따로 작동합니다</span>
                        <span className="flex-1 h-px bg-border-card" />
                    </div>

                    {/* ⚖️ ② 심사 — 집은 뒤 (서버). 필터와 **완전히 격리**되어 따로 작동한다.
                        실물은 안전취소 30초 안에 색(🔵🟢🟡🔴)을 낸다 — 여기는 그 재료를 보여준다 */}
                    <FilterPanel tone="judge" title={`⚖️ ② 심사 — 집은 뒤 · 서버가 하는 일${safeCancelLeft !== null ? ` · ⏱️ ${safeCancelLeft}초` : ''}`}>
                        {!verdict && <p className="text-[10.5px] text-text-muted leading-snug">콜을 집으면 여기서 심사 — 판정 기준 다섯이 색을 낸다</p>}
                        {verdict && !uploaded && (
                            <p className="text-[10.5px] text-text-muted leading-snug">
                                🔒 아직 안 올라온 콜입니다 — 위에서 <b>필터 통과</b>를 눌러야 서버가 봅니다
                            </p>
                        )}
                        {verdict && uploaded && (
                            <div className="flex flex-col gap-1">

                                {/* ══ ① 후보콜에 대한 보유정보 — 지금 아는 것을 다 편다 ══ */}
                                <div className="text-[10px] font-black text-info">① 후보콜에 대한 보유정보</div>
                                <div className="rounded-[8px] border border-border-card bg-background px-2 py-1 text-[10.5px] leading-snug">
                                    <div className="font-black text-[11px]">
                                        {circled(baseCallCount + confirmed.length + 1)} 심사 중 —{' '}
                                        {verdict.pickupDong.region} {verdict.pickupDong.name} → {verdict.dropDong.region} {verdict.dropDong.name}
                                    </div>
                                    <div className="text-text-muted tabular-nums">
                                        판 <b className="text-text-primary">{goalsVerdict?.wonGoal?.name ?? dst.name}</b>
                                        {' · '}<b className="text-text-primary">{routeMode ? '노선' : '동선'}</b>
                                        {uploadedInfoRef.current?.distKm != null && <>
                                            {' · 이 콜만 '}<b className="text-text-primary">{uploadedInfoRef.current.distKm}km · {uploadedInfoRef.current.durMin ?? '?'}분</b>
                                            {uploadedInfoRef.current.tollWon != null && ` · 톨 ${uploadedInfoRef.current.tollWon.toLocaleString()}원`}
                                        </>}
                                    </div>
                                    {/* 🔴 «목적지까지 3거리»와 «전진/역주행»은 지웠다 — 바로 위 ① 콜 필터가
                                        같은 숫자와 「하차 전진 / 상차 앞」 칩으로 **이미** 말한다 (기사님 2026-09-10:
                                        *"심사 부분이 너무 높이가 높아, 불필요한 것은 지우고"*). 두 번 적으면 그만큼
                                        아래가 밀려 정작 봐야 할 색과 영향이 화면 밖으로 나간다. */}
                                    {approachInfo && (
                                        <div className="tabular-nums">
                                            🚚 상차지까지 <b className="text-info">{approachInfo.distKm}km · {approachInfo.durMin ?? '?'}분</b>
                                            {approachInfo.failed && <b className="text-danger"> (못 쟀다 — 도로 탐색 불가)</b>}
                                            {approachInfo.durMin != null && (
                                                <> → 도착 <b className="text-info">{hhmm(clockNow + approachInfo.durMin * 60000)}</b>
                                                <span className="text-text-muted"> (지금 출발 기준 · 통화로 확정)</span></>
                                            )}
                                        </div>
                                    )}
                                </div>
                                {/* 어디서 받아온 값인가 — 누르면 보낸 값·받은 값 전문 */}
                                {/**
                                  * 🛰️ **접어 둔다** — 이건 «어디서 받아온 값인가»를 캘 때만 보는 것이고,
                                  * **실험실 전용**이라 실물 심사창에는 안 간다 (이식 계획 §5).
                                  * 콜 하나에 서너 건이 세 줄씩 펴져 심사창을 밀어내고 있었다.
                                  */}
                                {uploadTag && apiLog.some(l => l.tag === uploadTag) && (
                                    <div className="flex flex-col gap-0.5">
                                        <button type="button" onClick={() => setJudgeLogOpen(o => !o)}
                                            className="self-start text-[10px] font-black text-text-muted">
                                            🛰️ 카카오 호출 {apiLog.filter(l => l.tag === uploadTag).length}건 {judgeLogOpen ? '▴' : '▾'}
                                            {apiLog.some(l => l.tag === uploadTag && !l.ok) && <b className="text-danger"> · 실패 있음</b>}
                                        </button>
                                        {judgeLogOpen && apiLog.map((l, i) => ({ l, i })).filter(({ l }) => l.tag === uploadTag).map(({ l, i }) => (
                                            <button key={i} type="button" onClick={() => setApiPeek(i)}
                                                className={`text-left rounded-md border px-1.5 py-1 text-[10px] leading-snug ${l.ok ? 'border-border-card' : 'border-danger/55 bg-danger/10'}`}>
                                                <div className="font-black">🛰️ {l.ok ? '✅' : '❌'} {l.who} <span className="font-bold text-text-muted">{l.path} · {l.ms}ms · {l.t}</span></div>
                                                <div className="text-text-muted">↗ {l.req}</div>
                                                <div className="text-text-muted">↙ {l.res}</div>
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* ══ ② 후보콜 판정 ══
                                    🔴 **요금·짐 입력은 여기 없다** (기사님 2026-09-09: *"심사창은 나중에 프로젝트에
                                    넣을 수도 있을 것 같아서 거기에 불필요한 것은 없으면 좋겠는데"*).
                                    실제 콜은 배차망이 그 값을 주므로 **실물 심사창에는 입력이 없다** —
                                    실험실에서만 필요한 것이라 지도 위 입력창으로 옮겼다. */}
                                <div className="text-[10px] font-black text-info border-t border-border-card pt-1">② 후보콜 판정</div>
                                {/* 🎨 색 — 기사님이 1~2초에 보는 것 (규칙 ⑤-3). 숫자는 그다음이다 */}
                                {candJudge && (() => {
                                    const r = candJudge.result;
                                    const tone = r.color === '꿀' ? 'bg-info/20 text-info border-info/50'
                                        : r.color === '보통' ? 'bg-success/20 text-success border-success/50'
                                        : r.color === '똥' ? 'bg-warning/20 text-warning border-warning/50'
                                        : 'bg-danger/20 text-danger border-danger/50';
                                    const face = r.color === '꿀' ? '🔵' : r.color === '보통' ? '🟢' : r.color === '똥' ? '🟡' : '🔴';
                                    return (
                                        <div className="flex flex-col gap-1">
                                            <div className={`self-start px-2.5 py-1 rounded-lg border text-[14px] font-black ${tone}`}>
                                                {face} {r.color}{r.score != null && <span className="text-[11px] font-bold"> · {r.score}점</span>}
                                            </div>
                                            <div className="flex flex-col gap-0.5 text-[10px] tabular-nums">
                                                {r.criteria.map(c => (
                                                    <div key={c.key} className="flex gap-1">
                                                        <span className="w-[52px] font-black">{c.name}</span>
                                                        <span className={`w-[42px] font-black ${c.outcome.kind === 'scored' ? '' : 'text-text-muted'}`}>
                                                            {c.outcome.kind === 'scored' ? `${Math.round(c.outcome.score)}점` : c.weight === 0 ? '안 봄' : '못 잼'}
                                                        </span>
                                                        <span className="flex-1 text-text-muted leading-snug">{c.outcome.why}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            {candJudge.driveMin != null && (
                                                <div className="text-[9.5px] text-text-muted leading-snug">
                                                    더 쓰는 시간 <b className="text-text-primary">{candJudge.driveMin + labDwellOf('상차') + labDwellOf('하차')}분</b>
                                                    {confirmed.length > 0
                                                        ? ` = 전체 경로 ${chainBefore?.totalMin ?? '--'}분 → ${chainNow?.totalMin ?? '--'}분 + 정차`
                                                        : ` = 이 콜 주행 ${candJudge.driveMin}분 + 정차`}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}

                                {/* ══ ③ 후보콜이 미치는 영향 — 콜 하나가 한 덩어리 (좌우 비교 폐기) ══ */}
                                <div className="text-[10px] font-black text-info border-t border-border-card pt-1">③ 후보콜이 미치는 영향</div>
                                {callImpacts.length === 0
                                    ? <div className="text-[10px] text-text-muted">아직 전체 경로를 못 받았다</div>
                                    : <div className="flex flex-col gap-1">
                                        {callImpacts.map(ci => (
                                            <div key={ci.no} className={`rounded-md border p-1.5 text-[10px] tabular-nums flex flex-col gap-0.5 ${ci.isNew ? 'border-info/50 bg-info/[0.06]' : 'border-border-card'}`}>
                                                <div className="font-black text-[10.5px]">
                                                    {ci.disp} {ci.isNew ? '이 후보콜' : ci.no === '①' ? '첫짐' : `합짐${Number(ci.no.charCodeAt(0) - 0x2460)}`}
                                                    <span className="font-bold text-text-muted"> · {ci.where}</span>
                                                </div>
                                                {ci.stops.map(st => {
                                                    // 실제로 지났으면 그것이 답, 아직이면 전체 경로가 말하는 예상
                                                    const real = st.passedAt ?? st.etaAt;
                                                    const late = real != null && st.promisedAt != null
                                                        ? Math.round((real - st.promisedAt) / 60000) : null;
                                                    return (
                                                        <div key={st.kind} className="flex flex-col">
                                                            {/**
                                                              * 🔴 **정거장 하나에 한 줄** (기사님 2026-09-10 *"심사 부분이 너무 높이가 높아"*).
                                                              * 전에는 「구간 from → to · km · 분」이 윗줄로 따로 있었다 — 콜 셋이면 그것만
                                                              * 여섯 줄이다. `from` 은 **바로 윗 정거장**이라 안 적어도 알고,
                                                              * km·분은 도착 줄 옆에 붙였다. **값이 없어도 «--» 로 남긴다** — 비교해야 하니까.
                                                              */}
                                                            <div className="flex justify-between gap-1 font-bold">
                                                                <span>{st.kind} 도착
                                                                    <span className="font-normal text-text-muted"> {st.leg?.distKm ?? '--'}km·{st.leg?.durMin ?? '--'}분</span>
                                                                    {st.fromSaved && <span className="font-normal text-text-muted text-[9px]"> (저장)</span>}
                                                                </span>
                                                                <span>
                                                                    <span className="text-text-muted">{st.promisedAt != null ? hhmm(st.promisedAt) : '--:--'} → </span>
                                                                    <b className={late != null && late > 0 ? 'text-warning' : 'text-success'}>
                                                                        {real != null ? hhmm(real) : '--:--'}</b>
                                                                    {st.passedAt != null && <span className="text-success text-[9px]"> 통과</span>}
                                                                    {late != null && (late > 0
                                                                        ? <b className="text-warning"> ({late}분 늦어짐)</b>
                                                                        : late < 0 ? <b className="text-success"> ({-late}분 빨라짐)</b>
                                                                        : <span className="text-text-muted"> (그대로)</span>)}
                                                                </span>
                                                            </div>
                                                            {/**
                                                              * 🧾 **왜 밀렸나 — 그 자리에서 쪼갠다** (기사님 2026-09-09: *"심사 시 보면 좋을 것 같아"*).
                                                              * 쌓아 둔 내역 + 이 후보콜이 더 밀 분 + 나머지(경로 이탈·교통). **합이 총 지연과 맞는다.**
                                                              */}
                                                            {(() => {
                                                                if (late == null || (late === 0 && !st.impacts.length)) return null;
                                                                /**
                                                                 * 🔴 후보의 원인도 **정거장 이름**으로 적는다 — 확정 뒤 쌓이는 줄과 같은 형식이어야
                                                                 * «어느 정거장이 앞에 껴서 밀었나»가 보인다 (기사님 2026-09-09).
                                                                 */
                                                                const row = stopImpacts.find(r => r.stop === st.label);
                                                                const candNo = circled(confirmed.length + 1);
                                                                const candStops = pickup && drop ? [
                                                                    { label: `${candNo}상차`, name: `${nearestDong(pickup).name} 상차` },
                                                                    { label: `${candNo}하차`, name: `${nearestDong(drop).name} 하차` },
                                                                ] : [];
                                                                const hit = row && candStops.length ? impactOfStop({
                                                                    stopLabel: st.label, beforeAt: row.beforeAt, afterAt: row.nowAt,
                                                                    orderNow: (chainNow?.legs ?? []).map(l => l.to),
                                                                    inserted: candStops, causeCallId: -1, at: 0,
                                                                }) : null;
                                                                const cand = hit ? { name: `${hit.causeLabel} 경유 (이 후보콜)`, min: hit.min } : null;
                                                                const known = st.impacts.reduce((t, x) => t + x.min, 0) + (cand?.min ?? 0);
                                                                const rest = late - known;
                                                                const rows = [
                                                                    ...st.impacts.map(x => ({ name: x.causeLabel, min: x.min })),
                                                                    ...(cand ? [cand] : []),
                                                                    ...(rest !== 0 ? [{ name: '나머지 (경로 이탈·교통)', min: rest }] : []),
                                                                ];
                                                                if (!rows.length) return null;
                                                                return (
                                                                    <div className="pl-2 flex flex-col text-[9.5px] text-text-muted">
                                                                        {rows.map((r, k) => (
                                                                            <div key={k} className="flex justify-between gap-1">
                                                                                <span>· {r.name}</span>
                                                                                <span className={r.min > 0 ? 'text-warning' : 'text-success'}>
                                                                                    {r.min > 0 ? '+' : ''}{r.min}분
                                                                                </span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ))}
                                        <div className="flex justify-between gap-1 text-[10px] font-black tabular-nums border-t border-border-card pt-1">
                                            <span>전체</span>
                                            <span>
                                                <span className="text-text-muted">{chainBefore?.totalKm ?? '--'}km · {chainBefore?.totalMin ?? '--'}분 → </span>
                                                {chainNow?.totalKm ?? '--'}km · {chainNow?.totalMin ?? '--'}분
                                            </span>
                                        </div>
                                        {/* 🔴 «읽는 법»은 한 번 알면 되는 것이라 접어 둔다 — 매번 세 줄을 차지했다 */}
                                        <button type="button" onClick={() => setJudgeHelpOpen(o => !o)}
                                            className="self-start text-[9.5px] font-black text-text-muted">
                                            ⓘ 읽는 법 {judgeHelpOpen ? '▴' : '▾'}
                                        </button>
                                        {judgeHelpOpen && (
                                            <div className="text-[9.5px] text-text-muted leading-snug">
                                                앞 시각 = <b>최초 약속</b>(그 콜을 확정한 순간 못 박은 것 — 안 바뀐다) · 뒤 = 이 콜을 받으면 될 시각.
                                                합짐을 얹을수록 «늦어짐»은 이 약속을 기준으로 쌓인다.
                                                주행 + 정차(상차 {labDwellOf('상차')}분 · 하차 {labDwellOf('하차')}분) — <b className="text-warning">짐 다루는 법은 «수작업»으로 봅니다</b>
                                            </div>
                                        )}
                                    </div>}

                                {/* ══ ④ 후보콜에 대한 심사 결론 — 잡을지 말지의 답 ══ */}
                                <div className="text-[10px] font-black text-info border-t border-border-card pt-1">④ 후보콜에 대한 심사 결론</div>
                                {(() => {
                                    /**
                                     * 🔴 **모르면 «안 밀린다»고 하지 않는다** (기사님 2026-09-09:
                                     * *"'기존 콜은 안 밀린다'가 아니고 모른다, 카카오가 값을 잘못 줬다
                                     * … 이렇게 표시하던가 해야 하는 거지"*).
                                     *
                                     * 못 잰 구간이 하나라도 있으면 뒤 정거장의 도착을 **아무도 모른다.**
                                     * 그런데 «안 밀린다»는 초록으로 뜬다 — 기사님은 색만 보고 1~2초에 누르신다
                                     * (규칙 ⑤-3). 모르는 것을 초록으로 칠하는 것이 이 시스템의 가장 큰 사고다.
                                     */
                                    const failed = (chainNow?.legs ?? []).filter(l => l.failed || l.durMin == null);
                                    if (!chainNow || failed.length > 0 || chainNow.note) return (
                                        <div className="rounded-[8px] border border-danger/50 bg-danger/[0.08] px-2 py-1 text-[11.5px] font-black leading-snug">
                                            ❓ <b className="text-danger">모른다 — 못 잰 구간이 있다</b>
                                            {failed.length > 0 && (
                                                <div className="text-[10.5px] font-bold text-text-muted">
                                                    못 잰 구간: {failed.map(l => `${l.from} → ${l.to}`).join(' · ')}
                                                </div>
                                            )}
                                            {chainNow?.note && <div className="text-[10.5px] font-bold text-text-muted">받은 값: {chainNow.note}</div>}
                                            {!chainNow && <div className="text-[10.5px] font-bold text-text-muted">전체 경로를 아직 못 받았다</div>}
                                            <div className="text-[10px] font-bold text-text-muted">기존 콜이 밀리는지 판단할 수 없다 — 잡으시려면 통화로 시간을 확인하십시오</div>
                                        </div>
                                    );
                                    const worst = stopImpacts.reduce((w, r) => (r.delayMin > (w?.delayMin ?? -Infinity) ? r : w), null as typeof stopImpacts[number] | null);
                                    return (
                                        <div className="rounded-[8px] border border-warning/45 bg-warning/[0.07] px-2 py-1 text-[11.5px] font-black leading-snug">
                                            {worst && worst.delayMin > 0
                                                ? <>⚠️ 기존 콜 <b className="text-warning">{worst.stop}가 {worst.delayMin}분 늦어진다</b> — 약속 시각과 대보고 정한다</>
                                                : <>✅ 기존 콜은 <b className="text-success">안 밀린다</b></>}
                                        </div>
                                    );
                                })()}
                                {detourRows.length > 0 && (
                                    <div className="flex flex-col gap-0.5 text-[10.5px] tabular-nums">
                                        {detourRows.map(r => (
                                            <div key={r.name} className="flex justify-between gap-1">
                                                <span className="font-black">{r.name}</span>
                                                <span>
                                                    <b className={r.min > 0 ? 'text-warning' : 'text-success'}>{r.min > 0 ? '+' : ''}{r.min}분</b>
                                                    <span className="text-text-muted font-normal"> ({r.how})</span>
                                                    {r.budget && (r.budget.usedAt <= r.budget.limitAt
                                                        ? <b className="text-success"> · 시한 {hhmm(r.budget.limitAt)} 안 ✅ 전화 불필요</b>
                                                        : <b className="text-danger"> · 시한 {hhmm(r.budget.limitAt)} 초과 ☎️ 시간을 물려야 한다</b>)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* ══ ⑤ 후보콜에 대한 기사 선택 — 결재는 기사님이 한다 (규칙 ①) ══ */}
                                <div className="text-[10px] font-black text-info border-t border-border-card pt-1">⑤ 후보콜에 대한 기사 선택</div>
                                <div className="flex gap-1.5 flex-wrap">
                                    <button type="button"
                                        onClick={() => { if (pickup && drop) { pushLog('확정'); confirmCall(pickup, drop); setPickup(null); setDrop(null); resumeAfterCall(); } }}
                                        className={`px-2 py-1.5 rounded-[8px] border text-[11px] font-black ${finalPass
                                            ? 'border-success/55 bg-success/10 text-success' : 'border-warning/55 bg-warning/10 text-warning'}`}>
                                        {finalPass ? '✅ 콜 확정' : '⚠️ 탈락이지만 확정'}
                                    </button>
                                    <button type="button" onClick={() => { pushLog('버림'); setPickup(null); setDrop(null); resumeAfterCall(); }}
                                        className="px-2 py-1.5 rounded-[8px] border border-border-hover bg-background text-[11px] font-black hover:border-danger">
                                        🧹 버림
                                    </button>
                                </div>
                            </div>
                        )}
                    </FilterPanel>

                    {/* 📋 콜 리스트 — 왼쪽 사이드바 맨 아래 딱 붙임 (기사님 2026-09-07: mt-auto) + 방문 순서 */}
                    <FilterPanel title={
                        <button type="button" onClick={() => setCallsPeek(true)} className="text-left hover:underline">
                            📋 콜 리스트{confirmed.length ? ` — ${confirmed.length}` : ''}
                            <span className="font-bold text-text-muted"> · 눌러서 저장값 전부 보기</span>
                        </button>
                    }>
                        {confirmed.length === 0 && <p className="text-[10.5px] text-text-muted">확정한 콜이 여기 쌓입니다</p>}
                        {confirmed.length > 0 && (
                            <p className="text-[9.5px] text-text-muted leading-snug">
                                괄호 = (이동분 · 밀림 · <b>약속</b> · <b className="text-info">예정</b> · <b className="text-success">통과</b>) —
                                약속은 확정 순간에 못 박고, 예정은 지금 전체 경로, 통과는 GPS 로 실제 지난 시각
                            </p>
                        )}
                        {confirmed.length > 0 && (
                            <>
                                {/* 콜 = 한 덩어리 카드: 윗줄 상차→하차 · 아랫줄 거리·시간·톨비 (기사님 2026-09-08) */}
                                <ol className="flex flex-col gap-1 text-[11px]">
                                    {confirmed.map((c, i) => {
                                        const n = baseCallCount + i + 1;
                                        const color = CALL_COLORS[(n - 1) % CALL_COLORS.length];
                                        return (
                                            <li key={c.id} className="rounded-[8px] border border-border-card bg-background px-1.5 py-1 flex flex-col gap-0.5">
                                                <span className="flex items-start gap-1.5 min-w-0 flex-wrap">
                                                    <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0 mt-1" style={{ background: color }} />
                                                    <b className="shrink-0">{circled(n)}</b>
                                                    {/* 정거장마다 다섯 값 — 이동·밀림·약속·예정·통과 (기사님 2026-09-08) */}
                                                    {([['상차', c.pickup], ['하차', c.drop]] as const).map(([kind, pt], k) => {
                                                        const clock = stopClock.get(`${circled(n)}${kind}`);
                                                        return (
                                                            <span key={kind} className="font-black">
                                                                {k > 0 && <span className="text-text-muted font-bold"> → </span>}
                                                                {/* 🔢 앞 숫자는 «몇 번째로 들르나» — 상차/하차 표시가 아니다 (기사님 2026-09-09) */}
                                                                <button type="button" onClick={() => setStopPeek({ callId: c.id, kind })}
                                                                    className="font-black hover:underline">
                                                                    {clock?.seq ? circled(clock.seq) : '·'}{nearestDong(pt).name}
                                                                </button>
                                                                <span className="font-bold text-text-muted tabular-nums">
                                                                    {' ('}{clock?.legMin ?? '--'}분
                                                                    {clock?.delayMin != null && clock.delayMin !== 0
                                                                        ? <b className={clock.delayMin > 0 ? 'text-warning' : 'text-success'}>
                                                                            {' '}{clock.delayMin > 0 ? '+' : '−'}{Math.abs(clock.delayMin)}분</b>
                                                                        : ' -0분'}
                                                                    {' '}{hhmm(clock?.promisedAt)}
                                                                    {' '}<b className={clock?.etaAt ? 'text-info' : ''}>{hhmm(clock?.etaAt)}</b>
                                                                    {' '}<b className={clock?.passedAt ? 'text-success' : ''}>{hhmm(clock?.passedAt)}</b>
                                                                    {')'}
                                                                </span>
                                                            </span>
                                                        );
                                                    })}
                                                    <span className="shrink-0 text-[9.5px] px-1 rounded bg-info/15 text-info font-black">🎯 {c.destName.replace(' 시내', '')}</span>
                                                </span>
                                                <span className="pl-4 text-[10.5px] font-bold text-text-muted tabular-nums">
                                                    {c.approachKm != null && <>상차지까지 <b className="text-info">{c.approachKm}km · {c.approachMin ?? '--'}분</b> · 배송 </>}
                                                    {c.routeComputedAt == null ? '⏳ 실측 중…'
                                                        : c.distKm == null ? '❌ 못 쟀다 (도로 탐색 불가) — 통화로 확인'
                                                        : <>{c.distKm}km · {c.durMin}분 · 톨 {(c.tollWon ?? 0).toLocaleString()}원 <span className="font-normal">· 카카오 {c.optionUsed ?? '추천'}</span></>}
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ol>
                                <button type="button" onClick={cancelLastCall}
                                    className="self-start px-2 py-1 rounded-[8px] border border-border-hover bg-surface text-[10.5px] font-black hover:border-danger">
                                    ↩️ 마지막 콜 취소
                                </button>
                            </>
                        )}
                        {/* 🧹 취소된 콜 — **사라지지 않고 여기로 옮겨 온다** (관제웹 규칙 그대로) */}
                        {terminated.length > 0 && (
                            <div className="flex flex-col gap-0.5 border-t border-border-card pt-1 mt-1">
                                <div className="text-[10px] font-black text-text-muted">🧹 취소/방출 — {terminated.length}</div>
                                {terminated.map(t => (
                                    <div key={t.id} className="flex justify-between gap-1 text-[10.5px] text-text-muted tabular-nums">
                                        <span className="line-through">{t.no} {nearestDong(t.pickup).name} → {nearestDong(t.drop).name}</span>
                                        <span className="shrink-0">{hhmm(t.terminatedAt)} 취소</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {effPath.length > 1 && (
                            <ol className="mt-1 flex flex-col gap-0.5 text-[10.5px] border-t border-border-card pt-1">
                                <span className="font-black text-text-muted">🧭 방문 순서</span>
                                {effPath.slice(1).map(p => (
                                    <li key={p.seq} className={`flex items-center gap-1.5 rounded-md px-1 py-0.5 ${driving && p.seq === targetSeq ? 'bg-info/15' : ''}`}>
                                        <span className="shrink-0 rounded-full grid place-items-center text-[9.5px] font-black text-white" style={{ background: p.color ?? '#111827', width: 16, height: 16 }}>{p.seq}</span>
                                        <span className="min-w-0 truncate">{p.label}</span>
                                        {driving && p.seq === targetSeq && <span className="shrink-0 text-info font-black text-[10px]">▶</span>}
                                    </li>
                                ))}
                            </ol>
                        )}
                    </FilterPanel>
                </aside>

                {/* 🗺️ 지도 */}
                <div ref={boxRef} className="relative flex-1 min-h-0">
                <canvas ref={canvasRef} className="absolute inset-0" style={{ width: size.w, height: size.h, cursor: 'crosshair', display: 'block' }}
                    onClick={onMapClick}
                    onMouseDown={e => { dragRef.current = { sx: e.clientX, sy: e.clientY, moved: false, down: true }; }}
                    onMouseMove={e => {
                        const d = dragRef.current;
                        if (!d.down || !(e.buttons & 1)) return;
                        const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
                        if (!d.moved && Math.hypot(dx, dy) < 5) return;
                        d.moved = true; d.sx = e.clientX; d.sy = e.clientY;
                        panBy(dx, dy);
                    }}
                    onMouseUp={() => { dragRef.current.down = false; }} />
                {/**
                  * 💰📦 **두 점을 찍으면 지도 위에 뜨는 입력창** (기사님 2026-09-09).
                  *
                  * 🔴 **실험실 전용이다.** 실제 콜은 배차망이 요금과 짐을 주므로 실물에는 이 창이 없다.
                  *    심사창에 두면 이식할 때 «실물에 필요 없는 것»이 딸려 간다 — 그래서 여기로 옮겼다.
                  * 지도 아래 가운데에 뜬다 — 찍은 두 점을 가리지 않는 자리다.
                  */}
                {pickup && drop && (
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-4 z-10 flex items-end gap-2
                                    rounded-xl border border-border-hover bg-surface/95 shadow-lg px-3 py-2 backdrop-blur">
                        <div className="w-[112px]"><NumRow label="💰 요금(원)" value={candFare} onChange={setCandFare} max={2_000_000} /></div>
                        <div className="w-[96px]"><NumRow label="📦 짐(박스)" value={candBoxes} onChange={setCandBoxes} max={TRUCK_CAPACITY_SLOTS} /></div>
                        {candJudge && (() => {
                            const r = candJudge.result;
                            const face = r.color === '꿀' ? '🔵' : r.color === '보통' ? '🟢' : r.color === '똥' ? '🟡' : '🔴';
                            const tone = r.color === '꿀' ? 'bg-info/20 text-info border-info/50'
                                : r.color === '보통' ? 'bg-success/20 text-success border-success/50'
                                : r.color === '똥' ? 'bg-warning/20 text-warning border-warning/50'
                                : 'bg-danger/20 text-danger border-danger/50';
                            return (
                                <div className={`px-2.5 py-1 rounded-lg border text-[14px] font-black whitespace-nowrap ${tone}`}>
                                    {face} {r.color}{r.score != null && <span className="text-[11px] font-bold"> {r.score}점</span>}
                                </div>
                            );
                        })()}
                    </div>
                )}
                {/* 🔍 줌 조작 — 드래그·휠로도 된다. ⌖ 는 자동 맞춤 복귀 */}
                <div className="absolute right-3 top-3 flex flex-col gap-1.5">
                    {([['➕', 1], ['➖', -1]] as const).map(([label, d]) => (
                        <button key={label} type="button"
                            onClick={() => zoomAt(size.w / 2, size.h / 2, d)}
                            className="w-9 h-9 rounded-lg border border-border-hover bg-surface text-[15px] font-black shadow">{label}</button>
                    ))}
                    <button type="button" title="자동 맞춤으로"
                        onClick={() => setView(p => ({ manual: false, rev: p.rev + 1 }))}
                        className={`w-9 h-9 rounded-lg border text-[15px] font-black shadow ${view.manual ? 'border-info/55 bg-info/15 text-info' : 'border-border-hover bg-surface'}`}>⌖</button>
                </div>
                </div>

                {/* 🎛️ 오른쪽 — 필터 옵션 (기사님 2026-09-07 와이어프레임: 실물 요소만 · 값은 목업 ·
                    왼쪽과 같은 부품(FilterPanel/NumRow/TextRow)으로 조립 — 실물로 들고 가기 쉽게) */}
                <aside className="w-[400px] shrink-0 border-l border-border-card bg-surface p-3 flex flex-col gap-2 overflow-y-auto">
                    <span className="text-[12px] font-black">🎛️ 필터 옵션 <span className="text-[10px] font-bold text-text-muted">실물 요소 · 값은 목업</span></span>

                    {/* 🔴 **«필터 값» 패널을 걷어냈다** (기사님 지시 2026-09-09 — 넷 다 삭제).
                        · 도착 목표    왼쪽 🎯 목적지의 **읽기 전용 복사본**이었다
                        · 상차 반경 · 하차지 주변   왼쪽 «현위㎞·목적㎞»와 **같은 값**(한 벌이라 같이 움직였다)
                        · 우회 허용    **어디에도 안 쓰였다** — 실물에서 «경유 반경»을 파생하는 재료인데,
                                      실험실은 그 결과(라인 반경)를 기사님이 직접 넣는다. 손잡이가 둘이었다. */}
                    {/* 🔬 **적재 패널을 걷어냈다** (기사님 2026-09-09: *"적재는 상태값이니 필요 없고"*).
                        쓴 박스는 **잡은 콜들의 짐 합**이라 고를 값이 아니다 — 상단 요약줄에 `📦 n/100` 으로 보인다.
                        ⚠️ 「라면박스 환산이 화물 종류에 맞는가」는 **실측이 필요하다** — todo 에 항목으로 있다. */}

                    {/**
                      * 🧪 **콜 문제를 한 줄씩 — 눌러서 지도에 찍는다** (기사님 2026-09-10:
                      * *"오른쪽 사이드바에 콜 리스트를 만들고 **순서대로** 넣어 놔.
                      * **그걸 클릭해서 지도에 찍을 거니까.**"*).
                      *
                      * 🔴 위(상단) 문제 버튼은 «판을 통째로 부르는 것»이고, 여기는 «한 콜씩 손으로 놓는 것»이다.
                      *    한 줄을 누르면 지도에 상차·하차가 찍히고 **필터가 판정한다** — 확정은 기사님이 하신다.
                      * 🔴 좌표는 **기사님이 실제로 누른 자리**다 (카카오 기록에서 그대로 옮겼다).
                      *    이미 잡은 콜은 흐려진다 — 어디까지 왔는지가 목록에서 보여야 한다.
                      */}
                    <details className="border-t border-border-card pt-2" open>
                        <summary className="text-[10.5px] font-black text-text-muted cursor-pointer">
                            🧪 콜 문제 — 눌러서 지도에 찍는다{' '}
                            <span className="font-bold">
                                {problemOn?.name ?? LAB_PROBLEMS[0].name} · {(problemOn?.steps ?? LAB_PROBLEMS[0].steps).filter(x => x.kind === 'call').length}콜
                            </span>
                        </summary>
                        {/**
                          * 🔴 **액션과 콜을 나누지 않는다 — 한 줄이 콜 하나다** (기사님 2026-09-10:
                          *    *"엑션과 콜을 나누지 말고 **콜에 설명을 넣어서** 4줄로 잡아 줘"*).
                          *
                          *    앞서 좌우 두 칸(이벤트 | 콜)으로 나눴더니 **줄이 두 배**가 되고
                          *    빈 칸이 절반이었다. 주행은 «그 콜을 잡기 전에 해야 하는 일»이라
                          *    **그 콜의 설명**이지 따로 선 사건이 아니다.
                          * 🔴 **누르면 주행까지 함께 한다** — 그 콜 앞에 붙은 이동을 먼저 하고 콜을 찍는다.
                          *    그래야 «달려야 잡히는 콜»이 실제로 잡힌다 (한자리에서는 필터가 떨어뜨린다).
                          */}
                        <ol className="mt-1 flex flex-col gap-0.5">
                            {(problemOn?.steps ?? LAB_PROBLEMS[0].steps).map((st, i, all) => {
                                if (st.kind !== 'call') return null;
                                const no = all.slice(0, i + 1).filter(x => x.kind === 'call').length;
                                /** 이 콜 앞에 붙은 이동들 — 그 콜의 «설명»이 된다 */
                                const before: string[] = [];
                                for (let k = i - 1; k >= 0 && all[k].kind === 'drive'; k--) before.unshift((all[k] as Extract<LabStep, { kind: 'drive' }>).where);
                                const done = no <= confirmed.length;
                                return (
                                    <li key={i}>
                                        <button type="button" data-cycle={no}
                                            onClick={() => {
                                                for (let k = i - 1; k >= 0 && all[k].kind === 'drive'; k--) {
                                                    const d = all[k] as Extract<LabStep, { kind: 'drive' }>;
                                                    if (d.home) setHomeOn(true);
                                                    setMyPos(d.to);
                                                }
                                                pauseForCall();
                                                setPickup(st.from); setDrop(st.to);
                                                setCandFare(LAB_DEFAULTS.candFare); setCandBoxes(LAB_DEFAULTS.candBoxes);
                                                setUploaded(false);
                                            }}
                                            className={`w-full flex flex-col gap-0.5 px-1.5 py-1 rounded-[7px] border text-left ${done
                                                ? 'border-border-card bg-background opacity-60'
                                                : 'border-border-hover bg-background hover:border-info'}`}>
                                            <span className="flex items-center gap-1.5 text-[11px] font-black">
                                                <span className={done ? 'text-text-muted' : 'text-info'}>{circled(no)}</span>
                                                <span className="min-w-0 truncate">{st.where}</span>
                                                {done && <span className="ml-auto shrink-0 text-success">✅</span>}
                                            </span>
                                            {/* 🔴 설명 — 이 콜을 잡기 전에 **어디까지 달려야 하는가**. 없으면 앉은 자리에서 잡는다 */}
                                            <span className="text-[9.5px] font-bold text-text-muted leading-snug">
                                                {before.length ? `↳ ${before.join(' · ')} 뒤에 잡는다` : '앉은 자리에서 잡는다'}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ol>
                    </details>

                    {/**
                      * ⚖️ **실물 심사석 두 판** (기사님 2026-09-10 «심사판 2종류를 오른쪽 사이드바에»).
                      *
                      * 🔴 **실물 부품을 그대로 부른다** — `components/dashboard/JudgmentSeat`.
                      *    실물 파일은 **한 글자도 안 고쳤다** (기사님 *"기존 프로젝트는 건드리면 안 돼"*).
                      *    베껴 두면 실물이 바뀔 때 여기만 옛 모양으로 남아 실험이 거짓말을 한다.
                      * 🔴 판을 가르는 것은 **콜의 갈래**다 — `isManualLineage(type) || isPreview` 면
                      *    「물든 판」(보기만 · 기사님이 직접·알람으로 잡은 콜은 서버가 이미 확정했다),
                      *    아니면 「자동콜」(아래 전체가 ❌:KEEP = 35:65 버튼). 그래서 `isPreview` 만 바꿔 둘을 띄운다.
                      * ⚠️ 여기 버튼은 **아무것도 안 한다** — 결재는 왼쪽 ⑤ 에서 한다. 모양을 보는 자리다.
                      */}
                    <details className="border-t border-border-card pt-2" open>
                        <summary className="text-[10.5px] font-black text-text-muted cursor-pointer">
                            ⚖️ 실물 심사석 2종 <span className="font-bold">— 실물 부품 그대로 (버튼은 안 눌림)</span>
                        </summary>
                        {!seatOrder
                            ? <p className="mt-1 text-[10.5px] text-text-muted leading-snug">지도 두 번 클릭으로 콜을 만들면 여기 실물 모양으로 뜹니다</p>
                            : (
                                <div className="mt-1 flex flex-col gap-1">
                                    {/**
                                      * 🔴 **실물 심사석은 «폰 한 화면 폭»으로 만든 부품이다** (2026-09-10 화면 실측).
                                      *    400px 사이드바에 그대로 넣었더니 **거절 사유 글이 158px 카드를 넘쳐**
                                      *    아래 시트를 덮었다. 카드 높이가 고정값이라 글이 늘어도 안 늘어난다.
                                      * 🔴 **실물을 고쳐서 맞추지 않는다** — 실물은 폰에서 옳게 서 있다.
                                      *    여기서만 **통째로 축소**해 원래 비율 그대로 보여 준다(원본 폭 560px 기준).
                                      *    글자·여백·워터마크가 **같은 비율로** 줄어 «실물 모양»이 유지된다.
                                      */}
                                    <span className="text-[9.5px] font-black text-text-muted">① 직접·알람 — 물든 판 (보기만)</span>
                                    <div className="overflow-hidden" style={{ height: 158 * 0.66 }}>
                                        <div style={{ width: 560, transform: 'scale(0.66)', transformOrigin: 'top left' }}>
                                            <JudgmentSeat route={{ ...seatOrder, isPreview: true }} confirmedActive={confirmed.length} inset="0" />
                                        </div>
                                    </div>
                                    <span className="text-[9.5px] font-black text-text-muted">② 자동콜 — 아래 전체가 버튼 35:65</span>
                                    <div className="overflow-hidden" style={{ height: 158 * 0.66 }}>
                                        <div style={{ width: 560, transform: 'scale(0.66)', transformOrigin: 'top left' }}>
                                            <JudgmentSeat route={seatOrder} confirmedActive={confirmed.length} inset="0" />
                                        </div>
                                    </div>
                                </div>
                            )}
                    </details>

                    <details className="border-t border-border-card pt-2">
                        <summary className="text-[10.5px] font-black text-text-muted cursor-pointer">🗂️ 영역 — 시군구별 {netCount}동{dongOut ? ` · ⛔${dongOut}` : ''}</summary>
                        <RegionAreaList groups={areaNet.groups} excluded={excluded} />
                    </details>

                    {/**
                      * 🪟 **시트 — 실물 구조 그대로, 사이드바 하단 고정** (기사님 확정 2026-09-10:
                      * *"제안 B 가 우리 프로젝트에 가장 적합한 것 같아. **지도의 경로, 기존 콜들의
                      * 순서를 보면서 결정한다.**"* · *"오른쪽 사이드바 폭 400 · 하단 고정으로 UI 만"*).
                      *
                      * ```
                      * 시트 상태바
                      *   › 아코디언 콜 리스트  (콜 타이틀 + 열고 닫는 콜 컨텐츠)
                      *     › 심사 영역
                      * ```
                      * 🔴 **하단 고정인 것이 핵심이다** — 심사가 **언제나 화면 맨 아래 거기**라
                      *    찾는 시간이 0이고, 엄지에 가장 가깝다 (실물 `bottomBox` 가 그 자리다).
                      * 🔴 **UI 만 가져왔다.** 실물 `StageSheet`·`PinnedRouteBody` 는 안 건드렸고
                      *    부르지도 않는다 — 그쪽은 시트가 지도 위에 뜨는 그릇이라 사이드바에 못 앉는다.
                      *    여기서 다듬은 **모양**이 확정되면 그때 실물로 옮긴다.
                      */}
                    <div className="mt-auto sticky bottom-0 -mx-3 -mb-3 px-3 pb-3 pt-2 bg-surface border-t border-border-hover flex flex-col gap-1">
                        {/* ── 🎬 시트 상태바 — 시트가 내려가 있어도 늘 보이는 맨 윗줄 ──
                            실물 `sheetStatus` 문법 그대로: ▶ ② 진건읍 ~14분 · 2번 콜 · 하차 ›
                            🔴 **심사 중이라고 «어디로 가는가»를 지우지 않는다** — 판정은 아래 심사 영역이 말한다 */}
                        <div className="flex items-center gap-1.5 px-1.5 py-1 rounded-[8px] bg-background border border-border-card text-[12px] font-black">
                            {sheetNext ? (<>
                                <span className="shrink-0">{driving ? '▶' : '⏸'}</span>
                                <span className="shrink-0 w-[19px] h-[19px] rounded-full grid place-items-center text-[11px] font-black"
                                    style={{ background: callNodeFill(sheetNext.callNo, sheetNext.kind === '상차' ? 'pickup' : 'dropoff', theme),
                                        color: callNodeText(sheetNext.kind === '상차' ? 'pickup' : 'dropoff', theme) }}>
                                    {sheetNext.seq ?? '?'}
                                </span>
                                <span className="shrink-0">{sheetNext.name}</span>
                                {sheetNext.min != null && <span className="shrink-0 text-text-muted font-bold">~{sheetNext.min}분</span>}
                                <span className="ml-auto shrink-0 text-text-muted font-bold truncate">{sheetNext.disp}번 콜 · {sheetNext.kind}</span>
                                <span className="shrink-0 text-text-muted">›</span>
                            </>) : (
                                <span className="text-text-muted font-bold">
                                    {confirmed.length === 0 ? '진행 중인 콜 없음 · 새 콜 대기' : '이번 사이클 끝'}
                                </span>
                            )}
                        </div>

                        {/* ── 📋 아코디언 콜 리스트 — 타이틀 한 줄, 열면 컨텐츠 ──
                            타이틀 문법(기사님 2026-09-10): [콜번호] [정거장번호]동이름 ~시각 → [정거장번호]동이름 ~시각
                            🔴 **하나만 열린다** — 둘이 열리면 시트가 화면을 다 먹는다 (실물 `openIdx` 규칙) */}
                        <div className="flex flex-col gap-0.5 max-h-[240px] overflow-y-auto">
                            {callImpacts.filter(ci => !ci.isNew).length === 0 && (
                                <p className="text-[10.5px] text-text-muted px-1">잡은 콜이 없습니다 — 지도에서 콜을 확정하면 여기 쌓입니다</p>
                            )}
                            {callImpacts.filter(ci => !ci.isNew).map(ci => {
                                const n = Number(ci.no.charCodeAt(0) - 0x2460) + 1;
                                const open = sheetOpenNo === ci.disp;
                                return (
                                    <div key={ci.no} className="rounded-[8px] border border-border-card bg-background overflow-hidden">
                                        {/**
                                          * 🔴 **왼쪽 점과 콜 번호를 지웠다** (기사님 2026-09-10:
                                          * *"색 아이콘은 상차지 색·하차지 색으로 바꾸면 영역을 확보 많이 할 것 같고,
                                          * index 번호도 순서대로 노출되니 삭제할 수 있을 것 같은데"*).
                                          *
                                          * 셋(점 · 콜 번호 · 정거장 번호)이 **다 «어느 콜인가»를 말하고 있었다.**
                                          * 이제 **정거장 동그라미의 색**이 그 일을 혼자 한다 — 지도 마커와 같은 색이라
                                          * 시트와 지도가 같은 말을 하고, 왼쪽 두 칸만큼 지명이 넓어진다.
                                          * ⚠️ 콜 번호는 **호칭**(「합짐2」)이라 안 없앤다 — 열면 나오고 심사 영역이 부른다.
                                          */}
                                        {/**
                                          * 🔴 **정거장 하나가 네 칸이다** (기사님 요소 정리 2026-09-10).
                                          *
                                          * 기사님이 칸을 이렇게 갈라 주셨다:
                                          *   예약 시점(아직 안 감) — **컬러** · 순번 · 지명 · 약속 · **예상 + 추가된 시간**
                                          *   도착 시점(지나감)   — **흑백** · 순번 · 지명 · 약속 · **도착**
                                          *
                                          * 🔴 **한 줄에 둘 다 넣고 긴 지명은 말줄임한다** (기사님 2026-09-10 *"길면 말줄임해"*).
                                          *    400px 에서 지명에 돌아가는 폭은 **한 자리에 약 4자**다(실측) —
                                          *    「사리현동」은 「사리현…」이 된다. **줄을 늘리는 것보다 낫다**:
                                          *    콜이 셋이면 여섯 줄이 되어 시트가 화면을 다 먹는다.
                                          * 🔴 **잘리는 것은 지명뿐이다** — 시각과 분은 한 글자도 안 자른다.
                                          *    열면 온전한 이름이 나오고, 지도에도 이름이 있다.
                                          * 🔴 격자는 그대로다 — 콜이 넷이어도 **약속은 약속끼리, 예상은 예상끼리** 세로로 선다.
                                          *    상차·하차는 **가운데 틈**으로 갈린다 (근접성).
                                          */}
                                        <button type="button" onClick={() => setSheetOpenNo(open ? null : ci.disp)}
                                            className="w-full grid items-center px-1.5 py-1 text-left text-[11.5px] font-black tabular-nums"
                                            style={{ gridTemplateColumns: '15px minmax(0,1fr) 41px 28px 41px 10px 15px minmax(0,1fr) 41px 28px 41px' }}>
                                            {ci.stops.map(st => {
                                              const gone = st.passedAt != null;
                                              const real = st.passedAt ?? st.etaAt;
                                              /** ± 는 **약속과 견준 값** 하나다 — 지났든 아니든 같은 셈법이다 (규칙 ③) */
                                              const diff = real != null && st.promisedAt != null
                                                  ? Math.round((real - st.promisedAt) / 60000) : null;
                                              const box = stopBoxBg(n, st.kind === '상차' ? 'pickup' : 'dropoff', theme, gone);
                                              return (
                                                <Fragment key={st.kind}>
                                                    {st.kind === '하차' && <span />}
                                                    {/* 순번 — 지나갔으면 흑백. 색이 남아 있으면 눈이 그리로 간다 */}
                                                    <span className={`text-[12px] rounded-l-md pl-1 py-0.5 ${gone ? 'text-text-muted' : ''}`}
                                                        style={{ background: box, ...(gone ? null : { color: callTextColor(n, st.kind === '상차' ? 'pickup' : 'dropoff', theme) }) }}>
                                                        {st.seq ?? '?'}
                                                    </span>
                                                    <span className={`truncate px-1 py-0.5 ${gone ? 'text-text-muted' : ''}`} style={{ background: box }}>
                                                        {(ci.where.split(' → ')[st.kind === '상차' ? 0 : 1]) ?? ''}
                                                    </span>
                                                    {/**
                                                      * ☎️ **직접 통화로 정한 약속은 보라색** (기사님 확정 2026-09-10:
                                                      * *"아이콘을 넣으면 그리드가 깨진다. 그냥 직접 통화한 건 시간을 보라색으로 해 줘"*).
                                                      *
                                                      * 🔴 기호(🔒)를 안 쓴 이유가 그것이다 — 한 글자가 붙는 순간 칸 너비가 흔들려
                                                      *    **격자가 깨진다.** 색은 **폭을 0 만큼** 쓴다.
                                                      * 🔴 보라색은 «못 민다»는 뜻이다 — *"그 이상은 해선 안 되고 무조건 약속을 이행해야 한다"*.
                                                      *    회색이면 아직 서버 추정이라 통화로 미룰 여지가 있다.
                                                      */}
                                                    <span className="text-right px-1 py-0.5"
                                                        style={{ background: box, color: st.promiseBy === '통화' ? PROMISE_CALLED : 'var(--color-text-muted)' }}>
                                                        {hhmm(st.promisedAt)}
                                                    </span>
                                                    {/**
                                                      * 🔴 **약속 → 차이 → 결과 순으로 읽힌다** (기사님 2026-09-10:
                                                      * *"이번 콜을 잡으면 의정부동에 **22:14분에 도착해야 하는데
                                                      * +24이 걸려서 22:37에 도착 예정**이다. 이것이 좀 더 직관적인 듯하다"*).
                                                      *
                                                      * 전에는 «약속 · 예상 · 차이»라 **결과를 보고 다시 왼쪽으로 돌아와** 이유를 찾았다.
                                                      * 차이를 가운데 두면 한 줄이 **문장 하나**가 된다 — 눈이 되돌아가지 않는다.
                                                      */}
                                                    <span className={`text-right px-1 py-0.5 ${diff != null && diff > 0 && !gone ? 'text-warning' : 'text-text-muted'}`}
                                                        style={{ background: box }}>
                                                        {diff == null ? '' : diff > 0 ? `+${diff}` : diff}
                                                    </span>
                                                    {/* 마지막 칸이 **결론**이다 — 지났으면 «도착», 아직이면 «예상» */}
                                                    <span className={`text-right rounded-r-md pr-1 py-0.5 ${gone ? 'text-text-muted' : ''}`} style={{ background: box }}>
                                                        {real != null ? hhmm(real) : '--:--'}
                                                    </span>
                                                </Fragment>
                                              );
                                            })}
                                            {/* 🔴 **열기 화살표를 지웠다** (기사님 2026-09-10 *"열기 아이콘은 지워 버린다"*) —
                                                줄 전체가 이미 누르는 자리다. 화살표는 그 말을 한 번 더 할 뿐이고 칸만 먹는다 */}
                                        </button>
                                        {open && (
                                            <div className="px-2 pb-1.5 flex flex-col gap-0.5 text-[10.5px] tabular-nums border-t border-border-card pt-1">
                                                {ci.stops.map(st => {
                                                    const real = st.passedAt ?? st.etaAt;
                                                    const d = real != null && st.promisedAt != null ? Math.round((real - st.promisedAt) / 60000) : null;
                                                    return (
                                                        <div key={st.kind} className="flex flex-col">
                                                            <div className="flex justify-between gap-1 font-bold">
                                                                <span>{st.seq ?? '?'} {st.kind}
                                                                    <span className="font-normal text-text-muted"> {st.leg?.distKm ?? '--'}km·{st.leg?.durMin ?? '--'}분</span>
                                                                </span>
                                                                <span>
                                                                    {/**
                                                                      * ☎️ **약속을 눌러 «통화로 정함»을 켠다** — 조율 통화창이 서기 전까지의 임시 손잡이가
                                                                      * 아니라, 통화창이 결국 **이 값 하나**를 바꾼다. 여기서 그 자리를 먼저 만들어 둔다.
                                                                      * 켜면 타이틀의 약속 시각이 보라색이 되고 «더는 못 민다»는 뜻이 된다.
                                                                      */}
                                                                    <button type="button" title="눌러서 «통화로 정한 약속»으로 표시"
                                                                        onClick={e => { e.stopPropagation(); toggleCalled(ci.disp, st.kind); }}
                                                                        style={{ color: st.promiseBy === '통화' ? PROMISE_CALLED : 'var(--color-text-muted)' }}>
                                                                        {hhmm(st.promisedAt)}
                                                                    </button>
                                                                    <span className="text-text-muted"> → </span>
                                                                    <b className={d != null && d > 0 ? 'text-warning' : 'text-success'}>{hhmm(real)}</b>
                                                                    {st.passedAt != null && <span className="text-success text-[9px]"> 통과</span>}
                                                                    {d != null && d > 0 && <b className="text-warning"> +{d}분</b>}
                                                                </span>
                                                            </div>
                                                            {st.impacts.map((x, k) => (
                                                                <div key={k} className="pl-2 flex justify-between gap-1 text-[9.5px] text-text-muted">
                                                                    <span>└ {x.causeLabel}</span><span className="text-warning">+{x.min}분</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* ── ⚖️ 심사 영역 — 시트 맨 아래 붙박이 (v17 B안) ── */}
                        {/* 🔴 **판정이 쓴 그 값을 그대로 넘긴다** (2026-09-10 화면 실측: 시트 «152분» ↔
                            실물 카드 «÷177분»). «더 쓰는 시간 = 주행 + 정차»가 실물 정의인데
                            시트가 주행만 적고 있었다 — 이름은 같은데 값이 달랐다 (규칙 ③). */}
                        <SheetJudgeCard seat={seatOrder} impacts={callImpacts} confirmedCount={confirmed.length}
                            safeCancelLeft={safeCancelLeft} driveMin={candJudge?.facts.money?.extraMinutes ?? null} />
                    </div>

                    {logs.length > 0 && (
                        <details className="border-t border-border-card pt-2" open>
                            <summary className="text-[10.5px] font-black text-text-muted cursor-pointer">📜 판정 기록 — {logs.length}</summary>
                            <button type="button" onClick={() => setLogs([])}
                                className="mt-1 text-[10px] font-black text-text-muted hover:text-danger">비우기</button>
                            <ol className="mt-1 flex flex-col gap-0.5 text-[10.5px] leading-snug">
                                {logs.map((l, i) => (
                                    <li key={i} className="flex items-start gap-1">
                                        <span className={`shrink-0 font-black ${l.pass ? 'text-success' : 'text-danger'}`}>{l.pass ? '✅' : '❌'}</span>
                                        <span className="text-text-muted tabular-nums shrink-0">{l.t}</span>
                                        <span className="min-w-0">
                                            <b>{l.from} → {l.to}</b>
                                            {l.local && <span className="text-info font-bold"> 🏘️</span>}
                                            <span className="text-text-muted"> · {l.dists} · </span>
                                            <b className={l.act === '확정' ? 'text-success' : 'text-text-muted'}>{l.act}</b>
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        </details>
                    )}
                    {/* 🛰️ 시스템 — 카카오를 언제·무엇으로 부르고 무엇을 받았나 (기사님 2026-09-08) */}
                    <details className="border-t border-border-card pt-2" open>
                        <summary className="text-[10.5px] font-black text-text-muted cursor-pointer">
                            🛰️ 시스템 — 카카오 호출 {apiLog.length}건
                        </summary>
                        {apiLog.length === 0
                            ? <p className="mt-1 text-[10px] text-text-muted">아직 호출 없음 — 길 찾기·콜 올리기·확정 때 부릅니다</p>
                            : (
                                <>
                                    <button type="button" onClick={() => setApiLog([])}
                                        className="mt-1 text-[10px] font-black text-text-muted hover:text-danger">비우기</button>
                                    <ol className="mt-1 flex flex-col gap-1 text-[10px] leading-snug">
                                        {apiLog.map((l, i) => (
                                            <li key={i} className={`rounded-md border px-1.5 py-1 ${l.ok ? 'border-border-card bg-background' : 'border-danger/45 bg-danger/5'}`}>
                                                <div className="flex items-center gap-1 flex-wrap font-black">
                                                    <span className="text-text-muted tabular-nums">{l.t}</span>
                                                    <span>{l.who}</span>
                                                    <span className="text-text-muted font-mono">{l.path}</span>
                                                    <span className="text-text-muted tabular-nums">{l.ms}ms</span>
                                                </div>
                                                <div className="text-text-muted">↗ {l.req}</div>
                                                <div className={l.ok ? 'text-info' : 'text-danger'}>↘ {l.res}</div>
                                            </li>
                                        ))}
                                    </ol>
                                </>
                            )}
                    </details>
                </aside>
            </div>

            <FilterFooter out={appFilterOutput} callTarget={callTarget} lineOn={lineOn} routeMode={routeMode} />
        </div>
    );
}
