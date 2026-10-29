import type { NetworkPageSpec } from './networkPages';

/**
 * 📄 **인성플렉스 화면 정의** — 배차망 화면 정의 표(`networkPages.ts` — 칸 모양 · 기준 페이지 · 규칙은 거기)의 인성플렉스 몫.
 * 🔴 원천이다 — 원달앱 생성 파일은 `cd onedal-web && pnpm gen:pages` 로 뽑는다. 몸통은 JSON 표시 주석 둘 사이의 엄격한 JSON 이다(뽑는 스크립트와 원달앱 검사가 그 사이를 읽는다).
 */
export const ISFLEX_PAGES: NetworkPageSpec = /*JSON*/{
  "about": ["📄 **인성플렉스 페이지 정의 — 화면 어디에 어떤 글자로 오나** (실물 캡처 ex_images/인성플렉스 — 사진 + 접근성 글자 xml · 페이지표.md).", "실물은 홈 · 목록 둘 · 지도 · 진행중(빈) · 시트 둘 · 확정 전 상세 다섯 · 메뉴 여섯뿐 — 확정 뒤 화면 · 진행중 한 건 · 팝업은 실물이 없어 모름(UNKNOWN)이나 지어낸 시뮬 화면(SIM)이다.", "안내 그림(img_guide3_*)의 이름표가 실물과 다르면 실물이 맞다 — 실물에 안내 그림 이름표가 나오면 리뉴얼 신호다."],
  "modes": ["MANUAL", "SIMULATION", "ALARM"],
  "packageKeywords": ["quickflex"],
  "safeCancelSec": null,
  "detailBackSec": null,
  "rulesWhy": "자동이 없다 — «…원 수행하기»가 곧 계약이고 확정 뒤 임의 취소가 안 되며 취소마다 다음 확정이 10초 막혀 원달앱이 누르지 않는다 · 안전취소가 없다 · 상세 머묾 시간 칸은 아직 없다 · 패키지 글자는 «quickflex»(«insung» 은 인성 표가 이미 실물 insung.quickflex 에 건다)",
  "excludeScan": ["memo", "tags"],
  "excludeScanWhy": "적요(«적요상세» 다음) · 꼬리표(차종 뒤 «과적» 등)만 — 주소 낱말로 좋은 콜이 떨어지지 않게(픽커와 같은 태도)",
  "addressCut": null,
  "addressCutWhy": "지우지 않는다 — 출발지 앞 «@» · 예약 · 마감 앞글자는 원달앱이 걷어내 보낸다(앞뒤 공백만)",
  "vehicleWords": [
    {"word": "오토", "vehicle": "오토바이", "seen": "REAL"},
    {"word": "오토바이", "vehicle": "오토바이", "seen": "REAL"},
    {"word": "승용/소형", "vehicle": "승용차", "seen": "REAL"},
    {"word": "도보", "vehicle": null, "seen": "REAL"},
    {"word": "개인이동수단", "vehicle": null, "seen": "REAL"}
  ],
  "vehicleWordsWhy": "목록 줄 · 상세 «출발지까지» 다음 차종 글자(실물 8건 모두 «오토») · 목록 칩과 홈 배송 수단 글자(«오토바이» · «승용/소형» · «도보» · «개인이동수단») — 도보 · 개인이동수단은 우리 차종이 없다",
  "networkMarkers": [["출발지까지", "수입"], ["총 수입", "수행하기"], ["현재 선택된 배송 수단"], ["진행중인 오더가 없습니다"]],
  "networkMarkersWhy": "목록(«출발지까지» + «수입») · 상세(«총 수입» + «수행하기») · 홈(«현재 선택된 배송 수단») · 진행중 빈 화면(«진행중인 오더가 없습니다») — 실물 02 · 08 · 01 · 04 에 있고 인성 화면에는 없는 글자 묶음. 공지 띠 · «AI 배차 대기중»은 글이 바뀌거나 사라져 쓰지 않는다",
  "screens": [
    {"name": "상세(확정 전)", "standard": "DETAIL_PRE_CONFIRM", "bases": ["detail"], "buttons": {"accept": "수행하기", "filterOut": "닫기"}, "match": [{"all": ["총 수입", "수행하기"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/인성플렉스/08_상세.png", "ex_images/인성플렉스/09_상세_선불.png", "ex_images/인성플렉스/10_상세_3.png", "ex_images/인성플렉스/11_상세_4.png", "ex_images/인성플렉스/12_상세_5.png"], "toCollect": "꼬리표 자리에 «과적» 말고 오는 글자(«급송» · «왕복» · «경유» · 짐 크기 «대박스») · 도착 주소에 «@»가 붙는 콜 · 적요 안에 «선불» · «착불» · «총 수입»이 드는 콜 — 적요 제목 «오더메모» · 요금 제목 «수입»만(«총 수입» 아님)이 보이면 리뉴얼", "overlays": [
      {"name": "수락 실패 팝업", "kind": "POPUP", "match": [], "meaning": "착불 콜을 적립금이 모자라 수락하지 못했다 — 원달앱은 알아보기만", "seen": "UNKNOWN", "evidence": [], "toCollect": "착불 콜 «수행하기» 뒤 뜨는 팝업 글자"},
      {"name": "확정 제한 팝업", "kind": "POPUP", "match": [], "meaning": "확정 뒤 취소해 다음 확정이 10초 막혔다 — 원달앱은 알아보기만", "seen": "UNKNOWN", "evidence": [], "toCollect": "회원사 취소 뒤 다음 확정 때 뜨는 팝업 글자"}
    ]},
    {"name": "확정", "standard": "DETAIL_CONFIRMED", "bases": ["confirm"], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "수행하기 직후 화면 — 이 화면으로 오나 · 진행중 탭으로 가나 · 따로 뜨는 확인 화면이 있나", "overlays": []},
    {"name": "내 오더 콜", "standard": "DETAIL_CONFIRMED", "bases": ["myorder"], "match": [{"all": ["적요상세"], "any": ["픽업완료", "배송완료", "서명받기"], "none": ["수행하기"]}], "listReturn": false, "seen": "SIM", "evidence": ["지어낸 화면 — 시뮬레이터 인성플렉스 «내 오더 콜»(실물 캡처 없음)"], "toCollect": "실물 화면 글자(출발지로 이동 · 배송 · 서명) · 단계 줄 «…까지 출발지로 이동» · 아래 단추 글자 — 요금 제목 «총 수익» · 적요 제목 «오더메모»가 실물에 나오나", "overlays": []},
    {"name": "목록(신규)", "standard": "LIST", "bases": ["list"], "match": [{"all": ["출발지까지", "수입", "퇴근하기"], "none": ["수행하기"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/인성플렉스/02_목록.png", "ex_images/인성플렉스/07_목록_스크롤.png"], "toCollect": "AI 추천 콜이 실제로 뜬 목록(칸 자리 · «수락» 단추 글자) · 꼬리표 배지(«급» · «왕» · «빈» · «경») · «계산서» 배지 · 차종 «오토» 말고 다른 글자 · 오늘 예약 앞글자 꼴 — 칩 «개인이동장치»(실물은 «개인이동수단»)가 보이면 리뉴얼", "overlays": [
      {"name": "오더 목록 거리 설정 시트", "kind": "POPUP", "match": [{"all": ["오더 목록 거리 설정"]}], "meaning": "목록 거리를 고르는 시트 — 떠 있는 동안 뒤 목록 글자가 안 온다 · 원달앱은 아무것도 안 누른다", "seen": "REAL", "evidence": ["ex_images/인성플렉스/05_필터.png"]},
      {"name": "오더 사이즈 설정 시트", "kind": "POPUP", "match": [{"all": ["오더 사이즈 설정"]}], "meaning": "목록 글자 크기 · 여백을 고르는 시트 — 안의 견본 줄은 콜이 아니다 · 떠 있는 동안 뒤 목록 글자가 안 온다 · 원달앱은 아무것도 안 누른다", "seen": "REAL", "evidence": ["ex_images/인성플렉스/06_넓히기.png"]}
    ]},
    {"name": "지도 보기", "standard": "NETWORK_MENU", "bases": [], "match": [{"all": ["퇴근하기", "Google 지도"], "none": ["수입"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/인성플렉스/03_목록_지도.png"], "toCollect": "지도 마커를 누르면 뜨는 화면", "overlays": []},
    {"name": "진행중(빈)", "standard": "MY_ORDERS", "bases": ["myorders"], "match": [{"all": ["진행중인 오더가 없습니다"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/인성플렉스/04_진행중.png"], "overlays": []},
    {"name": "진행중(한 건)", "standard": "MY_ORDERS", "bases": ["myorders"], "landsAfterAccept": true, "match": [{"all": ["신규", "진행중", "퇴근하기"], "none": ["출발지까지", "진행중인 오더가 없습니다"]}], "listReturn": false, "seen": "SIM", "evidence": ["지어낸 화면 — 시뮬레이터 인성플렉스 «진행중» 탭 한 건(실물 캡처 없음)"], "toCollect": "잡은 콜 줄의 칸 · 글자 · 차례 · 이 화면에 칸 머리(«출발지까지» · «수입») · 칩 · «AI 배차 대기중» · «완료» 글자가 있나", "overlays": []},
    {"name": "홈", "standard": "HOME", "bases": ["home"], "match": [{"all": ["출근하기", "현재 선택된 배송 수단"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/인성플렉스/01_홈.png", "ex_images/인성플렉스/01_홈_2.png"], "toCollect": "«퇴근하기» 뒤 돌아오는 화면 · «변경» 뒤 배송 수단 고르기 화면 글자", "overlays": [
      {"name": "공지 띠", "kind": "BANNER", "match": [], "meaning": "공지 제목이 돌아가며 바뀐다 — 표식으로 쓰지 않는다", "seen": "REAL", "evidence": ["ex_images/인성플렉스/01_홈.png", "ex_images/인성플렉스/01_홈_2.png"], "toCollect": "바뀌지 않는 알아볼 글자"}
    ]},
    {"name": "메세지함", "standard": "NETWORK_MENU", "bases": [], "match": [{"all": ["메세지함"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/인성플렉스/13_편지.png"], "overlays": []},
    {"name": "마이플렉스", "standard": "NETWORK_MENU", "bases": [], "match": [{"all": ["마이플렉스", "적립금내역"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/인성플렉스/14_사람.png"], "toCollect": "나머지 메뉴(미션 · 보험 · 내 정보 · 배송 수단 · 이용안내) 화면 — 기사님이 연 화면만", "overlays": []},
    {"name": "적립금 내역", "standard": "NETWORK_MENU", "bases": [], "match": [{"all": ["적립금 내역", "보유 적립금"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/인성플렉스/15_적립금.png"], "overlays": []},
    {"name": "수행내역", "standard": "NETWORK_MENU", "bases": [], "match": [{"all": ["수행내역", "금액은 완료된 건만 표시됩니다"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/인성플렉스/16_수행내역.png"], "toCollect": "끝낸 콜이 있을 때의 줄 모양", "overlays": []},
    {"name": "공지사항", "standard": "NETWORK_MENU", "bases": [], "match": [{"all": ["공지사항", "필수공지"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/인성플렉스/17_공지사항.png", "ex_images/인성플렉스/18_공지_운행취소패널티.png"], "overlays": []}
  ],
  "pages": {
    "list": [
      {"field": "pickupDistance", "where": "목록 줄 맨 왼쪽(칸 머리 «출발지까지 (km)» — 줄바꿈 든 한 글자)", "sample": "24.3", "seen": "REAL", "handling": "READ", "usedAt": "IsflexParser — 아직 빈 껍데기라 안 읽는다", "presence": "ALWAYS", "presenceEvidence": {"seen": 8, "of": 8, "from": "실물 ex_images/인성플렉스 02 · 07 목록 줄 11개 — 서로 다른 콜 8건"}},
      {"field": "vehicleType", "where": "거리 아래", "sample": "오토", "seen": "REAL", "handling": "READ", "usedAt": "IsflexParser — 아직 빈 껍데기라 안 읽는다", "presence": "ALWAYS", "presenceEvidence": {"seen": 8, "of": 8, "from": "실물 ex_images/인성플렉스 02 · 07 목록 줄 11개 — 서로 다른 콜 8건 · 모두 «오토»"}},
      {"field": "pickup", "where": "출발지 칸 — «@» + (예약 앞글자) + 동", "sample": "@낼08:20/수원이의동 · @역삼동", "seen": "REAL", "handling": "READ", "usedAt": "IsflexParser — 아직 빈 껍데기라 안 읽는다", "presence": "ALWAYS", "presenceEvidence": {"seen": 8, "of": 8, "from": "실물 ex_images/인성플렉스 02 · 07 목록 줄 11개 — 서로 다른 콜 8건 · 모두 «@»로 시작"}},
      {"field": "reservation", "where": "출발지 «@» 뒤 앞글자", "sample": "낼08:20/ · 낼8:30) · 낼09시/ · 낼06:50)", "seen": "REAL", "handling": "READ", "usedAt": "IsflexParser — 아직 빈 껍데기라 안 읽는다", "presence": "SOMETIMES", "presenceEvidence": {"seen": 5, "of": 8, "from": "실물 ex_images/인성플렉스 02 · 07 목록 줄 11개 — 서로 다른 콜 8건 · 수원이의동 · 방배동 · 충무로5가 두 건 · 반포동"}},
      {"field": "deliveryDistance", "where": "출발지 아래", "sample": "약 30.1km", "seen": "REAL", "handling": "READ", "usedAt": "IsflexParser — 아직 빈 껍데기라 안 읽는다", "presence": "ALWAYS", "presenceEvidence": {"seen": 8, "of": 8, "from": "실물 ex_images/인성플렉스 02 · 07 목록 줄 11개 — 서로 다른 콜 8건"}},
      {"field": "dropoff", "where": "도착지 칸 — (마감 앞글자) + 동", "sample": "10:20전/쌍림동 · 구리수택동", "seen": "REAL", "handling": "READ", "usedAt": "IsflexParser — 아직 빈 껍데기라 안 읽는다", "presence": "ALWAYS", "presenceEvidence": {"seen": 8, "of": 8, "from": "실물 ex_images/인성플렉스 02 · 07 목록 줄 11개 — 서로 다른 콜 8건"}},
      {"field": "clock", "where": "도착지 앞 마감 앞글자", "sample": "10:20전/", "seen": "REAL", "handling": "READ", "usedAt": "IsflexParser — 아직 빈 껍데기라 안 읽는다", "note": "판정 시한에 넣지 않는다 — 기록만", "presence": "ONCE", "presenceEvidence": {"seen": 1, "of": 8, "from": "실물 ex_images/인성플렉스 02 · 07 목록 줄 11개 — 서로 다른 콜 8건 · 쌍림동 한 건"}},
      {"field": "fare", "where": "수입 칸(«원» 없음)", "sample": "21,252", "seen": "REAL", "handling": "READ", "usedAt": "IsflexParser — 아직 빈 껍데기라 안 읽는다", "presence": "ALWAYS", "presenceEvidence": {"seen": 8, "of": 8, "from": "실물 ex_images/인성플렉스 02 · 07 목록 줄 11개 — 서로 다른 콜 8건"}},
      {"field": "payment", "where": "수입 아래 작은 테두리 글자", "sample": "선불 · 착불", "seen": "REAL", "handling": "READ", "usedAt": "IsflexParser — 아직 빈 껍데기라 안 읽는다", "presence": "SOMETIMES", "presenceEvidence": {"seen": 3, "of": 8, "from": "실물 ex_images/인성플렉스 02 · 07 목록 줄 11개 — 서로 다른 콜 8건 · 방배동 «선불» · 남대문로2가 «착불» · 역삼동 «착불»"}},
      {"field": "billing", "where": "수입 아래 배지(안내 그림)", "sample": "계산서", "seen": "UNKNOWN", "handling": "UNUSED", "note": "실물 8건에는 없다 · 안내 그림 img_guide3_1 에만"},
      {"field": "tags", "where": "차종 아래 배지(안내 그림)", "sample": "급 · 왕 · 빈 · 경", "seen": "UNKNOWN", "handling": "UNUSED", "note": "실물 8건에는 없다 · 안내 그림 img_guide3_1 에만 — 차종 바로 뒤에 오면 차종 글자에 섞일 수 있다"}
    ],
    "detail": [
      {"field": "pickupDistance", "where": "지도 아래 «출발지까지» 다음", "sample": "출발지까지 26.7km", "seen": "REAL", "handling": "READ", "usedAt": "서버 칸 읽기(pageFieldOf) · 원달앱 IsflexParser 는 아직 빈 껍데기", "read": "출발지까지\\s+([\\d.]+)km", "presence": "ALWAYS", "presenceEvidence": {"seen": 5, "of": 5, "from": "실물 ex_images/인성플렉스 08~12 확정 전 상세 — 서로 다른 콜 5건"}},
      {"field": "vehicleType", "where": "거리 다음", "sample": "오토", "seen": "REAL", "handling": "READ", "usedAt": "서버 칸 읽기(pageFieldOf) · 원달앱 IsflexParser 는 아직 빈 껍데기", "read": "출발지까지\\s+[\\d.]+km\\s+(\\S+)", "presence": "ALWAYS", "presenceEvidence": {"seen": 5, "of": 5, "from": "실물 ex_images/인성플렉스 08~12 확정 전 상세 — 서로 다른 콜 5건"}},
      {"field": "tags", "where": "차종 뒤 세로 구분선 다음", "sample": "과적", "seen": "REAL", "handling": "READ", "usedAt": "서버 제외어 찾는 칸(excludeScan) · 상세 자료 구분 칸(detailRecordOf)", "read": "출발지까지\\s+[\\d.]+km\\s+\\S+\\s+(\\S+(?:\\s+\\S+)*?)\\s+출발\\s+(?:@|약\\s)", "presence": "ONCE", "presenceEvidence": {"seen": 1, "of": 5, "from": "실물 ex_images/인성플렉스 08~12 확정 전 상세 — 서로 다른 콜 5건 · 10(수원이의동 → 쌍림동)에만"}},
      {"field": "reservation", "where": "출발 주소 둘째 «@» 뒤 앞글자", "sample": "낼8:30)", "seen": "REAL", "handling": "READ", "usedAt": "IsflexParser — 아직 빈 껍데기라 안 읽는다", "presence": "SOMETIMES", "presenceEvidence": {"seen": 3, "of": 5, "from": "실물 ex_images/인성플렉스 08~12 확정 전 상세 — 서로 다른 콜 5건 · 방배동 · 수원이의동 · 반포동"}},
      {"field": "pickup", "where": "«출발» 다음 — «@시도 시군구 @(예약)동»", "sample": "@서울 서초구 @낼8:30)방배동", "seen": "REAL", "handling": "READ", "usedAt": "서버 칸 읽기(pageFieldOf) · 원달앱 IsflexParser 는 아직 빈 껍데기", "read": "(?:^|\\s)출발\\s+(?:약\\s+[\\d.]+km\\s+)?(\\S[\\s\\S]*?)(?:\\s+약\\s+[\\d.]+km)?\\s+도착\\s", "note": "주소가 두 줄이면 «약 N km»가 주소 앞에 온다(실물 10)", "presence": "ALWAYS", "presenceEvidence": {"seen": 5, "of": 5, "from": "실물 ex_images/인성플렉스 08~12 확정 전 상세 — 서로 다른 콜 5건"}},
      {"field": "deliveryDistance", "where": "출발 주소 아래", "sample": "약 2.3km", "seen": "REAL", "handling": "READ", "usedAt": "서버 칸 읽기(pageFieldOf) · 원달앱 IsflexParser 는 아직 빈 껍데기", "read": "(?:^|\\s)출발\\s[\\s\\S]*?약\\s+([\\d.]+)km", "presence": "ALWAYS", "presenceEvidence": {"seen": 5, "of": 5, "from": "실물 ex_images/인성플렉스 08~12 확정 전 상세 — 서로 다른 콜 5건"}},
      {"field": "clock", "where": "도착 주소 동 앞 마감 앞글자", "sample": "10:20전/", "seen": "REAL", "handling": "READ", "usedAt": "IsflexParser — 아직 빈 껍데기라 안 읽는다", "note": "판정 시한에 넣지 않는다 — 기록만", "presence": "ONCE", "presenceEvidence": {"seen": 1, "of": 5, "from": "실물 ex_images/인성플렉스 08~12 확정 전 상세 — 서로 다른 콜 5건 · 쌍림동 한 건"}},
      {"field": "dropoff", "where": "«도착» 다음 — «시도 시군구 (마감)동»", "sample": "서울 강남구 대치동", "seen": "REAL", "handling": "READ", "usedAt": "서버 칸 읽기(pageFieldOf) · 원달앱 IsflexParser 는 아직 빈 껍데기", "read": "(?:^|\\s)도착\\s+([\\s\\S]+?)\\s+적요상세(?:\\s|$)", "presence": "ALWAYS", "presenceEvidence": {"seen": 5, "of": 5, "from": "실물 ex_images/인성플렉스 08~12 확정 전 상세 — 서로 다른 콜 5건"}},
      {"field": "memo", "where": "«적요상세» 다음(빈 적요는 «없음»)", "sample": "1박스 3층 계단물건 있음", "seen": "REAL", "handling": "READ", "usedAt": "서버 제외어 찾는 칸(excludeScan) — «적요상세» 다음 결제 · «총 수입» 앞 · «없음»은 못 읽음(빈 적요)", "read": "적요상세\\s+(?!없음\\s+(?:선불|착불|총 수입)(?:\\s|$))([\\s\\S]*?)(?=\\s+(?:선불|착불|총 수입)(?:\\s|$))", "presence": "SOMETIMES", "presenceEvidence": {"seen": 4, "of": 5, "from": "실물 ex_images/인성플렉스 08~12 확정 전 상세 — 서로 다른 콜 5건 · 12(동패동)는 «없음»"}},
      {"field": "memo", "where": "«적요상세» 다음(빈 적요는 «없음»)", "sample": "1박스 3층 계단물건 있음", "seen": "REAL", "handling": "READ", "usedAt": "서버 상세 적요(detailRecordOf detailMemo)", "read": "적요상세\\s+(?!없음\\s+(?:선불|착불|총 수입)(?:\\s|$))([\\s\\S]*?)(?=\\s+(?:선불|착불|총 수입)(?:\\s|$))", "part": "body", "presence": "SOMETIMES", "presenceEvidence": {"seen": 4, "of": 5, "from": "실물 ex_images/인성플렉스 08~12 확정 전 상세 — 서로 다른 콜 5건 · 12(동패동)는 «없음»"}},
      {"field": "payment", "where": "적요 아래 · «총 수입» 앞", "sample": "착불 · 선불", "seen": "REAL", "handling": "READ", "usedAt": "서버 결제 칸(detailRecordOf paymentType)", "read": "(?:^|\\s)(선불|착불)\\s+총 수입", "presence": "SOMETIMES", "presenceEvidence": {"seen": 2, "of": 5, "from": "실물 ex_images/인성플렉스 08~12 확정 전 상세 — 서로 다른 콜 5건 · 08 «착불» · 09 «선불»"}},
      {"field": "fare", "where": "아래 «총 수입» 다음", "sample": "총 수입 8,500원", "seen": "REAL", "handling": "READ", "usedAt": "서버 · 원달앱 칸 읽기(pageFieldOf · PageFieldRead) — 목록 요금과 다섯 장 모두 같다", "read": "총 수입\\s+([\\d,]+)원", "presence": "ALWAYS", "presenceEvidence": {"seen": 5, "of": 5, "from": "실물 ex_images/인성플렉스 08~12 확정 전 상세 — 서로 다른 콜 5건"}},
      {"field": "fare", "where": "오른쪽 아래 «…원 수행하기» 단추", "sample": "8,500원 수행하기(줄바꿈 든 한 글자)", "seen": "REAL", "handling": "UNUSED", "read": "([\\d,]+)원\\s*\\n?수행하기", "part": "button", "note": "계약 단추 — 원달앱은 어떤 모드에서도 누르지 않는다", "presence": "ALWAYS", "presenceEvidence": {"seen": 5, "of": 5, "from": "실물 ex_images/인성플렉스 08~12 확정 전 상세 — 서로 다른 콜 5건 · 금액이 «총 수입»과 모두 같다"}},
      {"field": "itemSize", "where": "머리 줄 넷째(안내 그림)", "sample": "대박스", "seen": "UNKNOWN", "handling": "UNUSED", "note": "실물 5건에는 없다 · 안내 그림 img_guide3_2 에만"}
    ],
    "confirm": [
      {"field": "stage", "where": "수행하기 직후 화면", "sample": "(실물 캡처 없음)", "seen": "UNKNOWN", "handling": "UNUSED"}
    ],
    "myorders": [
      {"field": "pickup", "where": "진행중 탭 잡은 콜 줄", "sample": "(실물 캡처 없음)", "seen": "UNKNOWN", "handling": "UNUSED"},
      {"field": "dropoff", "where": "진행중 탭 잡은 콜 줄", "sample": "(실물 캡처 없음)", "seen": "UNKNOWN", "handling": "UNUSED"},
      {"field": "fare", "where": "진행중 탭 잡은 콜 줄", "sample": "(실물 캡처 없음)", "seen": "UNKNOWN", "handling": "UNUSED"},
      {"field": "stage", "where": "진행중 탭 잡은 콜 줄 상태", "sample": "(실물 캡처 없음)", "seen": "UNKNOWN", "handling": "UNUSED"}
    ],
    "myorder": [
      {"field": "stage", "where": "지도 아래 파란 단계 줄(안내 그림)", "sample": "16:00까지 출발지로 이동", "seen": "UNKNOWN", "handling": "UNUSED"},
      {"field": "pickupDistance", "where": "머리 줄(안내 그림)", "sample": "출발지까지 1.2km", "seen": "UNKNOWN", "handling": "UNUSED"},
      {"field": "vehicleType", "where": "머리 줄(안내 그림)", "sample": "오토바이", "seen": "UNKNOWN", "handling": "UNUSED"},
      {"field": "tags", "where": "머리 줄 · 적요 아래 테두리 글(안내 그림)", "sample": "급송 · 왕복 · 빈나감", "seen": "UNKNOWN", "handling": "UNUSED"},
      {"field": "itemSize", "where": "머리 줄(안내 그림)", "sample": "중박스", "seen": "UNKNOWN", "handling": "UNUSED"},
      {"field": "pickup", "where": "«출발» 동 + 아래 전체 주소(안내 그림)", "sample": "대구 중구 포정동 · 서구 북비산로 240", "seen": "UNKNOWN", "handling": "UNUSED"},
      {"field": "contact", "where": "출발 담당자 · 전화 단추(안내 그림)", "sample": "민사소액과 담당 홍길동", "seen": "UNKNOWN", "handling": "UNUSED", "part": "pickup"},
      {"field": "deliveryDistance", "where": "출발 아래(안내 그림)", "sample": "약 1.8km", "seen": "UNKNOWN", "handling": "UNUSED"},
      {"field": "dropoff", "where": "«도착» 동 + 아래 전체 주소(안내 그림)", "sample": "부산 남구 송정동 · 강서구 녹산산단 382로 14번길 55", "seen": "UNKNOWN", "handling": "UNUSED"},
      {"field": "contact", "where": "도착 회사 이름 · 전화 단추(안내 그림)", "sample": "부산신발산업진흥센터", "seen": "UNKNOWN", "handling": "UNUSED", "part": "dropoff"},
      {"field": "memo", "where": "적요(안내 그림 제목 «오더메모» — 실물 상세는 «적요상세»)", "sample": "주차장으로 들어와주세요", "seen": "UNKNOWN", "handling": "UNUSED"},
      {"field": "billing", "where": "적요 아래 테두리 글(안내 그림)", "sample": "세금계산서", "seen": "UNKNOWN", "handling": "UNUSED"},
      {"field": "payment", "where": "받으실 현금(안내 그림 — 현금 콜만)", "sample": "받으실 현금 123,000원", "seen": "UNKNOWN", "handling": "UNUSED"},
      {"field": "toll", "where": "탁송 금액(안내 그림)", "sample": "탁송 금액 25,000원", "seen": "UNKNOWN", "handling": "UNUSED", "note": "뜻 모름 — 고객이 내는 운임인지 톨비인지 실전 한 건으로 가른다"},
      {"field": "fare", "where": "총 수익(안내 그림 — 실물 상세는 «총 수입»)", "sample": "총 수익 ₩ 123,000원", "seen": "UNKNOWN", "handling": "UNUSED"}
    ]
  }
}/*JSON*/ as NetworkPageSpec;
