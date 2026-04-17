# 🗺️ 1DAL 풀 스택 라이프사이클 로그 매핑 리포트 (0416_2206 Full Data)

---


### 🟢 [STEP 1] 관제탑 서버 기동 및 필터 동기화
*(시작 기준 시간: 00:00:00.000)*


    <details>
    <summary>🔽 - ⚠️ 패널티 결과: +37.5km, +48분 '똥' (현위치접근: 6.2km, 14분)</summary>

    ```json
       - ⚠️ 패널티 결과: +37.5km, +48분 '똥' (현위치접근: 6.2km, 14분)
    ```

    </details>
- `[ROADMAP 22:19:08.842] [🖥️관제웹] 1DAL 웹(관제웹) 시작, 로그인`
- `[ROADMAP 22:19:08.843] [🖥️관제웹] 1DAL 웹(관제웹) 시작, 로그인`

    <details>
    <summary>🔽 [GPS] 현위치 갱신됨: {x: 127.29435698678388, y: 37.376590054530546}</summary>

    ```json
    [GPS] 현위치 갱신됨: {x: 127.29435698678388, y: 37.376590054530546}
    [GPS] 현위치 갱신됨: {x: 127.29435698678388, y: 37.376590054530546}
    ```

    </details>
- `[ROADMAP 22:19:37.196] [🖥️관제웹] [관제대시보드] 🟢 [웹 수신] order-evaluating | ID: a30d39aa | 기기: 앱폰-sdk_gpho-160 | 전표 → 신규`
- `[ROADMAP 22:19:37.196] [🖥️관제웹] [관제대시보드] 확정페이지 진입 (선빵 수신으로 상세 모드 구동)`
- `[ROADMAP 22:19:38.237] [🖥️관제웹] [관제대시보드] 🟡 [웹 수신] order-detail-received | ID: a30d39aa | 경기 광주시 송정동 행정타운로 50`

    <details>
    <summary>🔽 🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.</summary>

    ```json
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    ```

    </details>
- `[ROADMAP 22:19:38.922] [🖥️관제웹] [관제대시보드] 🔵 [웹 수신] order-evaluated | ID: a30d39aa | 단독 100.9km, 83분 '콜'`
- `[ROADMAP 22:19:38.923] [🖥️관제웹] [관제대시보드] 추천 결과 노출, 경로보기버튼 추가 노출 후 판단 (취소 or 닫기) 대기`

### 🟢 [STEP 6] 관제탑 결재 (취소 vs 유지)
*(시작 기준 시간: 07:19:38.923)*


    <details>
    <summary>🔽 👆 [사용자 클릭] 프론트에서 '유지 확정' 버튼 클릭 (ID: a30d39aa-6b3b-4bbe-bcd0-1d860263ae63)</summary>

    ```json
    👆 [사용자 클릭] 프론트에서 '유지 확정' 버튼 클릭 (ID: a30d39aa-6b3b-4bbe-bcd0-1d860263ae63)
    ```

    </details>
- `[ROADMAP 22:19:41.820] [🖥️관제웹] [관제대시보드] [Socket] 유지 전달`
- `[ROADMAP 22:19:42.779] [🖥️관제웹] [관제대시보드] 🟢 [웹 수신] order-evaluating | ID: 1286f54f | 기기: 앱폰-sdk_gpho-160 | 전표 → 신규`
- `[ROADMAP 22:19:42.779] [🖥️관제웹] [관제대시보드] 확정페이지 진입 (선빵 수신으로 상세 모드 구동)`
- `[ROADMAP 22:19:43.788] [🖥️관제웹] [관제대시보드] 🟡 [웹 수신] order-detail-received | ID: 1286f54f | 경기 광주시 경안동 493-4 이마트`

    <details>
    <summary>🔽 🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.</summary>

    ```json
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    ```

    </details>
- `[ROADMAP 22:19:46.347] [🖥️관제웹] [관제대시보드] 🔵 [웹 수신] order-evaluated | ID: 1286f54f | +542.9km, +371분 '똥'`
- `[ROADMAP 22:19:46.349] [🖥️관제웹] [관제대시보드] 추천 결과 노출, 경로보기버튼 추가 노출 후 판단 (취소 or 닫기) 대기`
- `[ROADMAP 22:19:48.540] [🖥️관제웹] [관제대시보드] [Socket] 취소 전달`
- `[ROADMAP 22:19:48.554] [🖥️관제웹] [관제대시보드] 🔴 [웹 수신] order-canceled | ID: 1286f54f`

    <details>
    <summary>🔽 🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.</summary>

    ```json
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    ```

    </details>
- `[ROADMAP 22:19:57.150] [🖥️관제웹] [관제대시보드] 🟢 [웹 수신] order-evaluating | ID: fe5545cf | 기기: 앱폰-sdk_gpho-160 | 전표 → 신규`
- `[ROADMAP 22:19:57.151] [🖥️관제웹] [관제대시보드] 확정페이지 진입 (선빵 수신으로 상세 모드 구동)`
- `[ROADMAP 22:19:58.127] [🖥️관제웹] [관제대시보드] 🟡 [웹 수신] order-detail-received | ID: fe5545cf | 경기 광주시 경안동 165-15 농협`

    <details>
    <summary>🔽 🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.</summary>

    ```json
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    ```

    </details>
- `[ROADMAP 22:19:59.476] [🖥️관제웹] [관제대시보드] 🔵 [웹 수신] order-evaluated | ID: fe5545cf | +1.5km, +11분 '꿀'`
- `[ROADMAP 22:19:59.477] [🖥️관제웹] [관제대시보드] 추천 결과 노출, 경로보기버튼 추가 노출 후 판단 (취소 or 닫기) 대기`

    <details>
    <summary>🔽 👆 [사용자 클릭] 프론트에서 '유지 확정' 버튼 클릭 (ID: fe5545cf-4575-4e70-a433-0dfab4020ce4)</summary>

    ```json
    👆 [사용자 클릭] 프론트에서 '유지 확정' 버튼 클릭 (ID: fe5545cf-4575-4e70-a433-0dfab4020ce4)
    ```

    </details>
- `[ROADMAP 22:20:04.666] [🖥️관제웹] [관제대시보드] [Socket] 유지 전달`

    <details>
    <summary>🔽 🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.</summary>

    ```json
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    ```

    </details>
- `[ROADMAP 22:20:07.263] [🖥️관제웹] [관제대시보드] 🟢 [웹 수신] order-evaluating | ID: 4f14e2ea | 기기: 앱폰-sdk_gpho-160 | 전표 → 신규`
- `[ROADMAP 22:20:07.263] [🖥️관제웹] [관제대시보드] 확정페이지 진입 (선빵 수신으로 상세 모드 구동)`

    <details>
    <summary>🔽 🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.</summary>

    ```json
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    ```

    </details>
- `[ROADMAP 22:20:07.961] [🖥️관제웹] [관제대시보드] 🟡 [웹 수신] order-detail-received | ID: 4f14e2ea | 경기 성남시 분당구 정자일로 95 네`

    <details>
    <summary>🔽 🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.</summary>

    ```json
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    ```

    </details>
- `[ROADMAP 22:20:09.298] [☁️서버] [Socket] 경로 및 시간 정보, 수익률 전송`

    <details>
    <summary>🔽 🔎 [카카오 연산 완료] +37.5km, +48분 '똥' (기기: 앱폰-sdk_gpho-160) | Polyline 길이: 1433</summary>

    ```json
    🔎 [카카오 연산 완료] +37.5km, +48분 '똥' (기기: 앱폰-sdk_gpho-160) | Polyline 길이: 1433
    ```

    </details>
- `[ROADMAP 22:20:09.302] [🖥️관제웹] [관제대시보드] 🔵 [웹 수신] order-evaluated | ID: 4f14e2ea | +37.5km, +48분 '똥'`
- `[ROADMAP 22:20:09.303] [🖥️관제웹] [관제대시보드] 추천 결과 노출, 경로보기버튼 추가 노출 후 판단 (취소 or 닫기) 대기`
- `[ROADMAP 22:20:12.276] [🖥️관제웹] [관제대시보드] [Socket] 취소 전달`
- `[ROADMAP 22:20:12.278] [☁️서버] [HTTP 폴링] 응답 /orders/detail 취소 정보 전송`
- `[ROADMAP 22:20:12.279] [☁️서버] 첫콜 필터로 설정값 업데이트`
- `[ROADMAP 22:20:12.279] [☁️서버] [Socket] 첫콜 필터 전송 (UI 대기화면 복구)`
- `[ROADMAP 22:20:12.292] [🖥️관제웹] [관제대시보드] 🔴 [웹 수신] order-canceled | ID: 4f14e2ea`

    <details>
    <summary>🔽 🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.</summary>

    ```json
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    ```

    </details>
- `[ROADMAP 22:20:13.339] [☁️서버] [HTTP 폴링] POST /api/scrap (아이디 및 상태 전송 수신)`

    <details>
    <summary>🔽 📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [...</summary>

    ```json
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
       └─ [data][0] 상세 정보:
    {
      "dropoff": "해운대구",
      "fare": 465000,
      "id": "50283290-38b2-49bb-a3d4-8efb01e1f531",
      "pickup": "실촌읍",
      "pickupDistance": 5,
      "rawText": "5.0, 301.2, @, 실촌읍, 해운대구, 다, 46.5",
      "timestamp": "2026-04-16T22:20:12Z",
      "type": "NEW_ORDER",
      "vehicleType": "다"
    }
    ```

    </details>
- `[ROADMAP 22:20:13.340] [☁️서버] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`
- `[ROADMAP 22:20:17.258] [☁️서버] [HTTP 폴링] POST /api/scrap (아이디 및 상태 전송 수신)`

    <details>
    <summary>🔽 📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [...</summary>

    ```json
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
       └─ [data][0] 상세 정보:
    {
      "dropoff": "광진구",
      "fare": 60000,
      "id": "eaeaf6bf-e1df-411b-a13c-858488854ee8",
      "pickup": "곤지암읍",
      "pickupDistance": 12.3,
      "rawText": "12.3, 31.9, 급송/곤지암읍, 광진구, 라, 6.0",
      "scheduleText": "급송",
      "timestamp": "2026-04-16T22:20:16Z",
      "type": "NEW_ORDER",
      "vehicleType": "라"
    }
    ```

    </details>
- `[ROADMAP 22:20:17.258] [☁️서버] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`
- `[ROADMAP 22:20:22.294] [☁️서버] [HTTP 폴링] POST /api/scrap (아이디 및 상태 전송 수신)`

    <details>
    <summary>🔽 📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [...</summary>

    ```json
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
       └─ [data][0] 상세 정보:
    {
      "dropoff": "부평구",
      "fare": 79000,
      "id": "807b8ba5-9b72-4cd2-9ea6-82ccaacba0ef",
      "pickup": "오포읍",
      "pickupDistance": 5,
      "rawText": "5.0, 45.2, @, 오포읍, 부평구, 다, 7.9",
      "timestamp": "2026-04-16T22:20:21Z",
      "type": "NEW_ORDER",
      "vehicleType": "다"
    }
    ```

    </details>
- `[ROADMAP 22:20:22.294] [☁️서버] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`
- `[ROADMAP 22:20:23.564] [🖥️관제웹] 필터 설정(첫콜) 및 서버 소켓 전송`
- `[ROADMAP 22:20:23.566] [☁️서버] [Socket] 첫콜 필터 설정값 전송 (서버 필터 세팅 업데이트)`

    <details>
    <summary>🔽 {</summary>

    ```json
    {
      "allowedVehicleTypes": [
        "다마스",
        "라보",
        "오토바이"
      "isActive": true,
      "isSharedMode": true,
      "pickupRadiusKm": 30,
      "minFare": 35000,
      "maxFare": 1000000,
      "excludedKeywords": "착불,수거,까대기,전화금지,타일",
      "destinationCity": "파주시",
      "destinationRadiusKm": 10,
      "destinationKeywords": "가능동, 가락동, 가양동, 가좌동, 갈매동, 갈현동, 감북동, 감이동, 감일동, 감정동, 강매동, 강일동, 강하면, 개화동, 거여동, 걸포동, 검산동, 검암동, 경안동, 계산동, 고강동, 고덕동, 고산동, 고양동, 고읍동, 고촌읍, 곤지암읍, 공릉동, 공항동, 과해동, 관산동, 광사동, 광암동, 광장동, 광적면, 광탄면, 교문동, 교산동, 교하동, 구기동, 구래동, 구산동, 구의동, 군자동, 귤현동, 금곡동, 금광동, 금릉동, 금오동, 금촌동, 길동, 길음동, 낙양동, 남가좌동, 남방동, 남종면, 남한산성면, 내곡동, 내발산동, 내유동, 노오지동, 녹번동, 녹양동, 능동, 능평동, 다남동, 다산동, 다율동, 단대동, 답십리동, 당정동, 당하동, 대곡동, 대곶면, 대자동, 대장동, 대조동, 대화동, 덕계동, 덕은동, 덕이동, 덕풍동, 도내동, 도농동, 도봉동, 도척면, 도촌동, 돈암동, 동산동, 동양동, 동패동, 둑실동, 둔촌동, 등촌동, 마곡동, 마두동, 마산동, 마장동, 마전동, 마천동, 만송동, 망우동, 망월동, 매산동, 맥금동, 면목동, 명일동, 모현읍, 목동, 목동동, 목상동, 목현동, 묵동, 문발동, 문봉동, 문산읍, 문정동, 문형동, 미사동, 미아동, 민락동, 박촌동, 방이동, 방축동, 방학동, 방화동, 배알미동, 백석동, 백석읍, 번동, 법곳동, 벽제동, 별내동, 별내면, 병방동, 복정동, 부암동, 북가좌동, 북변동, 북한동, 분당동, 불광동, 불로동, 사근동, 사노동, 사리현동, 사우동, 산곡동, 산남동, 산북동, 산북면, 산성동, 산황동, 삼동, 삼송동, 삼전동, 삼정동, 삼패동, 상계동, 상대원동, 상봉동, 상사창동, 상산곡동, 상암동, 상야동, 상월곡동, 상일동, 상지석동, 서운동, 서패동, 서현동, 석관동, 석촌동, 선동, 선유동, 선주지동, 설문동, 성남동, 성내동, 성사동, 성산동, 성석동, 성수동, 세곡동, 소흘읍, 송정동, 송촌동, 송파동, 수색동, 수서동, 수석동, 수유동, 수진동, 수택동, 시천동, 식사동, 신곡동, 신내동, 신둔면, 신사동, 신영동, 신원동, 신월동, 신장동, 신천동, 신촌동, 신평동, 신현동, 신흥동, 쌍령동, 쌍문동, 아동동, 아천동, 안암동, 암사동, 야당동, 야동동, 야탑동, 양벌동, 양서면, 양지동, 양지읍, 양촌읍, 어둔동, 여수동, 역동, 역촌동, 연다산동, 염창동, 오곡동, 오금동, 오남읍, 오도동, 오류동, 오쇠동, 오정동, 와동동, 와부읍, 왕길동, 외발산동, 용답동, 용두동, 용종동, 용현동, 우이동, 운양동, 원당동, 원종동, 원흥동, 월계동, 월곶면, 월롱면, 유양동, 율동, 율현동, 은행동, 응암동, 의정부동, 이매동, 이문동, 이패동, 이화동, 인창동, 일산동, 일원동, 일패동, 임학동, 자곡동, 자양동, 자일동, 잠실동, 장기동, 장단면, 장안동, 장암동, 장위동, 장지동, 장항동, 장흥면, 전농동, 정릉동, 정발산동, 제기동, 조리읍, 조안면, 종암동, 주교동, 주엽동, 중계동, 중곡동, 중대동, 중산동, 중앙동, 중화동, 증산동, 지금동, 지영동, 지축동, 직동, 진건읍, 진관동, 진접읍, 창곡동, 창동, 창우동, 천현동, 천호동, 청량리동, 초월읍, 초이동, 초일동, 추자동, 춘궁동, 탄벌동, 탄현동, 탄현면, 태전동, 태평동, 토당동, 토평동, 통진읍, 퇴계원읍, 퇴촌면, 파주읍, 평내동, 평동, 평창동, 포곡읍, 풍납동, 풍동, 풍무동, 풍산동, 하계동, 하대원동, 하사창동, 하산곡동, 하성면, 하야동, 하월곡동, 하지석동, 학암동, 항동, 행신동, 행주내동, 행주외동, 향동동, 현천동, 호원동, 호평동, 홍은동, 홍제동, 홍지동, 화곡동, 화도읍, 화양동, 화전동, 화정동, 회기동, 회덕동, 효자동, 휘경동",
      "corridorRadiusKm": 10,
      "userOverrides": true,
      "customFilters": [],
      "destinationGroups": {
        "종로구": [
          "구기동",
          "부암동",
          "신영동",
          "평창동",
          "홍지동"
        "성동구": [
          "마장동",
          "사근동",
          "성수동",
          "송정동",
          "용답동"
        "광진구": [
          "광장동",
          "구의동",
          "군자동",
          "능동",
          "자양동",
          "중곡동",
          "화양동"
        "동대문구": [
          "답십리동",
          "용두동",
          "이문동",
          "장안동",
          "전농동",
          "제기동",
          "청량리동",
          "회기동",
          "휘경동"
        "중랑구": [
          "망우동",
          "면목동",
          "묵동",
          "상봉동",
          "신내동",
          "중화동"
        "성북구": [
          "길음동",
          "돈암동",
          "상월곡동",
          "석관동",
          "안암동",
          "장위동",
          "정릉동",
          "종암동",
          "하월곡동"
        "강북구": [
          "미아동",
          "번동",
          "수유동",
          "우이동"
        "도봉구": [
          "도봉동",
          "방학동",
          "쌍문동",
          "창동"
        "노원구": [
          "공릉동",
          "상계동",
          "월계동",
          "중계동",
          "하계동"
        "은평구": [
          "갈현동",
          "구산동",
          "녹번동",
          "대조동",
          "불광동",
          "수색동",
          "신사동",
          "역촌동",
          "응암동",
          "증산동",
          "진관동"
        "서대문구": [
          "남가좌동",
          "북가좌동",
          "홍은동",
          "홍제동"
        "마포구": [
          "상암동",
          "성산동"
        "양천구": [
          "목동",
          "신월동"
        "강서구": [
          "가양동",
          "개화동",
          "공항동",
          "과해동",
          "내발산동",
          "등촌동",
          "마곡동",
          "방화동",
          "염창동",
          "오곡동",
          "오쇠동",
          "외발산동",
          "화곡동"
        "강남구": [
          "세곡동",
          "수서동",
          "율현동",
          "일원동",
          "자곡동"
        "송파구": [
          "가락동",
          "거여동",
          "마천동",
          "문정동",
          "방이동",
          "삼전동",
          "석촌동",
          "송파동",
          "신천동",
          "오금동",
          "잠실동",
          "장지동",
          "풍납동"
        "강동구": [
          "강일동",
          "고덕동",
          "길동",
          "둔촌동",
          "명일동",
          "상일동",
          "성내동",
          "암사동",
          "천호동"
        "계양구": [
          "갈현동",
          "계산동",
          "귤현동",
          "노오지동",
          "다남동",
          "동양동",
          "둑실동",
          "목상동",
          "박촌동",
          "방축동",
          "병방동",
          "상야동",
          "서운동",
          "선주지동",
          "오류동",
          "용종동",
          "이화동",
          "임학동",
          "장기동",
          "평동",
          "하야동"
        "서구": [
          "검암동",
          "금곡동",
          "당하동",
          "대곡동",
          "마전동",
          "백석동",
          "불로동",
          "시천동",
          "오류동",
          "왕길동",
          "원당동"
        "성남시 수정구": [
          "단대동",
          "복정동",
          "산성동",
          "수진동",
          "신흥동",
          "양지동",
          "창곡동",
          "태평동"
        "성남시 중원구": [
          "갈현동",
          "금광동",
          "도촌동",
          "상대원동",
          "성남동",
          "여수동",
          "은행동",
          "중앙동",
          "하대원동"
        "성남시 분당구": [
          "분당동",
          "서현동",
          "야탑동",
          "율동",
          "이매동"
        "의정부시": [
          "가능동",
          "고산동",
          "금오동",
          "낙양동",
          "녹양동",
          "민락동",
          "산곡동",
          "신곡동",
          "용현동",
          "의정부동",
          "자일동",
          "장암동",
          "호원동"
        "부천시 오정구": [
          "고강동",
          "대장동",
          "삼정동",
          "오정동",
          "원종동"
        "고양시 덕양구": [
          "강매동",
          "고양동",
          "관산동",
          "내곡동",
          "내유동",
          "대자동",
          "대장동",
          "덕은동",
          "도내동",
          "동산동",
          "벽제동",
          "북한동",
          "삼송동",
          "선유동",
          "성사동",
          "신원동",
          "신평동",
          "오금동",
          "용두동",
          "원당동",
          "원흥동",
          "주교동",
          "지축동",
          "토당동",
          "행신동",
          "행주내동",
          "행주외동",
          "향동동",
          "현천동",
          "화전동",
          "화정동",
          "효자동"
        "고양시 일산동구": [
          "마두동",
          "문봉동",
          "백석동",
          "사리현동",
          "산황동",
          "설문동",
          "성석동",
          "식사동",
          "장항동",
          "정발산동",
          "중산동",
          "지영동",
          "풍동"
        "고양시 일산서구": [
          "가좌동",
          "구산동",
          "대화동",
          "덕이동",
          "법곳동",
          "일산동",
          "주엽동",
          "탄현동"
        "구리시": [
          "갈매동",
          "교문동",
          "사노동",
          "수택동",
          "아천동",
          "인창동",
          "토평동"
        "남양주시": [
          "금곡동",
          "다산동",
          "도농동",
          "별내동",
          "별내면",
          "삼패동",
          "수석동",
          "오남읍",
          "와부읍",
          "이패동",
          "일패동",
          "조안면",
          "지금동",
          "진건읍",
          "진접읍",
          "퇴계원읍",
          "평내동",
          "호평동",
          "화도읍"
        "하남시": [
          "감북동",
          "감이동",
          "감일동",
          "광암동",
          "교산동",
          "당정동",
          "덕풍동",
          "망월동",
          "미사동",
          "배알미동",
          "상사창동",
          "상산곡동",
          "선동",
          "신장동",
          "창우동",
          "천현동",
          "초이동",
          "초일동",
          "춘궁동",
          "풍산동",
          "하사창동",
          "하산곡동",
          "학암동",
          "항동"
        "파주시": [
          "검산동",
          "광탄면",
          "교하동",
          "금릉동",
          "금촌동",
          "다율동",
          "당하동",
          "동패동",
          "맥금동",
          "목동동",
          "문발동",
          "문산읍",
          "산남동",
          "상지석동",
          "서패동",
          "송촌동",
          "신촌동",
          "아동동",
          "야당동",
          "야동동",
          "연다산동",
          "오도동",
          "와동동",
          "월롱면",
          "장단면",
          "조리읍",
          "탄현면",
          "파주읍",
          "하지석동"
        "김포시": [
          "감정동",
          "걸포동",
          "고촌읍",
          "구래동",
          "대곶면",
          "마산동",
          "북변동",
          "사우동",
          "양촌읍",
          "운양동",
          "월곶면",
          "장기동",
          "통진읍",
          "풍무동",
          "하성면"
        "광주시": [
          "경안동",
          "고산동",
          "곤지암읍",
          "남종면",
          "남한산성면",
          "능평동",
          "도척면",
          "매산동",
          "목동",
          "목현동",
          "문형동",
          "삼동",
          "송정동",
          "신현동",
          "쌍령동",
          "양벌동",
          "역동",
          "장지동",
          "중대동",
          "직동",
          "초월읍",
          "추자동",
          "탄벌동",
          "태전동",
          "퇴촌면",
          "회덕동"
        "양주시": [
          "고읍동",
          "광사동",
          "광적면",
          "남방동",
          "덕계동",
          "마전동",
          "만송동",
          "백석읍",
          "산북동",
          "어둔동",
          "유양동",
          "장흥면"
        "용인시 처인구": [
          "모현읍",
          "양지읍",
          "포곡읍"
        "이천시": [
          "신둔면"
        "포천시": [
          "소흘읍"
        "여주시": [
          "산북면"
        "양평군": [
          "강하면",
          "양서면"
      }
    }
    ```

    </details>
- `[ROADMAP 22:20:27.269] [☁️서버] [HTTP 폴링] POST /api/scrap (아이디 및 상태 전송 수신)`

    <details>
    <summary>🔽 📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [...</summary>

    ```json
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
       └─ [data][0] 상세 정보:
    {
      "dropoff": "송정동",
      "fare": 30000,
      "id": "a7f928ae-a318-49f6-a36d-379cc3ecb7ee",
      "pickup": "경안동",
      "pickupDistance": 0.2,
      "rawText": "0.2, 1.9, 경안동, 송정동, 다, 3.0",
      "timestamp": "2026-04-16T22:20:26Z",
      "type": "NEW_ORDER",
      "vehicleType": "다"
    }
    ```

    </details>
- `[ROADMAP 22:20:27.269] [☁️서버] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`
- `[ROADMAP 22:20:32.281] [☁️서버] [HTTP 폴링] POST /api/scrap (아이디 및 상태 전송 수신)`

    <details>
    <summary>🔽 📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [...</summary>

    ```json
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
       └─ [data][0] 상세 정보:
    {
      "dropoff": "정왕동",
      "fare": 81000,
      "id": "efe3844e-ba44-4f5e-bea5-18d8deb63867",
      "pickup": "경안동",
      "pickupDistance": 0.2,
      "rawText": "0.2, 47.5, @, 오후2시7/경안동, 정왕동, 다, 8.1",
      "scheduleText": "오후2시7",
      "timestamp": "2026-04-16T22:20:31Z",
      "type": "NEW_ORDER",
      "vehicleType": "다"
    }
    ```

    </details>
- `[ROADMAP 22:20:32.281] [☁️서버] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`
- `[ROADMAP 22:20:37.291] [☁️서버] [HTTP 폴링] POST /api/scrap (아이디 및 상태 전송 수신)`

    <details>
    <summary>🔽 📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [...</summary>

    ```json
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
       └─ [data][0] 상세 정보:
    {
      "dropoff": "성북구",
      "fare": 61000,
      "id": "33a12012-2e0e-4089-873f-41cb93281f8c",
      "pickup": "초월읍",
      "pickupDistance": 5.1,
      "rawText": "5.1, 32.2, 오후2시52/초월읍, 성북구, 다, 6.1",
      "scheduleText": "오후2시52",
      "timestamp": "2026-04-16T22:20:36Z",
      "type": "NEW_ORDER",
      "vehicleType": "다"
    }
    ```

    </details>
- `[ROADMAP 22:20:37.292] [☁️서버] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`
- `[ROADMAP 22:20:42.283] [☁️서버] [HTTP 폴링] POST /api/scrap (아이디 및 상태 전송 수신)`

    <details>
    <summary>🔽 📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [...</summary>

    ```json
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
       └─ [data][0] 상세 정보:
    {
      "dropoff": "중구",
      "fare": 97000,
      "id": "3a81c6c9-8733-4c71-9277-0cab9e483c05",
      "pickup": "송정동",
      "pickupDistance": 1.9,
      "rawText": "1.9, 56.3, 송정동, 중구, 라, 9.7",
      "timestamp": "2026-04-16T22:20:41Z",
      "type": "NEW_ORDER",
      "vehicleType": "라"
    }
    ```

    </details>
- `[ROADMAP 22:20:42.284] [☁️서버] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`
- `[ROADMAP 22:20:47.287] [☁️서버] [HTTP 폴링] POST /api/scrap (아이디 및 상태 전송 수신)`

    <details>
    <summary>🔽 📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [...</summary>

    ```json
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
       └─ [data][0] 상세 정보:
    {
      "dropoff": "곤지암읍",
      "fare": 32000,
      "id": "537a2253-e4b8-429f-a460-baa154dcbc56",
      "pickup": "경안동",
      "pickupDistance": 0.2,
      "rawText": "0.2, 12.6, @, 경안동, 곤지암읍, 1t, 3.2",
      "timestamp": "2026-04-16T22:20:46Z",
      "type": "NEW_ORDER",
      "vehicleType": "1t"
    }
    ```

    </details>
- `[ROADMAP 22:20:47.287] [☁️서버] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`
- `[ROADMAP 22:20:52.270] [☁️서버] [HTTP 폴링] POST /api/scrap (아이디 및 상태 전송 수신)`

    <details>
    <summary>🔽 📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [...</summary>

    ```json
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
       └─ [data][0] 상세 정보:
    {
      "dropoff": "마포구",
      "fare": 70000,
      "id": "1e4226ff-2992-419d-928c-e48d3c8abfcc",
      "pickup": "경안동",
      "pickupDistance": 0.2,
      "rawText": "0.2, 37.4, 급송/경안동, 마포구, 다, 7.0",
      "scheduleText": "급송",
      "timestamp": "2026-04-16T22:20:51Z",
      "type": "NEW_ORDER",
      "vehicleType": "다"
    }
    ```

    </details>
- `[ROADMAP 22:20:52.270] [☁️서버] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`
- `[ROADMAP 22:20:57.330] [☁️서버] [HTTP 폴링] POST /api/scrap (아이디 및 상태 전송 수신)`

    <details>
    <summary>🔽 📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [...</summary>

    ```json
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
       └─ [data][0] 상세 정보:
    {
      "dropoff": "송파구",
      "fare": 35000,
      "id": "9781dc08-e503-48c2-9ed8-ae98303d5ae8",
      "pickup": "경안동",
      "pickupDistance": 0.2,
      "rawText": "0.2, 15.2, @, 경안동, 송파구, 1t, 3.5",
      "timestamp": "2026-04-16T22:20:56Z",
      "type": "NEW_ORDER",
      "vehicleType": "1t"
    }
    ```

    </details>
- `[ROADMAP 22:20:57.330] [☁️서버] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`
- `[ROADMAP 22:21:02.278] [☁️서버] [HTTP 폴링] POST /api/scrap (아이디 및 상태 전송 수신)`

    <details>
    <summary>🔽 📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [...</summary>

    ```json
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
       └─ [data][0] 상세 정보:
    {
      "dropoff": "수지구",
      "fare": 31000,
      "id": "4999f899-3334-4e00-8ff1-b836ae664089",
      "pickup": "분당구",
      "pickupDistance": 8.5,
      "rawText": "8.5, 13.6, 분당구, 수지구, 라, 3.1",
      "timestamp": "2026-04-16T22:21:01Z",
      "type": "NEW_ORDER",
      "vehicleType": "라"
    }
    ```

    </details>
- `[ROADMAP 22:21:02.279] [☁️서버] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`
- `[ROADMAP 22:21:07.315] [☁️서버] [HTTP 폴링] POST /api/scrap (아이디 및 상태 전송 수신)`

    <details>
    <summary>🔽 📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [...</summary>

    ```json
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
       └─ [data][0] 상세 정보:
    {
      "dropoff": "상록구",
      "fare": 66000,
      "id": "8ba858b4-b91b-4a42-8de9-6d88fac4e7fe",
      "pickup": "오포읍",
      "pickupDistance": 5,
      "rawText": "5.0, 35.0, 낮12시51/오포읍, 상록구, 라, 6.6",
      "scheduleText": "낮12시51",
      "timestamp": "2026-04-16T22:21:06Z",
      "type": "NEW_ORDER",
      "vehicleType": "라"
    }
    ```

    </details>
- `[ROADMAP 22:21:07.315] [☁️서버] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`
- `[ROADMAP 22:21:12.317] [☁️서버] [HTTP 폴링] POST /api/scrap (아이디 및 상태 전송 수신)`

    <details>
    <summary>🔽 📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [...</summary>

    ```json
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
       └─ [data][0] 상세 정보:
    {
      "dropoff": "삼동",
      "fare": 54000,
      "id": "b232e065-9d17-4c68-8d43-f4a390a0c8fc",
      "pickup": "송정동",
      "pickupDistance": 1.9,
      "rawText": "1.9, 29.4, 송정동, 삼동, 1t, 5.4",
      "timestamp": "2026-04-16T22:21:11Z",
      "type": "NEW_ORDER",
      "vehicleType": "1t"
    }
    ```

    </details>
- `[ROADMAP 22:21:12.317] [☁️서버] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`
- `[ROADMAP 22:21:17.311] [☁️서버] [HTTP 폴링] POST /api/scrap (아이디 및 상태 전송 수신)`

    <details>
    <summary>🔽 📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [...</summary>

    ```json
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
       └─ [data][0] 상세 정보:
    {
      "dropoff": "용산구",
      "fare": 43000,
      "id": "68e27fe9-8d1c-4eb5-9a67-32fd4ca8908a",
      "pickup": "분당구",
      "pickupDistance": 8.5,
      "rawText": "8.5, 21.8, @, 분당구, 용산구, 오, 4.3",
      "timestamp": "2026-04-16T22:21:16Z",
      "type": "NEW_ORDER",
      "vehicleType": "오"
    }
    ```

    </details>
- `[ROADMAP 22:21:17.311] [☁️서버] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`
- `[ROADMAP 22:21:22.274] [☁️서버] [HTTP 폴링] POST /api/scrap (아이디 및 상태 전송 수신)`

    <details>
    <summary>🔽 📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [...</summary>

    ```json
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
       └─ [data][0] 상세 정보:
    {
      "dropoff": "경안동",
      "fare": 30000,
      "id": "22de6c03-c85a-4701-b4a3-72f4c2880c8e",
      "pickup": "경안동",
      "pickupDistance": 0.2,
      "rawText": "0.2, 0.0, 오전11시44/경안동, 경안동, 오, 3.0",
      "scheduleText": "오전11시44",
      "timestamp": "2026-04-16T22:21:21Z",
      "type": "NEW_ORDER",
      "vehicleType": "오"
    }
    ```

    </details>
- `[ROADMAP 22:21:22.274] [☁️서버] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`
- `[ROADMAP 22:21:27.283] [☁️서버] [HTTP 폴링] POST /api/scrap (아이디 및 상태 전송 수신)`

    <details>
    <summary>🔽 📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [...</summary>

    ```json
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
       └─ [data][0] 상세 정보:
    {
      "dropoff": "중구",
      "fare": 96000,
      "id": "1bebcb6b-acb4-4335-8e7d-4a6a71d665bb",
      "pickup": "경안동",
      "pickupDistance": 0.2,
      "rawText": "0.2, 55.6, 경안동, 중구, 라, 9.6",
      "timestamp": "2026-04-16T22:21:26Z",
      "type": "NEW_ORDER",
      "vehicleType": "라"
    }
    ```

    </details>
- `[ROADMAP 22:21:27.283] [☁️서버] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`
- `[ROADMAP 22:21:32.296] [☁️서버] [HTTP 폴링] POST /api/scrap (아이디 및 상태 전송 수신)`

    <details>
    <summary>🔽 📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [...</summary>

    ```json
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
       └─ [data][0] 상세 정보:
    {
      "dropoff": "부평구",
      "fare": 82000,
      "id": "15ad2b78-66c9-485e-b1cf-b2c68292e33b",
      "pickup": "경안동",
      "pickupDistance": 0.2,
      "rawText": "0.2, 46.5, @, 오후3시14/경안동, 부평구, 오, 8.2",
      "scheduleText": "오후3시14",
      "timestamp": "2026-04-16T22:21:31Z",
      "type": "NEW_ORDER",
      "vehicleType": "오"
    }
    ```

    </details>
- `[ROADMAP 22:21:32.296] [☁️서버] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`
- `[ROADMAP 22:21:37.346] [☁️서버] [HTTP 폴링] POST /api/scrap (아이디 및 상태 전송 수신)`

    <details>
    <summary>🔽 📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [...</summary>

    ```json
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
       └─ [data][0] 상세 정보:
    {
      "dropoff": "마포구",
      "fare": 59000,
      "id": "eb8f98db-4b51-42e9-86e6-256376d15335",
      "pickup": "경안동",
      "pickupDistance": 0.2,
      "rawText": "0.2, 32.5, @, 경안동, 마포구, 1t, 5.9",
      "timestamp": "2026-04-16T22:21:36Z",
      "type": "NEW_ORDER",
      "vehicleType": "1t"
    }
    ```

    </details>
- `[ROADMAP 22:21:37.346] [☁️서버] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`
- `[ROADMAP 22:21:42.320] [☁️서버] [HTTP 폴링] POST /api/scrap (아이디 및 상태 전송 수신)`

    <details>
    <summary>🔽 📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [...</summary>

    ```json
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
       └─ [data][0] 상세 정보:
    {
      "dropoff": "적성면",
      "fare": 114000,
      "id": "cfa72089-a926-469f-93a3-86a1411ca547",
      "pickup": "경안동",
      "pickupDistance": 0.2,
      "rawText": "0.2, 67.2, 경안동, 적성면, 오, 11.4",
      "timestamp": "2026-04-16T22:21:41Z",
      "type": "NEW_ORDER",
      "vehicleType": "오"
    }
    ```

    </details>
- `[ROADMAP 22:21:42.321] [☁️서버] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`
- `[ROADMAP 22:21:47.291] [☁️서버] [HTTP 폴링] POST /api/scrap (아이디 및 상태 전송 수신)`

    <details>
    <summary>🔽 📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [...</summary>

    ```json
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
       └─ [data][0] 상세 정보:
    {
      "dropoff": "퇴촌면",
      "fare": 30000,
      "id": "6fe747f7-fa60-4b1d-bac2-14bcb5a1ddfb",
      "pickup": "경안동",
      "pickupDistance": 0.2,
      "rawText": "0.2, 9.1, @, 급송/경안동, 퇴촌면, 오, 3.0",
      "scheduleText": "급송",
      "timestamp": "2026-04-16T22:21:46Z",
      "type": "NEW_ORDER",
      "vehicleType": "오"
    }
    ```

    </details>
- `[ROADMAP 22:21:47.292] [☁️서버] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`
- `[ROADMAP 22:21:52.306] [☁️서버] [HTTP 폴링] POST /api/scrap (아이디 및 상태 전송 수신)`

    <details>
    <summary>🔽 📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [...</summary>

    ```json
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
       └─ [data][0] 상세 정보:
    {
      "dropoff": "퇴촌면",
      "fare": 30000,
      "id": "970c5c71-2d24-42b0-8a01-a0176affd3b1",
      "pickup": "초월읍",
      "pickupDistance": 5.1,
      "rawText": "5.1, 6.9, 초월읍, 퇴촌면, 라, 3.0",
      "timestamp": "2026-04-16T22:21:51Z",
      "type": "NEW_ORDER",
      "vehicleType": "라"
    }
    ```

    </details>
- `[ROADMAP 22:21:52.306] [☁️서버] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`
- `[ROADMAP 22:21:57.288] [☁️서버] [HTTP 폴링] POST /api/scrap (아이디 및 상태 전송 수신)`

    <details>
    <summary>🔽 📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [...</summary>

    ```json
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
       └─ [data][0] 상세 정보:
    {
      "dropoff": "만안구",
      "fare": 42000,
      "id": "8280dc04-7d30-4d23-8f24-4bf0a6ef5c84",
      "pickup": "분당구",
      "pickupDistance": 8.5,
      "rawText": "8.5, 18.8, 분당구, 만안구, 라, 4.2",
      "timestamp": "2026-04-16T22:21:56Z",
      "type": "NEW_ORDER",
      "vehicleType": "라"
    }
    ```

    </details>
- `[ROADMAP 22:21:57.288] [☁️서버] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`
- `[ROADMAP 22:22:02.251] [☁️서버] [HTTP 폴링] 응답 /orders/confirm`

### 🟡 [STEP 3] 1차 확정 통신
*(시작 기준 시간: 07:22:02.252)*

- `[ROADMAP 22:22:02.252] [☁️서버] [HTTP 폴링] POST /orders/confirm 확정정보 정보 전송 수신`
- `[ROADMAP 22:22:02.252] [☁️서버] 대기 필터로 설정값 업데이트 (isActive: false)`
- `[ROADMAP 22:22:02.252] [☁️서버] [Socket] 확정정보 정보 + 대기 필터 정보 전송`

### 🚨 [STEP 8] 관제탑 무응답 및 데스밸리 방어기동 (예외 처리)
*(시작 기준 시간: 07:22:02.252)*

- `[ROADMAP 22:22:02.252] [☁️서버] 관제탑 무응답 대비 30초 데스밸리 타이머 기동 (안전망 강화)`
- `[ROADMAP 22:22:02.252] [🖥️관제웹] [관제대시보드] 🟢 [웹 수신] order-evaluating | ID: 49179be5 | 기기: 앱폰-sdk_gpho-160 | 전표 → 신규`
- `[ROADMAP 22:22:02.252] [🖥️관제웹] [관제대시보드] 확정페이지 진입 (선빵 수신으로 상세 모드 구동)`
- `[ROADMAP 22:22:03.108] [☁️서버] [HTTP 폴링] POST /orders/detail 상하차지 + 적요내용 정보 수신`

### 🟢 [STEP 5] 카카오 연산 3중 폴백 & 자동 회랑 전개
*(시작 기준 시간: 07:22:03.109)*

- `[ROADMAP 22:22:03.109] [☁️서버] [Socket] 상하차지 + 적요내용 정보 전송`
- `[ROADMAP 22:22:03.109] [☁️서버] 🛡️ [카카오 API 3중 폴백] 괄호제거 ➡️ 주소검색 ➡️ 키워드검색 ➡️ 4어절 절사`

    <details>
    <summary>🔽 🌍 [Geocoding] 상차지 변환 시도: 입력값='경기 광주시 경안동 167-1 경안천 체육공원' -&gt; 결과=X:127.2528899471...</summary>

    ```json
    🌍 [Geocoding] 상차지 변환 시도: 입력값='경기 광주시 경안동 167-1 경안천 체육공원' -> 결과=X:127.252889947198, Y:37.4100225848715
       - ⚠️ 패널티 결과: +16.7km, +37분 '콜' (현위치접근: 6.5km, 14분)
    ```

    </details>
- `[ROADMAP 22:22:03.110] [🖥️관제웹] [관제대시보드] 🟡 [웹 수신] order-detail-received | ID: 49179be5 | 경기 광주시 경안동 167-1 경안천`

    <details>
    <summary>🔽 🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.</summary>

    ```json
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    ```

    </details>
- `[ROADMAP 22:22:04.308] [☁️서버] [Socket] 경로 및 시간 정보, 수익률 전송`

    <details>
    <summary>🔽 🔎 [카카오 연산 완료] +16.7km, +37분 '콜' (기기: 앱폰-sdk_gpho-160) | Polyline 길이: 1442</summary>

    ```json
    🔎 [카카오 연산 완료] +16.7km, +37분 '콜' (기기: 앱폰-sdk_gpho-160) | Polyline 길이: 1442
    ```

    </details>
- `[ROADMAP 22:22:04.314] [🖥️관제웹] [관제대시보드] 🔵 [웹 수신] order-evaluated | ID: 49179be5 | +16.7km, +37분 '콜'`
- `[ROADMAP 22:22:04.315] [🖥️관제웹] [관제대시보드] 추천 결과 노출, 경로보기버튼 추가 노출 후 판단 (취소 or 닫기) 대기`

    <details>
    <summary>🔽 ⚠️ [DeathValley Warning] {orderId: '49179be5-1a45-4c66-b462-69be035a6773', devic...</summary>

    ```json
    ⚠️ [DeathValley Warning] {orderId: '49179be5-1a45-4c66-b462-69be035a6773', deviceId: '앱폰-sdk_gpho-160', pickup: '경기 광주시 경안동 167-1 경안천 체육공원', dropoff: '경기 파주시 문산읍 문산역로 65 문산역', message: '⚠️ 응답기한 30초 초과 — 앱폰 자동취소 임박!', …}
    ```

    </details>
- `[ROADMAP 22:22:17.308] [☁️서버] [HTTP 폴링] POST /api/scrap (아이디 및 상태 전송 수신)`
- `[ROADMAP 22:22:17.308] [☁️서버] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`
- `[ROADMAP 22:22:37.315] [☁️서버] [HTTP 폴링] POST /api/scrap (아이디 및 상태 전송 수신)`
- `[ROADMAP 22:22:37.315] [☁️서버] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`

    <details>
    <summary>🔽 🚨🚨🚨 [EMERGENCY] 비상 보고 수신 🚨🚨🚨</summary>

    ```json
    🚨🚨🚨 [EMERGENCY] 비상 보고 수신 🚨🚨🚨
    🚨🚨🚨 [EMERGENCY] 처리 완료 🚨🚨🚨
    ```

    </details>
- `[ROADMAP 22:22:39.313] [🖥️관제웹] [관제대시보드] 🔴 [웹 수신] order-canceled | ID: 49179be5`

    <details>
    <summary>🔽 🚨 [Emergency Alert] {deviceId: '앱폰-sdk_gpho-160', orderId: '49179be5-1a45-4c66-...</summary>

    ```json
    🚨 [Emergency Alert] {deviceId: '앱폰-sdk_gpho-160', orderId: '49179be5-1a45-4c66-b462-69be035a6773', reason: 'AUTO_CANCEL', screenContext: 'POPUP_DROPOFF', screenText: '데스밸리 응답 없음 강제취소', …}
    ```

    </details>
- `[ROADMAP 22:22:39.346] [☁️서버] [HTTP 폴링] 응답 /orders/confirm`
- `[ROADMAP 22:22:39.347] [☁️서버] [HTTP 폴링] POST /orders/confirm 확정정보 정보 전송 수신`
- `[ROADMAP 22:22:39.352] [☁️서버] [HTTP 폴링] POST /orders/detail 상하차지 + 적요내용 정보 수신`
- `[ROADMAP 22:22:39.353] [☁️서버] [Socket] 상하차지 + 적요내용 정보 전송`
- `[ROADMAP 22:22:39.354] [☁️서버] 🛡️ [카카오 API 3중 폴백] 괄호제거 ➡️ 주소검색 ➡️ 키워드검색 ➡️ 4어절 절사`

    <details>
    <summary>🔽 🌍 [Geocoding] 상차지 변환 시도: 입력값='경기 광주시 경안동 165-15 농협 경안지점' -&gt; 결과=X:127.2550158885...</summary>

    ```json
    🌍 [Geocoding] 상차지 변환 시도: 입력값='경기 광주시 경안동 165-15 농협 경안지점' -> 결과=X:127.25501588858974, Y:37.41283198561755
       - ⚠️ 패널티 결과: +15.7km, +34분 '콜' (현위치접근: 6.2km, 14분)
    ```

    </details>
- `[ROADMAP 22:22:39.404] [🖥️관제웹] [관제대시보드] 🔴 [웹 수신] order-canceled | ID: 49179be5`
- `[ROADMAP 22:22:39.404] [🖥️관제웹] [관제대시보드] 🟢 [웹 수신] order-evaluating | ID: 1976da0e | 기기: 앱폰-sdk_gpho-160 | 전표 → 신규`
- `[ROADMAP 22:22:39.404] [🖥️관제웹] [관제대시보드] 확정페이지 진입 (선빵 수신으로 상세 모드 구동)`
- `[ROADMAP 22:22:39.404] [🖥️관제웹] [관제대시보드] 🟡 [웹 수신] order-detail-received | ID: 1976da0e | 경기 광주시 경안동 165-15 농협`

    <details>
    <summary>🔽 🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.</summary>

    ```json
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    ```

    </details>
- `[ROADMAP 22:22:40.565] [☁️서버] [Socket] 경로 및 시간 정보, 수익률 전송`

    <details>
    <summary>🔽 🔎 [카카오 연산 완료] +15.7km, +34분 '콜' (기기: 앱폰-sdk_gpho-160) | Polyline 길이: 1428</summary>

    ```json
    🔎 [카카오 연산 완료] +15.7km, +34분 '콜' (기기: 앱폰-sdk_gpho-160) | Polyline 길이: 1428
    ```

    </details>
- `[ROADMAP 22:22:40.567] [🖥️관제웹] [관제대시보드] 🔵 [웹 수신] order-evaluated | ID: 1976da0e | +15.7km, +34분 '콜'`
- `[ROADMAP 22:22:40.568] [🖥️관제웹] [관제대시보드] 추천 결과 노출, 경로보기버튼 추가 노출 후 판단 (취소 or 닫기) 대기`

### 🟢 [STEP 2] 첫짐 1차 선점 (단독콜 사냥)
*(시작 기준 시간: 22:19:02.923)*


    <details>
    <summary>🔽 type=1400 audit(0.0:695): avc:  granted  { execute } for  path="/data/data/com.o...</summary>

    ```json
    type=1400 audit(0.0:695): avc:  granted  { execute } for  path="/data/data/com.onedal.app/code_cache/startup_agents/a82ed9e3-agent.so" dev="dm-44" ino=58155 scontext=u:r:untrusted_app:s0:c208,c256,c512,c768 tcontext=u:object_r:app_data_file:s0:c208,c256,c512,c768 tclass=file app=com.onedal.app
    ```

    </details>
- `🚦 [ROADMAP 22:19:15.391] [📱앱] [LIST] [0초] 인성앱 실행 후 1DAL앱 접근성 권한 on`

    <details>
    <summary>🔽 🎯 [인성콜] 키워드 사전 다운로드 성공: {"appName":"인성콜","uiNoiseWords":["출발지","도착지","차종","요금",...</summary>

    ```json
    🎯 [인성콜] 키워드 사전 다운로드 성공: {"appName":"인성콜","uiNoiseWords":["출발지","도착지","차종","요금","설정","닫기","콜상세"],"confirmButtonText":"확정","cancelButtonText":"취소","pickupButtonText":"출발지","dropoffButtonText":"도착지"}
    ```

    </details>
- `🚦 [ROADMAP 22:19:16.812] [📱앱] [UNKNOWN] 새로운 화면 진입 판별: UNKNOWN`
- `🚦 [ROADMAP 22:19:16.968] [📱앱] [UNKNOWN] 새로운 화면 진입 판별: UNKNOWN`
- `🚦 [ROADMAP 22:19:17.148] [📱앱] [UNKNOWN] 새로운 화면 진입 판별: UNKNOWN`
- `🚦 [ROADMAP 22:19:17.899] [📱앱] [UNKNOWN] 새로운 화면 진입 판별: UNKNOWN`
- `🚦 [ROADMAP 22:19:20.739] [📱앱] [UNKNOWN] 새로운 화면 진입 판별: UNKNOWN`
- `🚦 [ROADMAP 22:19:20.868] [📱앱] [UNKNOWN] 새로운 화면 진입 판별: UNKNOWN`
- `🚦 [ROADMAP 22:19:20.938] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`

    <details>
    <summary>🔽 {...</summary>

    ```json
                                                                                                        {
                                                                                                          "dropoff": "성북구",
                                                                                                          "fare": 55000,
                                                                                                          "id": "51f12c62-e160-497f-8301-e6e89691ef27",
                                                                                                          "pickup": "경안동",
                                                                                                          "pickupDistance": 0.2,
                                                                                                          "rawText": "0.2, 27.7, @, 경안동, 성북구, 라, 5.5",
                                                                                                          "timestamp": "2026-04-16T22:19:20Z",
                                                                                                          "type": "NEW_ORDER",
                                                                                                          "vehicleType": "라"
                                                                                                        }
                                                                                                        {
                                                                                                          "dropoff": "풍산동",
                                                                                                          "fare": 36000,
                                                                                                          "id": "8edadfec-e848-4d45-9c50-91721408fce5",
                                                                                                          "pickup": "경안동",
                                                                                                          "pickupDistance": 0.2,
                                                                                                          "rawText": "0.2, 16.5, 경안동, 풍산동, 1t, 3.6",
                                                                                                          "timestamp": "2026-04-16T22:19:20Z",
                                                                                                          "type": "NEW_ORDER",
                                                                                                          "vehicleType": "1t"
                                                                                                        }
                                                                                                        {
                                                                                                          "dropoff": "영통구",
                                                                                                          "fare": 52000,
                                                                                                          "id": "dd0478a2-5386-4e8e-8a92-4fcdce4186d3",
                                                                                                          "pickup": "태전동",
                                                                                                          "pickupDistance": 3.8,
                                                                                                          "rawText": "3.8, 27.2, @, 태전동, 영통구, 라, 5.2",
                                                                                                          "timestamp": "2026-04-16T22:19:20Z",
                                                                                                          "type": "NEW_ORDER",
                                                                                                          "vehicleType": "라"
                                                                                                        }
                                                                                                        {
                                                                                                          "dropoff": "남한산성면",
                                                                                                          "fare": 30000,
                                                                                                          "id": "3da13744-e82e-42c5-bb8c-73d3bfc99a95",
                                                                                                          "pickup": "실촌읍",
                                                                                                          "pickupDistance": 5.0,
                                                                                                          "rawText": "5.0, 9.6, 실촌읍, 남한산성면, 오, 3.0",
                                                                                                          "timestamp": "2026-04-16T22:19:20Z",
                                                                                                          "type": "NEW_ORDER",
                                                                                                          "vehicleType": "오"
                                                                                                        }
                                                                                                        {
                                                                                                          "dropoff": "송내동",
                                                                                                          "fare": 64000,
                                                                                                          "id": "e8937935-2d1f-4f8f-82de-ff2c27a41c10",
                                                                                                          "pickup": "분당구",
                                                                                                          "pickupDistance": 8.5,
                                                                                                          "rawText": "8.5, 35.8, @, 분당구, 송내동, 라, 6.4",
                                                                                                          "timestamp": "2026-04-16T22:19:20Z",
                                                                                                          "type": "NEW_ORDER",
                                                                                                          "vehicleType": "라"
                                                                                                        }
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 5개의 오더 객체... ] }
    └─ [data][0] 상세 정보:
    └─ [data][1] 상세 정보:
    └─ [data][2] 상세 정보:
    └─ [data][3] 상세 정보:
    └─ [data][4] 상세 정보:
    ```

    </details>
- `🚦 [ROADMAP 22:19:21.339] [📱앱] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`

    <details>
    <summary>🔽 {"allowedVehicleTypes":[],"isActive":true,"isSharedMode":false,"pickupRadiusKm":...</summary>

    ```json
                                                                                                        {"allowedVehicleTypes":[],"isActive":true,"isSharedMode":false,"pickupRadiusKm":30.0,"minFare":35000.0,"maxFare":1000000.0,"excludedKeywords":"착불,수거,까대기,전화금지,타일","destinationCity":"파주시","destinationRadiusKm":10.0,"destinationKeywords":"검산동,광탄면,교하동,군내면,금릉동,금촌동,다율동,당하동,동패동,맥금동,목동동,문발동,문산읍,법원읍,산남동,상지석동,서패동,송촌동,신촌동,아동동,야당동,야동동,연다산동,오도동,와동동,월롱면,장단면,적성면,조리읍,진동면,진서면,탄현면,파주읍,파평면,하지석동","corridorRadiusKm":1.0,"userOverrides":false,"customFilters":[]}
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `🚦 [ROADMAP 22:19:26.351] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`

    <details>
    <summary>🔽 {...</summary>

    ```json
                                                                                                        {
                                                                                                          "dropoff": "성북구",
                                                                                                          "fare": 52000,
                                                                                                          "id": "9f90b9ff-f267-4e5a-91bf-a003ea22662e",
                                                                                                          "pickup": "경안동",
                                                                                                          "pickupDistance": 0.2,
                                                                                                          "rawText": "0.2, 27.7, 오후3시23/경안동, 성북구, 다, 5.2",
                                                                                                          "timestamp": "2026-04-16T22:19:26Z",
                                                                                                          "type": "NEW_ORDER",
                                                                                                          "vehicleType": "다"
                                                                                                        }
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
    └─ [data][0] 상세 정보:
    ```

    </details>
- `🚦 [ROADMAP 22:19:26.695] [📱앱] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`

    <details>
    <summary>🔽 {"allowedVehicleTypes":[],"isActive":true,"isSharedMode":false,"pickupRadiusKm":...</summary>

    ```json
                                                                                                        {"allowedVehicleTypes":[],"isActive":true,"isSharedMode":false,"pickupRadiusKm":30.0,"minFare":35000.0,"maxFare":1000000.0,"excludedKeywords":"착불,수거,까대기,전화금지,타일","destinationCity":"파주시","destinationRadiusKm":10.0,"destinationKeywords":"검산동,광탄면,교하동,군내면,금릉동,금촌동,다율동,당하동,동패동,맥금동,목동동,문발동,문산읍,법원읍,산남동,상지석동,서패동,송촌동,신촌동,아동동,야당동,야동동,연다산동,오도동,와동동,월롱면,장단면,적성면,조리읍,진동면,진서면,탄현면,파주읍,파평면,하지석동","corridorRadiusKm":1.0,"userOverrides":false,"customFilters":[]}
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `🚦 [ROADMAP 22:19:31.344] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`

    <details>
    <summary>🔽 {...</summary>

    ```json
                                                                                                        {
                                                                                                          "dropoff": "서구",
                                                                                                          "fare": 91000,
                                                                                                          "id": "06ec8246-f105-4f3c-a2b1-ad66f33f868a",
                                                                                                          "pickup": "실촌읍",
                                                                                                          "pickupDistance": 5.0,
                                                                                                          "rawText": "5.0, 51.6, 오전10시47/실촌읍, 서구, 오, 9.1",
                                                                                                          "timestamp": "2026-04-16T22:19:31Z",
                                                                                                          "type": "NEW_ORDER",
                                                                                                          "vehicleType": "오"
                                                                                                        }
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
    └─ [data][0] 상세 정보:
    ```

    </details>
- `🚦 [ROADMAP 22:19:31.671] [📱앱] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`

    <details>
    <summary>🔽 {"allowedVehicleTypes":[],"isActive":true,"isSharedMode":false,"pickupRadiusKm":...</summary>

    ```json
                                                                                                        {"allowedVehicleTypes":[],"isActive":true,"isSharedMode":false,"pickupRadiusKm":30.0,"minFare":35000.0,"maxFare":1000000.0,"excludedKeywords":"착불,수거,까대기,전화금지,타일","destinationCity":"파주시","destinationRadiusKm":10.0,"destinationKeywords":"검산동,광탄면,교하동,군내면,금릉동,금촌동,다율동,당하동,동패동,맥금동,목동동,문발동,문산읍,법원읍,산남동,상지석동,서패동,송촌동,신촌동,아동동,야당동,야동동,연다산동,오도동,와동동,월롱면,장단면,적성면,조리읍,진동면,진서면,탄현면,파주읍,파평면,하지석동","corridorRadiusKm":1.0,"userOverrides":false,"customFilters":[]}
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `🚦 [ROADMAP 22:19:36.354] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`
- `🚦 [ROADMAP 22:19:36.360] [📱앱] [LIST] AccessibilityService로 바뀐 리스트 감지 후 text 추출`
- `🚦 [ROADMAP 22:19:36.360] [📱앱] [LIST] 리스트에서 바뀐 text 감지 후 text 추출`
- `🚦 [ROADMAP 22:19:36.373] [📱앱] [LIST] [인성 Socket] 인성콜에 선택된 콜 정보 전달 (꿀콜 클릭!)`
- `🚦 [ROADMAP 22:19:36.431] [📱앱] 버튼 터치 완료 (가로채기 성공) X:917.0, Y:568.0`
- `🚦 [ROADMAP 22:19:36.590] [📱앱] [DETAIL_PRE_CONFIRM] 새로운 화면 진입 판별: DETAIL_PRE_CONFIRM`
- `🚦 [ROADMAP 22:19:36.596] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지 진입으로 바뀐 text중 '확정' 추출 후 클릭`
- `🚦 [ROADMAP 22:19:36.597] [📱앱] '확정' 버튼 인식 ➡️ 클릭 시도`

    <details>
    <summary>🔽 🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용...</summary>

    ```json
    🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용을 긁어서 POST /api/orders/detail 로 보내주세요."}
    ```

    </details>
- `🚦 [ROADMAP 22:19:36.606] [📱앱] [HTTP 폴링] 응답 /orders/confirm`
- `🚦 [ROADMAP 22:19:36.670] [📱앱] 버튼 터치 완료 (가로채기 성공) X:161.0, Y:2251.0`
- `🚦 [ROADMAP 22:19:36.842] [📱앱] [DETAIL_CONFIRMED] 새로운 화면 진입 판별: DETAIL_CONFIRMED`

### 🟢 [STEP 4] 2차 상세 수집: 팝업 자동 서핑
*(시작 기준 시간: 22:19:36.843)*

- `🚦 [ROADMAP 22:19:36.843] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 22:19:36.844] [📱앱] '적요상세' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:19:36.846] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '적요상세' 추출 후 클릭`
- `🚦 [ROADMAP 22:19:36.896] [📱앱] 버튼 터치 완료 (가로채기 성공) X:149.0, Y:1153.0`
- `🚦 [ROADMAP 22:19:37.023] [📱앱] [POPUP_MEMO] 새로운 화면 진입 판별: POPUP_MEMO`
- `🚦 [ROADMAP 22:19:37.023] [📱앱] [POPUP_MEMO] 적요상세페이지에서 '젹요 내용' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 22:19:37.024] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:19:37.077] [📱앱] 버튼 터치 완료 (가로채기 성공) X:540.0, Y:2264.0`
- `🚦 [ROADMAP 22:19:37.114] [📱앱] [DETAIL_CONFIRMED] 새로운 화면 진입 판별: DETAIL_CONFIRMED`
- `🚦 [ROADMAP 22:19:37.114] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 22:19:37.114] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '출발지' 추출 후 클릭`
- `🚦 [ROADMAP 22:19:37.115] [📱앱] '출발지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:19:37.171] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1592.0`
- `🚦 [ROADMAP 22:19:37.276] [📱앱] [POPUP_PICKUP] 새로운 화면 진입 판별: POPUP_PICKUP`
- `🚦 [ROADMAP 22:19:37.277] [📱앱] [POPUP_PICKUP] 출발지페이지 text중 '전화, 위치' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 22:19:37.278] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:19:37.331] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`
- `🚦 [ROADMAP 22:19:37.448] [📱앱] [DETAIL_CONFIRMED] 새로운 화면 진입 판별: DETAIL_CONFIRMED`
- `🚦 [ROADMAP 22:19:37.448] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 22:19:37.448] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '도착지' 추출 후 클릭`
- `🚦 [ROADMAP 22:19:37.449] [📱앱] '도착지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:19:37.501] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1742.0`
- `🚦 [ROADMAP 22:19:37.633] [📱앱] [POPUP_DROPOFF] 새로운 화면 진입 판별: POPUP_DROPOFF`
- `🚦 [ROADMAP 22:19:37.633] [📱앱] [POPUP_DROPOFF] 도착지페이지 text중 '전화, 위치' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 22:19:37.634] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:19:37.635] [📱앱] [POPUP_DROPOFF] 확정페이지 진입`
- `🚦 [ROADMAP 22:19:37.686] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`

    <details>
    <summary>🔽 🌐 [post /detail response / 200] {"deviceId":"server","action":"KEEP"}</summary>

    ```json
    🌐 [post /detail response / 200] {"deviceId":"server","action":"KEEP"}
    ```

    </details>
- `🚦 [ROADMAP 22:19:41.245] [📱앱] [HTTP 폴링] 응답 /orders/detail 유지 정보 전송`
- `🚦 [ROADMAP 22:19:41.760] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:19:41.767] [📱앱] [POPUP_DROPOFF] '닫기' 클릭 후 리스트 페이지 복귀 (유지)`
- `🚦 [ROADMAP 22:19:41.819] [📱앱] 버튼 터치 완료 (가로채기 성공) X:122.0, Y:2251.0`
- `🚦 [ROADMAP 22:19:41.991] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`
- `🚦 [ROADMAP 22:19:41.998] [📱앱] [LIST] AccessibilityService로 바뀐 리스트 감지 후 text 추출`
- `🚦 [ROADMAP 22:19:41.998] [📱앱] [LIST] 리스트에서 바뀐 text 감지 후 text 추출`
- `🚦 [ROADMAP 22:19:41.999] [📱앱] [LIST] [인성 Socket] 인성콜에 선택된 콜 정보 전달 (꿀콜 클릭!)`
- `🚦 [ROADMAP 22:19:42.051] [📱앱] 버튼 터치 완료 (가로채기 성공) X:917.0, Y:568.0`
- `🚦 [ROADMAP 22:19:42.179] [📱앱] [DETAIL_PRE_CONFIRM] 새로운 화면 진입 판별: DETAIL_PRE_CONFIRM`
- `🚦 [ROADMAP 22:19:42.184] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지 진입으로 바뀐 text중 '확정' 추출 후 클릭`
- `🚦 [ROADMAP 22:19:42.185] [📱앱] '확정' 버튼 인식 ➡️ 클릭 시도`

    <details>
    <summary>🔽 🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용...</summary>

    ```json
    🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용을 긁어서 POST /api/orders/detail 로 보내주세요."}
    ```

    </details>
- `🚦 [ROADMAP 22:19:42.191] [📱앱] [HTTP 폴링] 응답 /orders/confirm`
- `🚦 [ROADMAP 22:19:42.239] [📱앱] 버튼 터치 완료 (가로채기 성공) X:161.0, Y:2251.0`
- `🚦 [ROADMAP 22:19:42.393] [📱앱] [DETAIL_CONFIRMED] 새로운 화면 진입 판별: DETAIL_CONFIRMED`
- `🚦 [ROADMAP 22:19:42.394] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 22:19:42.394] [📱앱] '적요상세' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:19:42.395] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '적요상세' 추출 후 클릭`
- `🚦 [ROADMAP 22:19:42.447] [📱앱] 버튼 터치 완료 (가로채기 성공) X:149.0, Y:1153.0`
- `🚦 [ROADMAP 22:19:42.566] [📱앱] [POPUP_MEMO] 새로운 화면 진입 판별: POPUP_MEMO`
- `🚦 [ROADMAP 22:19:42.567] [📱앱] [POPUP_MEMO] 적요상세페이지에서 '젹요 내용' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 22:19:42.568] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:19:42.620] [📱앱] 버튼 터치 완료 (가로채기 성공) X:540.0, Y:2264.0`
- `🚦 [ROADMAP 22:19:42.681] [📱앱] [DETAIL_CONFIRMED] 새로운 화면 진입 판별: DETAIL_CONFIRMED`
- `🚦 [ROADMAP 22:19:42.681] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 22:19:42.681] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '출발지' 추출 후 클릭`
- `🚦 [ROADMAP 22:19:42.682] [📱앱] '출발지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:19:42.734] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1592.0`
- `🚦 [ROADMAP 22:19:42.812] [📱앱] [POPUP_PICKUP] 새로운 화면 진입 판별: POPUP_PICKUP`
- `🚦 [ROADMAP 22:19:42.813] [📱앱] [POPUP_PICKUP] 출발지페이지 text중 '전화, 위치' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 22:19:42.814] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:19:42.899] [📱앱] [POPUP_PICKUP] 새로운 화면 진입 판별: POPUP_PICKUP`
- `🚦 [ROADMAP 22:19:42.900] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`
- `🚦 [ROADMAP 22:19:42.993] [📱앱] [DETAIL_CONFIRMED] 새로운 화면 진입 판별: DETAIL_CONFIRMED`
- `🚦 [ROADMAP 22:19:42.993] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 22:19:42.993] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '도착지' 추출 후 클릭`
- `🚦 [ROADMAP 22:19:42.993] [📱앱] '도착지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:19:43.045] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1742.0`
- `🚦 [ROADMAP 22:19:43.189] [📱앱] [POPUP_DROPOFF] 새로운 화면 진입 판별: POPUP_DROPOFF`
- `🚦 [ROADMAP 22:19:43.189] [📱앱] [POPUP_DROPOFF] 도착지페이지 text중 '전화, 위치' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 22:19:43.189] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:19:43.190] [📱앱] [POPUP_DROPOFF] 확정페이지 진입`
- `🚦 [ROADMAP 22:19:43.243] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`

    <details>
    <summary>🔽 🌐 [post /detail response / 200] {"deviceId":"server","action":"CANCEL"}</summary>

    ```json
    🌐 [post /detail response / 200] {"deviceId":"server","action":"CANCEL"}
    ```

    </details>
- `🚦 [ROADMAP 22:19:47.958] [📱앱] [HTTP 폴링] 응답 /orders/detail 취소 정보 전송`
- `🚦 [ROADMAP 22:19:48.474] [📱앱] '취소' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:19:48.480] [📱앱] [POPUP_DROPOFF] '취소' 클릭 후 인성 Socket 취소 지시`
- `🚦 [ROADMAP 22:19:48.552] [📱앱] 버튼 터치 완료 (가로채기 성공) X:950.0, Y:478.0`
- `🚦 [ROADMAP 22:19:48.712] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`

    <details>
    <summary>🔽 {...</summary>

    ```json
                                                                                                        {
                                                                                                          "dropoff": "강남구",
                                                                                                          "fare": 55000,
                                                                                                          "id": "9d485f3f-8f19-41b6-82aa-5d3b5bb4fdd8",
                                                                                                          "pickup": "초월읍",
                                                                                                          "pickupDistance": 5.1,
                                                                                                          "rawText": "5.1, 29.0, 급송/초월읍, 강남구, 라, 5.5",
                                                                                                          "timestamp": "2026-04-16T22:19:48Z",
                                                                                                          "type": "NEW_ORDER",
                                                                                                          "vehicleType": "라"
                                                                                                        }
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
    └─ [data][0] 상세 정보:
    ```

    </details>
- `🚦 [ROADMAP 22:19:49.035] [📱앱] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`

    <details>
    <summary>🔽 {"allowedVehicleTypes":["다마스","라보","오토바이"],"isActive":true,"isSharedMode":true,"...</summary>

    ```json
                                                                                                        {"allowedVehicleTypes":["다마스","라보","오토바이"],"isActive":true,"isSharedMode":true,"pickupRadiusKm":30.0,"minFare":35000.0,"maxFare":1000000.0,"excludedKeywords":"착불,수거,까대기,전화금지,타일","destinationCity":"파주시","destinationRadiusKm":10.0,"destinationKeywords":"가능동, 가좌동, 갈매동, 강일동, 걸포동, 검산동, 경안동, 고덕동, 고촌읍, 광암동, 교산동, 교하동, 구산동, 금릉동, 금촌동, 남한산성면, 내곡동, 다산동, 다율동, 당하동, 대자동, 대장동, 대화동, 덕이동, 덕풍동, 도농동, 도봉동, 동패동, 망월동, 맥금동, 목동동, 문발동, 문산읍, 백석동, 법곳동, 별내동, 사노동, 산남동, 산황동, 상계동, 상산곡동, 상일동, 상지석동, 서패동, 선동, 선유동, 설문동, 성사동, 성석동, 송정동, 송촌동, 수석동, 수택동, 식사동, 신원동, 신장동, 신촌동, 신평동, 쌍령동, 아동동, 야당동, 야동동, 양벌동, 양촌읍, 역동, 연다산동, 오금동, 오도동, 와동동, 운양동, 원당동, 월곶면, 월롱면, 인창동, 장단면, 장암동, 장항동, 장흥면, 조리읍, 주교동, 지금동, 지축동, 창우동, 천현동, 초월읍, 초이동, 초일동, 춘궁동, 탄벌동, 탄현동, 탄현면, 토당동, 토평동, 통진읍, 퇴계원읍, 퇴촌면, 파주읍, 풍동, 풍산동, 하사창동, 하산곡동, 하성면, 하지석동, 행주외동, 호원동, 회덕동","corridorRadiusKm":1.0,"userOverrides":false,"customFilters":[],"destinationGroups":{"도봉구":["도봉동"],"노원구":["상계동"],"강동구":["강일동","고덕동","상일동"],"의정부시":["가능동","장암동","호원동"],"고양시 덕양구":["내곡동","대자동","대장동","선유동","성사동","신원동","신평동","오금동","원당동","주교동","지축동","토당동","행주외동"],"고양시 일산동구":["백석동","산황동","설문동","성석동","식사동","장항동","풍동"],"고양시 일산서구":["가좌동","구산동","대화동","덕이동","법곳동","탄현동"],"구리시":["갈매동","사노동","수택동","인창동","토평동"],"남양주시":["다산동","도농동","별내동","수석동","지금동","퇴계원읍"],"하남시":["광암동","교산동","덕풍동","망월동","상산곡동","선동","신장동","창우동","천현동","초이동","초일동","춘궁동","풍산동","하사창동","하산곡동"],"파주시":["검산동","교하동","금릉동","금촌동","다율동","당하동","동패동","맥금동","목동동","문발동","문산읍","산남동","상지석동","서패동","송촌동","신촌동","아동동","야당동","야동동","연다산동","오도동","와동동","월롱면","장단면","조리읍","탄현면","파주읍","하지석동"],"김포시":["걸포동","고촌읍","양촌읍","운양동","월곶면","통진읍","하성면"],"광주시":["경안동","남한산성면","송정동","쌍령동","양벌동","역동","초월읍","탄벌동","퇴촌면","회덕동"],"양주시":["장흥면"]}}
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `🚦 [ROADMAP 22:19:51.351] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`

    <details>
    <summary>🔽 {...</summary>

    ```json
                                                                                                        {
                                                                                                          "dropoff": "문발동",
                                                                                                          "fare": 101000,
                                                                                                          "id": "f8cee7fd-7921-4ce1-9b87-3ba59e31d63a",
                                                                                                          "pickup": "경안동",
                                                                                                          "pickupDistance": 0.2,
                                                                                                          "rawText": "0.2, 60.2, 오전10시2/경안동, 문발동, 1t, 10.1",
                                                                                                          "timestamp": "2026-04-16T22:19:51Z",
                                                                                                          "type": "NEW_ORDER",
                                                                                                          "vehicleType": "1t"
                                                                                                        }
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
    └─ [data][0] 상세 정보:
    ```

    </details>
- `🚦 [ROADMAP 22:19:51.677] [📱앱] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`

    <details>
    <summary>🔽 {"allowedVehicleTypes":["다마스","라보","오토바이"],"isActive":true,"isSharedMode":true,"...</summary>

    ```json
                                                                                                        {"allowedVehicleTypes":["다마스","라보","오토바이"],"isActive":true,"isSharedMode":true,"pickupRadiusKm":30.0,"minFare":35000.0,"maxFare":1000000.0,"excludedKeywords":"착불,수거,까대기,전화금지,타일","destinationCity":"파주시","destinationRadiusKm":10.0,"destinationKeywords":"가능동, 가좌동, 갈매동, 강일동, 걸포동, 검산동, 경안동, 고덕동, 고촌읍, 광암동, 교산동, 교하동, 구산동, 금릉동, 금촌동, 남한산성면, 내곡동, 다산동, 다율동, 당하동, 대자동, 대장동, 대화동, 덕이동, 덕풍동, 도농동, 도봉동, 동패동, 망월동, 맥금동, 목동동, 문발동, 문산읍, 백석동, 법곳동, 별내동, 사노동, 산남동, 산황동, 상계동, 상산곡동, 상일동, 상지석동, 서패동, 선동, 선유동, 설문동, 성사동, 성석동, 송정동, 송촌동, 수석동, 수택동, 식사동, 신원동, 신장동, 신촌동, 신평동, 쌍령동, 아동동, 야당동, 야동동, 양벌동, 양촌읍, 역동, 연다산동, 오금동, 오도동, 와동동, 운양동, 원당동, 월곶면, 월롱면, 인창동, 장단면, 장암동, 장항동, 장흥면, 조리읍, 주교동, 지금동, 지축동, 창우동, 천현동, 초월읍, 초이동, 초일동, 춘궁동, 탄벌동, 탄현동, 탄현면, 토당동, 토평동, 통진읍, 퇴계원읍, 퇴촌면, 파주읍, 풍동, 풍산동, 하사창동, 하산곡동, 하성면, 하지석동, 행주외동, 호원동, 회덕동","corridorRadiusKm":1.0,"userOverrides":false,"customFilters":[],"destinationGroups":{"도봉구":["도봉동"],"노원구":["상계동"],"강동구":["강일동","고덕동","상일동"],"의정부시":["가능동","장암동","호원동"],"고양시 덕양구":["내곡동","대자동","대장동","선유동","성사동","신원동","신평동","오금동","원당동","주교동","지축동","토당동","행주외동"],"고양시 일산동구":["백석동","산황동","설문동","성석동","식사동","장항동","풍동"],"고양시 일산서구":["가좌동","구산동","대화동","덕이동","법곳동","탄현동"],"구리시":["갈매동","사노동","수택동","인창동","토평동"],"남양주시":["다산동","도농동","별내동","수석동","지금동","퇴계원읍"],"하남시":["광암동","교산동","덕풍동","망월동","상산곡동","선동","신장동","창우동","천현동","초이동","초일동","춘궁동","풍산동","하사창동","하산곡동"],"파주시":["검산동","교하동","금릉동","금촌동","다율동","당하동","동패동","맥금동","목동동","문발동","문산읍","산남동","상지석동","서패동","송촌동","신촌동","아동동","야당동","야동동","연다산동","오도동","와동동","월롱면","장단면","조리읍","탄현면","파주읍","하지석동"],"김포시":["걸포동","고촌읍","양촌읍","운양동","월곶면","통진읍","하성면"],"광주시":["경안동","남한산성면","송정동","쌍령동","양벌동","역동","초월읍","탄벌동","퇴촌면","회덕동"],"양주시":["장흥면"]}}
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `🚦 [ROADMAP 22:19:56.344] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`
- `🚦 [ROADMAP 22:19:56.352] [📱앱] [LIST] AccessibilityService로 바뀐 리스트 감지 후 text 추출`
- `🚦 [ROADMAP 22:19:56.352] [📱앱] [LIST] 리스트에서 바뀐 text 감지 후 text 추출`
- `🚦 [ROADMAP 22:19:56.354] [📱앱] [LIST] [인성 Socket] 인성콜에 선택된 콜 정보 전달 (꿀콜 클릭!)`
- `🚦 [ROADMAP 22:19:56.407] [📱앱] 버튼 터치 완료 (가로채기 성공) X:917.0, Y:568.0`
- `🚦 [ROADMAP 22:19:56.547] [📱앱] [DETAIL_PRE_CONFIRM] 새로운 화면 진입 판별: DETAIL_PRE_CONFIRM`
- `🚦 [ROADMAP 22:19:56.553] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지 진입으로 바뀐 text중 '확정' 추출 후 클릭`
- `🚦 [ROADMAP 22:19:56.554] [📱앱] '확정' 버튼 인식 ➡️ 클릭 시도`

    <details>
    <summary>🔽 🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용...</summary>

    ```json
    🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용을 긁어서 POST /api/orders/detail 로 보내주세요."}
    ```

    </details>
- `🚦 [ROADMAP 22:19:56.559] [📱앱] [HTTP 폴링] 응답 /orders/confirm`
- `🚦 [ROADMAP 22:19:56.610] [📱앱] 버튼 터치 완료 (가로채기 성공) X:161.0, Y:2251.0`
- `🚦 [ROADMAP 22:19:56.744] [📱앱] [DETAIL_CONFIRMED] 새로운 화면 진입 판별: DETAIL_CONFIRMED`
- `🚦 [ROADMAP 22:19:56.744] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 22:19:56.745] [📱앱] '적요상세' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:19:56.746] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '적요상세' 추출 후 클릭`
- `🚦 [ROADMAP 22:19:56.797] [📱앱] 버튼 터치 완료 (가로채기 성공) X:149.0, Y:1153.0`
- `🚦 [ROADMAP 22:19:56.930] [📱앱] [POPUP_MEMO] 새로운 화면 진입 판별: POPUP_MEMO`
- `🚦 [ROADMAP 22:19:56.930] [📱앱] [POPUP_MEMO] 적요상세페이지에서 '젹요 내용' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 22:19:56.931] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:19:56.984] [📱앱] 버튼 터치 완료 (가로채기 성공) X:540.0, Y:2264.0`
- `🚦 [ROADMAP 22:19:57.029] [📱앱] [DETAIL_CONFIRMED] 새로운 화면 진입 판별: DETAIL_CONFIRMED`
- `🚦 [ROADMAP 22:19:57.029] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 22:19:57.030] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '출발지' 추출 후 클릭`
- `🚦 [ROADMAP 22:19:57.030] [📱앱] '출발지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:19:57.085] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1592.0`
- `🚦 [ROADMAP 22:19:57.156] [📱앱] [POPUP_PICKUP] 새로운 화면 진입 판별: POPUP_PICKUP`
- `🚦 [ROADMAP 22:19:57.156] [📱앱] [POPUP_PICKUP] 출발지페이지 text중 '전화, 위치' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 22:19:57.157] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:19:57.208] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`
- `🚦 [ROADMAP 22:19:57.337] [📱앱] [DETAIL_CONFIRMED] 새로운 화면 진입 판별: DETAIL_CONFIRMED`
- `🚦 [ROADMAP 22:19:57.337] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 22:19:57.337] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '도착지' 추출 후 클릭`
- `🚦 [ROADMAP 22:19:57.338] [📱앱] '도착지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:19:57.392] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1742.0`
- `🚦 [ROADMAP 22:19:57.526] [📱앱] [POPUP_DROPOFF] 새로운 화면 진입 판별: POPUP_DROPOFF`
- `🚦 [ROADMAP 22:19:57.527] [📱앱] [POPUP_DROPOFF] 도착지페이지 text중 '전화, 위치' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 22:19:57.527] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:19:57.528] [📱앱] [POPUP_DROPOFF] 확정페이지 진입`
- `🚦 [ROADMAP 22:19:57.579] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`

    <details>
    <summary>🔽 🌐 [post /detail response / 200] {"deviceId":"server","action":"KEEP"}</summary>

    ```json
    🌐 [post /detail response / 200] {"deviceId":"server","action":"KEEP"}
    ```

    </details>
- `🚦 [ROADMAP 22:20:04.093] [📱앱] [HTTP 폴링] 응답 /orders/detail 유지 정보 전송`
- `🚦 [ROADMAP 22:20:04.613] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:20:04.615] [📱앱] [POPUP_DROPOFF] '닫기' 클릭 후 리스트 페이지 복귀 (유지)`
- `🚦 [ROADMAP 22:20:04.669] [📱앱] 버튼 터치 완료 (가로채기 성공) X:122.0, Y:2251.0`
- `🚦 [ROADMAP 22:20:04.841] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`

    <details>
    <summary>🔽 {...</summary>

    ```json
                                                                                                        {
                                                                                                          "dropoff": "초월읍",
                                                                                                          "fare": 31000,
                                                                                                          "id": "17707f0c-e751-4b76-8a39-5c94a1101eb6",
                                                                                                          "pickup": "포곡읍",
                                                                                                          "pickupDistance": 13.6,
                                                                                                          "rawText": "13.6, 14.4, 급송/포곡읍, 초월읍, 라, 3.1",
                                                                                                          "timestamp": "2026-04-16T22:20:04Z",
                                                                                                          "type": "NEW_ORDER",
                                                                                                          "vehicleType": "라"
                                                                                                        }
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
    └─ [data][0] 상세 정보:
    ```

    </details>
- `🚦 [ROADMAP 22:20:05.169] [📱앱] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`

    <details>
    <summary>🔽 {"allowedVehicleTypes":["다마스","라보","오토바이"],"isActive":false,"isSharedMode":true,...</summary>

    ```json
                                                                                                        {"allowedVehicleTypes":["다마스","라보","오토바이"],"isActive":false,"isSharedMode":true,"pickupRadiusKm":30.0,"minFare":35000.0,"maxFare":1000000.0,"excludedKeywords":"착불,수거,까대기,전화금지,타일","destinationCity":"파주시","destinationRadiusKm":10.0,"destinationKeywords":"가능동, 가좌동, 갈매동, 강일동, 걸포동, 검산동, 경안동, 고덕동, 고촌읍, 광암동, 교산동, 교하동, 구산동, 금릉동, 금촌동, 남한산성면, 내곡동, 다산동, 다율동, 당하동, 대자동, 대장동, 대화동, 덕이동, 덕풍동, 도농동, 도봉동, 동패동, 망월동, 맥금동, 목동동, 문발동, 문산읍, 백석동, 법곳동, 별내동, 사노동, 산남동, 산황동, 상계동, 상산곡동, 상일동, 상지석동, 서패동, 선동, 선유동, 설문동, 성사동, 성석동, 송정동, 송촌동, 수석동, 수택동, 식사동, 신원동, 신장동, 신촌동, 신평동, 쌍령동, 아동동, 야당동, 야동동, 양벌동, 양촌읍, 역동, 연다산동, 오금동, 오도동, 와동동, 운양동, 원당동, 월곶면, 월롱면, 인창동, 장단면, 장암동, 장항동, 장흥면, 조리읍, 주교동, 지금동, 지축동, 창우동, 천현동, 초월읍, 초이동, 초일동, 춘궁동, 탄벌동, 탄현동, 탄현면, 토당동, 토평동, 통진읍, 퇴계원읍, 퇴촌면, 파주읍, 풍동, 풍산동, 하사창동, 하산곡동, 하성면, 하지석동, 행주외동, 호원동, 회덕동","corridorRadiusKm":1.0,"userOverrides":false,"customFilters":[],"destinationGroups":{"도봉구":["도봉동"],"노원구":["상계동"],"강동구":["강일동","고덕동","상일동"],"의정부시":["가능동","장암동","호원동"],"고양시 덕양구":["내곡동","대자동","대장동","선유동","성사동","신원동","신평동","오금동","원당동","주교동","지축동","토당동","행주외동"],"고양시 일산동구":["백석동","산황동","설문동","성석동","식사동","장항동","풍동"],"고양시 일산서구":["가좌동","구산동","대화동","덕이동","법곳동","탄현동"],"구리시":["갈매동","사노동","수택동","인창동","토평동"],"남양주시":["다산동","도농동","별내동","수석동","지금동","퇴계원읍"],"하남시":["광암동","교산동","덕풍동","망월동","상산곡동","선동","신장동","창우동","천현동","초이동","초일동","춘궁동","풍산동","하사창동","하산곡동"],"파주시":["검산동","교하동","금릉동","금촌동","다율동","당하동","동패동","맥금동","목동동","문발동","문산읍","산남동","상지석동","서패동","송촌동","신촌동","아동동","야당동","야동동","연다산동","오도동","와동동","월롱면","장단면","조리읍","탄현면","파주읍","하지석동"],"김포시":["걸포동","고촌읍","양촌읍","운양동","월곶면","통진읍","하성면"],"광주시":["경안동","남한산성면","송정동","쌍령동","양벌동","역동","초월읍","탄벌동","퇴촌면","회덕동"],"양주시":["장흥면"]}}
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `🚦 [ROADMAP 22:20:06.338] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`
- `🚦 [ROADMAP 22:20:06.345] [📱앱] [LIST] AccessibilityService로 바뀐 리스트 감지 후 text 추출`
- `🚦 [ROADMAP 22:20:06.346] [📱앱] [LIST] 리스트에서 바뀐 text 감지 후 text 추출`
- `🚦 [ROADMAP 22:20:06.347] [📱앱] [LIST] [인성 Socket] 인성콜에 선택된 콜 정보 전달 (꿀콜 클릭!)`
- `🚦 [ROADMAP 22:20:06.398] [📱앱] 버튼 터치 완료 (가로채기 성공) X:917.0, Y:568.0`
- `🚦 [ROADMAP 22:20:06.544] [📱앱] [DETAIL_PRE_CONFIRM] 새로운 화면 진입 판별: DETAIL_PRE_CONFIRM`
- `🚦 [ROADMAP 22:20:06.546] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지 진입으로 바뀐 text중 '확정' 추출 후 클릭`
- `🚦 [ROADMAP 22:20:06.547] [📱앱] '확정' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:20:06.599] [📱앱] 버튼 터치 완료 (가로채기 성공) X:161.0, Y:2251.0`

    <details>
    <summary>🔽 🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용...</summary>

    ```json
    🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용을 긁어서 POST /api/orders/detail 로 보내주세요."}
    ```

    </details>
- `🚦 [ROADMAP 22:20:06.658] [📱앱] [HTTP 폴링] 응답 /orders/confirm`
- `🚦 [ROADMAP 22:20:06.737] [📱앱] [DETAIL_CONFIRMED] 새로운 화면 진입 판별: DETAIL_CONFIRMED`
- `🚦 [ROADMAP 22:20:06.738] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 22:20:06.738] [📱앱] '적요상세' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:20:06.739] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '적요상세' 추출 후 클릭`
- `🚦 [ROADMAP 22:20:06.791] [📱앱] 버튼 터치 완료 (가로채기 성공) X:149.0, Y:1153.0`
- `🚦 [ROADMAP 22:20:06.911] [📱앱] [POPUP_MEMO] 새로운 화면 진입 판별: POPUP_MEMO`
- `🚦 [ROADMAP 22:20:06.912] [📱앱] [POPUP_MEMO] 적요상세페이지에서 '젹요 내용' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 22:20:06.912] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:20:06.964] [📱앱] 버튼 터치 완료 (가로채기 성공) X:540.0, Y:2264.0`
- `🚦 [ROADMAP 22:20:07.012] [📱앱] [DETAIL_CONFIRMED] 새로운 화면 진입 판별: DETAIL_CONFIRMED`
- `🚦 [ROADMAP 22:20:07.012] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 22:20:07.013] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '출발지' 추출 후 클릭`
- `🚦 [ROADMAP 22:20:07.014] [📱앱] '출발지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:20:07.066] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1592.0`
- `🚦 [ROADMAP 22:20:07.141] [📱앱] [POPUP_PICKUP] 새로운 화면 진입 판별: POPUP_PICKUP`
- `🚦 [ROADMAP 22:20:07.142] [📱앱] [POPUP_PICKUP] 출발지페이지 text중 '전화, 위치' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 22:20:07.143] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:20:07.195] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`
- `🚦 [ROADMAP 22:20:07.247] [📱앱] [DETAIL_CONFIRMED] 새로운 화면 진입 판별: DETAIL_CONFIRMED`
- `🚦 [ROADMAP 22:20:07.247] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 22:20:07.247] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '도착지' 추출 후 클릭`
- `🚦 [ROADMAP 22:20:07.250] [📱앱] '도착지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:20:07.302] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1742.0`
- `🚦 [ROADMAP 22:20:07.359] [📱앱] [POPUP_DROPOFF] 새로운 화면 진입 판별: POPUP_DROPOFF`
- `🚦 [ROADMAP 22:20:07.360] [📱앱] [POPUP_DROPOFF] 도착지페이지 text중 '전화, 위치' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 22:20:07.360] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:20:07.361] [📱앱] [POPUP_DROPOFF] 확정페이지 진입`
- `🚦 [ROADMAP 22:20:07.413] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`

    <details>
    <summary>🔽 🌐 [post /detail response / 200] {"deviceId":"server","action":"CANCEL"}</summary>

    ```json
    🌐 [post /detail response / 200] {"deviceId":"server","action":"CANCEL"}
    ```

    </details>
- `🚦 [ROADMAP 22:20:11.696] [📱앱] [HTTP 폴링] 응답 /orders/detail 취소 정보 전송`
- `🚦 [ROADMAP 22:20:12.206] [📱앱] '취소' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:20:12.209] [📱앱] [POPUP_DROPOFF] '취소' 클릭 후 인성 Socket 취소 지시`
- `🚦 [ROADMAP 22:20:12.261] [📱앱] 버튼 터치 완료 (가로채기 성공) X:950.0, Y:478.0`
- `🚦 [ROADMAP 22:20:12.429] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`

    <details>
    <summary>🔽 {...</summary>

    ```json
                                                                                                        {
                                                                                                          "dropoff": "해운대구",
                                                                                                          "fare": 465000,
                                                                                                          "id": "50283290-38b2-49bb-a3d4-8efb01e1f531",
                                                                                                          "pickup": "실촌읍",
                                                                                                          "pickupDistance": 5.0,
                                                                                                          "rawText": "5.0, 301.2, @, 실촌읍, 해운대구, 다, 46.5",
                                                                                                          "timestamp": "2026-04-16T22:20:12Z",
                                                                                                          "type": "NEW_ORDER",
                                                                                                          "vehicleType": "다"
                                                                                                        }
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
    └─ [data][0] 상세 정보:
    ```

    </details>
- `🚦 [ROADMAP 22:20:12.756] [📱앱] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`

    <details>
    <summary>🔽 {"allowedVehicleTypes":["다마스","라보","오토바이"],"isActive":true,"isSharedMode":true,"...</summary>

    ```json
                                                                                                        {"allowedVehicleTypes":["다마스","라보","오토바이"],"isActive":true,"isSharedMode":true,"pickupRadiusKm":30.0,"minFare":35000.0,"maxFare":1000000.0,"excludedKeywords":"착불,수거,까대기,전화금지,타일","destinationCity":"파주시","destinationRadiusKm":10.0,"destinationKeywords":"가능동, 가좌동, 갈매동, 강일동, 걸포동, 검산동, 경안동, 고덕동, 고촌읍, 광암동, 교산동, 교하동, 구산동, 금릉동, 금촌동, 남한산성면, 내곡동, 다산동, 다율동, 당하동, 대자동, 대장동, 대화동, 덕이동, 덕풍동, 도농동, 도봉동, 동패동, 망월동, 맥금동, 목동동, 문발동, 문산읍, 백석동, 법곳동, 별내동, 사노동, 산남동, 산황동, 상계동, 상산곡동, 상일동, 상지석동, 서패동, 선동, 선유동, 설문동, 성사동, 성석동, 송정동, 송촌동, 수석동, 수택동, 식사동, 신원동, 신장동, 신촌동, 신평동, 쌍령동, 아동동, 야당동, 야동동, 양벌동, 양촌읍, 역동, 연다산동, 오금동, 오도동, 와동동, 운양동, 원당동, 월곶면, 월롱면, 인창동, 장단면, 장암동, 장지동, 장항동, 장흥면, 조리읍, 주교동, 지금동, 지축동, 창우동, 천현동, 초월읍, 초이동, 초일동, 춘궁동, 탄벌동, 탄현동, 탄현면, 토당동, 토평동, 통진읍, 퇴계원읍, 퇴촌면, 파주읍, 풍동, 풍산동, 하사창동, 하산곡동, 하성면, 하지석동, 행주외동, 호원동, 회덕동","corridorRadiusKm":1.0,"userOverrides":false,"customFilters":[],"destinationGroups":{"도봉구":["도봉동"],"노원구":["상계동"],"강동구":["강일동","고덕동","상일동"],"의정부시":["가능동","장암동","호원동"],"고양시 덕양구":["내곡동","대자동","대장동","선유동","성사동","신원동","신평동","오금동","원당동","주교동","지축동","토당동","행주외동"],"고양시 일산동구":["백석동","산황동","설문동","성석동","식사동","장항동","풍동"],"고양시 일산서구":["가좌동","구산동","대화동","덕이동","법곳동","탄현동"],"구리시":["갈매동","사노동","수택동","인창동","토평동"],"남양주시":["다산동","도농동","별내동","수석동","지금동","퇴계원읍"],"하남시":["광암동","교산동","덕풍동","망월동","상산곡동","선동","신장동","창우동","천현동","초이동","초일동","춘궁동","풍산동","하사창동","하산곡동"],"파주시":["검산동","교하동","금릉동","금촌동","다율동","당하동","동패동","맥금동","목동동","문발동","문산읍","산남동","상지석동","서패동","송촌동","신촌동","아동동","야당동","야동동","연다산동","오도동","와동동","월롱면","장단면","조리읍","탄현면","파주읍","하지석동"],"김포시":["걸포동","고촌읍","양촌읍","운양동","월곶면","통진읍","하성면"],"광주시":["경안동","남한산성면","송정동","쌍령동","양벌동","역동","장지동","초월읍","탄벌동","퇴촌면","회덕동"],"양주시":["장흥면"]}}
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `🚦 [ROADMAP 22:20:16.347] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`

    <details>
    <summary>🔽 {...</summary>

    ```json
                                                                                                        {
                                                                                                          "dropoff": "광진구",
                                                                                                          "fare": 60000,
                                                                                                          "id": "eaeaf6bf-e1df-411b-a13c-858488854ee8",
                                                                                                          "pickup": "곤지암읍",
                                                                                                          "pickupDistance": 12.3,
                                                                                                          "rawText": "12.3, 31.9, 급송/곤지암읍, 광진구, 라, 6.0",
                                                                                                          "timestamp": "2026-04-16T22:20:16Z",
                                                                                                          "type": "NEW_ORDER",
                                                                                                          "vehicleType": "라"
                                                                                                        }
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
    └─ [data][0] 상세 정보:
    ```

    </details>
- `🚦 [ROADMAP 22:20:16.674] [📱앱] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`

    <details>
    <summary>🔽 {"allowedVehicleTypes":["다마스","라보","오토바이"],"isActive":true,"isSharedMode":true,"...</summary>

    ```json
                                                                                                        {"allowedVehicleTypes":["다마스","라보","오토바이"],"isActive":true,"isSharedMode":true,"pickupRadiusKm":30.0,"minFare":35000.0,"maxFare":1000000.0,"excludedKeywords":"착불,수거,까대기,전화금지,타일","destinationCity":"파주시","destinationRadiusKm":10.0,"destinationKeywords":"가능동, 가좌동, 갈매동, 강일동, 걸포동, 검산동, 경안동, 고덕동, 고촌읍, 광암동, 교산동, 교하동, 구산동, 금릉동, 금촌동, 남한산성면, 내곡동, 다산동, 다율동, 당하동, 대자동, 대장동, 대화동, 덕이동, 덕풍동, 도농동, 도봉동, 동패동, 망월동, 맥금동, 목동동, 문발동, 문산읍, 백석동, 법곳동, 별내동, 사노동, 산남동, 산황동, 상계동, 상산곡동, 상일동, 상지석동, 서패동, 선동, 선유동, 설문동, 성사동, 성석동, 송정동, 송촌동, 수석동, 수택동, 식사동, 신원동, 신장동, 신촌동, 신평동, 쌍령동, 아동동, 야당동, 야동동, 양벌동, 양촌읍, 역동, 연다산동, 오금동, 오도동, 와동동, 운양동, 원당동, 월곶면, 월롱면, 인창동, 장단면, 장암동, 장지동, 장항동, 장흥면, 조리읍, 주교동, 지금동, 지축동, 창우동, 천현동, 초월읍, 초이동, 초일동, 춘궁동, 탄벌동, 탄현동, 탄현면, 토당동, 토평동, 통진읍, 퇴계원읍, 퇴촌면, 파주읍, 풍동, 풍산동, 하사창동, 하산곡동, 하성면, 하지석동, 행주외동, 호원동, 회덕동","corridorRadiusKm":1.0,"userOverrides":false,"customFilters":[],"destinationGroups":{"도봉구":["도봉동"],"노원구":["상계동"],"강동구":["강일동","고덕동","상일동"],"의정부시":["가능동","장암동","호원동"],"고양시 덕양구":["내곡동","대자동","대장동","선유동","성사동","신원동","신평동","오금동","원당동","주교동","지축동","토당동","행주외동"],"고양시 일산동구":["백석동","산황동","설문동","성석동","식사동","장항동","풍동"],"고양시 일산서구":["가좌동","구산동","대화동","덕이동","법곳동","탄현동"],"구리시":["갈매동","사노동","수택동","인창동","토평동"],"남양주시":["다산동","도농동","별내동","수석동","지금동","퇴계원읍"],"하남시":["광암동","교산동","덕풍동","망월동","상산곡동","선동","신장동","창우동","천현동","초이동","초일동","춘궁동","풍산동","하사창동","하산곡동"],"파주시":["검산동","교하동","금릉동","금촌동","다율동","당하동","동패동","맥금동","목동동","문발동","문산읍","산남동","상지석동","서패동","송촌동","신촌동","아동동","야당동","야동동","연다산동","오도동","와동동","월롱면","장단면","조리읍","탄현면","파주읍","하지석동"],"김포시":["걸포동","고촌읍","양촌읍","운양동","월곶면","통진읍","하성면"],"광주시":["경안동","남한산성면","송정동","쌍령동","양벌동","역동","장지동","초월읍","탄벌동","퇴촌면","회덕동"],"양주시":["장흥면"]}}
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `🚦 [ROADMAP 22:20:21.364] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`

    <details>
    <summary>🔽 {...</summary>

    ```json
                                                                                                        {
                                                                                                          "dropoff": "부평구",
                                                                                                          "fare": 79000,
                                                                                                          "id": "807b8ba5-9b72-4cd2-9ea6-82ccaacba0ef",
                                                                                                          "pickup": "오포읍",
                                                                                                          "pickupDistance": 5.0,
                                                                                                          "rawText": "5.0, 45.2, @, 오포읍, 부평구, 다, 7.9",
                                                                                                          "timestamp": "2026-04-16T22:20:21Z",
                                                                                                          "type": "NEW_ORDER",
                                                                                                          "vehicleType": "다"
                                                                                                        }
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
    └─ [data][0] 상세 정보:
    ```

    </details>
- `🚦 [ROADMAP 22:20:21.715] [📱앱] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`

    <details>
    <summary>🔽 {"allowedVehicleTypes":["다마스","라보","오토바이"],"isActive":true,"isSharedMode":true,"...</summary>

    ```json
                                                                                                        {"allowedVehicleTypes":["다마스","라보","오토바이"],"isActive":true,"isSharedMode":true,"pickupRadiusKm":30.0,"minFare":35000.0,"maxFare":1000000.0,"excludedKeywords":"착불,수거,까대기,전화금지,타일","destinationCity":"파주시","destinationRadiusKm":10.0,"destinationKeywords":"가능동, 가좌동, 갈매동, 강일동, 걸포동, 검산동, 경안동, 고덕동, 고촌읍, 광암동, 교산동, 교하동, 구산동, 금릉동, 금촌동, 남한산성면, 내곡동, 다산동, 다율동, 당하동, 대자동, 대장동, 대화동, 덕이동, 덕풍동, 도농동, 도봉동, 동패동, 망월동, 맥금동, 목동동, 문발동, 문산읍, 백석동, 법곳동, 별내동, 사노동, 산남동, 산황동, 상계동, 상산곡동, 상일동, 상지석동, 서패동, 선동, 선유동, 설문동, 성사동, 성석동, 송정동, 송촌동, 수석동, 수택동, 식사동, 신원동, 신장동, 신촌동, 신평동, 쌍령동, 아동동, 야당동, 야동동, 양벌동, 양촌읍, 역동, 연다산동, 오금동, 오도동, 와동동, 운양동, 원당동, 월곶면, 월롱면, 인창동, 장단면, 장암동, 장지동, 장항동, 장흥면, 조리읍, 주교동, 지금동, 지축동, 창우동, 천현동, 초월읍, 초이동, 초일동, 춘궁동, 탄벌동, 탄현동, 탄현면, 토당동, 토평동, 통진읍, 퇴계원읍, 퇴촌면, 파주읍, 풍동, 풍산동, 하사창동, 하산곡동, 하성면, 하지석동, 행주외동, 호원동, 회덕동","corridorRadiusKm":1.0,"userOverrides":false,"customFilters":[],"destinationGroups":{"도봉구":["도봉동"],"노원구":["상계동"],"강동구":["강일동","고덕동","상일동"],"의정부시":["가능동","장암동","호원동"],"고양시 덕양구":["내곡동","대자동","대장동","선유동","성사동","신원동","신평동","오금동","원당동","주교동","지축동","토당동","행주외동"],"고양시 일산동구":["백석동","산황동","설문동","성석동","식사동","장항동","풍동"],"고양시 일산서구":["가좌동","구산동","대화동","덕이동","법곳동","탄현동"],"구리시":["갈매동","사노동","수택동","인창동","토평동"],"남양주시":["다산동","도농동","별내동","수석동","지금동","퇴계원읍"],"하남시":["광암동","교산동","덕풍동","망월동","상산곡동","선동","신장동","창우동","천현동","초이동","초일동","춘궁동","풍산동","하사창동","하산곡동"],"파주시":["검산동","교하동","금릉동","금촌동","다율동","당하동","동패동","맥금동","목동동","문발동","문산읍","산남동","상지석동","서패동","송촌동","신촌동","아동동","야당동","야동동","연다산동","오도동","와동동","월롱면","장단면","조리읍","탄현면","파주읍","하지석동"],"김포시":["걸포동","고촌읍","양촌읍","운양동","월곶면","통진읍","하성면"],"광주시":["경안동","남한산성면","송정동","쌍령동","양벌동","역동","장지동","초월읍","탄벌동","퇴촌면","회덕동"],"양주시":["장흥면"]}}
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `🚦 [ROADMAP 22:20:26.361] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`

    <details>
    <summary>🔽 {...</summary>

    ```json
                                                                                                        {
                                                                                                          "dropoff": "송정동",
                                                                                                          "fare": 30000,
                                                                                                          "id": "a7f928ae-a318-49f6-a36d-379cc3ecb7ee",
                                                                                                          "pickup": "경안동",
                                                                                                          "pickupDistance": 0.2,
                                                                                                          "rawText": "0.2, 1.9, 경안동, 송정동, 다, 3.0",
                                                                                                          "timestamp": "2026-04-16T22:20:26Z",
                                                                                                          "type": "NEW_ORDER",
                                                                                                          "vehicleType": "다"
                                                                                                        }
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
    └─ [data][0] 상세 정보:
    ```

    </details>
- `🚦 [ROADMAP 22:20:26.686] [📱앱] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    {"allowedVehicleTypes":["다마스","라보","오토바이"],"isActive":true,"isSharedMode":true,"pickupRadiusKm":30.0,"minFare":35000.0,"maxFare":1000000.0,"excludedKeywords":"착불,수거,까대기,전화금지,타일","destinationCity":"파주시","destinationRadiusKm":10.0,"destinationKeywords":"가능동, 가락동, 가양동, 가좌동, 갈매동, 갈현동, 감북동, 감이동, 감일동, 감정동, 강매동, 강일동, 강하면, 개화동, 거여동, 걸포동, 검산동, 검암동, 경안동, 계산동, 고강동, 고덕동, 고산동, 고양동, 고읍동, 고촌읍, 곤지암읍, 공릉동, 공항동, 과해동, 관산동, 광사동, 광암동, 광장동, 광적면, 광탄면, 교문동, 교산동, 교하동, 구기동, 구래동, 구산동, 구의동, 군자동, 귤현동, 금곡동, 금광동, 금릉동, 금오동, 금촌동, 길동, 길음동, 낙양동, 남가좌동, 남방동, 남종면, 남한산성면, 내곡동, 내발산동, 내유동, 노오지동, 녹번동, 녹양동, 능동, 능평동, 다남동, 다산동, 다율동, 단대동, 답십리동, 당정동, 당하동, 대곡동, 대곶면, 대자동, 대장동, 대조동, 대화동, 덕계동, 덕은동, 덕이동, 덕풍동, 도내동, 도농동, 도봉동, 도척면, 도촌동, 돈암동, 동산동, 동양동, 동패동, 둑실동, 둔촌동, 등촌동, 마곡동, 마두동, 마산동, 마장동, 마전동, 마천동, 만송동, 망우동, 망월동, 매산동, 맥금동, 면목동, 명일동, 모현읍, 목동, 목동동, 목상동, 목현동, 묵동, 문발동, 문봉동, 문산읍, 문정동, 문형동, 미사동, 미아동, 민락동, 박촌동, 방이동, 방축동, 방학동, 방화동, 배알미동, 백석동, 백석읍, 번동, 법곳동, 벽제동, 별내동, 별내면, 병방동, 복정동, 부암동, 북가좌동, 북변동, 북한동, 분당동, 불광동, 불로동, 사근동, 사노동, 사리현동, 사우동, 산곡동, 산남동, 산북동, 산북면, 산성동, 산황동, 삼동, 삼송동, 삼전동, 삼정동, 삼패동, 상계동, 상대원동, 상봉동, 상사창동, 상산곡동, 상암동, 상야동, 상월곡동, 상일동, 상지석동, 서운동, 서패동, 서현동, 석관동, 석촌동, 선동, 선유동, 선주지동, 설문동, 성남동, 성내동, 성사동, 성산동, 성석동, 성수동, 세곡동, 소흘읍, 송정동, 송촌동, 송파동, 수색동, 수서동, 수석동, 수유동, 수진동, 수택동, 시천동, 식사동, 신곡동, 신내동, 신둔면, 신사동, 신영동, 신원동, 신월동, 신장동, 신천동, 신촌동, 신평동, 신현동, 신흥동, 쌍령동, 쌍문동, 아동동, 아천동, 안암동, 암사동, 야당동, 야동동, 야탑동, 양벌동, 양서면, 양지동, 양지읍, 양촌읍, 어둔동, 여수동, 역동, 역촌동, 연다산동, 염창동, 오곡동, 오금동, 오남읍, 오도동, 오류동, 오쇠동, 오정동, 와동동, 와부읍, 왕길동, 외발산동, 용답동, 용두동, 용종동, 용현동, 우이동, 운양동, 원당동, 원종동, 원흥동, 월계동, 월곶면, 월롱면, 유양동, 율동, 율현동, 은행동, 응암동, 의정부동, 이매동, 이문동, 이패동, 이화동, 인창동, 일산동, 일원동, 일패동, 임학동, 자곡동, 자양동, 자일동, 잠실동, 장기동, 장단면, 장안동, 장암동, 장위동, 장지동, 장항동, 장흥면, 전농동, 정릉동, 정발산동, 제기동, 조리읍, 조안면, 종암동, 주교동, 주엽동, 중계동, 중곡동, 중대동, 중산동, 중앙동, 중화동, 증산동, 지금동, 지영동, 지축동, 직동, 진건읍, 진관동, 진접읍, 창곡동, 창동, 창우동, 천현동, 천호동, 청량리동, 초월읍, 초이동, 초일동, 추자동, 춘궁동, 탄벌동, 탄현동, 탄현면, 태전동, 태평동, 토당동, 토평동, 통진읍, 퇴계원읍, 퇴촌면, 파주읍, 평내동, 평동, 평창동, 포곡읍, 풍납동, 풍동, 풍무동, 풍산동, 하계동, 하대원동, 하사창동, 하산곡동, 하성면, 하야동, ?
    ```

    </details>
- `🚦 [ROADMAP 22:20:31.365] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`

    <details>
    <summary>🔽 {...</summary>

    ```json
                                                                                                        {
                                                                                                          "dropoff": "정왕동",
                                                                                                          "fare": 81000,
                                                                                                          "id": "efe3844e-ba44-4f5e-bea5-18d8deb63867",
                                                                                                          "pickup": "경안동",
                                                                                                          "pickupDistance": 0.2,
                                                                                                          "rawText": "0.2, 47.5, @, 오후2시7/경안동, 정왕동, 다, 8.1",
                                                                                                          "timestamp": "2026-04-16T22:20:31Z",
                                                                                                          "type": "NEW_ORDER",
                                                                                                          "vehicleType": "다"
                                                                                                        }
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
    └─ [data][0] 상세 정보:
    ```

    </details>
- `🚦 [ROADMAP 22:20:31.704] [📱앱] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    {"allowedVehicleTypes":["다마스","라보","오토바이"],"isActive":true,"isSharedMode":true,"pickupRadiusKm":30.0,"minFare":35000.0,"maxFare":1000000.0,"excludedKeywords":"착불,수거,까대기,전화금지,타일","destinationCity":"파주시","destinationRadiusKm":10.0,"destinationKeywords":"가능동, 가락동, 가양동, 가좌동, 갈매동, 갈현동, 감북동, 감이동, 감일동, 감정동, 강매동, 강일동, 강하면, 개화동, 거여동, 걸포동, 검산동, 검암동, 경안동, 계산동, 고강동, 고덕동, 고산동, 고양동, 고읍동, 고촌읍, 곤지암읍, 공릉동, 공항동, 과해동, 관산동, 광사동, 광암동, 광장동, 광적면, 광탄면, 교문동, 교산동, 교하동, 구기동, 구래동, 구산동, 구의동, 군자동, 귤현동, 금곡동, 금광동, 금릉동, 금오동, 금촌동, 길동, 길음동, 낙양동, 남가좌동, 남방동, 남종면, 남한산성면, 내곡동, 내발산동, 내유동, 노오지동, 녹번동, 녹양동, 능동, 능평동, 다남동, 다산동, 다율동, 단대동, 답십리동, 당정동, 당하동, 대곡동, 대곶면, 대자동, 대장동, 대조동, 대화동, 덕계동, 덕은동, 덕이동, 덕풍동, 도내동, 도농동, 도봉동, 도척면, 도촌동, 돈암동, 동산동, 동양동, 동패동, 둑실동, 둔촌동, 등촌동, 마곡동, 마두동, 마산동, 마장동, 마전동, 마천동, 만송동, 망우동, 망월동, 매산동, 맥금동, 면목동, 명일동, 모현읍, 목동, 목동동, 목상동, 목현동, 묵동, 문발동, 문봉동, 문산읍, 문정동, 문형동, 미사동, 미아동, 민락동, 박촌동, 방이동, 방축동, 방학동, 방화동, 배알미동, 백석동, 백석읍, 번동, 법곳동, 벽제동, 별내동, 별내면, 병방동, 복정동, 부암동, 북가좌동, 북변동, 북한동, 분당동, 불광동, 불로동, 사근동, 사노동, 사리현동, 사우동, 산곡동, 산남동, 산북동, 산북면, 산성동, 산황동, 삼동, 삼송동, 삼전동, 삼정동, 삼패동, 상계동, 상대원동, 상봉동, 상사창동, 상산곡동, 상암동, 상야동, 상월곡동, 상일동, 상지석동, 서운동, 서패동, 서현동, 석관동, 석촌동, 선동, 선유동, 선주지동, 설문동, 성남동, 성내동, 성사동, 성산동, 성석동, 성수동, 세곡동, 소흘읍, 송정동, 송촌동, 송파동, 수색동, 수서동, 수석동, 수유동, 수진동, 수택동, 시천동, 식사동, 신곡동, 신내동, 신둔면, 신사동, 신영동, 신원동, 신월동, 신장동, 신천동, 신촌동, 신평동, 신현동, 신흥동, 쌍령동, 쌍문동, 아동동, 아천동, 안암동, 암사동, 야당동, 야동동, 야탑동, 양벌동, 양서면, 양지동, 양지읍, 양촌읍, 어둔동, 여수동, 역동, 역촌동, 연다산동, 염창동, 오곡동, 오금동, 오남읍, 오도동, 오류동, 오쇠동, 오정동, 와동동, 와부읍, 왕길동, 외발산동, 용답동, 용두동, 용종동, 용현동, 우이동, 운양동, 원당동, 원종동, 원흥동, 월계동, 월곶면, 월롱면, 유양동, 율동, 율현동, 은행동, 응암동, 의정부동, 이매동, 이문동, 이패동, 이화동, 인창동, 일산동, 일원동, 일패동, 임학동, 자곡동, 자양동, 자일동, 잠실동, 장기동, 장단면, 장안동, 장암동, 장위동, 장지동, 장항동, 장흥면, 전농동, 정릉동, 정발산동, 제기동, 조리읍, 조안면, 종암동, 주교동, 주엽동, 중계동, 중곡동, 중대동, 중산동, 중앙동, 중화동, 증산동, 지금동, 지영동, 지축동, 직동, 진건읍, 진관동, 진접읍, 창곡동, 창동, 창우동, 천현동, 천호동, 청량리동, 초월읍, 초이동, 초일동, 추자동, 춘궁동, 탄벌동, 탄현동, 탄현면, 태전동, 태평동, 토당동, 토평동, 통진읍, 퇴계원읍, 퇴촌면, 파주읍, 평내동, 평동, 평창동, 포곡읍, 풍납동, 풍동, 풍무동, 풍산동, 하계동, 하대원동, 하사창동, 하산곡동, 하성면, 하야동, ?
    ```

    </details>
- `🚦 [ROADMAP 22:20:36.367] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`

    <details>
    <summary>🔽 {...</summary>

    ```json
                                                                                                        {
                                                                                                          "dropoff": "성북구",
                                                                                                          "fare": 61000,
                                                                                                          "id": "33a12012-2e0e-4089-873f-41cb93281f8c",
                                                                                                          "pickup": "초월읍",
                                                                                                          "pickupDistance": 5.1,
                                                                                                          "rawText": "5.1, 32.2, 오후2시52/초월읍, 성북구, 다, 6.1",
                                                                                                          "timestamp": "2026-04-16T22:20:36Z",
                                                                                                          "type": "NEW_ORDER",
                                                                                                          "vehicleType": "다"
                                                                                                        }
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
    └─ [data][0] 상세 정보:
    ```

    </details>
- `🚦 [ROADMAP 22:20:36.714] [📱앱] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    {"allowedVehicleTypes":["다마스","라보","오토바이"],"isActive":true,"isSharedMode":true,"pickupRadiusKm":30.0,"minFare":35000.0,"maxFare":1000000.0,"excludedKeywords":"착불,수거,까대기,전화금지,타일","destinationCity":"파주시","destinationRadiusKm":10.0,"destinationKeywords":"가능동, 가락동, 가양동, 가좌동, 갈매동, 갈현동, 감북동, 감이동, 감일동, 감정동, 강매동, 강일동, 강하면, 개화동, 거여동, 걸포동, 검산동, 검암동, 경안동, 계산동, 고강동, 고덕동, 고산동, 고양동, 고읍동, 고촌읍, 곤지암읍, 공릉동, 공항동, 과해동, 관산동, 광사동, 광암동, 광장동, 광적면, 광탄면, 교문동, 교산동, 교하동, 구기동, 구래동, 구산동, 구의동, 군자동, 귤현동, 금곡동, 금광동, 금릉동, 금오동, 금촌동, 길동, 길음동, 낙양동, 남가좌동, 남방동, 남종면, 남한산성면, 내곡동, 내발산동, 내유동, 노오지동, 녹번동, 녹양동, 능동, 능평동, 다남동, 다산동, 다율동, 단대동, 답십리동, 당정동, 당하동, 대곡동, 대곶면, 대자동, 대장동, 대조동, 대화동, 덕계동, 덕은동, 덕이동, 덕풍동, 도내동, 도농동, 도봉동, 도척면, 도촌동, 돈암동, 동산동, 동양동, 동패동, 둑실동, 둔촌동, 등촌동, 마곡동, 마두동, 마산동, 마장동, 마전동, 마천동, 만송동, 망우동, 망월동, 매산동, 맥금동, 면목동, 명일동, 모현읍, 목동, 목동동, 목상동, 목현동, 묵동, 문발동, 문봉동, 문산읍, 문정동, 문형동, 미사동, 미아동, 민락동, 박촌동, 방이동, 방축동, 방학동, 방화동, 배알미동, 백석동, 백석읍, 번동, 법곳동, 벽제동, 별내동, 별내면, 병방동, 복정동, 부암동, 북가좌동, 북변동, 북한동, 분당동, 불광동, 불로동, 사근동, 사노동, 사리현동, 사우동, 산곡동, 산남동, 산북동, 산북면, 산성동, 산황동, 삼동, 삼송동, 삼전동, 삼정동, 삼패동, 상계동, 상대원동, 상봉동, 상사창동, 상산곡동, 상암동, 상야동, 상월곡동, 상일동, 상지석동, 서운동, 서패동, 서현동, 석관동, 석촌동, 선동, 선유동, 선주지동, 설문동, 성남동, 성내동, 성사동, 성산동, 성석동, 성수동, 세곡동, 소흘읍, 송정동, 송촌동, 송파동, 수색동, 수서동, 수석동, 수유동, 수진동, 수택동, 시천동, 식사동, 신곡동, 신내동, 신둔면, 신사동, 신영동, 신원동, 신월동, 신장동, 신천동, 신촌동, 신평동, 신현동, 신흥동, 쌍령동, 쌍문동, 아동동, 아천동, 안암동, 암사동, 야당동, 야동동, 야탑동, 양벌동, 양서면, 양지동, 양지읍, 양촌읍, 어둔동, 여수동, 역동, 역촌동, 연다산동, 염창동, 오곡동, 오금동, 오남읍, 오도동, 오류동, 오쇠동, 오정동, 와동동, 와부읍, 왕길동, 외발산동, 용답동, 용두동, 용종동, 용현동, 우이동, 운양동, 원당동, 원종동, 원흥동, 월계동, 월곶면, 월롱면, 유양동, 율동, 율현동, 은행동, 응암동, 의정부동, 이매동, 이문동, 이패동, 이화동, 인창동, 일산동, 일원동, 일패동, 임학동, 자곡동, 자양동, 자일동, 잠실동, 장기동, 장단면, 장안동, 장암동, 장위동, 장지동, 장항동, 장흥면, 전농동, 정릉동, 정발산동, 제기동, 조리읍, 조안면, 종암동, 주교동, 주엽동, 중계동, 중곡동, 중대동, 중산동, 중앙동, 중화동, 증산동, 지금동, 지영동, 지축동, 직동, 진건읍, 진관동, 진접읍, 창곡동, 창동, 창우동, 천현동, 천호동, 청량리동, 초월읍, 초이동, 초일동, 추자동, 춘궁동, 탄벌동, 탄현동, 탄현면, 태전동, 태평동, 토당동, 토평동, 통진읍, 퇴계원읍, 퇴촌면, 파주읍, 평내동, 평동, 평창동, 포곡읍, 풍납동, 풍동, 풍무동, 풍산동, 하계동, 하대원동, 하사창동, 하산곡동, 하성면, 하야동, ?
    ```

    </details>
- `🚦 [ROADMAP 22:20:41.375] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`

    <details>
    <summary>🔽 {...</summary>

    ```json
                                                                                                        {
                                                                                                          "dropoff": "중구",
                                                                                                          "fare": 97000,
                                                                                                          "id": "3a81c6c9-8733-4c71-9277-0cab9e483c05",
                                                                                                          "pickup": "송정동",
                                                                                                          "pickupDistance": 1.9,
                                                                                                          "rawText": "1.9, 56.3, 송정동, 중구, 라, 9.7",
                                                                                                          "timestamp": "2026-04-16T22:20:41Z",
                                                                                                          "type": "NEW_ORDER",
                                                                                                          "vehicleType": "라"
                                                                                                        }
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
    └─ [data][0] 상세 정보:
    ```

    </details>
- `🚦 [ROADMAP 22:20:41.710] [📱앱] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    {"allowedVehicleTypes":["다마스","라보","오토바이"],"isActive":true,"isSharedMode":true,"pickupRadiusKm":30.0,"minFare":35000.0,"maxFare":1000000.0,"excludedKeywords":"착불,수거,까대기,전화금지,타일","destinationCity":"파주시","destinationRadiusKm":10.0,"destinationKeywords":"가능동, 가락동, 가양동, 가좌동, 갈매동, 갈현동, 감북동, 감이동, 감일동, 감정동, 강매동, 강일동, 강하면, 개화동, 거여동, 걸포동, 검산동, 검암동, 경안동, 계산동, 고강동, 고덕동, 고산동, 고양동, 고읍동, 고촌읍, 곤지암읍, 공릉동, 공항동, 과해동, 관산동, 광사동, 광암동, 광장동, 광적면, 광탄면, 교문동, 교산동, 교하동, 구기동, 구래동, 구산동, 구의동, 군자동, 귤현동, 금곡동, 금광동, 금릉동, 금오동, 금촌동, 길동, 길음동, 낙양동, 남가좌동, 남방동, 남종면, 남한산성면, 내곡동, 내발산동, 내유동, 노오지동, 녹번동, 녹양동, 능동, 능평동, 다남동, 다산동, 다율동, 단대동, 답십리동, 당정동, 당하동, 대곡동, 대곶면, 대자동, 대장동, 대조동, 대화동, 덕계동, 덕은동, 덕이동, 덕풍동, 도내동, 도농동, 도봉동, 도척면, 도촌동, 돈암동, 동산동, 동양동, 동패동, 둑실동, 둔촌동, 등촌동, 마곡동, 마두동, 마산동, 마장동, 마전동, 마천동, 만송동, 망우동, 망월동, 매산동, 맥금동, 면목동, 명일동, 모현읍, 목동, 목동동, 목상동, 목현동, 묵동, 문발동, 문봉동, 문산읍, 문정동, 문형동, 미사동, 미아동, 민락동, 박촌동, 방이동, 방축동, 방학동, 방화동, 배알미동, 백석동, 백석읍, 번동, 법곳동, 벽제동, 별내동, 별내면, 병방동, 복정동, 부암동, 북가좌동, 북변동, 북한동, 분당동, 불광동, 불로동, 사근동, 사노동, 사리현동, 사우동, 산곡동, 산남동, 산북동, 산북면, 산성동, 산황동, 삼동, 삼송동, 삼전동, 삼정동, 삼패동, 상계동, 상대원동, 상봉동, 상사창동, 상산곡동, 상암동, 상야동, 상월곡동, 상일동, 상지석동, 서운동, 서패동, 서현동, 석관동, 석촌동, 선동, 선유동, 선주지동, 설문동, 성남동, 성내동, 성사동, 성산동, 성석동, 성수동, 세곡동, 소흘읍, 송정동, 송촌동, 송파동, 수색동, 수서동, 수석동, 수유동, 수진동, 수택동, 시천동, 식사동, 신곡동, 신내동, 신둔면, 신사동, 신영동, 신원동, 신월동, 신장동, 신천동, 신촌동, 신평동, 신현동, 신흥동, 쌍령동, 쌍문동, 아동동, 아천동, 안암동, 암사동, 야당동, 야동동, 야탑동, 양벌동, 양서면, 양지동, 양지읍, 양촌읍, 어둔동, 여수동, 역동, 역촌동, 연다산동, 염창동, 오곡동, 오금동, 오남읍, 오도동, 오류동, 오쇠동, 오정동, 와동동, 와부읍, 왕길동, 외발산동, 용답동, 용두동, 용종동, 용현동, 우이동, 운양동, 원당동, 원종동, 원흥동, 월계동, 월곶면, 월롱면, 유양동, 율동, 율현동, 은행동, 응암동, 의정부동, 이매동, 이문동, 이패동, 이화동, 인창동, 일산동, 일원동, 일패동, 임학동, 자곡동, 자양동, 자일동, 잠실동, 장기동, 장단면, 장안동, 장암동, 장위동, 장지동, 장항동, 장흥면, 전농동, 정릉동, 정발산동, 제기동, 조리읍, 조안면, 종암동, 주교동, 주엽동, 중계동, 중곡동, 중대동, 중산동, 중앙동, 중화동, 증산동, 지금동, 지영동, 지축동, 직동, 진건읍, 진관동, 진접읍, 창곡동, 창동, 창우동, 천현동, 천호동, 청량리동, 초월읍, 초이동, 초일동, 추자동, 춘궁동, 탄벌동, 탄현동, 탄현면, 태전동, 태평동, 토당동, 토평동, 통진읍, 퇴계원읍, 퇴촌면, 파주읍, 평내동, 평동, 평창동, 포곡읍, 풍납동, 풍동, 풍무동, 풍산동, 하계동, 하대원동, 하사창동, 하산곡동, 하성면, 하야동, ?
    ```

    </details>
- `🚦 [ROADMAP 22:20:46.364] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`

    <details>
    <summary>🔽 {...</summary>

    ```json
                                                                                                        {
                                                                                                          "dropoff": "곤지암읍",
                                                                                                          "fare": 32000,
                                                                                                          "id": "537a2253-e4b8-429f-a460-baa154dcbc56",
                                                                                                          "pickup": "경안동",
                                                                                                          "pickupDistance": 0.2,
                                                                                                          "rawText": "0.2, 12.6, @, 경안동, 곤지암읍, 1t, 3.2",
                                                                                                          "timestamp": "2026-04-16T22:20:46Z",
                                                                                                          "type": "NEW_ORDER",
                                                                                                          "vehicleType": "1t"
                                                                                                        }
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
    └─ [data][0] 상세 정보:
    ```

    </details>
- `🚦 [ROADMAP 22:20:46.704] [📱앱] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    {"allowedVehicleTypes":["다마스","라보","오토바이"],"isActive":true,"isSharedMode":true,"pickupRadiusKm":30.0,"minFare":35000.0,"maxFare":1000000.0,"excludedKeywords":"착불,수거,까대기,전화금지,타일","destinationCity":"파주시","destinationRadiusKm":10.0,"destinationKeywords":"가능동, 가락동, 가양동, 가좌동, 갈매동, 갈현동, 감북동, 감이동, 감일동, 감정동, 강매동, 강일동, 강하면, 개화동, 거여동, 걸포동, 검산동, 검암동, 경안동, 계산동, 고강동, 고덕동, 고산동, 고양동, 고읍동, 고촌읍, 곤지암읍, 공릉동, 공항동, 과해동, 관산동, 광사동, 광암동, 광장동, 광적면, 광탄면, 교문동, 교산동, 교하동, 구기동, 구래동, 구산동, 구의동, 군자동, 귤현동, 금곡동, 금광동, 금릉동, 금오동, 금촌동, 길동, 길음동, 낙양동, 남가좌동, 남방동, 남종면, 남한산성면, 내곡동, 내발산동, 내유동, 노오지동, 녹번동, 녹양동, 능동, 능평동, 다남동, 다산동, 다율동, 단대동, 답십리동, 당정동, 당하동, 대곡동, 대곶면, 대자동, 대장동, 대조동, 대화동, 덕계동, 덕은동, 덕이동, 덕풍동, 도내동, 도농동, 도봉동, 도척면, 도촌동, 돈암동, 동산동, 동양동, 동패동, 둑실동, 둔촌동, 등촌동, 마곡동, 마두동, 마산동, 마장동, 마전동, 마천동, 만송동, 망우동, 망월동, 매산동, 맥금동, 면목동, 명일동, 모현읍, 목동, 목동동, 목상동, 목현동, 묵동, 문발동, 문봉동, 문산읍, 문정동, 문형동, 미사동, 미아동, 민락동, 박촌동, 방이동, 방축동, 방학동, 방화동, 배알미동, 백석동, 백석읍, 번동, 법곳동, 벽제동, 별내동, 별내면, 병방동, 복정동, 부암동, 북가좌동, 북변동, 북한동, 분당동, 불광동, 불로동, 사근동, 사노동, 사리현동, 사우동, 산곡동, 산남동, 산북동, 산북면, 산성동, 산황동, 삼동, 삼송동, 삼전동, 삼정동, 삼패동, 상계동, 상대원동, 상봉동, 상사창동, 상산곡동, 상암동, 상야동, 상월곡동, 상일동, 상지석동, 서운동, 서패동, 서현동, 석관동, 석촌동, 선동, 선유동, 선주지동, 설문동, 성남동, 성내동, 성사동, 성산동, 성석동, 성수동, 세곡동, 소흘읍, 송정동, 송촌동, 송파동, 수색동, 수서동, 수석동, 수유동, 수진동, 수택동, 시천동, 식사동, 신곡동, 신내동, 신둔면, 신사동, 신영동, 신원동, 신월동, 신장동, 신천동, 신촌동, 신평동, 신현동, 신흥동, 쌍령동, 쌍문동, 아동동, 아천동, 안암동, 암사동, 야당동, 야동동, 야탑동, 양벌동, 양서면, 양지동, 양지읍, 양촌읍, 어둔동, 여수동, 역동, 역촌동, 연다산동, 염창동, 오곡동, 오금동, 오남읍, 오도동, 오류동, 오쇠동, 오정동, 와동동, 와부읍, 왕길동, 외발산동, 용답동, 용두동, 용종동, 용현동, 우이동, 운양동, 원당동, 원종동, 원흥동, 월계동, 월곶면, 월롱면, 유양동, 율동, 율현동, 은행동, 응암동, 의정부동, 이매동, 이문동, 이패동, 이화동, 인창동, 일산동, 일원동, 일패동, 임학동, 자곡동, 자양동, 자일동, 잠실동, 장기동, 장단면, 장안동, 장암동, 장위동, 장지동, 장항동, 장흥면, 전농동, 정릉동, 정발산동, 제기동, 조리읍, 조안면, 종암동, 주교동, 주엽동, 중계동, 중곡동, 중대동, 중산동, 중앙동, 중화동, 증산동, 지금동, 지영동, 지축동, 직동, 진건읍, 진관동, 진접읍, 창곡동, 창동, 창우동, 천현동, 천호동, 청량리동, 초월읍, 초이동, 초일동, 추자동, 춘궁동, 탄벌동, 탄현동, 탄현면, 태전동, 태평동, 토당동, 토평동, 통진읍, 퇴계원읍, 퇴촌면, 파주읍, 평내동, 평동, 평창동, 포곡읍, 풍납동, 풍동, 풍무동, 풍산동, 하계동, 하대원동, 하사창동, 하산곡동, 하성면, 하야동, ?
    ```

    </details>
- `🚦 [ROADMAP 22:20:51.360] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`

    <details>
    <summary>🔽 {...</summary>

    ```json
                                                                                                        {
                                                                                                          "dropoff": "마포구",
                                                                                                          "fare": 70000,
                                                                                                          "id": "1e4226ff-2992-419d-928c-e48d3c8abfcc",
                                                                                                          "pickup": "경안동",
                                                                                                          "pickupDistance": 0.2,
                                                                                                          "rawText": "0.2, 37.4, 급송/경안동, 마포구, 다, 7.0",
                                                                                                          "timestamp": "2026-04-16T22:20:51Z",
                                                                                                          "type": "NEW_ORDER",
                                                                                                          "vehicleType": "다"
                                                                                                        }
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
    └─ [data][0] 상세 정보:
    ```

    </details>
- `🚦 [ROADMAP 22:20:51.689] [📱앱] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    {"allowedVehicleTypes":["다마스","라보","오토바이"],"isActive":true,"isSharedMode":true,"pickupRadiusKm":30.0,"minFare":35000.0,"maxFare":1000000.0,"excludedKeywords":"착불,수거,까대기,전화금지,타일","destinationCity":"파주시","destinationRadiusKm":10.0,"destinationKeywords":"가능동, 가락동, 가양동, 가좌동, 갈매동, 갈현동, 감북동, 감이동, 감일동, 감정동, 강매동, 강일동, 강하면, 개화동, 거여동, 걸포동, 검산동, 검암동, 경안동, 계산동, 고강동, 고덕동, 고산동, 고양동, 고읍동, 고촌읍, 곤지암읍, 공릉동, 공항동, 과해동, 관산동, 광사동, 광암동, 광장동, 광적면, 광탄면, 교문동, 교산동, 교하동, 구기동, 구래동, 구산동, 구의동, 군자동, 귤현동, 금곡동, 금광동, 금릉동, 금오동, 금촌동, 길동, 길음동, 낙양동, 남가좌동, 남방동, 남종면, 남한산성면, 내곡동, 내발산동, 내유동, 노오지동, 녹번동, 녹양동, 능동, 능평동, 다남동, 다산동, 다율동, 단대동, 답십리동, 당정동, 당하동, 대곡동, 대곶면, 대자동, 대장동, 대조동, 대화동, 덕계동, 덕은동, 덕이동, 덕풍동, 도내동, 도농동, 도봉동, 도척면, 도촌동, 돈암동, 동산동, 동양동, 동패동, 둑실동, 둔촌동, 등촌동, 마곡동, 마두동, 마산동, 마장동, 마전동, 마천동, 만송동, 망우동, 망월동, 매산동, 맥금동, 면목동, 명일동, 모현읍, 목동, 목동동, 목상동, 목현동, 묵동, 문발동, 문봉동, 문산읍, 문정동, 문형동, 미사동, 미아동, 민락동, 박촌동, 방이동, 방축동, 방학동, 방화동, 배알미동, 백석동, 백석읍, 번동, 법곳동, 벽제동, 별내동, 별내면, 병방동, 복정동, 부암동, 북가좌동, 북변동, 북한동, 분당동, 불광동, 불로동, 사근동, 사노동, 사리현동, 사우동, 산곡동, 산남동, 산북동, 산북면, 산성동, 산황동, 삼동, 삼송동, 삼전동, 삼정동, 삼패동, 상계동, 상대원동, 상봉동, 상사창동, 상산곡동, 상암동, 상야동, 상월곡동, 상일동, 상지석동, 서운동, 서패동, 서현동, 석관동, 석촌동, 선동, 선유동, 선주지동, 설문동, 성남동, 성내동, 성사동, 성산동, 성석동, 성수동, 세곡동, 소흘읍, 송정동, 송촌동, 송파동, 수색동, 수서동, 수석동, 수유동, 수진동, 수택동, 시천동, 식사동, 신곡동, 신내동, 신둔면, 신사동, 신영동, 신원동, 신월동, 신장동, 신천동, 신촌동, 신평동, 신현동, 신흥동, 쌍령동, 쌍문동, 아동동, 아천동, 안암동, 암사동, 야당동, 야동동, 야탑동, 양벌동, 양서면, 양지동, 양지읍, 양촌읍, 어둔동, 여수동, 역동, 역촌동, 연다산동, 염창동, 오곡동, 오금동, 오남읍, 오도동, 오류동, 오쇠동, 오정동, 와동동, 와부읍, 왕길동, 외발산동, 용답동, 용두동, 용종동, 용현동, 우이동, 운양동, 원당동, 원종동, 원흥동, 월계동, 월곶면, 월롱면, 유양동, 율동, 율현동, 은행동, 응암동, 의정부동, 이매동, 이문동, 이패동, 이화동, 인창동, 일산동, 일원동, 일패동, 임학동, 자곡동, 자양동, 자일동, 잠실동, 장기동, 장단면, 장안동, 장암동, 장위동, 장지동, 장항동, 장흥면, 전농동, 정릉동, 정발산동, 제기동, 조리읍, 조안면, 종암동, 주교동, 주엽동, 중계동, 중곡동, 중대동, 중산동, 중앙동, 중화동, 증산동, 지금동, 지영동, 지축동, 직동, 진건읍, 진관동, 진접읍, 창곡동, 창동, 창우동, 천현동, 천호동, 청량리동, 초월읍, 초이동, 초일동, 추자동, 춘궁동, 탄벌동, 탄현동, 탄현면, 태전동, 태평동, 토당동, 토평동, 통진읍, 퇴계원읍, 퇴촌면, 파주읍, 평내동, 평동, 평창동, 포곡읍, 풍납동, 풍동, 풍무동, 풍산동, 하계동, 하대원동, 하사창동, 하산곡동, 하성면, 하야동, ?
    ```

    </details>
- `🚦 [ROADMAP 22:20:56.409] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`

    <details>
    <summary>🔽 {...</summary>

    ```json
                                                                                                        {
                                                                                                          "dropoff": "송파구",
                                                                                                          "fare": 35000,
                                                                                                          "id": "9781dc08-e503-48c2-9ed8-ae98303d5ae8",
                                                                                                          "pickup": "경안동",
                                                                                                          "pickupDistance": 0.2,
                                                                                                          "rawText": "0.2, 15.2, @, 경안동, 송파구, 1t, 3.5",
                                                                                                          "timestamp": "2026-04-16T22:20:56Z",
                                                                                                          "type": "NEW_ORDER",
                                                                                                          "vehicleType": "1t"
                                                                                                        }
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
    └─ [data][0] 상세 정보:
    ```

    </details>
- `🚦 [ROADMAP 22:20:56.756] [📱앱] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    {"allowedVehicleTypes":["다마스","라보","오토바이"],"isActive":true,"isSharedMode":true,"pickupRadiusKm":30.0,"minFare":35000.0,"maxFare":1000000.0,"excludedKeywords":"착불,수거,까대기,전화금지,타일","destinationCity":"파주시","destinationRadiusKm":10.0,"destinationKeywords":"가능동, 가락동, 가양동, 가좌동, 갈매동, 갈현동, 감북동, 감이동, 감일동, 감정동, 강매동, 강일동, 강하면, 개화동, 거여동, 걸포동, 검산동, 검암동, 경안동, 계산동, 고강동, 고덕동, 고산동, 고양동, 고읍동, 고촌읍, 곤지암읍, 공릉동, 공항동, 과해동, 관산동, 광사동, 광암동, 광장동, 광적면, 광탄면, 교문동, 교산동, 교하동, 구기동, 구래동, 구산동, 구의동, 군자동, 귤현동, 금곡동, 금광동, 금릉동, 금오동, 금촌동, 길동, 길음동, 낙양동, 남가좌동, 남방동, 남종면, 남한산성면, 내곡동, 내발산동, 내유동, 노오지동, 녹번동, 녹양동, 능동, 능평동, 다남동, 다산동, 다율동, 단대동, 답십리동, 당정동, 당하동, 대곡동, 대곶면, 대자동, 대장동, 대조동, 대화동, 덕계동, 덕은동, 덕이동, 덕풍동, 도내동, 도농동, 도봉동, 도척면, 도촌동, 돈암동, 동산동, 동양동, 동패동, 둑실동, 둔촌동, 등촌동, 마곡동, 마두동, 마산동, 마장동, 마전동, 마천동, 만송동, 망우동, 망월동, 매산동, 맥금동, 면목동, 명일동, 모현읍, 목동, 목동동, 목상동, 목현동, 묵동, 문발동, 문봉동, 문산읍, 문정동, 문형동, 미사동, 미아동, 민락동, 박촌동, 방이동, 방축동, 방학동, 방화동, 배알미동, 백석동, 백석읍, 번동, 법곳동, 벽제동, 별내동, 별내면, 병방동, 복정동, 부암동, 북가좌동, 북변동, 북한동, 분당동, 불광동, 불로동, 사근동, 사노동, 사리현동, 사우동, 산곡동, 산남동, 산북동, 산북면, 산성동, 산황동, 삼동, 삼송동, 삼전동, 삼정동, 삼패동, 상계동, 상대원동, 상봉동, 상사창동, 상산곡동, 상암동, 상야동, 상월곡동, 상일동, 상지석동, 서운동, 서패동, 서현동, 석관동, 석촌동, 선동, 선유동, 선주지동, 설문동, 성남동, 성내동, 성사동, 성산동, 성석동, 성수동, 세곡동, 소흘읍, 송정동, 송촌동, 송파동, 수색동, 수서동, 수석동, 수유동, 수진동, 수택동, 시천동, 식사동, 신곡동, 신내동, 신둔면, 신사동, 신영동, 신원동, 신월동, 신장동, 신천동, 신촌동, 신평동, 신현동, 신흥동, 쌍령동, 쌍문동, 아동동, 아천동, 안암동, 암사동, 야당동, 야동동, 야탑동, 양벌동, 양서면, 양지동, 양지읍, 양촌읍, 어둔동, 여수동, 역동, 역촌동, 연다산동, 염창동, 오곡동, 오금동, 오남읍, 오도동, 오류동, 오쇠동, 오정동, 와동동, 와부읍, 왕길동, 외발산동, 용답동, 용두동, 용종동, 용현동, 우이동, 운양동, 원당동, 원종동, 원흥동, 월계동, 월곶면, 월롱면, 유양동, 율동, 율현동, 은행동, 응암동, 의정부동, 이매동, 이문동, 이패동, 이화동, 인창동, 일산동, 일원동, 일패동, 임학동, 자곡동, 자양동, 자일동, 잠실동, 장기동, 장단면, 장안동, 장암동, 장위동, 장지동, 장항동, 장흥면, 전농동, 정릉동, 정발산동, 제기동, 조리읍, 조안면, 종암동, 주교동, 주엽동, 중계동, 중곡동, 중대동, 중산동, 중앙동, 중화동, 증산동, 지금동, 지영동, 지축동, 직동, 진건읍, 진관동, 진접읍, 창곡동, 창동, 창우동, 천현동, 천호동, 청량리동, 초월읍, 초이동, 초일동, 추자동, 춘궁동, 탄벌동, 탄현동, 탄현면, 태전동, 태평동, 토당동, 토평동, 통진읍, 퇴계원읍, 퇴촌면, 파주읍, 평내동, 평동, 평창동, 포곡읍, 풍납동, 풍동, 풍무동, 풍산동, 하계동, 하대원동, 하사창동, 하산곡동, 하성면, 하야동, ?
    ```

    </details>
- `🚦 [ROADMAP 22:21:01.364] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`

    <details>
    <summary>🔽 {...</summary>

    ```json
                                                                                                        {
                                                                                                          "dropoff": "수지구",
                                                                                                          "fare": 31000,
                                                                                                          "id": "4999f899-3334-4e00-8ff1-b836ae664089",
                                                                                                          "pickup": "분당구",
                                                                                                          "pickupDistance": 8.5,
                                                                                                          "rawText": "8.5, 13.6, 분당구, 수지구, 라, 3.1",
                                                                                                          "timestamp": "2026-04-16T22:21:01Z",
                                                                                                          "type": "NEW_ORDER",
                                                                                                          "vehicleType": "라"
                                                                                                        }
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
    └─ [data][0] 상세 정보:
    ```

    </details>
- `🚦 [ROADMAP 22:21:01.696] [📱앱] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    {"allowedVehicleTypes":["다마스","라보","오토바이"],"isActive":true,"isSharedMode":true,"pickupRadiusKm":30.0,"minFare":35000.0,"maxFare":1000000.0,"excludedKeywords":"착불,수거,까대기,전화금지,타일","destinationCity":"파주시","destinationRadiusKm":10.0,"destinationKeywords":"가능동, 가락동, 가양동, 가좌동, 갈매동, 갈현동, 감북동, 감이동, 감일동, 감정동, 강매동, 강일동, 강하면, 개화동, 거여동, 걸포동, 검산동, 검암동, 경안동, 계산동, 고강동, 고덕동, 고산동, 고양동, 고읍동, 고촌읍, 곤지암읍, 공릉동, 공항동, 과해동, 관산동, 광사동, 광암동, 광장동, 광적면, 광탄면, 교문동, 교산동, 교하동, 구기동, 구래동, 구산동, 구의동, 군자동, 귤현동, 금곡동, 금광동, 금릉동, 금오동, 금촌동, 길동, 길음동, 낙양동, 남가좌동, 남방동, 남종면, 남한산성면, 내곡동, 내발산동, 내유동, 노오지동, 녹번동, 녹양동, 능동, 능평동, 다남동, 다산동, 다율동, 단대동, 답십리동, 당정동, 당하동, 대곡동, 대곶면, 대자동, 대장동, 대조동, 대화동, 덕계동, 덕은동, 덕이동, 덕풍동, 도내동, 도농동, 도봉동, 도척면, 도촌동, 돈암동, 동산동, 동양동, 동패동, 둑실동, 둔촌동, 등촌동, 마곡동, 마두동, 마산동, 마장동, 마전동, 마천동, 만송동, 망우동, 망월동, 매산동, 맥금동, 면목동, 명일동, 모현읍, 목동, 목동동, 목상동, 목현동, 묵동, 문발동, 문봉동, 문산읍, 문정동, 문형동, 미사동, 미아동, 민락동, 박촌동, 방이동, 방축동, 방학동, 방화동, 배알미동, 백석동, 백석읍, 번동, 법곳동, 벽제동, 별내동, 별내면, 병방동, 복정동, 부암동, 북가좌동, 북변동, 북한동, 분당동, 불광동, 불로동, 사근동, 사노동, 사리현동, 사우동, 산곡동, 산남동, 산북동, 산북면, 산성동, 산황동, 삼동, 삼송동, 삼전동, 삼정동, 삼패동, 상계동, 상대원동, 상봉동, 상사창동, 상산곡동, 상암동, 상야동, 상월곡동, 상일동, 상지석동, 서운동, 서패동, 서현동, 석관동, 석촌동, 선동, 선유동, 선주지동, 설문동, 성남동, 성내동, 성사동, 성산동, 성석동, 성수동, 세곡동, 소흘읍, 송정동, 송촌동, 송파동, 수색동, 수서동, 수석동, 수유동, 수진동, 수택동, 시천동, 식사동, 신곡동, 신내동, 신둔면, 신사동, 신영동, 신원동, 신월동, 신장동, 신천동, 신촌동, 신평동, 신현동, 신흥동, 쌍령동, 쌍문동, 아동동, 아천동, 안암동, 암사동, 야당동, 야동동, 야탑동, 양벌동, 양서면, 양지동, 양지읍, 양촌읍, 어둔동, 여수동, 역동, 역촌동, 연다산동, 염창동, 오곡동, 오금동, 오남읍, 오도동, 오류동, 오쇠동, 오정동, 와동동, 와부읍, 왕길동, 외발산동, 용답동, 용두동, 용종동, 용현동, 우이동, 운양동, 원당동, 원종동, 원흥동, 월계동, 월곶면, 월롱면, 유양동, 율동, 율현동, 은행동, 응암동, 의정부동, 이매동, 이문동, 이패동, 이화동, 인창동, 일산동, 일원동, 일패동, 임학동, 자곡동, 자양동, 자일동, 잠실동, 장기동, 장단면, 장안동, 장암동, 장위동, 장지동, 장항동, 장흥면, 전농동, 정릉동, 정발산동, 제기동, 조리읍, 조안면, 종암동, 주교동, 주엽동, 중계동, 중곡동, 중대동, 중산동, 중앙동, 중화동, 증산동, 지금동, 지영동, 지축동, 직동, 진건읍, 진관동, 진접읍, 창곡동, 창동, 창우동, 천현동, 천호동, 청량리동, 초월읍, 초이동, 초일동, 추자동, 춘궁동, 탄벌동, 탄현동, 탄현면, 태전동, 태평동, 토당동, 토평동, 통진읍, 퇴계원읍, 퇴촌면, 파주읍, 평내동, 평동, 평창동, 포곡읍, 풍납동, 풍동, 풍무동, 풍산동, 하계동, 하대원동, 하사창동, 하산곡동, 하성면, 하야동, ?
    ```

    </details>
- `🚦 [ROADMAP 22:21:06.389] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`

    <details>
    <summary>🔽 {...</summary>

    ```json
                                                                                                        {
                                                                                                          "dropoff": "상록구",
                                                                                                          "fare": 66000,
                                                                                                          "id": "8ba858b4-b91b-4a42-8de9-6d88fac4e7fe",
                                                                                                          "pickup": "오포읍",
                                                                                                          "pickupDistance": 5.0,
                                                                                                          "rawText": "5.0, 35.0, 낮12시51/오포읍, 상록구, 라, 6.6",
                                                                                                          "timestamp": "2026-04-16T22:21:06Z",
                                                                                                          "type": "NEW_ORDER",
                                                                                                          "vehicleType": "라"
                                                                                                        }
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
    └─ [data][0] 상세 정보:
    ```

    </details>
- `🚦 [ROADMAP 22:21:06.729] [📱앱] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    {"allowedVehicleTypes":["다마스","라보","오토바이"],"isActive":true,"isSharedMode":true,"pickupRadiusKm":30.0,"minFare":35000.0,"maxFare":1000000.0,"excludedKeywords":"착불,수거,까대기,전화금지,타일","destinationCity":"파주시","destinationRadiusKm":10.0,"destinationKeywords":"가능동, 가락동, 가양동, 가좌동, 갈매동, 갈현동, 감북동, 감이동, 감일동, 감정동, 강매동, 강일동, 강하면, 개화동, 거여동, 걸포동, 검산동, 검암동, 경안동, 계산동, 고강동, 고덕동, 고산동, 고양동, 고읍동, 고촌읍, 곤지암읍, 공릉동, 공항동, 과해동, 관산동, 광사동, 광암동, 광장동, 광적면, 광탄면, 교문동, 교산동, 교하동, 구기동, 구래동, 구산동, 구의동, 군자동, 귤현동, 금곡동, 금광동, 금릉동, 금오동, 금촌동, 길동, 길음동, 낙양동, 남가좌동, 남방동, 남종면, 남한산성면, 내곡동, 내발산동, 내유동, 노오지동, 녹번동, 녹양동, 능동, 능평동, 다남동, 다산동, 다율동, 단대동, 답십리동, 당정동, 당하동, 대곡동, 대곶면, 대자동, 대장동, 대조동, 대화동, 덕계동, 덕은동, 덕이동, 덕풍동, 도내동, 도농동, 도봉동, 도척면, 도촌동, 돈암동, 동산동, 동양동, 동패동, 둑실동, 둔촌동, 등촌동, 마곡동, 마두동, 마산동, 마장동, 마전동, 마천동, 만송동, 망우동, 망월동, 매산동, 맥금동, 면목동, 명일동, 모현읍, 목동, 목동동, 목상동, 목현동, 묵동, 문발동, 문봉동, 문산읍, 문정동, 문형동, 미사동, 미아동, 민락동, 박촌동, 방이동, 방축동, 방학동, 방화동, 배알미동, 백석동, 백석읍, 번동, 법곳동, 벽제동, 별내동, 별내면, 병방동, 복정동, 부암동, 북가좌동, 북변동, 북한동, 분당동, 불광동, 불로동, 사근동, 사노동, 사리현동, 사우동, 산곡동, 산남동, 산북동, 산북면, 산성동, 산황동, 삼동, 삼송동, 삼전동, 삼정동, 삼패동, 상계동, 상대원동, 상봉동, 상사창동, 상산곡동, 상암동, 상야동, 상월곡동, 상일동, 상지석동, 서운동, 서패동, 서현동, 석관동, 석촌동, 선동, 선유동, 선주지동, 설문동, 성남동, 성내동, 성사동, 성산동, 성석동, 성수동, 세곡동, 소흘읍, 송정동, 송촌동, 송파동, 수색동, 수서동, 수석동, 수유동, 수진동, 수택동, 시천동, 식사동, 신곡동, 신내동, 신둔면, 신사동, 신영동, 신원동, 신월동, 신장동, 신천동, 신촌동, 신평동, 신현동, 신흥동, 쌍령동, 쌍문동, 아동동, 아천동, 안암동, 암사동, 야당동, 야동동, 야탑동, 양벌동, 양서면, 양지동, 양지읍, 양촌읍, 어둔동, 여수동, 역동, 역촌동, 연다산동, 염창동, 오곡동, 오금동, 오남읍, 오도동, 오류동, 오쇠동, 오정동, 와동동, 와부읍, 왕길동, 외발산동, 용답동, 용두동, 용종동, 용현동, 우이동, 운양동, 원당동, 원종동, 원흥동, 월계동, 월곶면, 월롱면, 유양동, 율동, 율현동, 은행동, 응암동, 의정부동, 이매동, 이문동, 이패동, 이화동, 인창동, 일산동, 일원동, 일패동, 임학동, 자곡동, 자양동, 자일동, 잠실동, 장기동, 장단면, 장안동, 장암동, 장위동, 장지동, 장항동, 장흥면, 전농동, 정릉동, 정발산동, 제기동, 조리읍, 조안면, 종암동, 주교동, 주엽동, 중계동, 중곡동, 중대동, 중산동, 중앙동, 중화동, 증산동, 지금동, 지영동, 지축동, 직동, 진건읍, 진관동, 진접읍, 창곡동, 창동, 창우동, 천현동, 천호동, 청량리동, 초월읍, 초이동, 초일동, 추자동, 춘궁동, 탄벌동, 탄현동, 탄현면, 태전동, 태평동, 토당동, 토평동, 통진읍, 퇴계원읍, 퇴촌면, 파주읍, 평내동, 평동, 평창동, 포곡읍, 풍납동, 풍동, 풍무동, 풍산동, 하계동, 하대원동, 하사창동, 하산곡동, 하성면, 하야동, ?
    ```

    </details>
- `🚦 [ROADMAP 22:21:11.408] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`

    <details>
    <summary>🔽 {...</summary>

    ```json
                                                                                                        {
                                                                                                          "dropoff": "삼동",
                                                                                                          "fare": 54000,
                                                                                                          "id": "b232e065-9d17-4c68-8d43-f4a390a0c8fc",
                                                                                                          "pickup": "송정동",
                                                                                                          "pickupDistance": 1.9,
                                                                                                          "rawText": "1.9, 29.4, 송정동, 삼동, 1t, 5.4",
                                                                                                          "timestamp": "2026-04-16T22:21:11Z",
                                                                                                          "type": "NEW_ORDER",
                                                                                                          "vehicleType": "1t"
                                                                                                        }
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
    └─ [data][0] 상세 정보:
    ```

    </details>
- `🚦 [ROADMAP 22:21:11.731] [📱앱] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    {"allowedVehicleTypes":["다마스","라보","오토바이"],"isActive":true,"isSharedMode":true,"pickupRadiusKm":30.0,"minFare":35000.0,"maxFare":1000000.0,"excludedKeywords":"착불,수거,까대기,전화금지,타일","destinationCity":"파주시","destinationRadiusKm":10.0,"destinationKeywords":"가능동, 가락동, 가양동, 가좌동, 갈매동, 갈현동, 감북동, 감이동, 감일동, 감정동, 강매동, 강일동, 강하면, 개화동, 거여동, 걸포동, 검산동, 검암동, 경안동, 계산동, 고강동, 고덕동, 고산동, 고양동, 고읍동, 고촌읍, 곤지암읍, 공릉동, 공항동, 과해동, 관산동, 광사동, 광암동, 광장동, 광적면, 광탄면, 교문동, 교산동, 교하동, 구기동, 구래동, 구산동, 구의동, 군자동, 귤현동, 금곡동, 금광동, 금릉동, 금오동, 금촌동, 길동, 길음동, 낙양동, 남가좌동, 남방동, 남종면, 남한산성면, 내곡동, 내발산동, 내유동, 노오지동, 녹번동, 녹양동, 능동, 능평동, 다남동, 다산동, 다율동, 단대동, 답십리동, 당정동, 당하동, 대곡동, 대곶면, 대자동, 대장동, 대조동, 대화동, 덕계동, 덕은동, 덕이동, 덕풍동, 도내동, 도농동, 도봉동, 도척면, 도촌동, 돈암동, 동산동, 동양동, 동패동, 둑실동, 둔촌동, 등촌동, 마곡동, 마두동, 마산동, 마장동, 마전동, 마천동, 만송동, 망우동, 망월동, 매산동, 맥금동, 면목동, 명일동, 모현읍, 목동, 목동동, 목상동, 목현동, 묵동, 문발동, 문봉동, 문산읍, 문정동, 문형동, 미사동, 미아동, 민락동, 박촌동, 방이동, 방축동, 방학동, 방화동, 배알미동, 백석동, 백석읍, 번동, 법곳동, 벽제동, 별내동, 별내면, 병방동, 복정동, 부암동, 북가좌동, 북변동, 북한동, 분당동, 불광동, 불로동, 사근동, 사노동, 사리현동, 사우동, 산곡동, 산남동, 산북동, 산북면, 산성동, 산황동, 삼동, 삼송동, 삼전동, 삼정동, 삼패동, 상계동, 상대원동, 상봉동, 상사창동, 상산곡동, 상암동, 상야동, 상월곡동, 상일동, 상지석동, 서운동, 서패동, 서현동, 석관동, 석촌동, 선동, 선유동, 선주지동, 설문동, 성남동, 성내동, 성사동, 성산동, 성석동, 성수동, 세곡동, 소흘읍, 송정동, 송촌동, 송파동, 수색동, 수서동, 수석동, 수유동, 수진동, 수택동, 시천동, 식사동, 신곡동, 신내동, 신둔면, 신사동, 신영동, 신원동, 신월동, 신장동, 신천동, 신촌동, 신평동, 신현동, 신흥동, 쌍령동, 쌍문동, 아동동, 아천동, 안암동, 암사동, 야당동, 야동동, 야탑동, 양벌동, 양서면, 양지동, 양지읍, 양촌읍, 어둔동, 여수동, 역동, 역촌동, 연다산동, 염창동, 오곡동, 오금동, 오남읍, 오도동, 오류동, 오쇠동, 오정동, 와동동, 와부읍, 왕길동, 외발산동, 용답동, 용두동, 용종동, 용현동, 우이동, 운양동, 원당동, 원종동, 원흥동, 월계동, 월곶면, 월롱면, 유양동, 율동, 율현동, 은행동, 응암동, 의정부동, 이매동, 이문동, 이패동, 이화동, 인창동, 일산동, 일원동, 일패동, 임학동, 자곡동, 자양동, 자일동, 잠실동, 장기동, 장단면, 장안동, 장암동, 장위동, 장지동, 장항동, 장흥면, 전농동, 정릉동, 정발산동, 제기동, 조리읍, 조안면, 종암동, 주교동, 주엽동, 중계동, 중곡동, 중대동, 중산동, 중앙동, 중화동, 증산동, 지금동, 지영동, 지축동, 직동, 진건읍, 진관동, 진접읍, 창곡동, 창동, 창우동, 천현동, 천호동, 청량리동, 초월읍, 초이동, 초일동, 추자동, 춘궁동, 탄벌동, 탄현동, 탄현면, 태전동, 태평동, 토당동, 토평동, 통진읍, 퇴계원읍, 퇴촌면, 파주읍, 평내동, 평동, 평창동, 포곡읍, 풍납동, 풍동, 풍무동, 풍산동, 하계동, 하대원동, 하사창동, 하산곡동, 하성면, 하야동, ?
    ```

    </details>
- `🚦 [ROADMAP 22:21:16.390] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`

    <details>
    <summary>🔽 {...</summary>

    ```json
                                                                                                        {
                                                                                                          "dropoff": "용산구",
                                                                                                          "fare": 43000,
                                                                                                          "id": "68e27fe9-8d1c-4eb5-9a67-32fd4ca8908a",
                                                                                                          "pickup": "분당구",
                                                                                                          "pickupDistance": 8.5,
                                                                                                          "rawText": "8.5, 21.8, @, 분당구, 용산구, 오, 4.3",
                                                                                                          "timestamp": "2026-04-16T22:21:16Z",
                                                                                                          "type": "NEW_ORDER",
                                                                                                          "vehicleType": "오"
                                                                                                        }
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
    └─ [data][0] 상세 정보:
    ```

    </details>
- `🚦 [ROADMAP 22:21:16.725] [📱앱] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    {"allowedVehicleTypes":["다마스","라보","오토바이"],"isActive":true,"isSharedMode":true,"pickupRadiusKm":30.0,"minFare":35000.0,"maxFare":1000000.0,"excludedKeywords":"착불,수거,까대기,전화금지,타일","destinationCity":"파주시","destinationRadiusKm":10.0,"destinationKeywords":"가능동, 가락동, 가양동, 가좌동, 갈매동, 갈현동, 감북동, 감이동, 감일동, 감정동, 강매동, 강일동, 강하면, 개화동, 거여동, 걸포동, 검산동, 검암동, 경안동, 계산동, 고강동, 고덕동, 고산동, 고양동, 고읍동, 고촌읍, 곤지암읍, 공릉동, 공항동, 과해동, 관산동, 광사동, 광암동, 광장동, 광적면, 광탄면, 교문동, 교산동, 교하동, 구기동, 구래동, 구산동, 구의동, 군자동, 귤현동, 금곡동, 금광동, 금릉동, 금오동, 금촌동, 길동, 길음동, 낙양동, 남가좌동, 남방동, 남종면, 남한산성면, 내곡동, 내발산동, 내유동, 노오지동, 녹번동, 녹양동, 능동, 능평동, 다남동, 다산동, 다율동, 단대동, 답십리동, 당정동, 당하동, 대곡동, 대곶면, 대자동, 대장동, 대조동, 대화동, 덕계동, 덕은동, 덕이동, 덕풍동, 도내동, 도농동, 도봉동, 도척면, 도촌동, 돈암동, 동산동, 동양동, 동패동, 둑실동, 둔촌동, 등촌동, 마곡동, 마두동, 마산동, 마장동, 마전동, 마천동, 만송동, 망우동, 망월동, 매산동, 맥금동, 면목동, 명일동, 모현읍, 목동, 목동동, 목상동, 목현동, 묵동, 문발동, 문봉동, 문산읍, 문정동, 문형동, 미사동, 미아동, 민락동, 박촌동, 방이동, 방축동, 방학동, 방화동, 배알미동, 백석동, 백석읍, 번동, 법곳동, 벽제동, 별내동, 별내면, 병방동, 복정동, 부암동, 북가좌동, 북변동, 북한동, 분당동, 불광동, 불로동, 사근동, 사노동, 사리현동, 사우동, 산곡동, 산남동, 산북동, 산북면, 산성동, 산황동, 삼동, 삼송동, 삼전동, 삼정동, 삼패동, 상계동, 상대원동, 상봉동, 상사창동, 상산곡동, 상암동, 상야동, 상월곡동, 상일동, 상지석동, 서운동, 서패동, 서현동, 석관동, 석촌동, 선동, 선유동, 선주지동, 설문동, 성남동, 성내동, 성사동, 성산동, 성석동, 성수동, 세곡동, 소흘읍, 송정동, 송촌동, 송파동, 수색동, 수서동, 수석동, 수유동, 수진동, 수택동, 시천동, 식사동, 신곡동, 신내동, 신둔면, 신사동, 신영동, 신원동, 신월동, 신장동, 신천동, 신촌동, 신평동, 신현동, 신흥동, 쌍령동, 쌍문동, 아동동, 아천동, 안암동, 암사동, 야당동, 야동동, 야탑동, 양벌동, 양서면, 양지동, 양지읍, 양촌읍, 어둔동, 여수동, 역동, 역촌동, 연다산동, 염창동, 오곡동, 오금동, 오남읍, 오도동, 오류동, 오쇠동, 오정동, 와동동, 와부읍, 왕길동, 외발산동, 용답동, 용두동, 용종동, 용현동, 우이동, 운양동, 원당동, 원종동, 원흥동, 월계동, 월곶면, 월롱면, 유양동, 율동, 율현동, 은행동, 응암동, 의정부동, 이매동, 이문동, 이패동, 이화동, 인창동, 일산동, 일원동, 일패동, 임학동, 자곡동, 자양동, 자일동, 잠실동, 장기동, 장단면, 장안동, 장암동, 장위동, 장지동, 장항동, 장흥면, 전농동, 정릉동, 정발산동, 제기동, 조리읍, 조안면, 종암동, 주교동, 주엽동, 중계동, 중곡동, 중대동, 중산동, 중앙동, 중화동, 증산동, 지금동, 지영동, 지축동, 직동, 진건읍, 진관동, 진접읍, 창곡동, 창동, 창우동, 천현동, 천호동, 청량리동, 초월읍, 초이동, 초일동, 추자동, 춘궁동, 탄벌동, 탄현동, 탄현면, 태전동, 태평동, 토당동, 토평동, 통진읍, 퇴계원읍, 퇴촌면, 파주읍, 평내동, 평동, 평창동, 포곡읍, 풍납동, 풍동, 풍무동, 풍산동, 하계동, 하대원동, 하사창동, 하산곡동, 하성면, 하야동, ?
    ```

    </details>
- `🚦 [ROADMAP 22:21:21.358] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`

    <details>
    <summary>🔽 {...</summary>

    ```json
                                                                                                        {
                                                                                                          "dropoff": "경안동",
                                                                                                          "fare": 30000,
                                                                                                          "id": "22de6c03-c85a-4701-b4a3-72f4c2880c8e",
                                                                                                          "pickup": "경안동",
                                                                                                          "pickupDistance": 0.2,
                                                                                                          "rawText": "0.2, 0.0, 오전11시44/경안동, 경안동, 오, 3.0",
                                                                                                          "timestamp": "2026-04-16T22:21:21Z",
                                                                                                          "type": "NEW_ORDER",
                                                                                                          "vehicleType": "오"
                                                                                                        }
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
    └─ [data][0] 상세 정보:
    ```

    </details>
- `🚦 [ROADMAP 22:21:21.695] [📱앱] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    {"allowedVehicleTypes":["다마스","라보","오토바이"],"isActive":true,"isSharedMode":true,"pickupRadiusKm":30.0,"minFare":35000.0,"maxFare":1000000.0,"excludedKeywords":"착불,수거,까대기,전화금지,타일","destinationCity":"파주시","destinationRadiusKm":10.0,"destinationKeywords":"가능동, 가락동, 가양동, 가좌동, 갈매동, 갈현동, 감북동, 감이동, 감일동, 감정동, 강매동, 강일동, 강하면, 개화동, 거여동, 걸포동, 검산동, 검암동, 경안동, 계산동, 고강동, 고덕동, 고산동, 고양동, 고읍동, 고촌읍, 곤지암읍, 공릉동, 공항동, 과해동, 관산동, 광사동, 광암동, 광장동, 광적면, 광탄면, 교문동, 교산동, 교하동, 구기동, 구래동, 구산동, 구의동, 군자동, 귤현동, 금곡동, 금광동, 금릉동, 금오동, 금촌동, 길동, 길음동, 낙양동, 남가좌동, 남방동, 남종면, 남한산성면, 내곡동, 내발산동, 내유동, 노오지동, 녹번동, 녹양동, 능동, 능평동, 다남동, 다산동, 다율동, 단대동, 답십리동, 당정동, 당하동, 대곡동, 대곶면, 대자동, 대장동, 대조동, 대화동, 덕계동, 덕은동, 덕이동, 덕풍동, 도내동, 도농동, 도봉동, 도척면, 도촌동, 돈암동, 동산동, 동양동, 동패동, 둑실동, 둔촌동, 등촌동, 마곡동, 마두동, 마산동, 마장동, 마전동, 마천동, 만송동, 망우동, 망월동, 매산동, 맥금동, 면목동, 명일동, 모현읍, 목동, 목동동, 목상동, 목현동, 묵동, 문발동, 문봉동, 문산읍, 문정동, 문형동, 미사동, 미아동, 민락동, 박촌동, 방이동, 방축동, 방학동, 방화동, 배알미동, 백석동, 백석읍, 번동, 법곳동, 벽제동, 별내동, 별내면, 병방동, 복정동, 부암동, 북가좌동, 북변동, 북한동, 분당동, 불광동, 불로동, 사근동, 사노동, 사리현동, 사우동, 산곡동, 산남동, 산북동, 산북면, 산성동, 산황동, 삼동, 삼송동, 삼전동, 삼정동, 삼패동, 상계동, 상대원동, 상봉동, 상사창동, 상산곡동, 상암동, 상야동, 상월곡동, 상일동, 상지석동, 서운동, 서패동, 서현동, 석관동, 석촌동, 선동, 선유동, 선주지동, 설문동, 성남동, 성내동, 성사동, 성산동, 성석동, 성수동, 세곡동, 소흘읍, 송정동, 송촌동, 송파동, 수색동, 수서동, 수석동, 수유동, 수진동, 수택동, 시천동, 식사동, 신곡동, 신내동, 신둔면, 신사동, 신영동, 신원동, 신월동, 신장동, 신천동, 신촌동, 신평동, 신현동, 신흥동, 쌍령동, 쌍문동, 아동동, 아천동, 안암동, 암사동, 야당동, 야동동, 야탑동, 양벌동, 양서면, 양지동, 양지읍, 양촌읍, 어둔동, 여수동, 역동, 역촌동, 연다산동, 염창동, 오곡동, 오금동, 오남읍, 오도동, 오류동, 오쇠동, 오정동, 와동동, 와부읍, 왕길동, 외발산동, 용답동, 용두동, 용종동, 용현동, 우이동, 운양동, 원당동, 원종동, 원흥동, 월계동, 월곶면, 월롱면, 유양동, 율동, 율현동, 은행동, 응암동, 의정부동, 이매동, 이문동, 이패동, 이화동, 인창동, 일산동, 일원동, 일패동, 임학동, 자곡동, 자양동, 자일동, 잠실동, 장기동, 장단면, 장안동, 장암동, 장위동, 장지동, 장항동, 장흥면, 전농동, 정릉동, 정발산동, 제기동, 조리읍, 조안면, 종암동, 주교동, 주엽동, 중계동, 중곡동, 중대동, 중산동, 중앙동, 중화동, 증산동, 지금동, 지영동, 지축동, 직동, 진건읍, 진관동, 진접읍, 창곡동, 창동, 창우동, 천현동, 천호동, 청량리동, 초월읍, 초이동, 초일동, 추자동, 춘궁동, 탄벌동, 탄현동, 탄현면, 태전동, 태평동, 토당동, 토평동, 통진읍, 퇴계원읍, 퇴촌면, 파주읍, 평내동, 평동, 평창동, 포곡읍, 풍납동, 풍동, 풍무동, 풍산동, 하계동, 하대원동, 하사창동, 하산곡동, 하성면, 하야동, ?
    ```

    </details>
- `🚦 [ROADMAP 22:21:26.373] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`

    <details>
    <summary>🔽 {...</summary>

    ```json
                                                                                                        {
                                                                                                          "dropoff": "중구",
                                                                                                          "fare": 96000,
                                                                                                          "id": "1bebcb6b-acb4-4335-8e7d-4a6a71d665bb",
                                                                                                          "pickup": "경안동",
                                                                                                          "pickupDistance": 0.2,
                                                                                                          "rawText": "0.2, 55.6, 경안동, 중구, 라, 9.6",
                                                                                                          "timestamp": "2026-04-16T22:21:26Z",
                                                                                                          "type": "NEW_ORDER",
                                                                                                          "vehicleType": "라"
                                                                                                        }
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
    └─ [data][0] 상세 정보:
    ```

    </details>
- `🚦 [ROADMAP 22:21:26.698] [📱앱] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    {"allowedVehicleTypes":["다마스","라보","오토바이"],"isActive":true,"isSharedMode":true,"pickupRadiusKm":30.0,"minFare":35000.0,"maxFare":1000000.0,"excludedKeywords":"착불,수거,까대기,전화금지,타일","destinationCity":"파주시","destinationRadiusKm":10.0,"destinationKeywords":"가능동, 가락동, 가양동, 가좌동, 갈매동, 갈현동, 감북동, 감이동, 감일동, 감정동, 강매동, 강일동, 강하면, 개화동, 거여동, 걸포동, 검산동, 검암동, 경안동, 계산동, 고강동, 고덕동, 고산동, 고양동, 고읍동, 고촌읍, 곤지암읍, 공릉동, 공항동, 과해동, 관산동, 광사동, 광암동, 광장동, 광적면, 광탄면, 교문동, 교산동, 교하동, 구기동, 구래동, 구산동, 구의동, 군자동, 귤현동, 금곡동, 금광동, 금릉동, 금오동, 금촌동, 길동, 길음동, 낙양동, 남가좌동, 남방동, 남종면, 남한산성면, 내곡동, 내발산동, 내유동, 노오지동, 녹번동, 녹양동, 능동, 능평동, 다남동, 다산동, 다율동, 단대동, 답십리동, 당정동, 당하동, 대곡동, 대곶면, 대자동, 대장동, 대조동, 대화동, 덕계동, 덕은동, 덕이동, 덕풍동, 도내동, 도농동, 도봉동, 도척면, 도촌동, 돈암동, 동산동, 동양동, 동패동, 둑실동, 둔촌동, 등촌동, 마곡동, 마두동, 마산동, 마장동, 마전동, 마천동, 만송동, 망우동, 망월동, 매산동, 맥금동, 면목동, 명일동, 모현읍, 목동, 목동동, 목상동, 목현동, 묵동, 문발동, 문봉동, 문산읍, 문정동, 문형동, 미사동, 미아동, 민락동, 박촌동, 방이동, 방축동, 방학동, 방화동, 배알미동, 백석동, 백석읍, 번동, 법곳동, 벽제동, 별내동, 별내면, 병방동, 복정동, 부암동, 북가좌동, 북변동, 북한동, 분당동, 불광동, 불로동, 사근동, 사노동, 사리현동, 사우동, 산곡동, 산남동, 산북동, 산북면, 산성동, 산황동, 삼동, 삼송동, 삼전동, 삼정동, 삼패동, 상계동, 상대원동, 상봉동, 상사창동, 상산곡동, 상암동, 상야동, 상월곡동, 상일동, 상지석동, 서운동, 서패동, 서현동, 석관동, 석촌동, 선동, 선유동, 선주지동, 설문동, 성남동, 성내동, 성사동, 성산동, 성석동, 성수동, 세곡동, 소흘읍, 송정동, 송촌동, 송파동, 수색동, 수서동, 수석동, 수유동, 수진동, 수택동, 시천동, 식사동, 신곡동, 신내동, 신둔면, 신사동, 신영동, 신원동, 신월동, 신장동, 신천동, 신촌동, 신평동, 신현동, 신흥동, 쌍령동, 쌍문동, 아동동, 아천동, 안암동, 암사동, 야당동, 야동동, 야탑동, 양벌동, 양서면, 양지동, 양지읍, 양촌읍, 어둔동, 여수동, 역동, 역촌동, 연다산동, 염창동, 오곡동, 오금동, 오남읍, 오도동, 오류동, 오쇠동, 오정동, 와동동, 와부읍, 왕길동, 외발산동, 용답동, 용두동, 용종동, 용현동, 우이동, 운양동, 원당동, 원종동, 원흥동, 월계동, 월곶면, 월롱면, 유양동, 율동, 율현동, 은행동, 응암동, 의정부동, 이매동, 이문동, 이패동, 이화동, 인창동, 일산동, 일원동, 일패동, 임학동, 자곡동, 자양동, 자일동, 잠실동, 장기동, 장단면, 장안동, 장암동, 장위동, 장지동, 장항동, 장흥면, 전농동, 정릉동, 정발산동, 제기동, 조리읍, 조안면, 종암동, 주교동, 주엽동, 중계동, 중곡동, 중대동, 중산동, 중앙동, 중화동, 증산동, 지금동, 지영동, 지축동, 직동, 진건읍, 진관동, 진접읍, 창곡동, 창동, 창우동, 천현동, 천호동, 청량리동, 초월읍, 초이동, 초일동, 추자동, 춘궁동, 탄벌동, 탄현동, 탄현면, 태전동, 태평동, 토당동, 토평동, 통진읍, 퇴계원읍, 퇴촌면, 파주읍, 평내동, 평동, 평창동, 포곡읍, 풍납동, 풍동, 풍무동, 풍산동, 하계동, 하대원동, 하사창동, 하산곡동, 하성면, 하야동, ?
    ```

    </details>
- `🚦 [ROADMAP 22:21:31.384] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`

    <details>
    <summary>🔽 {...</summary>

    ```json
                                                                                                        {
                                                                                                          "dropoff": "부평구",
                                                                                                          "fare": 82000,
                                                                                                          "id": "15ad2b78-66c9-485e-b1cf-b2c68292e33b",
                                                                                                          "pickup": "경안동",
                                                                                                          "pickupDistance": 0.2,
                                                                                                          "rawText": "0.2, 46.5, @, 오후3시14/경안동, 부평구, 오, 8.2",
                                                                                                          "timestamp": "2026-04-16T22:21:31Z",
                                                                                                          "type": "NEW_ORDER",
                                                                                                          "vehicleType": "오"
                                                                                                        }
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
    └─ [data][0] 상세 정보:
    ```

    </details>
- `🚦 [ROADMAP 22:21:31.711] [📱앱] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    {"allowedVehicleTypes":["다마스","라보","오토바이"],"isActive":true,"isSharedMode":true,"pickupRadiusKm":30.0,"minFare":35000.0,"maxFare":1000000.0,"excludedKeywords":"착불,수거,까대기,전화금지,타일","destinationCity":"파주시","destinationRadiusKm":10.0,"destinationKeywords":"가능동, 가락동, 가양동, 가좌동, 갈매동, 갈현동, 감북동, 감이동, 감일동, 감정동, 강매동, 강일동, 강하면, 개화동, 거여동, 걸포동, 검산동, 검암동, 경안동, 계산동, 고강동, 고덕동, 고산동, 고양동, 고읍동, 고촌읍, 곤지암읍, 공릉동, 공항동, 과해동, 관산동, 광사동, 광암동, 광장동, 광적면, 광탄면, 교문동, 교산동, 교하동, 구기동, 구래동, 구산동, 구의동, 군자동, 귤현동, 금곡동, 금광동, 금릉동, 금오동, 금촌동, 길동, 길음동, 낙양동, 남가좌동, 남방동, 남종면, 남한산성면, 내곡동, 내발산동, 내유동, 노오지동, 녹번동, 녹양동, 능동, 능평동, 다남동, 다산동, 다율동, 단대동, 답십리동, 당정동, 당하동, 대곡동, 대곶면, 대자동, 대장동, 대조동, 대화동, 덕계동, 덕은동, 덕이동, 덕풍동, 도내동, 도농동, 도봉동, 도척면, 도촌동, 돈암동, 동산동, 동양동, 동패동, 둑실동, 둔촌동, 등촌동, 마곡동, 마두동, 마산동, 마장동, 마전동, 마천동, 만송동, 망우동, 망월동, 매산동, 맥금동, 면목동, 명일동, 모현읍, 목동, 목동동, 목상동, 목현동, 묵동, 문발동, 문봉동, 문산읍, 문정동, 문형동, 미사동, 미아동, 민락동, 박촌동, 방이동, 방축동, 방학동, 방화동, 배알미동, 백석동, 백석읍, 번동, 법곳동, 벽제동, 별내동, 별내면, 병방동, 복정동, 부암동, 북가좌동, 북변동, 북한동, 분당동, 불광동, 불로동, 사근동, 사노동, 사리현동, 사우동, 산곡동, 산남동, 산북동, 산북면, 산성동, 산황동, 삼동, 삼송동, 삼전동, 삼정동, 삼패동, 상계동, 상대원동, 상봉동, 상사창동, 상산곡동, 상암동, 상야동, 상월곡동, 상일동, 상지석동, 서운동, 서패동, 서현동, 석관동, 석촌동, 선동, 선유동, 선주지동, 설문동, 성남동, 성내동, 성사동, 성산동, 성석동, 성수동, 세곡동, 소흘읍, 송정동, 송촌동, 송파동, 수색동, 수서동, 수석동, 수유동, 수진동, 수택동, 시천동, 식사동, 신곡동, 신내동, 신둔면, 신사동, 신영동, 신원동, 신월동, 신장동, 신천동, 신촌동, 신평동, 신현동, 신흥동, 쌍령동, 쌍문동, 아동동, 아천동, 안암동, 암사동, 야당동, 야동동, 야탑동, 양벌동, 양서면, 양지동, 양지읍, 양촌읍, 어둔동, 여수동, 역동, 역촌동, 연다산동, 염창동, 오곡동, 오금동, 오남읍, 오도동, 오류동, 오쇠동, 오정동, 와동동, 와부읍, 왕길동, 외발산동, 용답동, 용두동, 용종동, 용현동, 우이동, 운양동, 원당동, 원종동, 원흥동, 월계동, 월곶면, 월롱면, 유양동, 율동, 율현동, 은행동, 응암동, 의정부동, 이매동, 이문동, 이패동, 이화동, 인창동, 일산동, 일원동, 일패동, 임학동, 자곡동, 자양동, 자일동, 잠실동, 장기동, 장단면, 장안동, 장암동, 장위동, 장지동, 장항동, 장흥면, 전농동, 정릉동, 정발산동, 제기동, 조리읍, 조안면, 종암동, 주교동, 주엽동, 중계동, 중곡동, 중대동, 중산동, 중앙동, 중화동, 증산동, 지금동, 지영동, 지축동, 직동, 진건읍, 진관동, 진접읍, 창곡동, 창동, 창우동, 천현동, 천호동, 청량리동, 초월읍, 초이동, 초일동, 추자동, 춘궁동, 탄벌동, 탄현동, 탄현면, 태전동, 태평동, 토당동, 토평동, 통진읍, 퇴계원읍, 퇴촌면, 파주읍, 평내동, 평동, 평창동, 포곡읍, 풍납동, 풍동, 풍무동, 풍산동, 하계동, 하대원동, 하사창동, 하산곡동, 하성면, 하야동, ?
    ```

    </details>
- `🚦 [ROADMAP 22:21:36.434] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`

    <details>
    <summary>🔽 {...</summary>

    ```json
                                                                                                        {
                                                                                                          "dropoff": "마포구",
                                                                                                          "fare": 59000,
                                                                                                          "id": "eb8f98db-4b51-42e9-86e6-256376d15335",
                                                                                                          "pickup": "경안동",
                                                                                                          "pickupDistance": 0.2,
                                                                                                          "rawText": "0.2, 32.5, @, 경안동, 마포구, 1t, 5.9",
                                                                                                          "timestamp": "2026-04-16T22:21:36Z",
                                                                                                          "type": "NEW_ORDER",
                                                                                                          "vehicleType": "1t"
                                                                                                        }
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
    └─ [data][0] 상세 정보:
    ```

    </details>
- `🚦 [ROADMAP 22:21:36.761] [📱앱] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    {"allowedVehicleTypes":["다마스","라보","오토바이"],"isActive":true,"isSharedMode":true,"pickupRadiusKm":30.0,"minFare":35000.0,"maxFare":1000000.0,"excludedKeywords":"착불,수거,까대기,전화금지,타일","destinationCity":"파주시","destinationRadiusKm":10.0,"destinationKeywords":"가능동, 가락동, 가양동, 가좌동, 갈매동, 갈현동, 감북동, 감이동, 감일동, 감정동, 강매동, 강일동, 강하면, 개화동, 거여동, 걸포동, 검산동, 검암동, 경안동, 계산동, 고강동, 고덕동, 고산동, 고양동, 고읍동, 고촌읍, 곤지암읍, 공릉동, 공항동, 과해동, 관산동, 광사동, 광암동, 광장동, 광적면, 광탄면, 교문동, 교산동, 교하동, 구기동, 구래동, 구산동, 구의동, 군자동, 귤현동, 금곡동, 금광동, 금릉동, 금오동, 금촌동, 길동, 길음동, 낙양동, 남가좌동, 남방동, 남종면, 남한산성면, 내곡동, 내발산동, 내유동, 노오지동, 녹번동, 녹양동, 능동, 능평동, 다남동, 다산동, 다율동, 단대동, 답십리동, 당정동, 당하동, 대곡동, 대곶면, 대자동, 대장동, 대조동, 대화동, 덕계동, 덕은동, 덕이동, 덕풍동, 도내동, 도농동, 도봉동, 도척면, 도촌동, 돈암동, 동산동, 동양동, 동패동, 둑실동, 둔촌동, 등촌동, 마곡동, 마두동, 마산동, 마장동, 마전동, 마천동, 만송동, 망우동, 망월동, 매산동, 맥금동, 면목동, 명일동, 모현읍, 목동, 목동동, 목상동, 목현동, 묵동, 문발동, 문봉동, 문산읍, 문정동, 문형동, 미사동, 미아동, 민락동, 박촌동, 방이동, 방축동, 방학동, 방화동, 배알미동, 백석동, 백석읍, 번동, 법곳동, 벽제동, 별내동, 별내면, 병방동, 복정동, 부암동, 북가좌동, 북변동, 북한동, 분당동, 불광동, 불로동, 사근동, 사노동, 사리현동, 사우동, 산곡동, 산남동, 산북동, 산북면, 산성동, 산황동, 삼동, 삼송동, 삼전동, 삼정동, 삼패동, 상계동, 상대원동, 상봉동, 상사창동, 상산곡동, 상암동, 상야동, 상월곡동, 상일동, 상지석동, 서운동, 서패동, 서현동, 석관동, 석촌동, 선동, 선유동, 선주지동, 설문동, 성남동, 성내동, 성사동, 성산동, 성석동, 성수동, 세곡동, 소흘읍, 송정동, 송촌동, 송파동, 수색동, 수서동, 수석동, 수유동, 수진동, 수택동, 시천동, 식사동, 신곡동, 신내동, 신둔면, 신사동, 신영동, 신원동, 신월동, 신장동, 신천동, 신촌동, 신평동, 신현동, 신흥동, 쌍령동, 쌍문동, 아동동, 아천동, 안암동, 암사동, 야당동, 야동동, 야탑동, 양벌동, 양서면, 양지동, 양지읍, 양촌읍, 어둔동, 여수동, 역동, 역촌동, 연다산동, 염창동, 오곡동, 오금동, 오남읍, 오도동, 오류동, 오쇠동, 오정동, 와동동, 와부읍, 왕길동, 외발산동, 용답동, 용두동, 용종동, 용현동, 우이동, 운양동, 원당동, 원종동, 원흥동, 월계동, 월곶면, 월롱면, 유양동, 율동, 율현동, 은행동, 응암동, 의정부동, 이매동, 이문동, 이패동, 이화동, 인창동, 일산동, 일원동, 일패동, 임학동, 자곡동, 자양동, 자일동, 잠실동, 장기동, 장단면, 장안동, 장암동, 장위동, 장지동, 장항동, 장흥면, 전농동, 정릉동, 정발산동, 제기동, 조리읍, 조안면, 종암동, 주교동, 주엽동, 중계동, 중곡동, 중대동, 중산동, 중앙동, 중화동, 증산동, 지금동, 지영동, 지축동, 직동, 진건읍, 진관동, 진접읍, 창곡동, 창동, 창우동, 천현동, 천호동, 청량리동, 초월읍, 초이동, 초일동, 추자동, 춘궁동, 탄벌동, 탄현동, 탄현면, 태전동, 태평동, 토당동, 토평동, 통진읍, 퇴계원읍, 퇴촌면, 파주읍, 평내동, 평동, 평창동, 포곡읍, 풍납동, 풍동, 풍무동, 풍산동, 하계동, 하대원동, 하사창동, 하산곡동, 하성면, 하야동, ?
    ```

    </details>
- `🚦 [ROADMAP 22:21:41.396] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`

    <details>
    <summary>🔽 {...</summary>

    ```json
                                                                                                        {
                                                                                                          "dropoff": "적성면",
                                                                                                          "fare": 114000,
                                                                                                          "id": "cfa72089-a926-469f-93a3-86a1411ca547",
                                                                                                          "pickup": "경안동",
                                                                                                          "pickupDistance": 0.2,
                                                                                                          "rawText": "0.2, 67.2, 경안동, 적성면, 오, 11.4",
                                                                                                          "timestamp": "2026-04-16T22:21:41Z",
                                                                                                          "type": "NEW_ORDER",
                                                                                                          "vehicleType": "오"
                                                                                                        }
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
    └─ [data][0] 상세 정보:
    ```

    </details>
- `🚦 [ROADMAP 22:21:41.732] [📱앱] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    {"allowedVehicleTypes":["다마스","라보","오토바이"],"isActive":true,"isSharedMode":true,"pickupRadiusKm":30.0,"minFare":35000.0,"maxFare":1000000.0,"excludedKeywords":"착불,수거,까대기,전화금지,타일","destinationCity":"파주시","destinationRadiusKm":10.0,"destinationKeywords":"가능동, 가락동, 가양동, 가좌동, 갈매동, 갈현동, 감북동, 감이동, 감일동, 감정동, 강매동, 강일동, 강하면, 개화동, 거여동, 걸포동, 검산동, 검암동, 경안동, 계산동, 고강동, 고덕동, 고산동, 고양동, 고읍동, 고촌읍, 곤지암읍, 공릉동, 공항동, 과해동, 관산동, 광사동, 광암동, 광장동, 광적면, 광탄면, 교문동, 교산동, 교하동, 구기동, 구래동, 구산동, 구의동, 군자동, 귤현동, 금곡동, 금광동, 금릉동, 금오동, 금촌동, 길동, 길음동, 낙양동, 남가좌동, 남방동, 남종면, 남한산성면, 내곡동, 내발산동, 내유동, 노오지동, 녹번동, 녹양동, 능동, 능평동, 다남동, 다산동, 다율동, 단대동, 답십리동, 당정동, 당하동, 대곡동, 대곶면, 대자동, 대장동, 대조동, 대화동, 덕계동, 덕은동, 덕이동, 덕풍동, 도내동, 도농동, 도봉동, 도척면, 도촌동, 돈암동, 동산동, 동양동, 동패동, 둑실동, 둔촌동, 등촌동, 마곡동, 마두동, 마산동, 마장동, 마전동, 마천동, 만송동, 망우동, 망월동, 매산동, 맥금동, 면목동, 명일동, 모현읍, 목동, 목동동, 목상동, 목현동, 묵동, 문발동, 문봉동, 문산읍, 문정동, 문형동, 미사동, 미아동, 민락동, 박촌동, 방이동, 방축동, 방학동, 방화동, 배알미동, 백석동, 백석읍, 번동, 법곳동, 벽제동, 별내동, 별내면, 병방동, 복정동, 부암동, 북가좌동, 북변동, 북한동, 분당동, 불광동, 불로동, 사근동, 사노동, 사리현동, 사우동, 산곡동, 산남동, 산북동, 산북면, 산성동, 산황동, 삼동, 삼송동, 삼전동, 삼정동, 삼패동, 상계동, 상대원동, 상봉동, 상사창동, 상산곡동, 상암동, 상야동, 상월곡동, 상일동, 상지석동, 서운동, 서패동, 서현동, 석관동, 석촌동, 선동, 선유동, 선주지동, 설문동, 성남동, 성내동, 성사동, 성산동, 성석동, 성수동, 세곡동, 소흘읍, 송정동, 송촌동, 송파동, 수색동, 수서동, 수석동, 수유동, 수진동, 수택동, 시천동, 식사동, 신곡동, 신내동, 신둔면, 신사동, 신영동, 신원동, 신월동, 신장동, 신천동, 신촌동, 신평동, 신현동, 신흥동, 쌍령동, 쌍문동, 아동동, 아천동, 안암동, 암사동, 야당동, 야동동, 야탑동, 양벌동, 양서면, 양지동, 양지읍, 양촌읍, 어둔동, 여수동, 역동, 역촌동, 연다산동, 염창동, 오곡동, 오금동, 오남읍, 오도동, 오류동, 오쇠동, 오정동, 와동동, 와부읍, 왕길동, 외발산동, 용답동, 용두동, 용종동, 용현동, 우이동, 운양동, 원당동, 원종동, 원흥동, 월계동, 월곶면, 월롱면, 유양동, 율동, 율현동, 은행동, 응암동, 의정부동, 이매동, 이문동, 이패동, 이화동, 인창동, 일산동, 일원동, 일패동, 임학동, 자곡동, 자양동, 자일동, 잠실동, 장기동, 장단면, 장안동, 장암동, 장위동, 장지동, 장항동, 장흥면, 전농동, 정릉동, 정발산동, 제기동, 조리읍, 조안면, 종암동, 주교동, 주엽동, 중계동, 중곡동, 중대동, 중산동, 중앙동, 중화동, 증산동, 지금동, 지영동, 지축동, 직동, 진건읍, 진관동, 진접읍, 창곡동, 창동, 창우동, 천현동, 천호동, 청량리동, 초월읍, 초이동, 초일동, 추자동, 춘궁동, 탄벌동, 탄현동, 탄현면, 태전동, 태평동, 토당동, 토평동, 통진읍, 퇴계원읍, 퇴촌면, 파주읍, 평내동, 평동, 평창동, 포곡읍, 풍납동, 풍동, 풍무동, 풍산동, 하계동, 하대원동, 하사창동, 하산곡동, 하성면, 하야동, ?
    ```

    </details>
- `🚦 [ROADMAP 22:21:46.384] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`

    <details>
    <summary>🔽 {...</summary>

    ```json
                                                                                                        {
                                                                                                          "dropoff": "퇴촌면",
                                                                                                          "fare": 30000,
                                                                                                          "id": "6fe747f7-fa60-4b1d-bac2-14bcb5a1ddfb",
                                                                                                          "pickup": "경안동",
                                                                                                          "pickupDistance": 0.2,
                                                                                                          "rawText": "0.2, 9.1, @, 급송/경안동, 퇴촌면, 오, 3.0",
                                                                                                          "timestamp": "2026-04-16T22:21:46Z",
                                                                                                          "type": "NEW_ORDER",
                                                                                                          "vehicleType": "오"
                                                                                                        }
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
    └─ [data][0] 상세 정보:
    ```

    </details>
- `🚦 [ROADMAP 22:21:46.703] [📱앱] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    {"allowedVehicleTypes":["다마스","라보","오토바이"],"isActive":true,"isSharedMode":true,"pickupRadiusKm":30.0,"minFare":35000.0,"maxFare":1000000.0,"excludedKeywords":"착불,수거,까대기,전화금지,타일","destinationCity":"파주시","destinationRadiusKm":10.0,"destinationKeywords":"가능동, 가락동, 가양동, 가좌동, 갈매동, 갈현동, 감북동, 감이동, 감일동, 감정동, 강매동, 강일동, 강하면, 개화동, 거여동, 걸포동, 검산동, 검암동, 경안동, 계산동, 고강동, 고덕동, 고산동, 고양동, 고읍동, 고촌읍, 곤지암읍, 공릉동, 공항동, 과해동, 관산동, 광사동, 광암동, 광장동, 광적면, 광탄면, 교문동, 교산동, 교하동, 구기동, 구래동, 구산동, 구의동, 군자동, 귤현동, 금곡동, 금광동, 금릉동, 금오동, 금촌동, 길동, 길음동, 낙양동, 남가좌동, 남방동, 남종면, 남한산성면, 내곡동, 내발산동, 내유동, 노오지동, 녹번동, 녹양동, 능동, 능평동, 다남동, 다산동, 다율동, 단대동, 답십리동, 당정동, 당하동, 대곡동, 대곶면, 대자동, 대장동, 대조동, 대화동, 덕계동, 덕은동, 덕이동, 덕풍동, 도내동, 도농동, 도봉동, 도척면, 도촌동, 돈암동, 동산동, 동양동, 동패동, 둑실동, 둔촌동, 등촌동, 마곡동, 마두동, 마산동, 마장동, 마전동, 마천동, 만송동, 망우동, 망월동, 매산동, 맥금동, 면목동, 명일동, 모현읍, 목동, 목동동, 목상동, 목현동, 묵동, 문발동, 문봉동, 문산읍, 문정동, 문형동, 미사동, 미아동, 민락동, 박촌동, 방이동, 방축동, 방학동, 방화동, 배알미동, 백석동, 백석읍, 번동, 법곳동, 벽제동, 별내동, 별내면, 병방동, 복정동, 부암동, 북가좌동, 북변동, 북한동, 분당동, 불광동, 불로동, 사근동, 사노동, 사리현동, 사우동, 산곡동, 산남동, 산북동, 산북면, 산성동, 산황동, 삼동, 삼송동, 삼전동, 삼정동, 삼패동, 상계동, 상대원동, 상봉동, 상사창동, 상산곡동, 상암동, 상야동, 상월곡동, 상일동, 상지석동, 서운동, 서패동, 서현동, 석관동, 석촌동, 선동, 선유동, 선주지동, 설문동, 성남동, 성내동, 성사동, 성산동, 성석동, 성수동, 세곡동, 소흘읍, 송정동, 송촌동, 송파동, 수색동, 수서동, 수석동, 수유동, 수진동, 수택동, 시천동, 식사동, 신곡동, 신내동, 신둔면, 신사동, 신영동, 신원동, 신월동, 신장동, 신천동, 신촌동, 신평동, 신현동, 신흥동, 쌍령동, 쌍문동, 아동동, 아천동, 안암동, 암사동, 야당동, 야동동, 야탑동, 양벌동, 양서면, 양지동, 양지읍, 양촌읍, 어둔동, 여수동, 역동, 역촌동, 연다산동, 염창동, 오곡동, 오금동, 오남읍, 오도동, 오류동, 오쇠동, 오정동, 와동동, 와부읍, 왕길동, 외발산동, 용답동, 용두동, 용종동, 용현동, 우이동, 운양동, 원당동, 원종동, 원흥동, 월계동, 월곶면, 월롱면, 유양동, 율동, 율현동, 은행동, 응암동, 의정부동, 이매동, 이문동, 이패동, 이화동, 인창동, 일산동, 일원동, 일패동, 임학동, 자곡동, 자양동, 자일동, 잠실동, 장기동, 장단면, 장안동, 장암동, 장위동, 장지동, 장항동, 장흥면, 전농동, 정릉동, 정발산동, 제기동, 조리읍, 조안면, 종암동, 주교동, 주엽동, 중계동, 중곡동, 중대동, 중산동, 중앙동, 중화동, 증산동, 지금동, 지영동, 지축동, 직동, 진건읍, 진관동, 진접읍, 창곡동, 창동, 창우동, 천현동, 천호동, 청량리동, 초월읍, 초이동, 초일동, 추자동, 춘궁동, 탄벌동, 탄현동, 탄현면, 태전동, 태평동, 토당동, 토평동, 통진읍, 퇴계원읍, 퇴촌면, 파주읍, 평내동, 평동, 평창동, 포곡읍, 풍납동, 풍동, 풍무동, 풍산동, 하계동, 하대원동, 하사창동, 하산곡동, 하성면, 하야동, ?
    ```

    </details>
- `🚦 [ROADMAP 22:21:51.393] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`

    <details>
    <summary>🔽 {...</summary>

    ```json
                                                                                                        {
                                                                                                          "dropoff": "퇴촌면",
                                                                                                          "fare": 30000,
                                                                                                          "id": "970c5c71-2d24-42b0-8a01-a0176affd3b1",
                                                                                                          "pickup": "초월읍",
                                                                                                          "pickupDistance": 5.1,
                                                                                                          "rawText": "5.1, 6.9, 초월읍, 퇴촌면, 라, 3.0",
                                                                                                          "timestamp": "2026-04-16T22:21:51Z",
                                                                                                          "type": "NEW_ORDER",
                                                                                                          "vehicleType": "라"
                                                                                                        }
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
    └─ [data][0] 상세 정보:
    ```

    </details>
- `🚦 [ROADMAP 22:21:51.720] [📱앱] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    {"allowedVehicleTypes":["다마스","라보","오토바이"],"isActive":true,"isSharedMode":true,"pickupRadiusKm":30.0,"minFare":35000.0,"maxFare":1000000.0,"excludedKeywords":"착불,수거,까대기,전화금지,타일","destinationCity":"파주시","destinationRadiusKm":10.0,"destinationKeywords":"가능동, 가락동, 가양동, 가좌동, 갈매동, 갈현동, 감북동, 감이동, 감일동, 감정동, 강매동, 강일동, 강하면, 개화동, 거여동, 걸포동, 검산동, 검암동, 경안동, 계산동, 고강동, 고덕동, 고산동, 고양동, 고읍동, 고촌읍, 곤지암읍, 공릉동, 공항동, 과해동, 관산동, 광사동, 광암동, 광장동, 광적면, 광탄면, 교문동, 교산동, 교하동, 구기동, 구래동, 구산동, 구의동, 군자동, 귤현동, 금곡동, 금광동, 금릉동, 금오동, 금촌동, 길동, 길음동, 낙양동, 남가좌동, 남방동, 남종면, 남한산성면, 내곡동, 내발산동, 내유동, 노오지동, 녹번동, 녹양동, 능동, 능평동, 다남동, 다산동, 다율동, 단대동, 답십리동, 당정동, 당하동, 대곡동, 대곶면, 대자동, 대장동, 대조동, 대화동, 덕계동, 덕은동, 덕이동, 덕풍동, 도내동, 도농동, 도봉동, 도척면, 도촌동, 돈암동, 동산동, 동양동, 동패동, 둑실동, 둔촌동, 등촌동, 마곡동, 마두동, 마산동, 마장동, 마전동, 마천동, 만송동, 망우동, 망월동, 매산동, 맥금동, 면목동, 명일동, 모현읍, 목동, 목동동, 목상동, 목현동, 묵동, 문발동, 문봉동, 문산읍, 문정동, 문형동, 미사동, 미아동, 민락동, 박촌동, 방이동, 방축동, 방학동, 방화동, 배알미동, 백석동, 백석읍, 번동, 법곳동, 벽제동, 별내동, 별내면, 병방동, 복정동, 부암동, 북가좌동, 북변동, 북한동, 분당동, 불광동, 불로동, 사근동, 사노동, 사리현동, 사우동, 산곡동, 산남동, 산북동, 산북면, 산성동, 산황동, 삼동, 삼송동, 삼전동, 삼정동, 삼패동, 상계동, 상대원동, 상봉동, 상사창동, 상산곡동, 상암동, 상야동, 상월곡동, 상일동, 상지석동, 서운동, 서패동, 서현동, 석관동, 석촌동, 선동, 선유동, 선주지동, 설문동, 성남동, 성내동, 성사동, 성산동, 성석동, 성수동, 세곡동, 소흘읍, 송정동, 송촌동, 송파동, 수색동, 수서동, 수석동, 수유동, 수진동, 수택동, 시천동, 식사동, 신곡동, 신내동, 신둔면, 신사동, 신영동, 신원동, 신월동, 신장동, 신천동, 신촌동, 신평동, 신현동, 신흥동, 쌍령동, 쌍문동, 아동동, 아천동, 안암동, 암사동, 야당동, 야동동, 야탑동, 양벌동, 양서면, 양지동, 양지읍, 양촌읍, 어둔동, 여수동, 역동, 역촌동, 연다산동, 염창동, 오곡동, 오금동, 오남읍, 오도동, 오류동, 오쇠동, 오정동, 와동동, 와부읍, 왕길동, 외발산동, 용답동, 용두동, 용종동, 용현동, 우이동, 운양동, 원당동, 원종동, 원흥동, 월계동, 월곶면, 월롱면, 유양동, 율동, 율현동, 은행동, 응암동, 의정부동, 이매동, 이문동, 이패동, 이화동, 인창동, 일산동, 일원동, 일패동, 임학동, 자곡동, 자양동, 자일동, 잠실동, 장기동, 장단면, 장안동, 장암동, 장위동, 장지동, 장항동, 장흥면, 전농동, 정릉동, 정발산동, 제기동, 조리읍, 조안면, 종암동, 주교동, 주엽동, 중계동, 중곡동, 중대동, 중산동, 중앙동, 중화동, 증산동, 지금동, 지영동, 지축동, 직동, 진건읍, 진관동, 진접읍, 창곡동, 창동, 창우동, 천현동, 천호동, 청량리동, 초월읍, 초이동, 초일동, 추자동, 춘궁동, 탄벌동, 탄현동, 탄현면, 태전동, 태평동, 토당동, 토평동, 통진읍, 퇴계원읍, 퇴촌면, 파주읍, 평내동, 평동, 평창동, 포곡읍, 풍납동, 풍동, 풍무동, 풍산동, 하계동, 하대원동, 하사창동, 하산곡동, 하성면, 하야동, ?
    ```

    </details>
- `🚦 [ROADMAP 22:21:56.377] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`

    <details>
    <summary>🔽 {...</summary>

    ```json
                                                                                                        {
                                                                                                          "dropoff": "만안구",
                                                                                                          "fare": 42000,
                                                                                                          "id": "8280dc04-7d30-4d23-8f24-4bf0a6ef5c84",
                                                                                                          "pickup": "분당구",
                                                                                                          "pickupDistance": 8.5,
                                                                                                          "rawText": "8.5, 18.8, 분당구, 만안구, 라, 4.2",
                                                                                                          "timestamp": "2026-04-16T22:21:56Z",
                                                                                                          "type": "NEW_ORDER",
                                                                                                          "vehicleType": "라"
                                                                                                        }
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "LIST", "data": [ 1개의 오더 객체... ] }
    └─ [data][0] 상세 정보:
    ```

    </details>
- `🚦 [ROADMAP 22:21:56.701] [📱앱] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    {"allowedVehicleTypes":["다마스","라보","오토바이"],"isActive":true,"isSharedMode":true,"pickupRadiusKm":30.0,"minFare":35000.0,"maxFare":1000000.0,"excludedKeywords":"착불,수거,까대기,전화금지,타일","destinationCity":"파주시","destinationRadiusKm":10.0,"destinationKeywords":"가능동, 가락동, 가양동, 가좌동, 갈매동, 갈현동, 감북동, 감이동, 감일동, 감정동, 강매동, 강일동, 강하면, 개화동, 거여동, 걸포동, 검산동, 검암동, 경안동, 계산동, 고강동, 고덕동, 고산동, 고양동, 고읍동, 고촌읍, 곤지암읍, 공릉동, 공항동, 과해동, 관산동, 광사동, 광암동, 광장동, 광적면, 광탄면, 교문동, 교산동, 교하동, 구기동, 구래동, 구산동, 구의동, 군자동, 귤현동, 금곡동, 금광동, 금릉동, 금오동, 금촌동, 길동, 길음동, 낙양동, 남가좌동, 남방동, 남종면, 남한산성면, 내곡동, 내발산동, 내유동, 노오지동, 녹번동, 녹양동, 능동, 능평동, 다남동, 다산동, 다율동, 단대동, 답십리동, 당정동, 당하동, 대곡동, 대곶면, 대자동, 대장동, 대조동, 대화동, 덕계동, 덕은동, 덕이동, 덕풍동, 도내동, 도농동, 도봉동, 도척면, 도촌동, 돈암동, 동산동, 동양동, 동패동, 둑실동, 둔촌동, 등촌동, 마곡동, 마두동, 마산동, 마장동, 마전동, 마천동, 만송동, 망우동, 망월동, 매산동, 맥금동, 면목동, 명일동, 모현읍, 목동, 목동동, 목상동, 목현동, 묵동, 문발동, 문봉동, 문산읍, 문정동, 문형동, 미사동, 미아동, 민락동, 박촌동, 방이동, 방축동, 방학동, 방화동, 배알미동, 백석동, 백석읍, 번동, 법곳동, 벽제동, 별내동, 별내면, 병방동, 복정동, 부암동, 북가좌동, 북변동, 북한동, 분당동, 불광동, 불로동, 사근동, 사노동, 사리현동, 사우동, 산곡동, 산남동, 산북동, 산북면, 산성동, 산황동, 삼동, 삼송동, 삼전동, 삼정동, 삼패동, 상계동, 상대원동, 상봉동, 상사창동, 상산곡동, 상암동, 상야동, 상월곡동, 상일동, 상지석동, 서운동, 서패동, 서현동, 석관동, 석촌동, 선동, 선유동, 선주지동, 설문동, 성남동, 성내동, 성사동, 성산동, 성석동, 성수동, 세곡동, 소흘읍, 송정동, 송촌동, 송파동, 수색동, 수서동, 수석동, 수유동, 수진동, 수택동, 시천동, 식사동, 신곡동, 신내동, 신둔면, 신사동, 신영동, 신원동, 신월동, 신장동, 신천동, 신촌동, 신평동, 신현동, 신흥동, 쌍령동, 쌍문동, 아동동, 아천동, 안암동, 암사동, 야당동, 야동동, 야탑동, 양벌동, 양서면, 양지동, 양지읍, 양촌읍, 어둔동, 여수동, 역동, 역촌동, 연다산동, 염창동, 오곡동, 오금동, 오남읍, 오도동, 오류동, 오쇠동, 오정동, 와동동, 와부읍, 왕길동, 외발산동, 용답동, 용두동, 용종동, 용현동, 우이동, 운양동, 원당동, 원종동, 원흥동, 월계동, 월곶면, 월롱면, 유양동, 율동, 율현동, 은행동, 응암동, 의정부동, 이매동, 이문동, 이패동, 이화동, 인창동, 일산동, 일원동, 일패동, 임학동, 자곡동, 자양동, 자일동, 잠실동, 장기동, 장단면, 장안동, 장암동, 장위동, 장지동, 장항동, 장흥면, 전농동, 정릉동, 정발산동, 제기동, 조리읍, 조안면, 종암동, 주교동, 주엽동, 중계동, 중곡동, 중대동, 중산동, 중앙동, 중화동, 증산동, 지금동, 지영동, 지축동, 직동, 진건읍, 진관동, 진접읍, 창곡동, 창동, 창우동, 천현동, 천호동, 청량리동, 초월읍, 초이동, 초일동, 추자동, 춘궁동, 탄벌동, 탄현동, 탄현면, 태전동, 태평동, 토당동, 토평동, 통진읍, 퇴계원읍, 퇴촌면, 파주읍, 평내동, 평동, 평창동, 포곡읍, 풍납동, 풍동, 풍무동, 풍산동, 하계동, 하대원동, 하사창동, 하산곡동, 하성면, 하야동, ?
    ```

    </details>
- `🚦 [ROADMAP 22:22:01.431] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`
- `🚦 [ROADMAP 22:22:01.439] [📱앱] [LIST] AccessibilityService로 바뀐 리스트 감지 후 text 추출`
- `🚦 [ROADMAP 22:22:01.440] [📱앱] [LIST] 리스트에서 바뀐 text 감지 후 text 추출`
- `🚦 [ROADMAP 22:22:01.441] [📱앱] [LIST] [인성 Socket] 인성콜에 선택된 콜 정보 전달 (꿀콜 클릭!)`
- `🚦 [ROADMAP 22:22:01.497] [📱앱] 버튼 터치 완료 (가로채기 성공) X:917.0, Y:568.0`
- `🚦 [ROADMAP 22:22:01.649] [📱앱] [DETAIL_PRE_CONFIRM] 새로운 화면 진입 판별: DETAIL_PRE_CONFIRM`
- `🚦 [ROADMAP 22:22:01.652] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지 진입으로 바뀐 text중 '확정' 추출 후 클릭`
- `🚦 [ROADMAP 22:22:01.652] [📱앱] '확정' 버튼 인식 ➡️ 클릭 시도`

    <details>
    <summary>🔽 🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용...</summary>

    ```json
    🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용을 긁어서 POST /api/orders/detail 로 보내주세요."}
    ```

    </details>
- `🚦 [ROADMAP 22:22:01.659] [📱앱] [HTTP 폴링] 응답 /orders/confirm`
- `🚦 [ROADMAP 22:22:01.708] [📱앱] 버튼 터치 완료 (가로채기 성공) X:161.0, Y:2251.0`
- `🚦 [ROADMAP 22:22:01.901] [📱앱] [DETAIL_CONFIRMED] 새로운 화면 진입 판별: DETAIL_CONFIRMED`
- `🚦 [ROADMAP 22:22:01.902] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 22:22:01.902] [📱앱] '적요상세' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:22:01.903] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '적요상세' 추출 후 클릭`
- `🚦 [ROADMAP 22:22:01.953] [📱앱] 버튼 터치 완료 (가로채기 성공) X:149.0, Y:1153.0`
- `🚦 [ROADMAP 22:22:02.081] [📱앱] [POPUP_MEMO] 새로운 화면 진입 판별: POPUP_MEMO`
- `🚦 [ROADMAP 22:22:02.082] [📱앱] [POPUP_MEMO] 적요상세페이지에서 '젹요 내용' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 22:22:02.083] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:22:02.138] [📱앱] 버튼 터치 완료 (가로채기 성공) X:540.0, Y:2264.0`
- `🚦 [ROADMAP 22:22:02.180] [📱앱] [DETAIL_CONFIRMED] 새로운 화면 진입 판별: DETAIL_CONFIRMED`
- `🚦 [ROADMAP 22:22:02.180] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 22:22:02.180] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '출발지' 추출 후 클릭`
- `🚦 [ROADMAP 22:22:02.181] [📱앱] '출발지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:22:02.233] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1592.0`
- `🚦 [ROADMAP 22:22:02.309] [📱앱] [POPUP_PICKUP] 새로운 화면 진입 판별: POPUP_PICKUP`
- `🚦 [ROADMAP 22:22:02.310] [📱앱] [POPUP_PICKUP] 출발지페이지 text중 '전화, 위치' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 22:22:02.311] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:22:02.363] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`
- `🚦 [ROADMAP 22:22:02.387] [📱앱] [DETAIL_CONFIRMED] 새로운 화면 진입 판별: DETAIL_CONFIRMED`
- `🚦 [ROADMAP 22:22:02.388] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 22:22:02.388] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '도착지' 추출 후 클릭`
- `🚦 [ROADMAP 22:22:02.389] [📱앱] '도착지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:22:02.449] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1742.0`
- `🚦 [ROADMAP 22:22:02.506] [📱앱] [POPUP_DROPOFF] 새로운 화면 진입 판별: POPUP_DROPOFF`
- `🚦 [ROADMAP 22:22:02.507] [📱앱] [POPUP_DROPOFF] 도착지페이지 text중 '전화, 위치' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 22:22:02.508] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:22:02.508] [📱앱] [POPUP_DROPOFF] 확정페이지 진입`
- `🚦 [ROADMAP 22:22:02.559] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`

    <details>
    <summary>🔽 📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "POPUP_DROPOFF", ...</summary>

    ```json
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "POPUP_DROPOFF", "data": [] }
    ```

    </details>
- `🚦 [ROADMAP 22:22:16.726] [📱앱] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    {"allowedVehicleTypes":["다마스","라보","오토바이"],"isActive":false,"isSharedMode":true,"pickupRadiusKm":30.0,"minFare":35000.0,"maxFare":1000000.0,"excludedKeywords":"착불,수거,까대기,전화금지,타일","destinationCity":"파주시","destinationRadiusKm":10.0,"destinationKeywords":"가능동, 가락동, 가양동, 가좌동, 갈매동, 갈현동, 감북동, 감이동, 감일동, 감정동, 강매동, 강일동, 강하면, 개화동, 거여동, 걸포동, 검산동, 검암동, 경안동, 계산동, 고강동, 고덕동, 고산동, 고양동, 고읍동, 고촌읍, 곤지암읍, 공릉동, 공항동, 과해동, 관산동, 광사동, 광암동, 광장동, 광적면, 광탄면, 교문동, 교산동, 교하동, 구기동, 구래동, 구산동, 구의동, 군자동, 귤현동, 금곡동, 금광동, 금릉동, 금오동, 금촌동, 길동, 길음동, 낙양동, 남가좌동, 남방동, 남종면, 남한산성면, 내곡동, 내발산동, 내유동, 노오지동, 녹번동, 녹양동, 능동, 능평동, 다남동, 다산동, 다율동, 단대동, 답십리동, 당정동, 당하동, 대곡동, 대곶면, 대자동, 대장동, 대조동, 대화동, 덕계동, 덕은동, 덕이동, 덕풍동, 도내동, 도농동, 도봉동, 도척면, 도촌동, 돈암동, 동산동, 동양동, 동패동, 둑실동, 둔촌동, 등촌동, 마곡동, 마두동, 마산동, 마장동, 마전동, 마천동, 만송동, 망우동, 망월동, 매산동, 맥금동, 면목동, 명일동, 모현읍, 목동, 목동동, 목상동, 목현동, 묵동, 문발동, 문봉동, 문산읍, 문정동, 문형동, 미사동, 미아동, 민락동, 박촌동, 방이동, 방축동, 방학동, 방화동, 배알미동, 백석동, 백석읍, 번동, 법곳동, 벽제동, 별내동, 별내면, 병방동, 복정동, 부암동, 북가좌동, 북변동, 북한동, 분당동, 불광동, 불로동, 사근동, 사노동, 사리현동, 사우동, 산곡동, 산남동, 산북동, 산북면, 산성동, 산황동, 삼동, 삼송동, 삼전동, 삼정동, 삼패동, 상계동, 상대원동, 상봉동, 상사창동, 상산곡동, 상암동, 상야동, 상월곡동, 상일동, 상지석동, 서운동, 서패동, 서현동, 석관동, 석촌동, 선동, 선유동, 선주지동, 설문동, 성남동, 성내동, 성사동, 성산동, 성석동, 성수동, 세곡동, 소흘읍, 송정동, 송촌동, 송파동, 수색동, 수서동, 수석동, 수유동, 수진동, 수택동, 시천동, 식사동, 신곡동, 신내동, 신둔면, 신사동, 신영동, 신원동, 신월동, 신장동, 신천동, 신촌동, 신평동, 신현동, 신흥동, 쌍령동, 쌍문동, 아동동, 아천동, 안암동, 암사동, 야당동, 야동동, 야탑동, 양벌동, 양서면, 양지동, 양지읍, 양촌읍, 어둔동, 여수동, 역동, 역촌동, 연다산동, 염창동, 오곡동, 오금동, 오남읍, 오도동, 오류동, 오쇠동, 오정동, 와동동, 와부읍, 왕길동, 외발산동, 용답동, 용두동, 용종동, 용현동, 우이동, 운양동, 원당동, 원종동, 원흥동, 월계동, 월곶면, 월롱면, 유양동, 율동, 율현동, 은행동, 응암동, 의정부동, 이매동, 이문동, 이패동, 이화동, 인창동, 일산동, 일원동, 일패동, 임학동, 자곡동, 자양동, 자일동, 잠실동, 장기동, 장단면, 장안동, 장암동, 장위동, 장지동, 장항동, 장흥면, 전농동, 정릉동, 정발산동, 제기동, 조리읍, 조안면, 종암동, 주교동, 주엽동, 중계동, 중곡동, 중대동, 중산동, 중앙동, 중화동, 증산동, 지금동, 지영동, 지축동, 직동, 진건읍, 진관동, 진접읍, 창곡동, 창동, 창우동, 천현동, 천호동, 청량리동, 초월읍, 초이동, 초일동, 추자동, 춘궁동, 탄벌동, 탄현동, 탄현면, 태전동, 태평동, 토당동, 토평동, 통진읍, 퇴계원읍, 퇴촌면, 파주읍, 평내동, 평동, 평창동, 포곡읍, 풍납동, 풍동, 풍무동, 풍산동, 하계동, 하대원동, 하사창동, 하산곡동, 하성면, 하야동,
    ```

    </details>
- `🚦 [ROADMAP 22:22:33.025] [📱앱] '취소' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:22:33.029] [📱앱] [POPUP_DROPOFF] '취소' 클릭 후 인성 Socket 취소 지시`
- `🚦 [ROADMAP 22:22:33.082] [📱앱] 버튼 터치 완료 (가로채기 성공) X:950.0, Y:478.0`
- `🚦 [ROADMAP 22:22:33.428] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`
- `🚦 [ROADMAP 22:22:33.439] [📱앱] [LIST] AccessibilityService로 바뀐 리스트 감지 후 text 추출`
- `🚦 [ROADMAP 22:22:33.440] [📱앱] [LIST] 리스트에서 바뀐 text 감지 후 text 추출`
- `🚦 [ROADMAP 22:22:33.442] [📱앱] [LIST] [인성 Socket] 인성콜에 선택된 콜 정보 전달 (꿀콜 클릭!)`
- `🚦 [ROADMAP 22:22:33.497] [📱앱] 버튼 터치 완료 (가로채기 성공) X:917.0, Y:568.0`
- `🚦 [ROADMAP 22:22:33.632] [📱앱] [DETAIL_PRE_CONFIRM] 새로운 화면 진입 판별: DETAIL_PRE_CONFIRM`
- `🚦 [ROADMAP 22:22:33.635] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지 진입으로 바뀐 text중 '확정' 추출 후 클릭`
- `🚦 [ROADMAP 22:22:33.636] [📱앱] '확정' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:22:33.689] [📱앱] 버튼 터치 완료 (가로채기 성공) X:161.0, Y:2251.0`
- `🚦 [ROADMAP 22:22:33.835] [📱앱] [DETAIL_CONFIRMED] 새로운 화면 진입 판별: DETAIL_CONFIRMED`
- `🚦 [ROADMAP 22:22:33.835] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 22:22:33.836] [📱앱] '적요상세' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:22:33.837] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '적요상세' 추출 후 클릭`
- `🚦 [ROADMAP 22:22:33.890] [📱앱] 버튼 터치 완료 (가로채기 성공) X:149.0, Y:1153.0`
- `🚦 [ROADMAP 22:22:34.006] [📱앱] [POPUP_MEMO] 새로운 화면 진입 판별: POPUP_MEMO`
- `🚦 [ROADMAP 22:22:34.007] [📱앱] [POPUP_MEMO] 적요상세페이지에서 '젹요 내용' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 22:22:34.007] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:22:34.059] [📱앱] 버튼 터치 완료 (가로채기 성공) X:540.0, Y:2264.0`
- `🚦 [ROADMAP 22:22:34.122] [📱앱] [DETAIL_CONFIRMED] 새로운 화면 진입 판별: DETAIL_CONFIRMED`
- `🚦 [ROADMAP 22:22:34.123] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 22:22:34.124] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '출발지' 추출 후 클릭`
- `🚦 [ROADMAP 22:22:34.130] [📱앱] '출발지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:22:34.183] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1592.0`
- `🚦 [ROADMAP 22:22:34.247] [📱앱] [POPUP_PICKUP] 새로운 화면 진입 판별: POPUP_PICKUP`
- `🚦 [ROADMAP 22:22:34.248] [📱앱] [POPUP_PICKUP] 출발지페이지 text중 '전화, 위치' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 22:22:34.248] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:22:34.299] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`
- `🚦 [ROADMAP 22:22:34.327] [📱앱] [DETAIL_CONFIRMED] 새로운 화면 진입 판별: DETAIL_CONFIRMED`
- `🚦 [ROADMAP 22:22:34.328] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 22:22:34.329] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '도착지' 추출 후 클릭`
- `🚦 [ROADMAP 22:22:34.329] [📱앱] '도착지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:22:34.382] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1742.0`
- `🚦 [ROADMAP 22:22:34.439] [📱앱] [POPUP_DROPOFF] 새로운 화면 진입 판별: POPUP_DROPOFF`
- `🚦 [ROADMAP 22:22:34.439] [📱앱] [POPUP_DROPOFF] 도착지페이지 text중 '전화, 위치' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 22:22:34.439] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:22:34.440] [📱앱] [POPUP_DROPOFF] 확정페이지 진입`
- `🚦 [ROADMAP 22:22:34.494] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`

    <details>
    <summary>🔽 📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "POPUP_DROPOFF", ...</summary>

    ```json
    📦 [전송 페이로드] { "deviceId": "앱폰-sdk_gpho-160", "screenContext": "POPUP_DROPOFF", "data": [] }
    ```

    </details>
- `🚦 [ROADMAP 22:22:36.729] [📱앱] [HTTP 폴링] 응답 (첫콜필터정보/제어명령)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    {"allowedVehicleTypes":["다마스","라보","오토바이"],"isActive":false,"isSharedMode":true,"pickupRadiusKm":30.0,"minFare":35000.0,"maxFare":1000000.0,"excludedKeywords":"착불,수거,까대기,전화금지,타일","destinationCity":"파주시","destinationRadiusKm":10.0,"destinationKeywords":"가능동, 가락동, 가양동, 가좌동, 갈매동, 갈현동, 감북동, 감이동, 감일동, 감정동, 강매동, 강일동, 강하면, 개화동, 거여동, 걸포동, 검산동, 검암동, 경안동, 계산동, 고강동, 고덕동, 고산동, 고양동, 고읍동, 고촌읍, 곤지암읍, 공릉동, 공항동, 과해동, 관산동, 광사동, 광암동, 광장동, 광적면, 광탄면, 교문동, 교산동, 교하동, 구기동, 구래동, 구산동, 구의동, 군자동, 귤현동, 금곡동, 금광동, 금릉동, 금오동, 금촌동, 길동, 길음동, 낙양동, 남가좌동, 남방동, 남종면, 남한산성면, 내곡동, 내발산동, 내유동, 노오지동, 녹번동, 녹양동, 능동, 능평동, 다남동, 다산동, 다율동, 단대동, 답십리동, 당정동, 당하동, 대곡동, 대곶면, 대자동, 대장동, 대조동, 대화동, 덕계동, 덕은동, 덕이동, 덕풍동, 도내동, 도농동, 도봉동, 도척면, 도촌동, 돈암동, 동산동, 동양동, 동패동, 둑실동, 둔촌동, 등촌동, 마곡동, 마두동, 마산동, 마장동, 마전동, 마천동, 만송동, 망우동, 망월동, 매산동, 맥금동, 면목동, 명일동, 모현읍, 목동, 목동동, 목상동, 목현동, 묵동, 문발동, 문봉동, 문산읍, 문정동, 문형동, 미사동, 미아동, 민락동, 박촌동, 방이동, 방축동, 방학동, 방화동, 배알미동, 백석동, 백석읍, 번동, 법곳동, 벽제동, 별내동, 별내면, 병방동, 복정동, 부암동, 북가좌동, 북변동, 북한동, 분당동, 불광동, 불로동, 사근동, 사노동, 사리현동, 사우동, 산곡동, 산남동, 산북동, 산북면, 산성동, 산황동, 삼동, 삼송동, 삼전동, 삼정동, 삼패동, 상계동, 상대원동, 상봉동, 상사창동, 상산곡동, 상암동, 상야동, 상월곡동, 상일동, 상지석동, 서운동, 서패동, 서현동, 석관동, 석촌동, 선동, 선유동, 선주지동, 설문동, 성남동, 성내동, 성사동, 성산동, 성석동, 성수동, 세곡동, 소흘읍, 송정동, 송촌동, 송파동, 수색동, 수서동, 수석동, 수유동, 수진동, 수택동, 시천동, 식사동, 신곡동, 신내동, 신둔면, 신사동, 신영동, 신원동, 신월동, 신장동, 신천동, 신촌동, 신평동, 신현동, 신흥동, 쌍령동, 쌍문동, 아동동, 아천동, 안암동, 암사동, 야당동, 야동동, 야탑동, 양벌동, 양서면, 양지동, 양지읍, 양촌읍, 어둔동, 여수동, 역동, 역촌동, 연다산동, 염창동, 오곡동, 오금동, 오남읍, 오도동, 오류동, 오쇠동, 오정동, 와동동, 와부읍, 왕길동, 외발산동, 용답동, 용두동, 용종동, 용현동, 우이동, 운양동, 원당동, 원종동, 원흥동, 월계동, 월곶면, 월롱면, 유양동, 율동, 율현동, 은행동, 응암동, 의정부동, 이매동, 이문동, 이패동, 이화동, 인창동, 일산동, 일원동, 일패동, 임학동, 자곡동, 자양동, 자일동, 잠실동, 장기동, 장단면, 장안동, 장암동, 장위동, 장지동, 장항동, 장흥면, 전농동, 정릉동, 정발산동, 제기동, 조리읍, 조안면, 종암동, 주교동, 주엽동, 중계동, 중곡동, 중대동, 중산동, 중앙동, 중화동, 증산동, 지금동, 지영동, 지축동, 직동, 진건읍, 진관동, 진접읍, 창곡동, 창동, 창우동, 천현동, 천호동, 청량리동, 초월읍, 초이동, 초일동, 추자동, 춘궁동, 탄벌동, 탄현동, 탄현면, 태전동, 태평동, 토당동, 토평동, 통진읍, 퇴계원읍, 퇴촌면, 파주읍, 평내동, 평동, 평창동, 포곡읍, 풍납동, 풍동, 풍무동, 풍산동, 하계동, 하대원동, 하사창동, 하산곡동, 하성면, 하야동,
    ❌ [post /detail response / 408] {"error":"Server Force Timeout"}
    🚨 [EMERGENCY 응답] {"success":true,"message":"비상 보고 수신 완료. 서버 상태 초기화됨.","clearedOrderId":"49179be5-1a45-4c66-b462-69be035a6773"}
    🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용을 긁어서 POST /api/orders/detail 로 보내주세요."}
    ```

    </details>
- `🚦 [ROADMAP 22:22:38.754] [📱앱] [HTTP 폴링] 응답 /orders/confirm`
- `🚦 [ROADMAP 22:22:39.228] [📱앱] '취소' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:22:39.231] [📱앱] [POPUP_DROPOFF] '취소' 클릭 후 인성 Socket 취소 지시`
- `🚦 [ROADMAP 22:22:39.283] [📱앱] 버튼 터치 완료 (가로채기 성공) X:950.0, Y:478.0`
- `🚦 [ROADMAP 22:22:39.554] [📱앱] [LIST] 새로운 화면 진입 판별: LIST`
- `🚦 [ROADMAP 22:22:39.566] [📱앱] [LIST] AccessibilityService로 바뀐 리스트 감지 후 text 추출`
- `🚦 [ROADMAP 22:22:39.566] [📱앱] [LIST] 리스트에서 바뀐 text 감지 후 text 추출`
- `🚦 [ROADMAP 22:22:39.567] [📱앱] [LIST] [인성 Socket] 인성콜에 선택된 콜 정보 전달 (꿀콜 클릭!)`
- `🚦 [ROADMAP 22:22:39.619] [📱앱] 버튼 터치 완료 (가로채기 성공) X:917.0, Y:568.0`
- `🚦 [ROADMAP 22:22:39.771] [📱앱] [DETAIL_PRE_CONFIRM] 새로운 화면 진입 판별: DETAIL_PRE_CONFIRM`
- `🚦 [ROADMAP 22:22:39.777] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지 진입으로 바뀐 text중 '확정' 추출 후 클릭`
- `🚦 [ROADMAP 22:22:39.778] [📱앱] '확정' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:22:39.832] [📱앱] 버튼 터치 완료 (가로채기 성공) X:161.0, Y:2251.0`
- `🚦 [ROADMAP 22:22:39.972] [📱앱] [DETAIL_CONFIRMED] 새로운 화면 진입 판별: DETAIL_CONFIRMED`
- `🚦 [ROADMAP 22:22:39.973] [📱앱] [DETAIL_CONFIRMED] 확정페이지 진입`
- `🚦 [ROADMAP 22:22:39.973] [📱앱] '적요상세' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 22:22:39.989] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '적요상세' 추출 후 클릭`
- `🚦 [ROADMAP 22:22:40.030] [📱앱] 버튼 터치 완료 (가로채기 성공) X:149.0, Y:1153.0`
- `🚦 [ROADMAP 22:22:40.152] [📱앱] [POPUP_MEMO] 새로운 화면 진입 판별: POPUP_MEMO`
- `🚦 [ROADMAP 22:22:40.153] [📱앱] [POPUP_MEMO] 적요상세페이지에서 '젹요 내용' 추출 및 저장 후 닫기 클릭`
- `🚦 [ROADMAP 22:22:40.153] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
