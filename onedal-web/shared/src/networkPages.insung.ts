import type { NetworkPageSpec } from './networkPages';

/**
 * 📄 **인성 화면 정의** — 배차망 화면 정의 표(`networkPages.ts` — 칸 모양 · 기준 페이지 · 규칙은 거기)의 인성 몫.
 * 🔴 원천이다 — 원달앱 생성 파일은 `cd onedal-web && pnpm gen:pages` 로 뽑는다. 몸통은 JSON 표시 주석 둘 사이의 엄격한 JSON 이다(뽑는 스크립트와 원달앱 검사가 그 사이를 읽는다).
 */
export const INSUNG_PAGES: NetworkPageSpec = /*JSON*/{
  "about": ["📄 **인성 페이지 정의 — 화면 어디에 어떤 글자로 오나** (실물 캡처 ex_images/인성 · 시뮬 onedal-sim).", "⚠️ 실물 인성 앱은 아직 설치 전(사업자 없음) — REAL 은 캡처 몇 장이 근거다. 설치하면 이 표부터 다시 본다."],
  "modes": ["AUTO", "MANUAL", "SIMULATION", "ALARM"],
  "packageKeywords": ["insung"],
  "safeCancelSec": "safeCancelSecInsung",
  "detailBackSec": null,
  "rulesWhy": "자동에서 원달앱이 확정을 누르고 안전취소 시간 안에 결재를 기다린다 · 상세 머묾 시간은 없다(팝업 셋을 다 읽고 보낸다)",
  "excludeScan": ["memo", "payment", "tags"],
  "excludeScanWhy": "기사님 «인성은 적요»(+ 결제 괄호 «(착불)» · 구분 «왕복») — 주소 · 화주 이름 · 화면 머리 · 버튼은 안 본다",
  "addressCut": "\\(.*?\\)$",
  "addressCutWhy": "끝에 붙는 «(건물명)»을 지운다 — 첫 «(»부터 끝까지",
  "vehicleWords": [
    {"word": "오", "vehicle": "오토바이", "seen": "SIM"},
    {"word": "다", "vehicle": "다마스", "seen": "REAL"},
    {"word": "라", "vehicle": "라보", "seen": "REAL"},
    {"word": "승", "vehicle": "승용차", "seen": "SIM"},
    {"word": "1t", "vehicle": "1t", "seen": "REAL"},
    {"word": "1.4", "vehicle": "1.4t", "seen": "SIM"},
    {"word": "2.5t", "vehicle": "2.5t", "seen": "SIM"},
    {"word": "2.5", "vehicle": "2.5t", "seen": "SIM"},
    {"word": "3.5t", "vehicle": "3.5t", "seen": "SIM"},
    {"word": "3.5", "vehicle": "3.5t", "seen": "SIM"},
    {"word": "5t", "vehicle": "5t", "seen": "SIM"},
    {"word": "11t", "vehicle": "11t", "seen": "SIM"},
    {"word": "14t", "vehicle": null, "seen": "SIM"},
    {"word": "18t", "vehicle": null, "seen": "SIM"},
    {"word": "25t", "vehicle": "25t", "seen": "SIM"}
  ],
  "vehicleWordsWhy": "목록 차종 칸 한 노드(«다» · «1t») 또는 요금과 뭉친 노드(«라2.2»)의 앞 낱말 — 카드 묶기 닻도 이 낱말들이다 · REAL 은 표 견본 «1t · 다 · 라», 나머지는 시뮬레이터 목록",
  "networkMarkers": [["신규", "빠른설정"], ["적요상세", "요금"], ["인성퀵화면분할"]],
  "networkMarkersWhy": "목록 머리(«신규» + «빠른설정») · 상세(«적요상세» + «요금») · 첫 화면(«인성퀵화면분할» — 홈에서 바로 알아보기)",
  "screens": [
    {"name": "확정 뒤 상세", "standard": "DETAIL_CONFIRMED", "bases": ["confirm", "myorder"], "buttons": {"keep": "닫기", "cancel": "취소"}, "match": [{"all": ["적요상세"], "any": ["인수증 전송", "카드 승인"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/인성/상세-확정(다른사람 못잡음, 취소+1).png", "ex_images/인성/상세-미확정1.png (내용은 확정 뒤 상세)", "ex_images/인성/상세-미확정2.png (내용은 확정 뒤 상세)", "ex_images/인성/상세-미확정5.png (내용은 확정 뒤 상세)", "ex_images/인성/상세와확정.png (가운데 폰 — 금액 줄 «실운임 :»)"], "overlays": [
      {"name": "출발지 상세 팝업", "kind": "POPUP", "match": [{"any": ["출발지 상세", "상차지 상세"]}], "meaning": "출발지 고객 · 부서 · 담당 · 전화 · 위치를 보여 준다", "action": "FILL_PICKUP", "seen": "REAL", "evidence": ["ex_images/인성/출발지상세.png"]},
      {"name": "도착지 상세 팝업", "kind": "POPUP", "match": [{"any": ["도착지 상세", "하차지 상세"]}], "meaning": "도착지 고객 · 부서 · 담당 · 전화 · 위치를 보여 준다", "action": "FILL_DROPOFF", "seen": "REAL", "evidence": ["ex_images/인성/도착지상세.png"]},
      {"name": "적요 상세 팝업", "kind": "POPUP", "match": [{"all": ["적요 상세", "적요 내용"]}], "meaning": "적요 전문을 보여 준다", "action": "FILL_MEMO", "seen": "SIM", "evidence": ["ex_images/인성/적요상세.png (시뮬레이터 화면)"], "toCollect": "실물 캡처"},
      {"name": "취소 확인 팝업", "kind": "POPUP", "match": [], "meaning": "확정 뒤 취소를 누르면 한 번 더 묻는다", "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자"},
      {"name": "취소 불가 팝업", "kind": "POPUP", "match": [{"any": ["취소할 수 없"], "none": ["적요상세"]}], "meaning": "안전취소 시간이 지나 취소할 수 없다", "action": "ERROR", "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처"}
    ]},
    {"name": "확정 전 상세", "standard": "DETAIL_PRE_CONFIRM", "bases": ["detail"], "buttons": {"accept": "확정", "filterOut": "취소"}, "match": [{"all": ["적요상세", "확정"], "any": ["요금", "실운임"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/인성/상세-미확정(다른사람 잡을수 있음).png", "ex_images/인성/상세-미확정3.png", "ex_images/인성/상세-미확정4.png"], "overlays": [
      {"name": "출발지 상세 팝업", "kind": "POPUP", "match": [{"any": ["출발지 상세", "상차지 상세"]}], "meaning": "출발지 고객 · 부서 · 담당 · 전화 · 위치를 보여 준다", "action": "FILL_PICKUP", "seen": "REAL", "evidence": ["ex_images/인성/출발지상세.png"]},
      {"name": "도착지 상세 팝업", "kind": "POPUP", "match": [{"any": ["도착지 상세", "하차지 상세"]}], "meaning": "도착지 고객 · 부서 · 담당 · 전화 · 위치를 보여 준다", "action": "FILL_DROPOFF", "seen": "REAL", "evidence": ["ex_images/인성/도착지상세.png"]},
      {"name": "적요 상세 팝업", "kind": "POPUP", "match": [{"all": ["적요 상세", "적요 내용"]}], "meaning": "적요 전문을 보여 준다", "action": "FILL_MEMO", "seen": "SIM", "evidence": ["ex_images/인성/적요상세.png (시뮬레이터 화면)"], "toCollect": "실물 캡처"},
      {"name": "계산서 오더 안내 띠", "kind": "BANNER", "match": [{"any": ["계산서 발급오더의 경우"]}], "meaning": "계산서 오더 — 위수탁세금계산서 발행에 동의한 기사만 처리 · 부가세 포함 입금", "seen": "REAL", "evidence": ["ex_images/인성/상세-미확정3.png", "ex_images/인성/상세-미확정4.png"]},
      {"name": "확정 확인 팝업", "kind": "POPUP", "match": [], "meaning": "확정을 누르면 한 번 더 묻는다", "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자"},
      {"name": "이미 배차됨 팝업", "kind": "POPUP", "match": [], "meaning": "남이 먼저 잡았다", "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자"},
      {"name": "확정 실패 팝업", "kind": "POPUP", "match": [{"any": ["시간이 지나", "실패"], "none": ["적요상세"]}], "meaning": "확정이 안 됐다 — 적요 글의 «실패» · «시간이 지나»와 가를 머리 글자가 필요하다", "action": "ERROR", "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 팝업 머리 글자"}
    ]},
    {"name": "홈 «인성퀵화면분할»", "standard": "HOME", "bases": ["home"], "match": [{"all": ["인성퀵화면분할"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/인성/인성홈.png"], "overlays": []},
    {"name": "신규 콜 목록", "standard": "LIST", "bases": ["list"], "match": [{"all": ["신규", "빠른설정"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/인성/위아래나뉜인성콜리스트.png", "ex_images/인성/인성콜_스플릿오더화면.png"], "overlays": [
      {"name": "로딩 토스트", "kind": "TOAST", "match": [{"any": ["오더 조회", "기다려 주십"]}], "meaning": "목록을 다시 불러오는 중 — 이 화면은 건너뛴다", "action": "SKIP", "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처"},
      {"name": "메뉴 드롭다운", "kind": "POPUP", "match": [], "meaning": "목록 머리 «메뉴»를 누르면 펼쳐진다", "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자"},
      {"name": "빈 목록 안내", "kind": "BANNER", "match": [{"any": ["대기 중인 오더가 없"]}], "meaning": "지금 신규 콜이 없다", "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처"}
    ]},
    {"name": "완료 탭", "standard": "MY_ORDERS", "bases": ["myorders"], "match": [{"all": ["완료", "신규"], "none": ["빠른설정"]}], "listReturn": true, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 메시지함 · GPS 탭과 가를 글자(지금 글자는 그 탭에도 맞는다)", "overlays": []},
    {"name": "메시지함 탭", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자", "overlays": []},
    {"name": "GPS 탭", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자", "overlays": []},
    {"name": "게시판", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자", "overlays": []},
    {"name": "환경설정", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자", "overlays": []},
    {"name": "당일정산", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자", "overlays": []},
    {"name": "전표", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자", "overlays": []},
    {"name": "탁송", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (상세 바닥 «탁송» 버튼 뒤)", "overlays": []},
    {"name": "카드 승인", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (확정 뒤 상세 «카드 승인» 버튼 뒤)", "overlays": []},
    {"name": "인수증 전송", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (확정 뒤 상세 «인수증 전송» 버튼 뒤)", "overlays": []},
    {"name": "로그인", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자", "overlays": []}
  ],
  "sameFieldsAs": {"myorder": {"as": "confirm", "seen": "SIM", "why": "완료 탭에서 연 콜 — 확정 뒤 상세와 같은 모양 · 시뮬레이터 InsungOngoingDetailScreen 로만 봄"}},
  "pages": {
    "list": [
      {"field": "pickup", "where": "출발지 칸", "sample": "@초이동 · @남양주(오남", "seen": "REAL", "handling": "READ", "usedAt": "InsungParser.parse"},
      {"field": "dropoff", "where": "도착지 칸", "sample": "이태원동 · 김포(대곶면", "seen": "REAL", "handling": "READ", "usedAt": "InsungParser.parse"},
      {"field": "reservation", "where": "출발지 칸 앞글자", "sample": "낼7시/ · 낼6시30/ · 21시/(시각만 · 오늘) · 오후7시30/(시각만 · 오늘) · 10일/", "seen": "REAL", "handling": "READ", "usedAt": "InsungParser.reservationOf"},
      {"field": "clock", "where": "도착지 칸 앞글자 (도착 약속)", "sample": "낼8/ · 8시/ · 낼10시/", "seen": "REAL", "handling": "DROPPED", "usedAt": "InsungParser.parse — 출발지 쪽이 있으면 버림"},
      {"field": "vehicleType", "where": "차종 칸", "sample": "1t · 다 · 라 · 1t화물", "seen": "REAL", "handling": "READ", "usedAt": "InsungParser.readVehicleAndFare"},
      {"field": "fare", "where": "요금 칸 (만 원)", "sample": "40.0 · 270.0", "seen": "REAL", "handling": "READ", "usedAt": "InsungParser.readVehicleAndFare"},
      {"field": "pickupDistance", "where": "거리 칸 윗줄", "sample": "17.8", "seen": "REAL", "handling": "READ", "usedAt": "InsungParser.parse"},
      {"field": "deliveryDistance", "where": "거리 칸 아랫줄", "sample": "0.0 · 341.3", "seen": "REAL", "handling": "READ", "usedAt": "InsungParser.parse"}
    ],
    "detail": [
      {"field": "stage", "where": "상태 줄", "sample": "상태 : 배송", "seen": "REAL", "handling": "READ", "usedAt": "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다", "read": "상태\\s*:\\s*(?!\\S*\\s*:)(\\S+)", "presence": "ALWAYS", "presenceEvidence": {"seen": 3, "of": 3, "from": "실물 캡처 ex_images/인성 확정 전 상세 3건(상세-미확정(다른사람 잡을수 있음) · 상세-미확정3 · 상세-미확정4) — 확정 뒤 5건은 다른 화면이라 따로 적음 · 확정 전 «배차» · 확정 뒤 «배송»"}},
      {"field": "itemSize", "where": "물품 줄", "sample": "물품 :", "seen": "REAL", "handling": "READ", "usedAt": "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다 · 값이 다음 줄에 있으면 그 줄(다른 칸 줄이면 안 읽는다)", "read": "물품[ \\t]*:[ \\t]*(?:\\n(?![^\\n]*:))?([^\\n]+)", "note": "실물: 이름표 «물품 :» 은 확정 전 3/3 늘 있지만 값은 0/7(확정 전 «--» · 확정 뒤 빈칸) — 읽는 법은 값을 읽으니 분류하지 않는다(늘 있음이면 «사라짐» 거짓 경고)"},
      {"field": "vehicleType", "where": "차량 줄", "sample": "차량 : 트럭-1t · 다마스", "seen": "REAL", "handling": "READ", "usedAt": "서버 detail.ts pageFieldOf — 원달앱 값 · 목록 차종이 없을 때만(원달앱은 아직 이 칸을 안 읽는다)", "read": "차량\\s*:\\s*(?!\\S*\\s*:)([^\\s(]+)", "note": "🚚 빈 «차량 :» 뒤의 다음 이름표(«탁송료 :»)를 차종으로 잡지 않는다 — 값 토막 뒤가 바로 «:» 이면 이름표다", "presence": "ALWAYS", "presenceEvidence": {"seen": 3, "of": 3, "from": "실물 캡처 ex_images/인성 확정 전 상세 3건(상세-미확정(다른사람 잡을수 있음) · 상세-미확정3 · 상세-미확정4) — 확정 뒤 5건은 다른 화면이라 따로 적음 · 확정 전은 짧은 글자(«다» · «1t» · «트») · 확정 뒤 «다마스» · «트럭-1t»"}},
      {"field": "fare", "where": "요금 줄", "sample": "요금 : 85,000(신용)(계산서)", "seen": "REAL", "handling": "READ", "usedAt": "목록 값 · 목록 줄을 못 찾은 손 상세는 PageFieldRead(PreConfirmSequence)", "read": "요금\\s*:\\s*([\\d,]+)(?![\\d.])", "presence": "ALWAYS", "presenceEvidence": {"seen": 3, "of": 3, "from": "실물 캡처 ex_images/인성 확정 전 상세 3건(상세-미확정(다른사람 잡을수 있음) · 상세-미확정3 · 상세-미확정4) — 확정 뒤 5건은 다른 화면이라 따로 적음 · 확정 뒤 1건(상세와확정.png)은 이름표가 «실운임 :» — 지금 읽는 법 «요금 :» 이 못 읽는다"}},
      {"field": "payment", "where": "요금 줄 괄호", "sample": "(신용)(계산서)", "seen": "REAL", "handling": "READ", "usedAt": "서버 제외어 찾는 칸(excludeScan) · 서버 결제 칸(«착불» 정산) — 첫 괄호 «(카드)» · «(착불)» · 원달앱은 이 칸을 안 읽는다", "read": "요금\\s*:\\s*[\\d,]+\\(([^)]*)\\)", "presence": "ALWAYS", "presenceEvidence": {"seen": 3, "of": 3, "from": "실물 캡처 ex_images/인성 확정 전 상세 3건(상세-미확정(다른사람 잡을수 있음) · 상세-미확정3 · 상세-미확정4) — 확정 뒤 5건은 다른 화면이라 따로 적음 · 값은 실물 전부 «신용» — 착불 · 카드는 실물에서 못 봄"}},
      {"field": "billing", "where": "요금 줄 둘째 괄호", "sample": "요금 : 85,000(신용)(계산서)", "seen": "REAL", "handling": "READ", "usedAt": "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다", "read": "요금\\s*:\\s*[\\d,]+\\([^)]*\\)\\(([^)]*)\\)", "presence": "SOMETIMES", "presenceEvidence": {"seen": 2, "of": 3, "from": "실물 캡처 ex_images/인성 확정 전 상세 3건(상세-미확정(다른사람 잡을수 있음) · 상세-미확정3 · 상세-미확정4) — 확정 뒤 5건은 다른 화면이라 따로 적음"}},
      {"field": "commission", "where": "수수료 줄", "sample": "수수료 : 23%", "seen": "REAL", "handling": "READ", "usedAt": "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다", "read": "수수료\\s*:\\s*(\\d+(?:\\.\\d+)?%)", "presence": "ONCE", "presenceEvidence": {"seen": 1, "of": 3, "from": "실물 캡처 ex_images/인성 확정 전 상세 3건(상세-미확정(다른사람 잡을수 있음) · 상세-미확정3 · 상세-미확정4) — 확정 뒤 5건은 다른 화면이라 따로 적음 · 신한로직스 한 콜"}},
      {"field": "toll", "where": "탁송료 줄", "sample": "탁송료 : 3,000 · 탁송료 :(빈 칸)", "seen": "SIM", "handling": "READ", "usedAt": "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다 · 빈 칸이면 다음 줄을 줍지 않는다", "read": "탁송료[ \\t]*:[ \\t]*([\\d,]+)"},
      {"field": "tags", "where": "구분 줄", "sample": "구분 : 편도", "seen": "REAL", "handling": "READ", "usedAt": "서버 제외어 찾는 칸(excludeScan) — «편도» · «왕복» · 원달앱은 이 칸을 안 읽는다", "read": "구분\\s*:\\s*(?!\\S*\\s*:)(\\S+)", "presence": "ALWAYS", "presenceEvidence": {"seen": 3, "of": 3, "from": "실물 캡처 ex_images/인성 확정 전 상세 3건(상세-미확정(다른사람 잡을수 있음) · 상세-미확정3 · 상세-미확정4) — 확정 뒤 5건은 다른 화면이라 따로 적음 · 값은 실물 전부 «편도»"}},
      {"field": "reservation", "where": "형태 줄", "sample": "형태 : 보통 (실물에서 «예약»은 못 봄)", "seen": "UNKNOWN", "handling": "READ", "usedAt": "서버 원문 칸 읽기 — «보통» · «급송»(급송 isExpress 를 켜는지는 69 결정 · 서버가 켤 때까지 안 읽음) · 원달앱은 이 칸을 안 읽는다", "read": "형태\\s*:\\s*(?!\\S*\\s*:)(\\S+)"},
      {"field": "memo", "where": "적요 칸 · 적요 상세 팝업", "sample": "1시상차 6박스 카트가지고 고객님앞 갖다주세요", "seen": "REAL", "handling": "READ", "usedAt": "서버 제외어 찾는 칸(excludeScan) — 적요 상세 팝업 «적요 내용»(팝업을 못 열었으면 본문 «적요상세» 줄)부터 적요가 끝나는 자리 — 팝업 «닫기» · 거리 줄 «현위치 →» · 화주 머리 «의뢰지» · 출발지 · 도착지 팝업 머리 — 앞까지 — 적요가 아닌 화주 이름 · 버튼 글을 안 먹게(«[적요상세/정보]» 머리표는 시작으로 안 친다 · 끝 자리가 하나도 없는 원문은 끝까지 읽는다) · 원달앱은 이 칸을 안 읽는다", "read": "(?:적요 내용|적요상세(?!/)(?![\\s\\S]*적요 내용))\\s+([\\s\\S]*?)(?=\\s*(?:\\[출발지상세\\]|\\[도착지상세\\]|현위치\\s*→|의뢰지|닫기)|$)", "presence": "ALWAYS", "presenceEvidence": {"seen": 3, "of": 3, "from": "실물 캡처 ex_images/인성 확정 전 상세 3건(상세-미확정(다른사람 잡을수 있음) · 상세-미확정3 · 상세-미확정4) — 확정 뒤 5건은 다른 화면이라 따로 적음 · 회색 상자 1~3줄"}},
      {"field": "memo", "where": "적요 상세 팝업 «적요 내용» ~ «닫기»", "sample": "까대기 있음 직접운반 / 대기 30분", "seen": "SIM", "handling": "READ", "usedAt": "서버 적요(detailMemo) — 줄바꿈을 공백으로 접는 것은 서버 · 원달앱은 이 칸을 안 읽는다", "read": "적요 내용\\s+([\\s\\S]*?)\\s*닫기", "part": "popup"},
      {"field": "memo", "where": "본문 «적요상세» 줄", "sample": "적요상세 10시전하차 착불", "seen": "SIM", "handling": "READ", "usedAt": "서버 적요(detailMemo) — 팝업이 없을 때 · 원달앱은 이 칸을 안 읽는다", "read": "적요상세(?!/)[ \\t]+([^\\n]+)", "part": "body"},
      {"field": "pickupDistance", "where": "적요 칸 둘째 줄", "sample": "현위치 → 상차지(직선)23.5KM", "seen": "REAL", "handling": "UNUSED", "presence": "ALWAYS", "presenceEvidence": {"seen": 3, "of": 3, "from": "실물 캡처 ex_images/인성 확정 전 상세 3건(상세-미확정(다른사람 잡을수 있음) · 상세-미확정3 · 상세-미확정4) — 확정 뒤 5건은 다른 화면이라 따로 적음 · 자리는 «적요 글 바로 다음 줄»(적요 줄 수에 따라 3 · 4번째 줄)"}},
      {"field": "deliveryDistance", "where": "적요 칸 셋째 줄", "sample": "상차지 → 하차지(직선)35.9KM", "seen": "REAL", "handling": "UNUSED", "note": "실물: 확정 전 상세 0/3 · 확정 뒤 5/5 — 확정 뒤에만 나온다(같은 콜 신한로직스로 확인)"},
      {"field": "pickup", "where": "출발지 상세 팝업 «위치»", "sample": "경기 용인시 처인구 양지면 …", "seen": "SIM", "handling": "READ", "usedAt": "InsungPopupAddress · 서버 원문 칸 읽기(위치 — 이름표만 있는 줄이면 다음 줄 값)", "read": "\\[출발지상세\\](?:(?!\\[도착지상세\\])[\\s\\S])*?\\n위치[ \\t]*:?[ \\t]*(?:\\n[ \\t]*)?([^\\n]+)"},
      {"field": "dropoff", "where": "도착지 상세 팝업 «위치»", "sample": "서울 강남구 역삼동 …", "seen": "SIM", "handling": "READ", "usedAt": "InsungPopupAddress · 서버 원문 칸 읽기(위치 — 이름표만 있는 줄이면 다음 줄 값)", "read": "\\[도착지상세\\](?:(?!\\[출발지상세\\])[\\s\\S])*?\\n위치[ \\t]*:?[ \\t]*(?:\\n[ \\t]*)?([^\\n]+)"},
      {"field": "clock", "where": "출발지 줄 가운데", "sample": "김유정 / 20시/양지면(용인", "seen": "REAL", "handling": "UNUSED", "presence": "ONCE", "presenceEvidence": {"seen": 1, "of": 3, "from": "실물 캡처 ex_images/인성 확정 전 상세 3건(상세-미확정(다른사람 잡을수 있음) · 상세-미확정3 · 상세-미확정4) — 확정 뒤 5건은 다른 화면이라 따로 적음 · 형식이 제각각(«@1시» · «20시» · «11시반)» · «4월8일/17픽») — 확정 뒤 포함 4/7"}},
      {"field": "contact", "where": "위치 팝업", "sample": "고객 · 부서 · 담당 · 전화1 · 전화2", "seen": "SIM", "handling": "UNUSED", "usedAt": "서버가 원문으로 받는다"},
      {"field": "contact", "where": "상세 머리 줄 «배차사-전화» 앞", "sample": "고양퀵서비스-031-932-7722", "seen": "SIM", "handling": "READ", "usedAt": "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다", "read": "^\\s*([^\\n]+?)-(?=\\d)", "part": "dispatcher", "note": "실물 머리 줄은 확정 전 3/3 «이름[전화]» · 확정 뒤 5/5 «이름-전화» — 지금 읽는 법은 «-» 모양만 맞다(확정 전은 틀리게 읽힘 · seen 은 SIM 그대로)"},
      {"field": "contact", "where": "상세 머리 줄 «배차사-전화» 뒤", "sample": "031-932-7722", "seen": "SIM", "handling": "READ", "usedAt": "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다", "read": "^\\s*[^\\n]+?-(\\d[\\d-]*\\d)(?=\\s|$)", "part": "dispatcherPhone"},
      {"field": "contact", "where": "출발지 상세 팝업 «고객»", "sample": "고객 …(이름표만 있는 줄이면 다음 줄)", "seen": "SIM", "handling": "READ", "usedAt": "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다", "read": "\\[출발지상세\\](?:(?!\\[도착지상세\\])[\\s\\S])*?\\n고객[ \\t]*:?[ \\t]*(?:\\n[ \\t]*)?([^\\n]+)", "part": "pickup.customer"},
      {"field": "contact", "where": "출발지 상세 팝업 «부서»", "sample": "부서 …(이름표만 있는 줄이면 다음 줄)", "seen": "SIM", "handling": "READ", "usedAt": "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다", "read": "\\[출발지상세\\](?:(?!\\[도착지상세\\])[\\s\\S])*?\\n부서[ \\t]*:?[ \\t]*(?:\\n[ \\t]*)?([^\\n]+)", "part": "pickup.department"},
      {"field": "contact", "where": "출발지 상세 팝업 «담당»", "sample": "담당 …(이름표만 있는 줄이면 다음 줄)", "seen": "SIM", "handling": "READ", "usedAt": "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다", "read": "\\[출발지상세\\](?:(?!\\[도착지상세\\])[\\s\\S])*?\\n담당[ \\t]*:?[ \\t]*(?:\\n[ \\t]*)?([^\\n]+)", "part": "pickup.contactName"},
      {"field": "contact", "where": "출발지 상세 팝업 «전화1»", "sample": "전화1 …(이름표만 있는 줄이면 다음 줄)", "seen": "SIM", "handling": "READ", "usedAt": "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다", "read": "\\[출발지상세\\](?:(?!\\[도착지상세\\])[\\s\\S])*?\\n전화1[ \\t]*:?[ \\t]*(?:\\n[ \\t]*)?([^\\n]+)", "part": "pickup.phone1"},
      {"field": "contact", "where": "출발지 상세 팝업 «전화2»", "sample": "전화2 …(이름표만 있는 줄이면 다음 줄)", "seen": "SIM", "handling": "READ", "usedAt": "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다", "read": "\\[출발지상세\\](?:(?!\\[도착지상세\\])[\\s\\S])*?\\n전화2[ \\t]*:?[ \\t]*(?:\\n[ \\t]*)?([^\\n]+)", "part": "pickup.phone2"},
      {"field": "contact", "where": "도착지 상세 팝업 «고객»", "sample": "고객 …(이름표만 있는 줄이면 다음 줄)", "seen": "SIM", "handling": "READ", "usedAt": "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다", "read": "\\[도착지상세\\](?:(?!\\[출발지상세\\])[\\s\\S])*?\\n고객[ \\t]*:?[ \\t]*(?:\\n[ \\t]*)?([^\\n]+)", "part": "dropoff.customer"},
      {"field": "contact", "where": "도착지 상세 팝업 «부서»", "sample": "부서 …(이름표만 있는 줄이면 다음 줄)", "seen": "SIM", "handling": "READ", "usedAt": "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다", "read": "\\[도착지상세\\](?:(?!\\[출발지상세\\])[\\s\\S])*?\\n부서[ \\t]*:?[ \\t]*(?:\\n[ \\t]*)?([^\\n]+)", "part": "dropoff.department"},
      {"field": "contact", "where": "도착지 상세 팝업 «담당»", "sample": "담당 …(이름표만 있는 줄이면 다음 줄)", "seen": "SIM", "handling": "READ", "usedAt": "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다", "read": "\\[도착지상세\\](?:(?!\\[출발지상세\\])[\\s\\S])*?\\n담당[ \\t]*:?[ \\t]*(?:\\n[ \\t]*)?([^\\n]+)", "part": "dropoff.contactName"},
      {"field": "contact", "where": "도착지 상세 팝업 «전화1»", "sample": "전화1 …(이름표만 있는 줄이면 다음 줄)", "seen": "SIM", "handling": "READ", "usedAt": "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다", "read": "\\[도착지상세\\](?:(?!\\[출발지상세\\])[\\s\\S])*?\\n전화1[ \\t]*:?[ \\t]*(?:\\n[ \\t]*)?([^\\n]+)", "part": "dropoff.phone1"},
      {"field": "contact", "where": "도착지 상세 팝업 «전화2»", "sample": "전화2 …(이름표만 있는 줄이면 다음 줄)", "seen": "SIM", "handling": "READ", "usedAt": "서버 원문 칸 읽기(utils/parser 짐작 대신) — 원달앱은 이 칸을 안 읽는다", "read": "\\[도착지상세\\](?:(?!\\[출발지상세\\])[\\s\\S])*?\\n전화2[ \\t]*:?[ \\t]*(?:\\n[ \\t]*)?([^\\n]+)", "part": "dropoff.phone2"}
    ],
    "confirm": [
      {"field": "pickup", "where": "출발지 줄", "sample": "오티디코퍼레이션/ 아크앤북동탄호수점 / 1시/", "seen": "REAL", "handling": "READ", "usedAt": "InsungSequence.buildOrderFromScreen"},
      {"field": "dropoff", "where": "도착지 줄", "sample": "서울강남구 / 역삼동 / 이희억", "seen": "REAL", "handling": "READ", "usedAt": "InsungSequence.buildOrderFromScreen"},
      {"field": "fare", "where": "요금 줄", "sample": "요금 : 40,000(신용)", "seen": "REAL", "handling": "READ", "usedAt": "InsungSequence.buildOrderFromScreen — PageFieldRead", "read": "요금\\s*:\\s*([\\d,]+)(?![\\d.])"},
      {"field": "contact", "where": "머리 줄", "sample": "(주)신한로직스-1588-5480", "seen": "REAL", "handling": "UNUSED"},
      {"field": "memo", "where": "적요 칸", "sample": "1시상차 6박스 …", "seen": "REAL", "handling": "UNUSED"},
      {"field": "stage", "where": "상태 줄", "sample": "상태 : 배송", "seen": "REAL", "handling": "UNUSED"},
      {"field": "vehicleType", "where": "차량 줄", "sample": "차량 : 다마스", "seen": "REAL", "handling": "UNUSED"},
      {"field": "toll", "where": "탁송료 줄", "sample": "탁송료 : 0", "seen": "REAL", "handling": "UNUSED"},
      {"field": "commission", "where": "수수료 줄", "sample": "수수료 : 23%", "seen": "REAL", "handling": "UNUSED"}
    ],
    "myorders": [
      {"field": "stage", "where": "완료 탭 줄 배지", "sample": "완료", "seen": "SIM", "handling": "UNUSED"},
      {"field": "contact", "where": "완료 탭 줄", "sample": "회사 이름", "seen": "SIM", "handling": "UNUSED"},
      {"field": "clock", "where": "완료 탭 줄", "sample": "상차 시각 · 하차 시각", "seen": "SIM", "handling": "UNUSED"}
    ],
    "myorder": []
  }
}/*JSON*/ as NetworkPageSpec;
