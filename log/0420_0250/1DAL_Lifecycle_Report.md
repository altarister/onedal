# 🗺️ 1DAL 풀 스택 라이프사이클 로그 매핑 리포트 (0420_0250 Full Data)

---


### 🟢 [STEP 1] 관제탑 서버 기동 및 필터 동기화
*(시작 기준 시간: 02:47:55.624)*

- `[ROADMAP 02:47:55.624] [☁️서버] 서버 기동 및 디폴트 필터 셋업 (대기 모드)`
- `[ROADMAP 02:47:58.521] [🖥️관제웹] 1DAL 웹(관제웹) 로그인됨`
- `[ROADMAP 02:47:58.522] [🖥️관제웹] 1DAL 웹(관제웹) 로그인됨`

    <details>
    <summary>🔽 [GPS] 현위치 갱신됨: {x: 127.29441776104179, y: 37.37668247218943}</summary>

    ```json
    [GPS] 현위치 갱신됨: {x: 127.29441776104179, y: 37.37668247218943}
    [GPS] 현위치 갱신됨: {x: 127.29441776104179, y: 37.37668247218943}
    ```

    </details>
- `[ROADMAP 02:48:01.747] [☁️서버] [Socket] 소켓 연결 및 디폴트 필터 전송 (User: 66176c7b-1755-444c-9b65-7ca056e3c303)`
- `🚦 [ROADMAP 02:48:10.956] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap request] ⏱️ 타이머 생존신고 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`
- `🚦 [ROADMAP 02:48:11.025] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[1t], isActive=false, isSharedMode=false, picku...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[1t], isActive=false, isSharedMode=false, pickupRadiusKm=999, minFare=0, maxFare=1000000, destinationCity=, destinationRadiusKm=10, excludedKeywords=[], destinationKeywords=[], customCityFilters=[], destinationGroups={}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 02:48:13.577] [☁️서버] [HTTP 폴링] POST /api/scrap (User: 66176c7b-1755-444c-9b65-7ca056e3c303)`
- `🚦 [ROADMAP 02:48:20.962] [📱앱] [LIST] [0초] 인성앱 실행 후 1DAL앱 접근성 권한 on`

    <details>
    <summary>🔽 🎯 [인성콜] 키워드 사전 다운로드 성공: {"appName":"인성콜","uiNoiseWords":["출발지","도착지","차종","요금",...</summary>

    ```json
    🎯 [인성콜] 키워드 사전 다운로드 성공: {"appName":"인성콜","uiNoiseWords":["출발지","도착지","차종","요금","설정","닫기","콜상세"],"confirmButtonText":"확정","cancelButtonText":"취소","pickupButtonText":"출발지","dropoffButtonText":"도착지"}
```

    </details>

### 🟢 [STEP 2] 첫짐 1차 선점 (단독콜 사냥)
*(시작 기준 시간: 02:48:21.161)*

- `🚦 [ROADMAP 02:48:21.161] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`
- `🚦 [ROADMAP 02:48:21.196] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[1t], isActive=false, isSharedMode=false, picku...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[1t], isActive=false, isSharedMode=false, pickupRadiusKm=999, minFare=0, maxFare=1000000, destinationCity=, destinationRadiusKm=10, excludedKeywords=[], destinationKeywords=[], customCityFilters=[], destinationGroups={}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `🚦 [ROADMAP 02:48:22.126] [📱앱] [UNKNOWN] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:48:22.333] [📱앱] [UNKNOWN] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`
- `🚦 [ROADMAP 02:48:22.339] [📱앱] [UNKNOWN] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[1t], isActive=false, isSharedMode=false, picku...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[1t], isActive=false, isSharedMode=false, pickupRadiusKm=999, minFare=0, maxFare=1000000, destinationCity=, destinationRadiusKm=10, excludedKeywords=[], destinationKeywords=[], customCityFilters=[], destinationGroups={}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 02:48:23.755] [☁️서버] [HTTP 폴링] POST /api/scrap (User: 66176c7b-1755-444c-9b65-7ca056e3c303)`
- `🚦 [ROADMAP 02:48:24.337] [📱앱] [UNKNOWN] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:48:24.446] [📱앱] [UNKNOWN] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:48:24.544] [📱앱] [UNKNOWN] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:48:24.644] [📱앱] [UNKNOWN] 📡 화면 변경 감지 | 모드: AUTO`
- `[ROADMAP 02:48:24.902] [☁️서버] [HTTP 폴링] POST /api/scrap (User: 66176c7b-1755-444c-9b65-7ca056e3c303)`
- `🚦 [ROADMAP 02:48:26.244] [📱앱] [UNKNOWN] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:48:27.296] [📱앱] [UNKNOWN] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:48:27.381] [📱앱] [UNKNOWN] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:48:29.562] [📱앱] [UNKNOWN] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:48:29.814] [📱앱] [LIST] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:48:29.843] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(라)=❌ 도착지(0중 부산진구)=✅ 요금(0 <= 450000)=✅ 상차지/거리(999 >= 5.1km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 02:48:29.845] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(오)=❌ 도착지(0중 중랑구)=✅ 요금(0 <= 53000)=✅ 상차지/거리(999 >= 0.2km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 02:48:29.846] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(다)=❌ 도착지(0중 광명동)=✅ 요금(0 <= 77000)=✅ 상차지/거리(999 >= 9.0km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 02:48:29.849] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(오)=❌ 도착지(0중 동안구)=✅ 요금(0 <= 52000)=✅ 상차지/거리(999 >= 13.6km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 02:48:29.854] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(다)=❌ 도착지(0중 금촌동)=✅ 요금(0 <= 99000)=✅ 상차지/거리(999 >= 0.2km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 02:48:30.160] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 5)`
- `🚦 [ROADMAP 02:48:30.187] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 5)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[1t], isActive=false, isSharedMode=false, picku...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[1t], isActive=false, isSharedMode=false, pickupRadiusKm=999, minFare=0, maxFare=1000000, destinationCity=, destinationRadiusKm=10, excludedKeywords=[], destinationKeywords=[], customCityFilters=[], destinationGroups={}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 02:48:32.746] [☁️서버] [HTTP 폴링] POST /api/scrap (User: 66176c7b-1755-444c-9b65-7ca056e3c303)`
- `🚦 [ROADMAP 02:48:35.241] [📱앱] [LIST] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:48:35.247] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(1t)=✅ 도착지(0중 초월읍)=✅ 요금(0 <= 30000)=✅ 상차지/거리(999 >= 0.2km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 02:48:35.248] [📱앱] [LIST] AccessibilityService로 바뀐 리스트 감지 후 text 추출`
- `🚦 [ROADMAP 02:48:35.248] [📱앱] [LIST] 리스트에서 바뀐 text 감지 후 text 추출`
- `🚦 [ROADMAP 02:48:35.253] [📱앱] [LIST] [인성 Socket] 인성콜에 선택된 콜 정보 전달 (꿀콜 클릭!)`
- `🚦 [ROADMAP 02:48:35.309] [📱앱] 버튼 터치 완료 (가로채기 성공) X:917.0, Y:568.0`
- `🚦 [ROADMAP 02:48:35.445] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`
- `🚦 [ROADMAP 02:48:35.457] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[1t], isActive=false, isSharedMode=false, picku...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[1t], isActive=false, isSharedMode=false, pickupRadiusKm=999, minFare=0, maxFare=1000000, destinationCity=, destinationRadiusKm=10, excludedKeywords=[], destinationKeywords=[], customCityFilters=[], destinationGroups={}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `🚦 [ROADMAP 02:48:35.509] [📱앱] [DETAIL_PRE_CONFIRM] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:48:35.510] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지 진입`
- `🚦 [ROADMAP 02:48:35.538] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지 데이터(확정,적요상세,출발지,도착지) 추출`
- `🚦 [ROADMAP 02:48:35.539] [📱앱] [DETAIL_PRE_CONFIRM] 추출된 데이터로 한번더 필터링`
- `🚦 [ROADMAP 02:48:35.541] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(1t)=✅ 도착지(0중 초월읍)=✅ 요금(0 <= 30000)=✅ 상차지/거리(999 >= 0.2km)=✅ 블랙()=✅`

### 🟡 [STEP 3] 1차 확정 통신
*(시작 기준 시간: 02:48:35.547)*

- `🚦 [ROADMAP 02:48:35.547] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지에서 '확정' 추출 후 클릭`
- `🚦 [ROADMAP 02:48:35.550] [📱앱] [DETAIL_PRE_CONFIRM] [인성 Socket] 콜 확정 완료`
- `🚦 [ROADMAP 02:48:35.556] [📱앱] '확정' 버튼 인식 ➡️ 클릭 시도`

    <details>
    <summary>🔽 🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용...</summary>

    ```json
    🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용을 긁어서 POST /api/orders/detail 로 보내주세요."}
    ```

    </details>
- `🚦 [ROADMAP 02:48:35.794] [📱앱] [HTTP 폴링] 응답 /orders/confirm`
- `🚦 [ROADMAP 02:48:35.850] [📱앱] [DETAIL_PRE_CONFIRM] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`
- `🚦 [ROADMAP 02:48:35.851] [📱앱] 버튼 터치 완료 (가로채기 성공) X:161.0, Y:2251.0`
- `🚦 [ROADMAP 02:48:35.860] [📱앱] [DETAIL_PRE_CONFIRM] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[1t], isActive=false, isSharedMode=false, picku...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[1t], isActive=false, isSharedMode=false, pickupRadiusKm=999, minFare=0, maxFare=1000000, destinationCity=, destinationRadiusKm=10, excludedKeywords=[], destinationKeywords=[], customCityFilters=[], destinationGroups={}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `🚦 [ROADMAP 02:48:36.016] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 모드: AUTO`

### 🟢 [STEP 4] 2차 상세 수집: 팝업 자동 서핑
*(시작 기준 시간: 02:48:36.017)*

- `🚦 [ROADMAP 02:48:36.017] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 02:48:36.018] [📱앱] '적요상세' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:48:36.019] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '적요상세' 추출 후 클릭`
- `🚦 [ROADMAP 02:48:36.070] [📱앱] 버튼 터치 완료 (가로채기 성공) X:149.0, Y:1153.0`
- `🚦 [ROADMAP 02:48:36.186] [📱앱] [POPUP_MEMO] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:48:36.187] [📱앱] [POPUP_MEMO] 적요상세페이지에서 '젹요 내용' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 02:48:36.189] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:48:36.254] [📱앱] 버튼 터치 완료 (가로채기 성공) X:540.0, Y:2264.0`
- `🚦 [ROADMAP 02:48:36.301] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:48:36.302] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 02:48:36.303] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '출발지' 추출 후 클릭`
- `🚦 [ROADMAP 02:48:36.303] [📱앱] '출발지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:48:36.359] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1592.0`
- `🚦 [ROADMAP 02:48:36.518] [📱앱] [POPUP_PICKUP] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:48:36.519] [📱앱] [POPUP_PICKUP] 출발지페이지 text중 '전화, 위치' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 02:48:36.520] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:48:36.572] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`
- `🚦 [ROADMAP 02:48:36.704] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:48:36.705] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 02:48:36.705] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '도착지' 추출 후 클릭`
- `🚦 [ROADMAP 02:48:36.706] [📱앱] '도착지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:48:36.762] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1742.0`
- `🚦 [ROADMAP 02:48:36.916] [📱앱] [POPUP_DROPOFF] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:48:36.917] [📱앱] [POPUP_DROPOFF] 도착지페이지 text중 '전화, 위치' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 02:48:36.918] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:48:36.921] [📱앱] [POPUP_DROPOFF] 확정페이지 진입`
- `🚦 [ROADMAP 02:48:36.981] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`
- `🚦 [ROADMAP 02:48:37.138] [📱앱] [POPUP_DROPOFF] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`
- `🚦 [ROADMAP 02:48:37.177] [📱앱] [POPUP_DROPOFF] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[1t], isActive=false, isSharedMode=false, picku...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[1t], isActive=false, isSharedMode=false, pickupRadiusKm=999, minFare=0, maxFare=1000000, destinationCity=, destinationRadiusKm=10, excludedKeywords=[], destinationKeywords=[], customCityFilters=[], destinationGroups={}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `🚦 [ROADMAP 02:48:37.396] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`
- `🚦 [ROADMAP 02:48:37.402] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
                                                                                                        FilterConfig(allowedVehicleTypes=[1t], isActive=false, isSharedMode=false, pickupRadiusKm=999, minFare=0, maxFare=1000000, destinationCity=, destinationRadiusKm=10, excludedKeywords=[], destinationKeywords=[], customCityFilters=[], destinationGroups={}, customFilters=[])
    ```

    </details>
- `[ROADMAP 02:48:38.018] [☁️서버] [HTTP 폴링] POST /api/scrap (User: 66176c7b-1755-444c-9b65-7ca056e3c303)`
- `[ROADMAP 02:48:38.168] [☁️서버] [HTTP 폴링] 응답 /orders/confirm`
- `[ROADMAP 02:48:38.172] [☁️서버] [HTTP 폴링] POST /orders/confirm 확정정보 정보 전송 수신`
- `[ROADMAP 02:48:38.173] [🖥️관제웹] [관제대시보드] 🟢 [웹 수신] order-evaluating | ID: 721c7da7-e8fb-45a0-9b60-57b0d8242b41 | 기기: 앱폰-sdk_gpho-160 | 초월읍`
- `[ROADMAP 02:48:38.173] [🖥️관제웹] [관제대시보드] 확정페이지 진입 (선빵 수신으로 상세 모드 구동)`
- `[ROADMAP 02:48:38.421] [☁️서버] [HTTP 폴링] POST /api/scrap (User: 66176c7b-1755-444c-9b65-7ca056e3c303)`
- `[ROADMAP 02:48:39.535] [☁️서버] [HTTP 폴링] POST /orders/detail 데이터 수신`

### 🟢 [STEP 5] 카카오 연산 3중 폴백 & 자동 회랑 전개
*(시작 기준 시간: 02:48:39.546)*

- `[ROADMAP 02:48:39.546] [☁️서버] [Socket] 상하차지 송출`
- `[ROADMAP 02:48:39.548] [🖥️관제웹] [관제대시보드] 🟡 [웹 수신] order-detail-received | ID: 721c7da7 | 경기 광주시 경안동 167-1 경안천`
- `[ROADMAP 02:48:39.554] [☁️서버] 🛡️ [카카오 API 3중 폴백] 괄호제거 ➡️ 주소검색 ➡️ 키워드검색 ➡️ 4어절 절사`
- `[ROADMAP 02:48:39.737] [☁️서버] [HTTP 폴링] POST /api/scrap (User: 66176c7b-1755-444c-9b65-7ca056e3c303)`

    <details>
    <summary>🔽 🌍 [Geocoding] 상차지 변환: '경기 광주시 경안동 167-1 경안천 체육공원' -&gt; X:127.252889947198, Y:37.4...</summary>

    ```json
    🌍 [Geocoding] 상차지 변환: '경기 광주시 경안동 167-1 경안천 체육공원' -> X:127.252889947198, Y:37.4100225848715
    ```

    </details>
- `[ROADMAP 02:48:39.848] [☁️서버] [Socket] 경로 및 시간 정보, 수익률 전송`

    <details>
    <summary>🔽 🔎 [카카오 연산 완료] 카카오 연산 실패 | Polyline 길이: 0</summary>

    ```json
    🔎 [카카오 연산 완료] 카카오 연산 실패 | Polyline 길이: 0
    ```

    </details>
- `[ROADMAP 02:48:39.851] [🖥️관제웹] [관제대시보드] 🔵 [웹 수신] order-evaluated | ID: 721c7da7 | 카카오 연산 실패`
- `[ROADMAP 02:48:39.852] [🖥️관제웹] [관제대시보드] 추천 결과 노출, 경로보기버튼 추가 노출 후 판단 (취소 or 닫기) 대기`
- `[ROADMAP 02:48:39.965] [☁️서버] [HTTP 폴링] POST /api/scrap (User: 66176c7b-1755-444c-9b65-7ca056e3c303)`

    <details>
    <summary>🔽 🌐 [post /detail response / 200] {"deviceId":"server","action":"CANCEL"}</summary>

    ```json
    🌐 [post /detail response / 200] {"deviceId":"server","action":"CANCEL"}
    ```

    </details>
- `🚦 [ROADMAP 02:48:47.461] [📱앱] [HTTP 폴링] 응답 /orders/detail 취소 정보 전송`
- `🚦 [ROADMAP 02:48:47.677] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`
- `🚦 [ROADMAP 02:48:47.695] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[], isActive=true, isSharedMode=false, pickupRa...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[], isActive=true, isSharedMode=false, pickupRadiusKm=999, minFare=0, maxFare=1000000, destinationCity=, destinationRadiusKm=10, excludedKeywords=[], destinationKeywords=[], customCityFilters=[], destinationGroups={}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `🚦 [ROADMAP 02:48:47.979] [📱앱] '취소' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:48:47.994] [📱앱] [DETAIL_CONFIRMED] '취소' 클릭 후 인성 Socket 취소 지시`
- `🚦 [ROADMAP 02:48:48.068] [📱앱] 버튼 터치 완료 (가로채기 성공) X:950.0, Y:478.0`
- `🚦 [ROADMAP 02:48:48.234] [📱앱] [LIST] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:48:48.244] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(오)=✅ 도착지(0중 남동구)=✅ 요금(0 <= 80000)=✅ 상차지/거리(999 >= 0.2km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 02:48:48.245] [📱앱] [LIST] AccessibilityService로 바뀐 리스트 감지 후 text 추출`
- `🚦 [ROADMAP 02:48:48.245] [📱앱] [LIST] 리스트에서 바뀐 text 감지 후 text 추출`
- `🚦 [ROADMAP 02:48:48.246] [📱앱] [LIST] [인성 Socket] 인성콜에 선택된 콜 정보 전달 (꿀콜 클릭!)`
- `🚦 [ROADMAP 02:48:48.298] [📱앱] 버튼 터치 완료 (가로채기 성공) X:917.0, Y:568.0`
- `🚦 [ROADMAP 02:48:48.499] [📱앱] [DETAIL_PRE_CONFIRM] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:48:48.500] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지 진입`
- `🚦 [ROADMAP 02:48:48.520] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지 데이터(확정,적요상세,출발지,도착지) 추출`
- `🚦 [ROADMAP 02:48:48.520] [📱앱] [DETAIL_PRE_CONFIRM] 추출된 데이터로 한번더 필터링`
- `🚦 [ROADMAP 02:48:48.521] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(오)=✅ 도착지(0중 남동구)=✅ 요금(0 <= 80000)=✅ 상차지/거리(999 >= 0.2km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 02:48:48.521] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지에서 '확정' 추출 후 클릭`
- `🚦 [ROADMAP 02:48:48.522] [📱앱] [DETAIL_PRE_CONFIRM] [인성 Socket] 콜 확정 완료`
- `🚦 [ROADMAP 02:48:48.522] [📱앱] '확정' 버튼 인식 ➡️ 클릭 시도`

    <details>
    <summary>🔽 🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용...</summary>

    ```json
    🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용을 긁어서 POST /api/orders/detail 로 보내주세요."}
    ```

    </details>
- `🚦 [ROADMAP 02:48:48.538] [📱앱] [HTTP 폴링] 응답 /orders/confirm`
- `🚦 [ROADMAP 02:48:48.576] [📱앱] 버튼 터치 완료 (가로채기 성공) X:161.0, Y:2251.0`
- `🚦 [ROADMAP 02:48:48.744] [📱앱] [DETAIL_PRE_CONFIRM] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`
- `🚦 [ROADMAP 02:48:48.766] [📱앱] [DETAIL_PRE_CONFIRM] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[], isActive=false, isSharedMode=false, pickupR...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[], isActive=false, isSharedMode=false, pickupRadiusKm=999, minFare=0, maxFare=1000000, destinationCity=, destinationRadiusKm=10, excludedKeywords=[], destinationKeywords=[], customCityFilters=[], destinationGroups={}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `🚦 [ROADMAP 02:48:48.831] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:48:48.831] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 02:48:48.833] [📱앱] '적요상세' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:48:48.834] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '적요상세' 추출 후 클릭`
- `🚦 [ROADMAP 02:48:48.887] [📱앱] 버튼 터치 완료 (가로채기 성공) X:149.0, Y:1153.0`
- `🚦 [ROADMAP 02:48:49.138] [📱앱] [POPUP_MEMO] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:48:49.139] [📱앱] [POPUP_MEMO] 적요상세페이지에서 '젹요 내용' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 02:48:49.140] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:48:49.308] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:48:49.309] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 02:48:49.309] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '출발지' 추출 후 클릭`
- `🚦 [ROADMAP 02:48:49.309] [📱앱] '출발지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:48:49.314] [📱앱] 버튼 터치 완료 (가로채기 성공) X:540.0, Y:2264.0`
- `🚦 [ROADMAP 02:48:49.362] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1592.0`
- `🚦 [ROADMAP 02:48:49.512] [📱앱] [POPUP_PICKUP] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:48:49.513] [📱앱] [POPUP_PICKUP] 출발지페이지 text중 '전화, 위치' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 02:48:49.513] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:48:49.565] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`
- `🚦 [ROADMAP 02:48:49.695] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:48:49.695] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 02:48:49.696] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '도착지' 추출 후 클릭`
- `🚦 [ROADMAP 02:48:49.696] [📱앱] '도착지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:48:49.747] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1742.0`
- `🚦 [ROADMAP 02:48:49.877] [📱앱] [POPUP_DROPOFF] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:48:49.878] [📱앱] [POPUP_DROPOFF] 도착지페이지 text중 '전화, 위치' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 02:48:49.879] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:48:49.879] [📱앱] [POPUP_DROPOFF] 확정페이지 진입`

### 🟢 [STEP 6] 관제탑 결재 (취소 vs 유지)
*(시작 기준 시간: 02:48:49.940)*

- `[ROADMAP 02:48:49.940] [🖥️관제웹] [관제대시보드] [Socket] 취소 전달`
- `[ROADMAP 02:48:49.950] [☁️서버] [HTTP 폴링] 응답 /orders/detail 취소 정보 전송`
- `[ROADMAP 02:48:49.952] [☁️서버] 첫콜 필터로 설정값 업데이트`
- `🚦 [ROADMAP 02:48:49.954] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`
- `[ROADMAP 02:48:49.975] [🖥️관제웹] [관제대시보드] 🔴 [웹 수신] order-canceled | ID: 721c7da7`
- `🚦 [ROADMAP 02:48:50.082] [📱앱] [POPUP_DROPOFF] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`
- `🚦 [ROADMAP 02:48:50.091] [📱앱] [POPUP_DROPOFF] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[], isActive=false, isSharedMode=false, pickupR...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[], isActive=false, isSharedMode=false, pickupRadiusKm=999, minFare=0, maxFare=1000000, destinationCity=, destinationRadiusKm=10, excludedKeywords=[], destinationKeywords=[], customCityFilters=[], destinationGroups={}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 02:48:50.256] [☁️서버] [HTTP 폴링] POST /api/scrap (User: 66176c7b-1755-444c-9b65-7ca056e3c303)`
- `🚦 [ROADMAP 02:48:50.315] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`
- `🚦 [ROADMAP 02:48:50.321] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[], isActive=false, isSharedMode=false, pickupR...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[], isActive=false, isSharedMode=false, pickupRadiusKm=999, minFare=0, maxFare=1000000, destinationCity=, destinationRadiusKm=10, excludedKeywords=[], destinationKeywords=[], customCityFilters=[], destinationGroups={}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 02:48:51.090] [☁️서버] [HTTP 폴링] 응답 /orders/confirm`
- `[ROADMAP 02:48:51.090] [☁️서버] [HTTP 폴링] POST /orders/confirm 확정정보 정보 전송 수신`
- `[ROADMAP 02:48:51.090] [☁️서버] 대기 필터로 설정값 업데이트 (isActive: false)`
- `[ROADMAP 02:48:51.090] [☁️서버] [Socket] 확정정보 정보 + 대기 필터 정보 전송`
- `[ROADMAP 02:48:51.090] [☁️서버] 관제탑 무응답 대비 30초 데스밸리 타이머 기동 (안전망 강화)`
- `[ROADMAP 02:48:51.092] [🖥️관제웹] [관제대시보드] 🟢 [웹 수신] order-evaluating | ID: a491b43e-b219-4f48-84e5-239ee42c8555 | 기기: 앱폰-sdk_gpho-160 | 남동구`
- `[ROADMAP 02:48:51.093] [🖥️관제웹] [관제대시보드] 확정페이지 진입 (선빵 수신으로 상세 모드 구동)`
- `[ROADMAP 02:48:51.327] [☁️서버] [HTTP 폴링] POST /api/scrap (User: 66176c7b-1755-444c-9b65-7ca056e3c303)`
- `[ROADMAP 02:48:52.458] [☁️서버] [HTTP 폴링] POST /orders/detail 데이터 수신`
- `[ROADMAP 02:48:52.460] [☁️서버] [Socket] 상하차지 송출`
- `[ROADMAP 02:48:52.460] [☁️서버] 🛡️ [카카오 API 3중 폴백] 괄호제거 ➡️ 주소검색 ➡️ 키워드검색 ➡️ 4어절 절사`

    <details>
    <summary>🔽 🌍 [Geocoding] 상차지 변환: '경기 광주시 경안동 167-1 경안천 체육공원' -&gt; X:127.252889947198, Y:37.4...</summary>

    ```json
    🌍 [Geocoding] 상차지 변환: '경기 광주시 경안동 167-1 경안천 체육공원' -> X:127.252889947198, Y:37.4100225848715
    ```

    </details>
- `[ROADMAP 02:48:52.463] [🖥️관제웹] [관제대시보드] 🟡 [웹 수신] order-detail-received | ID: a491b43e | 경기 광주시 경안동 167-1 경안천`

    <details>
    <summary>🔽 🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.</summary>

    ```json
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    ```

    </details>
- `[ROADMAP 02:48:52.653] [☁️서버] [HTTP 폴링] POST /api/scrap (User: 66176c7b-1755-444c-9b65-7ca056e3c303)`
- `[ROADMAP 02:48:52.884] [☁️서버] [HTTP 폴링] POST /api/scrap (User: 66176c7b-1755-444c-9b65-7ca056e3c303)`
- `[ROADMAP 02:48:53.109] [☁️서버] [Socket] 경로 및 시간 정보, 수익률 전송`

    <details>
    <summary>🔽 🔎 [카카오 연산 완료] 단독 64.6km, 61분 '콜' | Polyline 길이: 707</summary>

    ```json
    🔎 [카카오 연산 완료] 단독 64.6km, 61분 '콜' | Polyline 길이: 707
    ⚖️ [소켓 Decision] User: 66176c7b-1755-444c-9b65-7ca056e3c303, ID: a491b43e-b219-4f48-84e5-239ee42c8555, Action: KEEP
    ```

    </details>
- `[ROADMAP 02:48:53.110] [🖥️관제웹] [관제대시보드] 🔵 [웹 수신] order-evaluated | ID: a491b43e | 단독 64.6km, 61분 '콜'`
- `[ROADMAP 02:48:53.111] [🖥️관제웹] [관제대시보드] 추천 결과 노출, 경로보기버튼 추가 노출 후 판단 (취소 or 닫기) 대기`

    <details>
    <summary>🔽 👆 [사용자 클릭] 프론트에서 '유지 확정' 버튼 클릭 (ID: a491b43e-b219-4f48-84e5-239ee42c8555)</summary>

    ```json
    👆 [사용자 클릭] 프론트에서 '유지 확정' 버튼 클릭 (ID: a491b43e-b219-4f48-84e5-239ee42c8555)
    🌐 [post /detail response / 200] {"deviceId":"server","action":"KEEP"}
    ```

    </details>
- `🚦 [ROADMAP 02:48:56.890] [📱앱] [HTTP 폴링] 응답 /orders/detail 유지 정보 전송`
- `🚦 [ROADMAP 02:48:57.096] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`
- `🚦 [ROADMAP 02:48:57.107] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[다마스, 라보, 오토바이], isActive=true, isSharedMode=tr...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[다마스, 라보, 오토바이], isActive=true, isSharedMode=true, pickupRadiusKm=999, minFare=0, maxFare=1000000, destinationCity=, destinationRadiusKm=10, excludedKeywords=[], destinationKeywords=[], customCityFilters=[], destinationGroups={}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `🚦 [ROADMAP 02:48:57.401] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:48:57.403] [📱앱] [DETAIL_CONFIRMED] '닫기' 클릭 후 리스트 페이지 복귀 (유지)`
- `🚦 [ROADMAP 02:48:57.455] [📱앱] 버튼 터치 완료 (가로채기 성공) X:122.0, Y:2251.0`
- `🚦 [ROADMAP 02:48:57.605] [📱앱] [LIST] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:48:57.620] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(다)=✅ 도착지(0중 경안동)=✅ 요금(0 <= 30000)=✅ 상차지/거리(999 >= 0.2km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 02:48:57.621] [📱앱] [LIST] AccessibilityService로 바뀐 리스트 감지 후 text 추출`
- `🚦 [ROADMAP 02:48:57.621] [📱앱] [LIST] 리스트에서 바뀐 text 감지 후 text 추출`
- `🚦 [ROADMAP 02:48:57.622] [📱앱] [LIST] [인성 Socket] 인성콜에 선택된 콜 정보 전달 (꿀콜 클릭!)`
- `🚦 [ROADMAP 02:48:57.678] [📱앱] 버튼 터치 완료 (가로채기 성공) X:917.0, Y:568.0`
- `🚦 [ROADMAP 02:48:57.828] [📱앱] [DETAIL_PRE_CONFIRM] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:48:57.828] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지 진입`
- `🚦 [ROADMAP 02:48:57.833] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지 데이터(확정,적요상세,출발지,도착지) 추출`
- `🚦 [ROADMAP 02:48:57.833] [📱앱] [DETAIL_PRE_CONFIRM] 추출된 데이터로 한번더 필터링`
- `🚦 [ROADMAP 02:48:57.833] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(다)=✅ 도착지(0중 경안동)=✅ 요금(0 <= 30000)=✅ 상차지/거리(999 >= 0.2km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 02:48:57.834] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지에서 '확정' 추출 후 클릭`
- `🚦 [ROADMAP 02:48:57.834] [📱앱] [DETAIL_PRE_CONFIRM] [인성 Socket] 콜 확정 완료`
- `🚦 [ROADMAP 02:48:57.835] [📱앱] '확정' 버튼 인식 ➡️ 클릭 시도`

    <details>
    <summary>🔽 🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용...</summary>

    ```json
    🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용을 긁어서 POST /api/orders/detail 로 보내주세요."}
    ```

    </details>
- `🚦 [ROADMAP 02:48:57.840] [📱앱] [HTTP 폴링] 응답 /orders/confirm`
- `🚦 [ROADMAP 02:48:57.888] [📱앱] 버튼 터치 완료 (가로채기 성공) X:161.0, Y:2251.0`
- `🚦 [ROADMAP 02:48:58.023] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:48:58.024] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 02:48:58.024] [📱앱] '적요상세' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:48:58.025] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '적요상세' 추출 후 클릭`
- `🚦 [ROADMAP 02:48:58.086] [📱앱] 버튼 터치 완료 (가로채기 성공) X:149.0, Y:1153.0`
- `🚦 [ROADMAP 02:48:58.197] [📱앱] [POPUP_MEMO] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:48:58.198] [📱앱] [POPUP_MEMO] 적요상세페이지에서 '젹요 내용' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 02:48:58.204] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:48:58.262] [📱앱] 버튼 터치 완료 (가로채기 성공) X:540.0, Y:2264.0`
- `🚦 [ROADMAP 02:48:58.300] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:48:58.301] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 02:48:58.301] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '출발지' 추출 후 클릭`
- `🚦 [ROADMAP 02:48:58.304] [📱앱] '출발지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:48:58.357] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1592.0`
- `🚦 [ROADMAP 02:48:58.463] [📱앱] [POPUP_PICKUP] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:48:58.464] [📱앱] [POPUP_PICKUP] 출발지페이지 text중 '전화, 위치' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 02:48:58.464] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:48:58.524] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`
- `🚦 [ROADMAP 02:48:58.641] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:48:58.641] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 02:48:58.641] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '도착지' 추출 후 클릭`
- `🚦 [ROADMAP 02:48:58.642] [📱앱] '도착지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:48:58.693] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1742.0`
- `🚦 [ROADMAP 02:48:58.822] [📱앱] [POPUP_DROPOFF] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:48:58.823] [📱앱] [POPUP_DROPOFF] 도착지페이지 text중 '전화, 위치' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 02:48:58.823] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:48:58.824] [📱앱] [POPUP_DROPOFF] 확정페이지 진입`
- `🚦 [ROADMAP 02:48:58.875] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`
- `🚦 [ROADMAP 02:48:59.202] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`
- `🚦 [ROADMAP 02:48:59.218] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[다마스, 라보, 오토바이], isActive=false, isSharedMode=t...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[다마스, 라보, 오토바이], isActive=false, isSharedMode=true, pickupRadiusKm=999, minFare=0, maxFare=1000000, destinationCity=, destinationRadiusKm=10, excludedKeywords=[], destinationKeywords=[], customCityFilters=[], destinationGroups={}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 02:48:59.448] [🖥️관제웹] [관제대시보드] [Socket] 유지 전달`
- `[ROADMAP 02:48:59.450] [☁️서버] [HTTP 폴링] 응답 /orders/detail 유지 정보 전송`
- `[ROADMAP 02:48:59.451] [☁️서버] 합짐 필터로 설정값 업데이트 (합짐 사냥용)`
- `[ROADMAP 02:48:59.669] [☁️서버] [HTTP 폴링] POST /api/scrap (User: 66176c7b-1755-444c-9b65-7ca056e3c303)`
- `[ROADMAP 02:49:00.403] [☁️서버] [HTTP 폴링] 응답 /orders/confirm`

### 🚀 [STEP 7] "합짐" 2차 선점 (합짐 사냥 돌입 & 우회 동선 연산)
*(시작 기준 시간: 02:49:00.404)*

- `[ROADMAP 02:49:00.404] [☁️서버] [HTTP 폴링] POST /orders/confirm 확정정보 정보 전송 수신`
- `[ROADMAP 02:49:00.404] [☁️서버] 대기 필터로 설정값 업데이트 (isActive: false)`
- `[ROADMAP 02:49:00.404] [☁️서버] [Socket] 확정정보 정보 + 대기 필터 정보 전송`
- `[ROADMAP 02:49:00.404] [☁️서버] 관제탑 무응답 대비 30초 데스밸리 타이머 기동 (안전망 강화)`
- `[ROADMAP 02:49:00.405] [🖥️관제웹] [관제대시보드] 🟢 [웹 수신] order-evaluating | ID: 9439da4f-5f97-4183-aa3e-d367d1f0c603 | 기기: 앱폰-sdk_gpho-160 | 경안동`
- `[ROADMAP 02:49:00.405] [🖥️관제웹] [관제대시보드] 확정페이지 진입 (선빵 수신으로 상세 모드 구동)`
- `[ROADMAP 02:49:01.393] [☁️서버] [HTTP 폴링] POST /orders/detail 데이터 수신`
- `[ROADMAP 02:49:01.394] [☁️서버] [Socket] 상하차지 송출`
- `[ROADMAP 02:49:01.394] [☁️서버] 🛡️ [카카오 API 3중 폴백] 괄호제거 ➡️ 주소검색 ➡️ 키워드검색 ➡️ 4어절 절사`

    <details>
    <summary>🔽 🌍 [Geocoding] 상차지 변환: '경기 광주시 경안동 493-4 이마트 광주점' -&gt; X:126.88210921218504, Y:35....</summary>

    ```json
    🌍 [Geocoding] 상차지 변환: '경기 광주시 경안동 493-4 이마트 광주점' -> X:126.88210921218504, Y:35.1588284814727
    ```

    </details>
- `[ROADMAP 02:49:01.395] [🖥️관제웹] [관제대시보드] 🟡 [웹 수신] order-detail-received | ID: 9439da4f | 경기 광주시 경안동 493-4 이마트`

    <details>
    <summary>🔽 🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.</summary>

    ```json
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    ```

    </details>
- `[ROADMAP 02:49:01.778] [☁️서버] [HTTP 폴링] POST /api/scrap (User: 66176c7b-1755-444c-9b65-7ca056e3c303)`

    <details>
    <summary>🔽 - ⚠️ 패널티 결과: +577.5km, +411분 '똥' (현위치접근: 6.5km, 13분)</summary>

    ```json
       - ⚠️ 패널티 결과: +577.5km, +411분 '똥' (현위치접근: 6.5km, 13분)
    🌐 [post /detail response / 200] {"deviceId":"server","action":"CANCEL"}
    ```

    </details>
- `🚦 [ROADMAP 02:49:03.660] [📱앱] [HTTP 폴링] 응답 /orders/detail 취소 정보 전송`
- `[ROADMAP 02:49:03.791] [☁️서버] [Socket] 경로 및 시간 정보, 수익률 전송`

    <details>
    <summary>🔽 🔎 [카카오 연산 완료] +577.5km, +411분 '똥' | Polyline 길이: 5180</summary>

    ```json
    🔎 [카카오 연산 완료] +577.5km, +411분 '똥' | Polyline 길이: 5180
    ```

    </details>
- `[ROADMAP 02:49:03.799] [🖥️관제웹] [관제대시보드] 🔵 [웹 수신] order-evaluated | ID: 9439da4f | +577.5km, +411분 '똥'`
- `[ROADMAP 02:49:03.803] [🖥️관제웹] [관제대시보드] 추천 결과 노출, 경로보기버튼 추가 노출 후 판단 (취소 or 닫기) 대기`
- `🚦 [ROADMAP 02:49:03.871] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`
- `🚦 [ROADMAP 02:49:03.881] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[다마스, 라보, 오토바이], isActive=true, isSharedMode=tr...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[다마스, 라보, 오토바이], isActive=true, isSharedMode=true, pickupRadiusKm=999, minFare=0, maxFare=1000000, destinationCity=, destinationRadiusKm=10, excludedKeywords=[], destinationKeywords=[], customCityFilters=[], destinationGroups={}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `🚦 [ROADMAP 02:49:04.177] [📱앱] '취소' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:49:04.180] [📱앱] [DETAIL_CONFIRMED] '취소' 클릭 후 인성 Socket 취소 지시`
- `🚦 [ROADMAP 02:49:04.240] [📱앱] 버튼 터치 완료 (가로채기 성공) X:950.0, Y:478.0`
- `🚦 [ROADMAP 02:49:04.426] [📱앱] [LIST] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:49:04.430] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(다)=✅ 도착지(0중 삼동)=✅ 요금(0 <= 58000)=✅ 상차지/거리(999 >= 1.9km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 02:49:04.430] [📱앱] [LIST] AccessibilityService로 바뀐 리스트 감지 후 text 추출`
- `🚦 [ROADMAP 02:49:04.430] [📱앱] [LIST] 리스트에서 바뀐 text 감지 후 text 추출`
- `🚦 [ROADMAP 02:49:04.431] [📱앱] [LIST] [인성 Socket] 인성콜에 선택된 콜 정보 전달 (꿀콜 클릭!)`
- `🚦 [ROADMAP 02:49:04.485] [📱앱] 버튼 터치 완료 (가로채기 성공) X:917.0, Y:568.0`
- `🚦 [ROADMAP 02:49:04.632] [📱앱] [DETAIL_PRE_CONFIRM] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:49:04.632] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지 진입`
- `🚦 [ROADMAP 02:49:04.636] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지 데이터(확정,적요상세,출발지,도착지) 추출`
- `🚦 [ROADMAP 02:49:04.636] [📱앱] [DETAIL_PRE_CONFIRM] 추출된 데이터로 한번더 필터링`
- `🚦 [ROADMAP 02:49:04.637] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(다)=✅ 도착지(0중 삼동)=✅ 요금(0 <= 58000)=✅ 상차지/거리(999 >= 1.9km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 02:49:04.637] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지에서 '확정' 추출 후 클릭`
- `🚦 [ROADMAP 02:49:04.637] [📱앱] [DETAIL_PRE_CONFIRM] [인성 Socket] 콜 확정 완료`
- `🚦 [ROADMAP 02:49:04.639] [📱앱] '확정' 버튼 인식 ➡️ 클릭 시도`

    <details>
    <summary>🔽 🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용...</summary>

    ```json
    🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용을 긁어서 POST /api/orders/detail 로 보내주세요."}
    ```

    </details>
- `🚦 [ROADMAP 02:49:04.643] [📱앱] [HTTP 폴링] 응답 /orders/confirm`
- `🚦 [ROADMAP 02:49:04.691] [📱앱] 버튼 터치 완료 (가로채기 성공) X:161.0, Y:2251.0`
- `🚦 [ROADMAP 02:49:04.826] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:49:04.827] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 02:49:04.827] [📱앱] '적요상세' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:49:04.828] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '적요상세' 추출 후 클릭`
- `🚦 [ROADMAP 02:49:04.880] [📱앱] 버튼 터치 완료 (가로채기 성공) X:149.0, Y:1153.0`
- `🚦 [ROADMAP 02:49:04.999] [📱앱] [POPUP_MEMO] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:49:05.000] [📱앱] [POPUP_MEMO] 적요상세페이지에서 '젹요 내용' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 02:49:05.002] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:49:05.055] [📱앱] 버튼 터치 완료 (가로채기 성공) X:540.0, Y:2264.0`
- `🚦 [ROADMAP 02:49:05.121] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:49:05.122] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 02:49:05.122] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '출발지' 추출 후 클릭`
- `🚦 [ROADMAP 02:49:05.122] [📱앱] '출발지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:49:05.174] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1592.0`
- `🚦 [ROADMAP 02:49:05.231] [📱앱] [POPUP_PICKUP] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:49:05.232] [📱앱] [POPUP_PICKUP] 출발지페이지 text중 '전화, 위치' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 02:49:05.232] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:49:05.284] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`
- `🚦 [ROADMAP 02:49:05.326] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:49:05.326] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 02:49:05.327] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '도착지' 추출 후 클릭`
- `🚦 [ROADMAP 02:49:05.329] [📱앱] '도착지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:49:05.381] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1742.0`
- `🚦 [ROADMAP 02:49:05.442] [📱앱] [POPUP_DROPOFF] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:49:05.442] [📱앱] [POPUP_DROPOFF] 도착지페이지 text중 '전화, 위치' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 02:49:05.442] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:49:05.443] [📱앱] [POPUP_DROPOFF] 확정페이지 진입`
- `🚦 [ROADMAP 02:49:05.494] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`
- `🚦 [ROADMAP 02:49:05.759] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`
- `🚦 [ROADMAP 02:49:05.778] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[다마스, 라보, 오토바이], isActive=false, isSharedMode=t...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[다마스, 라보, 오토바이], isActive=false, isSharedMode=true, pickupRadiusKm=999, minFare=0, maxFare=1000000, destinationCity=, destinationRadiusKm=10, excludedKeywords=[], destinationKeywords=[], customCityFilters=[], destinationGroups={}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 02:49:06.215] [🖥️관제웹] [관제대시보드] [Socket] 취소 전달`
- `[ROADMAP 02:49:06.216] [☁️서버] [HTTP 폴링] 응답 /orders/detail 취소 정보 전송`
- `[ROADMAP 02:49:06.217] [☁️서버] 첫콜 필터로 설정값 업데이트`
- `[ROADMAP 02:49:06.234] [🖥️관제웹] [관제대시보드] 🔴 [웹 수신] order-canceled | ID: 9439da4f`

    <details>
    <summary>🔽 🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.</summary>

    ```json
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    ```

    </details>
- `[ROADMAP 02:49:06.443] [☁️서버] [HTTP 폴링] POST /api/scrap (User: 66176c7b-1755-444c-9b65-7ca056e3c303)`
- `[ROADMAP 02:49:07.206] [☁️서버] [HTTP 폴링] 응답 /orders/confirm`
- `[ROADMAP 02:49:07.207] [☁️서버] [HTTP 폴링] POST /orders/confirm 확정정보 정보 전송 수신`
- `[ROADMAP 02:49:07.207] [☁️서버] 대기 필터로 설정값 업데이트 (isActive: false)`
- `[ROADMAP 02:49:07.207] [☁️서버] [Socket] 확정정보 정보 + 대기 필터 정보 전송`
- `[ROADMAP 02:49:07.207] [☁️서버] 관제탑 무응답 대비 30초 데스밸리 타이머 기동 (안전망 강화)`
- `[ROADMAP 02:49:07.208] [🖥️관제웹] [관제대시보드] 🟢 [웹 수신] order-evaluating | ID: 55cf03d3-cc5c-42fc-a841-ea5befd32154 | 기기: 앱폰-sdk_gpho-160 | 삼동`
- `[ROADMAP 02:49:07.208] [🖥️관제웹] [관제대시보드] 확정페이지 진입 (선빵 수신으로 상세 모드 구동)`
- `[ROADMAP 02:49:08.013] [☁️서버] [HTTP 폴링] POST /orders/detail 데이터 수신`
- `[ROADMAP 02:49:08.014] [☁️서버] [Socket] 상하차지 송출`
- `[ROADMAP 02:49:08.014] [☁️서버] 🛡️ [카카오 API 3중 폴백] 괄호제거 ➡️ 주소검색 ➡️ 키워드검색 ➡️ 4어절 절사`

    <details>
    <summary>🔽 🌍 [Geocoding] 상차지 변환: '경기 광주시 송정동 532-2 광주시립 중앙도서관' -&gt; X:127.253295099213, Y:37...</summary>

    ```json
    🌍 [Geocoding] 상차지 변환: '경기 광주시 송정동 532-2 광주시립 중앙도서관' -> X:127.253295099213, Y:37.4106894616542
    ```

    </details>
- `[ROADMAP 02:49:08.014] [🖥️관제웹] [관제대시보드] 🟡 [웹 수신] order-detail-received | ID: 55cf03d3 | 경기 광주시 송정동 532-2 광주시`

    <details>
    <summary>🔽 🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.</summary>

    ```json
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    ```

    </details>
- `[ROADMAP 02:49:08.340] [☁️서버] [HTTP 폴링] POST /api/scrap (User: 66176c7b-1755-444c-9b65-7ca056e3c303)`

    <details>
    <summary>🔽 - ⚠️ 패널티 결과: +18.8km, +21분 '콜' (현위치접근: 6.5km, 13분)</summary>

    ```json
       - ⚠️ 패널티 결과: +18.8km, +21분 '콜' (현위치접근: 6.5km, 13분)
    ```

    </details>
- `[ROADMAP 02:49:09.040] [☁️서버] [Socket] 경로 및 시간 정보, 수익률 전송`

    <details>
    <summary>🔽 🔎 [카카오 연산 완료] +18.8km, +21분 '콜' | Polyline 길이: 1023</summary>

    ```json
    🔎 [카카오 연산 완료] +18.8km, +21분 '콜' | Polyline 길이: 1023
    ⚖️ [소켓 Decision] User: 66176c7b-1755-444c-9b65-7ca056e3c303, ID: 55cf03d3-cc5c-42fc-a841-ea5befd32154, Action: KEEP
    ```

    </details>
- `[ROADMAP 02:49:09.042] [🖥️관제웹] [관제대시보드] 🔵 [웹 수신] order-evaluated | ID: 55cf03d3 | +18.8km, +21분 '콜'`
- `[ROADMAP 02:49:09.043] [🖥️관제웹] [관제대시보드] 추천 결과 노출, 경로보기버튼 추가 노출 후 판단 (취소 or 닫기) 대기`

    <details>
    <summary>🔽 👆 [사용자 클릭] 프론트에서 '유지 확정' 버튼 클릭 (ID: 55cf03d3-cc5c-42fc-a841-ea5befd32154)</summary>

    ```json
    👆 [사용자 클릭] 프론트에서 '유지 확정' 버튼 클릭 (ID: 55cf03d3-cc5c-42fc-a841-ea5befd32154)
    🌐 [post /detail response / 200] {"deviceId":"server","action":"KEEP"}
    ```

    </details>
- `🚦 [ROADMAP 02:49:10.870] [📱앱] [HTTP 폴링] 응답 /orders/detail 유지 정보 전송`
- `🚦 [ROADMAP 02:49:11.088] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`
- `🚦 [ROADMAP 02:49:11.215] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    FilterConfig(allowedVehicleTypes=[다마스, 라보, 오토바이], isActive=false, isSharedMode=true, pickupRadiusKm=999, minFare=0, maxFare=1000000, destinationCity=, destinationRadiusKm=10, excludedKeywords=[], destinationKeywords=[가정동, 가좌동, 가학동, 간석동, 갈산동, 갈현동, 거모동, 경동, 경안동, 계수동, 고등동, 고잔동, 과림동, 관교동, 관동, 관양동, 괴안동, 구산동, 구월동, 금곡동, 금토동, 남촌동, 내동, 노온사동, 논현동, 답동, 대야동, 도당동, 도림동, 도원동, 도창동, 도촌동, 도화동, 동춘동, 둔전동, 만석동, 만수동, 매화동, 문원동, 문학동, 미산동, 박달동, 방산동, 배곧동, 범박동, 부개동, 부평동, 북성동, 비산동, 사동, 사송동, 산곡동, 삼동, 삼산동, 삼정동, 삼평동, 상대원동, 상동, 서운동, 서창동, 석남동, 석수동, 석운동, 선린동, 선학동, 선화동, 성남동, 소사동, 소사본동, 소하동, 송내동, 송도동, 송림동, 송월동, 송정동, 송학동, 송현동, 수산동, 숭의동, 시흥동, 신림동, 신생동, 신천동, 신포동, 신현동, 신흥동, 심곡동, 심곡본동, 십정동, 쌍령동, 안양동, 안현동, 야탑동, 약대동, 양벌동, 여수동, 역곡동, 역동, 연수동, 옥길동, 옥련동, 용동, 용현동, 운연동, 운중동, 원미동, 원창동, 월곶동, 유동, 율목동, 은행동, 인현동, 일신동, 일직동, 작전동, 장곡동, 장수동, 장지동, 장현동, 전동, 정왕동, 주안동, 중대동, 중동, 중앙동, 직동, 창영동, 청계동, 청라동, 청천동, 청학동, 초월읍, 춘의동, 탄벌동, 태전동, 판교동, 포동, 포일동, 하대원동, 하중동, 학의동, 학익동, 항동, 해안동, 화수동, 화평동, 회덕동, 효성동], customCityFilters=[금천구, 금천, 관악구, 관악, 중구, 중, 동구, 동, 미추홀구, 미추홀, 연수구, 연수, 남동구, 남동, 부평구, 부평, 계양구, 계양, 서구, 서, 성남시 수정구, 성남시 수정, 성남시 중원구, 성남시 중원, 성남시 분당구, 성남시 분당, 안양시 만안구, 안양시 만안, 안양시 동안구, 안양시 동안, 부천시 원미구, 부천시 원미, 부천시 소사구, 부천시 소사, 부천시 오정구, 부천시 오정, 광명시, 광명, 과천시, 과천, 시흥시, 시흥, 의왕시, 의왕, 광주시, 광주, 경기 광주, 경기 광주시, 경광주], destinationGroups={금천구=[시흥동], 관악구=[신림동], 중구=[경동, 관동, 내동, 답동, 도원동, 북성동, 사동, 선린동, 선화동, 송월동, 송학동, 신생동, 신포동, 신흥동, 용동, 유동, 율목동, 인현동, 전동, 중앙동, 항동, 해안동], 동구=[금곡동, 만석동, 송림동, 송현동, 창영동, 화수동, 화평동], 미추홀구=[관교동, 도화동, 문학동, 숭의동, 용현동, 주안동, 학익동], 연수구=[동춘동, 선학동, 송도동, 연수동, 옥련동, 청학동], 남동구=[간석동, 고잔동, 구월동, 남촌동, 논현동, 도림동, 만수동, 서창동, 수산동, 운연동, 장수동], 부평구=[갈산동, 구산동, 부개동, 부평동, 산곡동, 삼산동, 십정동, 일신동, 청천동], 계양구=[서운동, 작전동, 효성동], 서구=[가정동, 가좌동, 석남동, 신현동, 원창동, 청라동], 성남시 수정구=[고등동, 금토동, 둔전동, 사송동, 시흥동], 성남시 중원구=[갈현동, 도촌동, 상대원동, 성남동, 여수동, 하대원동], 성남시 분당구=[삼평동, 석운동, 야탑동, 운중동, 판교동], 안양시 만안구=[박달동, 석수동, 안양동], 안양시 동안구=[관양동, 비산동], 부천시 원미구=[도당동, 상동, 소사동, 심곡동, 약대동, 역곡동, 원미동, 중동, 춘의동], 부천시 소사구=[계수동, 괴안동, 범박동, 소사본동, 송내동, 심곡본동, 옥길동], 부천시 오정구=[삼정동], 광명시=[가학동, 노온사동, 소하동, 일직동], 과천
    ```

    </details>
- `🚦 [ROADMAP 02:49:11.396] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:49:11.398] [📱앱] [DETAIL_CONFIRMED] '닫기' 클릭 후 리스트 페이지 복귀 (유지)`
- `🚦 [ROADMAP 02:49:11.451] [📱앱] 버튼 터치 완료 (가로채기 성공) X:122.0, Y:2251.0`
- `🚦 [ROADMAP 02:49:11.659] [📱앱] [LIST] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:49:11.668] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(라)=✅ 도착지(148중 다산동)=❌ 요금(0 <= 48000)=✅ 상차지/거리(999 >= 0.2km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 02:49:11.670] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(다)=✅ 도착지(148중 교하동)=❌ 요금(0 <= 101000)=✅ 상차지/거리(999 >= 0.2km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 02:49:11.673] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(오)=✅ 도착지(148중 초월읍)=✅ 요금(0 <= 30000)=✅ 상차지/거리(999 >= 4.4km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 02:49:11.673] [📱앱] [LIST] AccessibilityService로 바뀐 리스트 감지 후 text 추출`
- `🚦 [ROADMAP 02:49:11.673] [📱앱] [LIST] 리스트에서 바뀐 text 감지 후 text 추출`
- `🚦 [ROADMAP 02:49:11.674] [📱앱] [LIST] [인성 Socket] 인성콜에 선택된 콜 정보 전달 (꿀콜 클릭!)`
- `🚦 [ROADMAP 02:49:11.728] [📱앱] 버튼 터치 완료 (가로채기 성공) X:917.0, Y:759.0`
- `🚦 [ROADMAP 02:49:11.877] [📱앱] [DETAIL_PRE_CONFIRM] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:49:11.878] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지 진입`
- `🚦 [ROADMAP 02:49:11.886] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지 데이터(확정,적요상세,출발지,도착지) 추출`
- `🚦 [ROADMAP 02:49:11.886] [📱앱] [DETAIL_PRE_CONFIRM] 추출된 데이터로 한번더 필터링`
- `🚦 [ROADMAP 02:49:11.894] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(오)=✅ 도착지(148중 초월읍)=✅ 요금(0 <= 30000)=✅ 상차지/거리(999 >= 4.4km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 02:49:11.894] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지에서 '확정' 추출 후 클릭`
- `🚦 [ROADMAP 02:49:11.895] [📱앱] [DETAIL_PRE_CONFIRM] [인성 Socket] 콜 확정 완료`
- `🚦 [ROADMAP 02:49:11.895] [📱앱] '확정' 버튼 인식 ➡️ 클릭 시도`

    <details>
    <summary>🔽 🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용...</summary>

    ```json
    🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용을 긁어서 POST /api/orders/detail 로 보내주세요."}
    ```

    </details>
- `🚦 [ROADMAP 02:49:11.899] [📱앱] [HTTP 폴링] 응답 /orders/confirm`
- `🚦 [ROADMAP 02:49:11.950] [📱앱] 버튼 터치 완료 (가로채기 성공) X:161.0, Y:2251.0`
- `🚦 [ROADMAP 02:49:12.087] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:49:12.087] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 02:49:12.088] [📱앱] '적요상세' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:49:12.089] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '적요상세' 추출 후 클릭`
- `🚦 [ROADMAP 02:49:12.157] [📱앱] 버튼 터치 완료 (가로채기 성공) X:149.0, Y:1153.0`
- `🚦 [ROADMAP 02:49:12.276] [📱앱] [POPUP_MEMO] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:49:12.276] [📱앱] [POPUP_MEMO] 적요상세페이지에서 '젹요 내용' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 02:49:12.277] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:49:12.328] [📱앱] 버튼 터치 완료 (가로채기 성공) X:540.0, Y:2264.0`
- `🚦 [ROADMAP 02:49:12.366] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:49:12.366] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 02:49:12.368] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '출발지' 추출 후 클릭`
- `🚦 [ROADMAP 02:49:12.369] [📱앱] '출발지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:49:12.420] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1592.0`
- `🚦 [ROADMAP 02:49:12.508] [📱앱] [POPUP_PICKUP] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:49:12.509] [📱앱] [POPUP_PICKUP] 출발지페이지 text중 '전화, 위치' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 02:49:12.509] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:49:12.608] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:49:12.608] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 02:49:12.609] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '도착지' 추출 후 클릭`
- `🚦 [ROADMAP 02:49:12.609] [📱앱] '도착지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:49:12.609] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`
- `🚦 [ROADMAP 02:49:12.661] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1742.0`
- `🚦 [ROADMAP 02:49:12.736] [📱앱] [POPUP_DROPOFF] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:49:12.736] [📱앱] [POPUP_DROPOFF] 도착지페이지 text중 '전화, 위치' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 02:49:12.737] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:49:12.737] [📱앱] [POPUP_DROPOFF] 확정페이지 진입`
- `🚦 [ROADMAP 02:49:12.789] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`
- `🚦 [ROADMAP 02:49:13.113] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 2)`
- `🚦 [ROADMAP 02:49:13.128] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 2)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    FilterConfig(allowedVehicleTypes=[다마스, 라보, 오토바이], isActive=true, isSharedMode=true, pickupRadiusKm=999, minFare=0, maxFare=1000000, destinationCity=, destinationRadiusKm=10, excludedKeywords=[], destinationKeywords=[가정동, 가좌동, 가학동, 간석동, 갈산동, 갈현동, 거모동, 경동, 경안동, 계수동, 고등동, 고잔동, 과림동, 관교동, 관동, 관양동, 괴안동, 구산동, 구월동, 금곡동, 금토동, 남촌동, 내동, 노온사동, 논현동, 답동, 대야동, 도당동, 도림동, 도원동, 도창동, 도촌동, 도화동, 동춘동, 둔전동, 만석동, 만수동, 매화동, 문원동, 문학동, 미산동, 박달동, 방산동, 배곧동, 범박동, 부개동, 부평동, 북성동, 비산동, 사동, 사송동, 산곡동, 삼동, 삼산동, 삼정동, 삼평동, 상대원동, 상동, 서운동, 서창동, 석남동, 석수동, 석운동, 선린동, 선학동, 선화동, 성남동, 소사동, 소사본동, 소하동, 송내동, 송도동, 송림동, 송월동, 송정동, 송학동, 송현동, 수산동, 숭의동, 시흥동, 신림동, 신생동, 신천동, 신포동, 신현동, 신흥동, 심곡동, 심곡본동, 십정동, 쌍령동, 안양동, 안현동, 야탑동, 약대동, 양벌동, 여수동, 역곡동, 역동, 연수동, 옥길동, 옥련동, 용동, 용현동, 운연동, 운중동, 원미동, 원창동, 월곶동, 유동, 율목동, 은행동, 인현동, 일신동, 일직동, 작전동, 장곡동, 장수동, 장지동, 장현동, 전동, 정왕동, 주안동, 중대동, 중동, 중앙동, 직동, 창영동, 청계동, 청라동, 청천동, 청학동, 초월읍, 춘의동, 탄벌동, 태전동, 판교동, 포동, 포일동, 하대원동, 하중동, 학의동, 학익동, 항동, 해안동, 화수동, 화평동, 회덕동, 효성동], customCityFilters=[금천구, 금천, 관악구, 관악, 중구, 중, 동구, 동, 미추홀구, 미추홀, 연수구, 연수, 남동구, 남동, 부평구, 부평, 계양구, 계양, 서구, 서, 성남시 수정구, 성남시 수정, 성남시 중원구, 성남시 중원, 성남시 분당구, 성남시 분당, 안양시 만안구, 안양시 만안, 안양시 동안구, 안양시 동안, 부천시 원미구, 부천시 원미, 부천시 소사구, 부천시 소사, 부천시 오정구, 부천시 오정, 광명시, 광명, 과천시, 과천, 시흥시, 시흥, 의왕시, 의왕, 광주시, 광주, 경기 광주, 경기 광주시, 경광주], destinationGroups={금천구=[시흥동], 관악구=[신림동], 중구=[경동, 관동, 내동, 답동, 도원동, 북성동, 사동, 선린동, 선화동, 송월동, 송학동, 신생동, 신포동, 신흥동, 용동, 유동, 율목동, 인현동, 전동, 중앙동, 항동, 해안동], 동구=[금곡동, 만석동, 송림동, 송현동, 창영동, 화수동, 화평동], 미추홀구=[관교동, 도화동, 문학동, 숭의동, 용현동, 주안동, 학익동], 연수구=[동춘동, 선학동, 송도동, 연수동, 옥련동, 청학동], 남동구=[간석동, 고잔동, 구월동, 남촌동, 논현동, 도림동, 만수동, 서창동, 수산동, 운연동, 장수동], 부평구=[갈산동, 구산동, 부개동, 부평동, 산곡동, 삼산동, 십정동, 일신동, 청천동], 계양구=[서운동, 작전동, 효성동], 서구=[가정동, 가좌동, 석남동, 신현동, 원창동, 청라동], 성남시 수정구=[고등동, 금토동, 둔전동, 사송동, 시흥동], 성남시 중원구=[갈현동, 도촌동, 상대원동, 성남동, 여수동, 하대원동], 성남시 분당구=[삼평동, 석운동, 야탑동, 운중동, 판교동], 안양시 만안구=[박달동, 석수동, 안양동], 안양시 동안구=[관양동, 비산동], 부천시 원미구=[도당동, 상동, 소사동, 심곡동, 약대동, 역곡동, 원미동, 중동, 춘의동], 부천시 소사구=[계수동, 괴안동, 범박동, 소사본동, 송내동, 심곡본동, 옥길동], 부천시 오정구=[삼정동], 광명시=[가학동, 노온사동, 소하동, 일직동], 과천?
    ```

    </details>
- `[ROADMAP 02:49:13.426] [🖥️관제웹] [관제대시보드] [Socket] 유지 전달`

    <details>
    <summary>🔽 🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.</summary>

    ```json
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    ```

    </details>
- `[ROADMAP 02:49:13.428] [☁️서버] [HTTP 폴링] 응답 /orders/detail 유지 정보 전송`
- `[ROADMAP 02:49:13.770] [☁️서버] [HTTP 폴링] POST /api/scrap (User: 66176c7b-1755-444c-9b65-7ca056e3c303)`
- `[ROADMAP 02:49:14.463] [☁️서버] [HTTP 폴링] 응답 /orders/confirm`
- `[ROADMAP 02:49:14.463] [☁️서버] [HTTP 폴링] POST /orders/confirm 확정정보 정보 전송 수신`
- `[ROADMAP 02:49:14.464] [🖥️관제웹] [관제대시보드] 🟢 [웹 수신] order-evaluating | ID: 52b82944-febd-45e2-8abd-7a348744047d | 기기: 앱폰-sdk_gpho-160 | 초월읍`
- `[ROADMAP 02:49:14.464] [🖥️관제웹] [관제대시보드] 확정페이지 진입 (선빵 수신으로 상세 모드 구동)`
- `[ROADMAP 02:49:14.719] [☁️서버] 합짐 필터로 설정값 업데이트 (합짐 사냥용)`
- `[ROADMAP 02:49:15.307] [☁️서버] [HTTP 폴링] POST /orders/detail 데이터 수신`
- `[ROADMAP 02:49:15.307] [☁️서버] [Socket] 상하차지 송출`
- `[ROADMAP 02:49:15.308] [☁️서버] 🛡️ [카카오 API 3중 폴백] 괄호제거 ➡️ 주소검색 ➡️ 키워드검색 ➡️ 4어절 절사`

    <details>
    <summary>🔽 🌍 [Geocoding] 상차지 변환: '경기 광주시 목현동 558 쏘카 광주정비센터' -&gt; X:127.204247220314, Y:37.44...</summary>

    ```json
    🌍 [Geocoding] 상차지 변환: '경기 광주시 목현동 558 쏘카 광주정비센터' -> X:127.204247220314, Y:37.4418813986696
    ```

    </details>
- `[ROADMAP 02:49:15.308] [🖥️관제웹] [관제대시보드] 🟡 [웹 수신] order-detail-received | ID: 52b82944 | 경기 광주시 목현동 558 쏘카 광주`

    <details>
    <summary>🔽 🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.</summary>

    ```json
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    ```

    </details>
- `[ROADMAP 02:49:15.686] [☁️서버] [HTTP 폴링] POST /api/scrap (User: 66176c7b-1755-444c-9b65-7ca056e3c303)`
- `[ROADMAP 02:49:15.910] [☁️서버] [Socket] 경로 및 시간 정보, 수익률 전송`

    <details>
    <summary>🔽 🔎 [카카오 연산 완료] 카카오 연산 실패: 카카오합짐에러: 경유지 주변 탐색불가 (경유지 지점 주변의 도로를 탐색할 수 없음) | Polyl...</summary>

    ```json
    🔎 [카카오 연산 완료] 카카오 연산 실패: 카카오합짐에러: 경유지 주변 탐색불가 (경유지 지점 주변의 도로를 탐색할 수 없음) | Polyline 길이: 0
    ```

    </details>
- `[ROADMAP 02:49:15.911] [🖥️관제웹] [관제대시보드] 🔵 [웹 수신] order-evaluated | ID: 52b82944 | 카카오 연산 실패: 카카오합짐에러: 경유지 주변 탐색불가 (경유지 지점 주변의 도로를 탐색할 수 없음)`
- `[ROADMAP 02:49:15.911] [🖥️관제웹] [관제대시보드] 추천 결과 노출, 경로보기버튼 추가 노출 후 판단 (취소 or 닫기) 대기`

    <details>
    <summary>🔽 🌐 [post /detail response / 200] {"deviceId":"server","action":"CANCEL"}</summary>

    ```json
    🌐 [post /detail response / 200] {"deviceId":"server","action":"CANCEL"}
    ```

    </details>
- `🚦 [ROADMAP 02:49:17.606] [📱앱] [HTTP 폴링] 응답 /orders/detail 취소 정보 전송`
- `🚦 [ROADMAP 02:49:17.820] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`
- `🚦 [ROADMAP 02:49:17.831] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    FilterConfig(allowedVehicleTypes=[다마스, 라보, 오토바이], isActive=true, isSharedMode=true, pickupRadiusKm=999, minFare=0, maxFare=1000000, destinationCity=, destinationRadiusKm=10, excludedKeywords=[], destinationKeywords=[가정동, 가좌동, 가학동, 간석동, 갈산동, 갈현동, 거모동, 경동, 경안동, 계수동, 고등동, 고잔동, 과림동, 관교동, 관동, 관양동, 괴안동, 구산동, 구월동, 금곡동, 금토동, 남촌동, 내동, 노온사동, 논현동, 답동, 대야동, 도당동, 도림동, 도원동, 도창동, 도촌동, 도화동, 동춘동, 둔전동, 만석동, 만수동, 매화동, 문원동, 문학동, 미산동, 박달동, 방산동, 배곧동, 범박동, 부개동, 부평동, 북성동, 비산동, 사동, 사송동, 산곡동, 삼동, 삼산동, 삼정동, 삼평동, 상대원동, 상동, 서운동, 서창동, 석남동, 석수동, 석운동, 선린동, 선학동, 선화동, 성남동, 소사동, 소사본동, 소하동, 송내동, 송도동, 송림동, 송월동, 송정동, 송학동, 송현동, 수산동, 숭의동, 시흥동, 신림동, 신생동, 신천동, 신포동, 신현동, 신흥동, 심곡동, 심곡본동, 십정동, 쌍령동, 안양동, 안현동, 야탑동, 약대동, 양벌동, 여수동, 역곡동, 역동, 연수동, 옥길동, 옥련동, 용동, 용현동, 운연동, 운중동, 원미동, 원창동, 월곶동, 유동, 율목동, 은행동, 인현동, 일신동, 일직동, 작전동, 장곡동, 장수동, 장지동, 장현동, 전동, 정왕동, 주안동, 중대동, 중동, 중앙동, 직동, 창영동, 청계동, 청라동, 청천동, 청학동, 초월읍, 춘의동, 탄벌동, 태전동, 판교동, 포동, 포일동, 하대원동, 하중동, 학의동, 학익동, 항동, 해안동, 화수동, 화평동, 회덕동, 효성동], customCityFilters=[금천구, 금천, 관악구, 관악, 중구, 중, 동구, 동, 미추홀구, 미추홀, 연수구, 연수, 남동구, 남동, 부평구, 부평, 계양구, 계양, 서구, 서, 성남시 수정구, 성남시 수정, 성남시 중원구, 성남시 중원, 성남시 분당구, 성남시 분당, 안양시 만안구, 안양시 만안, 안양시 동안구, 안양시 동안, 부천시 원미구, 부천시 원미, 부천시 소사구, 부천시 소사, 부천시 오정구, 부천시 오정, 광명시, 광명, 과천시, 과천, 시흥시, 시흥, 의왕시, 의왕, 광주시, 광주, 경기 광주, 경기 광주시, 경광주], destinationGroups={금천구=[시흥동], 관악구=[신림동], 중구=[경동, 관동, 내동, 답동, 도원동, 북성동, 사동, 선린동, 선화동, 송월동, 송학동, 신생동, 신포동, 신흥동, 용동, 유동, 율목동, 인현동, 전동, 중앙동, 항동, 해안동], 동구=[금곡동, 만석동, 송림동, 송현동, 창영동, 화수동, 화평동], 미추홀구=[관교동, 도화동, 문학동, 숭의동, 용현동, 주안동, 학익동], 연수구=[동춘동, 선학동, 송도동, 연수동, 옥련동, 청학동], 남동구=[간석동, 고잔동, 구월동, 남촌동, 논현동, 도림동, 만수동, 서창동, 수산동, 운연동, 장수동], 부평구=[갈산동, 구산동, 부개동, 부평동, 산곡동, 삼산동, 십정동, 일신동, 청천동], 계양구=[서운동, 작전동, 효성동], 서구=[가정동, 가좌동, 석남동, 신현동, 원창동, 청라동], 성남시 수정구=[고등동, 금토동, 둔전동, 사송동, 시흥동], 성남시 중원구=[갈현동, 도촌동, 상대원동, 성남동, 여수동, 하대원동], 성남시 분당구=[삼평동, 석운동, 야탑동, 운중동, 판교동], 안양시 만안구=[박달동, 석수동, 안양동], 안양시 동안구=[관양동, 비산동], 부천시 원미구=[도당동, 상동, 소사동, 심곡동, 약대동, 역곡동, 원미동, 중동, 춘의동], 부천시 소사구=[계수동, 괴안동, 범박동, 소사본동, 송내동, 심곡본동, 옥길동], 부천시 오정구=[삼정동], 광명시=[가학동, 노온사동, 소하동, 일직동], 과천?
    ```

    </details>
- `🚦 [ROADMAP 02:49:18.120] [📱앱] '취소' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:49:18.124] [📱앱] [DETAIL_CONFIRMED] '취소' 클릭 후 인성 Socket 취소 지시`
- `🚦 [ROADMAP 02:49:18.194] [📱앱] 버튼 터치 완료 (가로채기 성공) X:950.0, Y:478.0`
- `🚦 [ROADMAP 02:49:18.376] [📱앱] [LIST] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:49:18.381] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(다)=✅ 도착지(148중 송파구)=❌ 요금(0 <= 34000)=✅ 상차지/거리(999 >= 1.9km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 02:49:18.384] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(1t)=❌ 도착지(148중 강남구)=❌ 요금(0 <= 53000)=✅ 상차지/거리(999 >= 9.0km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 02:49:18.686] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 2)`
- `🚦 [ROADMAP 02:49:18.696] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 2)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    FilterConfig(allowedVehicleTypes=[다마스, 라보, 오토바이], isActive=true, isSharedMode=true, pickupRadiusKm=999, minFare=0, maxFare=1000000, destinationCity=, destinationRadiusKm=10, excludedKeywords=[], destinationKeywords=[가정동, 가좌동, 가학동, 간석동, 갈산동, 갈현동, 거모동, 경동, 경안동, 계수동, 고등동, 고잔동, 과림동, 관교동, 관동, 관양동, 괴안동, 구산동, 구월동, 금곡동, 금토동, 남촌동, 내동, 노온사동, 논현동, 답동, 대야동, 도당동, 도림동, 도원동, 도창동, 도촌동, 도화동, 동춘동, 둔전동, 만석동, 만수동, 매화동, 문원동, 문학동, 미산동, 박달동, 방산동, 배곧동, 범박동, 부개동, 부평동, 북성동, 비산동, 사동, 사송동, 산곡동, 삼동, 삼산동, 삼정동, 삼평동, 상대원동, 상동, 서운동, 서창동, 석남동, 석수동, 석운동, 선린동, 선학동, 선화동, 성남동, 소사동, 소사본동, 소하동, 송내동, 송도동, 송림동, 송월동, 송정동, 송학동, 송현동, 수산동, 숭의동, 시흥동, 신림동, 신생동, 신천동, 신포동, 신현동, 신흥동, 심곡동, 심곡본동, 십정동, 쌍령동, 안양동, 안현동, 야탑동, 약대동, 양벌동, 여수동, 역곡동, 역동, 연수동, 옥길동, 옥련동, 용동, 용현동, 운연동, 운중동, 원미동, 원창동, 월곶동, 유동, 율목동, 은행동, 인현동, 일신동, 일직동, 작전동, 장곡동, 장수동, 장지동, 장현동, 전동, 정왕동, 주안동, 중대동, 중동, 중앙동, 직동, 창영동, 청계동, 청라동, 청천동, 청학동, 초월읍, 춘의동, 탄벌동, 태전동, 판교동, 포동, 포일동, 하대원동, 하중동, 학의동, 학익동, 항동, 해안동, 화수동, 화평동, 회덕동, 효성동], customCityFilters=[금천구, 금천, 관악구, 관악, 중구, 중, 동구, 동, 미추홀구, 미추홀, 연수구, 연수, 남동구, 남동, 부평구, 부평, 계양구, 계양, 서구, 서, 성남시 수정구, 성남시 수정, 성남시 중원구, 성남시 중원, 성남시 분당구, 성남시 분당, 안양시 만안구, 안양시 만안, 안양시 동안구, 안양시 동안, 부천시 원미구, 부천시 원미, 부천시 소사구, 부천시 소사, 부천시 오정구, 부천시 오정, 광명시, 광명, 과천시, 과천, 시흥시, 시흥, 의왕시, 의왕, 광주시, 광주, 경기 광주, 경기 광주시, 경광주], destinationGroups={금천구=[시흥동], 관악구=[신림동], 중구=[경동, 관동, 내동, 답동, 도원동, 북성동, 사동, 선린동, 선화동, 송월동, 송학동, 신생동, 신포동, 신흥동, 용동, 유동, 율목동, 인현동, 전동, 중앙동, 항동, 해안동], 동구=[금곡동, 만석동, 송림동, 송현동, 창영동, 화수동, 화평동], 미추홀구=[관교동, 도화동, 문학동, 숭의동, 용현동, 주안동, 학익동], 연수구=[동춘동, 선학동, 송도동, 연수동, 옥련동, 청학동], 남동구=[간석동, 고잔동, 구월동, 남촌동, 논현동, 도림동, 만수동, 서창동, 수산동, 운연동, 장수동], 부평구=[갈산동, 구산동, 부개동, 부평동, 산곡동, 삼산동, 십정동, 일신동, 청천동], 계양구=[서운동, 작전동, 효성동], 서구=[가정동, 가좌동, 석남동, 신현동, 원창동, 청라동], 성남시 수정구=[고등동, 금토동, 둔전동, 사송동, 시흥동], 성남시 중원구=[갈현동, 도촌동, 상대원동, 성남동, 여수동, 하대원동], 성남시 분당구=[삼평동, 석운동, 야탑동, 운중동, 판교동], 안양시 만안구=[박달동, 석수동, 안양동], 안양시 동안구=[관양동, 비산동], 부천시 원미구=[도당동, 상동, 소사동, 심곡동, 약대동, 역곡동, 원미동, 중동, 춘의동], 부천시 소사구=[계수동, 괴안동, 범박동, 소사본동, 송내동, 심곡본동, 옥길동], 부천시 오정구=[삼정동], 광명시=[가학동, 노온사동, 소하동, 일직동], 과천?
    ```

    </details>
- `[ROADMAP 02:49:20.164] [🖥️관제웹] [관제대시보드] [Socket] 취소 전달`
- `[ROADMAP 02:49:20.166] [☁️서버] [HTTP 폴링] 응답 /orders/detail 취소 정보 전송`
- `[ROADMAP 02:49:20.166] [☁️서버] 첫콜 필터로 설정값 업데이트`
- `[ROADMAP 02:49:20.178] [🖥️관제웹] [관제대시보드] 🔴 [웹 수신] order-canceled | ID: 52b82944`
- `🚦 [ROADMAP 02:49:20.249] [📱앱] [LIST] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:49:20.253] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(라)=✅ 도착지(148중 서대문구)=❌ 요금(0 <= 56000)=✅ 상차지/거리(999 >= 3.8km)=✅ 블랙()=✅`
- `[ROADMAP 02:49:20.392] [☁️서버] [HTTP 폴링] POST /api/scrap (User: 66176c7b-1755-444c-9b65-7ca056e3c303)`
- `🚦 [ROADMAP 02:49:20.559] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 1)`
- `🚦 [ROADMAP 02:49:20.572] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    FilterConfig(allowedVehicleTypes=[다마스, 라보, 오토바이], isActive=true, isSharedMode=true, pickupRadiusKm=999, minFare=0, maxFare=1000000, destinationCity=, destinationRadiusKm=10, excludedKeywords=[], destinationKeywords=[가정동, 가좌동, 가학동, 간석동, 갈산동, 갈현동, 거모동, 경동, 경안동, 계수동, 고등동, 고잔동, 과림동, 관교동, 관동, 관양동, 괴안동, 구산동, 구월동, 금곡동, 금토동, 남촌동, 내동, 노온사동, 논현동, 답동, 대야동, 도당동, 도림동, 도원동, 도창동, 도촌동, 도화동, 동춘동, 둔전동, 만석동, 만수동, 매화동, 문원동, 문학동, 미산동, 박달동, 방산동, 배곧동, 범박동, 부개동, 부평동, 북성동, 비산동, 사동, 사송동, 산곡동, 삼동, 삼산동, 삼정동, 삼평동, 상대원동, 상동, 서운동, 서창동, 석남동, 석수동, 석운동, 선린동, 선학동, 선화동, 성남동, 소사동, 소사본동, 소하동, 송내동, 송도동, 송림동, 송월동, 송정동, 송학동, 송현동, 수산동, 숭의동, 시흥동, 신림동, 신생동, 신천동, 신포동, 신현동, 신흥동, 심곡동, 심곡본동, 십정동, 쌍령동, 안양동, 안현동, 야탑동, 약대동, 양벌동, 여수동, 역곡동, 역동, 연수동, 옥길동, 옥련동, 용동, 용현동, 운연동, 운중동, 원미동, 원창동, 월곶동, 유동, 율목동, 은행동, 인현동, 일신동, 일직동, 작전동, 장곡동, 장수동, 장지동, 장현동, 전동, 정왕동, 주안동, 중대동, 중동, 중앙동, 직동, 창영동, 청계동, 청라동, 청천동, 청학동, 초월읍, 춘의동, 탄벌동, 태전동, 판교동, 포동, 포일동, 하대원동, 하중동, 학의동, 학익동, 항동, 해안동, 화수동, 화평동, 회덕동, 효성동], customCityFilters=[금천구, 금천, 관악구, 관악, 중구, 중, 동구, 동, 미추홀구, 미추홀, 연수구, 연수, 남동구, 남동, 부평구, 부평, 계양구, 계양, 서구, 서, 성남시 수정구, 성남시 수정, 성남시 중원구, 성남시 중원, 성남시 분당구, 성남시 분당, 안양시 만안구, 안양시 만안, 안양시 동안구, 안양시 동안, 부천시 원미구, 부천시 원미, 부천시 소사구, 부천시 소사, 부천시 오정구, 부천시 오정, 광명시, 광명, 과천시, 과천, 시흥시, 시흥, 의왕시, 의왕, 광주시, 광주, 경기 광주, 경기 광주시, 경광주], destinationGroups={금천구=[시흥동], 관악구=[신림동], 중구=[경동, 관동, 내동, 답동, 도원동, 북성동, 사동, 선린동, 선화동, 송월동, 송학동, 신생동, 신포동, 신흥동, 용동, 유동, 율목동, 인현동, 전동, 중앙동, 항동, 해안동], 동구=[금곡동, 만석동, 송림동, 송현동, 창영동, 화수동, 화평동], 미추홀구=[관교동, 도화동, 문학동, 숭의동, 용현동, 주안동, 학익동], 연수구=[동춘동, 선학동, 송도동, 연수동, 옥련동, 청학동], 남동구=[간석동, 고잔동, 구월동, 남촌동, 논현동, 도림동, 만수동, 서창동, 수산동, 운연동, 장수동], 부평구=[갈산동, 구산동, 부개동, 부평동, 산곡동, 삼산동, 십정동, 일신동, 청천동], 계양구=[서운동, 작전동, 효성동], 서구=[가정동, 가좌동, 석남동, 신현동, 원창동, 청라동], 성남시 수정구=[고등동, 금토동, 둔전동, 사송동, 시흥동], 성남시 중원구=[갈현동, 도촌동, 상대원동, 성남동, 여수동, 하대원동], 성남시 분당구=[삼평동, 석운동, 야탑동, 운중동, 판교동], 안양시 만안구=[박달동, 석수동, 안양동], 안양시 동안구=[관양동, 비산동], 부천시 원미구=[도당동, 상동, 소사동, 심곡동, 약대동, 역곡동, 원미동, 중동, 춘의동], 부천시 소사구=[계수동, 괴안동, 범박동, 소사본동, 송내동, 심곡본동, 옥길동], 부천시 오정구=[삼정동], 광명시=[가학동, 노온사동, 소하동, 일직동], 과천?
    ```

    </details>
- `[ROADMAP 02:49:21.256] [☁️서버] [HTTP 폴링] POST /api/scrap (User: 66176c7b-1755-444c-9b65-7ca056e3c303)`
- `[ROADMAP 02:49:23.131] [☁️서버] [HTTP 폴링] POST /api/scrap (User: 66176c7b-1755-444c-9b65-7ca056e3c303)`
- `🚦 [ROADMAP 02:49:25.257] [📱앱] [LIST] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:49:25.263] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(다)=✅ 도착지(148중 삼동)=✅ 요금(0 <= 52000)=✅ 상차지/거리(999 >= 0.2km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 02:49:25.263] [📱앱] [LIST] AccessibilityService로 바뀐 리스트 감지 후 text 추출`
- `🚦 [ROADMAP 02:49:25.264] [📱앱] [LIST] 리스트에서 바뀐 text 감지 후 text 추출`
- `🚦 [ROADMAP 02:49:25.265] [📱앱] [LIST] [인성 Socket] 인성콜에 선택된 콜 정보 전달 (꿀콜 클릭!)`
- `🚦 [ROADMAP 02:49:25.317] [📱앱] 버튼 터치 완료 (가로채기 성공) X:917.0, Y:568.0`
- `🚦 [ROADMAP 02:49:25.469] [📱앱] [DETAIL_PRE_CONFIRM] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:49:25.470] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지 진입`
- `🚦 [ROADMAP 02:49:25.475] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지 데이터(확정,적요상세,출발지,도착지) 추출`
- `🚦 [ROADMAP 02:49:25.475] [📱앱] [DETAIL_PRE_CONFIRM] 추출된 데이터로 한번더 필터링`
- `🚦 [ROADMAP 02:49:25.476] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(다)=✅ 도착지(148중 삼동)=✅ 요금(0 <= 52000)=✅ 상차지/거리(999 >= 0.2km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 02:49:25.477] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지에서 '확정' 추출 후 클릭`
- `🚦 [ROADMAP 02:49:25.477] [📱앱] [DETAIL_PRE_CONFIRM] [인성 Socket] 콜 확정 완료`
- `🚦 [ROADMAP 02:49:25.477] [📱앱] '확정' 버튼 인식 ➡️ 클릭 시도`

    <details>
    <summary>🔽 🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용...</summary>

    ```json
    🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용을 긁어서 POST /api/orders/detail 로 보내주세요."}
    ```

    </details>
- `🚦 [ROADMAP 02:49:25.498] [📱앱] [HTTP 폴링] 응답 /orders/confirm`
- `🚦 [ROADMAP 02:49:25.530] [📱앱] 버튼 터치 완료 (가로채기 성공) X:161.0, Y:2251.0`
- `🚦 [ROADMAP 02:49:25.679] [📱앱] [DETAIL_PRE_CONFIRM] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`
- `🚦 [ROADMAP 02:49:25.688] [📱앱] [DETAIL_PRE_CONFIRM] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    FilterConfig(allowedVehicleTypes=[다마스, 라보, 오토바이], isActive=false, isSharedMode=true, pickupRadiusKm=999, minFare=0, maxFare=1000000, destinationCity=, destinationRadiusKm=10, excludedKeywords=[], destinationKeywords=[가정동, 가좌동, 가학동, 간석동, 갈산동, 갈현동, 거모동, 경동, 경안동, 계수동, 고등동, 고잔동, 과림동, 관교동, 관동, 관양동, 괴안동, 구산동, 구월동, 금곡동, 금토동, 남촌동, 내동, 노온사동, 논현동, 답동, 대야동, 도당동, 도림동, 도원동, 도창동, 도촌동, 도화동, 동춘동, 둔전동, 만석동, 만수동, 매화동, 문원동, 문학동, 미산동, 박달동, 방산동, 배곧동, 범박동, 부개동, 부평동, 북성동, 비산동, 사동, 사송동, 산곡동, 삼동, 삼산동, 삼정동, 삼평동, 상대원동, 상동, 서운동, 서창동, 석남동, 석수동, 석운동, 선린동, 선학동, 선화동, 성남동, 소사동, 소사본동, 소하동, 송내동, 송도동, 송림동, 송월동, 송정동, 송학동, 송현동, 수산동, 숭의동, 시흥동, 신림동, 신생동, 신천동, 신포동, 신현동, 신흥동, 심곡동, 심곡본동, 십정동, 쌍령동, 안양동, 안현동, 야탑동, 약대동, 양벌동, 여수동, 역곡동, 역동, 연수동, 옥길동, 옥련동, 용동, 용현동, 운연동, 운중동, 원미동, 원창동, 월곶동, 유동, 율목동, 은행동, 인현동, 일신동, 일직동, 작전동, 장곡동, 장수동, 장지동, 장현동, 전동, 정왕동, 주안동, 중대동, 중동, 중앙동, 직동, 창영동, 청계동, 청라동, 청천동, 청학동, 초월읍, 춘의동, 탄벌동, 태전동, 판교동, 포동, 포일동, 하대원동, 하중동, 학의동, 학익동, 항동, 해안동, 화수동, 화평동, 회덕동, 효성동], customCityFilters=[금천구, 금천, 관악구, 관악, 중구, 중, 동구, 동, 미추홀구, 미추홀, 연수구, 연수, 남동구, 남동, 부평구, 부평, 계양구, 계양, 서구, 서, 성남시 수정구, 성남시 수정, 성남시 중원구, 성남시 중원, 성남시 분당구, 성남시 분당, 안양시 만안구, 안양시 만안, 안양시 동안구, 안양시 동안, 부천시 원미구, 부천시 원미, 부천시 소사구, 부천시 소사, 부천시 오정구, 부천시 오정, 광명시, 광명, 과천시, 과천, 시흥시, 시흥, 의왕시, 의왕, 광주시, 광주, 경기 광주, 경기 광주시, 경광주], destinationGroups={금천구=[시흥동], 관악구=[신림동], 중구=[경동, 관동, 내동, 답동, 도원동, 북성동, 사동, 선린동, 선화동, 송월동, 송학동, 신생동, 신포동, 신흥동, 용동, 유동, 율목동, 인현동, 전동, 중앙동, 항동, 해안동], 동구=[금곡동, 만석동, 송림동, 송현동, 창영동, 화수동, 화평동], 미추홀구=[관교동, 도화동, 문학동, 숭의동, 용현동, 주안동, 학익동], 연수구=[동춘동, 선학동, 송도동, 연수동, 옥련동, 청학동], 남동구=[간석동, 고잔동, 구월동, 남촌동, 논현동, 도림동, 만수동, 서창동, 수산동, 운연동, 장수동], 부평구=[갈산동, 구산동, 부개동, 부평동, 산곡동, 삼산동, 십정동, 일신동, 청천동], 계양구=[서운동, 작전동, 효성동], 서구=[가정동, 가좌동, 석남동, 신현동, 원창동, 청라동], 성남시 수정구=[고등동, 금토동, 둔전동, 사송동, 시흥동], 성남시 중원구=[갈현동, 도촌동, 상대원동, 성남동, 여수동, 하대원동], 성남시 분당구=[삼평동, 석운동, 야탑동, 운중동, 판교동], 안양시 만안구=[박달동, 석수동, 안양동], 안양시 동안구=[관양동, 비산동], 부천시 원미구=[도당동, 상동, 소사동, 심곡동, 약대동, 역곡동, 원미동, 중동, 춘의동], 부천시 소사구=[계수동, 괴안동, 범박동, 소사본동, 송내동, 심곡본동, 옥길동], 부천시 오정구=[삼정동], 광명시=[가학동, 노온사동, 소하동, 일직동], 과천
    ```

    </details>
- `🚦 [ROADMAP 02:49:25.779] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:49:25.780] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 02:49:25.780] [📱앱] '적요상세' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:49:25.782] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '적요상세' 추출 후 클릭`
- `🚦 [ROADMAP 02:49:25.832] [📱앱] 버튼 터치 완료 (가로채기 성공) X:149.0, Y:1153.0`
- `🚦 [ROADMAP 02:49:25.959] [📱앱] [POPUP_MEMO] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:49:25.960] [📱앱] [POPUP_MEMO] 적요상세페이지에서 '젹요 내용' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 02:49:25.960] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:49:26.014] [📱앱] 버튼 터치 완료 (가로채기 성공) X:540.0, Y:2264.0`
- `🚦 [ROADMAP 02:49:26.065] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:49:26.066] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 02:49:26.066] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '출발지' 추출 후 클릭`
- `🚦 [ROADMAP 02:49:26.066] [📱앱] '출발지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:49:26.119] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1592.0`
- `🚦 [ROADMAP 02:49:26.197] [📱앱] [POPUP_PICKUP] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:49:26.198] [📱앱] [POPUP_PICKUP] 출발지페이지 text중 '전화, 위치' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 02:49:26.200] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:49:26.254] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`
- `🚦 [ROADMAP 02:49:26.291] [📱앱] [POPUP_PICKUP] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:49:26.391] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:49:26.392] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 02:49:26.392] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '도착지' 추출 후 클릭`
- `🚦 [ROADMAP 02:49:26.393] [📱앱] '도착지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:49:26.444] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1742.0`
- `🚦 [ROADMAP 02:49:26.626] [📱앱] [POPUP_DROPOFF] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:49:26.627] [📱앱] [POPUP_DROPOFF] 도착지페이지 text중 '전화, 위치' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 02:49:26.628] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:49:26.629] [📱앱] [POPUP_DROPOFF] 확정페이지 진입`
- `🚦 [ROADMAP 02:49:26.722] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`
- `🚦 [ROADMAP 02:49:26.828] [📱앱] [POPUP_DROPOFF] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`
- `🚦 [ROADMAP 02:49:26.853] [📱앱] [POPUP_DROPOFF] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    FilterConfig(allowedVehicleTypes=[다마스, 라보, 오토바이], isActive=false, isSharedMode=true, pickupRadiusKm=999, minFare=0, maxFare=1000000, destinationCity=, destinationRadiusKm=10, excludedKeywords=[], destinationKeywords=[가정동, 가좌동, 가학동, 간석동, 갈산동, 갈현동, 거모동, 경동, 경안동, 계수동, 고등동, 고잔동, 과림동, 관교동, 관동, 관양동, 괴안동, 구산동, 구월동, 금곡동, 금토동, 남촌동, 내동, 노온사동, 논현동, 답동, 대야동, 도당동, 도림동, 도원동, 도창동, 도촌동, 도화동, 동춘동, 둔전동, 만석동, 만수동, 매화동, 문원동, 문학동, 미산동, 박달동, 방산동, 배곧동, 범박동, 부개동, 부평동, 북성동, 비산동, 사동, 사송동, 산곡동, 삼동, 삼산동, 삼정동, 삼평동, 상대원동, 상동, 서운동, 서창동, 석남동, 석수동, 석운동, 선린동, 선학동, 선화동, 성남동, 소사동, 소사본동, 소하동, 송내동, 송도동, 송림동, 송월동, 송정동, 송학동, 송현동, 수산동, 숭의동, 시흥동, 신림동, 신생동, 신천동, 신포동, 신현동, 신흥동, 심곡동, 심곡본동, 십정동, 쌍령동, 안양동, 안현동, 야탑동, 약대동, 양벌동, 여수동, 역곡동, 역동, 연수동, 옥길동, 옥련동, 용동, 용현동, 운연동, 운중동, 원미동, 원창동, 월곶동, 유동, 율목동, 은행동, 인현동, 일신동, 일직동, 작전동, 장곡동, 장수동, 장지동, 장현동, 전동, 정왕동, 주안동, 중대동, 중동, 중앙동, 직동, 창영동, 청계동, 청라동, 청천동, 청학동, 초월읍, 춘의동, 탄벌동, 태전동, 판교동, 포동, 포일동, 하대원동, 하중동, 학의동, 학익동, 항동, 해안동, 화수동, 화평동, 회덕동, 효성동], customCityFilters=[금천구, 금천, 관악구, 관악, 중구, 중, 동구, 동, 미추홀구, 미추홀, 연수구, 연수, 남동구, 남동, 부평구, 부평, 계양구, 계양, 서구, 서, 성남시 수정구, 성남시 수정, 성남시 중원구, 성남시 중원, 성남시 분당구, 성남시 분당, 안양시 만안구, 안양시 만안, 안양시 동안구, 안양시 동안, 부천시 원미구, 부천시 원미, 부천시 소사구, 부천시 소사, 부천시 오정구, 부천시 오정, 광명시, 광명, 과천시, 과천, 시흥시, 시흥, 의왕시, 의왕, 광주시, 광주, 경기 광주, 경기 광주시, 경광주], destinationGroups={금천구=[시흥동], 관악구=[신림동], 중구=[경동, 관동, 내동, 답동, 도원동, 북성동, 사동, 선린동, 선화동, 송월동, 송학동, 신생동, 신포동, 신흥동, 용동, 유동, 율목동, 인현동, 전동, 중앙동, 항동, 해안동], 동구=[금곡동, 만석동, 송림동, 송현동, 창영동, 화수동, 화평동], 미추홀구=[관교동, 도화동, 문학동, 숭의동, 용현동, 주안동, 학익동], 연수구=[동춘동, 선학동, 송도동, 연수동, 옥련동, 청학동], 남동구=[간석동, 고잔동, 구월동, 남촌동, 논현동, 도림동, 만수동, 서창동, 수산동, 운연동, 장수동], 부평구=[갈산동, 구산동, 부개동, 부평동, 산곡동, 삼산동, 십정동, 일신동, 청천동], 계양구=[서운동, 작전동, 효성동], 서구=[가정동, 가좌동, 석남동, 신현동, 원창동, 청라동], 성남시 수정구=[고등동, 금토동, 둔전동, 사송동, 시흥동], 성남시 중원구=[갈현동, 도촌동, 상대원동, 성남동, 여수동, 하대원동], 성남시 분당구=[삼평동, 석운동, 야탑동, 운중동, 판교동], 안양시 만안구=[박달동, 석수동, 안양동], 안양시 동안구=[관양동, 비산동], 부천시 원미구=[도당동, 상동, 소사동, 심곡동, 약대동, 역곡동, 원미동, 중동, 춘의동], 부천시 소사구=[계수동, 괴안동, 범박동, 소사본동, 송내동, 심곡본동, 옥길동], 부천시 오정구=[삼정동], 광명시=[가학동, 노온사동, 소하동, 일직동], 과천
    ```

    </details>
- `🚦 [ROADMAP 02:49:27.066] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`
- `🚦 [ROADMAP 02:49:27.082] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    FilterConfig(allowedVehicleTypes=[다마스, 라보, 오토바이], isActive=false, isSharedMode=true, pickupRadiusKm=999, minFare=0, maxFare=1000000, destinationCity=, destinationRadiusKm=10, excludedKeywords=[], destinationKeywords=[가정동, 가좌동, 가학동, 간석동, 갈산동, 갈현동, 거모동, 경동, 경안동, 계수동, 고등동, 고잔동, 과림동, 관교동, 관동, 관양동, 괴안동, 구산동, 구월동, 금곡동, 금토동, 남촌동, 내동, 노온사동, 논현동, 답동, 대야동, 도당동, 도림동, 도원동, 도창동, 도촌동, 도화동, 동춘동, 둔전동, 만석동, 만수동, 매화동, 문원동, 문학동, 미산동, 박달동, 방산동, 배곧동, 범박동, 부개동, 부평동, 북성동, 비산동, 사동, 사송동, 산곡동, 삼동, 삼산동, 삼정동, 삼평동, 상대원동, 상동, 서운동, 서창동, 석남동, 석수동, 석운동, 선린동, 선학동, 선화동, 성남동, 소사동, 소사본동, 소하동, 송내동, 송도동, 송림동, 송월동, 송정동, 송학동, 송현동, 수산동, 숭의동, 시흥동, 신림동, 신생동, 신천동, 신포동, 신현동, 신흥동, 심곡동, 심곡본동, 십정동, 쌍령동, 안양동, 안현동, 야탑동, 약대동, 양벌동, 여수동, 역곡동, 역동, 연수동, 옥길동, 옥련동, 용동, 용현동, 운연동, 운중동, 원미동, 원창동, 월곶동, 유동, 율목동, 은행동, 인현동, 일신동, 일직동, 작전동, 장곡동, 장수동, 장지동, 장현동, 전동, 정왕동, 주안동, 중대동, 중동, 중앙동, 직동, 창영동, 청계동, 청라동, 청천동, 청학동, 초월읍, 춘의동, 탄벌동, 태전동, 판교동, 포동, 포일동, 하대원동, 하중동, 학의동, 학익동, 항동, 해안동, 화수동, 화평동, 회덕동, 효성동], customCityFilters=[금천구, 금천, 관악구, 관악, 중구, 중, 동구, 동, 미추홀구, 미추홀, 연수구, 연수, 남동구, 남동, 부평구, 부평, 계양구, 계양, 서구, 서, 성남시 수정구, 성남시 수정, 성남시 중원구, 성남시 중원, 성남시 분당구, 성남시 분당, 안양시 만안구, 안양시 만안, 안양시 동안구, 안양시 동안, 부천시 원미구, 부천시 원미, 부천시 소사구, 부천시 소사, 부천시 오정구, 부천시 오정, 광명시, 광명, 과천시, 과천, 시흥시, 시흥, 의왕시, 의왕, 광주시, 광주, 경기 광주, 경기 광주시, 경광주], destinationGroups={금천구=[시흥동], 관악구=[신림동], 중구=[경동, 관동, 내동, 답동, 도원동, 북성동, 사동, 선린동, 선화동, 송월동, 송학동, 신생동, 신포동, 신흥동, 용동, 유동, 율목동, 인현동, 전동, 중앙동, 항동, 해안동], 동구=[금곡동, 만석동, 송림동, 송현동, 창영동, 화수동, 화평동], 미추홀구=[관교동, 도화동, 문학동, 숭의동, 용현동, 주안동, 학익동], 연수구=[동춘동, 선학동, 송도동, 연수동, 옥련동, 청학동], 남동구=[간석동, 고잔동, 구월동, 남촌동, 논현동, 도림동, 만수동, 서창동, 수산동, 운연동, 장수동], 부평구=[갈산동, 구산동, 부개동, 부평동, 산곡동, 삼산동, 십정동, 일신동, 청천동], 계양구=[서운동, 작전동, 효성동], 서구=[가정동, 가좌동, 석남동, 신현동, 원창동, 청라동], 성남시 수정구=[고등동, 금토동, 둔전동, 사송동, 시흥동], 성남시 중원구=[갈현동, 도촌동, 상대원동, 성남동, 여수동, 하대원동], 성남시 분당구=[삼평동, 석운동, 야탑동, 운중동, 판교동], 안양시 만안구=[박달동, 석수동, 안양동], 안양시 동안구=[관양동, 비산동], 부천시 원미구=[도당동, 상동, 소사동, 심곡동, 약대동, 역곡동, 원미동, 중동, 춘의동], 부천시 소사구=[계수동, 괴안동, 범박동, 소사본동, 송내동, 심곡본동, 옥길동], 부천시 오정구=[삼정동], 광명시=[가학동, 노온사동, 소하동, 일직동], 과천
    ```

    </details>
- `[ROADMAP 02:49:28.061] [☁️서버] [HTTP 폴링] 응답 /orders/confirm`
- `[ROADMAP 02:49:28.061] [☁️서버] [HTTP 폴링] POST /orders/confirm 확정정보 정보 전송 수신`
- `[ROADMAP 02:49:28.061] [☁️서버] 대기 필터로 설정값 업데이트 (isActive: false)`
- `[ROADMAP 02:49:28.062] [☁️서버] [Socket] 확정정보 정보 + 대기 필터 정보 전송`
- `[ROADMAP 02:49:28.062] [☁️서버] 관제탑 무응답 대비 30초 데스밸리 타이머 기동 (안전망 강화)`
- `[ROADMAP 02:49:28.062] [🖥️관제웹] [관제대시보드] 🟢 [웹 수신] order-evaluating | ID: 40243789-5df7-4504-b5b7-441751f50b02 | 기기: 앱폰-sdk_gpho-160 | 삼동`
- `[ROADMAP 02:49:28.062] [🖥️관제웹] [관제대시보드] 확정페이지 진입 (선빵 수신으로 상세 모드 구동)`
- `[ROADMAP 02:49:28.248] [☁️서버] [HTTP 폴링] POST /api/scrap (User: 66176c7b-1755-444c-9b65-7ca056e3c303)`
- `[ROADMAP 02:49:29.201] [☁️서버] [HTTP 폴링] POST /orders/detail 데이터 수신`
- `[ROADMAP 02:49:29.203] [☁️서버] [Socket] 상하차지 송출`
- `[ROADMAP 02:49:29.203] [☁️서버] 🛡️ [카카오 API 3중 폴백] 괄호제거 ➡️ 주소검색 ➡️ 키워드검색 ➡️ 4어절 절사`

    <details>
    <summary>🔽 🌍 [Geocoding] 상차지 변환: '경기 광주시 경안동 204-5 홈플러스 광주점' -&gt; X:126.930393028084, Y:35.1...</summary>

    ```json
    🌍 [Geocoding] 상차지 변환: '경기 광주시 경안동 204-5 홈플러스 광주점' -> X:126.930393028084, Y:35.1793194599394
    ```

    </details>
- `[ROADMAP 02:49:29.204] [🖥️관제웹] [관제대시보드] 🟡 [웹 수신] order-detail-received | ID: 40243789 | 경기 광주시 경안동 204-5 홈플러`

    <details>
    <summary>🔽 🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.</summary>

    ```json
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    ```

    </details>
- `[ROADMAP 02:49:29.404] [☁️서버] [HTTP 폴링] POST /api/scrap (User: 66176c7b-1755-444c-9b65-7ca056e3c303)`
- `[ROADMAP 02:49:29.637] [☁️서버] [HTTP 폴링] POST /api/scrap (User: 66176c7b-1755-444c-9b65-7ca056e3c303)`

    <details>
    <summary>🔽 - ⚠️ 패널티 결과: +550.4km, +382분 '똥' (현위치접근: 6.5km, 13분)</summary>

    ```json
       - ⚠️ 패널티 결과: +550.4km, +382분 '똥' (현위치접근: 6.5km, 13분)
    ```

    </details>
- `[ROADMAP 02:49:31.748] [☁️서버] [Socket] 경로 및 시간 정보, 수익률 전송`

    <details>
    <summary>🔽 🔎 [카카오 연산 완료] +550.4km, +382분 '똥' | Polyline 길이: 4810</summary>

    ```json
    🔎 [카카오 연산 완료] +550.4km, +382분 '똥' | Polyline 길이: 4810
    ```

    </details>
- `[ROADMAP 02:49:31.756] [🖥️관제웹] [관제대시보드] 🔵 [웹 수신] order-evaluated | ID: 40243789 | +550.4km, +382분 '똥'`
- `[ROADMAP 02:49:31.758] [🖥️관제웹] [관제대시보드] 추천 결과 노출, 경로보기버튼 추가 노출 후 판단 (취소 or 닫기) 대기`

    <details>
    <summary>🔽 🌐 [post /detail response / 200] {"deviceId":"server","action":"CANCEL"}</summary>

    ```json
    🌐 [post /detail response / 200] {"deviceId":"server","action":"CANCEL"}
    ```

    </details>
- `🚦 [ROADMAP 02:49:36.273] [📱앱] [HTTP 폴링] 응답 /orders/detail 취소 정보 전송`
- `🚦 [ROADMAP 02:49:36.496] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`
- `🚦 [ROADMAP 02:49:36.510] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    FilterConfig(allowedVehicleTypes=[다마스, 라보, 오토바이], isActive=true, isSharedMode=true, pickupRadiusKm=999, minFare=0, maxFare=1000000, destinationCity=, destinationRadiusKm=10, excludedKeywords=[], destinationKeywords=[가정동, 가좌동, 가학동, 간석동, 갈산동, 갈현동, 거모동, 경동, 경안동, 계수동, 고등동, 고잔동, 과림동, 관교동, 관동, 관양동, 괴안동, 구산동, 구월동, 금곡동, 금토동, 남촌동, 내동, 노온사동, 논현동, 답동, 대야동, 도당동, 도림동, 도원동, 도창동, 도촌동, 도화동, 동춘동, 둔전동, 만석동, 만수동, 매화동, 문원동, 문학동, 미산동, 박달동, 방산동, 배곧동, 범박동, 부개동, 부평동, 북성동, 비산동, 사동, 사송동, 산곡동, 삼동, 삼산동, 삼정동, 삼평동, 상대원동, 상동, 서운동, 서창동, 석남동, 석수동, 석운동, 선린동, 선학동, 선화동, 성남동, 소사동, 소사본동, 소하동, 송내동, 송도동, 송림동, 송월동, 송정동, 송학동, 송현동, 수산동, 숭의동, 시흥동, 신림동, 신생동, 신천동, 신포동, 신현동, 신흥동, 심곡동, 심곡본동, 십정동, 쌍령동, 안양동, 안현동, 야탑동, 약대동, 양벌동, 여수동, 역곡동, 역동, 연수동, 옥길동, 옥련동, 용동, 용현동, 운연동, 운중동, 원미동, 원창동, 월곶동, 유동, 율목동, 은행동, 인현동, 일신동, 일직동, 작전동, 장곡동, 장수동, 장지동, 장현동, 전동, 정왕동, 주안동, 중대동, 중동, 중앙동, 직동, 창영동, 청계동, 청라동, 청천동, 청학동, 초월읍, 춘의동, 탄벌동, 태전동, 판교동, 포동, 포일동, 하대원동, 하중동, 학의동, 학익동, 항동, 해안동, 화수동, 화평동, 회덕동, 효성동], customCityFilters=[금천구, 금천, 관악구, 관악, 중구, 중, 동구, 동, 미추홀구, 미추홀, 연수구, 연수, 남동구, 남동, 부평구, 부평, 계양구, 계양, 서구, 서, 성남시 수정구, 성남시 수정, 성남시 중원구, 성남시 중원, 성남시 분당구, 성남시 분당, 안양시 만안구, 안양시 만안, 안양시 동안구, 안양시 동안, 부천시 원미구, 부천시 원미, 부천시 소사구, 부천시 소사, 부천시 오정구, 부천시 오정, 광명시, 광명, 과천시, 과천, 시흥시, 시흥, 의왕시, 의왕, 광주시, 광주, 경기 광주, 경기 광주시, 경광주], destinationGroups={금천구=[시흥동], 관악구=[신림동], 중구=[경동, 관동, 내동, 답동, 도원동, 북성동, 사동, 선린동, 선화동, 송월동, 송학동, 신생동, 신포동, 신흥동, 용동, 유동, 율목동, 인현동, 전동, 중앙동, 항동, 해안동], 동구=[금곡동, 만석동, 송림동, 송현동, 창영동, 화수동, 화평동], 미추홀구=[관교동, 도화동, 문학동, 숭의동, 용현동, 주안동, 학익동], 연수구=[동춘동, 선학동, 송도동, 연수동, 옥련동, 청학동], 남동구=[간석동, 고잔동, 구월동, 남촌동, 논현동, 도림동, 만수동, 서창동, 수산동, 운연동, 장수동], 부평구=[갈산동, 구산동, 부개동, 부평동, 산곡동, 삼산동, 십정동, 일신동, 청천동], 계양구=[서운동, 작전동, 효성동], 서구=[가정동, 가좌동, 석남동, 신현동, 원창동, 청라동], 성남시 수정구=[고등동, 금토동, 둔전동, 사송동, 시흥동], 성남시 중원구=[갈현동, 도촌동, 상대원동, 성남동, 여수동, 하대원동], 성남시 분당구=[삼평동, 석운동, 야탑동, 운중동, 판교동], 안양시 만안구=[박달동, 석수동, 안양동], 안양시 동안구=[관양동, 비산동], 부천시 원미구=[도당동, 상동, 소사동, 심곡동, 약대동, 역곡동, 원미동, 중동, 춘의동], 부천시 소사구=[계수동, 괴안동, 범박동, 소사본동, 송내동, 심곡본동, 옥길동], 부천시 오정구=[삼정동], 광명시=[가학동, 노온사동, 소하동, 일직동], 과천?
    ```

    </details>
- `🚦 [ROADMAP 02:49:36.793] [📱앱] '취소' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 02:49:36.796] [📱앱] [DETAIL_CONFIRMED] '취소' 클릭 후 인성 Socket 취소 지시`
- `🚦 [ROADMAP 02:49:36.848] [📱앱] 버튼 터치 완료 (가로채기 성공) X:950.0, Y:478.0`
- `🚦 [ROADMAP 02:49:37.054] [📱앱] [LIST] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:49:37.060] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(다)=✅ 도착지(148중 강남구)=❌ 요금(0 <= 50000)=✅ 상차지/거리(999 >= 0.2km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 02:49:37.062] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(라)=✅ 도착지(148중 유성구)=❌ 요금(0 <= 188000)=✅ 상차지/거리(999 >= 0.2km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 02:49:37.365] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 2)`
- `🚦 [ROADMAP 02:49:37.376] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 2)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    FilterConfig(allowedVehicleTypes=[다마스, 라보, 오토바이], isActive=true, isSharedMode=true, pickupRadiusKm=999, minFare=0, maxFare=1000000, destinationCity=, destinationRadiusKm=10, excludedKeywords=[], destinationKeywords=[가정동, 가좌동, 가학동, 간석동, 갈산동, 갈현동, 거모동, 경동, 경안동, 계수동, 고등동, 고잔동, 과림동, 관교동, 관동, 관양동, 괴안동, 구산동, 구월동, 금곡동, 금토동, 남촌동, 내동, 노온사동, 논현동, 답동, 대야동, 도당동, 도림동, 도원동, 도창동, 도촌동, 도화동, 동춘동, 둔전동, 만석동, 만수동, 매화동, 문원동, 문학동, 미산동, 박달동, 방산동, 배곧동, 범박동, 부개동, 부평동, 북성동, 비산동, 사동, 사송동, 산곡동, 삼동, 삼산동, 삼정동, 삼평동, 상대원동, 상동, 서운동, 서창동, 석남동, 석수동, 석운동, 선린동, 선학동, 선화동, 성남동, 소사동, 소사본동, 소하동, 송내동, 송도동, 송림동, 송월동, 송정동, 송학동, 송현동, 수산동, 숭의동, 시흥동, 신림동, 신생동, 신천동, 신포동, 신현동, 신흥동, 심곡동, 심곡본동, 십정동, 쌍령동, 안양동, 안현동, 야탑동, 약대동, 양벌동, 여수동, 역곡동, 역동, 연수동, 옥길동, 옥련동, 용동, 용현동, 운연동, 운중동, 원미동, 원창동, 월곶동, 유동, 율목동, 은행동, 인현동, 일신동, 일직동, 작전동, 장곡동, 장수동, 장지동, 장현동, 전동, 정왕동, 주안동, 중대동, 중동, 중앙동, 직동, 창영동, 청계동, 청라동, 청천동, 청학동, 초월읍, 춘의동, 탄벌동, 태전동, 판교동, 포동, 포일동, 하대원동, 하중동, 학의동, 학익동, 항동, 해안동, 화수동, 화평동, 회덕동, 효성동], customCityFilters=[금천구, 금천, 관악구, 관악, 중구, 중, 동구, 동, 미추홀구, 미추홀, 연수구, 연수, 남동구, 남동, 부평구, 부평, 계양구, 계양, 서구, 서, 성남시 수정구, 성남시 수정, 성남시 중원구, 성남시 중원, 성남시 분당구, 성남시 분당, 안양시 만안구, 안양시 만안, 안양시 동안구, 안양시 동안, 부천시 원미구, 부천시 원미, 부천시 소사구, 부천시 소사, 부천시 오정구, 부천시 오정, 광명시, 광명, 과천시, 과천, 시흥시, 시흥, 의왕시, 의왕, 광주시, 광주, 경기 광주, 경기 광주시, 경광주], destinationGroups={금천구=[시흥동], 관악구=[신림동], 중구=[경동, 관동, 내동, 답동, 도원동, 북성동, 사동, 선린동, 선화동, 송월동, 송학동, 신생동, 신포동, 신흥동, 용동, 유동, 율목동, 인현동, 전동, 중앙동, 항동, 해안동], 동구=[금곡동, 만석동, 송림동, 송현동, 창영동, 화수동, 화평동], 미추홀구=[관교동, 도화동, 문학동, 숭의동, 용현동, 주안동, 학익동], 연수구=[동춘동, 선학동, 송도동, 연수동, 옥련동, 청학동], 남동구=[간석동, 고잔동, 구월동, 남촌동, 논현동, 도림동, 만수동, 서창동, 수산동, 운연동, 장수동], 부평구=[갈산동, 구산동, 부개동, 부평동, 산곡동, 삼산동, 십정동, 일신동, 청천동], 계양구=[서운동, 작전동, 효성동], 서구=[가정동, 가좌동, 석남동, 신현동, 원창동, 청라동], 성남시 수정구=[고등동, 금토동, 둔전동, 사송동, 시흥동], 성남시 중원구=[갈현동, 도촌동, 상대원동, 성남동, 여수동, 하대원동], 성남시 분당구=[삼평동, 석운동, 야탑동, 운중동, 판교동], 안양시 만안구=[박달동, 석수동, 안양동], 안양시 동안구=[관양동, 비산동], 부천시 원미구=[도당동, 상동, 소사동, 심곡동, 약대동, 역곡동, 원미동, 중동, 춘의동], 부천시 소사구=[계수동, 괴안동, 범박동, 소사본동, 송내동, 심곡본동, 옥길동], 부천시 오정구=[삼정동], 광명시=[가학동, 노온사동, 소하동, 일직동], 과천?
    ```

    </details>
- `[ROADMAP 02:49:38.789] [🖥️관제웹] [관제대시보드] [Socket] 취소 전달`
- `[ROADMAP 02:49:38.790] [☁️서버] [HTTP 폴링] 응답 /orders/detail 취소 정보 전송`
- `[ROADMAP 02:49:38.792] [☁️서버] 첫콜 필터로 설정값 업데이트`
- `[ROADMAP 02:49:38.832] [🖥️관제웹] [관제대시보드] 🔴 [웹 수신] order-canceled | ID: 40243789`
- `[ROADMAP 02:49:39.071] [☁️서버] [HTTP 폴링] POST /api/scrap (User: 66176c7b-1755-444c-9b65-7ca056e3c303)`
- `[ROADMAP 02:49:39.937] [☁️서버] [HTTP 폴링] POST /api/scrap (User: 66176c7b-1755-444c-9b65-7ca056e3c303)`
- `🚦 [ROADMAP 02:49:40.262] [📱앱] [LIST] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:49:40.265] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(1t)=❌ 도착지(148중 문발동)=❌ 요금(0 <= 101000)=✅ 상차지/거리(999 >= 0.2km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 02:49:40.571] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 1)`
- `🚦 [ROADMAP 02:49:40.588] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    FilterConfig(allowedVehicleTypes=[다마스, 라보, 오토바이], isActive=true, isSharedMode=true, pickupRadiusKm=999, minFare=0, maxFare=1000000, destinationCity=, destinationRadiusKm=10, excludedKeywords=[], destinationKeywords=[가정동, 가좌동, 가학동, 간석동, 갈산동, 갈현동, 거모동, 경동, 경안동, 계수동, 고등동, 고잔동, 과림동, 관교동, 관동, 관양동, 괴안동, 구산동, 구월동, 금곡동, 금토동, 남촌동, 내동, 노온사동, 논현동, 답동, 대야동, 도당동, 도림동, 도원동, 도창동, 도촌동, 도화동, 동춘동, 둔전동, 만석동, 만수동, 매화동, 문원동, 문학동, 미산동, 박달동, 방산동, 배곧동, 범박동, 부개동, 부평동, 북성동, 비산동, 사동, 사송동, 산곡동, 삼동, 삼산동, 삼정동, 삼평동, 상대원동, 상동, 서운동, 서창동, 석남동, 석수동, 석운동, 선린동, 선학동, 선화동, 성남동, 소사동, 소사본동, 소하동, 송내동, 송도동, 송림동, 송월동, 송정동, 송학동, 송현동, 수산동, 숭의동, 시흥동, 신림동, 신생동, 신천동, 신포동, 신현동, 신흥동, 심곡동, 심곡본동, 십정동, 쌍령동, 안양동, 안현동, 야탑동, 약대동, 양벌동, 여수동, 역곡동, 역동, 연수동, 옥길동, 옥련동, 용동, 용현동, 운연동, 운중동, 원미동, 원창동, 월곶동, 유동, 율목동, 은행동, 인현동, 일신동, 일직동, 작전동, 장곡동, 장수동, 장지동, 장현동, 전동, 정왕동, 주안동, 중대동, 중동, 중앙동, 직동, 창영동, 청계동, 청라동, 청천동, 청학동, 초월읍, 춘의동, 탄벌동, 태전동, 판교동, 포동, 포일동, 하대원동, 하중동, 학의동, 학익동, 항동, 해안동, 화수동, 화평동, 회덕동, 효성동], customCityFilters=[금천구, 금천, 관악구, 관악, 중구, 중, 동구, 동, 미추홀구, 미추홀, 연수구, 연수, 남동구, 남동, 부평구, 부평, 계양구, 계양, 서구, 서, 성남시 수정구, 성남시 수정, 성남시 중원구, 성남시 중원, 성남시 분당구, 성남시 분당, 안양시 만안구, 안양시 만안, 안양시 동안구, 안양시 동안, 부천시 원미구, 부천시 원미, 부천시 소사구, 부천시 소사, 부천시 오정구, 부천시 오정, 광명시, 광명, 과천시, 과천, 시흥시, 시흥, 의왕시, 의왕, 광주시, 광주, 경기 광주, 경기 광주시, 경광주], destinationGroups={금천구=[시흥동], 관악구=[신림동], 중구=[경동, 관동, 내동, 답동, 도원동, 북성동, 사동, 선린동, 선화동, 송월동, 송학동, 신생동, 신포동, 신흥동, 용동, 유동, 율목동, 인현동, 전동, 중앙동, 항동, 해안동], 동구=[금곡동, 만석동, 송림동, 송현동, 창영동, 화수동, 화평동], 미추홀구=[관교동, 도화동, 문학동, 숭의동, 용현동, 주안동, 학익동], 연수구=[동춘동, 선학동, 송도동, 연수동, 옥련동, 청학동], 남동구=[간석동, 고잔동, 구월동, 남촌동, 논현동, 도림동, 만수동, 서창동, 수산동, 운연동, 장수동], 부평구=[갈산동, 구산동, 부개동, 부평동, 산곡동, 삼산동, 십정동, 일신동, 청천동], 계양구=[서운동, 작전동, 효성동], 서구=[가정동, 가좌동, 석남동, 신현동, 원창동, 청라동], 성남시 수정구=[고등동, 금토동, 둔전동, 사송동, 시흥동], 성남시 중원구=[갈현동, 도촌동, 상대원동, 성남동, 여수동, 하대원동], 성남시 분당구=[삼평동, 석운동, 야탑동, 운중동, 판교동], 안양시 만안구=[박달동, 석수동, 안양동], 안양시 동안구=[관양동, 비산동], 부천시 원미구=[도당동, 상동, 소사동, 심곡동, 약대동, 역곡동, 원미동, 중동, 춘의동], 부천시 소사구=[계수동, 괴안동, 범박동, 소사본동, 송내동, 심곡본동, 옥길동], 부천시 오정구=[삼정동], 광명시=[가학동, 노온사동, 소하동, 일직동], 과천?
    ```

    </details>
- `[ROADMAP 02:49:43.146] [☁️서버] [HTTP 폴링] POST /api/scrap (User: 66176c7b-1755-444c-9b65-7ca056e3c303)`
- `🚦 [ROADMAP 02:49:45.268] [📱앱] [LIST] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:49:45.280] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(라)=✅ 도착지(148중 송파구)=❌ 요금(0 <= 34000)=✅ 상차지/거리(999 >= 0.2km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 02:49:45.585] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 1)`
- `🚦 [ROADMAP 02:49:45.598] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    FilterConfig(allowedVehicleTypes=[다마스, 라보, 오토바이], isActive=true, isSharedMode=true, pickupRadiusKm=999, minFare=0, maxFare=1000000, destinationCity=, destinationRadiusKm=10, excludedKeywords=[], destinationKeywords=[가정동, 가좌동, 가학동, 간석동, 갈산동, 갈현동, 거모동, 경동, 경안동, 계수동, 고등동, 고잔동, 과림동, 관교동, 관동, 관양동, 괴안동, 구산동, 구월동, 금곡동, 금토동, 남촌동, 내동, 노온사동, 논현동, 답동, 대야동, 도당동, 도림동, 도원동, 도창동, 도촌동, 도화동, 동춘동, 둔전동, 만석동, 만수동, 매화동, 문원동, 문학동, 미산동, 박달동, 방산동, 배곧동, 범박동, 부개동, 부평동, 북성동, 비산동, 사동, 사송동, 산곡동, 삼동, 삼산동, 삼정동, 삼평동, 상대원동, 상동, 서운동, 서창동, 석남동, 석수동, 석운동, 선린동, 선학동, 선화동, 성남동, 소사동, 소사본동, 소하동, 송내동, 송도동, 송림동, 송월동, 송정동, 송학동, 송현동, 수산동, 숭의동, 시흥동, 신림동, 신생동, 신천동, 신포동, 신현동, 신흥동, 심곡동, 심곡본동, 십정동, 쌍령동, 안양동, 안현동, 야탑동, 약대동, 양벌동, 여수동, 역곡동, 역동, 연수동, 옥길동, 옥련동, 용동, 용현동, 운연동, 운중동, 원미동, 원창동, 월곶동, 유동, 율목동, 은행동, 인현동, 일신동, 일직동, 작전동, 장곡동, 장수동, 장지동, 장현동, 전동, 정왕동, 주안동, 중대동, 중동, 중앙동, 직동, 창영동, 청계동, 청라동, 청천동, 청학동, 초월읍, 춘의동, 탄벌동, 태전동, 판교동, 포동, 포일동, 하대원동, 하중동, 학의동, 학익동, 항동, 해안동, 화수동, 화평동, 회덕동, 효성동], customCityFilters=[금천구, 금천, 관악구, 관악, 중구, 중, 동구, 동, 미추홀구, 미추홀, 연수구, 연수, 남동구, 남동, 부평구, 부평, 계양구, 계양, 서구, 서, 성남시 수정구, 성남시 수정, 성남시 중원구, 성남시 중원, 성남시 분당구, 성남시 분당, 안양시 만안구, 안양시 만안, 안양시 동안구, 안양시 동안, 부천시 원미구, 부천시 원미, 부천시 소사구, 부천시 소사, 부천시 오정구, 부천시 오정, 광명시, 광명, 과천시, 과천, 시흥시, 시흥, 의왕시, 의왕, 광주시, 광주, 경기 광주, 경기 광주시, 경광주], destinationGroups={금천구=[시흥동], 관악구=[신림동], 중구=[경동, 관동, 내동, 답동, 도원동, 북성동, 사동, 선린동, 선화동, 송월동, 송학동, 신생동, 신포동, 신흥동, 용동, 유동, 율목동, 인현동, 전동, 중앙동, 항동, 해안동], 동구=[금곡동, 만석동, 송림동, 송현동, 창영동, 화수동, 화평동], 미추홀구=[관교동, 도화동, 문학동, 숭의동, 용현동, 주안동, 학익동], 연수구=[동춘동, 선학동, 송도동, 연수동, 옥련동, 청학동], 남동구=[간석동, 고잔동, 구월동, 남촌동, 논현동, 도림동, 만수동, 서창동, 수산동, 운연동, 장수동], 부평구=[갈산동, 구산동, 부개동, 부평동, 산곡동, 삼산동, 십정동, 일신동, 청천동], 계양구=[서운동, 작전동, 효성동], 서구=[가정동, 가좌동, 석남동, 신현동, 원창동, 청라동], 성남시 수정구=[고등동, 금토동, 둔전동, 사송동, 시흥동], 성남시 중원구=[갈현동, 도촌동, 상대원동, 성남동, 여수동, 하대원동], 성남시 분당구=[삼평동, 석운동, 야탑동, 운중동, 판교동], 안양시 만안구=[박달동, 석수동, 안양동], 안양시 동안구=[관양동, 비산동], 부천시 원미구=[도당동, 상동, 소사동, 심곡동, 약대동, 역곡동, 원미동, 중동, 춘의동], 부천시 소사구=[계수동, 괴안동, 범박동, 소사본동, 송내동, 심곡본동, 옥길동], 부천시 오정구=[삼정동], 광명시=[가학동, 노온사동, 소하동, 일직동], 과천?
    ```

    </details>
- `[ROADMAP 02:49:48.159] [☁️서버] [HTTP 폴링] POST /api/scrap (User: 66176c7b-1755-444c-9b65-7ca056e3c303)`
- `🚦 [ROADMAP 02:49:50.280] [📱앱] [LIST] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:49:50.284] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(1t)=❌ 도착지(148중 야당동)=❌ 요금(0 <= 96000)=✅ 상차지/거리(999 >= 11.9km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 02:49:50.591] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 1)`
- `🚦 [ROADMAP 02:49:53.862] [📱앱] [LIST] 📡 화면 변경 감지 | 모드: AUTO`
- `🚦 [ROADMAP 02:49:54.066] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`
- `🚦 [ROADMAP 02:50:54.077] [📱앱] [LIST] [post /api/scrap request] ⏱️ 타이머 생존신고 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`
