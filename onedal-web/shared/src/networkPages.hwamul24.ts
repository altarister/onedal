import type { NetworkPageSpec } from './networkPages';

/**
 * 📄 **화물24시 화면 정의** — 배차망 화면 정의 표(`networkPages.ts` — 칸 모양 · 기준 페이지 · 규칙은 거기)의 화물24시 몫.
 * 🔴 원천이다 — 원달앱 생성 파일은 `cd onedal-web && pnpm gen:pages` 로 뽑는다. 몸통은 JSON 표시 주석 둘 사이의 엄격한 JSON 이다(뽑는 스크립트와 원달앱 검사가 그 사이를 읽는다).
 */
export const HWAMUL24_PAGES: NetworkPageSpec = /*JSON*/{
  "about": ["📄 **화물24시 페이지 정의 — 화면 어디에 어떤 글자로 오나** (실물 캡처 ex_images/화물24시).", "⚠️ 실물 앱은 아직 설치 전(사업자 없음) — REAL 은 캡처가 근거다. 시뮬 상세 화면은 실물과 모양이 달라(머리 «배차내역») 상세까지 못 간다."],
  "excludeScan": ["memo", "payment"],
  "excludeScanWhy": "기사님 «화물24시는 화물정보»(+ 결제방법 «착불») — 화주 이름 줄(«화물과퀵») · «60분 안보기» · 버튼 · 주소는 안 본다",
  "addressCut": ",[\\s\\S]*$",
  "addressCutWhy": "첫 쉼표부터 끝(뒤 상세 주소)을 지운다",
  "vehicleWords": [
    {"word": "1톤", "vehicle": "1t", "seen": "REAL"},
    {"word": "1.4톤", "vehicle": "1.4t", "seen": "SIM"},
    {"word": "2.5톤", "vehicle": "2.5t", "seen": "REAL"},
    {"word": "3.5톤", "vehicle": "3.5t", "seen": "REAL"},
    {"word": "5톤", "vehicle": "5t", "seen": "SIM"},
    {"word": "11톤", "vehicle": "11t", "seen": "SIM"},
    {"word": "25톤", "vehicle": "25t", "seen": "SIM"},
    {"word": "다마스", "vehicle": "다마스", "seen": "SIM"},
    {"word": "라보", "vehicle": "라보", "seen": "SIM"},
    {"word": "오토바이", "vehicle": "오토바이", "seen": "SIM"},
    {"word": "승용", "vehicle": "승용차", "seen": "SIM"}
  ],
  "vehicleWordsWhy": "목록 셋째 줄 «낱말/…»(«1톤/전체» · «2.5톤/윙» · «다마스/전체»)의 첫 «/» 앞 낱말 — REAL 은 실물 캡처 17 · 실물 목록, SIM 은 시뮬레이터 목록에서만 봤다",
  "networkMarkers": [["화물정보", "자동새로고침"], ["화물상세정보", "운송료"], ["전국24시콜화물"]],
  "networkMarkersWhy": "실시간 목록 머리(«화물정보» + «자동새로고침») · 잡기 전 상세(«화물상세정보» + «운송료») · 첫 화면(«전국24시콜화물» — 홈에서 바로 알아보기)",
  "screens": [
    {"name": "배차신청 뒤 화물상세정보", "standard": "DETAIL_CONFIRMED", "bases": ["confirm"], "match": [{"all": ["화물상세정보", "배차취소하기"]}, {"all": ["화물상세정보", "전화걸기", "배차내역"]}], "listReturn": false, "landsAfterAccept": true, "seen": "REAL", "evidence": ["ex_images/화물24시/54_화물상세정보_배차신청뒤.png"], "toCollect": "머리 «<»(뒤로) · «배차취소하기» · «전화걸기»를 누른 뒤 화면 · 막대가 다 차는 시간", "overlays": [
      {"name": "배차신청 성공 토스트", "kind": "TOAST", "match": [{"all": ["배차신청에 성공"]}], "meaning": "배차신청이 됐다 — 위 «배차취소하기» 막대가 차는 동안만 앱에서 취소할 수 있다", "seen": "REAL", "evidence": ["ex_images/화물24시/54_화물상세정보_배차신청뒤.png"]}
    ]},
    {"name": "화물상세정보", "standard": "DETAIL_PRE_CONFIRM", "bases": ["detail"], "buttons": {"accept": "배차신청", "filterOut": "돌아가기"}, "match": [{"all": ["화물상세정보", "배차신청"], "none": ["배차취소하기", "전화걸기"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/화물24시/18_화물상세정보_배차신청.png", "ex_images/화물24시/51_화물상세정보.png", "ex_images/화물24시/53_화물상세정보_배차신청전.png"], "overlays": [
      {"name": "배차 실패 오류", "kind": "POPUP", "match": [{"any": ["이미 배차", "배차할 수 없"]}], "meaning": "배차신청이 안 됐다 — 남이 먼저 잡았거나 조건 미달", "action": "ERROR", "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처"}
    ]},
    {"name": "배차내역 상세 · 화주정보 탭", "standard": "DETAIL_CONFIRMED", "bases": ["myorder"], "match": [{"all": ["배차내역", "02 화주정보", "사업장주소"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/화물24시/21_화물상세_화주정보_전화번호.png"], "overlays": []},
    {"name": "배차내역 상세 · 결제정보 탭", "standard": "DETAIL_CONFIRMED", "bases": ["myorder"], "match": [{"all": ["배차내역", "03 결제정보", "수금상태"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/화물24시/22_화물상세_결제정보.png"], "overlays": []},
    {"name": "배차내역 상세 · 화물정보 탭", "standard": "DETAIL_CONFIRMED", "bases": ["myorder"], "match": [{"all": ["배차내역", "02 화주정보", "배차시간"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/화물24시/04_배차상세_화물정보_상단.png", "ex_images/화물24시/05_배차상세_화물정보_하단.png", "ex_images/화물24시/06_배차상세_계산서발행.png", "ex_images/화물24시/10_배차상세_인수증.png", "ex_images/화물24시/13_배차상세_예약건.png", "ex_images/화물24시/24_화물정보탭_인수증전송팝업.png", "ex_images/화물24시/52_배차내역상세_화물정보탭.png"], "overlays": [
      {"name": "인수증 전송 확인", "kind": "POPUP", "match": [{"all": ["인수증을 전송하시겠습니까"]}], "meaning": "인수증 사진을 화주에게 보낼지 묻는다", "seen": "REAL", "evidence": ["ex_images/화물24시/24_화물정보탭_인수증전송팝업.png"]},
      {"name": "세금계산서 수정발행 창", "kind": "POPUP", "match": [{"all": ["계산서발행"], "any": ["수정사유", "공급가액변동"]}], "meaning": "발행한 세금계산서를 고쳐 다시 발행한다", "seen": "REAL", "evidence": ["ex_images/화물24시/08_세금계산서_수정발행_팝업.png", "ex_images/화물24시/09_세금계산서_수정발행_입력.png"]},
      {"name": "계좌입력 확인", "kind": "POPUP", "match": [{"all": ["입금계좌에 계좌정보를 입력하시겠습니까"]}], "meaning": "세금계산서 창에서 입금계좌를 넣을지 묻는다", "seen": "REAL", "evidence": ["ex_images/화물24시/08_세금계산서_수정발행_팝업.png"]},
      {"name": "세금계산서 발행 창", "kind": "POPUP", "match": [{"all": ["계산서발행", "작성일자"], "none": ["수정사유", "공급가액변동"]}], "meaning": "세금계산서를 처음 발행한다(공급자 · 공급받는자 입력)", "seen": "REAL", "evidence": ["ex_images/화물24시/12_세금계산서_발행폼.png", "ex_images/화물24시/23_세금계산서발행_입력창.png"]}
    ]},
    {"name": "화물배차정보요약", "standard": "DETAIL_CONFIRMED", "bases": ["myorder"], "match": [{"all": ["화물배차정보요약"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/화물24시/14_화물배차정보요약.png", "ex_images/화물24시/15_화물배차정보요약_메뉴.png (녹화 앱 메뉴가 겹침)"], "overlays": []},
    {"name": "배차내역 목록", "standard": "MY_ORDERS", "bases": ["myorders"], "match": [{"all": ["배차내역", "자세히 보기"], "none": ["02 화주정보"]}], "listReturn": true, "landsAfterAccept": true, "seen": "REAL", "evidence": ["ex_images/화물24시/03_배차내역_리스트.png", "ex_images/화물24시/11_배차내역_수금목록.png", "ex_images/화물24시/20_배차내역_목록.png"], "overlays": [
      {"name": "안내 띠", "kind": "BANNER", "match": [], "meaning": "전자세금계산서 · 수금 안내 — 글이 바뀐다", "seen": "REAL", "evidence": ["ex_images/화물24시/03_배차내역_리스트.png", "ex_images/화물24시/20_배차내역_목록.png"], "toCollect": "바뀌지 않는 알아볼 글자"}
    ]},
    {"name": "화물정보 검색조건", "standard": "NETWORK_MENU", "bases": [], "match": [{"all": ["화물정보", "검색조건", "저장 후 검색"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/화물24시/38_검색조건.png", "ex_images/화물24시/39_검색조건.png", "ex_images/화물24시/41_검색조건_하차일선택.png", "ex_images/화물24시/42_검색조건_내위치반경선택.png"], "overlays": [
      {"name": "하차일 선택 시트", "kind": "POPUP", "match": [{"all": ["하차일 선택"]}], "meaning": "검색조건의 하차일(전체 · 당착 · 내착 · 월착)을 고른다", "seen": "REAL", "evidence": ["ex_images/화물24시/41_검색조건_하차일선택.png"]},
      {"name": "내위치 반경 선택 시트", "kind": "POPUP", "match": [{"all": ["내위치 반경 선택"]}], "meaning": "검색조건의 내 위치 반경(5 ~ 30Km)을 고른다", "seen": "REAL", "evidence": ["ex_images/화물24시/42_검색조건_내위치반경선택.png"]}
    ]},
    {"name": "화물정보(실시간 목록)", "standard": "LIST", "bases": ["list"], "match": [{"all": ["화물정보", "자동새로고침", "자동터치"], "none": ["저장 후 검색"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/화물24시/17_화물정보_리스트.png", "ex_images/화물24시/32_오더목록_기본.png", "ex_images/화물24시/35_실시간목록.png", "ex_images/화물24시/36_화물정보_전체.png", "ex_images/화물24시/37_실시간목록.png", "ex_images/화물24시/40_실시간목록.png", "ex_images/화물24시/43_실시간목록_토스트.png", "ex_images/화물24시/44_실시간목록.png", "ex_images/화물24시/45_실시간목록_자동새로고침OFF.png", "ex_images/화물24시/46_실시간목록.png", "ex_images/화물24시/47_실시간목록_알림팝업.png", "ex_images/화물24시/48_실시간목록_토스트.png", "ex_images/화물24시/49_실시간목록.png", "ex_images/화물24시/50_실시간목록.png"], "overlays": [
      {"name": "자동터치 동의", "kind": "POPUP", "match": [{"any": ["자동터치 사용시", "동의하십니까"]}], "meaning": "자동터치를 켤 때 책임 동의를 묻는다", "action": "SKIP", "seen": "REAL", "evidence": ["ex_images/화물24시/47_실시간목록_알림팝업.png"]},
      {"name": "저장완료 토스트", "kind": "TOAST", "match": [{"all": ["저장완료"]}], "meaning": "검색조건을 저장했다", "seen": "REAL", "evidence": ["ex_images/화물24시/43_실시간목록_토스트.png"]},
      {"name": "자동터치 시작 토스트", "kind": "TOAST", "match": [{"all": ["자동터치 시작"]}], "meaning": "배차망 자체 자동터치를 켰다", "seen": "REAL", "evidence": ["ex_images/화물24시/48_실시간목록_토스트.png"]}
    ]},
    {"name": "홈 «전국24시콜화물»", "standard": "HOME", "bases": ["home"], "match": [{"all": ["전국24시콜화물"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/화물24시/01_메인_홈화면.png", "ex_images/화물24시/28_홈.png", "ex_images/화물24시/33_홈.png"], "overlays": []},
    {"name": "가상계좌 정보", "standard": "NETWORK_MENU", "bases": [], "match": [{"all": ["가상계좌 정보", "출금가능금액"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/화물24시/34_가상계좌정보.png"], "overlays": []},
    {"name": "인수증 보관", "standard": "NETWORK_MENU", "bases": [], "match": [{"all": ["인수증 보관기간"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/화물24시/07_인수증_목록.png", "ex_images/화물24시/25_인수증보관.png", "ex_images/화물24시/27_인수증_보관함.png"], "overlays": [
      {"name": "인수증 전송 창", "kind": "POPUP", "match": [{"all": ["인수증 등록방법 선택"]}], "meaning": "인수증 사진을 카메라 · 갤러리에서 올린다", "seen": "REAL", "evidence": ["ex_images/화물24시/26_인수증전송_팝업.png"]}
    ]},
    {"name": "세금계산서 발행내역 상세", "standard": "NETWORK_MENU", "bases": [], "match": [{"all": ["전자세금계산서 정보", "국세청승인"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/화물24시/30_세금계산서_발행내역상세.png"], "overlays": []},
    {"name": "세금계산서 발행내역 목록", "standard": "NETWORK_MENU", "bases": [], "match": [{"all": ["세금계산서 발행내역", "승인번호"], "none": ["국세청승인"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/화물24시/29_세금계산서_발행내역목록.png", "ex_images/화물24시/31_세금계산서_발행내역목록2.png"], "overlays": []},
    {"name": "마이페이지", "standard": "NETWORK_MENU", "bases": [], "match": [{"all": ["마이페이지", "가상계좌 정보", "적재물보험 정보"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/화물24시/02_마이페이지.png", "ex_images/화물24시/19_마이페이지_메뉴.png"], "overlays": []},
    {"name": "환경설정", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (아래 탭 «환경설정» 뒤)", "overlays": []},
    {"name": "로그인", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자", "overlays": []},
    {"name": "화물등록", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (홈 «화물등록» 칸 뒤)", "overlays": []},
    {"name": "음성등록", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (홈 «음성등록» 칸 뒤)", "overlays": []},
    {"name": "스마트배차", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (홈 «스마트배차» 칸 뒤)", "overlays": []},
    {"name": "협력업체", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (홈 «협력업체» 칸 뒤)", "overlays": []},
    {"name": "고객센터", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (홈 «고객센터» 칸 뒤)", "overlays": []},
    {"name": "공지사항", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (홈 «공지사항» 칸 뒤)", "overlays": []},
    {"name": "사진전송", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (홈 «사진전송» 칸 뒤)", "overlays": []},
    {"name": "정보이용료 세금계산서 신청", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (마이페이지 «정보이용료 세금계산서 신청» 뒤)", "overlays": []},
    {"name": "스티커 사진전송", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (마이페이지 «스티커 사진전송» 뒤)", "overlays": []},
    {"name": "전자세금계산서 수신내역", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (마이페이지 «전자세금계산서 수신내역» 뒤)", "overlays": []},
    {"name": "카드결제지원 서비스", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (마이페이지 «카드결제지원 서비스» 뒤)", "overlays": []},
    {"name": "적재물보험 정보", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (마이페이지 «적재물보험 정보» 뒤)", "overlays": []},
    {"name": "매출내역 신청", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (마이페이지 «매출내역 신청» 뒤)", "overlays": []}
  ],
  "pages": {
    "list": [
      {"field": "pickup", "where": "왼쪽 윗줄", "sample": "경기 시흥 정왕동", "seen": "REAL", "handling": "READ", "usedAt": "Hwamul24Parser.parse"},
      {"field": "dropoff", "where": "오른쪽 윗줄", "sample": "경기 안산 상록구 장상동", "seen": "REAL", "handling": "READ", "usedAt": "Hwamul24Parser.parse"},
      {"field": "fare", "where": "오른쪽 아랫줄", "sample": "50,000원", "seen": "REAL", "handling": "READ", "usedAt": "Hwamul24CardGrouping.fareOf"},
      {"field": "vehicleType", "where": "셋째 줄 앞", "sample": "2.5톤/윙 · 3.5톤/전체 (승용·다마스는 못 읽음)", "seen": "REAL", "handling": "READ", "usedAt": "Hwamul24Parser.parse"},
      {"field": "pickupDistance", "where": "상차 배지 옆", "sample": "15Km", "seen": "REAL", "handling": "READ", "usedAt": "Hwamul24CardGrouping.pickupDistanceOf"},
      {"field": "reservation", "where": "상차 배지", "sample": "당상 · 내상(실물 캡처에는 없음)", "seen": "REAL", "handling": "READ", "usedAt": "Hwamul24Parser.reservationOf"},
      {"field": "tags", "where": "하차 배지 · 꼬리표", "sample": "당착 · 내착 (읽음) · 수 · 지 · 독차 · 인수증 (잡음으로 뺌)", "seen": "REAL", "handling": "READ", "usedAt": "Hwamul24Parser.badgesOf"},
      {"field": "memo", "where": "셋째 줄 화물 글", "sample": "당일상 당착 공파렛 50p / 10시전하차 · 당일오전9시30분상", "seen": "REAL", "handling": "READ", "usedAt": "Hwamul24MemoTimes.split — 상차 쪽만 예약으로"},
      {"field": "clock", "where": "하차 배지 앞 시각", "sample": "06:32 (등록 시각인지 모름)", "seen": "REAL", "handling": "READ", "usedAt": "Hwamul24Parser.parse — postTime"}
    ],
    "detail": [
      {"field": "orderNo", "where": "머리", "sample": "화물번호:3-9483-2159", "seen": "REAL", "handling": "UNUSED"},
      {"field": "clock", "where": "머리", "sample": "등록시간:05:18분", "seen": "REAL", "handling": "UNUSED"},
      {"field": "pickup", "where": "상차지 칸", "sample": "경기 군포 부곡동 [당상][수] 5Km", "seen": "REAL", "handling": "UNUSED", "usedAt": "목록 값을 쓴다"},
      {"field": "dropoff", "where": "하차지 칸", "sample": "서울 중구 을지로6가 [당착][수]", "seen": "REAL", "handling": "UNUSED", "usedAt": "목록 값을 쓴다"},
      {"field": "deliveryDistance", "where": "하차지 칸 오른쪽", "sample": "36Km", "seen": "REAL", "handling": "UNUSED"},
      {"field": "memo", "where": "화물정보 칸", "sample": "지금상 당착 59박스 수/수-A [독차]", "seen": "REAL", "handling": "READ", "usedAt": "서버 제외어 찾는 칸(excludeScan) — «화물정보» 다음 «톤수» 앞(배지 «독차» 포함) · 원달앱은 이 칸을 안 읽는다", "read": "화물정보\\s+(?!톤수)([\\s\\S]*?)(?=\\s+톤수|$)"},
      {"field": "vehicleType", "where": "톤수 · 차종 · 적재중량", "sample": "1톤 · 전체 · 1톤", "seen": "REAL", "handling": "UNUSED"},
      {"field": "tags", "where": "운행방법", "sample": "편도", "seen": "REAL", "handling": "UNUSED"},
      {"field": "fare", "where": "운송료 · 부가세 · 수납금액", "sample": "60,000 · 6,000 · 65,144", "seen": "REAL", "handling": "READ", "usedAt": "목록 줄을 못 찾은 손 상세는 PageFieldRead(PreConfirmSequence)", "read": "운송료\\s*:?\\s*([\\d,]+)", "note": "💰 목록 요금과 같은 «운송료»만 — 실물은 «운송료» · «60,000» 이 다른 노드, 시뮬은 «60,000원» (부가세 · 수납금액은 안 읽음)"},
      {"field": "payment", "where": "결제방법", "sample": "카드", "seen": "REAL", "handling": "READ", "usedAt": "서버 제외어 찾는 칸(excludeScan) · 관제웹 결제 칸(서버 pageFieldOf) — «카드» · «착불» · 원달앱은 이 칸을 안 읽는다", "read": "결제방법\\s+(?!\\S*\\s*:)(\\S+)"},
      {"field": "commission", "where": "수수료 줄", "sample": "수수료 = (운송료+부가세) x1.298%", "seen": "REAL", "handling": "UNUSED"}
    ],
    "confirm": [
      {"field": "stage", "where": "배차신청 뒤 화면", "sample": "(실물 캡처 없음)", "seen": "UNKNOWN", "handling": "UNUSED"}
    ],
    "myorders": [
      {"field": "stage", "where": "배차내역 줄 오른쪽 상태", "sample": "배차완료", "seen": "REAL", "handling": "UNUSED"},
      {"field": "pickup", "where": "배차내역 줄 상차", "sample": "경기 군포 당정동 공단로124번길 4 (크레텍)", "seen": "REAL", "handling": "UNUSED"},
      {"field": "dropoff", "where": "배차내역 줄 하차", "sample": "경기 화성 신동 703", "seen": "REAL", "handling": "UNUSED"},
      {"field": "fare", "where": "배차내역 줄 요금", "sample": "250,000원", "seen": "REAL", "handling": "UNUSED"},
      {"field": "reservation", "where": "배차내역 줄 상차 · 하차 배지", "sample": "당상 · 당착", "seen": "REAL", "handling": "UNUSED"},
      {"field": "tags", "where": "배차내역 줄 배지(미수금 — 수금 상태 · 지 — 뜻 모름)", "sample": "미수금 · 지 · 독차", "seen": "REAL", "handling": "UNUSED"},
      {"field": "payment", "where": "배차내역 줄 결제", "sample": "인수증", "seen": "REAL", "handling": "UNUSED"},
      {"field": "vehicleType", "where": "배차내역 줄 톤 · 차종", "sample": "5톤 · 윙바디", "seen": "REAL", "handling": "UNUSED"},
      {"field": "clock", "where": "배차내역 줄 오른쪽 시각", "sample": "12-30 14:53", "seen": "REAL", "handling": "UNUSED"}
    ],
    "myorder": [
      {"field": "pickup", "where": "배차내역 상세 상차지", "sample": "경기 군포 당정동 공단로124번길 4 (크레텍)", "seen": "REAL", "handling": "UNUSED"},
      {"field": "dropoff", "where": "배차내역 상세 하차지", "sample": "경기 화성 신동 703", "seen": "REAL", "handling": "UNUSED"},
      {"field": "deliveryDistance", "where": "배차내역 상세 하차지 끝", "sample": "34Km", "seen": "REAL", "handling": "UNUSED"},
      {"field": "reservation", "where": "배차내역 상세 상차지 · 하차지 배지 · 예약 배지", "sample": "당상 · 당착 · [예약]", "seen": "REAL", "handling": "UNUSED"},
      {"field": "tags", "where": "배차내역 상세 배지(지 — 뜻 모름)", "sample": "지 · 독차", "seen": "REAL", "handling": "UNUSED"},
      {"field": "orderNo", "where": "배차내역 상세 화물번호", "sample": "3-4991-0836", "seen": "REAL", "handling": "UNUSED"},
      {"field": "memo", "where": "배차내역 상세 화물정보", "sample": "당일상 당착 #연계#쿠팡 24시(군포-부천)새벽02시(부천-동탄)가는대로 하차", "seen": "REAL", "handling": "UNUSED"},
      {"field": "vehicleType", "where": "배차내역 상세 톤 수 · 차종", "sample": "5톤 · 윙바디", "seen": "REAL", "handling": "UNUSED"},
      {"field": "clock", "where": "배차내역 상세 배차시간", "sample": "배차시간: 12-30 14:53", "seen": "REAL", "handling": "UNUSED", "part": "배차"},
      {"field": "clock", "where": "배차내역 상세 하차시간", "sample": "하차시간 2025-11-23 20:43분", "seen": "REAL", "handling": "UNUSED", "part": "하차"}
    ]
  }
}/*JSON*/ as NetworkPageSpec;
