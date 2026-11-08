/**
 * 콜 칸 표
 * 누가: 지금은 /shared/ 보기 페이지만 읽는다
 * 언제: 콜 칸을 확인하거나 배차망 글을 칸에 맞출 때
 * 어디서: /shared/call/call-fields.table
 * 무엇을: 콜 칸마다 키값 · 설명 · 배차망별 원문 자리
 * 어떻게: TABLE 하나에 JSON 모양으로 적는다
 * 왜: 콜을 만드는 기준을 한 표로 보기 위해서다
 */
/** 📋 **콜 칸 표** — 칸과 값을 한곳에서 본다(`/shared/`). 고칠 때는 이 파일을 코드로 고친다. */
export const TABLE = /*JSON*/{
 "title": "콜 칸 표",
 "about": "콜이 가진 칸 하나가 한 줄 · 콜 한 건은 id 로 묶는다 · 판정 · 경로 · 정산 같은 계산 값은 넣지 않는다",
 "idPrefix": "C",
 "columns": [
  {
   "key": "id",
   "label": "아이디"
  },
  {
   "key": "key",
   "label": "키값"
  },
  {
   "key": "label",
   "label": "우리 기준 칸"
  },
  {
   "key": "desc",
   "label": "설명"
  },
  {
   "key": "kind",
   "label": "분류"
  },
  {
   "key": "required",
   "label": "필수"
  },
  {
   "key": "filledBy",
   "label": "누가 채우나"
  },
  {
   "key": "ledger",
   "label": "장부 칸"
  },
  {
   "key": "pageField",
   "label": "화면 칸"
  },
  {
   "key": "ref",
   "label": "연결"
  },
  {
   "key": "insung",
   "label": "인성",
   "network": true
  },
  {
   "key": "hwamul24",
   "label": "화물24시",
   "network": true
  },
  {
   "key": "kakaopicker",
   "label": "카카오픽커",
   "network": true
  },
  {
   "key": "isflex",
   "label": "인성플랙스",
   "network": true
  }
 ],
 "rows": [
  {
   "id": "C01",
   "key": "id",
   "label": "콜 번호",
   "desc": "콜 하나를 가리키는 번호",
   "required": "필수",
   "filledBy": "앱 목록",
   "ledger": "orders.id",
   "pageField": "orderNo",
   "insung": {
    "text": "원달앱이 정함",
    "state": "지금"
   },
   "hwamul24": {
    "text": "원달앱이 정함",
    "state": "지금"
   },
   "kakaopicker": {
    "text": "원달앱이 정함",
    "state": "지금"
   },
   "isflex": {
    "text": "원달앱이 정함",
    "state": "지금"
   },
   "kind": "내용",
   "ref": ""
  },
  {
   "id": "C02",
   "key": "targetApp",
   "label": "배차망",
   "desc": "어느 배차망의 콜인가",
   "required": "필수",
   "filledBy": "앱 요청 봉투",
   "ledger": "orders.targetApp",
   "pageField": "",
   "insung": {
    "text": "insung",
    "state": "지금"
   },
   "hwamul24": {
    "text": "hwamul24",
    "state": "지금"
   },
   "kakaopicker": {
    "text": "kakaopicker",
    "state": "지금"
   },
   "isflex": {
    "text": "isflex",
    "state": "지금"
   },
   "kind": "내용",
   "ref": ""
  },
  {
   "id": "C03",
   "key": "pickup",
   "label": "상차지",
   "desc": "목록 원문은 첫 상차 정거장 listText · 상세 주소는 그 정거장 addressDetail 로 옮기는 중 — 상세에서는 전체 주소여야 한다",
   "required": "필수",
   "filledBy": "앱 목록 · 앱 상세",
   "ledger": "orders.pickup",
   "pageField": "pickup",
   "insung": {
    "text": "목록 «출발지» 칸 → 출발지 상세 팝업 «위치»(시뮬)",
    "state": "지금",
    "reads": [
     {
      "page": "newCall",
      "field": "pickup",
      "part": ""
     }
    ],
    "how": "first"
   },
   "hwamul24": {
    "text": "목록 왼쪽 윗줄",
    "state": "지금"
   },
   "kakaopicker": {
    "text": "목록 몸통 줄(시 · 구 줄임 + 동) → 상세 사진 첫 정거장",
    "state": "지금",
    "reads": [
     {
      "page": "newCall",
      "field": "pickup",
      "part": ""
     }
    ],
    "how": "first"
   },
   "isflex": {
    "text": "목록 «출발지» 칸 → 상세 «출발» 다음",
    "state": "지금",
    "reads": [
     {
      "page": "newCall",
      "field": "pickup",
      "part": ""
     }
    ],
    "how": "first"
   },
   "kind": "내용",
   "ref": ""
  },
  {
   "id": "C04",
   "key": "dropoff",
   "label": "하차지",
   "desc": "목록 원문은 마지막 하차 정거장 listText · 상세 주소는 그 정거장 addressDetail 로 옮기는 중 — 상세에서는 전체 주소여야 한다",
   "required": "필수",
   "filledBy": "앱 목록 · 앱 상세",
   "ledger": "orders.dropoff",
   "pageField": "dropoff",
   "insung": {
    "text": "목록 «도착지» 칸 → 도착지 상세 팝업 «위치»(시뮬)",
    "state": "지금",
    "reads": [
     {
      "page": "newCall",
      "field": "dropoff",
      "part": ""
     }
    ],
    "how": "first"
   },
   "hwamul24": {
    "text": "목록 오른쪽 윗줄",
    "state": "지금"
   },
   "kakaopicker": {
    "text": "목록 꼬리표 줄 오른쪽 구 + 몸통 줄 오른쪽 동 → 상세 사진 둘째 정거장",
    "state": "지금",
    "reads": [
     {
      "page": "newCall",
      "field": "dropoff",
      "part": ""
     }
    ],
    "how": "first"
   },
   "isflex": {
    "text": "목록 «도착지» 칸 → 상세 «도착» 다음",
    "state": "지금",
    "reads": [
     {
      "page": "newCall",
      "field": "dropoff",
      "part": ""
     }
    ],
    "how": "first"
   },
   "kind": "내용",
   "ref": ""
  },
  {
   "id": "C05",
   "key": "fare",
   "label": "요금",
   "desc": "원 단위",
   "required": "필수",
   "filledBy": "앱 목록 · 앱 상세",
   "ledger": "orders.fare",
   "pageField": "fare",
   "insung": {
    "text": "목록 요금 칸(천 원 단위 · «30.8» = 30,800원) → 상세 «요금 :» 줄",
    "state": "지금",
    "reads": [
     {
      "page": "newCall",
      "field": "fare",
      "part": ""
     }
    ],
    "how": "first"
   },
   "hwamul24": {
    "text": "목록 오른쪽 아랫줄 → 상세 운송료 · 부가세 · 수납금액",
    "state": "지금",
    "reads": [
     {
      "page": "newCall",
      "field": "fare",
      "part": ""
     }
    ],
    "how": "first"
   },
   "kakaopicker": {
    "text": "목록 줄 오른쪽 → 상세 «최종 수익»",
    "state": "지금",
    "reads": [
     {
      "page": "newCall",
      "field": "fare",
      "part": ""
     }
    ],
    "how": "first"
   },
   "isflex": {
    "text": "목록 수입 칸 → 상세 «총 수입» 다음",
    "state": "지금",
    "reads": [
     {
      "page": "newCall",
      "field": "fare",
      "part": ""
     }
    ],
    "how": "first"
   },
   "kind": "내용",
   "ref": ""
  },
  {
   "id": "C06",
   "key": "vehicleType",
   "label": "콜 차종",
   "desc": "이 짐을 어떤 수단으로 옮기기를 원하나 · 단가의 기준 · 내 차와 다른 개념",
   "required": "짐 필수",
   "filledBy": "앱 목록",
   "ledger": "orders.vehicleType",
   "pageField": "vehicleType",
   "insung": {
    "text": "목록 차종 칸(«다» → 다마스) · 상세 «차량 :» 줄",
    "state": "지금",
    "reads": [
     {
      "page": "newCall",
      "field": "vehicleType",
      "part": ""
     }
    ],
    "how": "first"
   },
   "hwamul24": {
    "text": "목록 셋째 줄 앞 «낱말/…» 전체를 저장(예 «2.5톤/윙»)",
    "state": "지금"
   },
   "kakaopicker": {
    "text": "목록 «승» · 상세 «승용차» → 승용차 · «승» 없는 퀵 → 수단 상관없음 · 한차 → 모름",
    "state": "바뀜"
   },
   "isflex": {
    "text": "목록 · 상세 거리 아래(«오토» → 오토바이)",
    "state": "지금",
    "reads": [
     {
      "page": "newCall",
      "field": "vehicleType",
      "part": ""
     }
    ],
    "how": "first"
   },
   "kind": "내용",
   "ref": ""
  },
  {
   "id": "C07",
   "key": "itemSize",
   "label": "짐 크기",
   "desc": "라면박스 수의 재료 · 라면박스 = 41 × 31 × 28cm",
   "required": "짐 필수",
   "filledBy": "앱 목록 · 앱 상세",
   "ledger": "orders 칸 없음 (intel.itemSize)",
   "pageField": "itemSize",
   "insung": {
    "text": "— (콜 차종의 표준 박스로 센다)",
    "state": "없음"
   },
   "hwamul24": {
    "text": "— (콜 차종의 표준 박스로 센다)",
    "state": "없음"
   },
   "kakaopicker": {
    "text": "목록 꼬리표 크기 낱말 · 상세 «물품 정보» · 초소형 1 · 소형 2 · 중형 3박스로 환산",
    "state": "바뀜"
   },
   "isflex": {
    "text": "— (콜 차종의 표준 박스로 센다)",
    "state": "없음"
   },
   "kind": "내용",
   "ref": ""
  },
  {
   "id": "C08",
   "key": "itemDescription",
   "label": "짐 표시",
   "desc": "콜을 펼쳤을 때 차종 줄 아래 보이는 짐 칩",
   "required": "",
   "filledBy": "서버 원문",
   "ledger": "orders.itemDescription",
   "pageField": "itemSize",
   "insung": {
    "text": "상세 «물품 :» 줄",
    "state": "지금",
    "reads": [
     {
      "page": "newCall",
      "field": "itemSize",
      "part": ""
     }
    ],
    "how": "first"
   },
   "hwamul24": {
    "text": "—",
    "state": "없음"
   },
   "kakaopicker": {
    "text": "«라면박스 n개» · 치수 모르는 크기는 원문",
    "state": "바뀜"
   },
   "isflex": {
    "text": "—",
    "state": "없음"
   },
   "kind": "내용",
   "ref": ""
  },
  {
   "id": "C09",
   "key": "detailMemo",
   "label": "적요",
   "desc": "기사님이 읽는 글 · 통화 전에 읽는다",
   "required": "",
   "filledBy": "서버 원문",
   "ledger": "orders.detailMemo",
   "pageField": "memo",
   "insung": {
    "text": "적요 상세 팝업 «적요 내용» ~ «닫기»(시뮬) · 없으면 본문 «적요상세» 줄(시뮬)",
    "state": "지금",
    "reads": [
     {
      "page": "newCall",
      "field": "memo",
      "part": "popup"
     },
     {
      "page": "newCall",
      "field": "memo",
      "part": "body"
     }
    ],
    "how": "first"
   },
   "hwamul24": {
    "text": "화물 글: 목록 차종 뒤 글 · 상세 화물정보 칸. 지금은 콜에 안 실린다",
    "state": "답 대기",
    "reads": [
     {
      "page": "newCall",
      "field": "memo",
      "part": ""
     }
    ],
    "how": "first"
   },
   "kakaopicker": {
    "text": "상세 «물품 정보» 원문 + « / » + «유의사항»",
    "state": "바뀜",
    "reads": [
     {
      "page": "newCall",
      "field": "itemSize",
      "part": ""
     },
     {
      "page": "newCall",
      "field": "memo",
      "part": ""
     }
    ],
    "how": "join",
    "with": " / "
   },
   "isflex": {
    "text": "«적요상세» 다음(빈 적요는 «없음»)",
    "state": "지금",
    "reads": [
     {
      "page": "newCall",
      "field": "memo",
      "part": "body"
     }
    ],
    "how": "first"
   },
   "kind": "내용",
   "ref": ""
  },
  {
   "id": "C10",
   "key": "pickupDistance",
   "label": "상차지거리",
   "desc": "목록에서는 꼭 있어야 한다 — 첫 상차 정거장 distanceKm 로 옮기는 중(읽기는 firstStopKm)",
   "required": "목록 필수",
   "filledBy": "앱 목록",
   "ledger": "orders 칸 없음 (intel.pickupDistanceKm)",
   "pageField": "pickupDistance",
   "insung": {
    "text": "목록 거리 칸 윗줄",
    "state": "지금"
   },
   "hwamul24": {
    "text": "상차 배지 옆",
    "state": "지금"
   },
   "kakaopicker": {
    "text": "목록 몸통 줄 맨 앞",
    "state": "지금"
   },
   "isflex": {
    "text": "목록 맨 왼쪽 · 상세 «출발지까지» 다음",
    "state": "지금",
    "reads": [
     {
      "page": "newCall",
      "field": "pickupDistance",
      "part": ""
     }
    ],
    "how": "first"
   },
   "kind": "내용",
   "ref": ""
  },
  {
   "id": "C11",
   "key": "deliveryDistance",
   "label": "배송거리",
   "desc": "단가 계산의 재료 — 첫 상차 뒤 정거장 distanceKm 로 옮기는 중(읽기는 합 deliveryKmOf · 한 곳이라도 모르면 빈 값)",
   "required": "",
   "filledBy": "앱 목록",
   "ledger": "orders.deliveryDistance",
   "pageField": "deliveryDistance",
   "insung": {
    "text": "목록 거리 칸 아랫줄",
    "state": "지금"
   },
   "hwamul24": {
    "text": "—",
    "state": "없음"
   },
   "kakaopicker": {
    "text": "상세 «배송 ○km»는 읽고 쓰지 않음",
    "state": "없음"
   },
   "isflex": {
    "text": "출발지 아래 «약 ○km»",
    "state": "지금",
    "reads": [
     {
      "page": "newCall",
      "field": "deliveryDistance",
      "part": ""
     }
    ],
    "how": "first"
   },
   "kind": "내용",
   "ref": ""
  },
  {
   "id": "C12",
   "key": "reserved",
   "label": "예약 표시",
   "desc": "예약 표시가 있나 · 있는데 날을 못 읽으면 날 모름 — 예약 콜은 첫 상차 정거장 promiseText 의 «예약» 글자 · requestedDay 로 가르는 쪽(isReservedCall)으로 옮기는 중",
   "required": "",
   "filledBy": "앱 목록",
   "ledger": "orders.reserved",
   "pageField": "reservation",
   "insung": {
    "text": "출발지 칸 앞글자",
    "state": "지금"
   },
   "hwamul24": {
    "text": "상차 배지(당상 · 내상)",
    "state": "지금"
   },
   "kakaopicker": {
    "text": "꼬리표 «예약» · 상세 사진 띠",
    "state": "지금"
   },
   "isflex": {
    "text": "출발지 «@» 뒤 앞글자",
    "state": "지금"
   },
   "kind": "내용",
   "ref": ""
  },
  {
   "id": "C13",
   "key": "reservedDay",
   "label": "예약 날",
   "desc": "0 = 오늘 · 1 = 내일 — 첫 상차 정거장 requestedDay 로 옮기는 중",
   "required": "",
   "filledBy": "앱 목록",
   "ledger": "orders.reservedDay",
   "pageField": "reservation",
   "insung": {
    "text": "위 글에서 계산",
    "state": "지금"
   },
   "hwamul24": {
    "text": "위 글에서 계산",
    "state": "지금"
   },
   "kakaopicker": {
    "text": "위 글에서 계산 · 상세가 이김",
    "state": "지금"
   },
   "isflex": {
    "text": "위 글에서 계산",
    "state": "지금"
   },
   "kind": "내용",
   "ref": ""
  },
  {
   "id": "C14",
   "key": "reservedAt",
   "label": "예약 시각",
   "desc": "«HH:MM» — 첫 상차 정거장 requestedTime 으로 옮기는 중",
   "required": "",
   "filledBy": "앱 목록",
   "ledger": "orders.reservedAt",
   "pageField": "reservation",
   "insung": {
    "text": "위 글에서 계산",
    "state": "지금"
   },
   "hwamul24": {
    "text": "위 글에서 계산",
    "state": "지금"
   },
   "kakaopicker": {
    "text": "위 글에서 계산 · 상세가 이김",
    "state": "지금"
   },
   "isflex": {
    "text": "위 글에서 계산",
    "state": "지금"
   },
   "kind": "내용",
   "ref": ""
  },
  {
   "id": "C15",
   "key": "scheduleText",
   "label": "예약 원문",
   "desc": "예약 앞글자 원문 그대로 — 그 정거장 promiseText 로 옮기는 중",
   "required": "",
   "filledBy": "앱 목록",
   "ledger": "orders.scheduleText",
   "pageField": "reservation",
   "insung": {
    "text": "«낼7시/» · «21시/»",
    "state": "지금"
   },
   "hwamul24": {
    "text": "화물 글 상차 쪽",
    "state": "지금"
   },
   "kakaopicker": {
    "text": "«내일» · 시각 · 날짜 배지",
    "state": "지금"
   },
   "isflex": {
    "text": "«낼08:20/»",
    "state": "지금"
   },
   "kind": "내용",
   "ref": ""
  },
  {
   "id": "C16",
   "key": "postTime",
   "label": "올린 시각",
   "desc": "콜 올린 시각 · 뜻 확인 전인 배차망이 있다",
   "required": "",
   "filledBy": "앱 목록",
   "ledger": "orders.postTime",
   "pageField": "clock",
   "insung": {
    "text": "—",
    "state": "없음"
   },
   "hwamul24": {
    "text": "하차 배지 앞 시각(뜻 확인 전)",
    "state": "확인 필요"
   },
   "kakaopicker": {
    "text": "—",
    "state": "없음"
   },
   "isflex": {
    "text": "—",
    "state": "없음"
   },
   "kind": "내용",
   "ref": ""
  },
  {
   "id": "C17",
   "key": "pickupX",
   "label": "상차 좌표 X",
   "desc": "원달앱 명부 또는 서버 지오코딩",
   "required": "",
   "filledBy": "앱 목록 · 서버 계산",
   "ledger": "orders 칸 없음 (orderStops)",
   "pageField": "",
   "insung": {
    "text": "명부 · 서버",
    "state": "지금"
   },
   "hwamul24": {
    "text": "명부 · 서버",
    "state": "지금"
   },
   "kakaopicker": {
    "text": "명부 · 서버",
    "state": "지금"
   },
   "isflex": {
    "text": "명부 · 서버",
    "state": "지금"
   },
   "kind": "내용",
   "ref": ""
  },
  {
   "id": "C18",
   "key": "pickupY",
   "label": "상차 좌표 Y",
   "desc": "원달앱 명부 또는 서버 지오코딩",
   "required": "",
   "filledBy": "앱 목록 · 서버 계산",
   "ledger": "orders 칸 없음 (orderStops)",
   "pageField": "",
   "insung": {
    "text": "명부 · 서버",
    "state": "지금"
   },
   "hwamul24": {
    "text": "명부 · 서버",
    "state": "지금"
   },
   "kakaopicker": {
    "text": "명부 · 서버",
    "state": "지금"
   },
   "isflex": {
    "text": "명부 · 서버",
    "state": "지금"
   },
   "kind": "내용",
   "ref": ""
  },
  {
   "id": "C19",
   "key": "dropoffX",
   "label": "하차 좌표 X",
   "desc": "원달앱 명부 또는 서버 지오코딩",
   "required": "",
   "filledBy": "앱 목록 · 서버 계산",
   "ledger": "orders 칸 없음 (orderStops)",
   "pageField": "",
   "insung": {
    "text": "명부 · 서버",
    "state": "지금"
   },
   "hwamul24": {
    "text": "명부 · 서버",
    "state": "지금"
   },
   "kakaopicker": {
    "text": "명부 · 서버",
    "state": "지금"
   },
   "isflex": {
    "text": "명부 · 서버",
    "state": "지금"
   },
   "kind": "내용",
   "ref": ""
  },
  {
   "id": "C20",
   "key": "dropoffY",
   "label": "하차 좌표 Y",
   "desc": "원달앱 명부 또는 서버 지오코딩",
   "required": "",
   "filledBy": "앱 목록 · 서버 계산",
   "ledger": "orders 칸 없음 (orderStops)",
   "pageField": "",
   "insung": {
    "text": "명부 · 서버",
    "state": "지금"
   },
   "hwamul24": {
    "text": "명부 · 서버",
    "state": "지금"
   },
   "kakaopicker": {
    "text": "명부 · 서버",
    "state": "지금"
   },
   "isflex": {
    "text": "명부 · 서버",
    "state": "지금"
   },
   "kind": "내용",
   "ref": ""
  },
  {
   "id": "C21",
   "key": "orderForm",
   "label": "배송 형태",
   "desc": "보통 · 급송 등 · 다른 배차망은 예약 글이 실린다",
   "required": "",
   "filledBy": "서버 원문",
   "ledger": "orders.orderForm",
   "pageField": "reservation",
   "insung": {
    "text": "상세 «형태 :» 줄(실물 «예약»은 못 봄)",
    "state": "지금",
    "reads": [
     {
      "page": "newCall",
      "field": "reservation",
      "part": ""
     }
    ],
    "how": "first"
   },
   "hwamul24": {
    "text": "—",
    "state": "없음"
   },
   "kakaopicker": {
    "text": "상세 사진 띠 글이 실린다(뜻 다름)",
    "state": "확인 필요",
    "reads": [
     {
      "page": "newCall",
      "field": "reservation",
      "part": ""
     }
    ],
    "how": "first"
   },
   "isflex": {
    "text": "상세 «@» 뒤 앞글자가 실린다(뜻 다름)",
    "state": "확인 필요",
    "reads": [
     {
      "page": "newCall",
      "field": "reservation",
      "part": ""
     }
    ],
    "how": "first"
   },
   "kind": "내용",
   "ref": ""
  },
  {
   "id": "C22",
   "key": "tripType",
   "label": "배송 구분",
   "desc": "편도 · 왕복 등",
   "required": "",
   "filledBy": "서버 원문",
   "ledger": "orders.tripType",
   "pageField": "tags",
   "insung": {
    "text": "상세 «구분 :» 줄",
    "state": "지금",
    "reads": [
     {
      "page": "newCall",
      "field": "tags",
      "part": ""
     }
    ],
    "how": "first"
   },
   "hwamul24": {
    "text": "—",
    "state": "없음"
   },
   "kakaopicker": {
    "text": "—",
    "state": "없음"
   },
   "isflex": {
    "text": "«과적» 글자가 실린다(뜻 다름)",
    "state": "확인 필요",
    "reads": [
     {
      "page": "newCall",
      "field": "tags",
      "part": ""
     }
    ],
    "how": "first"
   },
   "kind": "내용",
   "ref": ""
  },
  {
   "id": "C23",
   "key": "tagsText",
   "label": "꼬리표",
   "desc": "배차망 표시 원문",
   "required": "",
   "filledBy": "앱 목록",
   "ledger": "orders 칸 없음 (intel.tagsText)",
   "pageField": "tags",
   "insung": {
    "text": "—",
    "state": "없음"
   },
   "hwamul24": {
    "text": "하차 배지 · 꼬리표",
    "state": "지금"
   },
   "kakaopicker": {
    "text": "꼬리표 줄(퀵 · 반나절 · 준비 29분 등)",
    "state": "지금"
   },
   "isflex": {
    "text": "차종 뒤 구분선 다음(«과적»)",
    "state": "지금"
   },
   "kind": "내용",
   "ref": ""
  },
  {
   "id": "C24",
   "key": "paymentType",
   "label": "결제",
   "desc": "신용 · 착불 등",
   "required": "",
   "filledBy": "서버 원문",
   "ledger": "orders.paymentType",
   "pageField": "payment",
   "insung": {
    "text": "상세 «요금 :» 줄 괄호",
    "state": "지금",
    "reads": [
     {
      "page": "newCall",
      "field": "payment",
      "part": ""
     }
    ],
    "how": "first"
   },
   "hwamul24": {
    "text": "상세 결제방법",
    "state": "지금",
    "reads": [
     {
      "page": "newCall",
      "field": "payment",
      "part": ""
     }
    ],
    "how": "first"
   },
   "kakaopicker": {
    "text": "— (목록 «착불» 배지는 있으나 칸 없음)",
    "state": "확인 필요"
   },
   "isflex": {
    "text": "수입 아래 글자 · 상세 적요 아래",
    "state": "지금",
    "reads": [
     {
      "page": "newCall",
      "field": "payment",
      "part": ""
     }
    ],
    "how": "first"
   },
   "kind": "내용",
   "ref": ""
  },
  {
   "id": "C25",
   "key": "billingType",
   "label": "계산서",
   "desc": "계산서 · 인수증 등",
   "required": "",
   "filledBy": "서버 원문",
   "ledger": "orders.billingType",
   "pageField": "billing",
   "insung": {
    "text": "상세 «요금 :» 둘째 괄호",
    "state": "지금",
    "reads": [
     {
      "page": "newCall",
      "field": "billing",
      "part": ""
     }
    ],
    "how": "first"
   },
   "hwamul24": {
    "text": "—",
    "state": "없음"
   },
   "kakaopicker": {
    "text": "—",
    "state": "없음"
   },
   "isflex": {
    "text": "—",
    "state": "없음"
   },
   "kind": "내용",
   "ref": ""
  },
  {
   "id": "C26",
   "key": "commissionRate",
   "label": "수수료",
   "desc": "수수료율",
   "required": "",
   "filledBy": "서버 원문",
   "ledger": "orders.commissionRate",
   "pageField": "commission",
   "insung": {
    "text": "상세 «수수료 :» 줄",
    "state": "지금",
    "reads": [
     {
      "page": "newCall",
      "field": "commission",
      "part": ""
     }
    ],
    "how": "first"
   },
   "hwamul24": {
    "text": "—",
    "state": "없음"
   },
   "kakaopicker": {
    "text": "—",
    "state": "없음"
   },
   "isflex": {
    "text": "—",
    "state": "없음"
   },
   "kind": "내용",
   "ref": ""
  },
  {
   "id": "C27",
   "key": "tollFare",
   "label": "탁송료",
   "desc": "탁송료 · 경유비",
   "required": "",
   "filledBy": "서버 원문",
   "ledger": "orders.tollFare",
   "pageField": "toll",
   "insung": {
    "text": "상세 «탁송료 :» 줄(시뮬)",
    "state": "지금",
    "reads": [
     {
      "page": "newCall",
      "field": "toll",
      "part": ""
     }
    ],
    "how": "first"
   },
   "hwamul24": {
    "text": "—",
    "state": "없음"
   },
   "kakaopicker": {
    "text": "—",
    "state": "없음"
   },
   "isflex": {
    "text": "—",
    "state": "없음"
   },
   "kind": "내용",
   "ref": ""
  },
  {
   "id": "C28",
   "key": "dispatcherName",
   "label": "배차사",
   "desc": "콜을 올린 사무실",
   "required": "",
   "filledBy": "서버 원문",
   "ledger": "orders.dispatcherName",
   "pageField": "contact",
   "insung": {
    "text": "상세 머리 줄 «배차사-전화» 앞(시뮬)",
    "state": "지금",
    "reads": [
     {
      "page": "newCall",
      "field": "contact",
      "part": "dispatcher"
     }
    ],
    "how": "first"
   },
   "hwamul24": {
    "text": "—",
    "state": "없음"
   },
   "kakaopicker": {
    "text": "—",
    "state": "없음"
   },
   "isflex": {
    "text": "—",
    "state": "없음"
   },
   "kind": "내용",
   "ref": ""
  },
  {
   "id": "C29",
   "key": "dispatcherPhone",
   "label": "배차사 전화",
   "desc": "사무실 연락처",
   "required": "",
   "filledBy": "서버 원문",
   "ledger": "orders.dispatcherPhone",
   "pageField": "contact",
   "insung": {
    "text": "상세 머리 줄 «배차사-전화» 뒤(시뮬)",
    "state": "지금",
    "reads": [
     {
      "page": "newCall",
      "field": "contact",
      "part": "dispatcherPhone"
     }
    ],
    "how": "first"
   },
   "hwamul24": {
    "text": "—",
    "state": "없음"
   },
   "kakaopicker": {
    "text": "—",
    "state": "없음"
   },
   "isflex": {
    "text": "—",
    "state": "없음"
   },
   "kind": "내용",
   "ref": ""
  },
  {
   "id": "C30",
   "key": "pickupDetails",
   "label": "상차지 연락처",
   "desc": "정거장 칸 — 목록 원문(listText) · 지역 · 상세 주소 · 고객 · 부서 · 담당 · 전화 · 안내 · 좌표(geo) · 정거장 거리(distanceKm)",
   "required": "",
   "filledBy": "서버 원문",
   "ledger": "orders 칸 없음 (orderStops · places)",
   "pageField": "contact",
   "insung": {
    "text": "출발지 상세 팝업(시뮬)",
    "state": "지금"
   },
   "hwamul24": {
    "text": "—",
    "state": "없음"
   },
   "kakaopicker": {
    "text": "— (상호는 화면에 있음 · 안 읽음)",
    "state": "없음"
   },
   "isflex": {
    "text": "—",
    "state": "없음"
   },
   "kind": "내용",
   "ref": ""
  },
  {
   "id": "C31",
   "key": "dropoffDetails",
   "label": "하차지 연락처",
   "desc": "정거장 칸 — 목록 원문(listText) · 지역 · 상세 주소 · 고객 · 부서 · 담당 · 전화 · 안내 · 좌표(geo) · 정거장 거리(distanceKm)",
   "required": "",
   "filledBy": "서버 원문",
   "ledger": "orders 칸 없음 (orderStops · places)",
   "pageField": "contact",
   "insung": {
    "text": "도착지 상세 팝업(시뮬)",
    "state": "지금"
   },
   "hwamul24": {
    "text": "—",
    "state": "없음"
   },
   "kakaopicker": {
    "text": "— (상호는 화면에 있음 · 안 읽음)",
    "state": "없음"
   },
   "isflex": {
    "text": "—",
    "state": "없음"
   },
   "kind": "내용",
   "ref": ""
  },
  {
   "id": "C32",
   "key": "receiptStatus",
   "label": "전표 상태",
   "desc": "신규 · 배송 등",
   "required": "",
   "filledBy": "서버 원문",
   "ledger": "orders 칸 없음",
   "pageField": "stage",
   "insung": {
    "text": "상세 «상태 :» 줄",
    "state": "지금",
    "reads": [
     {
      "page": "newCall",
      "field": "stage",
      "part": ""
     }
    ],
    "how": "first"
   },
   "hwamul24": {
    "text": "—",
    "state": "없음"
   },
   "kakaopicker": {
    "text": "—",
    "state": "없음"
   },
   "isflex": {
    "text": "—",
    "state": "없음"
   },
   "kind": "내용",
   "ref": ""
  },
  {
   "id": "C33",
   "key": "rawText",
   "label": "원문",
   "desc": "화면 글 전체 · 서버가 다시 잘라 읽는 재료",
   "required": "",
   "filledBy": "앱 목록 · 앱 상세",
   "ledger": "orders 칸 없음 (intel.rawDetailText)",
   "pageField": "",
   "insung": {
    "text": "접근성 글 + 팝업 글",
    "state": "지금"
   },
   "hwamul24": {
    "text": "접근성 글",
    "state": "지금"
   },
   "kakaopicker": {
    "text": "접근성 글 · 사진 판독 글",
    "state": "지금"
   },
   "isflex": {
    "text": "접근성 글",
    "state": "지금"
   },
   "kind": "내용",
   "ref": ""
  },
  {
   "id": "C34",
   "key": "status",
   "label": "진행 상태",
   "desc": "이 콜이 어디까지 왔나",
   "required": "",
   "filledBy": "서버",
   "ledger": "orders.status",
   "pageField": "",
   "kind": "상태",
   "ref": "값 표: call-status",
   "insung": {
    "text": "—",
    "state": "없음"
   },
   "hwamul24": {
    "text": "—",
    "state": "없음"
   },
   "kakaopicker": {
    "text": "—",
    "state": "없음"
   },
   "isflex": {
    "text": "—",
    "state": "없음"
   }
  },
  {
   "id": "C35",
   "key": "type",
   "label": "콜 종류",
   "desc": "직접 잡음 · 체험 여부를 함께 담는다",
   "required": "",
   "filledBy": "앱 · 서버",
   "ledger": "orders.type",
   "pageField": "",
   "kind": "성질",
   "ref": "",
   "insung": {
    "text": "—",
    "state": "없음"
   },
   "hwamul24": {
    "text": "—",
    "state": "없음"
   },
   "kakaopicker": {
    "text": "—",
    "state": "없음"
   },
   "isflex": {
    "text": "—",
    "state": "없음"
   }
  },
  {
   "id": "C36",
   "key": "capturedMode",
   "label": "그때 모드",
   "desc": "자동 · 알람 · 직접 · 체험 · 모름(옛 줄)",
   "required": "",
   "filledBy": "서버",
   "ledger": "orders.capturedMode",
   "pageField": "",
   "kind": "성질",
   "ref": "",
   "insung": {
    "text": "—",
    "state": "없음"
   },
   "hwamul24": {
    "text": "—",
    "state": "없음"
   },
   "kakaopicker": {
    "text": "—",
    "state": "없음"
   },
   "isflex": {
    "text": "—",
    "state": "없음"
   }
  },
  {
   "id": "C37",
   "key": "openedBy",
   "label": "누가 열었나",
   "desc": "원달앱 / 기사님",
   "required": "",
   "filledBy": "서버",
   "ledger": "orders.openedBy",
   "pageField": "",
   "kind": "성질",
   "ref": "",
   "insung": {
    "text": "—",
    "state": "없음"
   },
   "hwamul24": {
    "text": "—",
    "state": "없음"
   },
   "kakaopicker": {
    "text": "—",
    "state": "없음"
   },
   "isflex": {
    "text": "—",
    "state": "없음"
   }
  },
  {
   "id": "C38",
   "key": "isPreview",
   "label": "미리보기",
   "desc": "확정은 안 하고 판정만 보는 콜 · 예 → 아니오만",
   "required": "",
   "filledBy": "앱 요청 봉투",
   "ledger": "orders 칸 없음",
   "pageField": "",
   "kind": "성질",
   "ref": "",
   "insung": {
    "text": "—",
    "state": "없음"
   },
   "hwamul24": {
    "text": "—",
    "state": "없음"
   },
   "kakaopicker": {
    "text": "—",
    "state": "없음"
   },
   "isflex": {
    "text": "—",
    "state": "없음"
   }
  },
  {
   "id": "C39",
   "key": "isSimulated",
   "label": "체험",
   "desc": "예 → 아니오(기사님이 직접 확정할 때)",
   "required": "",
   "filledBy": "서버",
   "ledger": "orders 칸 없음",
   "pageField": "",
   "kind": "성질",
   "ref": "",
   "insung": {
    "text": "—",
    "state": "없음"
   },
   "hwamul24": {
    "text": "—",
    "state": "없음"
   },
   "kakaopicker": {
    "text": "—",
    "state": "없음"
   },
   "isflex": {
    "text": "—",
    "state": "없음"
   }
  },
  {
   "id": "C40",
   "key": "reservedFor",
   "label": "예약 보관 날",
   "desc": "KEEP 때 정해진다",
   "required": "",
   "filledBy": "서버",
   "ledger": "orders.reserved_for",
   "pageField": "",
   "kind": "성질",
   "ref": "",
   "insung": {
    "text": "—",
    "state": "없음"
   },
   "hwamul24": {
    "text": "—",
    "state": "없음"
   },
   "kakaopicker": {
    "text": "—",
    "state": "없음"
   },
   "isflex": {
    "text": "—",
    "state": "없음"
   }
  },
  {
   "id": "C41",
   "key": "ackedAt",
   "label": "폰이 받았음",
   "desc": "비어 있으면 서버를 다시 켤 때 그 진행 중 콜을 되살리지 않는다",
   "required": "",
   "filledBy": "서버",
   "ledger": "orders.ackedAt",
   "pageField": "",
   "kind": "성질",
   "ref": "",
   "insung": {
    "text": "—",
    "state": "없음"
   },
   "hwamul24": {
    "text": "—",
    "state": "없음"
   },
   "kakaopicker": {
    "text": "—",
    "state": "없음"
   },
   "isflex": {
    "text": "—",
    "state": "없음"
   }
  }
 ],
 "samples": {
  "insung": "고양퀵서비스-031-932-7722\n전표\n상태 : 신규\n물품 : 박스 1개\n차량 : 다마스\n탁송료 :\n수수료 : 23%\n요금 : 50,000(카드)(계산서)\n구분 : 편도\n형태 : 보통\n적요상세 *카고 입니다. 세금계산서필 03:57 상차.\n[적요상세/정보]\n적요 상세\n적요 내용\n까대기 있음 직접운반\n대기 30분\n닫기\n[출발지상세]\n고객 가나상사\n위치: 경기 광주시 경안동 1-2\n부서 물류팀\n담당 김철수\n전화1 010-1234-5678\n전화2 031-000-0000\n[도착지상세]\n고객\n다라상회\n위치\n서울 용산구 한남동 12\n전화1 010-9999-8888",
  "hwamul24": "화물상세정보 상차지 경기 군포 부곡동 하차지 서울 중구 을지로6가 톤수 1톤 차종 전체 운송료 60,000 부가세 6,000 결제방법 카드 배차신청",
  "kakaopicker": "픽업지 경기 성남시 수정구 신촌동 물품 정보 소형 세 변의 합 100cm ∙ 5kg 이하 최종 수익 10,830 10,830 배송비 9,730P 9,730P 프로모션 1,100P 1,100P 넘기기 수락하기 [사진]\n퀵 비즈\n경기 성남시 수정구 신촌동 픽업 18.9km\n서울 광진구 자양2동 배송 9.7km\n18:28까지 배송\nNC이스트폴\n물품 정보 소헝 세 변의 합 100cm · 5kg 이하\n최종 수익 10,830",
  "isflex": "출발지까지 24.4km 오토 과적 출발 약 31.0km @경기 수원시영통구 @낼08:20/수원이의동 도착 서울 중구 10:20전/쌍림동 적요상세 과적 아이스박스1(제품샘플)-착지시간꼭엄수/다른 곳 들르 총 수입 21,252원 닫기 21,252원 \n수행하기"
 }
}/*JSON*/ as const;
