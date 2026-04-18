# 🗺️ 1DAL 풀 스택 라이프사이클 로그 매핑 리포트 (0418_2301 Full Data)

---


### 🟢 [STEP 1] 관제탑 서버 기동 및 필터 동기화
*(시작 기준 시간: 22:54:23.843)*

- `[ROADMAP 22:54:23.843] [☁️서버] 서버 기동 및 디폴트 필터 셋업 (대기 모드)`
- `[ROADMAP 22:54:24.185] [🖥️관제웹] 1DAL 웹(관제웹) 시작, 로그인`
- `[ROADMAP 22:54:24.186] [🖥️관제웹] 1DAL 웹(관제웹) 시작, 로그인`

    <details>
    <summary>🔽 [GPS] 현위치 갱신됨: {x: 127.29444935580494, y: 37.376582131064055}</summary>

    ```json
    [GPS] 현위치 갱신됨: {x: 127.29444935580494, y: 37.376582131064055}
    [GPS] 현위치 갱신됨: {x: 127.2943566107892, y: 37.376563335409266}
    ```

    </details>
- `[ROADMAP 22:54:24.196] [☁️서버] [Socket] 디폴트 필터 설정값 전송 (관제 UI 초기화)`

### 🟢 [STEP 2] 첫짐 1차 선점 (단독콜 사냥)
*(시작 기준 시간: 22:59:59.793)*

- `🚦 [ROADMAP 22:59:59.793] [📱앱] [UNKNOWN] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 22:59:59.855] [📱앱] [LIST] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 22:59:59.941] [📱앱] [LIST] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 22:59:59.963] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(다)=✅ 도착지(0중 덕양구)=✅ 요금(0 <= 85000)=✅ 상차지/거리(999 >= 0.2km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 22:59:59.963] [📱앱] [LIST] AccessibilityService로 바뀐 리스트 감지 후 text 추출`
- `🚦 [ROADMAP 22:59:59.964] [📱앱] [LIST] 리스트에서 바뀐 text 감지 후 text 추출`
- `🚦 [ROADMAP 22:59:59.973] [📱앱] [LIST] [인성 Socket] 인성콜에 선택된 콜 정보 전달 (꿀콜 클릭!)`
- `🚦 [ROADMAP 23:00:00.029] [📱앱] 버튼 터치 완료 (가로채기 성공) X:917.0, Y:568.0`
- `🚦 [ROADMAP 23:00:00.200] [📱앱] [DETAIL_PRE_CONFIRM] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 23:00:00.200] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지 진입`
- `🚦 [ROADMAP 23:00:00.207] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지 데이터(확정,적요상세,출발지,도착지) 추출`
- `🚦 [ROADMAP 23:00:00.207] [📱앱] [DETAIL_PRE_CONFIRM] 추출된 데이터로 한번더 필터링`
- `🚦 [ROADMAP 23:00:00.207] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(다)=✅ 도착지(0중 덕양구)=✅ 요금(0 <= 85000)=✅ 상차지/거리(999 >= 0.2km)=✅ 블랙()=✅`

### 🟡 [STEP 3] 1차 확정 통신
*(시작 기준 시간: 23:00:00.209)*

- `🚦 [ROADMAP 23:00:00.209] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지에서 '확정' 추출 후 클릭`
- `🚦 [ROADMAP 23:00:00.209] [📱앱] [DETAIL_PRE_CONFIRM] [인성 Socket] 콜 확정 완료`
- `🚦 [ROADMAP 23:00:00.212] [📱앱] '확정' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 23:00:00.264] [📱앱] 버튼 터치 완료 (가로채기 성공) X:161.0, Y:2251.0`

    <details>
    <summary>🔽 🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용...</summary>

    ```json
    🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용을 긁어서 POST /api/orders/detail 로 보내주세요."}
    ```

    </details>
- `🚦 [ROADMAP 23:00:00.266] [📱앱] [HTTP 폴링] 응답 /orders/confirm`
- `[ROADMAP 23:00:00.355] [☁️서버] [HTTP 폴링] 응답 /orders/confirm`
- `[ROADMAP 23:00:00.356] [☁️서버] [HTTP 폴링] POST /orders/confirm 확정정보 정보 전송 수신`
- `[ROADMAP 23:00:00.357] [🖥️관제웹] [관제대시보드] 🟢 [웹 수신] order-evaluating | ID: 6a659a41-279d-4d11-b125-717c41e3564c | 기기: 앱폰-sdk_gpho-160 | 덕양구`
- `[ROADMAP 23:00:00.358] [🖥️관제웹] [관제대시보드] 확정페이지 진입 (선빵 수신으로 상세 모드 구동)`
- `🚦 [ROADMAP 23:00:00.419] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 모드: AUTO`

### 🟢 [STEP 4] 2차 상세 수집: 팝업 자동 서핑
*(시작 기준 시간: 23:00:00.421)*

- `🚦 [ROADMAP 23:00:00.421] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 23:00:00.424] [📱앱] '적요상세' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 23:00:00.438] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '적요상세' 추출 후 클릭`
- `🚦 [ROADMAP 23:00:00.480] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 23:00:00.490] [📱앱] 버튼 터치 완료 (가로채기 성공) X:149.0, Y:1179.0`
- `🚦 [ROADMAP 23:00:00.609] [📱앱] [POPUP_MEMO] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 23:00:00.609] [📱앱] [POPUP_MEMO] 적요상세페이지에서 '젹요 내용' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 23:00:00.611] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 23:00:00.664] [📱앱] 버튼 터치 완료 (가로채기 성공) X:540.0, Y:2264.0`
- `🚦 [ROADMAP 23:00:00.718] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 23:00:00.718] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 23:00:00.720] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '출발지' 추출 후 클릭`
- `🚦 [ROADMAP 23:00:00.722] [📱앱] '출발지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 23:00:00.776] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1592.0`
- `🚦 [ROADMAP 23:00:00.839] [📱앱] [POPUP_PICKUP] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 23:00:00.840] [📱앱] [POPUP_PICKUP] 출발지페이지 text중 '전화, 위치' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 23:00:00.841] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 23:00:00.894] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`
- `🚦 [ROADMAP 23:00:00.948] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 23:00:00.948] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 23:00:00.948] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '도착지' 추출 후 클릭`
- `🚦 [ROADMAP 23:00:00.949] [📱앱] '도착지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 23:00:01.001] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1742.0`
- `🚦 [ROADMAP 23:00:01.065] [📱앱] [POPUP_DROPOFF] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 23:00:01.065] [📱앱] [POPUP_DROPOFF] 도착지페이지 text중 '전화, 위치' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 23:00:01.066] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 23:00:01.067] [📱앱] [POPUP_DROPOFF] 확정페이지 진입`
- `🚦 [ROADMAP 23:00:01.136] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`
- `[ROADMAP 23:00:01.169] [☁️서버] [HTTP 폴링] POST /orders/detail 데이터 수신`

### 🟢 [STEP 5] 카카오 연산 3중 폴백 & 자동 회랑 전개
*(시작 기준 시간: 23:00:01.172)*

- `[ROADMAP 23:00:01.172] [☁️서버] [Socket] 상하차지 송출`
- `[ROADMAP 23:00:01.173] [☁️서버] 🛡️ [카카오 API 3중 폴백] 괄호제거 ➡️ 주소검색 ➡️ 키워드검색 ➡️ 4어절 절사`

    <details>
    <summary>🔽 🌍 [Geocoding] 상차지 변환: '경기 광주시 경안동 22-1 광주역 공영주차장' -&gt; X:127.259733647661, Y:37.4...</summary>

    ```json
    🌍 [Geocoding] 상차지 변환: '경기 광주시 경안동 22-1 광주역 공영주차장' -> X:127.259733647661, Y:37.4085969352066
    ```

    </details>
- `[ROADMAP 23:00:01.173] [🖥️관제웹] [관제대시보드] 🟡 [웹 수신] order-detail-received | ID: 6a659a41 | 경기 광주시 경안동 22-1 광주역`
- `[ROADMAP 23:00:01.870] [☁️서버] [Socket] 경로 및 시간 정보, 수익률 전송`

    <details>
    <summary>🔽 🔎 [카카오 연산 완료] 단독 69.7km, 62분 '콜' | Polyline 길이: 698</summary>

    ```json
    🔎 [카카오 연산 완료] 단독 69.7km, 62분 '콜' | Polyline 길이: 698
    ⚖️ [소켓 Decision 수신] ID: 6a659a41-279d-4d11-b125-717c41e3564c, Action: KEEP
    ```

    </details>
- `[ROADMAP 23:00:01.873] [🖥️관제웹] [관제대시보드] 🔵 [웹 수신] order-evaluated | ID: 6a659a41 | 단독 69.7km, 62분 '콜'`
- `[ROADMAP 23:00:01.874] [🖥️관제웹] [관제대시보드] 추천 결과 노출, 경로보기버튼 추가 노출 후 판단 (취소 or 닫기) 대기`

### 🟢 [STEP 6] 관제탑 결재 (취소 vs 유지)
*(시작 기준 시간: 23:00:01.874)*


    <details>
    <summary>🔽 👆 [사용자 클릭] 프론트에서 '유지 확정' 버튼 클릭 (ID: 6a659a41-279d-4d11-b125-717c41e3564c)</summary>

    ```json
    👆 [사용자 클릭] 프론트에서 '유지 확정' 버튼 클릭 (ID: 6a659a41-279d-4d11-b125-717c41e3564c)
    🌐 [post /detail response / 200] {"deviceId":"server","action":"KEEP"}
    ```

    </details>
- `🚦 [ROADMAP 23:00:06.403] [📱앱] [HTTP 폴링] 응답 /orders/detail 유지 정보 전송`
- `[ROADMAP 23:00:06.486] [🖥️관제웹] [관제대시보드] [Socket] 유지 전달`
- `[ROADMAP 23:00:06.487] [☁️서버] [HTTP 폴링] 응답 /orders/detail 유지 정보 전송`
- `[ROADMAP 23:00:06.488] [☁️서버] 합짐 필터로 설정값 업데이트 (합짐 사냥용)`
- `🚦 [ROADMAP 23:00:06.914] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 23:00:06.918] [📱앱] [POPUP_DROPOFF] '닫기' 클릭 후 리스트 페이지 복귀 (유지)`
- `🚦 [ROADMAP 23:00:06.971] [📱앱] 버튼 터치 완료 (가로채기 성공) X:122.0, Y:2251.0`

### 🚀 [STEP 7] "합짐" 2차 선점 (합짐 사냥 돌입 & 우회 동선 연산)
*(시작 기준 시간: 23:00:07.129)*

- `🚦 [ROADMAP 23:00:07.129] [📱앱] [LIST] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 23:00:07.133] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(라)=✅ 도착지(0중 곤지암읍)=✅ 요금(0 <= 30000)=✅ 상차지/거리(999 >= 0.2km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 23:00:07.134] [📱앱] [LIST] AccessibilityService로 바뀐 리스트 감지 후 text 추출`
- `🚦 [ROADMAP 23:00:07.134] [📱앱] [LIST] 리스트에서 바뀐 text 감지 후 text 추출`
- `🚦 [ROADMAP 23:00:07.136] [📱앱] [LIST] [인성 Socket] 인성콜에 선택된 콜 정보 전달 (꿀콜 클릭!)`
- `🚦 [ROADMAP 23:00:07.188] [📱앱] 버튼 터치 완료 (가로채기 성공) X:917.0, Y:568.0`
- `🚦 [ROADMAP 23:00:07.322] [📱앱] [DETAIL_PRE_CONFIRM] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 23:00:07.322] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지 진입`
- `🚦 [ROADMAP 23:00:07.326] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지 데이터(확정,적요상세,출발지,도착지) 추출`
- `🚦 [ROADMAP 23:00:07.326] [📱앱] [DETAIL_PRE_CONFIRM] 추출된 데이터로 한번더 필터링`
- `🚦 [ROADMAP 23:00:07.326] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(라)=✅ 도착지(0중 곤지암읍)=✅ 요금(0 <= 30000)=✅ 상차지/거리(999 >= 0.2km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 23:00:07.326] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지에서 '확정' 추출 후 클릭`
- `🚦 [ROADMAP 23:00:07.327] [📱앱] [DETAIL_PRE_CONFIRM] [인성 Socket] 콜 확정 완료`
- `🚦 [ROADMAP 23:00:07.327] [📱앱] '확정' 버튼 인식 ➡️ 클릭 시도`

    <details>
    <summary>🔽 🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용...</summary>

    ```json
    🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용을 긁어서 POST /api/orders/detail 로 보내주세요."}
    ```

    </details>
- `🚦 [ROADMAP 23:00:07.332] [📱앱] [HTTP 폴링] 응답 /orders/confirm`
- `🚦 [ROADMAP 23:00:07.381] [📱앱] 버튼 터치 완료 (가로채기 성공) X:161.0, Y:2251.0`
- `[ROADMAP 23:00:07.422] [☁️서버] [HTTP 폴링] 응답 /orders/confirm`
- `[ROADMAP 23:00:07.423] [☁️서버] [HTTP 폴링] POST /orders/confirm 확정정보 정보 전송 수신`
- `[ROADMAP 23:00:07.423] [☁️서버] 대기 필터로 설정값 업데이트 (isActive: false)`
- `[ROADMAP 23:00:07.423] [☁️서버] [Socket] 확정정보 정보 + 대기 필터 정보 전송`
- `[ROADMAP 23:00:07.423] [☁️서버] 관제탑 무응답 대비 30초 데스밸리 타이머 기동 (안전망 강화)`
- `[ROADMAP 23:00:07.423] [🖥️관제웹] [관제대시보드] 🟢 [웹 수신] order-evaluating | ID: af730879-c77b-4035-a49a-dd7e6acbb1e1 | 기기: 앱폰-sdk_gpho-160 | 곤지암읍`
- `[ROADMAP 23:00:07.423] [🖥️관제웹] [관제대시보드] 확정페이지 진입 (선빵 수신으로 상세 모드 구동)`
- `🚦 [ROADMAP 23:00:07.530] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 23:00:07.531] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 23:00:07.531] [📱앱] '적요상세' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 23:00:07.533] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '적요상세' 추출 후 클릭`
- `🚦 [ROADMAP 23:00:07.583] [📱앱] 버튼 터치 완료 (가로채기 성공) X:149.0, Y:1153.0`
- `🚦 [ROADMAP 23:00:07.700] [📱앱] [POPUP_MEMO] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 23:00:07.700] [📱앱] [POPUP_MEMO] 적요상세페이지에서 '젹요 내용' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 23:00:07.701] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 23:00:07.753] [📱앱] 버튼 터치 완료 (가로채기 성공) X:540.0, Y:2264.0`
- `🚦 [ROADMAP 23:00:07.822] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 23:00:07.823] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 23:00:07.823] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '출발지' 추출 후 클릭`
- `🚦 [ROADMAP 23:00:07.823] [📱앱] '출발지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 23:00:07.875] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1592.0`
- `🚦 [ROADMAP 23:00:07.934] [📱앱] [POPUP_PICKUP] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 23:00:07.934] [📱앱] [POPUP_PICKUP] 출발지페이지 text중 '전화, 위치' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 23:00:07.935] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 23:00:07.987] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`
- `🚦 [ROADMAP 23:00:08.010] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 23:00:08.013] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 23:00:08.014] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '도착지' 추출 후 클릭`
- `🚦 [ROADMAP 23:00:08.015] [📱앱] '도착지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 23:00:08.068] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1742.0`
- `🚦 [ROADMAP 23:00:08.129] [📱앱] [POPUP_DROPOFF] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 23:00:08.130] [📱앱] [POPUP_DROPOFF] 도착지페이지 text중 '전화, 위치' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 23:00:08.130] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 23:00:08.131] [📱앱] [POPUP_DROPOFF] 확정페이지 진입`
- `🚦 [ROADMAP 23:00:08.182] [📱앱] [POPUP_DROPOFF] [post /api/scrap request] ⏱️ 타이머 생존신고 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`
- `🚦 [ROADMAP 23:00:08.183] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`
- `🚦 [ROADMAP 23:00:08.221] [📱앱] [POPUP_DROPOFF] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[다마스, 라보, 오토바이], isActive=false, isSharedMode=t...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[다마스, 라보, 오토바이], isActive=false, isSharedMode=true, pickupRadiusKm=999, minFare=0, maxFare=1000000, destinationCity=, destinationRadiusKm=10, excludedKeywords=[], destinationKeywords=[], customCityFilters=[], destinationGroups={}, customFilters=[])
    ```

    </details>
- `[ROADMAP 23:00:08.228] [☁️서버] [HTTP 폴링] POST /orders/detail 데이터 수신`
- `[ROADMAP 23:00:08.229] [☁️서버] [Socket] 상하차지 송출`
- `[ROADMAP 23:00:08.229] [☁️서버] 🛡️ [카카오 API 3중 폴백] 괄호제거 ➡️ 주소검색 ➡️ 키워드검색 ➡️ 4어절 절사`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 23:00:08.230] [🖥️관제웹] [관제대시보드] 🟡 [웹 수신] order-detail-received | ID: af730879 | 경기 광주시 경안동 22-1 광주역`

    <details>
    <summary>🔽 🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.</summary>

    ```json
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    ```

    </details>
- `[ROADMAP 23:00:08.295] [☁️서버] [HTTP 폴링] POST /api/scrap (아이디 및 상태 전송 수신)`
- `[ROADMAP 23:00:08.295] [☁️서버] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`

    <details>
    <summary>🔽 🌍 [Geocoding] 상차지 변환: '경기 광주시 경안동 22-1 광주역 공영주차장' -&gt; X:127.259733647661, Y:37.4...</summary>

    ```json
    🌍 [Geocoding] 상차지 변환: '경기 광주시 경안동 22-1 광주역 공영주차장' -> X:127.259733647661, Y:37.4085969352066
       - ⚠️ 패널티 결과: +20.7km, +22분 '콜' (현위치접근: 5.6km, 11분)
    ```

    </details>
- `[ROADMAP 23:00:09.356] [☁️서버] [Socket] 경로 및 시간 정보, 수익률 전송`

    <details>
    <summary>🔽 🔎 [카카오 연산 완료] +20.7km, +22분 '콜' | Polyline 길이: 973</summary>

    ```json
    🔎 [카카오 연산 완료] +20.7km, +22분 '콜' | Polyline 길이: 973
    ⚖️ [소켓 Decision 수신] ID: af730879-c77b-4035-a49a-dd7e6acbb1e1, Action: KEEP
    ```

    </details>
- `[ROADMAP 23:00:09.360] [🖥️관제웹] [관제대시보드] 🔵 [웹 수신] order-evaluated | ID: af730879 | +20.7km, +22분 '콜'`
- `[ROADMAP 23:00:09.361] [🖥️관제웹] [관제대시보드] 추천 결과 노출, 경로보기버튼 추가 노출 후 판단 (취소 or 닫기) 대기`

    <details>
    <summary>🔽 👆 [사용자 클릭] 프론트에서 '유지 확정' 버튼 클릭 (ID: af730879-c77b-4035-a49a-dd7e6acbb1e1)</summary>

    ```json
    👆 [사용자 클릭] 프론트에서 '유지 확정' 버튼 클릭 (ID: af730879-c77b-4035-a49a-dd7e6acbb1e1)
    🌐 [post /detail response / 200] {"deviceId":"server","action":"KEEP"}
    ```

    </details>
- `🚦 [ROADMAP 23:00:18.267] [📱앱] [HTTP 폴링] 응답 /orders/detail 유지 정보 전송`
- `[ROADMAP 23:00:18.333] [🖥️관제웹] [관제대시보드] [Socket] 유지 전달`

    <details>
    <summary>🔽 🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.</summary>

    ```json
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    ```

    </details>
- `[ROADMAP 23:00:18.343] [☁️서버] [HTTP 폴링] 응답 /orders/detail 유지 정보 전송`
- `🚦 [ROADMAP 23:00:18.783] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 23:00:18.786] [📱앱] [POPUP_DROPOFF] '닫기' 클릭 후 리스트 페이지 복귀 (유지)`
- `🚦 [ROADMAP 23:00:18.838] [📱앱] 버튼 터치 완료 (가로채기 성공) X:122.0, Y:2251.0`
- `🚦 [ROADMAP 23:00:19.016] [📱앱] [LIST] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 23:00:19.019] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(1t)=❌ 도착지(0중 고덕동)=✅ 요금(0 <= 79000)=✅ 상차지/거리(999 >= 0.2km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 23:00:19.021] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(다)=✅ 도착지(0중 문발동)=✅ 요금(0 <= 101000)=✅ 상차지/거리(999 >= 0.2km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 23:00:19.021] [📱앱] [LIST] AccessibilityService로 바뀐 리스트 감지 후 text 추출`
- `🚦 [ROADMAP 23:00:19.021] [📱앱] [LIST] 리스트에서 바뀐 text 감지 후 text 추출`
- `🚦 [ROADMAP 23:00:19.022] [📱앱] [LIST] [인성 Socket] 인성콜에 선택된 콜 정보 전달 (꿀콜 클릭!)`
- `🚦 [ROADMAP 23:00:19.073] [📱앱] 버튼 터치 완료 (가로채기 성공) X:917.0, Y:664.0`
- `🚦 [ROADMAP 23:00:19.195] [📱앱] [DETAIL_PRE_CONFIRM] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 23:00:19.195] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지 진입`
- `🚦 [ROADMAP 23:00:19.198] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지 데이터(확정,적요상세,출발지,도착지) 추출`
- `🚦 [ROADMAP 23:00:19.198] [📱앱] [DETAIL_PRE_CONFIRM] 추출된 데이터로 한번더 필터링`
- `🚦 [ROADMAP 23:00:19.198] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(다)=✅ 도착지(0중 문발동)=✅ 요금(0 <= 101000)=✅ 상차지/거리(999 >= 0.2km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 23:00:19.198] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지에서 '확정' 추출 후 클릭`
- `🚦 [ROADMAP 23:00:19.198] [📱앱] [DETAIL_PRE_CONFIRM] [인성 Socket] 콜 확정 완료`
- `🚦 [ROADMAP 23:00:19.199] [📱앱] '확정' 버튼 인식 ➡️ 클릭 시도`

    <details>
    <summary>🔽 🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용...</summary>

    ```json
    🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용을 긁어서 POST /api/orders/detail 로 보내주세요."}
    ```

    </details>
- `🚦 [ROADMAP 23:00:19.204] [📱앱] [HTTP 폴링] 응답 /orders/confirm`
- `🚦 [ROADMAP 23:00:19.253] [📱앱] 버튼 터치 완료 (가로채기 성공) X:161.0, Y:2251.0`
- `[ROADMAP 23:00:19.293] [☁️서버] [HTTP 폴링] 응답 /orders/confirm`
- `[ROADMAP 23:00:19.294] [☁️서버] [HTTP 폴링] POST /orders/confirm 확정정보 정보 전송 수신`
- `[ROADMAP 23:00:19.294] [🖥️관제웹] [관제대시보드] 🟢 [웹 수신] order-evaluating | ID: fd2a13bd-c40e-49ca-b5a2-bd4d41e789c1 | 기기: 앱폰-sdk_gpho-160 | 문발동`
- `[ROADMAP 23:00:19.294] [🖥️관제웹] [관제대시보드] 확정페이지 진입 (선빵 수신으로 상세 모드 구동)`

    <details>
    <summary>🔽 🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.</summary>

    ```json
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    ```

    </details>
- `🚦 [ROADMAP 23:00:19.319] [📱앱] [DETAIL_PRE_CONFIRM] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 1)`
- `🚦 [ROADMAP 23:00:19.328] [📱앱] [DETAIL_PRE_CONFIRM] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `🚦 [ROADMAP 23:00:19.374] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 23:00:19.375] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 23:00:19.375] [📱앱] '적요상세' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 23:00:19.376] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '적요상세' 추출 후 클릭`
- `[ROADMAP 23:00:19.415] [☁️서버] [HTTP 폴링] POST /api/scrap (아이디 및 상태 전송 수신)`

    <details>
    <summary>🔽 📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "DETAIL_PRE_CONFI...</summary>

    ```json
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "DETAIL_PRE_CONFIRM", "data": [ 1개의 오더 객체... ] }
       └─ [data][0] 상세 정보:
    {
      "dropoff": "고덕동",
      "fare": 79000,
      "id": "b0224988-f884-407b-9b7c-2dff5fa790e6",
      "pickup": "경안동",
      "pickupDistance": 0.2,
      "rawText": "0.2, 44.9, @, 경안동, 고덕동, 1t, 7.9",
      "timestamp": "2026-04-18T23:00:19Z",
      "type": "NEW_ORDER",
      "vehicleType": "1t"
    }
    ```

    </details>
- `[ROADMAP 23:00:19.415] [☁️서버] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`
- `🚦 [ROADMAP 23:00:19.427] [📱앱] 버튼 터치 완료 (가로채기 성공) X:149.0, Y:1153.0`
- `🚦 [ROADMAP 23:00:19.551] [📱앱] [POPUP_MEMO] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 23:00:19.551] [📱앱] [POPUP_MEMO] 적요상세페이지에서 '젹요 내용' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 23:00:19.552] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `[ROADMAP 23:00:19.593] [☁️서버] 합짐 필터로 설정값 업데이트 (합짐 사냥용)`
- `🚦 [ROADMAP 23:00:19.604] [📱앱] 버튼 터치 완료 (가로채기 성공) X:540.0, Y:2264.0`
- `🚦 [ROADMAP 23:00:19.651] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 23:00:19.651] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 23:00:19.651] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '출발지' 추출 후 클릭`
- `🚦 [ROADMAP 23:00:19.652] [📱앱] '출발지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 23:00:19.703] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1592.0`
- `🚦 [ROADMAP 23:00:19.765] [📱앱] [POPUP_PICKUP] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 23:00:19.765] [📱앱] [POPUP_PICKUP] 출발지페이지 text중 '전화, 위치' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 23:00:19.766] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 23:00:19.817] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`
- `🚦 [ROADMAP 23:00:19.853] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 23:00:19.853] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 23:00:19.853] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '도착지' 추출 후 클릭`
- `🚦 [ROADMAP 23:00:19.854] [📱앱] '도착지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 23:00:19.905] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1742.0`
- `🚦 [ROADMAP 23:00:19.970] [📱앱] [POPUP_DROPOFF] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 23:00:19.970] [📱앱] [POPUP_DROPOFF] 도착지페이지 text중 '전화, 위치' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 23:00:19.972] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 23:00:19.972] [📱앱] [POPUP_DROPOFF] 확정페이지 진입`
- `🚦 [ROADMAP 23:00:20.025] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`
- `[ROADMAP 23:00:20.067] [☁️서버] [HTTP 폴링] POST /orders/detail 데이터 수신`
- `[ROADMAP 23:00:20.068] [☁️서버] [Socket] 상하차지 송출`
- `[ROADMAP 23:00:20.068] [☁️서버] 🛡️ [카카오 API 3중 폴백] 괄호제거 ➡️ 주소검색 ➡️ 키워드검색 ➡️ 4어절 절사`

    <details>
    <summary>🔽 🌍 [Geocoding] 상차지 변환: '경기 광주시 경안동 165-15 농협 경안지점' -&gt; X:127.25501588858974, Y:37...</summary>

    ```json
    🌍 [Geocoding] 상차지 변환: '경기 광주시 경안동 165-15 농협 경안지점' -> X:127.25501588858974, Y:37.41283198561755
       - ⚠️ 패널티 결과: +52.9km, +59분 '똥' (현위치접근: 5.6km, 11분)
    ```

    </details>
- `[ROADMAP 23:00:20.069] [🖥️관제웹] [관제대시보드] 🟡 [웹 수신] order-detail-received | ID: fd2a13bd | 경기 광주시 경안동 165-15 농협`

    <details>
    <summary>🔽 [GPS] 현위치 갱신됨: {x: 127.29436133772198, y: 37.37658530582012}</summary>

    ```json
    [GPS] 현위치 갱신됨: {x: 127.29436133772198, y: 37.37658530582012}
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    ```

    </details>
- `[ROADMAP 23:00:21.203] [☁️서버] [Socket] 경로 및 시간 정보, 수익률 전송`

    <details>
    <summary>🔽 🔎 [카카오 연산 완료] +52.9km, +59분 '똥' | Polyline 길이: 1354</summary>

    ```json
    🔎 [카카오 연산 완료] +52.9km, +59분 '똥' | Polyline 길이: 1354
    ⚖️ [소켓 Decision 수신] ID: fd2a13bd-c40e-49ca-b5a2-bd4d41e789c1, Action: KEEP
    ```

    </details>
- `[ROADMAP 23:00:21.205] [🖥️관제웹] [관제대시보드] 🔵 [웹 수신] order-evaluated | ID: fd2a13bd | +52.9km, +59분 '똥'`
- `[ROADMAP 23:00:21.206] [🖥️관제웹] [관제대시보드] 추천 결과 노출, 경로보기버튼 추가 노출 후 판단 (취소 or 닫기) 대기`

    <details>
    <summary>🔽 👆 [사용자 클릭] 프론트에서 '유지 확정' 버튼 클릭 (ID: fd2a13bd-c40e-49ca-b5a2-bd4d41e789c1)</summary>

    ```json
    👆 [사용자 클릭] 프론트에서 '유지 확정' 버튼 클릭 (ID: fd2a13bd-c40e-49ca-b5a2-bd4d41e789c1)
    🌐 [post /detail response / 200] {"deviceId":"server","action":"KEEP"}
    ```

    </details>
- `🚦 [ROADMAP 23:00:31.896] [📱앱] [HTTP 폴링] 응답 /orders/detail 유지 정보 전송`
- `[ROADMAP 23:00:31.978] [🖥️관제웹] [관제대시보드] [Socket] 유지 전달`

    <details>
    <summary>🔽 🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.</summary>

    ```json
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    ```

    </details>
- `[ROADMAP 23:00:31.979] [☁️서버] [HTTP 폴링] 응답 /orders/detail 유지 정보 전송`
- `🚦 [ROADMAP 23:00:32.405] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 23:00:32.408] [📱앱] [POPUP_DROPOFF] '닫기' 클릭 후 리스트 페이지 복귀 (유지)`
- `🚦 [ROADMAP 23:00:32.460] [📱앱] 버튼 터치 완료 (가로채기 성공) X:122.0, Y:2251.0`
- `🚦 [ROADMAP 23:00:32.638] [📱앱] [LIST] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 23:00:32.644] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(1t)=❌ 도착지(315중 강남구)=❌ 요금(0 <= 55000)=✅ 상차지/거리(999 >= 5.1km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 23:00:32.649] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(라)=✅ 도착지(315중 강서구)=❌ 요금(0 <= 67000)=✅ 상차지/거리(999 >= 5.9km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 23:00:32.652] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(라)=✅ 도착지(315중 분당구)=❌ 요금(0 <= 30000)=✅ 상차지/거리(999 >= 1.9km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 23:00:32.655] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(라)=✅ 도착지(315중 문산읍)=❌ 요금(0 <= 109000)=✅ 상차지/거리(999 >= 1.9km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 23:00:32.658] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(1t)=❌ 도착지(315중 은평구)=❌ 요금(0 <= 65000)=✅ 상차지/거리(999 >= 0.2km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 23:00:32.662] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(1t)=❌ 도착지(315중 용산구)=❌ 요금(0 <= 54000)=✅ 상차지/거리(999 >= 5.0km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 23:00:32.671] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(1t)=❌ 도착지(315중 동대문구)=❌ 요금(0 <= 50000)=✅ 상차지/거리(999 >= 0.2km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 23:00:32.974] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 7)`
- `🚦 [ROADMAP 23:00:32.993] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 7)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 23:00:33.074] [☁️서버] [HTTP 폴링] POST /api/scrap (아이디 및 상태 전송 수신)`

    <details>
    <summary>🔽 📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [...</summary>

    ```json
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 7개의 오더 객체... ] }
       └─ [data][0] 상세 정보:
    {
      "dropoff": "강남구",
      "fare": 55000,
      "id": "2a7f47f1-541c-4135-867d-c014cfbb0cc2",
      "pickup": "초월읍",
      "pickupDistance": 5.1,
      "rawText": "5.1, 29.0, @, 초월읍, 강남구, 1t, 5.5",
      "timestamp": "2026-04-18T23:00:32Z",
      "type": "NEW_ORDER",
      "vehicleType": "1t"
    }
       └─ [data][1] 상세 정보:
    {
      "dropoff": "강서구",
      "fare": 67000,
      "id": "7c81e777-7b56-4921-8b7e-38a6ae8464d4",
      "pickup": "남한산성면",
      "pickupDistance": 5.9,
      "rawText": "5.9, 37.8, 낮12시19/남한산성면, 강서구, 라, 6.7",
      "scheduleText": "낮12시19",
      "timestamp": "2026-04-18T23:00:32Z",
      "type": "NEW_ORDER",
      "vehicleType": "라"
    }
       └─ [data][2] 상세 정보:
    {
      "dropoff": "분당구",
      "fare": 30000,
      "id": "dd3be29c-3d42-4258-ab7b-3a7d7bde0591",
      "pickup": "송정동",
      "pickupDistance": 1.9,
      "rawText": "1.9, 9.2, @, 송정동, 분당구, 라, 3.0",
      "timestamp": "2026-04-18T23:00:32Z",
      "type": "NEW_ORDER",
      "vehicleType": "라"
    }
       └─ [data][3] 상세 정보:
    {
      "dropoff": "문산읍",
      "fare": 109000,
      "id": "4d1cc0f0-7b7f-4516-9d2b-400173499643",
      "pickup": "송정동",
      "pickupDistance": 1.9,
      "rawText": "1.9, 65.5, 오전11시51/송정동, 문산읍, 라, 10.9",
      "scheduleText": "오전11시51",
      "timestamp": "2026-04-18T23:00:32Z",
      "type": "NEW_ORDER",
      "vehicleType": "라"
    }
       └─ [data][4] 상세 정보:
    {
      "dropoff": "은평구",
      "fare": 65000,
      "id": "18e0ecfa-8952-41c4-901b-2bf7888c1d54",
      "pickup": "경안동",
      "pickupDistance": 0.2,
      "rawText": "0.2, 36.7, 급송/경안동, 은평구, 1t, 6.5",
      "scheduleText": "급송",
      "timestamp": "2026-04-18T23:00:32Z",
      "type": "NEW_ORDER",
      "vehicleType": "1t"
    }
       └─ [data][5] 상세 정보:
    {
      "dropoff": "용산구",
      "fare": 54000,
      "id": "2db54be0-9c0b-4c9a-9bd0-244bf965d53c",
      "pickup": "실촌읍",
      "pickupDistance": 5,
      "rawText": "5.0, 28.9, 실촌읍, 용산구, 1t, 5.4",
      "timestamp": "2026-04-18T23:00:32Z",
      "type": "NEW_ORDER",
      "vehicleType": "1t"
    }
       └─ [data][6] 상세 정보:
    {
      "dropoff": "동대문구",
      "fare": 50000,
      "id": "93074c0f-3c41-44d8-86f5-0b561a839eaa",
      "pickup": "경안동",
      "pickupDistance": 0.2,
      "rawText": "0.2, 24.0, 경안동, 동대문구, 1t, 5.0",
      "timestamp": "2026-04-18T23:00:32Z",
      "type": "NEW_ORDER",
      "vehicleType": "1t"
    }
    ```

    </details>
- `[ROADMAP 23:00:33.075] [☁️서버] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`
- `[ROADMAP 23:00:33.316] [☁️서버] 합짐 필터로 설정값 업데이트 (합짐 사냥용)`
- `🚦 [ROADMAP 23:00:35.372] [📱앱] [LIST] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 23:00:35.375] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(1t)=❌ 도착지(317중 일산동구)=✅ 요금(0 <= 81000)=✅ 상차지/거리(999 >= 0.2km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 23:00:35.676] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 1)`
- `🚦 [ROADMAP 23:00:35.702] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 23:00:35.781] [☁️서버] [HTTP 폴링] POST /api/scrap (아이디 및 상태 전송 수신)`

    <details>
    <summary>🔽 📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [...</summary>

    ```json
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
       └─ [data][0] 상세 정보:
    {
      "dropoff": "일산동구",
      "fare": 81000,
      "id": "7d036dfc-f812-4548-a94b-b9b789c45eaf",
      "pickup": "경안동",
      "pickupDistance": 0.2,
      "rawText": "0.2, 47.6, 경안동, 일산동구, 1t, 8.1",
      "timestamp": "2026-04-18T23:00:35Z",
      "type": "NEW_ORDER",
      "vehicleType": "1t"
    }
    ```

    </details>
- `[ROADMAP 23:00:35.782] [☁️서버] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`
- `🚦 [ROADMAP 23:00:36.998] [📱앱] [LIST] 📡 화면 변경 감지 | 모드: AUTO`
