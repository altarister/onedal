import type { NetworkPageSpec } from './networkPages';

/**
 * 📄 **카카오 픽커 화면 정의** — 배차망 화면 정의 표(`networkPages.ts` — 칸 모양 · 기준 페이지 · 규칙은 거기)의 카카오 픽커 몫.
 * 🔴 원천이다 — 원달앱 생성 파일은 `cd onedal-web && pnpm gen:pages` 로 뽑는다. 몸통은 JSON 표시 주석 둘 사이의 엄격한 JSON 이다(뽑는 스크립트와 원달앱 검사가 그 사이를 읽는다).
 */
export const KAKAO_PICKER_PAGES: NetworkPageSpec = /*JSON*/{
  "about": ["📄 **카카오 픽커 페이지 정의 — 화면 어디에 어떤 글자로 오나** (실물 캡처 ex_images/카카오픽커/실물_2026 · 실물 로그).", "칸 이름은 세 배차망 공통(`PageField`) — 여기에는 «어디서 · 어떤 글자로»만 적는다.", "안 읽는·버리는 칸(UNUSED·DROPPED)이 다음에 읽을 재료다."],
  "excludeScan": ["itemSize", "memo"],
  "excludeScanWhy": "기사님 «카카오픽커는 물품정보»+«가» 유의사항 — 둘 다 «최종 수익» · 버튼 앞에서 끝난다 · 픽업지 주소 · 목록 잔상은 안 본다",
  "addressCut": null,
  "addressCutWhy": "지우지 않는다 — 원달앱이 이미 «구 동»으로 정리해 보낸다(앞뒤 공백만)",
  "networkMarkers": [["리스트 설정"], ["넘기기", "수락하기"], ["시작하기"], ["물품이 안전하게 전달"], ["밀어서 픽업 완료"], ["밀어서 사진 촬영"], ["배송 시간"], ["물품 파손"], ["픽업 준비"], ["픽업지 근처에"], ["픽업지 정보"], ["도착지 정보"], ["픽업지 주소 복사하기"], ["픽업지에 전화하기"], ["도착지 주소 복사하기"], ["도착지에 전화하기"]],
  "networkMarkersWhy": "목록 머리 · 수락 전 상세 버튼 둘 · 홈과 수락 뒤 단계 글자 하나씩 · 퀵 흰 페이지 칸 이름 하나씩(퀵 머리 글자는 원달앱이 못 읽는다)",
  "screens": [
    {"name": "홈(출근 전)", "standard": "HOME", "bases": ["home"], "match": [{"all": ["시작하기"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/01_홈_출근전.png", "ex_images/카카오픽커/실물_20260913_내가찍음/35_홈_관심일거리팝업_0411.png", "ex_images/카카오픽커/실물_20260913_내가찍음/36_홈_관심일거리팝업_1205.png"], "overlays": [
      {"name": "관심 일거리 상자", "kind": "POPUP", "match": [], "meaning": "관심 일거리를 고르라는 광고 상자", "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_20260913_내가찍음/35_홈_관심일거리팝업_0411.png", "ex_images/카카오픽커/실물_20260913_내가찍음/36_홈_관심일거리팝업_1205.png"], "wordsFrom": "server/config/keywords_picker.json adStartWords"},
      {"name": "일거리 광고 줄", "kind": "BANNER", "match": [], "meaning": "«이런 일거리 어떤가요?» 광고", "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/01_홈_출근전.png"], "wordsFrom": "server/config/keywords_picker.json adStartWords"},
      {"name": "프로모션 띠", "kind": "BANNER", "match": [], "meaning": "프로모션 안내 — 글이 바뀐다", "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/01_홈_출근전.png", "ex_images/카카오픽커/실물_20260913_내가찍음/35_홈_관심일거리팝업_0411.png"], "toCollect": "바뀌지 않는 알아볼 글자"}
    ]},
    {"name": "배송 완료", "standard": "RUN_DONE", "bases": ["myorder"], "match": [{"all": ["물품이 안전하게 전달"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/31_배송완료_2387P.jpeg", "ex_images/카카오픽커/실물_2026/32_배송완료_2387P_같은장면.jpeg"], "overlays": [
      {"name": "광고 띠", "kind": "BANNER", "match": [], "meaning": "제휴 배송 광고 — 글이 바뀐다", "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/31_배송완료_2387P.jpeg"], "toCollect": "바뀌지 않는 알아볼 글자"}
    ]},
    {"name": "퀵 배송 완료하기", "standard": "RUN_AT_DROPOFF", "bases": ["myorder"], "match": [{"all": ["배송 완료하기"], "any": ["픽업지 정보", "도착지 정보", "픽업지 주소 복사하기", "픽업지에 전화하기", "도착지 주소 복사하기", "도착지에 전화하기"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/22-1_퀵_배송_완료하기.png"], "overlays": []},
    {"name": "퀵 배송 출발하기", "standard": "RUN_TO_DROPOFF", "bases": ["myorder"], "match": [{"all": ["배송 출발하기"], "any": ["픽업지 정보", "도착지 정보", "픽업지 주소 복사하기", "픽업지에 전화하기", "도착지 주소 복사하기", "도착지에 전화하기"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/22-1_퀵_배송_출발하기.png"], "overlays": []},
    {"name": "퀵 픽업 완료하기", "standard": "RUN_AT_PICKUP", "bases": ["myorder"], "match": [{"all": ["픽업 완료하기"], "any": ["픽업지 정보", "도착지 정보", "픽업지 주소 복사하기", "픽업지에 전화하기", "도착지 주소 복사하기", "도착지에 전화하기"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/17-2_픽업이_지연되고_있어요.jpeg"], "overlays": [
      {"name": "픽업 지연 제목", "kind": "BANNER", "match": [{"any": ["픽업이 지연되고 있어요"]}], "meaning": "픽업이 늦었다", "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/17-2_픽업이_지연되고_있어요.jpeg"], "toCollect": "원달앱이 읽는 글자인지(퀵 머리 글자는 로그에 안 나온다)"}
    ]},
    {"name": "퀵 픽업 출발하기", "standard": "RUN_TO_PICKUP", "bases": ["myorder"], "buttons": {"cancel": "배정 취소"}, "match": [{"all": ["픽업 출발하기"], "any": ["픽업지 정보", "도착지 정보", "픽업지 주소 복사하기", "픽업지에 전화하기", "도착지 주소 복사하기", "도착지에 전화하기"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/17-1_픽업_출발해주세요_지금_바로_출발해_주세요.jpeg", "ex_images/카카오픽커/실물_20260913_내가찍음/37_기사님캡처_1158_요기요2883.jpg", "A24 폰 로그 09-13 11:55:15 · 11:56:32"], "overlays": [
      {"name": "출발 독촉 제목", "kind": "BANNER", "match": [{"any": ["지금 바로 출발해 주세요"]}], "meaning": "픽업이 늦었다 — 바로 출발하라", "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/17-1_픽업_출발해주세요_지금_바로_출발해_주세요.jpeg"], "toCollect": "원달앱이 읽는 글자인지(A24 로그 11:55~11:56 에 안 나옴)"}
    ]},
    {"name": "도보 픽업지 도착", "standard": "RUN_AT_PICKUP", "bases": ["myorder"], "match": [{"all": ["밀어서 픽업 완료"], "none": ["수락하기"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/17_픽업시트_밀어서픽업완료.jpeg"], "overlays": []},
    {"name": "도보 배송지 도착", "standard": "RUN_AT_DROPOFF", "bases": ["myorder"], "match": [{"all": ["밀어서 사진 촬영"], "none": ["수락하기"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/22_배송시트_밀어서사진촬영.jpeg"], "overlays": []},
    {"name": "인증사진 촬영", "standard": "RUN_AT_DROPOFF", "bases": ["myorder"], "match": [{"all": ["인증사진 촬영"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/25_인증사진촬영_카메라.jpeg"], "toCollect": "원달앱이 읽는 글자(로그) — 픽커 안 카메라 화면이다", "overlays": []},
    {"name": "촬영 확인", "standard": "RUN_AT_DROPOFF", "bases": ["myorder"], "match": [{"all": ["촬영 확인", "문자 전송"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/26_촬영확인_문자전송.jpeg"], "overlays": []},
    {"name": "문자 전송", "standard": "RUN_AT_DROPOFF", "bases": ["myorder"], "match": [{"all": ["문자 재전송"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/30_문자전송후_배송완료버튼.jpeg"], "overlays": []},
    {"name": "도보 배송 중", "standard": "RUN_TO_DROPOFF", "bases": ["myorder"], "match": [{"any": ["배송 시간", "물품 파손"], "none": ["수락하기"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/21_배송중_배송시간15분남음.jpeg"], "overlays": [
      {"name": "배송 완료 확인", "kind": "POPUP", "match": [{"all": ["배송을 완료하셨나요"]}], "meaning": "배송 목표 시간이 다가온다 — 완료했는지 묻는다", "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/24_배송완료확인_팝업.jpeg"]}
    ]},
    {"name": "도보 픽업 이동", "standard": "RUN_TO_PICKUP", "bases": ["myorder"], "match": [{"any": ["픽업 준비", "픽업지 근처에"], "none": ["수락하기", "목록 지도"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/16_픽업이동_준비13분_배송33분.jpeg", "ex_images/카카오픽커/실물_2026/18_픽업이동_준비완료_배송25분.jpeg"], "overlays": [
      {"name": "배정 취소 불가", "kind": "POPUP", "match": [{"all": ["배정 취소 불가"]}], "meaning": "취소 가능 시간이 지나 배정을 취소할 수 없다", "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/19_배정취소불가_팝업.jpeg"]}
    ]},
    {"name": "수락 후 오더 전체", "standard": "DETAIL_CONFIRMED", "bases": ["myorder"], "match": [], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/23_수락후_오더전체_최종수익2387.jpeg"], "toCollect": "원달앱이 읽는 글자(로그)", "overlays": []},
    {"name": "도움말", "standard": "NETWORK_MENU", "bases": [], "match": [{"all": ["자주 묻는 질문", "고객센터 연결"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/20_도움말_픽업FAQ_오더번호.jpeg"], "overlays": []},
    {"name": "상세(수락 전 시트)", "standard": "DETAIL_PRE_CONFIRM", "bases": ["detail"], "buttons": {"accept": "수락하기", "filterOut": "넘기기"}, "match": [{"all": ["넘기기", "수락하기"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/05_상세_지도_수락하기.png", "ex_images/카카오픽커/실물_2026/06_상세_마감시각_준비시간.jpeg", "ex_images/카카오픽커/실물_2026/07_상세_최종수익분해.jpeg", "ex_images/카카오픽커/실물_2026/08_상세_지도_판교.jpeg", "ex_images/카카오픽커/실물_2026/09_상세_가격오르기전_9693.jpeg", "ex_images/카카오픽커/실물_2026/10_상세_가격오른뒤_11393.jpeg", "ex_images/카카오픽커/실물_2026/10-1_상세_시트(상).jpeg", "ex_images/카카오픽커/실물_2026/10-2_상세_시트(중).jpeg", "ex_images/카카오픽커/실물_2026/10-3_상세_시트(하).jpeg", "ex_images/카카오픽커/실물_2026/33_상세_예약콜_위례_삼성2동.png"], "overlays": [
      {"name": "첫 계약 필수정보", "kind": "POPUP", "match": [{"all": ["필수 정보를 입력해 주세요"]}], "meaning": "이메일 · 거주지를 넣어야 수락할 수 있다(한 번만)", "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/14_첫계약_필수정보입력_팝업_1회성.jpeg"]},
      {"name": "배정 실패 오류", "kind": "POPUP", "match": [{"any": ["이미 배정이 완료된", "다른 기사에게 배정"]}], "meaning": "수락했지만 남이 먼저 잡았다", "action": "ERROR", "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처"}
    ]},
    {"name": "내 오더 탭", "standard": "MY_ORDERS", "bases": ["myorders"], "match": [{"all": ["목록 지도", "신규", "내 오더"], "none": ["리스트 설정", "수락하기"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/15_내오더탭_픽업준비14분남음.jpeg", "ex_images/카카오픽커/실물_2026/15-1_내오더_오더없을때.jpeg", "ex_images/카카오픽커/실물_2026/15-2_내오더(도보와퀵차이).png"], "overlays": [
      {"name": "오더 없음 안내", "kind": "BANNER", "match": [{"all": ["진행 중인 오더가 없어요"]}], "meaning": "진행 중인 오더가 없다 — 수락의 증거가 아니다", "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/15-1_내오더_오더없을때.jpeg"]},
      {"name": "수락 토스트", "kind": "TOAST", "match": [{"all": ["오더를 수락했습니다"]}], "meaning": "방금 수락이 됐다", "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/15-2_내오더(도보와퀵차이).png"]},
      {"name": "합짐 개수 띠", "kind": "BANNER", "match": [{"all": ["최대 합짐 개수"]}], "meaning": "퀵을 몇 건까지 합짐할 수 있나", "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/15-1_내오더_오더없을때.jpeg"]}
    ]},
    {"name": "퀵 배송 오더카드 설정", "standard": "NETWORK_MENU", "bases": [], "match": [{"all": ["오더카드 설정", "오더카드 받기"]}, {"all": ["오더카드 받기", "소리 알림 켜기", "진동 알림 켜기"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/36_퀵배송_오더카드설정.jpg", "A24 폰 로그 10-03 08:25:32 · 08:25:48", "진입: 신규 리스트 «카드설정»(사진 34 떠 있는 막대 · 짐작)"], "toCollect": "도보 · 한차 오더카드 설정의 머리 글자 · «직접 설정하기» 뒤 화면 — 열리는 첫 프레임에 목록 잔상이 섞여 «콜을 누른 직후 넘어가는 틀»보다 앞에 둔다", "overlays": []},
    {"name": "수요지도", "standard": "NETWORK_MENU", "bases": [], "match": [{"all": ["시간별 오더 정보"]}], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/37_수요지도_시간별오더정보.jpg", "A24 폰 로그 10-03 08:25:51", "진입: 신규 리스트 «수요지도»(사진 34 떠 있는 막대 · 짐작)"], "toCollect": "«대리» 탭을 고른 모습 · ⓘ 안내", "overlays": []},
    {"name": "메뉴", "standard": "NETWORK_MENU", "bases": [], "match": [{"all": ["수행방법 안내", "포인트 내역", "수행 내역"]}, {"all": ["프로필 사진", "기본 아이콘"]}], "listReturn": false, "seen": "REAL", "evidence": ["A24 폰 로그 10-03 08:27:48 (사진은 이름 · 전화가 찍혀 레포에 담지 않는다)", "A24 폰 로그 10-03 09:14:09 · 09:15:00 · 09:22:52 · 09:23:00 (위쪽만 읽힌 프레임 — 아래 칸이 빈 «arrow icon» · 맨 위 프로필 칸만)", "진입: 신규 리스트 오른쪽 위 «☰»(짐작)"], "overlays": []},
    {"name": "공지사항", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (메뉴 «공지사항» 뒤)", "overlays": []},
    {"name": "수행방법 안내", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (메뉴 «수행방법 안내» 뒤)", "overlays": []},
    {"name": "포인트 내역", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (메뉴 «포인트 내역» 뒤)", "overlays": []},
    {"name": "수행 내역", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (메뉴 «수행 내역» 뒤)", "overlays": []},
    {"name": "자격정보 및 보험 관리", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (메뉴 «자격정보 및 보험 관리» 뒤)", "overlays": []},
    {"name": "서비스 등록 관리", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (메뉴 «서비스 등록 관리» 뒤)", "overlays": []},
    {"name": "배송수단 관리", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (메뉴 «배송수단 관리» 뒤)", "overlays": []},
    {"name": "일거리 추천 프로필 관리", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (메뉴 «일거리 추천 프로필 관리» 뒤)", "overlays": []},
    {"name": "사고접수/내역", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (메뉴 «사고접수/내역» 뒤)", "overlays": []},
    {"name": "자주묻는질문", "standard": "NETWORK_MENU", "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (메뉴 «자주묻는질문» 뒤)", "overlays": []},
    {"name": "고객센터 연결하기", "standard": null, "bases": [], "match": [], "listReturn": false, "seen": "UNKNOWN", "evidence": [], "toCollect": "캡처 · 알아보는 글자 (메뉴 «고객센터 연결하기» 뒤) · 전화 앱으로 넘어가는지(그러면 OTHER_APP)", "overlays": []},
    {"name": "내 활동(미션 & 혜택)", "standard": "NETWORK_MENU", "bases": [], "match": [{"all": ["내 배지", "미션 & 혜택"]}], "listReturn": false, "seen": "REAL", "evidence": ["A24 폰 로그 10-03 09:21:09 (머리 «뒤로가기 내 활동» · 서포트 모드 미션 줄)", "A24 폰 로그 10-03 09:13:19 (나가는 찰나 — 1초 뒤 사진은 이미 신규 리스트)", "진입: 신규 리스트 «퀵 서포트 모드 1장 받기 0/1건 ›»(짐작) — 손"], "toCollect": "캡처 · «퀵 배송 / 대리» 탭 · 미션을 채운 모습", "overlays": []},
    {"name": "상세 시트가 닫히는 찰나", "standard": "TRANSITION", "bases": [], "match": [{"none": ["넘기기", "수락하기", "리스트 설정", "물품 정보", "픽업지 정보"], "shape": {"read": "^픽업지 \\S+ \\S+", "min": 1, "max": 1}}], "listReturn": false, "seen": "REAL", "evidence": ["A24 폰 로그 10-02 15:07:59", "진입: 상세(수락 전 시트)에서 «넘기기» 또는 뒤로 — 손(원달앱 누름 · 뒤로 없음)"], "toCollect": "같은 꼴 더 모으기(0.2초라 캡처 불가) — 픽업지 한 줄만 남는 다른 화면이 있나", "overlays": []},
    {"name": "콜을 누른 직후 넘어가는 틀", "standard": "TRANSITION", "bases": [], "match": [{"none": ["리스트 설정", "수락하기", "목록 지도"], "shape": {"read": "(?:퀵|도보|한차) \\d+(?:\\.\\d+)?km (?:퀵|도보|한차) ", "min": 3}}], "listReturn": false, "seen": "REAL", "evidence": ["A24 폰 로그 10-02 09:20:45 · 09:31:17 · 09:48:01 · 09:53:16"], "toCollect": "캡처 — 0.3~0.7초라 로그만 있다", "overlays": []},
    {"name": "신규 리스트", "standard": "LIST", "bases": ["list"], "match": [{"all": ["리스트 설정"]}, {"all": ["신규 내 오더"], "none": ["리스트 설정", "목록 지도", "수락하기", "시작하기", "카테고리가 없습니다"], "shape": {"read": "(?:^|\\s)Ad(?=\\s|$)", "min": 1}}, {"all": ["신규 내 오더"], "any": ["서포트모드", "서포트 모드"], "none": ["리스트 설정", "목록 지도", "수락하기"]}, {"none": ["수락하기", "목록 지도"], "shape": {"read": "\\d+(?:\\.\\d+)?km\\s.{0,40}?\\d{1,3}(?:,\\d{3})+", "min": 3}}], "listReturn": false, "seen": "REAL", "evidence": ["A24 폰 로그 10-03 09:21:26 (목록 맨 아래 — 구인 광고 «Ad»와 아래 탭만 · 1초 뒤 사진은 이미 내 오더 탭)", "ex_images/카카오픽커/실물_2026/02_리스트_높은가격순_20km.png", "ex_images/카카오픽커/실물_2026/03_리스트_이미배정완료_토스트.png", "ex_images/카카오픽커/실물_2026/11_리스트_추천순_20km.jpeg", "ex_images/카카오픽커/실물_2026/13_리스트_가까운순_20km.jpeg", "ex_images/카카오픽커/실물_2026/13-1_신규_리스트(퀵,중형,반나절,승,예약).jpeg", "ex_images/카카오픽커/실물_2026/13-2_신규_스크롤다운.jpeg (내려감)"], "overlays": [
      {"name": "«배정» 알림", "kind": "NOTICE", "match": [{"any": ["방금 배정된 오더", "이미 배정이 완료된"]}], "meaning": "남이 먼저 잡았다", "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/03_리스트_이미배정완료_토스트.png", "실물 로그 09-30 13:08:45 «방금 배정된 오더»"]},
      {"name": "광고 줄", "kind": "BANNER", "match": [], "meaning": "목록 맨 아래 붙는 구인 광고(제목 문구는 바뀐다 · 늘 붙는 것은 광고 표시 «Ad») — 목록을 끝까지 내리면 이것만 보인다(신규 리스트 «Ad» 갈래)", "seen": "REAL", "evidence": ["A24 폰 로그 10-03 09:21:19 · 09:21:24 · 09:21:26"], "toCollect": "캡처(목록 맨 아래)", "wordsFrom": "server/config/keywords_picker.json adStartWords"},
      {"name": "정렬 시트", "kind": "POPUP", "match": [{"all": ["정렬", "추천순", "픽업지 가까운순", "높은 가격순"]}], "meaning": "목록 정렬(높은 가격순 · 추천순 · 가까운순)을 고른다", "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/35_리스트_정렬시트.jpg", "A24 폰 로그 10-02 09:14:30 · 11:01:31 · 10-03 08:24:52", "진입: 신규 리스트 머리 «높은 가격순 ▾»(사진 · 짐작) — 손"]},
      {"name": "오더 탐색 종료 확인", "kind": "POPUP", "match": [{"all": ["오더 탐색을", "종료하시겠어요"]}], "meaning": "목록에서 뒤로를 누르면 탐색을 끝낼지 묻는다 — «확인»이면 홈(출근 전)으로 나가 콜을 안 받는다 · 원달앱은 아무것도 안 누른다", "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/34_리스트_탐색종료확인_팝업.jpg", "A24 폰 로그 10-02 11:01:58 · 10-03 08:16:13", "진입: 신규 리스트에서 뒤로(짐작) — 손(그 사이 원달앱 뒤로 · 누름 없음)"]},
      {"name": "오더카드 대기 띠", "kind": "BANNER", "match": [{"all": ["오더카드 대기 중"]}], "meaning": "지금 오더카드 없음 · 대기 중 — 늘 맨 위에 붙는다", "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/02_리스트_높은가격순_20km.png", "ex_images/카카오픽커/실물_2026/11_리스트_추천순_20km.jpeg", "ex_images/카카오픽커/실물_2026/13-2_신규_스크롤다운.jpeg"]},
      {"name": "오더카드", "kind": "BANNER", "match": [], "meaning": "대기 띠 자리에 들어온 오더 한 건 — 띠 안에 «P 수락» 버튼이 있다", "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/04_오더카드_리스트상단띠_픽업배송km.jpeg"], "toCollect": "알아보는 글자(로그)"},
      {"name": "서포트 모드 띠", "kind": "BANNER", "match": [{"all": ["서포트 모드 1장 받기"]}], "meaning": "퀵 서포트 모드 받기 진행 안내", "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/02_리스트_높은가격순_20km.png"]}
    ]},
    {"name": "안드로이드 공유 시트", "standard": "OTHER_APP", "bases": [], "match": [], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/27_공유시트_문자앱고르기.jpeg"], "toCollect": "패키지 이름", "overlays": []},
    {"name": "메시지 앱 문자 작성", "standard": "OTHER_APP", "bases": [], "match": [], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/29_문자작성_배송완료MMS.jpeg"], "toCollect": "패키지 이름", "overlays": []},
    {"name": "메시지 앱 채팅+ 안내", "standard": "OTHER_APP", "bases": [], "match": [], "listReturn": false, "seen": "REAL", "evidence": ["ex_images/카카오픽커/실물_2026/28_채팅플러스_안내.jpeg"], "toCollect": "패키지 이름", "overlays": []}
  ],
  "absentPages": {"confirm": {"why": "수락하면 확정 화면 없이 바로 내 오더 — 기사님 확인", "evidence": "ex_images/카카오픽커/실물_2026/15_내오더탭_픽업준비14분남음.jpeg"}},
  "pages": {
    "list": [
      {"field": "fare", "where": "목록 줄 오른쪽", "sample": "16,093", "seen": "REAL", "handling": "READ", "usedAt": "KakaoPickerParser.parse"},
      {"field": "pickupDistance", "where": "몸통 줄 맨 앞", "sample": "4.7km", "seen": "REAL", "handling": "READ", "usedAt": "KakaoPickerParser.parse"},
      {"field": "itemSize", "where": "꼬리표 줄", "sample": "중형", "seen": "REAL", "handling": "READ", "usedAt": "KakaoPickerParser.parse"},
      {"field": "tags", "where": "꼬리표 줄", "sample": "퀵 반나절 승", "seen": "REAL", "handling": "READ", "usedAt": "KakaoPickerParser.parse"},
      {"field": "reservation", "where": "꼬리표 줄 «예약» 뒤", "sample": "예약 내일 · 예약 18:30 · 예약 9/30(수) · 예약", "seen": "REAL", "handling": "READ", "usedAt": "KakaoPickerParser.listReservation"},
      {"field": "remaining", "where": "꼬리표 줄", "sample": "준비 29분 · 31분 내", "seen": "REAL", "handling": "READ", "usedAt": "KakaoPickerParser.parse (꼬리표)"},
      {"field": "pickup", "where": "몸통 줄 — 시·구 줄임 + 동", "sample": "광주 경안", "seen": "REAL", "handling": "READ", "usedAt": "KakaoPickerParser.parse"},
      {"field": "dropoff", "where": "꼬리표 줄 오른쪽 구 + 몸통 줄 오른쪽 동", "sample": "용산 한남", "seen": "REAL", "handling": "READ", "usedAt": "KakaoPickerParser.parse"}
    ],
    "detail": [
      {"field": "tags", "where": "사진 위쪽 꼬리표 줄", "sample": "퀵 반나절 예약", "seen": "REAL", "handling": "UNUSED"},
      {"field": "reservation", "where": "사진 띠", "sample": "내일 14:00 픽업예약", "seen": "REAL", "handling": "READ", "usedAt": "PickerDetailOcrParser.detailReservation"},
      {"field": "pickup", "where": "사진 첫 정거장 — 행정동 + 건물", "sample": "경기 광주시 경안동 / 람미당", "seen": "REAL", "handling": "READ", "usedAt": "PickerScreenOcr.parseDetail"},
      {"field": "dropoff", "where": "사진 둘째 정거장", "sample": "서울 용산구 한남동 / 아라마크", "seen": "REAL", "handling": "READ", "usedAt": "PickerScreenOcr.parseDetail"},
      {"field": "pickupDistance", "where": "사진 정거장 오른쪽", "sample": "픽업 4.7km", "seen": "REAL", "handling": "DROPPED", "usedAt": "PickerScreenOcr — straightKm 읽고 안 씀"},
      {"field": "deliveryDistance", "where": "사진 정거장 오른쪽", "sample": "배송 26.4km", "seen": "REAL", "handling": "DROPPED", "usedAt": "PickerScreenOcr — straightKm 읽고 안 씀"},
      {"field": "clock", "where": "사진 정거장 시각", "sample": "내일 17:49 · 12:39까지", "seen": "REAL", "handling": "DROPPED", "usedAt": "PickerScreenOcr — 하차 at 읽고 안 씀"},
      {"field": "itemSize", "where": "사진 물품 정보", "sample": "중형 세 변의 합 140cm · 20kg 이하", "seen": "REAL", "handling": "READ", "usedAt": "PickerScreenOcr.parseDetail · 서버 제외어 찾는 칸(excludeScan) — 접근성 글에서 «최종 수익» · «유의사항» · 버튼 앞까지 · 관제웹 물품 칸(서버 pageFieldOf)", "read": "물품\\s*정보\\s+([\\s\\S]*?)(?=\\s+유의사항|\\s+최종 수익|\\s+넘기기|\\s+수락하기|$)"},
      {"field": "memo", "where": "사진 유의사항", "sample": "바로 배송가주실 분만 잡아주세요", "seen": "REAL", "handling": "READ", "usedAt": "서버 제외어 찾는 칸(excludeScan) — «유의사항» 다음 «최종 수익» · 버튼 앞 · 원달앱은 이 칸을 안 읽는다(사진 판독도 안 씀)", "read": "유의사항\\s+([\\s\\S]*?)(?=\\s+최종 수익|\\s+넘기기|\\s+수락하기|$)"},
      {"field": "fare", "where": "상세 아래 최종 수익", "sample": "최종 수익 2,387", "seen": "REAL", "handling": "UNUSED"}
    ],
    "confirm": [],
    "myorders": [
      {"field": "stage", "where": "내 오더 줄 머리", "sample": "픽업 준비 14분 남음", "seen": "REAL", "handling": "READ", "usedAt": "KakaoPickerKeywords.stageOf (단계 낱말만)"},
      {"field": "remaining", "where": "내 오더 줄 머리", "sample": "14분 남음", "seen": "REAL", "handling": "UNUSED"},
      {"field": "pickup", "where": "픽업 배지 옆", "sample": "[태전점]롯데리아", "seen": "REAL", "handling": "UNUSED"},
      {"field": "dropoff", "where": "배송지 줄", "sample": "배송지: 쌍용 스윗닷홈아파트 304동1002호", "seen": "REAL", "handling": "UNUSED"},
      {"field": "tags", "where": "오른쪽 배지", "sample": "도보", "seen": "REAL", "handling": "UNUSED"}
    ],
    "myorder": [
      {"field": "stage", "where": "운행 시트 머리", "sample": "지금 바로 출발해 주세요 · 픽업이 지연되고 있어요", "seen": "REAL", "handling": "READ", "usedAt": "KakaoPickerKeywords.stageOf (단계 낱말만)"},
      {"field": "remaining", "where": "운행 시트 머리", "sample": "준비 13분 · 배송 33분", "seen": "REAL", "handling": "UNUSED"},
      {"field": "pickup", "where": "운행 시트 픽업지 · 오더 전체 보기 픽업지", "sample": "[태전점]롯데리아", "seen": "REAL", "handling": "UNUSED"},
      {"field": "dropoff", "where": "운행 시트 배송지 · 오더 전체 보기 배송지", "sample": "쌍용 스윗닷홈아파트 304동1002호", "seen": "REAL", "handling": "UNUSED"},
      {"field": "fare", "where": "오더 전체 보기 최종 수익", "sample": "최종 수익 2,387P", "seen": "REAL", "handling": "UNUSED"},
      {"field": "memo", "where": "오더 전체 보기 고객 요청", "sample": "문 앞에 놔주세요 (벨 O) 비대면 배달 / 사진 필수", "seen": "REAL", "handling": "UNUSED"},
      {"field": "orderNo", "where": "오더 전체 보기 오더 확인", "sample": "260902091827593", "seen": "REAL", "handling": "UNUSED"}
    ]
  }
}/*JSON*/ as NetworkPageSpec;
