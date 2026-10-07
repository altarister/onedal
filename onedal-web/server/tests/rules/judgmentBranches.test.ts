// @ts-nocheck
import { OrderEvaluator } from '../../src/core/engine/OrderEvaluator';
import { SettingsRepository } from '../../src/repositories/SettingsRepository';
import { OrderRepository } from '../../src/repositories/OrderRepository';
import * as kakao from '../../src/services/kakaoService';
import { initGeoService } from '../../src/services/geoService';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { clearBaseRouteCache } from '../../src/services/routeComposer';

/**
 * 🎨 **판정 갈래를 끝까지 돌려 색 · 점수 · 기준 · 딱지 · 사유를 문다** — 단독 · 미리보기 단가 미달 · 등 뒤 상차 · 합짐 둘(돈이 포화된 콜 · 싼 콜) · 좌표 못 찾음 · 카카오 키 없음.
 * 카카오는 가짜(좌표 · 단독 경로 · 합짐 경로) · 시각은 고정 · 세션은 진짜. 실제 카카오는 안 부른다.
 * 기준값은 판정 셈을 나누기 전 코드가 낸 값이다 — 판정 함수를 떼거나 값만 받게 바꿔도 같은 콜에 같은 판정이 나와야 한다.
 * 기준값이 바뀌어야 하는 수정(판정 규칙을 바꾸는 일)이면 이 파일이 빨간불로 알린다 — 그때 기준값을 새로 받는다.
 */
const T = Date.parse('2026-10-07T03:00:00.000Z');
const MODA = { x: 127.312587, y: 37.363298 };            // 광주 초월읍 — 지금 위치
const TERMINAL = { x: 127.446936, y: 37.277421 };        // 이천 중리동
const HD_SINDUN = { x: 127.40410, y: 37.30574 };         // 이천 신둔면
const GONJIAM = { x: 127.33209, y: 37.35310 };           // 광주 곤지암읍
const BUBAL = { x: 127.4867, y: 37.2602 };               // 이천 부발읍

const GOLDEN = {
 "solo": {
  "j": {
   "color": "보통",
   "score": 60,
   "bell": true,
   "foldable": false,
   "axes": [
    {
     "key": "money",
     "name": "돈",
     "score": 100,
     "weight": 1,
     "raw": "4.5만(기름 −0.2만 · 톨비 −0.1만) ÷ 43분 = 5.8만/h (첫짐 기준 2.5만)",
     "value": 5.787209302325581
    },
    {
     "key": "labor",
     "name": "노동강도",
     "score": 73,
     "weight": 1,
     "raw": "손 8분",
     "value": 8
    },
    {
     "key": "drive",
     "name": "운전",
     "score": 14,
     "weight": 1,
     "raw": "31km/h — 시내·국도",
     "value": 31.000000000000004
    },
    {
     "key": "wait",
     "name": "콜 대기",
     "score": 55,
     "weight": 1,
     "raw": "상차 +13분 · 배송 +12분 = 25분 · 약 1.2콜치 (상차 약속 20분 기준)",
     "value": 1.225
    },
    {
     "key": "calls",
     "name": "전화할 곳",
     "score": null,
     "weight": 1,
     "raw": "— 빈 차입니다 — 흔들 콜이 없습니다"
    },
    {
     "key": "promise",
     "name": "약속",
     "score": null,
     "weight": 1,
     "raw": "— 잡아 둔 콜이 없습니다"
    },
    {
     "key": "space",
     "name": "공간",
     "score": null,
     "weight": 1,
     "raw": "— 빈 차입니다"
    },
    {
     "key": "nature",
     "name": "성질",
     "score": null,
     "weight": 1,
     "raw": "— 실린 짐이 없습니다"
    },
    {
     "key": "geography",
     "name": "지리",
     "score": 99,
     "weight": 1,
     "raw": "전진율 +0.97 → 배수 ×0.99"
    }
   ],
   "gates": [],
   "tags": [
    "주소 대략 — 하차 중리동 중심"
   ],
   "extraMin": 43
  },
  "t": "추천거리 15.5km, 소요 23분 (상차지까지 7분) '보통' · 60점",
  "r": [],
  "p": [
   "첫짐 절대하한가 통과",
   "꿀콜 🍯 (시세 1.2만 이상)"
  ],
  "st": "ORDER_AWAITING_DECISION",
  "d": [
   18,
   30,
   7,
   15.5
  ]
 },
 "preview": {
  "j": {
   "color": "똥",
   "score": 23,
   "bell": false,
   "foldable": true,
   "axes": [
    {
     "key": "money",
     "name": "돈",
     "score": 23,
     "weight": 1,
     "raw": "0.9만(기름 −0.2만 · 톨비 −0.1만) ÷ 43분 = 0.8만/h (첫짐 기준 2.5만) · 평소 하한(1.1만) 미달",
     "value": 0.763953488372093
    },
    {
     "key": "labor",
     "name": "노동강도",
     "score": 73,
     "weight": 1,
     "raw": "손 8분",
     "value": 8
    },
    {
     "key": "drive",
     "name": "운전",
     "score": 14,
     "weight": 1,
     "raw": "31km/h — 시내·국도",
     "value": 31.000000000000004
    },
    {
     "key": "wait",
     "name": "콜 대기",
     "score": 55,
     "weight": 1,
     "raw": "상차 +13분 · 배송 +12분 = 25분 · 약 1.2콜치 (상차 약속 20분 기준)",
     "value": 1.225
    },
    {
     "key": "calls",
     "name": "전화할 곳",
     "score": null,
     "weight": 1,
     "raw": "— 빈 차입니다 — 흔들 콜이 없습니다"
    },
    {
     "key": "promise",
     "name": "약속",
     "score": null,
     "weight": 1,
     "raw": "— 잡아 둔 콜이 없습니다"
    },
    {
     "key": "space",
     "name": "공간",
     "score": null,
     "weight": 1,
     "raw": "— 빈 차입니다"
    },
    {
     "key": "nature",
     "name": "성질",
     "score": null,
     "weight": 1,
     "raw": "— 실린 짐이 없습니다"
    },
    {
     "key": "geography",
     "name": "지리",
     "score": 99,
     "weight": 1,
     "raw": "전진율 +0.97 → 배수 ×0.99"
    }
   ],
   "gates": [],
   "tags": [
    "주소 대략 — 하차 중리동 중심",
    "요율 0.3만 모자람 — 시세 1.2만 · 실제 0.9만",
    "돈이 23점이라 총점을 41 → 23 로 눌렀습니다 (다른 기준은 깎기만 합니다)"
   ],
   "extraMin": 43
  },
  "t": "추천거리 15.5km, 소요 23분 (상차지까지 7분) '똥' · 23점",
  "r": [
   "첫짐 절대하한가 미달 (30,000원)",
   "요율 0.3만 모자람 — 시세 1.2만 · 실제 0.9만"
  ],
  "p": [],
  "st": "ORDER_AWAITING_DECISION",
  "d": [
   18,
   30,
   7,
   15.5
  ]
 },
 "merged": {
  "j": {
   "color": "보통",
   "score": 29,
   "bell": false,
   "foldable": true,
   "axes": [
    {
     "key": "money",
     "name": "돈",
     "score": 100,
     "weight": 1,
     "raw": "3.0만(기름 −0.1만 · 톨비 −0.1만) ÷ 28분 = 6.1만/h (보통 3.0만 · 꿀 5.0만)",
     "value": 6.128571428571429
    },
    {
     "key": "labor",
     "name": "노동강도",
     "score": 73,
     "weight": 1,
     "raw": "손 8분",
     "value": 8
    },
    {
     "key": "drive",
     "name": "운전",
     "score": 21,
     "weight": 1,
     "raw": "34km/h — 시내·국도",
     "value": 33.81818181818181
    },
    {
     "key": "wait",
     "name": "콜 대기",
     "score": 0,
     "weight": 1,
     "raw": "상차 -15분 · 배송 모름 = -15분 · 약 -0.8콜치 (상차 약속 20분 기준)",
     "value": -0.75
    },
    {
     "key": "calls",
     "name": "전화할 곳",
     "score": 100,
     "weight": 1,
     "raw": "없음 — 남을 안 건드립니다"
    },
    {
     "key": "promise",
     "name": "약속",
     "score": 100,
     "weight": 1,
     "raw": "최소 +2분"
    },
    {
     "key": "space",
     "name": "공간",
     "score": 80,
     "weight": 1,
     "raw": "여유 80%"
    },
    {
     "key": "nature",
     "name": "성질",
     "score": 100,
     "weight": 1,
     "raw": "문제 없음"
    },
    {
     "key": "geography",
     "name": "지리",
     "score": 20,
     "weight": 1,
     "raw": "전진율 -0.60 → 배수 ×0.60"
    }
   ],
   "gates": [],
   "tags": [
    "합짐",
    "우회 +15분 · +6km",
    "통화 필수 — 무통보 상차 한계 밖"
   ],
   "stops": [
    {
     "name": "노선콜 상차",
     "place": "곤지암읍",
     "stopType": "pickup",
     "promisedAt": "2026-10-07T03:10:00.000Z",
     "etaAt": "2026-10-07T03:08:00.000Z",
     "lateMin": -2,
     "confirmed": false,
     "arrived": false
    },
    {
     "name": "노선콜 하차",
     "place": "중리동",
     "stopType": "dropoff",
     "promisedAt": null,
     "etaAt": "2026-10-07T04:05:00.000Z",
     "lateMin": null,
     "confirmed": false,
     "arrived": false
    }
   ],
   "unknownWhy": null,
   "extraMin": 28
  },
  "t": "+6km, +15분 '보통' · 29점",
  "r": [
   "경유 미확정 (경로가 아직 안 잡혔습니다)"
  ],
  "p": [],
  "st": "ORDER_AWAITING_DECISION",
  "d": [
   31,
   55,
   null,
   null
  ]
 },
 "noCoord": {
  "j": {
   "color": "사고",
   "score": null,
   "bell": false,
   "foldable": true,
   "axes": [
    {
     "key": "money",
     "name": "돈",
     "score": null,
     "weight": 1,
     "raw": "⚠️ 걸리는 시간을 못 쟀습니다"
    },
    {
     "key": "labor",
     "name": "노동강도",
     "score": null,
     "weight": 1,
     "raw": "— 짐 미확인 — 통화로 정해집니다"
    },
    {
     "key": "drive",
     "name": "운전",
     "score": null,
     "weight": 1,
     "raw": "— 주행을 안 받았습니다"
    },
    {
     "key": "wait",
     "name": "콜 대기",
     "score": null,
     "weight": 1,
     "raw": "— 주행을 못 쟀습니다"
    },
    {
     "key": "calls",
     "name": "전화할 곳",
     "score": null,
     "weight": 1,
     "raw": "— 빈 차입니다 — 흔들 콜이 없습니다"
    },
    {
     "key": "promise",
     "name": "약속",
     "score": null,
     "weight": 1,
     "raw": "— 잡아 둔 콜이 없습니다"
    },
    {
     "key": "space",
     "name": "공간",
     "score": null,
     "weight": 1,
     "raw": "— 빈 차입니다"
    },
    {
     "key": "nature",
     "name": "성질",
     "score": null,
     "weight": 1,
     "raw": "— 실린 짐이 없습니다"
    },
    {
     "key": "geography",
     "name": "지리",
     "score": 50,
     "weight": 1,
     "raw": "하차지 좌표 미확인 — 방향 배수 ×1.0"
    }
   ],
   "gates": [],
   "tags": [
    "판정 불가 — 노선 후보콜의 상차지 주소를 찾지 못했습니다",
    "잴 수 없음 — 재료가 없어 점수를 못 냅니다"
   ]
  },
  "t": "카카오 연산 실패",
  "r": [
   "노선 후보콜의 상차지 주소를 찾지 못했습니다"
  ],
  "p": [
   "첫짐 절대하한가 통과"
  ],
  "st": "ORDER_AWAITING_DECISION",
  "d": [
   null,
   null,
   null,
   null
  ]
 },
 "noKey": {
  "j": {
   "color": "사고",
   "score": null,
   "bell": false,
   "foldable": true,
   "axes": [
    {
     "key": "money",
     "name": "돈",
     "score": null,
     "weight": 1,
     "raw": "⚠️ 걸리는 시간을 못 쟀습니다"
    },
    {
     "key": "labor",
     "name": "노동강도",
     "score": null,
     "weight": 1,
     "raw": "— 짐 미확인 — 통화로 정해집니다"
    },
    {
     "key": "drive",
     "name": "운전",
     "score": null,
     "weight": 1,
     "raw": "— 주행을 안 받았습니다"
    },
    {
     "key": "wait",
     "name": "콜 대기",
     "score": null,
     "weight": 1,
     "raw": "— 주행을 못 쟀습니다"
    },
    {
     "key": "calls",
     "name": "전화할 곳",
     "score": null,
     "weight": 1,
     "raw": "— 빈 차입니다 — 흔들 콜이 없습니다"
    },
    {
     "key": "promise",
     "name": "약속",
     "score": null,
     "weight": 1,
     "raw": "— 잡아 둔 콜이 없습니다"
    },
    {
     "key": "space",
     "name": "공간",
     "score": null,
     "weight": 1,
     "raw": "— 빈 차입니다"
    },
    {
     "key": "nature",
     "name": "성질",
     "score": null,
     "weight": 1,
     "raw": "— 실린 짐이 없습니다"
    },
    {
     "key": "geography",
     "name": "지리",
     "score": 50,
     "weight": 1,
     "raw": "하차지 좌표 미확인 — 방향 배수 ×1.0"
    }
   ],
   "gates": [],
   "tags": [
    "판정 불가 — API KEY 부재",
    "잴 수 없음 — 재료가 없어 점수를 못 냅니다"
   ]
  },
  "t": "카카오 연산 실패",
  "r": [
   "API KEY 부재"
  ],
  "p": [
   "첫짐 절대하한가 통과"
  ],
  "st": "ORDER_AWAITING_DECISION",
  "d": [
   null,
   null,
   null,
   null
  ]
 },
 "behind": {
  "j": {
   "color": "사고",
   "score": 52,
   "bell": true,
   "foldable": false,
   "axes": [
    {
     "key": "money",
     "name": "돈",
     "score": 100,
     "weight": 1,
     "raw": "6.0만(기름 −0.3만) ÷ 63분 = 5.4만/h (첫짐 기준 2.5만)",
     "value": 5.385714285714285
    },
    {
     "key": "labor",
     "name": "노동강도",
     "score": 73,
     "weight": 1,
     "raw": "손 8분",
     "value": 8
    },
    {
     "key": "drive",
     "name": "운전",
     "score": 6,
     "weight": 1,
     "raw": "28km/h — 시내·국도",
     "value": 27.6
    },
    {
     "key": "wait",
     "name": "콜 대기",
     "score": 27,
     "weight": 1,
     "raw": "상차 -5분 · 배송 +13분 = 8분 · 약 0.4콜치 (상차 약속 20분 기준)",
     "value": 0.375
    },
    {
     "key": "calls",
     "name": "전화할 곳",
     "score": null,
     "weight": 1,
     "raw": "— 빈 차입니다 — 흔들 콜이 없습니다"
    },
    {
     "key": "promise",
     "name": "약속",
     "score": null,
     "weight": 1,
     "raw": "— 잡아 둔 콜이 없습니다"
    },
    {
     "key": "space",
     "name": "공간",
     "score": null,
     "weight": 1,
     "raw": "— 빈 차입니다"
    },
    {
     "key": "nature",
     "name": "성질",
     "score": null,
     "weight": 1,
     "raw": "— 실린 짐이 없습니다"
    },
    {
     "key": "geography",
     "name": "지리",
     "score": 0,
     "weight": 1,
     "raw": "등 뒤 상차 — 목적지에서 멀어집니다"
    }
   ],
   "gates": [
    {
     "key": "geography",
     "name": "지리",
     "pass": false,
     "why": "등 뒤 상차 — 목적지에서 멀어집니다"
    }
   ],
   "tags": [
    "통화 필수 — 무통보 상차 한계 밖"
   ],
   "extraMin": 63
  },
  "t": "추천거리 23km, 소요 25분 (상차지까지 25분) '사고' · 52점",
  "r": [],
  "p": [
   "첫짐 절대하한가 통과",
   "꿀콜 🍯 (시세 1.8만 이상)"
  ],
  "st": "ORDER_AWAITING_DECISION",
  "d": [
   40,
   50,
   25,
   23
  ]
 },
 "mergedLow": {
  "j": {
   "color": "보통",
   "score": 8,
   "bell": false,
   "foldable": true,
   "axes": [
    {
     "key": "money",
     "name": "돈",
     "score": 8,
     "weight": 1,
     "raw": "1.6만(기름 −0.5만) ÷ 133분 = 0.5만/h (보통 3.0만 · 꿀 5.0만)",
     "value": 0.4849624060150376
    },
    {
     "key": "labor",
     "name": "노동강도",
     "score": 73,
     "weight": 1,
     "raw": "손 8분",
     "value": 8
    },
    {
     "key": "drive",
     "name": "운전",
     "score": 0,
     "weight": 1,
     "raw": "23km/h — 시내",
     "value": 22.5
    },
    {
     "key": "wait",
     "name": "콜 대기",
     "score": 0,
     "weight": 1,
     "raw": "상차 -15분 · 배송 모름 = -15분 · 약 -0.8콜치 (상차 약속 20분 기준)",
     "value": -0.75
    },
    {
     "key": "calls",
     "name": "전화할 곳",
     "score": 100,
     "weight": 1,
     "raw": "없음 — 남을 안 건드립니다"
    },
    {
     "key": "promise",
     "name": "약속",
     "score": 100,
     "weight": 1,
     "raw": "최소 +2분"
    },
    {
     "key": "space",
     "name": "공간",
     "score": 80,
     "weight": 1,
     "raw": "여유 80%"
    },
    {
     "key": "nature",
     "name": "성질",
     "score": 100,
     "weight": 1,
     "raw": "문제 없음"
    },
    {
     "key": "geography",
     "name": "지리",
     "score": 20,
     "weight": 1,
     "raw": "전진율 -0.60 → 배수 ×0.60"
    }
   ],
   "gates": [],
   "tags": [
    "합짐",
    "우회 +120분 · +35km",
    "통화 필수 — 무통보 상차 한계 밖",
    "돈이 8점이라 총점을 12 → 8 로 눌렀습니다 (다른 기준은 깎기만 합니다)"
   ],
   "stops": [
    {
     "name": "노선콜 상차",
     "place": "곤지암읍",
     "stopType": "pickup",
     "promisedAt": "2026-10-07T03:10:00.000Z",
     "etaAt": "2026-10-07T03:08:00.000Z",
     "lateMin": -2,
     "confirmed": false,
     "arrived": false
    },
    {
     "name": "노선콜 하차",
     "place": "중리동",
     "stopType": "dropoff",
     "promisedAt": null,
     "etaAt": "2026-10-07T04:05:00.000Z",
     "lateMin": null,
     "confirmed": false,
     "arrived": false
    }
   ],
   "unknownWhy": null,
   "extraMin": 133
  },
  "t": "+35km, +120분 '보통' · 8점",
  "r": [
   "경유 미확정 (경로가 아직 안 잡혔습니다)"
  ],
  "p": [],
  "st": "ORDER_AWAITING_DECISION",
  "d": [
   60,
   160,
   null,
   null
  ]
 }
};

let saved: any[] = [];
let emitted: any[] = [];
/** 관제웹 알림 — 그 순간 콜에 판정이 실려 있었나 · 사유 · 길찾기 글까지 같이 적는다(보내고 나서 싣는 순서를 잡는다) */
const io = { to: () => ({ emit: (ev, o) => { emitted.push([ev, o.id, o.judgment?.color ?? null, o.kakaoTimeExt ?? null, (o.rejectionReasons ?? []).length]); } }) };

beforeAll(() => { initGeoService(); });
beforeEach(() => {
    jest.useFakeTimers({ now: T, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'hrtime', 'performance'] });
    process.env.KAKAO_REST_API_KEY = 'test-key';
    clearBaseRouteCache();
    saved = []; emitted = [];
    jest.spyOn(SettingsRepository, 'getKakaoRoutingOptions').mockReturnValue({ carType: 1, defaultPriority: 'RECOMMEND', vehicleType: '1t' });
    jest.spyOn(SettingsRepository, 'getFuelCostPerKm').mockReturnValue(150);
    jest.spyOn(SettingsRepository, 'getHomeLocation').mockReturnValue(null);
    jest.spyOn(OrderRepository, 'saveJudgment').mockImplementation((id, u, j) => { saved.push({ id, j }); });
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

function make(u: string, f = {}) {
    clearUserSession(u);
    const s = getUserSession(u);
    Object.assign(s.activeFilter, { destinationCity: '이천시', callTarget: 'DEST', pickupRadiusKm: 10, allowedVehicleTypes: [], excludedKeywords: [],
        callDiscountPct: 10, dispatchPhase: 'STANDBY', slotsUsed: 20, capacityConfidence: 'CONFIRMED' }, f);
    Object.assign(s, { lastFix: MODA, lastFixAt: T, lastFixSource: 'gps', lastFixIsMock: false });
    s.myOrders = [];
    return s;
}
const order = (id: string, o = {}) => ({ id, pickup: '경기 광주시 곤지암읍', dropoff: '경기 이천시 중리동', vehicleType: '1t', fare: 45000, rawText: '',
    status: 'ORDER_SECURED_EVALUATING', capturedAt: new Date(T).toISOString(), ...o });
const seen = (o) => ({ j: o.judgment, t: o.kakaoTimeExt, r: o.rejectionReasons, p: o.approvalReasons, st: o.status,
    d: [o.totalDistanceKm, o.totalDurationMin, o.approachDurationMin, o.kakaoSoloDistanceKm] });
async function run(u: string, o, s) {
    s.pendingOrdersData.set(o.id, o);
    await new OrderEvaluator('insung').evaluate(u, o, io);
    return JSON.parse(JSON.stringify(seen(o)));
}
/** 판정은 한 번 저장되고(장부) · 콜에 실리고 · 관제웹에 한 번 간다 — 셋이 같은 판정이다 */
const savedOnce = (o) => {
    expect(saved.filter(x => x.id === o.id).length).toBe(1);
    const s = saved.find(x => x.id === o.id).j;
    expect(JSON.parse(JSON.stringify(s))).toMatchObject(JSON.parse(JSON.stringify(o.judgment)));
    /* 장부에는 판정 시작 때의 콜 · 필터 요약이 함께 간다 */
    expect(s.call).toMatchObject({ pickup: o.pickup, dropoff: o.dropoff, fare: o.fare, kind: o.isPreview ? '미리보기' : '콜' });
    expect(s.filter).toMatchObject({ destinationCity: '이천시', pickupRadiusKm: 10 });
    expect(emitted.filter(e => e[1] === o.id)).toEqual([['order-evaluated', o.id, o.judgment.color, o.kakaoTimeExt, o.rejectionReasons.length]]);
};

const soloGeo = async (a) => a.includes('곤지암') ? { ...GONJIAM, approxArea: null } : { ...TERMINAL, approxArea: '경기 이천시 중리동' };
const soloRoute = { distance: 18000, duration: 1800, polyline: [GONJIAM, TERMINAL], approachDistance: 2500, approachDuration: 420, tollKrw: 1200, roadEvent: null };

describe('🎨 판정 갈래 — 같은 콜에 같은 판정', () => {
    it('🔴 첫짐 단독 — 단가 · 노동 · 운전 · 대기 · 지리로 색과 점수 · 대략 주소 딱지 · 길찾기 글', async () => {
        jest.spyOn(kakao, 'geocodeCallAddress').mockImplementation(soloGeo);
        const solo = jest.spyOn(kakao, 'calculateSoloRoute').mockResolvedValue(soloRoute);
        const s = make('ev-solo');
        const o = order('o-solo');
        expect(await run('ev-solo', o, s)).toEqual(GOLDEN.solo);
        expect(solo).toHaveBeenCalledTimes(1);
        savedOnce(o);
    });

    it('🔴 미리보기 단가 미달 — 시세 하한을 다시 보고 똥 · «요율 모자람» 딱지와 사유', async () => {
        jest.spyOn(kakao, 'geocodeCallAddress').mockImplementation(soloGeo);
        jest.spyOn(kakao, 'calculateSoloRoute').mockResolvedValue(soloRoute);
        const s = make('ev-prev');
        const o = order('o-prev', { isPreview: true, fare: 9000 });
        expect(await run('ev-prev', o, s)).toEqual(GOLDEN.preview);
        savedOnce(o);
    });

    it('🔴 합짐 · 자리가 넘친다 — 적재 근거가 판정에 실린다: 신고한 적재면 공간 0점 · 추정 적재면 «잴 수 없음»', async () => {
        jest.spyOn(kakao, 'geocodeCallAddress').mockImplementation(async (a) => a.includes('신둔') ? { ...HD_SINDUN, approxArea: null } : { ...BUBAL, approxArea: null });
        jest.spyOn(kakao, 'calculateDetourRoute').mockResolvedValue({
            base: { duration: 2400, distance: 25000, polyline: [], tollKrw: 0 },
            merged: { duration: 3300, distance: 31000, polyline: [MODA, HD_SINDUN, TERMINAL, BUBAL], sectionDriveMin: [8, 20, 35, 45],
                sectionEtas: ['12:08', '12:20', '12:35', '12:45'], tollKrw: 500 },
            timeDiffMin: 15, distDiffKm: '6.0', tollDiffKrw: 500, roadEvent: null,
        });
        const full = async (u: string, capacityConfidence: string) => {
            const s = make(u, { dispatchPhase: 'GATHERING', isSharedMode: true, slotsUsed: 120, capacityConfidence });
            s.myOrders = [{ id: `${u}-kept`, status: 'ORDER_CONFIRMED', pickup: 'A', dropoff: 'B', pickupX: GONJIAM.x, pickupY: GONJIAM.y, dropoffX: TERMINAL.x, dropoffY: TERMINAL.y,
                fare: 40000, vehicleType: '1t', goalCity: '이천시', capturedAt: new Date(T - 600000).toISOString() }];
            const o = order(`${u}-o`, { pickup: '경기 이천시 신둔면', dropoff: '경기 이천시 부발읍', fare: 30000 });
            await run(u, o, s);
            return o.judgment;
        };
        const declared = await full('ev-full-d', 'DECLARED');
        expect(declared.color).toBe('사고');
        expect(declared.axes.find(a => a.key === 'space')).toMatchObject({ score: 0, raw: '자리 부족 -20% (신고)' });
        const estimated = await full('ev-full-e', 'ESTIMATED');
        expect(estimated.axes.find(a => a.key === 'space')).toMatchObject({ score: null, raw: '⚠️ 짐 크기 추정 — 확인하세요 · 자리 부족 -20% (추정)' });
        expect(estimated.color).toBe('보통');
        expect(estimated.tags.some((t: string) => t.includes('짐 크기 추정 — 확인하세요'))).toBe(true);
    });

    it('🔴 합짐 — 한계 우회 · 정거장 약속 · 공간 · 지리(꼬리 기점) · 합짐 경로가 콜에 실린다', async () => {
        jest.spyOn(kakao, 'geocodeCallAddress').mockImplementation(async (a) => a.includes('신둔') ? { ...HD_SINDUN, approxArea: null } : { ...BUBAL, approxArea: null });
        const solo = jest.spyOn(kakao, 'calculateSoloRoute');
        const detour = jest.spyOn(kakao, 'calculateDetourRoute').mockResolvedValue({
            base: { duration: 2400, distance: 25000, polyline: [], tollKrw: 0 },
            merged: { duration: 3300, distance: 31000, polyline: [MODA, HD_SINDUN, TERMINAL, BUBAL], sectionDriveMin: [8, 20, 35, 45],
                sectionEtas: ['12:08', '12:20', '12:35', '12:45'], tollKrw: 500 },
            timeDiffMin: 15, distDiffKm: '6.0', tollDiffKrw: 500, roadEvent: null,
        });
        const s = make('ev-merge', { dispatchPhase: 'GATHERING', isSharedMode: true });
        s.myOrders = [{ id: 'kept-1', status: 'ORDER_CONFIRMED', pickup: 'A', dropoff: 'B', pickupX: GONJIAM.x, pickupY: GONJIAM.y, dropoffX: TERMINAL.x, dropoffY: TERMINAL.y,
            fare: 40000, vehicleType: '1t', goalCity: '이천시', capturedAt: new Date(T - 600000).toISOString() }];
        const o = order('o-merge', { pickup: '경기 이천시 신둔면', dropoff: '경기 이천시 부발읍', fare: 30000 });
        expect(await run('ev-merge', o, s)).toEqual(GOLDEN.merged);
        expect(detour).toHaveBeenCalledTimes(1);
        expect(solo).not.toHaveBeenCalled();
        expect(o.routePolyline).toEqual([MODA, HD_SINDUN, TERMINAL, BUBAL]);
        savedOnce(o);
    });

    it('🔴 첫짐 등 뒤 상차 — 상차 반경 밖 뒤쪽(성남)에서 싣는 콜은 점수가 좋아도 사고', async () => {
        const SEONGNAM = { x: 127.13, y: 37.42 };
        jest.spyOn(kakao, 'geocodeCallAddress').mockImplementation(async (a) => a.includes('성남') ? { ...SEONGNAM, approxArea: null } : { ...TERMINAL, approxArea: null });
        jest.spyOn(kakao, 'calculateSoloRoute').mockResolvedValue({ distance: 40000, duration: 3000, polyline: [SEONGNAM, TERMINAL], approachDistance: 17000, approachDuration: 1500, tollKrw: 0, roadEvent: null });
        const s = make('ev-behind');
        const o = order('o-behind', { pickup: '경기 성남시 수정구', fare: 60000 });
        expect(await run('ev-behind', o, s)).toEqual(GOLDEN.behind);
        savedOnce(o);
    });

    it('🔴 합짐 싼 콜 · 긴 꼬리 — 「돈」이 포화되지 않는 자리에서 벗어난 분 · 기름값이 점수에 든다', async () => {
        jest.spyOn(kakao, 'geocodeCallAddress').mockImplementation(async (a) => a.includes('신둔') ? { ...HD_SINDUN, approxArea: null } : { ...BUBAL, approxArea: null });
        jest.spyOn(kakao, 'calculateDetourRoute').mockResolvedValue({
            base: { duration: 2400, distance: 25000, polyline: [], tollKrw: 0 },
            merged: { duration: 9600, distance: 60000, polyline: [MODA, HD_SINDUN, TERMINAL, BUBAL], sectionDriveMin: [8, 20, 35, 150],
                sectionEtas: ['12:08', '12:20', '12:35', '14:30'], tollKrw: 0 },
            timeDiffMin: 120, distDiffKm: '35.0', tollDiffKrw: 0, roadEvent: null,
        });
        const s = make('ev-mlow', { dispatchPhase: 'GATHERING', isSharedMode: true });
        s.myOrders = [{ id: 'kept-2', status: 'ORDER_CONFIRMED', pickup: 'A', dropoff: 'B', pickupX: GONJIAM.x, pickupY: GONJIAM.y, dropoffX: TERMINAL.x, dropoffY: TERMINAL.y,
            fare: 40000, vehicleType: '1t', goalCity: '이천시', capturedAt: new Date(T - 600000).toISOString() }];
        const o = order('o-mlow', { pickup: '경기 이천시 신둔면', dropoff: '경기 이천시 부발읍', fare: 16000 });
        expect(await run('ev-mlow', o, s)).toEqual(GOLDEN.mergedLow);
        savedOnce(o);
    });

    it('🔴 좌표를 못 찾으면 «판정 불가»(사고 · 점수 없음)로 끝난다 — 판정 없이 끝나지 않는다', async () => {
        jest.spyOn(kakao, 'geocodeCallAddress').mockResolvedValue(null);
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        const s = make('ev-nocoord');
        const o = order('o-nocoord');
        expect(await run('ev-nocoord', o, s)).toEqual(GOLDEN.noCoord);
        savedOnce(o);
        /* 서버 로그에도 판정 줄이 남는다 — 판정색은 로그에 있어야 한다 */
        expect(log.mock.calls.map(c => String(c[0])).filter(l => l.includes('🎨 [판정]') && l.includes('판정 불가')).length).toBe(1);
    });

    it('🔴 카카오 키가 없으면 «판정 불가 — API KEY 부재»', async () => {
        delete process.env.KAKAO_REST_API_KEY;
        const geo = jest.spyOn(kakao, 'geocodeCallAddress');
        const s = make('ev-nokey');
        const o = order('o-nokey');
        expect(await run('ev-nokey', o, s)).toEqual(GOLDEN.noKey);
        expect(geo).not.toHaveBeenCalled();
        savedOnce(o);
    });
});
