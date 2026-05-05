# 🗺️ 1DAL 풀 스택 라이프사이클 로그 매핑 리포트 (0424_0428 Full Data)

---


### 🟢 [STEP 1] 관제탑 서버 기동 및 필터 동기화
*(시작 기준 시간: 20:28:42.895)*

- `[ROADMAP 20:28:42.895] [☁️서버] 관제탑 소켓 접속 완료 및 기사의 기본 필터 DB Lazy Load 연산`
- `[ROADMAP 20:28:42.895] [☁️서버] 관제탑에게 초기 UI 복원용 필터(filter-init) 정보 전달`
- `[ROADMAP 20:28:42.895] [☁️서버] 관제탑 요청으로 필터(filter-init) 정보 재전달`
- `[ROADMAP 20:28:50.904] [☁️서버] [FilterManager] 영구 설정(baseFilter) DB 저장 완료`
- `[ROADMAP 20:29:26.390] [☁️서버] 앱폰으로 부터 6자리 PIN 인증 요청 받음 및 deviceId 발급 연산`
- `[ROADMAP 20:29:26.391] [☁️서버] 승인된 디바이스 정보 DB 저장`
- `[ROADMAP 20:29:41.912] [☁️서버] [FilterManager] 영구 설정(baseFilter) DB 저장 완료`
- `[ROADMAP 20:29:41.928] [☁️서버] [FilterManager] 영구 설정(baseFilter) DB 저장 완료`
- `[ROADMAP 20:29:58.037] [🖥️관제웹] 유저가 구글 로그인 버튼 클릭`
- `[ROADMAP 20:29:58.038] [🖥️관제웹] 서버에게 구글 인증(id_token) 정보 전달`
- `[ROADMAP 20:29:58.067] [☁️서버] 관제탑으로 부터 구글 로그인 토큰 검증 요청 받음`
- `[ROADMAP 20:29:58.072] [☁️서버] email 바탕으로 접속 유저 정보 DB 조회/생성 연산`
- `[ROADMAP 20:29:58.148] [☁️서버] 관제탑에게 인증 JWT Token 발급 및 정보 전달`
- `[ROADMAP 20:29:58.189] [🖥️관제웹] 1DAL 웹(관제웹) 로그인됨`
- `[ROADMAP 20:29:58.191] [🖥️관제웹] 1DAL 웹(관제웹) 로그인됨`
- `[ROADMAP 20:29:58.205] [🖥️관제웹] 서버 소켓 연결/재연결됨 → 최신 필터 상태 요청`
- `[ROADMAP 20:29:59.052] [☁️서버] [Session DB Load] 유저 af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 복구된 원본 필터(Raw DB):`

    <details>
    <summary>🔽 {</summary>

    ```json
    {
      "user_id": "af0a8ec7-7130-4a7b-8343-15abc1c7f6b5",
      "destination_city": "파주",
      "destination_radius_km": 10,
      "corridor_radius_km": 5,
      "min_fare": 20000,
      "max_fare": 1000000,
      "pickup_radius_km": 10,
      "excluded_keywords": "[]",
      "is_active": 1,
      "is_shared_mode": 0,
      "load_state": "EMPTY",
      "driver_action": "WAITING",
      "vehicle_rates": "{\"오토바이\":700,\"다마스\":800,\"라보\":900,\"승용차\":900,\"1t\":1000,\"1.4t\":1100,\"2.5t\":1200,\"3.5t\":1300,\"5t\":1500,\"11t\":2000,\"25t\":2500,\"특수화물\":3000}",
      "agency_fee_percent": 23,
      "max_discount_percent": 10
    }
    ```

    </details>
- `[ROADMAP 20:29:59.053] [☁️서버] 관제탑 소켓 접속 완료 및 기사의 기본 필터 DB Lazy Load 연산`
- `[ROADMAP 20:29:59.053] [☁️서버] 관제탑에게 초기 UI 복원용 필터(filter-init) 정보 전달`
- `[ROADMAP 20:29:59.058] [☁️서버] 관제탑 요청으로 필터(filter-init) 정보 재전달`
- `[ROADMAP 20:29:59.068] [🖥️관제웹] 서버로 부터 filter-init 초기 필터값(isSharedMode, distance 등) 받음`
- `[ROADMAP 20:29:59.075] [🖥️관제웹] 서버로 부터 filter-init 초기 필터값(isSharedMode, distance 등) 받음`
- `[ROADMAP 20:30:52.857] [🖥️관제웹] 설정 모달창 열고 새 필터값 입력 후 '저장' 버튼 클릭`
- `[ROADMAP 20:30:52.859] [🖥️관제웹] 서버에게 새로 작성한 update-filter 정보 전달`
- `[ROADMAP 20:30:52.862] [☁️서버] 관제탑으로 부터 필터 변경(update-filter) 요청 받음. 수신 데이터: {"allowedVehicleTypes":["오토바이","다마스","라보","승용차","1t"],"minFare":20000,"pickupRadiusKm":10,"destinationCity":"파주","destinationRadiusKm":5,"corridorRadiusKm":5,"excludedKeywords":[],"userOverrides":true}`
- `[ROADMAP 20:30:53.861] [☁️서버] 관제탑에게 변경 적용된 필터(filter-updated) 정보 전달 (메모리만, DB 저장 안함)`
- `[ROADMAP 20:30:53.861] [☁️서버] [FilterManager] 필터 변경 발생! (실시간 변경(activeFilter))`

    <details>
    <summary>🔽 {</summary>

    ```json
    {
      "destinationCity": "파주",
      "destinationRadiusKm": 5,
      "corridorRadiusKm": 5,
      "minFare": 20000,
      "maxFare": 1000000,
      "pickupRadiusKm": 10,
      "excludedKeywords": [],
      "isActive": true,
      "isSharedMode": false,
      "driverAction": "WAITING",
      "dispatchPhase": "STANDBY",
      "destinationKeywords": ["가좌동","걸포동","검산동","고양동","관산동","광적면","광탄면","교하동","구산동","군남면","군내면","금릉동","금촌동","남면","내유동","다율동","당하동","대자동","대화동","덕이동","동패동","마두동","맥금동","목동동","문발동","문봉동","문산읍","미산면","백석읍","백학면","법곳동","법원읍","벽제동","사리현동","산남동","상봉암동","상지석동","상패동","서패동","선유동","설문동","성석동","송촌동","식사동","신원동","신촌동","아동동","안흥동","야당동","야동동","양촌읍","연다산동","오도동","와동동","왕징면","운양동","원당동","월롱면","은현면","일산동","장기동","장남면","장단면","장항동","장흥면","적성면","전곡읍","정발산동","조리읍","주엽동","중산동","지영동","진동면","진서면","청산면","탄현동","탄현면","통진읍","파주읍","파평면","풍동","하봉암동","하성면","하지석동"],
      "destinationGroups": {"동두천시":["상봉암동","상패동","안흥동","하봉암동"],"고양시 덕양구":["고양동","관산동","내유동","대자동","벽제동","선유동","신원동","원당동"],"고양시 일산동구":["마두동","문봉동","사리현동","설문동","성석동","식사동","장항동","정발산동","중산동","지영동","풍동"],"고양시 일산서구":["가좌동","구산동","대화동","덕이동","법곳동","일산동","주엽동","탄현동"],"파주시":["검산동","광탄면","교하동","군내면","금릉동","금촌동","다율동","당하동","동패동","맥금동","목동동","문발동","문산읍","법원읍","산남동","상지석동","서패동","송촌동","신촌동","아동동","야당동","야동동","연다산동","오도동","와동동","월롱면","장단면","적성면","조리읍","진동면","진서면","탄현면","파주읍","파평면","하지석동"],"김포시":["걸포동","양촌읍","운양동","장기동","통진읍","하성면"],"양주시":["광적면","남면","백석읍","은현면","장흥면"],"연천군":["군남면","미산면","백학면","왕징면","장남면","전곡읍","청산면"]},
      "allowedVehicleTypes": ["오토바이","다마스","라보","승용차","1t"],
      "userOverrides": true,
    }
    ```

    </details>
- `[ROADMAP 20:30:53.864] [🖥️관제웹] 서버로 부터 filter-updated 소켓 이벤트 받음`
- `🚦 [ROADMAP 20:32:16.116] [📱앱] [STARTUP] 🟢 1DAL 서비스 가동 완료 (접근성 권한 승인, Telemetry·GPS 엔진 가동)`

    <details>
    <summary>🔽 🎯 [인성콜] 키워드 사전 다운로드 성공: {"appName":"인성콜","uiNoiseWords":["출발지","도착지","차종","요금",...</summary>

    ```json
    🎯 [인성콜] 키워드 사전 다운로드 성공: {"appName":"인성콜","uiNoiseWords":["출발지","도착지","차종","요금","설정","닫기","콜상세"],"confirmButtonText":"확정","cancelButtonText":"취소","pickupButtonText":"출발지","dropoffButtonText":"도착지"}
    ```

    </details>

### 🟢 [STEP 2] 첫짐 1차 선점 (단독콜 사냥)
*(시작 기준 시간: 20:32:16.322)*

- `🚦 [ROADMAP 20:32:16.322] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 2026-05-05 20:32:16.323 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:32:16.323 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=LIST, holding=false, 콜=0건
    ```

    </details>
- `🚦 [ROADMAP 20:32:16.338] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isShar...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isSharedMode=false, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 20:32:17.122] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 0항목 적재 중 [화면: LIST]`
- `🚦 [ROADMAP 20:32:42.477] [📱앱] [UNKNOWN] 📡 화면 변경 감지 | 화면: UNKNOWN | 모드: AUTO`
- `🚦 [ROADMAP 20:32:42.691] [📱앱] [UNKNOWN] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 2026-05-05 20:32:42.692 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:32:42.692 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=UNKNOWN, holding=false, 콜=0건
    ```

    </details>
- `🚦 [ROADMAP 20:32:42.726] [📱앱] [UNKNOWN] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isShar...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isSharedMode=false, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `🚦 [ROADMAP 20:32:43.138] [📱앱] [UNKNOWN] 📡 화면 변경 감지 | 화면: UNKNOWN | 모드: AUTO`
- `🚦 [ROADMAP 20:32:43.255] [📱앱] [UNKNOWN] 📡 화면 변경 감지 | 화면: UNKNOWN | 모드: AUTO`
- `[ROADMAP 20:32:43.490] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 0항목 적재 중 [화면: UNKNOWN]`
- `🚦 [ROADMAP 20:32:45.333] [📱앱] [UNKNOWN] 📡 화면 변경 감지 | 화면: UNKNOWN | 모드: AUTO`
- `🚦 [ROADMAP 20:32:45.424] [📱앱] [LIST] 📡 화면 변경 감지 | 화면: LIST | 모드: AUTO`
- `🚦 [ROADMAP 20:32:45.425] [📱앱] [SESSION] 🔄 세션 및 사냥 상태 완전 초기화 (새로운 타겟 대기)`
- `🚦 [ROADMAP 20:32:45.462] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(오)=✅ 도착지(84중 마포구)=❌ 요금(20000 <= 49000)=✅ 상차지/거리(10km >= 8.5km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 20:32:45.463] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(라)=✅ 도착지(84중 은평구)=❌ 요금(20000 <= 68000)=✅ 상차지/거리(10km >= 3.8km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 20:32:45.465] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(다)=✅ 도착지(84중 중구)=❌ 요금(20000 <= 96000)=✅ 상차지/거리(10km >= 1.9km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 20:32:45.466] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(라)=✅ 도착지(84중 광진구)=❌ 요금(20000 <= 41000)=✅ 상차지/거리(10km >= 1.9km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 20:32:45.467] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(라)=✅ 도착지(84중 용산구)=❌ 요금(20000 <= 65000)=✅ 상차지/거리(10km >= 5.1km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 20:32:45.771] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 5)`

    <details>
    <summary>🔽 2026-05-05 20:32:45.772 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:32:45.772 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=LIST, holding=false, 콜=5건
    ```

    </details>
- `🚦 [ROADMAP 20:32:45.787] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 5)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isShar...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isSharedMode=false, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 20:32:46.572] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 5항목 적재 중 [화면: LIST]`
- `🚦 [ROADMAP 20:32:50.925] [📱앱] [LIST] 📡 화면 변경 감지 | 화면: LIST | 모드: AUTO`
- `🚦 [ROADMAP 20:32:50.926] [📱앱] [SESSION] 🔄 세션 및 사냥 상태 완전 초기화 (새로운 타겟 대기)`
- `🚦 [ROADMAP 20:32:50.929] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(오)=✅ 도착지(84중 강동구)=❌ 요금(20000 <= 39000)=✅ 상차지/거리(10km >= 0.2km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 20:32:51.231] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 2026-05-05 20:32:51.232 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:32:51.232 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=LIST, holding=false, 콜=1건
    ```

    </details>
- `🚦 [ROADMAP 20:32:51.245] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isShar...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isSharedMode=false, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 20:32:52.030] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 1항목 적재 중 [화면: LIST]`
- `🚦 [ROADMAP 20:32:55.932] [📱앱] [LIST] 📡 화면 변경 감지 | 화면: LIST | 모드: AUTO`
- `🚦 [ROADMAP 20:32:55.933] [📱앱] [SESSION] 🔄 세션 및 사냥 상태 완전 초기화 (새로운 타겟 대기)`
- `🚦 [ROADMAP 20:32:55.938] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(1t)=✅ 도착지(84중 영등포구)=❌ 요금(20000 <= 53000)=✅ 상차지/거리(10km >= 4.4km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 20:32:56.246] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 2026-05-05 20:32:56.247 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:32:56.247 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=LIST, holding=false, 콜=1건
    ```

    </details>
- `🚦 [ROADMAP 20:32:56.259] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isShar...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isSharedMode=false, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 20:32:57.043] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 1항목 적재 중 [화면: LIST]`
- `🚦 [ROADMAP 20:33:00.928] [📱앱] [LIST] 📡 화면 변경 감지 | 화면: LIST | 모드: AUTO`
- `🚦 [ROADMAP 20:33:00.929] [📱앱] [SESSION] 🔄 세션 및 사냥 상태 완전 초기화 (새로운 타겟 대기)`
- `🚦 [ROADMAP 20:33:00.934] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(라)=✅ 도착지(84중 미추홀구)=❌ 요금(20000 <= 84000)=✅ 상차지/거리(10km >= 4.4km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 20:33:01.238] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 2026-05-05 20:33:01.239 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:33:01.239 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=LIST, holding=false, 콜=1건
    ```

    </details>
- `🚦 [ROADMAP 20:33:01.251] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isShar...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isSharedMode=false, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 20:33:02.037] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 1항목 적재 중 [화면: LIST]`
- `🚦 [ROADMAP 20:33:05.926] [📱앱] [LIST] 📡 화면 변경 감지 | 화면: LIST | 모드: AUTO`
- `🚦 [ROADMAP 20:33:05.926] [📱앱] [SESSION] 🔄 세션 및 사냥 상태 완전 초기화 (새로운 타겟 대기)`
- `🚦 [ROADMAP 20:33:05.929] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(1t)=✅ 도착지(84중 만안구)=❌ 요금(20000 <= 52000)=✅ 상차지/거리(10km >= 0.2km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 20:33:06.237] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 2026-05-05 20:33:06.238 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:33:06.238 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=LIST, holding=false, 콜=1건
    ```

    </details>
- `🚦 [ROADMAP 20:33:06.250] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isShar...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isSharedMode=false, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 20:33:07.034] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 1항목 적재 중 [화면: LIST]`
- `🚦 [ROADMAP 20:33:10.944] [📱앱] [LIST] 📡 화면 변경 감지 | 화면: LIST | 모드: AUTO`
- `🚦 [ROADMAP 20:33:10.944] [📱앱] [SESSION] 🔄 세션 및 사냥 상태 완전 초기화 (새로운 타겟 대기)`
- `🚦 [ROADMAP 20:33:10.947] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(1t)=✅ 도착지(84중 서초구)=❌ 요금(20000 <= 48000)=✅ 상차지/거리(10km >= 0.2km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 20:33:11.250] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 2026-05-05 20:33:11.250 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:33:11.250 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=LIST, holding=false, 콜=1건
    ```

    </details>
- `🚦 [ROADMAP 20:33:11.257] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isShar...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isSharedMode=false, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 20:33:12.043] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 1항목 적재 중 [화면: LIST]`
- `🚦 [ROADMAP 20:33:15.931] [📱앱] [LIST] 📡 화면 변경 감지 | 화면: LIST | 모드: AUTO`
- `🚦 [ROADMAP 20:33:15.932] [📱앱] [SESSION] 🔄 세션 및 사냥 상태 완전 초기화 (새로운 타겟 대기)`
- `🚦 [ROADMAP 20:33:15.935] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(1t)=✅ 도착지(84중 인창동)=❌ 요금(20000 <= 49000)=✅ 상차지/거리(10km >= 1.9km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 20:33:16.238] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 2026-05-05 20:33:16.238 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:33:16.238 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=LIST, holding=false, 콜=1건
    ```

    </details>
- `🚦 [ROADMAP 20:33:16.250] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isShar...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isSharedMode=false, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 20:33:17.035] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 1항목 적재 중 [화면: LIST]`
- `🚦 [ROADMAP 20:33:20.940] [📱앱] [LIST] 📡 화면 변경 감지 | 화면: LIST | 모드: AUTO`
- `🚦 [ROADMAP 20:33:20.941] [📱앱] [SESSION] 🔄 세션 및 사냥 상태 완전 초기화 (새로운 타겟 대기)`
- `🚦 [ROADMAP 20:33:20.945] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(1t)=✅ 도착지(84중 중앙동)=❌ 요금(20000 <= 46000)=✅ 상차지/거리(10km >= 5.0km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 20:33:21.247] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 2026-05-05 20:33:21.247 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:33:21.247 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=LIST, holding=false, 콜=1건
    ```

    </details>
- `🚦 [ROADMAP 20:33:21.255] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isShar...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isSharedMode=false, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 20:33:22.041] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 1항목 적재 중 [화면: LIST]`
- `🚦 [ROADMAP 20:33:25.931] [📱앱] [LIST] 📡 화면 변경 감지 | 화면: LIST | 모드: AUTO`
- `🚦 [ROADMAP 20:33:25.932] [📱앱] [SESSION] 🔄 세션 및 사냥 상태 완전 초기화 (새로운 타겟 대기)`
- `🚦 [ROADMAP 20:33:25.936] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(다)=✅ 도착지(84중 동구)=❌ 요금(20000 <= 94000)=✅ 상차지/거리(10km >= 0.2km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 20:33:26.243] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 2026-05-05 20:33:26.243 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:33:26.243 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=LIST, holding=false, 콜=1건
    ```

    </details>
- `🚦 [ROADMAP 20:33:26.253] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isShar...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isSharedMode=false, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 20:33:27.038] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 1항목 적재 중 [화면: LIST]`
- `🚦 [ROADMAP 20:33:30.948] [📱앱] [LIST] 📡 화면 변경 감지 | 화면: LIST | 모드: AUTO`
- `🚦 [ROADMAP 20:33:30.948] [📱앱] [SESSION] 🔄 세션 및 사냥 상태 완전 초기화 (새로운 타겟 대기)`
- `🚦 [ROADMAP 20:33:30.951] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(1t)=✅ 도착지(84중 산본동)=❌ 요금(20000 <= 55000)=✅ 상차지/거리(10km >= 0.2km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 20:33:31.253] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 2026-05-05 20:33:31.253 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:33:31.253 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=LIST, holding=false, 콜=1건
    ```

    </details>
- `🚦 [ROADMAP 20:33:31.262] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isShar...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isSharedMode=false, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 20:33:32.048] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 1항목 적재 중 [화면: LIST]`
- `🚦 [ROADMAP 20:33:35.942] [📱앱] [LIST] 📡 화면 변경 감지 | 화면: LIST | 모드: AUTO`
- `🚦 [ROADMAP 20:33:35.943] [📱앱] [SESSION] 🔄 세션 및 사냥 상태 완전 초기화 (새로운 타겟 대기)`
- `🚦 [ROADMAP 20:33:35.946] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(다)=✅ 도착지(84중 영등포구)=❌ 요금(20000 <= 60000)=✅ 상차지/거리(10km >= 1.9km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 20:33:36.248] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 2026-05-05 20:33:36.248 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:33:36.248 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=LIST, holding=false, 콜=1건
    ```

    </details>
- `🚦 [ROADMAP 20:33:36.256] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isShar...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isSharedMode=false, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 20:33:37.042] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 1항목 적재 중 [화면: LIST]`
- `🚦 [ROADMAP 20:33:40.938] [📱앱] [LIST] 📡 화면 변경 감지 | 화면: LIST | 모드: AUTO`
- `🚦 [ROADMAP 20:33:40.939] [📱앱] [SESSION] 🔄 세션 및 사냥 상태 완전 초기화 (새로운 타겟 대기)`
- `🚦 [ROADMAP 20:33:40.942] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(오)=✅ 도착지(84중 고촌읍)=❌ 요금(20000 <= 73000)=✅ 상차지/거리(10km >= 8.5km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 20:33:41.244] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 2026-05-05 20:33:41.244 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:33:41.244 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=LIST, holding=false, 콜=1건
    ```

    </details>
- `🚦 [ROADMAP 20:33:41.252] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isShar...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isSharedMode=false, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 20:33:42.039] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 1항목 적재 중 [화면: LIST]`
- `🚦 [ROADMAP 20:33:45.940] [📱앱] [LIST] 📡 화면 변경 감지 | 화면: LIST | 모드: AUTO`
- `🚦 [ROADMAP 20:33:45.940] [📱앱] [SESSION] 🔄 세션 및 사냥 상태 완전 초기화 (새로운 타겟 대기)`
- `🚦 [ROADMAP 20:33:45.944] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(오)=✅ 도착지(84중 경안동)=❌ 요금(20000 <= 30000)=✅ 상차지/거리(10km >= 5.1km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 20:33:46.246] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 2026-05-05 20:33:46.246 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:33:46.246 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=LIST, holding=false, 콜=1건
    ```

    </details>
- `🚦 [ROADMAP 20:33:46.252] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isShar...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isSharedMode=false, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 20:33:47.040] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 1항목 적재 중 [화면: LIST]`
- `🚦 [ROADMAP 20:33:50.954] [📱앱] [LIST] 📡 화면 변경 감지 | 화면: LIST | 모드: AUTO`
- `🚦 [ROADMAP 20:33:50.954] [📱앱] [SESSION] 🔄 세션 및 사냥 상태 완전 초기화 (새로운 타겟 대기)`
- `🚦 [ROADMAP 20:33:50.959] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(1t)=✅ 도착지(84중 광진구)=❌ 요금(20000 <= 40000)=✅ 상차지/거리(10km >= 0.2km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 20:33:51.263] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 2026-05-05 20:33:51.263 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:33:51.263 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=LIST, holding=false, 콜=1건
    ```

    </details>
- `🚦 [ROADMAP 20:33:51.285] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isShar...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isSharedMode=false, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 20:33:52.068] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 1항목 적재 중 [화면: LIST]`
- `🚦 [ROADMAP 20:33:55.958] [📱앱] [LIST] 📡 화면 변경 감지 | 화면: LIST | 모드: AUTO`
- `🚦 [ROADMAP 20:33:55.959] [📱앱] [SESSION] 🔄 세션 및 사냥 상태 완전 초기화 (새로운 타겟 대기)`
- `🚦 [ROADMAP 20:33:55.964] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(다)=✅ 도착지(84중 월롱면)=✅ 요금(20000 <= 103000)=✅ 상차지/거리(10km >= 0.2km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 20:33:55.964] [📱앱] [LIST] 🎯 [Current Page: LIST] 1차 필터 통과 → AUTO 타겟 발견, 강제 터치 진행`
- `🚦 [ROADMAP 20:33:55.965] [📱앱] [LIST] 리스트에서 바뀐 text 감지 후 text 추출`
- `🚦 [ROADMAP 20:33:55.985] [📱앱] [LIST] [인성 Socket] 인성콜에 선택된 콜 정보 전달 (꿀콜 클릭!)`
- `🚦 [ROADMAP 20:33:56.042] [📱앱] 버튼 터치 완료 (가로채기 성공) X:917.0, Y:568.0`
- `🚦 [ROADMAP 20:33:56.160] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 2026-05-05 20:33:56.161 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:33:56.161 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=LIST, holding=false, 콜=0건
    ```

    </details>
- `🚦 [ROADMAP 20:33:56.168] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isShar...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isSharedMode=false, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `🚦 [ROADMAP 20:33:56.288] [📱앱] [DETAIL_PRE_CONFIRM] 📡 화면 변경 감지 | 화면: DETAIL_PRE_CONFIRM | 모드: AUTO`
- `🚦 [ROADMAP 20:33:56.289] [📱앱] [DETAIL_PRE_CONFIRM] [Current Page: DETAIL_PRE_CONFIRM] 진입 완료`
- `🚦 [ROADMAP 20:33:56.293] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지 텍스트 추출 및 2차 필터(적요 등) 통과 확인`
- `🚦 [ROADMAP 20:33:56.294] [📱앱] [DETAIL] 🔍 [타겟 콜 필터 결과] 차종(다)=✅ 도착지(84중 월롱면)=✅ 요금(20000 <= 103000)=✅ 상차지/거리(10km >= 0.2km)=✅ 블랙()=✅`

### 🟡 [STEP 3] 1차 확정 통신
*(시작 기준 시간: 20:33:56.295)*

- `🚦 [ROADMAP 20:33:56.295] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지에서 '확정' 추출 후 클릭`
- `🚦 [ROADMAP 20:33:56.295] [📱앱] [DETAIL_PRE_CONFIRM] [인성 Socket] 콜 확정 완료`
- `🚦 [ROADMAP 20:33:56.299] [📱앱] '확정' 버튼 인식 ➡️ 클릭 시도`

    <details>
    <summary>🔽 🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용...</summary>

    ```json
    🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용을 긁어서 POST /api/orders/detail 로 보내주세요."}
    ```

    </details>
- `🚦 [ROADMAP 20:33:56.304] [📱앱] [HTTP 폴링] 응답 /orders/confirm`
- `🚦 [ROADMAP 20:33:56.357] [📱앱] 버튼 터치 완료 (가로채기 성공) X:161.0, Y:2251.0`

### 🟢 [STEP 2] 첫짐 1차 선점 (단독콜 사냥)
*(시작 기준 시간: 20:33:56.516)*

- `🚦 [ROADMAP 20:33:56.516] [📱앱] [DETAIL_PRE_CONFIRM] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 2026-05-05 20:33:56.524 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:33:56.524 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=DETAIL_PRE_CONFIRM, holding=true, 콜=0건
    ```

    </details>
- `🚦 [ROADMAP 20:33:56.572] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 화면: DETAIL_CONFIRMED | 모드: AUTO`
- `🚦 [ROADMAP 20:33:56.572] [📱앱] [DETAIL_CONFIRMED] 🔒 [Current Page: DETAIL_CONFIRMED] 진입, isHolding=true 설정`
- `🚦 [ROADMAP 20:33:56.572] [📱앱] [DETAIL_CONFIRMED] 🏄‍♂️ 무인 서핑 가동 (State Machine: IDLE → 팝업버튼 트리거 대기)`
- `🚦 [ROADMAP 20:33:56.574] [📱앱] '적요상세' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 20:33:56.576] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '적요상세' 추출 후 클릭`
- `🚦 [ROADMAP 20:33:56.627] [📱앱] 버튼 터치 완료 (가로채기 성공) X:149.0, Y:1153.0`
- `🚦 [ROADMAP 20:33:56.750] [📱앱] [POPUP_MEMO] 📡 화면 변경 감지 | 화면: POPUP_MEMO | 모드: AUTO`
- `🚦 [ROADMAP 20:33:56.751] [📱앱] [POPUP_MEMO] [Current Page: POPUP_MEMO] 진입 완료 ("적요 내용" 텍스트 매칭 확인)`
- `🚦 [ROADMAP 20:33:56.751] [📱앱] [POPUP_MEMO] 적요상세 데이터 추출 및 메모리에 누적 저장`
- `🚦 [ROADMAP 20:33:56.752] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 20:33:56.811] [📱앱] 버튼 터치 완료 (가로채기 성공) X:540.0, Y:2264.0`
- `🚦 [ROADMAP 20:33:56.869] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 화면: DETAIL_CONFIRMED | 모드: AUTO`
- `🚦 [ROADMAP 20:33:56.870] [📱앱] [DETAIL_CONFIRMED] [Current Page: DETAIL_CONFIRMED] 확정페이지 복귀 확인 (잔상 회피 완료)`
- `🚦 [ROADMAP 20:33:56.870] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '출발지' 추출 후 클릭`
- `🚦 [ROADMAP 20:33:56.871] [📱앱] '출발지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 20:33:56.924] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1592.0`
- `[ROADMAP 20:33:56.956] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 0항목 적재 중 [화면: LIST]`
- `🚦 [ROADMAP 20:33:57.047] [📱앱] [POPUP_PICKUP] 📡 화면 변경 감지 | 화면: POPUP_PICKUP | 모드: AUTO`
- `🚦 [ROADMAP 20:33:57.048] [📱앱] [POPUP_PICKUP] [Current Page: POPUP_PICKUP] 진입 완료 ("전화1" 텍스트 매칭 확인)`
- `🚦 [ROADMAP 20:33:57.048] [📱앱] [POPUP_PICKUP] 출발지 데이터 추출 및 메모리에 누적 저장`
- `🚦 [ROADMAP 20:33:57.048] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `[ROADMAP 20:33:57.092] [☁️서버] 앱폰에게 상세 정보 스크래핑을 즉시 진행하라고 응답 전달`
- `[ROADMAP 20:33:57.092] [☁️서버] 콜의 가확정 상태를 메모리에 캐싱 연산`
- `[ROADMAP 20:33:57.093] [☁️서버] 앱폰으로 부터 가로챈 '1차 오더 확정' 요청 받음`
- `[ROADMAP 20:33:57.093] [☁️서버] 관제탑에게 이 콜을 선점했음(order-evaluating) 정보 전달`
- `[ROADMAP 20:33:57.093] [🖥️관제웹] [관제대시보드] 🟢 [웹 수신] order-evaluating | ID: 3b5ea20d-7f39-4ee6-bad7-22b7a6fe1d30 | 기기: 앱폰-sdk_gpho-160 | 월롱면`
- `[ROADMAP 20:33:57.094] [🖥️관제웹] [관제대시보드] 확정페이지 진입 (선빵 수신으로 상세 모드 구동)`
- `[ROADMAP 20:33:57.094] [🖥️관제웹] [관제대시보드] PinnedRoute 컴포넌트에 빈 레이아웃(평가중) 렌더링 및 하단 결재버튼 전체 딤드(비활성) 처리`
- `🚦 [ROADMAP 20:33:57.101] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`
- `🚦 [ROADMAP 20:33:57.224] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 화면: DETAIL_CONFIRMED | 모드: AUTO`
- `🚦 [ROADMAP 20:33:57.224] [📱앱] [DETAIL_CONFIRMED] [Current Page: DETAIL_CONFIRMED] 확정페이지 복귀 확인 (잔상 회피 완료)`
- `🚦 [ROADMAP 20:33:57.224] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '도착지' 추출 후 클릭`
- `🚦 [ROADMAP 20:33:57.224] [📱앱] '도착지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 20:33:57.278] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1742.0`
- `🚦 [ROADMAP 20:33:57.430] [📱앱] [POPUP_DROPOFF] 📡 화면 변경 감지 | 화면: POPUP_DROPOFF | 모드: AUTO`
- `🚦 [ROADMAP 20:33:57.431] [📱앱] [POPUP_DROPOFF] [Current Page: POPUP_DROPOFF] 진입 완료 ("전화1" 텍스트 매칭 확인)`
- `🚦 [ROADMAP 20:33:57.431] [📱앱] [POPUP_DROPOFF] 도착지 데이터 추출 및 메모리에 누적 저장`
- `🚦 [ROADMAP 20:33:57.431] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 20:33:57.432] [📱앱] [DETAIL_CONFIRMED] [Current Page: DETAIL_CONFIRMED] 무인 서핑 종료 (State Machine: DONE)`
- `🚦 [ROADMAP 20:33:57.436] [📱앱] [DEATHVALLEY] ⏳ 데스밸리 타이머 가동 (30초 대기 → 서버 판결 대기 시작)`
- `🚦 [ROADMAP 20:33:57.485] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`
- `🚦 [ROADMAP 20:33:57.581] [📱앱] [DETAIL_PRE_CONFIRM] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSha...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSharedMode=false, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `🚦 [ROADMAP 20:33:57.829] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 2026-05-05 20:33:57.829 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:33:57.829 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=DETAIL_CONFIRMED, holding=true, 콜=0건
    ```

    </details>
- `🚦 [ROADMAP 20:33:57.834] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSha...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSharedMode=false, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 20:33:58.366] [☁️서버] [FilterManager] 필터 변경 발생! (실시간 변경(activeFilter))`

    <details>
    <summary>🔽 {</summary>

    ```json
    {
      "destinationCity": "파주",
      "destinationRadiusKm": 5,
      "corridorRadiusKm": 5,
      "minFare": 20000,
      "maxFare": 1000000,
      "pickupRadiusKm": 10,
      "excludedKeywords": [],
      "isActive": false,
      "isSharedMode": false,
      "driverAction": "WAITING",
      "dispatchPhase": "STANDBY",
      "destinationKeywords": ["가좌동","걸포동","검산동","고양동","관산동","광적면","광탄면","교하동","구산동","군남면","군내면","금릉동","금촌동","남면","내유동","다율동","당하동","대자동","대화동","덕이동","동패동","마두동","맥금동","목동동","문발동","문봉동","문산읍","미산면","백석읍","백학면","법곳동","법원읍","벽제동","사리현동","산남동","상봉암동","상지석동","상패동","서패동","선유동","설문동","성석동","송촌동","식사동","신원동","신촌동","아동동","안흥동","야당동","야동동","양촌읍","연다산동","오도동","와동동","왕징면","운양동","원당동","월롱면","은현면","일산동","장기동","장남면","장단면","장항동","장흥면","적성면","전곡읍","정발산동","조리읍","주엽동","중산동","지영동","진동면","진서면","청산면","탄현동","탄현면","통진읍","파주읍","파평면","풍동","하봉암동","하성면","하지석동"],
      "destinationGroups": {"동두천시":["상봉암동","상패동","안흥동","하봉암동"],"고양시 덕양구":["고양동","관산동","내유동","대자동","벽제동","선유동","신원동","원당동"],"고양시 일산동구":["마두동","문봉동","사리현동","설문동","성석동","식사동","장항동","정발산동","중산동","지영동","풍동"],"고양시 일산서구":["가좌동","구산동","대화동","덕이동","법곳동","일산동","주엽동","탄현동"],"파주시":["검산동","광탄면","교하동","군내면","금릉동","금촌동","다율동","당하동","동패동","맥금동","목동동","문발동","문산읍","법원읍","산남동","상지석동","서패동","송촌동","신촌동","아동동","야당동","야동동","연다산동","오도동","와동동","월롱면","장단면","적성면","조리읍","진동면","진서면","탄현면","파주읍","파평면","하지석동"],"김포시":["걸포동","양촌읍","운양동","장기동","통진읍","하성면"],"양주시":["광적면","남면","백석읍","은현면","장흥면"],"연천군":["군남면","미산면","백학면","왕징면","장남면","전곡읍","청산면"]},
      "allowedVehicleTypes": ["오토바이","다마스","라보","승용차","1t"],
      "userOverrides": true,
    }
    ```

    </details>
- `[ROADMAP 20:33:58.367] [☁️서버] 폰의 isHolding=true 기간 동안 다른 콜을 물지 않도록 필터 비활성 정보 전달`
- `[ROADMAP 20:33:58.367] [☁️서버] 데스밸리 15초 카운트다운 타이머 감시 연산`
- `[ROADMAP 20:33:58.368] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 0항목 적재 중 [화면: DETAIL_PRE_CONFIRM]`
- `[ROADMAP 20:33:58.368] [🖥️관제웹] 서버로 부터 filter-updated 소켓 이벤트 받음`
- `[ROADMAP 20:33:58.369] [🖥️관제웹] 서버로 부터 filter-updated 소켓 이벤트 받음`
- `[ROADMAP 20:33:58.370] [☁️서버] 앱폰으로 부터 무인서핑이 완료된 '2차 오더 상세' 요청 받음`
- `[ROADMAP 20:33:58.370] [☁️서버] 상하차지 주소 및 적요 텍스트 정제 연산`
- `[ROADMAP 20:33:58.375] [☁️서버] 관제탑에게 정제된 상세 텍스트(order-detail-received) 정보 전달`
- `[ROADMAP 20:33:58.375] [☁️서버] 앱폰에게 디테일 데이터 정상 수신 완료 응답 전달`

### 🟢 [STEP 5] 카카오 연산 3중 폴백 & 자동 회랑 전개
*(시작 기준 시간: 20:33:58.377)*

- `[ROADMAP 20:33:58.377] [☁️서버] 🛡️ 주소 3중 폴백 (괄호제거 ➡️ 주소검색 ➡️ 키워드 ➡️ 절사) 연산`

    <details>
    <summary>🔽 🌍 [Geocoding] 상차지 변환: '경기 광주시 경안동 493-4 이마트 광주점' -&gt; X:127.25821326019589, Y:37....</summary>

    ```json
    🌍 [Geocoding] 상차지 변환: '경기 광주시 경안동 493-4 이마트 광주점' -> X:127.25821326019589, Y:37.41039049717272
    ```

    </details>
- `[ROADMAP 20:33:58.396] [🖥️관제웹] [관제대시보드] 🟡 [웹 수신] order-detail-received | ID: 3b5ea20d | 경기 광주시 경안동 493-4 이마트`
- `[ROADMAP 20:33:58.396] [🖥️관제웹] [관제대시보드] PinnedRoute 컴포넌트에 '상하차지 및 적요' 텍스트를 선출력하여 렌더링`
- `[ROADMAP 20:33:58.622] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 0항목 적재 중 [화면: DETAIL_CONFIRMED]`
- `🚦 [ROADMAP 20:33:58.833] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap request] ⏱️ 타이머 생존신고 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 2026-05-05 20:33:58.834 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:33:58.834 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=DETAIL_CONFIRMED, holding=true, 콜=0건
    ```

    </details>
- `🚦 [ROADMAP 20:33:58.841] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSha...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSharedMode=false, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 20:33:59.281] [☁️서버] 경로 폴리라인 및 최종 수익성(콜/꿀/똥) 라벨링 연산`
- `[ROADMAP 20:33:59.302] [☁️서버] 관제탑에게 최종 판독된 오더 정보(order-evaluated) 전달`
- `[ROADMAP 20:33:59.304] [🖥️관제웹] [관제대시보드] 🔵 [웹 수신] order-evaluated | ID: 3b5ea20d | 추천거리 87km, 소요 71분`
- `[ROADMAP 20:33:59.305] [🖥️관제웹] [관제대시보드] 추천 결과 노출, 경로보기버튼 추가 노출 후 판단 (취소 or 닫기) 대기`
- `[ROADMAP 20:33:59.305] [🖥️관제웹] [관제대시보드] PinnedRoute 내 캔버스 미니맵 좌표 포커싱 및 카카오 궤적(폴리라인) 드로잉 처리`
- `[ROADMAP 20:33:59.305] [🖥️관제웹] [관제대시보드] 예상 시간/수익률을 컴포넌트에 표시하고 결재버튼(KEEP/CANCEL) 즉시 딤드 해제(활성화)`
- `[ROADMAP 20:33:59.628] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 0항목 적재 중 [화면: DETAIL_CONFIRMED]`
- `🚦 [ROADMAP 20:33:59.838] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap request] ⏱️ 타이머 생존신고 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 2026-05-05 20:33:59.838 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:33:59.838 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=DETAIL_CONFIRMED, holding=true, 콜=0건
    ```

    </details>
- `🚦 [ROADMAP 20:33:59.847] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSha...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSharedMode=false, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 20:34:00.633] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 0항목 적재 중 [화면: DETAIL_CONFIRMED]`
- `🚦 [ROADMAP 20:34:00.847] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap request] ⏱️ 타이머 생존신고 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 2026-05-05 20:34:00.849 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:34:00.849 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=DETAIL_CONFIRMED, holding=true, 콜=0건
    ```

    </details>
- `🚦 [ROADMAP 20:34:01.203] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    FilterConfig(allowedVehicleTypes=[오토바이, 다마스], isActive=true, isSharedMode=true, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가능동, 갈매동, 갈현동, 감북동, 감이동, 감일동, 강일동, 검산동, 경안동, 고덕동, 고산동, 고양동, 공릉동, 관산동, 광암동, 광장동, 광탄면, 교문동, 교산동, 교하동, 금곡동, 금릉동, 금오동, 금촌동, 길동, 남종면, 남한산성면, 내곡동, 내유동, 녹양동, 다산동, 다율동, 당정동, 당하동, 대자동, 대장동, 대화동, 덕이동, 덕풍동, 도내동, 도농동, 도봉동, 동산동, 동패동, 둔촌동, 마두동, 마천동, 망우동, 망월동, 매산동, 맥금동, 면목동, 명일동, 목동, 목동동, 목현동, 묵동, 문봉동, 문산읍, 미사동, 방이동, 방학동, 배알미동, 백석동, 백석읍, 벽제동, 별내동, 별내면, 북한동, 사노동, 사리현동, 산곡동, 산황동, 삼동, 삼송동, 삼패동, 상계동, 상봉동, 상사창동, 상산곡동, 상일동, 상지석동, 선동, 선유동, 설문동, 성내동, 성사동, 성석동, 송정동, 수석동, 수택동, 식사동, 신곡동, 신내동, 신원동, 신장동, 쌍령동, 쌍문동, 아동동, 아천동, 암사동, 야당동, 야동동, 양벌동, 어둔동, 역동, 오금동, 오도동, 와동동, 와부읍, 용두동, 용현동, 우이동, 원당동, 원흥동, 월계동, 월롱면, 의정부동, 이패동, 인창동, 일산동, 일패동, 장단면, 장암동, 장지동, 장흥면, 정발산동, 조리읍, 조안면, 주교동, 주엽동, 중계동, 중곡동, 중대동, 중산동, 중화동, 지금동, 지영동, 지축동, 직동, 진건읍, 진관동, 진접읍, 창동, 창우동, 천현동, 천호동, 초월읍, 초이동, 초일동, 추자동, 춘궁동, 탄벌동, 탄현동, 탄현면, 태전동, 토당동, 토평동, 퇴계원읍, 퇴촌면, 파주읍, 풍동, 풍산동, 하계동, 하사창동, 하산곡동, 하지석동, 항동, 행신동, 호원동, 화정동, 회덕동, 효자동], customCityFilters=[서울 광진구, 서울 광진, 서울 중랑구, 서울 중랑, 서울 강북구, 서울 강북, 서울 도봉구, 서울 도봉, 서울 노원구, 서울 노원, 서울 은평구, 서울 은평, 서울 송파구, 서울 송파, 서울 강동구, 서울 강동, 성남시 중원구, 성남시 중원, 의정부시, 의정부, 고양시 덕양구, 고양시 덕양, 고양시 일산동구, 고양시 일산동, 고양시 일산서구, 고양시 일산서, 구리시, 구리, 남양주시, 남양주, 하남시, 하남, 파주시, 파주, 광주시, 광주, 경기 광주, 경기 광주시, 경광주, 양주시, 양주], destinationGroups={서울 광진구=[광장동, 중곡동], 서울 중랑구=[망우동, 면목동, 묵동, 상봉동, 신내동, 중화동], 서울 강북구=[우이동], 서울 도봉구=[도봉동, 방학동, 쌍문동, 창동], 서울 노원구=[공릉동, 상계동, 월계동, 중계동, 하계동], 서울 은평구=[갈현동, 진관동], 서울 송파구=[마천동, 방이동], 서울 강동구=[강일동, 고덕동, 길동, 둔촌동, 명일동, 상일동, 성내동, 암사동, 천호동], 성남시 중원구=[갈현동], 의정부시=[가능동, 고산동, 금오동, 녹양동, 산곡동, 신곡동, 용현동, 의정부동, 장암동, 호원동], 고양시 덕양구=[고양동, 관산동, 내곡동, 내유동, 대자동, 대장동, 도내동, 동산동, 벽제동, 북한동, 삼송동, 선유동, 성사동, 신원동, 오금동, 용두동, 원당동, 원흥동, 주교동, 지축동, 토당동, 행신동, 화정동, 효자동], 고양시 일산동구=[마두동, 문봉동, 백석동, 사리현동, 산황동, 설문동, 성석동, 식사동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[대화동, 덕이동, 일산동, 주엽동, 탄현동], 구리시=[갈매동, 교문동, 사노동, 수택동, 아천동, 인창동, ?
    ```

    </details>
- `🚦 [ROADMAP 20:34:01.212] [📱앱] [DETAIL_CONFIRMED] 🛡️ 관제탑 판결 수신 (Action: KEEP) → '닫기' 버튼 클릭 집행 개시`
- `🚦 [ROADMAP 20:34:01.215] [📱앱] [SESSION] 🔄 세션 및 사냥 상태 완전 초기화 (새로운 타겟 대기)`
- `[ROADMAP 20:34:01.365] [🖥️관제웹] PinnedRoute에서 KEEP(유지 확정) 버튼 클릭`
- `[ROADMAP 20:34:01.365] [🖥️관제웹] 서버에게 decision=KEEP 하달 정보 전달`

### 🟢 [STEP 6] 관제탑 결재 (취소 vs 유지)
*(시작 기준 시간: 20:34:01.366)*

- `[ROADMAP 20:34:01.366] [🖥️관제웹] [관제대시보드] [Socket] 유지 전달`
- `[ROADMAP 20:34:01.370] [☁️서버] 앱폰에게 Action=Keep 최종 판결 Piggyback 등록`

    <details>
    <summary>🔽 📦 [Piggyback V2] 관제탑 판결(KEEP)을 큐에 기록. 다음 텔레메트리에 태워 보냅니다. (orderId: 3b5ea20d-7f3...</summary>

    ```json
    📦 [Piggyback V2] 관제탑 판결(KEEP)을 큐에 기록. 다음 텔레메트리에 태워 보냅니다. (orderId: 3b5ea20d-7f39-4ee6-bad7-22b7a6fe1d30)
    ```

    </details>
- `[ROADMAP 20:34:01.370] [☁️서버] 관제탑으로 부터 Keep 결재 요청 받음`
- `[ROADMAP 20:34:01.370] [☁️서버] 해당 콜을 '내 퀵(myOrders)' 배열에 추가 및 병합 궤적 생성 연산`

### 🟢 [STEP 2] 첫짐 1차 선점 (단독콜 사냥)
*(시작 기준 시간: 20:34:01.428)*

- `🚦 [ROADMAP 20:34:01.428] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 2026-05-05 20:34:01.429 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:34:01.429 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=DETAIL_CONFIRMED, holding=false, 콜=0건
    ```

    </details>
- `🚦 [ROADMAP 20:34:01.488] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    FilterConfig(allowedVehicleTypes=[오토바이, 다마스], isActive=true, isSharedMode=true, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가능동, 갈매동, 갈현동, 감북동, 감이동, 감일동, 강일동, 검산동, 경안동, 고덕동, 고산동, 고양동, 공릉동, 관산동, 광암동, 광장동, 광탄면, 교문동, 교산동, 교하동, 금곡동, 금릉동, 금오동, 금촌동, 길동, 남종면, 남한산성면, 내곡동, 내유동, 녹양동, 다산동, 다율동, 당정동, 당하동, 대자동, 대장동, 대화동, 덕이동, 덕풍동, 도내동, 도농동, 도봉동, 동산동, 동패동, 둔촌동, 마두동, 마천동, 망우동, 망월동, 매산동, 맥금동, 면목동, 명일동, 목동, 목동동, 목현동, 묵동, 문봉동, 문산읍, 미사동, 방이동, 방학동, 배알미동, 백석동, 백석읍, 벽제동, 별내동, 별내면, 북한동, 사노동, 사리현동, 산곡동, 산황동, 삼동, 삼송동, 삼패동, 상계동, 상봉동, 상사창동, 상산곡동, 상일동, 상지석동, 선동, 선유동, 설문동, 성내동, 성사동, 성석동, 송정동, 수석동, 수택동, 식사동, 신곡동, 신내동, 신원동, 신장동, 쌍령동, 쌍문동, 아동동, 아천동, 암사동, 야당동, 야동동, 양벌동, 어둔동, 역동, 오금동, 오도동, 와동동, 와부읍, 용두동, 용현동, 우이동, 원당동, 원흥동, 월계동, 월롱면, 의정부동, 이패동, 인창동, 일산동, 일패동, 장단면, 장암동, 장지동, 장흥면, 정발산동, 조리읍, 조안면, 주교동, 주엽동, 중계동, 중곡동, 중대동, 중산동, 중화동, 지금동, 지영동, 지축동, 직동, 진건읍, 진관동, 진접읍, 창동, 창우동, 천현동, 천호동, 초월읍, 초이동, 초일동, 추자동, 춘궁동, 탄벌동, 탄현동, 탄현면, 태전동, 토당동, 토평동, 퇴계원읍, 퇴촌면, 파주읍, 풍동, 풍산동, 하계동, 하사창동, 하산곡동, 하지석동, 항동, 행신동, 호원동, 화정동, 회덕동, 효자동], customCityFilters=[서울 광진구, 서울 광진, 서울 중랑구, 서울 중랑, 서울 강북구, 서울 강북, 서울 도봉구, 서울 도봉, 서울 노원구, 서울 노원, 서울 은평구, 서울 은평, 서울 송파구, 서울 송파, 서울 강동구, 서울 강동, 성남시 중원구, 성남시 중원, 의정부시, 의정부, 고양시 덕양구, 고양시 덕양, 고양시 일산동구, 고양시 일산동, 고양시 일산서구, 고양시 일산서, 구리시, 구리, 남양주시, 남양주, 하남시, 하남, 파주시, 파주, 광주시, 광주, 경기 광주, 경기 광주시, 경광주, 양주시, 양주], destinationGroups={서울 광진구=[광장동, 중곡동], 서울 중랑구=[망우동, 면목동, 묵동, 상봉동, 신내동, 중화동], 서울 강북구=[우이동], 서울 도봉구=[도봉동, 방학동, 쌍문동, 창동], 서울 노원구=[공릉동, 상계동, 월계동, 중계동, 하계동], 서울 은평구=[갈현동, 진관동], 서울 송파구=[마천동, 방이동], 서울 강동구=[강일동, 고덕동, 길동, 둔촌동, 명일동, 상일동, 성내동, 암사동, 천호동], 성남시 중원구=[갈현동], 의정부시=[가능동, 고산동, 금오동, 녹양동, 산곡동, 신곡동, 용현동, 의정부동, 장암동, 호원동], 고양시 덕양구=[고양동, 관산동, 내곡동, 내유동, 대자동, 대장동, 도내동, 동산동, 벽제동, 북한동, 삼송동, 선유동, 성사동, 신원동, 오금동, 용두동, 원당동, 원흥동, 주교동, 지축동, 토당동, 행신동, 화정동, 효자동], 고양시 일산동구=[마두동, 문봉동, 백석동, 사리현동, 산황동, 설문동, 성석동, 식사동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[대화동, 덕이동, 일산동, 주엽동, 탄현동], 구리시=[갈매동, 교문동, 사노동, 수택동, 아천동, 인창동, ?
    ```

    </details>
- `🚦 [ROADMAP 20:34:01.722] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 20:34:01.728] [📱앱] [DETAIL_CONFIRMED] ✅ 판결 KEEP 집행 완료 → [Current Page: LIST] 복귀, 락 해제, 합짐 사냥 루프 회귀`
- `🚦 [ROADMAP 20:34:01.779] [📱앱] 버튼 터치 완료 (가로채기 성공) X:122.0, Y:2251.0`
- `[ROADMAP 20:34:01.987] [☁️서버] [FilterManager] 필터 변경 발생! (실시간 변경(activeFilter))`

    <details>
    <summary>🔽 {</summary>

    ```json
    {
      "destinationCity": "파주",
      "destinationRadiusKm": 5,
      "corridorRadiusKm": 5,
      "minFare": 20000,
      "maxFare": 1000000,
      "pickupRadiusKm": 10,
      "excludedKeywords": [],
      "isActive": false,
      "isSharedMode": false,
      "driverAction": "WAITING",
      "dispatchPhase": "STANDBY",
      "destinationKeywords": ["가능동","갈매동","갈현동","감북동","감이동","감일동","강일동","검산동","경안동","고덕동","고산동","고양동","공릉동","관산동","광암동","광장동","광탄면","교문동","교산동","교하동","금곡동","금릉동","금오동","금촌동","길동","남종면","남한산성면","내곡동","내유동","녹양동","다산동","다율동","당정동","당하동","대자동","대장동","대화동","덕이동","덕풍동","도내동","도농동","도봉동","동산동","동패동","둔촌동","마두동","마천동","망우동","망월동","매산동","맥금동","면목동","명일동","목동","목동동","목현동","묵동","문봉동","문산읍","미사동","방이동","방학동","배알미동","백석동","백석읍","벽제동","별내동","별내면","북한동","사노동","사리현동","산곡동","산황동","삼동","삼송동","삼패동","상계동","상봉동","상사창동","상산곡동","상일동","상지석동","선동","선유동","설문동","성내동","성사동","성석동","송정동","수석동","수택동","식사동","신곡동","신내동","신원동","신장동","쌍령동","쌍문동","아동동","아천동","암사동","야당동","야동동","양벌동","어둔동","역동","오금동","오도동","와동동","와부읍","용두동","용현동","우이동","원당동","원흥동","월계동","월롱면","의정부동","이패동","인창동","일산동","일패동","장단면","장암동","장지동","장흥면","정발산동","조리읍","조안면","주교동","주엽동","중계동","중곡동","중대동","중산동","중화동","지금동","지영동","지축동","직동","진건읍","진관동","진접읍","창동","창우동","천현동","천호동","초월읍","초이동","초일동","추자동","춘궁동","탄벌동","탄현동","탄현면","태전동","토당동","토평동","퇴계원읍","퇴촌면","파주읍","풍동","풍산동","하계동","하사창동","하산곡동","하지석동","항동","행신동","호원동","화정동","회덕동","효자동"],
      "destinationGroups": {"서울 광진구":["광장동","중곡동"],"서울 중랑구":["망우동","면목동","묵동","상봉동","신내동","중화동"],"서울 강북구":["우이동"],"서울 도봉구":["도봉동","방학동","쌍문동","창동"],"서울 노원구":["공릉동","상계동","월계동","중계동","하계동"],"서울 은평구":["갈현동","진관동"],"서울 송파구":["마천동","방이동"],"서울 강동구":["강일동","고덕동","길동","둔촌동","명일동","상일동","성내동","암사동","천호동"],"성남시 중원구":["갈현동"],"의정부시":["가능동","고산동","금오동","녹양동","산곡동","신곡동","용현동","의정부동","장암동","호원동"],"고양시 덕양구":["고양동","관산동","내곡동","내유동","대자동","대장동","도내동","동산동","벽제동","북한동","삼송동","선유동","성사동","신원동","오금동","용두동","원당동","원흥동","주교동","지축동","토당동","행신동","화정동","효자동"],"고양시 일산동구":["마두동","문봉동","백석동","사리현동","산황동","설문동","성석동","식사동","정발산동","중산동","지영동","풍동"],"고양시 일산서구":["대화동","덕이동","일산동","주엽동","탄현동"],"구리시":["갈매동","교문동","사노동","수택동","아천동","인창동","토평동"],"남양주시":["금곡동","다산동","도농동","별내동","별내면","삼패동","수석동","와부읍","이패동","일패동","조안면","지금동","진건읍","진접읍","퇴계원읍"],"하남시":["감북동","감이동","감일동","광암동","교산동","당정동","덕풍동","망월동","미사동","배알미동","상사창동","상산곡동","선동","신장동","창우동","천현동","초이동","초일동","춘궁동","풍산동","하사창동","하산곡동","항동"],"파주시":["검산동","광탄면","교하동","금릉동","금촌동","다율동","당하동","동패동","맥금동","목동동","문산읍","상지석동","아동동","야당동","야동동","오도동","와동동","월롱면","장단면","조리읍","탄현면","파주읍","하지석동"],"광주시":["경안동","고산동","남종면","남한산성면","매산동","목동","목현동","삼동","송정동","쌍령동","양벌동","역동","장지동","중대동","직동","초월읍","추자동","탄벌동","태전동","퇴촌면","회덕동"],"양주시":["백석읍","어둔동","장흥면"]},
      "allowedVehicleTypes": ["오토바이","다마스","라보","승용차","1t"],
      "userOverrides": true,
      "customCityFilters": ["서울 광진구","서울 광진","서울 중랑구","서울 중랑","서울 강북구","서울 강북","서울 도봉구","서울 도봉","서울 노원구","서울 노원","서울 은평구","서울 은평","서울 송파구","서울 송파","서울 강동구","서울 강동","성남시 중원구","성남시 중원","의정부시","의정부","고양시 덕양구","고양시 덕양","고양시 일산동구","고양시 일산동","고양시 일산서구","고양시 일산서","구리시","구리","남양주시","남양주","하남시","하남","파주시","파주","광주시","광주","경기 광주","경기 광주시","경광주","양주시","양주"],
    }
    ```

    </details>
- `[ROADMAP 20:34:01.989] [☁️서버] 관제탑에게 확정되었음(order-confirmed) 정보 전달`
- `[ROADMAP 20:34:01.989] [☁️서버] 합짐을 위한 반경/목적지 추천 키워드로 다이나믹 필터 생성 연산`
- `[ROADMAP 20:34:01.989] [☁️서버] [FilterManager] 필터 변경 발생! (실시간 변경(activeFilter))`

    <details>
    <summary>🔽 {</summary>

    ```json
    {
      "destinationCity": "파주",
      "destinationRadiusKm": 5,
      "corridorRadiusKm": 5,
      "minFare": 20000,
      "maxFare": 1000000,
      "pickupRadiusKm": 10,
      "excludedKeywords": [],
      "isActive": true,
      "isSharedMode": true,
      "driverAction": "WAITING",
      "dispatchPhase": "GATHERING",
      "destinationKeywords": ["가능동","갈매동","갈현동","감북동","감이동","감일동","강일동","검산동","경안동","고덕동","고산동","고양동","공릉동","관산동","광암동","광장동","광탄면","교문동","교산동","교하동","금곡동","금릉동","금오동","금촌동","길동","남종면","남한산성면","내곡동","내유동","녹양동","다산동","다율동","당정동","당하동","대자동","대장동","대화동","덕이동","덕풍동","도내동","도농동","도봉동","동산동","동패동","둔촌동","마두동","마천동","망우동","망월동","매산동","맥금동","면목동","명일동","목동","목동동","목현동","묵동","문봉동","문산읍","미사동","방이동","방학동","배알미동","백석동","백석읍","벽제동","별내동","별내면","북한동","사노동","사리현동","산곡동","산황동","삼동","삼송동","삼패동","상계동","상봉동","상사창동","상산곡동","상일동","상지석동","선동","선유동","설문동","성내동","성사동","성석동","송정동","수석동","수택동","식사동","신곡동","신내동","신원동","신장동","쌍령동","쌍문동","아동동","아천동","암사동","야당동","야동동","양벌동","어둔동","역동","오금동","오도동","와동동","와부읍","용두동","용현동","우이동","원당동","원흥동","월계동","월롱면","의정부동","이패동","인창동","일산동","일패동","장단면","장암동","장지동","장흥면","정발산동","조리읍","조안면","주교동","주엽동","중계동","중곡동","중대동","중산동","중화동","지금동","지영동","지축동","직동","진건읍","진관동","진접읍","창동","창우동","천현동","천호동","초월읍","초이동","초일동","추자동","춘궁동","탄벌동","탄현동","탄현면","태전동","토당동","토평동","퇴계원읍","퇴촌면","파주읍","풍동","풍산동","하계동","하사창동","하산곡동","하지석동","항동","행신동","호원동","화정동","회덕동","효자동"],
      "destinationGroups": {"서울 광진구":["광장동","중곡동"],"서울 중랑구":["망우동","면목동","묵동","상봉동","신내동","중화동"],"서울 강북구":["우이동"],"서울 도봉구":["도봉동","방학동","쌍문동","창동"],"서울 노원구":["공릉동","상계동","월계동","중계동","하계동"],"서울 은평구":["갈현동","진관동"],"서울 송파구":["마천동","방이동"],"서울 강동구":["강일동","고덕동","길동","둔촌동","명일동","상일동","성내동","암사동","천호동"],"성남시 중원구":["갈현동"],"의정부시":["가능동","고산동","금오동","녹양동","산곡동","신곡동","용현동","의정부동","장암동","호원동"],"고양시 덕양구":["고양동","관산동","내곡동","내유동","대자동","대장동","도내동","동산동","벽제동","북한동","삼송동","선유동","성사동","신원동","오금동","용두동","원당동","원흥동","주교동","지축동","토당동","행신동","화정동","효자동"],"고양시 일산동구":["마두동","문봉동","백석동","사리현동","산황동","설문동","성석동","식사동","정발산동","중산동","지영동","풍동"],"고양시 일산서구":["대화동","덕이동","일산동","주엽동","탄현동"],"구리시":["갈매동","교문동","사노동","수택동","아천동","인창동","토평동"],"남양주시":["금곡동","다산동","도농동","별내동","별내면","삼패동","수석동","와부읍","이패동","일패동","조안면","지금동","진건읍","진접읍","퇴계원읍"],"하남시":["감북동","감이동","감일동","광암동","교산동","당정동","덕풍동","망월동","미사동","배알미동","상사창동","상산곡동","선동","신장동","창우동","천현동","초이동","초일동","춘궁동","풍산동","하사창동","하산곡동","항동"],"파주시":["검산동","광탄면","교하동","금릉동","금촌동","다율동","당하동","동패동","맥금동","목동동","문산읍","상지석동","아동동","야당동","야동동","오도동","와동동","월롱면","장단면","조리읍","탄현면","파주읍","하지석동"],"광주시":["경안동","고산동","남종면","남한산성면","매산동","목동","목현동","삼동","송정동","쌍령동","양벌동","역동","장지동","중대동","직동","초월읍","추자동","탄벌동","태전동","퇴촌면","회덕동"],"양주시":["백석읍","어둔동","장흥면"]},
      "allowedVehicleTypes": ["오토바이","다마스"],
      "userOverrides": true,
      "customCityFilters": ["서울 광진구","서울 광진","서울 중랑구","서울 중랑","서울 강북구","서울 강북","서울 도봉구","서울 도봉","서울 노원구","서울 노원","서울 은평구","서울 은평","서울 송파구","서울 송파","서울 강동구","서울 강동","성남시 중원구","성남시 중원","의정부시","의정부","고양시 덕양구","고양시 덕양","고양시 일산동구","고양시 일산동","고양시 일산서구","고양시 일산서","구리시","구리","남양주시","남양주","하남시","하남","파주시","파주","광주시","광주","경기 광주","경기 광주시","경광주","양주시","양주"],
    }
    ```

    </details>
- `[ROADMAP 20:34:01.989] [☁️서버] 새로 부여된 합짐 필터(isSharedMode)값 메모리 세션 갱신`
- `[ROADMAP 20:34:01.989] [☁️서버] 앱폰 및 관제탑에게 새로운 타겟팅 필터(filter-updated) 정보 전달`
- `[ROADMAP 20:34:01.990] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 0항목 적재 중 [화면: DETAIL_CONFIRMED]`

    <details>
    <summary>🔽 📦 [Piggyback V2] 텔레메트리 편에 결재(KEEP)를 태워 보냅니다! (orderId: 3b5ea20d-7f39-4ee6-bad7-...</summary>

    ```json
    📦 [Piggyback V2] 텔레메트리 편에 결재(KEEP)를 태워 보냅니다! (orderId: 3b5ea20d-7f39-4ee6-bad7-22b7a6fe1d30)
    ```

    </details>
- `[ROADMAP 20:34:01.990] [🖥️관제웹] 서버로 부터 filter-updated 소켓 이벤트 받음`
- `[ROADMAP 20:34:01.991] [🖥️관제웹] 서버로 부터 filter-updated 소켓 이벤트 받음`
- `[ROADMAP 20:34:02.017] [🖥️관제웹] [관제대시보드] PinnedRoute 레이아웃을 합짐/무한 궤도 모드로 격상 렌더링 및 딤드 다시 처리`
- `[ROADMAP 20:34:02.017] [🖥️관제웹] 서버로 부터 filter-updated 소켓 이벤트 받음`
- `🚦 [ROADMAP 20:34:02.046] [📱앱] [LIST] 📡 화면 변경 감지 | 화면: LIST | 모드: AUTO`
- `🚦 [ROADMAP 20:34:02.047] [📱앱] [SESSION] 🔄 세션 및 사냥 상태 완전 초기화 (새로운 타겟 대기)`
- `🚦 [ROADMAP 20:34:02.054] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(다)=✅ 도착지(173중 고촌읍)=❌ 요금(20000 <= 82000)=✅ 상차지/거리(합짐무시 >= 0.2km)=✅ 블랙()=✅`
- `[ROADMAP 20:34:02.243] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 0항목 적재 중 [화면: DETAIL_CONFIRMED]`
- `🚦 [ROADMAP 20:34:02.358] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 2026-05-05 20:34:02.358 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:34:02.358 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=LIST, holding=false, 콜=1건
    ```

    </details>
- `🚦 [ROADMAP 20:34:02.367] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    FilterConfig(allowedVehicleTypes=[오토바이, 다마스], isActive=true, isSharedMode=true, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가능동, 갈매동, 갈현동, 감북동, 감이동, 감일동, 강일동, 검산동, 경안동, 고덕동, 고산동, 고양동, 공릉동, 관산동, 광암동, 광장동, 광탄면, 교문동, 교산동, 교하동, 금곡동, 금릉동, 금오동, 금촌동, 길동, 남종면, 남한산성면, 내곡동, 내유동, 녹양동, 다산동, 다율동, 당정동, 당하동, 대자동, 대장동, 대화동, 덕이동, 덕풍동, 도내동, 도농동, 도봉동, 동산동, 동패동, 둔촌동, 마두동, 마천동, 망우동, 망월동, 매산동, 맥금동, 면목동, 명일동, 목동, 목동동, 목현동, 묵동, 문봉동, 문산읍, 미사동, 방이동, 방학동, 배알미동, 백석동, 백석읍, 벽제동, 별내동, 별내면, 북한동, 사노동, 사리현동, 산곡동, 산황동, 삼동, 삼송동, 삼패동, 상계동, 상봉동, 상사창동, 상산곡동, 상일동, 상지석동, 선동, 선유동, 설문동, 성내동, 성사동, 성석동, 송정동, 수석동, 수택동, 식사동, 신곡동, 신내동, 신원동, 신장동, 쌍령동, 쌍문동, 아동동, 아천동, 암사동, 야당동, 야동동, 양벌동, 어둔동, 역동, 오금동, 오도동, 와동동, 와부읍, 용두동, 용현동, 우이동, 원당동, 원흥동, 월계동, 월롱면, 의정부동, 이패동, 인창동, 일산동, 일패동, 장단면, 장암동, 장지동, 장흥면, 정발산동, 조리읍, 조안면, 주교동, 주엽동, 중계동, 중곡동, 중대동, 중산동, 중화동, 지금동, 지영동, 지축동, 직동, 진건읍, 진관동, 진접읍, 창동, 창우동, 천현동, 천호동, 초월읍, 초이동, 초일동, 추자동, 춘궁동, 탄벌동, 탄현동, 탄현면, 태전동, 토당동, 토평동, 퇴계원읍, 퇴촌면, 파주읍, 풍동, 풍산동, 하계동, 하사창동, 하산곡동, 하지석동, 항동, 행신동, 호원동, 화정동, 회덕동, 효자동], customCityFilters=[서울 광진구, 서울 광진, 서울 중랑구, 서울 중랑, 서울 강북구, 서울 강북, 서울 도봉구, 서울 도봉, 서울 노원구, 서울 노원, 서울 은평구, 서울 은평, 서울 송파구, 서울 송파, 서울 강동구, 서울 강동, 성남시 중원구, 성남시 중원, 의정부시, 의정부, 고양시 덕양구, 고양시 덕양, 고양시 일산동구, 고양시 일산동, 고양시 일산서구, 고양시 일산서, 구리시, 구리, 남양주시, 남양주, 하남시, 하남, 파주시, 파주, 광주시, 광주, 경기 광주, 경기 광주시, 경광주, 양주시, 양주], destinationGroups={서울 광진구=[광장동, 중곡동], 서울 중랑구=[망우동, 면목동, 묵동, 상봉동, 신내동, 중화동], 서울 강북구=[우이동], 서울 도봉구=[도봉동, 방학동, 쌍문동, 창동], 서울 노원구=[공릉동, 상계동, 월계동, 중계동, 하계동], 서울 은평구=[갈현동, 진관동], 서울 송파구=[마천동, 방이동], 서울 강동구=[강일동, 고덕동, 길동, 둔촌동, 명일동, 상일동, 성내동, 암사동, 천호동], 성남시 중원구=[갈현동], 의정부시=[가능동, 고산동, 금오동, 녹양동, 산곡동, 신곡동, 용현동, 의정부동, 장암동, 호원동], 고양시 덕양구=[고양동, 관산동, 내곡동, 내유동, 대자동, 대장동, 도내동, 동산동, 벽제동, 북한동, 삼송동, 선유동, 성사동, 신원동, 오금동, 용두동, 원당동, 원흥동, 주교동, 지축동, 토당동, 행신동, 화정동, 효자동], 고양시 일산동구=[마두동, 문봉동, 백석동, 사리현동, 산황동, 설문동, 성석동, 식사동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[대화동, 덕이동, 일산동, 주엽동, 탄현동], 구리시=[갈매동, 교문동, 사노동, 수택동, 아천동, 인창동, ?
    ```

    </details>
- `[ROADMAP 20:34:03.153] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 1항목 적재 중 [화면: LIST]`
- `🚦 [ROADMAP 20:34:05.935] [📱앱] [LIST] 📡 화면 변경 감지 | 화면: LIST | 모드: AUTO`
- `🚦 [ROADMAP 20:34:05.936] [📱앱] [SESSION] 🔄 세션 및 사냥 상태 완전 초기화 (새로운 타겟 대기)`
- `🚦 [ROADMAP 20:34:05.940] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(다)=✅ 도착지(173중 탄현면)=✅ 요금(20000 <= 112000)=✅ 상차지/거리(합짐무시 >= 0.2km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 20:34:05.941] [📱앱] [LIST] 🎯 [Current Page: LIST] 1차 필터 통과 → AUTO 타겟 발견, 강제 터치 진행`
- `🚦 [ROADMAP 20:34:05.941] [📱앱] [LIST] 리스트에서 바뀐 text 감지 후 text 추출`
- `🚦 [ROADMAP 20:34:05.944] [📱앱] [LIST] [인성 Socket] 인성콜에 선택된 콜 정보 전달 (꿀콜 클릭!)`
- `🚦 [ROADMAP 20:34:05.995] [📱앱] 버튼 터치 완료 (가로채기 성공) X:917.0, Y:568.0`
- `🚦 [ROADMAP 20:34:06.133] [📱앱] [DETAIL_PRE_CONFIRM] 📡 화면 변경 감지 | 화면: DETAIL_PRE_CONFIRM | 모드: AUTO`
- `🚦 [ROADMAP 20:34:06.133] [📱앱] [DETAIL_PRE_CONFIRM] [Current Page: DETAIL_PRE_CONFIRM] 진입 완료`
- `🚦 [ROADMAP 20:34:06.138] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지 텍스트 추출 및 2차 필터(적요 등) 통과 확인`
- `🚦 [ROADMAP 20:34:06.142] [📱앱] [DETAIL] 🔍 [타겟 콜 필터 결과] 차종(다)=✅ 도착지(173중 탄현면)=✅ 요금(20000 <= 112000)=✅ 상차지/거리(합짐무시 >= 0.2km)=✅ 블랙()=✅`

### 🟡 [STEP 3] 1차 확정 통신
*(시작 기준 시간: 20:34:06.142)*

- `🚦 [ROADMAP 20:34:06.142] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지에서 '확정' 추출 후 클릭`
- `🚦 [ROADMAP 20:34:06.143] [📱앱] [DETAIL_PRE_CONFIRM] [인성 Socket] 콜 확정 완료`
- `🚦 [ROADMAP 20:34:06.143] [📱앱] '확정' 버튼 인식 ➡️ 클릭 시도`

    <details>
    <summary>🔽 🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용...</summary>

    ```json
    🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용을 긁어서 POST /api/orders/detail 로 보내주세요."}
    ```

    </details>
- `🚦 [ROADMAP 20:34:06.149] [📱앱] [HTTP 폴링] 응답 /orders/confirm`
- `🚦 [ROADMAP 20:34:06.196] [📱앱] 버튼 터치 완료 (가로채기 성공) X:161.0, Y:2251.0`

### 🟢 [STEP 2] 첫짐 1차 선점 (단독콜 사냥)
*(시작 기준 시간: 20:34:06.346)*

- `🚦 [ROADMAP 20:34:06.346] [📱앱] [DETAIL_PRE_CONFIRM] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 2026-05-05 20:34:06.347 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:34:06.347 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=DETAIL_PRE_CONFIRM, holding=true, 콜=0건
    ```

    </details>
- `🚦 [ROADMAP 20:34:06.369] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 화면: DETAIL_CONFIRMED | 모드: AUTO`
- `🚦 [ROADMAP 20:34:06.369] [📱앱] [DETAIL_CONFIRMED] 🔒 [Current Page: DETAIL_CONFIRMED] 진입, isHolding=true 설정`
- `🚦 [ROADMAP 20:34:06.369] [📱앱] [DETAIL_CONFIRMED] 🏄‍♂️ 무인 서핑 가동 (State Machine: IDLE → 팝업버튼 트리거 대기)`
- `🚦 [ROADMAP 20:34:06.369] [📱앱] '적요상세' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 20:34:06.372] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '적요상세' 추출 후 클릭`
- `🚦 [ROADMAP 20:34:06.424] [📱앱] 버튼 터치 완료 (가로채기 성공) X:149.0, Y:1153.0`
- `🚦 [ROADMAP 20:34:06.548] [📱앱] [POPUP_MEMO] 📡 화면 변경 감지 | 화면: POPUP_MEMO | 모드: AUTO`
- `🚦 [ROADMAP 20:34:06.549] [📱앱] [POPUP_MEMO] [Current Page: POPUP_MEMO] 진입 완료 ("적요 내용" 텍스트 매칭 확인)`
- `🚦 [ROADMAP 20:34:06.549] [📱앱] [POPUP_MEMO] 적요상세 데이터 추출 및 메모리에 누적 저장`
- `🚦 [ROADMAP 20:34:06.551] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 20:34:06.603] [📱앱] 버튼 터치 완료 (가로채기 성공) X:540.0, Y:2264.0`
- `🚦 [ROADMAP 20:34:06.751] [📱앱] [POPUP_MEMO] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 2026-05-05 20:34:06.751 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:34:06.751 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=POPUP_MEMO, holding=true, 콜=0건
    ```

    </details>
- `🚦 [ROADMAP 20:34:06.762] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 화면: DETAIL_CONFIRMED | 모드: AUTO`
- `🚦 [ROADMAP 20:34:06.762] [📱앱] [DETAIL_CONFIRMED] [Current Page: DETAIL_CONFIRMED] 확정페이지 복귀 확인 (잔상 회피 완료)`
- `🚦 [ROADMAP 20:34:06.762] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '출발지' 추출 후 클릭`
- `🚦 [ROADMAP 20:34:06.763] [📱앱] '출발지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 20:34:06.815] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1592.0`
- `[ROADMAP 20:34:06.938] [☁️서버] 앱폰에게 상세 정보 스크래핑을 즉시 진행하라고 응답 전달`
- `[ROADMAP 20:34:06.938] [☁️서버] 콜의 가확정 상태를 메모리에 캐싱 연산`
- `[ROADMAP 20:34:06.938] [☁️서버] 앱폰으로 부터 가로챈 '1차 오더 확정' 요청 받음`
- `[ROADMAP 20:34:06.938] [☁️서버] 관제탑에게 이 콜을 선점했음(order-evaluating) 정보 전달`
- `[ROADMAP 20:34:06.939] [🖥️관제웹] [관제대시보드] 🟢 [웹 수신] order-evaluating | ID: e9f04a11-88bd-466e-ba58-7e18c767e58e | 기기: 앱폰-sdk_gpho-160 | 탄현면`
- `[ROADMAP 20:34:06.940] [🖥️관제웹] [관제대시보드] 확정페이지 진입 (선빵 수신으로 상세 모드 구동)`
- `[ROADMAP 20:34:06.940] [🖥️관제웹] [관제대시보드] PinnedRoute 컴포넌트에 빈 레이아웃(평가중) 렌더링 및 하단 결재버튼 전체 딤드(비활성) 처리`
- `🚦 [ROADMAP 20:34:06.948] [📱앱] [POPUP_PICKUP] 📡 화면 변경 감지 | 화면: POPUP_PICKUP | 모드: AUTO`
- `🚦 [ROADMAP 20:34:06.949] [📱앱] [POPUP_PICKUP] [Current Page: POPUP_PICKUP] 진입 완료 ("전화1" 텍스트 매칭 확인)`
- `🚦 [ROADMAP 20:34:06.949] [📱앱] [POPUP_PICKUP] 출발지 데이터 추출 및 메모리에 누적 저장`
- `🚦 [ROADMAP 20:34:06.949] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 20:34:07.001] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`
- `🚦 [ROADMAP 20:34:07.115] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 화면: DETAIL_CONFIRMED | 모드: AUTO`
- `🚦 [ROADMAP 20:34:07.115] [📱앱] [DETAIL_CONFIRMED] [Current Page: DETAIL_CONFIRMED] 확정페이지 복귀 확인 (잔상 회피 완료)`
- `🚦 [ROADMAP 20:34:07.115] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '도착지' 추출 후 클릭`
- `🚦 [ROADMAP 20:34:07.116] [📱앱] '도착지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 20:34:07.168] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1742.0`
- `🚦 [ROADMAP 20:34:07.262] [📱앱] [DETAIL_PRE_CONFIRM] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSha...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSharedMode=true, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[서울 광진구, 서울 광진, 서울 중랑구, 서울 중랑, 서울 강북구, 서울 강북, 서울 도봉구, 서울 도봉, 서울 노원구, 서울 노원, 서울 은평구, 서울 은평, 서울 송파구, 서울 송파, 서울 강동구, 서울 강동, 성남시 중원구, 성남시 중원, 의정부시, 의정부, 고양시 덕양구, 고양시 덕양, 고양시 일산동구, 고양시 일산동, 고양시 일산서구, 고양시 일산서, 구리시, 구리, 남양주시, 남양주, 하남시, 하남, 파주시, 파주, 광주시, 광주, 경기 광주, 경기 광주시, 경광주, 양주시, 양주], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `🚦 [ROADMAP 20:34:07.278] [📱앱] [POPUP_MEMO] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSha...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSharedMode=true, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[서울 광진구, 서울 광진, 서울 중랑구, 서울 중랑, 서울 강북구, 서울 강북, 서울 도봉구, 서울 도봉, 서울 노원구, 서울 노원, 서울 은평구, 서울 은평, 서울 송파구, 서울 송파, 서울 강동구, 서울 강동, 성남시 중원구, 성남시 중원, 의정부시, 의정부, 고양시 덕양구, 고양시 덕양, 고양시 일산동구, 고양시 일산동, 고양시 일산서구, 고양시 일산서, 구리시, 구리, 남양주시, 남양주, 하남시, 하남, 파주시, 파주, 광주시, 광주, 경기 광주, 경기 광주시, 경광주, 양주시, 양주], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `🚦 [ROADMAP 20:34:07.301] [📱앱] [POPUP_DROPOFF] 📡 화면 변경 감지 | 화면: POPUP_DROPOFF | 모드: AUTO`
- `🚦 [ROADMAP 20:34:07.302] [📱앱] [POPUP_DROPOFF] [Current Page: POPUP_DROPOFF] 진입 완료 ("전화1" 텍스트 매칭 확인)`
- `🚦 [ROADMAP 20:34:07.302] [📱앱] [POPUP_DROPOFF] 도착지 데이터 추출 및 메모리에 누적 저장`
- `🚦 [ROADMAP 20:34:07.303] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 20:34:07.304] [📱앱] [DETAIL_CONFIRMED] [Current Page: DETAIL_CONFIRMED] 무인 서핑 종료 (State Machine: DONE)`
- `🚦 [ROADMAP 20:34:07.305] [📱앱] [DEATHVALLEY] ⏳ 데스밸리 타이머 가동 (30초 대기 → 서버 판결 대기 시작)`
- `🚦 [ROADMAP 20:34:07.359] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`
- `🚦 [ROADMAP 20:34:07.690] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 2026-05-05 20:34:07.691 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:34:07.691 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=DETAIL_CONFIRMED, holding=true, 콜=0건
    ```

    </details>
- `🚦 [ROADMAP 20:34:07.699] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSha...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSharedMode=true, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[서울 광진구, 서울 광진, 서울 중랑구, 서울 중랑, 서울 강북구, 서울 강북, 서울 도봉구, 서울 도봉, 서울 노원구, 서울 노원, 서울 은평구, 서울 은평, 서울 송파구, 서울 송파, 서울 강동구, 서울 강동, 성남시 중원구, 성남시 중원, 의정부시, 의정부, 고양시 덕양구, 고양시 덕양, 고양시 일산동구, 고양시 일산동, 고양시 일산서구, 고양시 일산서, 구리시, 구리, 남양주시, 남양주, 하남시, 하남, 파주시, 파주, 광주시, 광주, 경기 광주, 경기 광주시, 경광주, 양주시, 양주], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 20:34:08.045] [☁️서버] [FilterManager] 필터 변경 발생! (실시간 변경(activeFilter))`

    <details>
    <summary>🔽 {</summary>

    ```json
    {
      "destinationCity": "파주",
      "destinationRadiusKm": 5,
      "corridorRadiusKm": 5,
      "minFare": 20000,
      "maxFare": 1000000,
      "pickupRadiusKm": 10,
      "excludedKeywords": [],
      "isActive": false,
      "isSharedMode": true,
      "driverAction": "WAITING",
      "dispatchPhase": "GATHERING",
      "destinationKeywords": ["가좌동","걸포동","검산동","고양동","관산동","광적면","광탄면","교하동","구산동","군남면","군내면","금릉동","금촌동","남면","내유동","다율동","당하동","대자동","대화동","덕이동","동패동","마두동","맥금동","목동동","문발동","문봉동","문산읍","미산면","백석읍","백학면","법곳동","법원읍","벽제동","사리현동","산남동","상봉암동","상지석동","상패동","서패동","선유동","설문동","성석동","송촌동","식사동","신원동","신촌동","아동동","안흥동","야당동","야동동","양촌읍","연다산동","오도동","와동동","왕징면","운양동","원당동","월롱면","은현면","일산동","장기동","장남면","장단면","장항동","장흥면","적성면","전곡읍","정발산동","조리읍","주엽동","중산동","지영동","진동면","진서면","청산면","탄현동","탄현면","통진읍","파주읍","파평면","풍동","하봉암동","하성면","하지석동"],
      "destinationGroups": {"동두천시":["상봉암동","상패동","안흥동","하봉암동"],"고양시 덕양구":["고양동","관산동","내유동","대자동","벽제동","선유동","신원동","원당동"],"고양시 일산동구":["마두동","문봉동","사리현동","설문동","성석동","식사동","장항동","정발산동","중산동","지영동","풍동"],"고양시 일산서구":["가좌동","구산동","대화동","덕이동","법곳동","일산동","주엽동","탄현동"],"파주시":["검산동","광탄면","교하동","군내면","금릉동","금촌동","다율동","당하동","동패동","맥금동","목동동","문발동","문산읍","법원읍","산남동","상지석동","서패동","송촌동","신촌동","아동동","야당동","야동동","연다산동","오도동","와동동","월롱면","장단면","적성면","조리읍","진동면","진서면","탄현면","파주읍","파평면","하지석동"],"김포시":["걸포동","양촌읍","운양동","장기동","통진읍","하성면"],"양주시":["광적면","남면","백석읍","은현면","장흥면"],"연천군":["군남면","미산면","백학면","왕징면","장남면","전곡읍","청산면"]},
      "allowedVehicleTypes": ["오토바이","다마스","라보","승용차","1t"],
      "userOverrides": true,
      "customCityFilters": ["서울 광진구","서울 광진","서울 중랑구","서울 중랑","서울 강북구","서울 강북","서울 도봉구","서울 도봉","서울 노원구","서울 노원","서울 은평구","서울 은평","서울 송파구","서울 송파","서울 강동구","서울 강동","성남시 중원구","성남시 중원","의정부시","의정부","고양시 덕양구","고양시 덕양","고양시 일산동구","고양시 일산동","고양시 일산서구","고양시 일산서","구리시","구리","남양주시","남양주","하남시","하남","파주시","파주","광주시","광주","경기 광주","경기 광주시","경광주","양주시","양주"],
    }
    ```

    </details>
- `[ROADMAP 20:34:08.046] [☁️서버] 폰의 isHolding=true 기간 동안 다른 콜을 물지 않도록 필터 비활성 정보 전달`
- `[ROADMAP 20:34:08.046] [☁️서버] 데스밸리 15초 카운트다운 타이머 감시 연산`
- `[ROADMAP 20:34:08.047] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 0항목 적재 중 [화면: DETAIL_PRE_CONFIRM]`
- `[ROADMAP 20:34:08.047] [🖥️관제웹] 서버로 부터 filter-updated 소켓 이벤트 받음`
- `[ROADMAP 20:34:08.048] [🖥️관제웹] 서버로 부터 filter-updated 소켓 이벤트 받음`
- `[ROADMAP 20:34:08.064] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 0항목 적재 중 [화면: POPUP_MEMO]`
- `[ROADMAP 20:34:08.109] [☁️서버] 앱폰으로 부터 무인서핑이 완료된 '2차 오더 상세' 요청 받음`
- `[ROADMAP 20:34:08.110] [☁️서버] 상하차지 주소 및 적요 텍스트 정제 연산`
- `[ROADMAP 20:34:08.111] [☁️서버] 관제탑에게 정제된 상세 텍스트(order-detail-received) 정보 전달`
- `[ROADMAP 20:34:08.111] [☁️서버] 앱폰에게 디테일 데이터 정상 수신 완료 응답 전달`

### 🟢 [STEP 5] 카카오 연산 3중 폴백 & 자동 회랑 전개
*(시작 기준 시간: 20:34:08.111)*

- `[ROADMAP 20:34:08.111] [☁️서버] 🛡️ 주소 3중 폴백 (괄호제거 ➡️ 주소검색 ➡️ 키워드 ➡️ 절사) 연산`

    <details>
    <summary>🔽 🌍 [Geocoding] 상차지 변환: '경기 광주시 경안동 167-1 경안천 체육공원' -&gt; X:127.252889947198, Y:37.4...</summary>

    ```json
    🌍 [Geocoding] 상차지 변환: '경기 광주시 경안동 167-1 경안천 체육공원' -> X:127.252889947198, Y:37.4100225848715
    ```

    </details>
- `[ROADMAP 20:34:08.122] [🖥️관제웹] [관제대시보드] 🟡 [웹 수신] order-detail-received | ID: e9f04a11 | 경기 광주시 경안동 167-1 경안천`
- `[ROADMAP 20:34:08.122] [🖥️관제웹] [관제대시보드] PinnedRoute 컴포넌트에 '상하차지 및 적요' 텍스트를 선출력하여 렌더링`

    <details>
    <summary>🔽 🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.</summary>

    ```json
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    ```

    </details>
- `[ROADMAP 20:34:08.486] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 0항목 적재 중 [화면: DETAIL_CONFIRMED]`
- `🚦 [ROADMAP 20:34:08.700] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap request] ⏱️ 타이머 생존신고 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 2026-05-05 20:34:08.703 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:34:08.703 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=DETAIL_CONFIRMED, holding=true, 콜=0건
    ```

    </details>
- `🚦 [ROADMAP 20:34:08.721] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSha...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSharedMode=true, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[서울 광진구, 서울 광진, 서울 중랑구, 서울 중랑, 서울 강북구, 서울 강북, 서울 도봉구, 서울 도봉, 서울 노원구, 서울 노원, 서울 은평구, 서울 은평, 서울 송파구, 서울 송파, 서울 강동구, 서울 강동, 성남시 중원구, 성남시 중원, 의정부시, 의정부, 고양시 덕양구, 고양시 덕양, 고양시 일산동구, 고양시 일산동, 고양시 일산서구, 고양시 일산서, 구리시, 구리, 남양주시, 남양주, 하남시, 하남, 파주시, 파주, 광주시, 광주, 경기 광주, 경기 광주시, 경광주, 양주시, 양주], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 20:34:09.502] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 0항목 적재 중 [화면: DETAIL_CONFIRMED]`
- `[ROADMAP 20:34:09.658] [☁️서버] 경로 폴리라인 및 최종 수익성(콜/꿀/똥) 라벨링 연산`
- `[ROADMAP 20:34:09.659] [☁️서버] 관제탑에게 최종 판독된 오더 정보(order-evaluated) 전달`
- `[ROADMAP 20:34:09.661] [🖥️관제웹] [관제대시보드] 🔵 [웹 수신] order-evaluated | ID: e9f04a11 | +10.8km, +24분 '꿀'`
- `[ROADMAP 20:34:09.661] [🖥️관제웹] [관제대시보드] 추천 결과 노출, 경로보기버튼 추가 노출 후 판단 (취소 or 닫기) 대기`
- `[ROADMAP 20:34:09.661] [🖥️관제웹] [관제대시보드] PinnedRoute 내 캔버스 미니맵 좌표 포커싱 및 카카오 궤적(폴리라인) 드로잉 처리`
- `[ROADMAP 20:34:09.661] [🖥️관제웹] [관제대시보드] 예상 시간/수익률을 컴포넌트에 표시하고 결재버튼(KEEP/CANCEL) 즉시 딤드 해제(활성화)`
- `🚦 [ROADMAP 20:34:09.711] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap request] ⏱️ 타이머 생존신고 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 2026-05-05 20:34:09.712 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:34:09.712 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=DETAIL_CONFIRMED, holding=true, 콜=0건
    ```

    </details>
- `🚦 [ROADMAP 20:34:09.720] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSha...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSharedMode=true, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[서울 광진구, 서울 광진, 서울 중랑구, 서울 중랑, 서울 강북구, 서울 강북, 서울 도봉구, 서울 도봉, 서울 노원구, 서울 노원, 서울 은평구, 서울 은평, 서울 송파구, 서울 송파, 서울 강동구, 서울 강동, 성남시 중원구, 성남시 중원, 의정부시, 의정부, 고양시 덕양구, 고양시 덕양, 고양시 일산동구, 고양시 일산동, 고양시 일산서구, 고양시 일산서, 구리시, 구리, 남양주시, 남양주, 하남시, 하남, 파주시, 파주, 광주시, 광주, 경기 광주, 경기 광주시, 경광주, 양주시, 양주], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 20:34:10.506] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 0항목 적재 중 [화면: DETAIL_CONFIRMED]`
- `🚦 [ROADMAP 20:34:10.720] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap request] ⏱️ 타이머 생존신고 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 2026-05-05 20:34:10.721 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:34:10.721 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=DETAIL_CONFIRMED, holding=true, 콜=0건
    ```

    </details>
- `🚦 [ROADMAP 20:34:10.728] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSha...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSharedMode=true, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[서울 광진구, 서울 광진, 서울 중랑구, 서울 중랑, 서울 강북구, 서울 강북, 서울 도봉구, 서울 도봉, 서울 노원구, 서울 노원, 서울 은평구, 서울 은평, 서울 송파구, 서울 송파, 서울 강동구, 서울 강동, 성남시 중원구, 성남시 중원, 의정부시, 의정부, 고양시 덕양구, 고양시 덕양, 고양시 일산동구, 고양시 일산동, 고양시 일산서구, 고양시 일산서, 구리시, 구리, 남양주시, 남양주, 하남시, 하남, 파주시, 파주, 광주시, 광주, 경기 광주, 경기 광주시, 경광주, 양주시, 양주], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 20:34:11.516] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 0항목 적재 중 [화면: DETAIL_CONFIRMED]`
- `🚦 [ROADMAP 20:34:11.724] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap request] ⏱️ 타이머 생존신고 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 2026-05-05 20:34:11.724 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:34:11.724 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=DETAIL_CONFIRMED, holding=true, 콜=0건
    ```

    </details>
- `🚦 [ROADMAP 20:34:11.733] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSha...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSharedMode=true, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[서울 광진구, 서울 광진, 서울 중랑구, 서울 중랑, 서울 강북구, 서울 강북, 서울 도봉구, 서울 도봉, 서울 노원구, 서울 노원, 서울 은평구, 서울 은평, 서울 송파구, 서울 송파, 서울 강동구, 서울 강동, 성남시 중원구, 성남시 중원, 의정부시, 의정부, 고양시 덕양구, 고양시 덕양, 고양시 일산동구, 고양시 일산동, 고양시 일산서구, 고양시 일산서, 구리시, 구리, 남양주시, 남양주, 하남시, 하남, 파주시, 파주, 광주시, 광주, 경기 광주, 경기 광주시, 경광주, 양주시, 양주], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `🚦 [ROADMAP 20:34:11.740] [📱앱] [DETAIL_CONFIRMED] 🛡️ 관제탑 판결 수신 (Action: KEEP) → '닫기' 버튼 클릭 집행 개시`
- `🚦 [ROADMAP 20:34:11.740] [📱앱] [SESSION] 🔄 세션 및 사냥 상태 완전 초기화 (새로운 타겟 대기)`

### 🟢 [STEP 2] 첫짐 1차 선점 (단독콜 사냥)
*(시작 기준 시간: 20:34:11.944)*

- `🚦 [ROADMAP 20:34:11.944] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 2026-05-05 20:34:11.945 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:34:11.945 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=DETAIL_CONFIRMED, holding=false, 콜=0건
    ```

    </details>
- `🚦 [ROADMAP 20:34:11.959] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSha...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSharedMode=true, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[서울 광진구, 서울 광진, 서울 중랑구, 서울 중랑, 서울 강북구, 서울 강북, 서울 도봉구, 서울 도봉, 서울 노원구, 서울 노원, 서울 은평구, 서울 은평, 서울 송파구, 서울 송파, 서울 강동구, 서울 강동, 성남시 중원구, 성남시 중원, 의정부시, 의정부, 고양시 덕양구, 고양시 덕양, 고양시 일산동구, 고양시 일산동, 고양시 일산서구, 고양시 일산서, 구리시, 구리, 남양주시, 남양주, 하남시, 하남, 파주시, 파주, 광주시, 광주, 경기 광주, 경기 광주시, 경광주, 양주시, 양주], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `🚦 [ROADMAP 20:34:12.273] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 20:34:12.277] [📱앱] [DETAIL_CONFIRMED] ✅ 판결 KEEP 집행 완료 → [Current Page: LIST] 복귀, 락 해제, 합짐 사냥 루프 회귀`
- `🚦 [ROADMAP 20:34:12.334] [📱앱] 버튼 터치 완료 (가로채기 성공) X:122.0, Y:2251.0`
- `[ROADMAP 20:34:12.420] [🖥️관제웹] PinnedRoute에서 KEEP(유지 확정) 버튼 클릭`
- `[ROADMAP 20:34:12.420] [🖥️관제웹] 서버에게 decision=KEEP 하달 정보 전달`

### 🟢 [STEP 6] 관제탑 결재 (취소 vs 유지)
*(시작 기준 시간: 20:34:12.420)*

- `[ROADMAP 20:34:12.420] [🖥️관제웹] [관제대시보드] [Socket] 유지 전달`

    <details>
    <summary>🔽 🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.</summary>

    ```json
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    ```

    </details>
- `[ROADMAP 20:34:12.423] [☁️서버] 앱폰에게 Action=Keep 최종 판결 Piggyback 등록`

    <details>
    <summary>🔽 📦 [Piggyback V2] 관제탑 판결(KEEP)을 큐에 기록. 다음 텔레메트리에 태워 보냅니다. (orderId: e9f04a11-88b...</summary>

    ```json
    📦 [Piggyback V2] 관제탑 판결(KEEP)을 큐에 기록. 다음 텔레메트리에 태워 보냅니다. (orderId: e9f04a11-88bd-466e-ba58-7e18c767e58e)
    ```

    </details>
- `[ROADMAP 20:34:12.423] [☁️서버] 관제탑으로 부터 Keep 결재 요청 받음`
- `[ROADMAP 20:34:12.423] [☁️서버] 해당 콜을 '내 퀵(myOrders)' 배열에 추가 및 병합 궤적 생성 연산`
- `[ROADMAP 20:34:12.520] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 0항목 적재 중 [화면: DETAIL_CONFIRMED]`

    <details>
    <summary>🔽 📦 [Piggyback V2] 텔레메트리 편에 결재(KEEP)를 태워 보냅니다! (orderId: e9f04a11-88bd-466e-ba58-...</summary>

    ```json
    📦 [Piggyback V2] 텔레메트리 편에 결재(KEEP)를 태워 보냅니다! (orderId: e9f04a11-88bd-466e-ba58-7e18c767e58e)
    ```

    </details>

### 🟢 [STEP 2] 첫짐 1차 선점 (단독콜 사냥)
*(시작 기준 시간: 20:34:12.577)*

- `🚦 [ROADMAP 20:34:12.577] [📱앱] [LIST] 📡 화면 변경 감지 | 화면: LIST | 모드: AUTO`
- `🚦 [ROADMAP 20:34:12.578] [📱앱] [SESSION] 🔄 세션 및 사냥 상태 완전 초기화 (새로운 타겟 대기)`
- `[ROADMAP 20:34:12.741] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 0항목 적재 중 [화면: DETAIL_CONFIRMED]`
- `🚦 [ROADMAP 20:34:12.888] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 2026-05-05 20:34:12.888 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:34:12.888 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=LIST, holding=false, 콜=1건
    ```

    </details>
- `🚦 [ROADMAP 20:34:12.898] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSha...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSharedMode=true, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[서울 광진구, 서울 광진, 서울 중랑구, 서울 중랑, 서울 강북구, 서울 강북, 서울 도봉구, 서울 도봉, 서울 노원구, 서울 노원, 서울 은평구, 서울 은평, 서울 송파구, 서울 송파, 서울 강동구, 서울 강동, 성남시 중원구, 성남시 중원, 의정부시, 의정부, 고양시 덕양구, 고양시 덕양, 고양시 일산동구, 고양시 일산동, 고양시 일산서구, 고양시 일산서, 구리시, 구리, 남양주시, 남양주, 하남시, 하남, 파주시, 파주, 광주시, 광주, 경기 광주, 경기 광주시, 경광주, 양주시, 양주], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 20:34:13.684] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 1항목 적재 중 [화면: LIST]`
- `[ROADMAP 20:34:14.642] [☁️서버] [FilterManager] 필터 변경 발생! (실시간 변경(activeFilter))`

    <details>
    <summary>🔽 {</summary>

    ```json
    {
      "destinationCity": "파주",
      "destinationRadiusKm": 5,
      "corridorRadiusKm": 5,
      "minFare": 20000,
      "maxFare": 1000000,
      "pickupRadiusKm": 10,
      "excludedKeywords": [],
      "isActive": false,
      "isSharedMode": true,
      "driverAction": "WAITING",
      "dispatchPhase": "GATHERING",
      "destinationKeywords": ["가능동","갈매동","갈현동","감북동","감이동","감일동","강일동","검산동","경안동","고덕동","고산동","고양동","공릉동","관산동","광암동","광장동","광탄면","교문동","교산동","교하동","금곡동","금릉동","금오동","금촌동","길동","남종면","남한산성면","내곡동","내유동","녹양동","다산동","다율동","당정동","당하동","대자동","대장동","대화동","덕이동","덕풍동","도내동","도농동","도봉동","동산동","동패동","둔촌동","마두동","마천동","망우동","망월동","매산동","맥금동","면목동","명일동","목동","목동동","목현동","묵동","문봉동","문산읍","미사동","방이동","방학동","배알미동","백석동","백석읍","벽제동","별내동","별내면","북한동","사노동","사리현동","산곡동","산황동","삼동","삼송동","삼패동","상계동","상봉동","상사창동","상산곡동","상일동","상지석동","선동","선유동","설문동","성내동","성사동","성석동","송정동","송촌동","수석동","수택동","식사동","신곡동","신내동","신원동","신장동","신촌동","쌍령동","쌍문동","아동동","아천동","암사동","야당동","야동동","양벌동","어둔동","역동","연다산동","오금동","오도동","와동동","와부읍","용두동","용현동","우이동","원당동","원흥동","월계동","월롱면","의정부동","이패동","인창동","일산동","일패동","장단면","장암동","장지동","장흥면","정발산동","조리읍","조안면","주교동","주엽동","중계동","중곡동","중대동","중산동","중화동","지금동","지영동","지축동","직동","진건읍","진관동","진접읍","창동","창우동","천현동","천호동","초월읍","초이동","초일동","추자동","춘궁동","탄벌동","탄현동","탄현면","태전동","토당동","토평동","퇴계원읍","퇴촌면","파주읍","풍동","풍산동","하계동","하사창동","하산곡동","하성면","하지석동","항동","행신동","호원동","화정동","회덕동","효자동"],
      "destinationGroups": {"서울 광진구":["광장동","중곡동"],"서울 중랑구":["망우동","면목동","묵동","상봉동","신내동","중화동"],"서울 강북구":["우이동"],"서울 도봉구":["도봉동","방학동","쌍문동","창동"],"서울 노원구":["공릉동","상계동","월계동","중계동","하계동"],"서울 은평구":["갈현동","진관동"],"서울 송파구":["마천동","방이동"],"서울 강동구":["강일동","고덕동","길동","둔촌동","명일동","상일동","성내동","암사동","천호동"],"성남시 중원구":["갈현동"],"의정부시":["가능동","고산동","금오동","녹양동","산곡동","신곡동","용현동","의정부동","장암동","호원동"],"고양시 덕양구":["고양동","관산동","내곡동","내유동","대자동","대장동","도내동","동산동","벽제동","북한동","삼송동","선유동","성사동","신원동","오금동","용두동","원당동","원흥동","주교동","지축동","토당동","행신동","화정동","효자동"],"고양시 일산동구":["마두동","문봉동","백석동","사리현동","산황동","설문동","성석동","식사동","정발산동","중산동","지영동","풍동"],"고양시 일산서구":["대화동","덕이동","일산동","주엽동","탄현동"],"구리시":["갈매동","교문동","사노동","수택동","아천동","인창동","토평동"],"남양주시":["금곡동","다산동","도농동","별내동","별내면","삼패동","수석동","와부읍","이패동","일패동","조안면","지금동","진건읍","진접읍","퇴계원읍"],"하남시":["감북동","감이동","감일동","광암동","교산동","당정동","덕풍동","망월동","미사동","배알미동","상사창동","상산곡동","선동","신장동","창우동","천현동","초이동","초일동","춘궁동","풍산동","하사창동","하산곡동","항동"],"파주시":["검산동","광탄면","교하동","금릉동","금촌동","다율동","당하동","동패동","맥금동","목동동","문산읍","상지석동","송촌동","신촌동","아동동","야당동","야동동","연다산동","오도동","와동동","월롱면","장단면","조리읍","탄현면","파주읍","하지석동"],"광주시":["경안동","고산동","남종면","남한산성면","매산동","목동","목현동","삼동","송정동","쌍령동","양벌동","역동","장지동","중대동","직동","초월읍","추자동","탄벌동","태전동","퇴촌면","회덕동"],"양주시":["백석읍","어둔동","장흥면"],"김포시":["하성면"]},
      "allowedVehicleTypes": ["오토바이","다마스","라보","승용차","1t"],
      "userOverrides": true,
      "customCityFilters": ["서울 광진구","서울 광진","서울 중랑구","서울 중랑","서울 강북구","서울 강북","서울 도봉구","서울 도봉","서울 노원구","서울 노원","서울 은평구","서울 은평","서울 송파구","서울 송파","서울 강동구","서울 강동","성남시 중원구","성남시 중원","의정부시","의정부","고양시 덕양구","고양시 덕양","고양시 일산동구","고양시 일산동","고양시 일산서구","고양시 일산서","구리시","구리","남양주시","남양주","하남시","하남","파주시","파주","광주시","광주","경기 광주","경기 광주시","경광주","양주시","양주","김포시","김포"],
    }
    ```

    </details>
- `[ROADMAP 20:34:14.644] [☁️서버] 관제탑에게 확정되었음(order-confirmed) 정보 전달`
- `[ROADMAP 20:34:14.644] [☁️서버] 합짐을 위한 반경/목적지 추천 키워드로 다이나믹 필터 생성 연산`
- `[ROADMAP 20:34:14.644] [☁️서버] [FilterManager] 필터 변경 발생! (실시간 변경(activeFilter))`

    <details>
    <summary>🔽 {</summary>

    ```json
    {
      "destinationCity": "파주",
      "destinationRadiusKm": 5,
      "corridorRadiusKm": 5,
      "minFare": 20000,
      "maxFare": 1000000,
      "pickupRadiusKm": 10,
      "excludedKeywords": [],
      "isActive": true,
      "isSharedMode": true,
      "driverAction": "WAITING",
      "dispatchPhase": "GATHERING",
      "destinationKeywords": ["가능동","갈매동","갈현동","감북동","감이동","감일동","강일동","검산동","경안동","고덕동","고산동","고양동","공릉동","관산동","광암동","광장동","광탄면","교문동","교산동","교하동","금곡동","금릉동","금오동","금촌동","길동","남종면","남한산성면","내곡동","내유동","녹양동","다산동","다율동","당정동","당하동","대자동","대장동","대화동","덕이동","덕풍동","도내동","도농동","도봉동","동산동","동패동","둔촌동","마두동","마천동","망우동","망월동","매산동","맥금동","면목동","명일동","목동","목동동","목현동","묵동","문봉동","문산읍","미사동","방이동","방학동","배알미동","백석동","백석읍","벽제동","별내동","별내면","북한동","사노동","사리현동","산곡동","산황동","삼동","삼송동","삼패동","상계동","상봉동","상사창동","상산곡동","상일동","상지석동","선동","선유동","설문동","성내동","성사동","성석동","송정동","송촌동","수석동","수택동","식사동","신곡동","신내동","신원동","신장동","신촌동","쌍령동","쌍문동","아동동","아천동","암사동","야당동","야동동","양벌동","어둔동","역동","연다산동","오금동","오도동","와동동","와부읍","용두동","용현동","우이동","원당동","원흥동","월계동","월롱면","의정부동","이패동","인창동","일산동","일패동","장단면","장암동","장지동","장흥면","정발산동","조리읍","조안면","주교동","주엽동","중계동","중곡동","중대동","중산동","중화동","지금동","지영동","지축동","직동","진건읍","진관동","진접읍","창동","창우동","천현동","천호동","초월읍","초이동","초일동","추자동","춘궁동","탄벌동","탄현동","탄현면","태전동","토당동","토평동","퇴계원읍","퇴촌면","파주읍","풍동","풍산동","하계동","하사창동","하산곡동","하성면","하지석동","항동","행신동","호원동","화정동","회덕동","효자동"],
      "destinationGroups": {"서울 광진구":["광장동","중곡동"],"서울 중랑구":["망우동","면목동","묵동","상봉동","신내동","중화동"],"서울 강북구":["우이동"],"서울 도봉구":["도봉동","방학동","쌍문동","창동"],"서울 노원구":["공릉동","상계동","월계동","중계동","하계동"],"서울 은평구":["갈현동","진관동"],"서울 송파구":["마천동","방이동"],"서울 강동구":["강일동","고덕동","길동","둔촌동","명일동","상일동","성내동","암사동","천호동"],"성남시 중원구":["갈현동"],"의정부시":["가능동","고산동","금오동","녹양동","산곡동","신곡동","용현동","의정부동","장암동","호원동"],"고양시 덕양구":["고양동","관산동","내곡동","내유동","대자동","대장동","도내동","동산동","벽제동","북한동","삼송동","선유동","성사동","신원동","오금동","용두동","원당동","원흥동","주교동","지축동","토당동","행신동","화정동","효자동"],"고양시 일산동구":["마두동","문봉동","백석동","사리현동","산황동","설문동","성석동","식사동","정발산동","중산동","지영동","풍동"],"고양시 일산서구":["대화동","덕이동","일산동","주엽동","탄현동"],"구리시":["갈매동","교문동","사노동","수택동","아천동","인창동","토평동"],"남양주시":["금곡동","다산동","도농동","별내동","별내면","삼패동","수석동","와부읍","이패동","일패동","조안면","지금동","진건읍","진접읍","퇴계원읍"],"하남시":["감북동","감이동","감일동","광암동","교산동","당정동","덕풍동","망월동","미사동","배알미동","상사창동","상산곡동","선동","신장동","창우동","천현동","초이동","초일동","춘궁동","풍산동","하사창동","하산곡동","항동"],"파주시":["검산동","광탄면","교하동","금릉동","금촌동","다율동","당하동","동패동","맥금동","목동동","문산읍","상지석동","송촌동","신촌동","아동동","야당동","야동동","연다산동","오도동","와동동","월롱면","장단면","조리읍","탄현면","파주읍","하지석동"],"광주시":["경안동","고산동","남종면","남한산성면","매산동","목동","목현동","삼동","송정동","쌍령동","양벌동","역동","장지동","중대동","직동","초월읍","추자동","탄벌동","태전동","퇴촌면","회덕동"],"양주시":["백석읍","어둔동","장흥면"],"김포시":["하성면"]},
      "allowedVehicleTypes": ["오토바이","다마스"],
      "userOverrides": true,
      "customCityFilters": ["서울 광진구","서울 광진","서울 중랑구","서울 중랑","서울 강북구","서울 강북","서울 도봉구","서울 도봉","서울 노원구","서울 노원","서울 은평구","서울 은평","서울 송파구","서울 송파","서울 강동구","서울 강동","성남시 중원구","성남시 중원","의정부시","의정부","고양시 덕양구","고양시 덕양","고양시 일산동구","고양시 일산동","고양시 일산서구","고양시 일산서","구리시","구리","남양주시","남양주","하남시","하남","파주시","파주","광주시","광주","경기 광주","경기 광주시","경광주","양주시","양주","김포시","김포"],
    }
    ```

    </details>
- `[ROADMAP 20:34:14.644] [☁️서버] 새로 부여된 합짐 필터(isSharedMode)값 메모리 세션 갱신`
- `[ROADMAP 20:34:14.644] [☁️서버] 앱폰 및 관제탑에게 새로운 타겟팅 필터(filter-updated) 정보 전달`
- `[ROADMAP 20:34:14.644] [🖥️관제웹] 서버로 부터 filter-updated 소켓 이벤트 받음`
- `[ROADMAP 20:34:14.645] [🖥️관제웹] 서버로 부터 filter-updated 소켓 이벤트 받음`
- `[ROADMAP 20:34:14.659] [🖥️관제웹] [관제대시보드] PinnedRoute 레이아웃을 합짐/무한 궤도 모드로 격상 렌더링 및 딤드 다시 처리`
- `[ROADMAP 20:34:14.678] [🖥️관제웹] 서버로 부터 filter-updated 소켓 이벤트 받음`

    <details>
    <summary>🔽 🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.</summary>

    ```json
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    ```

    </details>
- `🚦 [ROADMAP 20:34:15.945] [📱앱] [LIST] 📡 화면 변경 감지 | 화면: LIST | 모드: AUTO`
- `🚦 [ROADMAP 20:34:15.946] [📱앱] [SESSION] 🔄 세션 및 사냥 상태 완전 초기화 (새로운 타겟 대기)`
- `🚦 [ROADMAP 20:34:16.255] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 2026-05-05 20:34:16.256 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:34:16.256 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=LIST, holding=false, 콜=1건
    ```

    </details>
- `🚦 [ROADMAP 20:34:16.279] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    FilterConfig(allowedVehicleTypes=[오토바이, 다마스], isActive=true, isSharedMode=true, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가능동, 갈매동, 갈현동, 감북동, 감이동, 감일동, 강일동, 검산동, 경안동, 고덕동, 고산동, 고양동, 공릉동, 관산동, 광암동, 광장동, 광탄면, 교문동, 교산동, 교하동, 금곡동, 금릉동, 금오동, 금촌동, 길동, 남종면, 남한산성면, 내곡동, 내유동, 녹양동, 다산동, 다율동, 당정동, 당하동, 대자동, 대장동, 대화동, 덕이동, 덕풍동, 도내동, 도농동, 도봉동, 동산동, 동패동, 둔촌동, 마두동, 마천동, 망우동, 망월동, 매산동, 맥금동, 면목동, 명일동, 목동, 목동동, 목현동, 묵동, 문봉동, 문산읍, 미사동, 방이동, 방학동, 배알미동, 백석동, 백석읍, 벽제동, 별내동, 별내면, 북한동, 사노동, 사리현동, 산곡동, 산황동, 삼동, 삼송동, 삼패동, 상계동, 상봉동, 상사창동, 상산곡동, 상일동, 상지석동, 선동, 선유동, 설문동, 성내동, 성사동, 성석동, 송정동, 송촌동, 수석동, 수택동, 식사동, 신곡동, 신내동, 신원동, 신장동, 신촌동, 쌍령동, 쌍문동, 아동동, 아천동, 암사동, 야당동, 야동동, 양벌동, 어둔동, 역동, 연다산동, 오금동, 오도동, 와동동, 와부읍, 용두동, 용현동, 우이동, 원당동, 원흥동, 월계동, 월롱면, 의정부동, 이패동, 인창동, 일산동, 일패동, 장단면, 장암동, 장지동, 장흥면, 정발산동, 조리읍, 조안면, 주교동, 주엽동, 중계동, 중곡동, 중대동, 중산동, 중화동, 지금동, 지영동, 지축동, 직동, 진건읍, 진관동, 진접읍, 창동, 창우동, 천현동, 천호동, 초월읍, 초이동, 초일동, 추자동, 춘궁동, 탄벌동, 탄현동, 탄현면, 태전동, 토당동, 토평동, 퇴계원읍, 퇴촌면, 파주읍, 풍동, 풍산동, 하계동, 하사창동, 하산곡동, 하성면, 하지석동, 항동, 행신동, 호원동, 화정동, 회덕동, 효자동], customCityFilters=[서울 광진구, 서울 광진, 서울 중랑구, 서울 중랑, 서울 강북구, 서울 강북, 서울 도봉구, 서울 도봉, 서울 노원구, 서울 노원, 서울 은평구, 서울 은평, 서울 송파구, 서울 송파, 서울 강동구, 서울 강동, 성남시 중원구, 성남시 중원, 의정부시, 의정부, 고양시 덕양구, 고양시 덕양, 고양시 일산동구, 고양시 일산동, 고양시 일산서구, 고양시 일산서, 구리시, 구리, 남양주시, 남양주, 하남시, 하남, 파주시, 파주, 광주시, 광주, 경기 광주, 경기 광주시, 경광주, 양주시, 양주, 김포시, 김포], destinationGroups={서울 광진구=[광장동, 중곡동], 서울 중랑구=[망우동, 면목동, 묵동, 상봉동, 신내동, 중화동], 서울 강북구=[우이동], 서울 도봉구=[도봉동, 방학동, 쌍문동, 창동], 서울 노원구=[공릉동, 상계동, 월계동, 중계동, 하계동], 서울 은평구=[갈현동, 진관동], 서울 송파구=[마천동, 방이동], 서울 강동구=[강일동, 고덕동, 길동, 둔촌동, 명일동, 상일동, 성내동, 암사동, 천호동], 성남시 중원구=[갈현동], 의정부시=[가능동, 고산동, 금오동, 녹양동, 산곡동, 신곡동, 용현동, 의정부동, 장암동, 호원동], 고양시 덕양구=[고양동, 관산동, 내곡동, 내유동, 대자동, 대장동, 도내동, 동산동, 벽제동, 북한동, 삼송동, 선유동, 성사동, 신원동, 오금동, 용두동, 원당동, 원흥동, 주교동, 지축동, 토당동, 행신동, 화정동, 효자동], 고양시 일산동구=[마두동, 문봉동, 백석동, 사리현동, 산황동, 설문동, 성석동, 식사동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[대화동, 덕이동, 일산동, 주엽동, 탄현동], 구리시=[?
    ```

    </details>
- `[ROADMAP 20:34:17.061] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 1항목 적재 중 [화면: LIST]`
- `🚦 [ROADMAP 20:34:20.964] [📱앱] [LIST] 📡 화면 변경 감지 | 화면: LIST | 모드: AUTO`
- `🚦 [ROADMAP 20:34:20.964] [📱앱] [SESSION] 🔄 세션 및 사냥 상태 완전 초기화 (새로운 타겟 대기)`
- `🚦 [ROADMAP 20:34:20.967] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(1t)=❌ 도착지(177중 서대문구)=❌ 요금(20000 <= 60000)=✅ 상차지/거리(합짐무시 >= 1.9km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 20:34:21.270] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 2026-05-05 20:34:21.271 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:34:21.271 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=LIST, holding=false, 콜=1건
    ```

    </details>
- `🚦 [ROADMAP 20:34:21.295] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    FilterConfig(allowedVehicleTypes=[오토바이, 다마스], isActive=true, isSharedMode=true, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가능동, 갈매동, 갈현동, 감북동, 감이동, 감일동, 강일동, 검산동, 경안동, 고덕동, 고산동, 고양동, 공릉동, 관산동, 광암동, 광장동, 광탄면, 교문동, 교산동, 교하동, 금곡동, 금릉동, 금오동, 금촌동, 길동, 남종면, 남한산성면, 내곡동, 내유동, 녹양동, 다산동, 다율동, 당정동, 당하동, 대자동, 대장동, 대화동, 덕이동, 덕풍동, 도내동, 도농동, 도봉동, 동산동, 동패동, 둔촌동, 마두동, 마천동, 망우동, 망월동, 매산동, 맥금동, 면목동, 명일동, 목동, 목동동, 목현동, 묵동, 문봉동, 문산읍, 미사동, 방이동, 방학동, 배알미동, 백석동, 백석읍, 벽제동, 별내동, 별내면, 북한동, 사노동, 사리현동, 산곡동, 산황동, 삼동, 삼송동, 삼패동, 상계동, 상봉동, 상사창동, 상산곡동, 상일동, 상지석동, 선동, 선유동, 설문동, 성내동, 성사동, 성석동, 송정동, 송촌동, 수석동, 수택동, 식사동, 신곡동, 신내동, 신원동, 신장동, 신촌동, 쌍령동, 쌍문동, 아동동, 아천동, 암사동, 야당동, 야동동, 양벌동, 어둔동, 역동, 연다산동, 오금동, 오도동, 와동동, 와부읍, 용두동, 용현동, 우이동, 원당동, 원흥동, 월계동, 월롱면, 의정부동, 이패동, 인창동, 일산동, 일패동, 장단면, 장암동, 장지동, 장흥면, 정발산동, 조리읍, 조안면, 주교동, 주엽동, 중계동, 중곡동, 중대동, 중산동, 중화동, 지금동, 지영동, 지축동, 직동, 진건읍, 진관동, 진접읍, 창동, 창우동, 천현동, 천호동, 초월읍, 초이동, 초일동, 추자동, 춘궁동, 탄벌동, 탄현동, 탄현면, 태전동, 토당동, 토평동, 퇴계원읍, 퇴촌면, 파주읍, 풍동, 풍산동, 하계동, 하사창동, 하산곡동, 하성면, 하지석동, 항동, 행신동, 호원동, 화정동, 회덕동, 효자동], customCityFilters=[서울 광진구, 서울 광진, 서울 중랑구, 서울 중랑, 서울 강북구, 서울 강북, 서울 도봉구, 서울 도봉, 서울 노원구, 서울 노원, 서울 은평구, 서울 은평, 서울 송파구, 서울 송파, 서울 강동구, 서울 강동, 성남시 중원구, 성남시 중원, 의정부시, 의정부, 고양시 덕양구, 고양시 덕양, 고양시 일산동구, 고양시 일산동, 고양시 일산서구, 고양시 일산서, 구리시, 구리, 남양주시, 남양주, 하남시, 하남, 파주시, 파주, 광주시, 광주, 경기 광주, 경기 광주시, 경광주, 양주시, 양주, 김포시, 김포], destinationGroups={서울 광진구=[광장동, 중곡동], 서울 중랑구=[망우동, 면목동, 묵동, 상봉동, 신내동, 중화동], 서울 강북구=[우이동], 서울 도봉구=[도봉동, 방학동, 쌍문동, 창동], 서울 노원구=[공릉동, 상계동, 월계동, 중계동, 하계동], 서울 은평구=[갈현동, 진관동], 서울 송파구=[마천동, 방이동], 서울 강동구=[강일동, 고덕동, 길동, 둔촌동, 명일동, 상일동, 성내동, 암사동, 천호동], 성남시 중원구=[갈현동], 의정부시=[가능동, 고산동, 금오동, 녹양동, 산곡동, 신곡동, 용현동, 의정부동, 장암동, 호원동], 고양시 덕양구=[고양동, 관산동, 내곡동, 내유동, 대자동, 대장동, 도내동, 동산동, 벽제동, 북한동, 삼송동, 선유동, 성사동, 신원동, 오금동, 용두동, 원당동, 원흥동, 주교동, 지축동, 토당동, 행신동, 화정동, 효자동], 고양시 일산동구=[마두동, 문봉동, 백석동, 사리현동, 산황동, 설문동, 성석동, 식사동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[대화동, 덕이동, 일산동, 주엽동, 탄현동], 구리시=[?
    ```

    </details>
- `[ROADMAP 20:34:22.072] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 1항목 적재 중 [화면: LIST]`
- `🚦 [ROADMAP 20:34:25.953] [📱앱] [LIST] 📡 화면 변경 감지 | 화면: LIST | 모드: AUTO`
- `🚦 [ROADMAP 20:34:25.954] [📱앱] [SESSION] 🔄 세션 및 사냥 상태 완전 초기화 (새로운 타겟 대기)`
- `🚦 [ROADMAP 20:34:25.961] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(다)=✅ 도착지(177중 은평구)=❌ 요금(20000 <= 81000)=✅ 상차지/거리(합짐무시 >= 13.6km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 20:34:26.267] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 2026-05-05 20:34:26.269 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:34:26.269 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=LIST, holding=false, 콜=1건
    ```

    </details>
- `🚦 [ROADMAP 20:34:26.285] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    FilterConfig(allowedVehicleTypes=[오토바이, 다마스], isActive=true, isSharedMode=true, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가능동, 갈매동, 갈현동, 감북동, 감이동, 감일동, 강일동, 검산동, 경안동, 고덕동, 고산동, 고양동, 공릉동, 관산동, 광암동, 광장동, 광탄면, 교문동, 교산동, 교하동, 금곡동, 금릉동, 금오동, 금촌동, 길동, 남종면, 남한산성면, 내곡동, 내유동, 녹양동, 다산동, 다율동, 당정동, 당하동, 대자동, 대장동, 대화동, 덕이동, 덕풍동, 도내동, 도농동, 도봉동, 동산동, 동패동, 둔촌동, 마두동, 마천동, 망우동, 망월동, 매산동, 맥금동, 면목동, 명일동, 목동, 목동동, 목현동, 묵동, 문봉동, 문산읍, 미사동, 방이동, 방학동, 배알미동, 백석동, 백석읍, 벽제동, 별내동, 별내면, 북한동, 사노동, 사리현동, 산곡동, 산황동, 삼동, 삼송동, 삼패동, 상계동, 상봉동, 상사창동, 상산곡동, 상일동, 상지석동, 선동, 선유동, 설문동, 성내동, 성사동, 성석동, 송정동, 송촌동, 수석동, 수택동, 식사동, 신곡동, 신내동, 신원동, 신장동, 신촌동, 쌍령동, 쌍문동, 아동동, 아천동, 암사동, 야당동, 야동동, 양벌동, 어둔동, 역동, 연다산동, 오금동, 오도동, 와동동, 와부읍, 용두동, 용현동, 우이동, 원당동, 원흥동, 월계동, 월롱면, 의정부동, 이패동, 인창동, 일산동, 일패동, 장단면, 장암동, 장지동, 장흥면, 정발산동, 조리읍, 조안면, 주교동, 주엽동, 중계동, 중곡동, 중대동, 중산동, 중화동, 지금동, 지영동, 지축동, 직동, 진건읍, 진관동, 진접읍, 창동, 창우동, 천현동, 천호동, 초월읍, 초이동, 초일동, 추자동, 춘궁동, 탄벌동, 탄현동, 탄현면, 태전동, 토당동, 토평동, 퇴계원읍, 퇴촌면, 파주읍, 풍동, 풍산동, 하계동, 하사창동, 하산곡동, 하성면, 하지석동, 항동, 행신동, 호원동, 화정동, 회덕동, 효자동], customCityFilters=[서울 광진구, 서울 광진, 서울 중랑구, 서울 중랑, 서울 강북구, 서울 강북, 서울 도봉구, 서울 도봉, 서울 노원구, 서울 노원, 서울 은평구, 서울 은평, 서울 송파구, 서울 송파, 서울 강동구, 서울 강동, 성남시 중원구, 성남시 중원, 의정부시, 의정부, 고양시 덕양구, 고양시 덕양, 고양시 일산동구, 고양시 일산동, 고양시 일산서구, 고양시 일산서, 구리시, 구리, 남양주시, 남양주, 하남시, 하남, 파주시, 파주, 광주시, 광주, 경기 광주, 경기 광주시, 경광주, 양주시, 양주, 김포시, 김포], destinationGroups={서울 광진구=[광장동, 중곡동], 서울 중랑구=[망우동, 면목동, 묵동, 상봉동, 신내동, 중화동], 서울 강북구=[우이동], 서울 도봉구=[도봉동, 방학동, 쌍문동, 창동], 서울 노원구=[공릉동, 상계동, 월계동, 중계동, 하계동], 서울 은평구=[갈현동, 진관동], 서울 송파구=[마천동, 방이동], 서울 강동구=[강일동, 고덕동, 길동, 둔촌동, 명일동, 상일동, 성내동, 암사동, 천호동], 성남시 중원구=[갈현동], 의정부시=[가능동, 고산동, 금오동, 녹양동, 산곡동, 신곡동, 용현동, 의정부동, 장암동, 호원동], 고양시 덕양구=[고양동, 관산동, 내곡동, 내유동, 대자동, 대장동, 도내동, 동산동, 벽제동, 북한동, 삼송동, 선유동, 성사동, 신원동, 오금동, 용두동, 원당동, 원흥동, 주교동, 지축동, 토당동, 행신동, 화정동, 효자동], 고양시 일산동구=[마두동, 문봉동, 백석동, 사리현동, 산황동, 설문동, 성석동, 식사동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[대화동, 덕이동, 일산동, 주엽동, 탄현동], 구리시=[?
    ```

    </details>
- `[ROADMAP 20:34:27.067] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 1항목 적재 중 [화면: LIST]`
- `🚦 [ROADMAP 20:34:30.978] [📱앱] [LIST] 📡 화면 변경 감지 | 화면: LIST | 모드: AUTO`
- `🚦 [ROADMAP 20:34:30.979] [📱앱] [SESSION] 🔄 세션 및 사냥 상태 완전 초기화 (새로운 타겟 대기)`
- `🚦 [ROADMAP 20:34:30.987] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(다)=✅ 도착지(177중 동탄동)=❌ 요금(20000 <= 57000)=✅ 상차지/거리(합짐무시 >= 5.1km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 20:34:31.297] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 2026-05-05 20:34:31.299 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:34:31.299 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=LIST, holding=false, 콜=1건
    ```

    </details>
- `🚦 [ROADMAP 20:34:31.319] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    FilterConfig(allowedVehicleTypes=[오토바이, 다마스], isActive=true, isSharedMode=true, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가능동, 갈매동, 갈현동, 감북동, 감이동, 감일동, 강일동, 검산동, 경안동, 고덕동, 고산동, 고양동, 공릉동, 관산동, 광암동, 광장동, 광탄면, 교문동, 교산동, 교하동, 금곡동, 금릉동, 금오동, 금촌동, 길동, 남종면, 남한산성면, 내곡동, 내유동, 녹양동, 다산동, 다율동, 당정동, 당하동, 대자동, 대장동, 대화동, 덕이동, 덕풍동, 도내동, 도농동, 도봉동, 동산동, 동패동, 둔촌동, 마두동, 마천동, 망우동, 망월동, 매산동, 맥금동, 면목동, 명일동, 목동, 목동동, 목현동, 묵동, 문봉동, 문산읍, 미사동, 방이동, 방학동, 배알미동, 백석동, 백석읍, 벽제동, 별내동, 별내면, 북한동, 사노동, 사리현동, 산곡동, 산황동, 삼동, 삼송동, 삼패동, 상계동, 상봉동, 상사창동, 상산곡동, 상일동, 상지석동, 선동, 선유동, 설문동, 성내동, 성사동, 성석동, 송정동, 송촌동, 수석동, 수택동, 식사동, 신곡동, 신내동, 신원동, 신장동, 신촌동, 쌍령동, 쌍문동, 아동동, 아천동, 암사동, 야당동, 야동동, 양벌동, 어둔동, 역동, 연다산동, 오금동, 오도동, 와동동, 와부읍, 용두동, 용현동, 우이동, 원당동, 원흥동, 월계동, 월롱면, 의정부동, 이패동, 인창동, 일산동, 일패동, 장단면, 장암동, 장지동, 장흥면, 정발산동, 조리읍, 조안면, 주교동, 주엽동, 중계동, 중곡동, 중대동, 중산동, 중화동, 지금동, 지영동, 지축동, 직동, 진건읍, 진관동, 진접읍, 창동, 창우동, 천현동, 천호동, 초월읍, 초이동, 초일동, 추자동, 춘궁동, 탄벌동, 탄현동, 탄현면, 태전동, 토당동, 토평동, 퇴계원읍, 퇴촌면, 파주읍, 풍동, 풍산동, 하계동, 하사창동, 하산곡동, 하성면, 하지석동, 항동, 행신동, 호원동, 화정동, 회덕동, 효자동], customCityFilters=[서울 광진구, 서울 광진, 서울 중랑구, 서울 중랑, 서울 강북구, 서울 강북, 서울 도봉구, 서울 도봉, 서울 노원구, 서울 노원, 서울 은평구, 서울 은평, 서울 송파구, 서울 송파, 서울 강동구, 서울 강동, 성남시 중원구, 성남시 중원, 의정부시, 의정부, 고양시 덕양구, 고양시 덕양, 고양시 일산동구, 고양시 일산동, 고양시 일산서구, 고양시 일산서, 구리시, 구리, 남양주시, 남양주, 하남시, 하남, 파주시, 파주, 광주시, 광주, 경기 광주, 경기 광주시, 경광주, 양주시, 양주, 김포시, 김포], destinationGroups={서울 광진구=[광장동, 중곡동], 서울 중랑구=[망우동, 면목동, 묵동, 상봉동, 신내동, 중화동], 서울 강북구=[우이동], 서울 도봉구=[도봉동, 방학동, 쌍문동, 창동], 서울 노원구=[공릉동, 상계동, 월계동, 중계동, 하계동], 서울 은평구=[갈현동, 진관동], 서울 송파구=[마천동, 방이동], 서울 강동구=[강일동, 고덕동, 길동, 둔촌동, 명일동, 상일동, 성내동, 암사동, 천호동], 성남시 중원구=[갈현동], 의정부시=[가능동, 고산동, 금오동, 녹양동, 산곡동, 신곡동, 용현동, 의정부동, 장암동, 호원동], 고양시 덕양구=[고양동, 관산동, 내곡동, 내유동, 대자동, 대장동, 도내동, 동산동, 벽제동, 북한동, 삼송동, 선유동, 성사동, 신원동, 오금동, 용두동, 원당동, 원흥동, 주교동, 지축동, 토당동, 행신동, 화정동, 효자동], 고양시 일산동구=[마두동, 문봉동, 백석동, 사리현동, 산황동, 설문동, 성석동, 식사동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[대화동, 덕이동, 일산동, 주엽동, 탄현동], 구리시=[?
    ```

    </details>
- `[ROADMAP 20:34:32.099] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 1항목 적재 중 [화면: LIST]`
- `🚦 [ROADMAP 20:34:35.955] [📱앱] [LIST] 📡 화면 변경 감지 | 화면: LIST | 모드: AUTO`
- `🚦 [ROADMAP 20:34:35.956] [📱앱] [SESSION] 🔄 세션 및 사냥 상태 완전 초기화 (새로운 타겟 대기)`
- `🚦 [ROADMAP 20:34:35.962] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(라)=❌ 도착지(177중 팔달구)=❌ 요금(20000 <= 58000)=✅ 상차지/거리(합짐무시 >= 0.2km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 20:34:36.268] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 2026-05-05 20:34:36.269 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:34:36.269 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=LIST, holding=false, 콜=1건
    ```

    </details>
- `🚦 [ROADMAP 20:34:36.285] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    FilterConfig(allowedVehicleTypes=[오토바이, 다마스], isActive=true, isSharedMode=true, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가능동, 갈매동, 갈현동, 감북동, 감이동, 감일동, 강일동, 검산동, 경안동, 고덕동, 고산동, 고양동, 공릉동, 관산동, 광암동, 광장동, 광탄면, 교문동, 교산동, 교하동, 금곡동, 금릉동, 금오동, 금촌동, 길동, 남종면, 남한산성면, 내곡동, 내유동, 녹양동, 다산동, 다율동, 당정동, 당하동, 대자동, 대장동, 대화동, 덕이동, 덕풍동, 도내동, 도농동, 도봉동, 동산동, 동패동, 둔촌동, 마두동, 마천동, 망우동, 망월동, 매산동, 맥금동, 면목동, 명일동, 목동, 목동동, 목현동, 묵동, 문봉동, 문산읍, 미사동, 방이동, 방학동, 배알미동, 백석동, 백석읍, 벽제동, 별내동, 별내면, 북한동, 사노동, 사리현동, 산곡동, 산황동, 삼동, 삼송동, 삼패동, 상계동, 상봉동, 상사창동, 상산곡동, 상일동, 상지석동, 선동, 선유동, 설문동, 성내동, 성사동, 성석동, 송정동, 송촌동, 수석동, 수택동, 식사동, 신곡동, 신내동, 신원동, 신장동, 신촌동, 쌍령동, 쌍문동, 아동동, 아천동, 암사동, 야당동, 야동동, 양벌동, 어둔동, 역동, 연다산동, 오금동, 오도동, 와동동, 와부읍, 용두동, 용현동, 우이동, 원당동, 원흥동, 월계동, 월롱면, 의정부동, 이패동, 인창동, 일산동, 일패동, 장단면, 장암동, 장지동, 장흥면, 정발산동, 조리읍, 조안면, 주교동, 주엽동, 중계동, 중곡동, 중대동, 중산동, 중화동, 지금동, 지영동, 지축동, 직동, 진건읍, 진관동, 진접읍, 창동, 창우동, 천현동, 천호동, 초월읍, 초이동, 초일동, 추자동, 춘궁동, 탄벌동, 탄현동, 탄현면, 태전동, 토당동, 토평동, 퇴계원읍, 퇴촌면, 파주읍, 풍동, 풍산동, 하계동, 하사창동, 하산곡동, 하성면, 하지석동, 항동, 행신동, 호원동, 화정동, 회덕동, 효자동], customCityFilters=[서울 광진구, 서울 광진, 서울 중랑구, 서울 중랑, 서울 강북구, 서울 강북, 서울 도봉구, 서울 도봉, 서울 노원구, 서울 노원, 서울 은평구, 서울 은평, 서울 송파구, 서울 송파, 서울 강동구, 서울 강동, 성남시 중원구, 성남시 중원, 의정부시, 의정부, 고양시 덕양구, 고양시 덕양, 고양시 일산동구, 고양시 일산동, 고양시 일산서구, 고양시 일산서, 구리시, 구리, 남양주시, 남양주, 하남시, 하남, 파주시, 파주, 광주시, 광주, 경기 광주, 경기 광주시, 경광주, 양주시, 양주, 김포시, 김포], destinationGroups={서울 광진구=[광장동, 중곡동], 서울 중랑구=[망우동, 면목동, 묵동, 상봉동, 신내동, 중화동], 서울 강북구=[우이동], 서울 도봉구=[도봉동, 방학동, 쌍문동, 창동], 서울 노원구=[공릉동, 상계동, 월계동, 중계동, 하계동], 서울 은평구=[갈현동, 진관동], 서울 송파구=[마천동, 방이동], 서울 강동구=[강일동, 고덕동, 길동, 둔촌동, 명일동, 상일동, 성내동, 암사동, 천호동], 성남시 중원구=[갈현동], 의정부시=[가능동, 고산동, 금오동, 녹양동, 산곡동, 신곡동, 용현동, 의정부동, 장암동, 호원동], 고양시 덕양구=[고양동, 관산동, 내곡동, 내유동, 대자동, 대장동, 도내동, 동산동, 벽제동, 북한동, 삼송동, 선유동, 성사동, 신원동, 오금동, 용두동, 원당동, 원흥동, 주교동, 지축동, 토당동, 행신동, 화정동, 효자동], 고양시 일산동구=[마두동, 문봉동, 백석동, 사리현동, 산황동, 설문동, 성석동, 식사동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[대화동, 덕이동, 일산동, 주엽동, 탄현동], 구리시=[?
    ```

    </details>
- `[ROADMAP 20:34:37.069] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 1항목 적재 중 [화면: LIST]`
- `🚦 [ROADMAP 20:34:39.456] [📱앱] [DETAIL_PRE_CONFIRM] 📡 화면 변경 감지 | 화면: DETAIL_PRE_CONFIRM | 모드: AUTO`
- `🚦 [ROADMAP 20:34:39.457] [📱앱] [DETAIL_PRE_CONFIRM] [Current Page: DETAIL_PRE_CONFIRM] 진입 완료`
- `🚦 [ROADMAP 20:34:39.462] [📱앱] [DETAIL_PRE_CONFIRM] 상세페이지 텍스트 추출 및 2차 필터(적요 등) 통과 확인`
- `🚦 [ROADMAP 20:34:39.466] [📱앱] [DETAIL] 🔍 [타겟 콜 필터 결과] 차종(다)=✅ 도착지(177중 신규)=❌ 요금(20000 <= 0)=❌ 상차지/거리(합짐무시 >= 5.1km)=✅ 블랙()=✅`

    <details>
    <summary>🔽 🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용...</summary>

    ```json
    🌐 [post /confirm response / 200] {"success":true,"message":"1차 수신 완료. 상세 페이지 내용을 긁어서 POST /api/orders/detail 로 보내주세요."}
    ```

    </details>
- `🚦 [ROADMAP 20:34:39.476] [📱앱] [HTTP 폴링] 응답 /orders/confirm`
- `🚦 [ROADMAP 20:34:39.675] [📱앱] [DETAIL_PRE_CONFIRM] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 2026-05-05 20:34:39.675 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:34:39.675 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=DETAIL_PRE_CONFIRM, holding=true, 콜=0건
    ```

    </details>
- `[ROADMAP 20:34:40.263] [☁️서버] 앱폰에게 상세 정보 스크래핑을 즉시 진행하라고 응답 전달`
- `[ROADMAP 20:34:40.263] [☁️서버] 콜의 가확정 상태를 메모리에 캐싱 연산`
- `[ROADMAP 20:34:40.264] [☁️서버] 앱폰으로 부터 가로챈 '1차 오더 확정' 요청 받음`
- `[ROADMAP 20:34:40.264] [☁️서버] 관제탑에게 이 콜을 선점했음(order-evaluating) 정보 전달`
- `[ROADMAP 20:34:40.264] [🖥️관제웹] [관제대시보드] 🟢 [웹 수신] order-evaluating | ID: AUTO-1777980879457 | 기기: 앱폰-sdk_gpho-160 | 신규`
- `[ROADMAP 20:34:40.264] [🖥️관제웹] [관제대시보드] 확정페이지 진입 (선빵 수신으로 상세 모드 구동)`
- `[ROADMAP 20:34:40.265] [🖥️관제웹] [관제대시보드] PinnedRoute 컴포넌트에 빈 레이아웃(평가중) 렌더링 및 하단 결재버튼 전체 딤드(비활성) 처리`
- `🚦 [ROADMAP 20:34:40.468] [📱앱] [DETAIL_PRE_CONFIRM] 📡 화면 변경 감지 | 화면: DETAIL_PRE_CONFIRM | 모드: AUTO`
- `🚦 [ROADMAP 20:34:40.547] [📱앱] [DETAIL_PRE_CONFIRM] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSha...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSharedMode=true, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[서울 광진구, 서울 광진, 서울 중랑구, 서울 중랑, 서울 강북구, 서울 강북, 서울 도봉구, 서울 도봉, 서울 노원구, 서울 노원, 서울 은평구, 서울 은평, 서울 송파구, 서울 송파, 서울 강동구, 서울 강동, 성남시 중원구, 성남시 중원, 의정부시, 의정부, 고양시 덕양구, 고양시 덕양, 고양시 일산동구, 고양시 일산동, 고양시 일산서구, 고양시 일산서, 구리시, 구리, 남양주시, 남양주, 하남시, 하남, 파주시, 파주, 광주시, 광주, 경기 광주, 경기 광주시, 경광주, 양주시, 양주, 김포시, 김포], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `🚦 [ROADMAP 20:34:40.677] [📱앱] [DETAIL_PRE_CONFIRM] [post /api/scrap request] ⏱️ 타이머 생존신고 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 2026-05-05 20:34:40.677 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:34:40.677 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=DETAIL_PRE_CONFIRM, holding=true, 콜=0건
    ```

    </details>
- `🚦 [ROADMAP 20:34:40.683] [📱앱] [DETAIL_PRE_CONFIRM] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSha...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSharedMode=true, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[서울 광진구, 서울 광진, 서울 중랑구, 서울 중랑, 서울 강북구, 서울 강북, 서울 도봉구, 서울 도봉, 서울 노원구, 서울 노원, 서울 은평구, 서울 은평, 서울 송파구, 서울 송파, 서울 강동구, 서울 강동, 성남시 중원구, 성남시 중원, 의정부시, 의정부, 고양시 덕양구, 고양시 덕양, 고양시 일산동구, 고양시 일산동, 고양시 일산서구, 고양시 일산서, 구리시, 구리, 남양주시, 남양주, 하남시, 하남, 파주시, 파주, 광주시, 광주, 경기 광주, 경기 광주시, 경광주, 양주시, 양주, 김포시, 김포], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 20:34:41.333] [☁️서버] [FilterManager] 필터 변경 발생! (실시간 변경(activeFilter))`

    <details>
    <summary>🔽 {</summary>

    ```json
    {
      "destinationCity": "파주",
      "destinationRadiusKm": 5,
      "corridorRadiusKm": 5,
      "minFare": 20000,
      "maxFare": 1000000,
      "pickupRadiusKm": 10,
      "excludedKeywords": [],
      "isActive": false,
      "isSharedMode": true,
      "driverAction": "WAITING",
      "dispatchPhase": "GATHERING",
      "destinationKeywords": ["가좌동","걸포동","검산동","고양동","관산동","광적면","광탄면","교하동","구산동","군남면","군내면","금릉동","금촌동","남면","내유동","다율동","당하동","대자동","대화동","덕이동","동패동","마두동","맥금동","목동동","문발동","문봉동","문산읍","미산면","백석읍","백학면","법곳동","법원읍","벽제동","사리현동","산남동","상봉암동","상지석동","상패동","서패동","선유동","설문동","성석동","송촌동","식사동","신원동","신촌동","아동동","안흥동","야당동","야동동","양촌읍","연다산동","오도동","와동동","왕징면","운양동","원당동","월롱면","은현면","일산동","장기동","장남면","장단면","장항동","장흥면","적성면","전곡읍","정발산동","조리읍","주엽동","중산동","지영동","진동면","진서면","청산면","탄현동","탄현면","통진읍","파주읍","파평면","풍동","하봉암동","하성면","하지석동"],
      "destinationGroups": {"동두천시":["상봉암동","상패동","안흥동","하봉암동"],"고양시 덕양구":["고양동","관산동","내유동","대자동","벽제동","선유동","신원동","원당동"],"고양시 일산동구":["마두동","문봉동","사리현동","설문동","성석동","식사동","장항동","정발산동","중산동","지영동","풍동"],"고양시 일산서구":["가좌동","구산동","대화동","덕이동","법곳동","일산동","주엽동","탄현동"],"파주시":["검산동","광탄면","교하동","군내면","금릉동","금촌동","다율동","당하동","동패동","맥금동","목동동","문발동","문산읍","법원읍","산남동","상지석동","서패동","송촌동","신촌동","아동동","야당동","야동동","연다산동","오도동","와동동","월롱면","장단면","적성면","조리읍","진동면","진서면","탄현면","파주읍","파평면","하지석동"],"김포시":["걸포동","양촌읍","운양동","장기동","통진읍","하성면"],"양주시":["광적면","남면","백석읍","은현면","장흥면"],"연천군":["군남면","미산면","백학면","왕징면","장남면","전곡읍","청산면"]},
      "allowedVehicleTypes": ["오토바이","다마스","라보","승용차","1t"],
      "userOverrides": true,
      "customCityFilters": ["서울 광진구","서울 광진","서울 중랑구","서울 중랑","서울 강북구","서울 강북","서울 도봉구","서울 도봉","서울 노원구","서울 노원","서울 은평구","서울 은평","서울 송파구","서울 송파","서울 강동구","서울 강동","성남시 중원구","성남시 중원","의정부시","의정부","고양시 덕양구","고양시 덕양","고양시 일산동구","고양시 일산동","고양시 일산서구","고양시 일산서","구리시","구리","남양주시","남양주","하남시","하남","파주시","파주","광주시","광주","경기 광주","경기 광주시","경광주","양주시","양주","김포시","김포"],
    }
    ```

    </details>
- `[ROADMAP 20:34:41.333] [☁️서버] 폰의 isHolding=true 기간 동안 다른 콜을 물지 않도록 필터 비활성 정보 전달`
- `[ROADMAP 20:34:41.333] [☁️서버] 데스밸리 15초 카운트다운 타이머 감시 연산`
- `[ROADMAP 20:34:41.334] [🖥️관제웹] 서버로 부터 filter-updated 소켓 이벤트 받음`
- `[ROADMAP 20:34:41.335] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 0항목 적재 중 [화면: DETAIL_PRE_CONFIRM]`
- `[ROADMAP 20:34:41.335] [🖥️관제웹] 서버로 부터 filter-updated 소켓 이벤트 받음`
- `[ROADMAP 20:34:41.471] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 0항목 적재 중 [화면: DETAIL_PRE_CONFIRM]`
- `🚦 [ROADMAP 20:34:41.472] [📱앱] [DETAIL_PRE_CONFIRM] 📡 화면 변경 감지 | 화면: DETAIL_PRE_CONFIRM | 모드: AUTO`
- `🚦 [ROADMAP 20:34:41.679] [📱앱] [DETAIL_PRE_CONFIRM] [post /api/scrap request] ⏱️ 타이머 생존신고 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 2026-05-05 20:34:41.680 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:34:41.680 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=DETAIL_PRE_CONFIRM, holding=true, 콜=0건
    ```

    </details>
- `🚦 [ROADMAP 20:34:41.686] [📱앱] [DETAIL_PRE_CONFIRM] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSha...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSharedMode=true, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[서울 광진구, 서울 광진, 서울 중랑구, 서울 중랑, 서울 강북구, 서울 강북, 서울 도봉구, 서울 도봉, 서울 노원구, 서울 노원, 서울 은평구, 서울 은평, 서울 송파구, 서울 송파, 서울 강동구, 서울 강동, 성남시 중원구, 성남시 중원, 의정부시, 의정부, 고양시 덕양구, 고양시 덕양, 고양시 일산동구, 고양시 일산동, 고양시 일산서구, 고양시 일산서, 구리시, 구리, 남양주시, 남양주, 하남시, 하남, 파주시, 파주, 광주시, 광주, 경기 광주, 경기 광주시, 경광주, 양주시, 양주, 김포시, 김포], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `🚦 [ROADMAP 20:34:42.467] [📱앱] [DETAIL_PRE_CONFIRM] 📡 화면 변경 감지 | 화면: DETAIL_PRE_CONFIRM | 모드: AUTO`
- `[ROADMAP 20:34:42.474] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 0항목 적재 중 [화면: DETAIL_PRE_CONFIRM]`
- `🚦 [ROADMAP 20:34:42.686] [📱앱] [DETAIL_PRE_CONFIRM] [post /api/scrap request] ⏱️ 타이머 생존신고 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 2026-05-05 20:34:42.686 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:34:42.686 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=DETAIL_PRE_CONFIRM, holding=true, 콜=0건
    ```

    </details>
- `🚦 [ROADMAP 20:34:42.694] [📱앱] [DETAIL_PRE_CONFIRM] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSha...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSharedMode=true, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[서울 광진구, 서울 광진, 서울 중랑구, 서울 중랑, 서울 강북구, 서울 강북, 서울 도봉구, 서울 도봉, 서울 노원구, 서울 노원, 서울 은평구, 서울 은평, 서울 송파구, 서울 송파, 서울 강동구, 서울 강동, 성남시 중원구, 성남시 중원, 의정부시, 의정부, 고양시 덕양구, 고양시 덕양, 고양시 일산동구, 고양시 일산동, 고양시 일산서구, 고양시 일산서, 구리시, 구리, 남양주시, 남양주, 하남시, 하남, 파주시, 파주, 광주시, 광주, 경기 광주, 경기 광주시, 경광주, 양주시, 양주, 김포시, 김포], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `🚦 [ROADMAP 20:34:42.989] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 화면: DETAIL_CONFIRMED | 모드: AUTO`
- `🚦 [ROADMAP 20:34:42.989] [📱앱] [DETAIL_CONFIRMED] 🔒 [Current Page: DETAIL_CONFIRMED] 진입, isHolding=true 설정`
- `🚦 [ROADMAP 20:34:42.990] [📱앱] [DETAIL_CONFIRMED] 🏄‍♂️ 무인 서핑 가동 (State Machine: IDLE → 팝업버튼 트리거 대기)`
- `🚦 [ROADMAP 20:34:42.992] [📱앱] '적요상세' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 20:34:42.993] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '적요상세' 추출 후 클릭`
- `🚦 [ROADMAP 20:34:43.045] [📱앱] 버튼 터치 완료 (가로채기 성공) X:149.0, Y:1153.0`
- `🚦 [ROADMAP 20:34:43.081] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 화면: DETAIL_CONFIRMED | 모드: AUTO`
- `🚦 [ROADMAP 20:34:43.184] [📱앱] [POPUP_MEMO] 📡 화면 변경 감지 | 화면: POPUP_MEMO | 모드: AUTO`
- `🚦 [ROADMAP 20:34:43.184] [📱앱] [POPUP_MEMO] [Current Page: POPUP_MEMO] 진입 완료 ("적요 내용" 텍스트 매칭 확인)`
- `🚦 [ROADMAP 20:34:43.184] [📱앱] [POPUP_MEMO] 적요상세 데이터 추출 및 메모리에 누적 저장`
- `🚦 [ROADMAP 20:34:43.184] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 20:34:43.237] [📱앱] 버튼 터치 완료 (가로채기 성공) X:540.0, Y:2264.0`
- `🚦 [ROADMAP 20:34:43.273] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 화면: DETAIL_CONFIRMED | 모드: AUTO`
- `🚦 [ROADMAP 20:34:43.273] [📱앱] [DETAIL_CONFIRMED] [Current Page: DETAIL_CONFIRMED] 확정페이지 복귀 확인 (잔상 회피 완료)`
- `🚦 [ROADMAP 20:34:43.274] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '출발지' 추출 후 클릭`
- `🚦 [ROADMAP 20:34:43.274] [📱앱] '출발지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 20:34:43.328] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1592.0`
- `🚦 [ROADMAP 20:34:43.402] [📱앱] [POPUP_PICKUP] 📡 화면 변경 감지 | 화면: POPUP_PICKUP | 모드: AUTO`
- `🚦 [ROADMAP 20:34:43.403] [📱앱] [POPUP_PICKUP] [Current Page: POPUP_PICKUP] 진입 완료 ("전화1" 텍스트 매칭 확인)`
- `🚦 [ROADMAP 20:34:43.403] [📱앱] [POPUP_PICKUP] 출발지 데이터 추출 및 메모리에 누적 저장`
- `🚦 [ROADMAP 20:34:43.403] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 20:34:43.455] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`
- `[ROADMAP 20:34:43.481] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 0항목 적재 중 [화면: DETAIL_PRE_CONFIRM]`
- `🚦 [ROADMAP 20:34:43.488] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 화면: DETAIL_CONFIRMED | 모드: AUTO`
- `🚦 [ROADMAP 20:34:43.488] [📱앱] [DETAIL_CONFIRMED] [Current Page: DETAIL_CONFIRMED] 확정페이지 복귀 확인 (잔상 회피 완료)`
- `🚦 [ROADMAP 20:34:43.488] [📱앱] [DETAIL_CONFIRMED] 확정페이지에서 '도착지' 추출 후 클릭`
- `🚦 [ROADMAP 20:34:43.489] [📱앱] '도착지' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 20:34:43.545] [📱앱] 버튼 터치 완료 (가로채기 성공) X:539.0, Y:1742.0`
- `🚦 [ROADMAP 20:34:43.603] [📱앱] [POPUP_DROPOFF] 📡 화면 변경 감지 | 화면: POPUP_DROPOFF | 모드: AUTO`
- `🚦 [ROADMAP 20:34:43.604] [📱앱] [POPUP_DROPOFF] [Current Page: POPUP_DROPOFF] 진입 완료 ("전화1" 텍스트 매칭 확인)`
- `🚦 [ROADMAP 20:34:43.604] [📱앱] [POPUP_DROPOFF] 도착지 데이터 추출 및 메모리에 누적 저장`
- `🚦 [ROADMAP 20:34:43.604] [📱앱] '닫기' 버튼 인식 ➡️ 클릭 시도`
- `🚦 [ROADMAP 20:34:43.606] [📱앱] [DETAIL_CONFIRMED] [Current Page: DETAIL_CONFIRMED] 무인 서핑 종료 (State Machine: DONE)`
- `🚦 [ROADMAP 20:34:43.657] [📱앱] 버튼 터치 완료 (가로채기 성공) X:136.0, Y:2264.0`
- `🚦 [ROADMAP 20:34:43.705] [📱앱] [POPUP_DROPOFF] 📡 화면 변경 감지 | 화면: POPUP_DROPOFF | 모드: AUTO`
- `🚦 [ROADMAP 20:34:43.710] [📱앱] [POPUP_DROPOFF] [post /api/scrap request] ⏱️ 타이머 생존신고 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 2026-05-05 20:34:43.711 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:34:43.711 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=POPUP_DROPOFF, holding=true, 콜=0건
    ```

    </details>
- `🚦 [ROADMAP 20:34:43.721] [📱앱] [POPUP_DROPOFF] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSha...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSharedMode=true, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[서울 광진구, 서울 광진, 서울 중랑구, 서울 중랑, 서울 강북구, 서울 강북, 서울 도봉구, 서울 도봉, 서울 노원구, 서울 노원, 서울 은평구, 서울 은평, 서울 송파구, 서울 송파, 서울 강동구, 서울 강동, 성남시 중원구, 성남시 중원, 의정부시, 의정부, 고양시 덕양구, 고양시 덕양, 고양시 일산동구, 고양시 일산동, 고양시 일산서구, 고양시 일산서, 구리시, 구리, 남양주시, 남양주, 하남시, 하남, 파주시, 파주, 광주시, 광주, 경기 광주, 경기 광주시, 경광주, 양주시, 양주, 김포시, 김포], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `🚦 [ROADMAP 20:34:43.807] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 화면: DETAIL_CONFIRMED | 모드: AUTO`
- `🚦 [ROADMAP 20:34:44.008] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 2026-05-05 20:34:44.008 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:34:44.008 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=DETAIL_CONFIRMED, holding=true, 콜=0건
    ```

    </details>
- `🚦 [ROADMAP 20:34:44.014] [📱앱] [DETAIL_CONFIRMED] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSha...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=false, isSharedMode=true, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가좌동, 걸포동, 검산동, 고양동, 관산동, 광적면, 광탄면, 교하동, 구산동, 군남면, 군내면, 금릉동, 금촌동, 남면, 내유동, 다율동, 당하동, 대자동, 대화동, 덕이동, 동패동, 마두동, 맥금동, 목동동, 문발동, 문봉동, 문산읍, 미산면, 백석읍, 백학면, 법곳동, 법원읍, 벽제동, 사리현동, 산남동, 상봉암동, 상지석동, 상패동, 서패동, 선유동, 설문동, 성석동, 송촌동, 식사동, 신원동, 신촌동, 아동동, 안흥동, 야당동, 야동동, 양촌읍, 연다산동, 오도동, 와동동, 왕징면, 운양동, 원당동, 월롱면, 은현면, 일산동, 장기동, 장남면, 장단면, 장항동, 장흥면, 적성면, 전곡읍, 정발산동, 조리읍, 주엽동, 중산동, 지영동, 진동면, 진서면, 청산면, 탄현동, 탄현면, 통진읍, 파주읍, 파평면, 풍동, 하봉암동, 하성면, 하지석동], customCityFilters=[서울 광진구, 서울 광진, 서울 중랑구, 서울 중랑, 서울 강북구, 서울 강북, 서울 도봉구, 서울 도봉, 서울 노원구, 서울 노원, 서울 은평구, 서울 은평, 서울 송파구, 서울 송파, 서울 강동구, 서울 강동, 성남시 중원구, 성남시 중원, 의정부시, 의정부, 고양시 덕양구, 고양시 덕양, 고양시 일산동구, 고양시 일산동, 고양시 일산서구, 고양시 일산서, 구리시, 구리, 남양주시, 남양주, 하남시, 하남, 파주시, 파주, 광주시, 광주, 경기 광주, 경기 광주시, 경광주, 양주시, 양주, 김포시, 김포], destinationGroups={동두천시=[상봉암동, 상패동, 안흥동, 하봉암동], 고양시 덕양구=[고양동, 관산동, 내유동, 대자동, 벽제동, 선유동, 신원동, 원당동], 고양시 일산동구=[마두동, 문봉동, 사리현동, 설문동, 성석동, 식사동, 장항동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[가좌동, 구산동, 대화동, 덕이동, 법곳동, 일산동, 주엽동, 탄현동], 파주시=[검산동, 광탄면, 교하동, 군내면, 금릉동, 금촌동, 다율동, 당하동, 동패동, 맥금동, 목동동, 문발동, 문산읍, 법원읍, 산남동, 상지석동, 서패동, 송촌동, 신촌동, 아동동, 야당동, 야동동, 연다산동, 오도동, 와동동, 월롱면, 장단면, 적성면, 조리읍, 진동면, 진서면, 탄현면, 파주읍, 파평면, 하지석동], 김포시=[걸포동, 양촌읍, 운양동, 장기동, 통진읍, 하성면], 양주시=[광적면, 남면, 백석읍, 은현면, 장흥면], 연천군=[군남면, 미산면, 백학면, 왕징면, 장남면, 전곡읍, 청산면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 20:34:44.400] [☁️서버] 앱폰으로 부터 무인서핑이 완료된 '2차 오더 상세' 요청 받음`
- `[ROADMAP 20:34:44.400] [☁️서버] 상하차지 주소 및 적요 텍스트 정제 연산`
- `[ROADMAP 20:34:44.403] [☁️서버] 관제탑에게 정제된 상세 텍스트(order-detail-received) 정보 전달`
- `[ROADMAP 20:34:44.403] [☁️서버] 앱폰에게 디테일 데이터 정상 수신 완료 응답 전달`

### 🟢 [STEP 5] 카카오 연산 3중 폴백 & 자동 회랑 전개
*(시작 기준 시간: 20:34:44.404)*

- `[ROADMAP 20:34:44.404] [☁️서버] 🛡️ 주소 3중 폴백 (괄호제거 ➡️ 주소검색 ➡️ 키워드 ➡️ 절사) 연산`

    <details>
    <summary>🔽 🌍 [Geocoding] 상차지 변환: '경기 광주시 초월읍 경충대로 2170 신세계사이먼 광주프리미엄아울렛' -&gt; 실패(null)</summary>

    ```json
    🌍 [Geocoding] 상차지 변환: '경기 광주시 초월읍 경충대로 2170 신세계사이먼 광주프리미엄아울렛' -> 실패(null)
    ```

    </details>
- `[ROADMAP 20:34:44.404] [🖥️관제웹] [관제대시보드] 🟡 [웹 수신] order-detail-received | ID: AUTO-177 | 경기 광주시 초월읍 경충대로 2170`
- `[ROADMAP 20:34:44.404] [🖥️관제웹] [관제대시보드] PinnedRoute 컴포넌트에 '상하차지 및 적요' 텍스트를 선출력하여 렌더링`
- `[ROADMAP 20:34:44.507] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 0항목 적재 중 [화면: POPUP_DROPOFF]`
- `[ROADMAP 20:34:44.569] [☁️서버] 경로 폴리라인 및 최종 수익성(콜/꿀/똥) 라벨링 연산`
- `[ROADMAP 20:34:44.569] [☁️서버] 관제탑에게 카카오 에러 상태(order-evaluated error) 정보 전달`
- `[ROADMAP 20:34:44.569] [☁️서버] 앱폰에게 Action=Keep 최종 판결 Piggyback 등록`

    <details>
    <summary>🔽 📦 [Piggyback V2] 관제탑 판결(KEEP)을 큐에 기록. 다음 텔레메트리에 태워 보냅니다. (orderId: AUTO-1777980...</summary>

    ```json
    📦 [Piggyback V2] 관제탑 판결(KEEP)을 큐에 기록. 다음 텔레메트리에 태워 보냅니다. (orderId: AUTO-1777980879457)
    ```

    </details>
- `[ROADMAP 20:34:44.569] [☁️서버] 관제탑으로 부터 Keep 결재 요청 받음`
- `[ROADMAP 20:34:44.569] [☁️서버] 해당 콜을 '내 퀵(myOrders)' 배열에 추가 및 병합 궤적 생성 연산`
- `[ROADMAP 20:34:44.570] [🖥️관제웹] [관제대시보드] 🔵 [웹 수신] order-evaluated | ID: AUTO-177 | 카카오 연산 실패`
- `[ROADMAP 20:34:44.571] [🖥️관제웹] [관제대시보드] 추천 결과 노출, 경로보기버튼 추가 노출 후 판단 (취소 or 닫기) 대기`
- `[ROADMAP 20:34:44.571] [🖥️관제웹] [관제대시보드] UI 상단에 에러 배너 렌더링 및 카카오맵 불가 상태를 PinnedRoute 에 표현`

    <details>
    <summary>🔽 🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.</summary>

    ```json
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    ```

    </details>
- `[ROADMAP 20:34:44.802] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 0항목 적재 중 [화면: DETAIL_CONFIRMED]`

    <details>
    <summary>🔽 📦 [Piggyback V2] 텔레메트리 편에 결재(KEEP)를 태워 보냅니다! (orderId: AUTO-1777980879457)</summary>

    ```json
    📦 [Piggyback V2] 텔레메트리 편에 결재(KEEP)를 태워 보냅니다! (orderId: AUTO-1777980879457)
    ```

    </details>
- `[ROADMAP 20:34:46.599] [☁️서버] 관제탑에게 확정되었음(order-confirmed) 정보 전달`
- `[ROADMAP 20:34:46.600] [☁️서버] 합짐을 위한 반경/목적지 추천 키워드로 다이나믹 필터 생성 연산`
- `[ROADMAP 20:34:46.600] [☁️서버] [FilterManager] 필터 변경 발생! (실시간 변경(activeFilter))`

    <details>
    <summary>🔽 {</summary>

    ```json
    {
      "destinationCity": "파주",
      "destinationRadiusKm": 5,
      "corridorRadiusKm": 5,
      "minFare": 20000,
      "maxFare": 1000000,
      "pickupRadiusKm": 10,
      "excludedKeywords": [],
      "isActive": true,
      "isSharedMode": true,
      "driverAction": "WAITING",
      "dispatchPhase": "GATHERING",
      "destinationKeywords": ["가좌동","걸포동","검산동","고양동","관산동","광적면","광탄면","교하동","구산동","군남면","군내면","금릉동","금촌동","남면","내유동","다율동","당하동","대자동","대화동","덕이동","동패동","마두동","맥금동","목동동","문발동","문봉동","문산읍","미산면","백석읍","백학면","법곳동","법원읍","벽제동","사리현동","산남동","상봉암동","상지석동","상패동","서패동","선유동","설문동","성석동","송촌동","식사동","신원동","신촌동","아동동","안흥동","야당동","야동동","양촌읍","연다산동","오도동","와동동","왕징면","운양동","원당동","월롱면","은현면","일산동","장기동","장남면","장단면","장항동","장흥면","적성면","전곡읍","정발산동","조리읍","주엽동","중산동","지영동","진동면","진서면","청산면","탄현동","탄현면","통진읍","파주읍","파평면","풍동","하봉암동","하성면","하지석동"],
      "destinationGroups": {"동두천시":["상봉암동","상패동","안흥동","하봉암동"],"고양시 덕양구":["고양동","관산동","내유동","대자동","벽제동","선유동","신원동","원당동"],"고양시 일산동구":["마두동","문봉동","사리현동","설문동","성석동","식사동","장항동","정발산동","중산동","지영동","풍동"],"고양시 일산서구":["가좌동","구산동","대화동","덕이동","법곳동","일산동","주엽동","탄현동"],"파주시":["검산동","광탄면","교하동","군내면","금릉동","금촌동","다율동","당하동","동패동","맥금동","목동동","문발동","문산읍","법원읍","산남동","상지석동","서패동","송촌동","신촌동","아동동","야당동","야동동","연다산동","오도동","와동동","월롱면","장단면","적성면","조리읍","진동면","진서면","탄현면","파주읍","파평면","하지석동"],"김포시":["걸포동","양촌읍","운양동","장기동","통진읍","하성면"],"양주시":["광적면","남면","백석읍","은현면","장흥면"],"연천군":["군남면","미산면","백학면","왕징면","장남면","전곡읍","청산면"]},
      "allowedVehicleTypes": ["오토바이","다마스"],
      "userOverrides": true,
      "customCityFilters": ["서울 광진구","서울 광진","서울 중랑구","서울 중랑","서울 강북구","서울 강북","서울 도봉구","서울 도봉","서울 노원구","서울 노원","서울 은평구","서울 은평","서울 송파구","서울 송파","서울 강동구","서울 강동","성남시 중원구","성남시 중원","의정부시","의정부","고양시 덕양구","고양시 덕양","고양시 일산동구","고양시 일산동","고양시 일산서구","고양시 일산서","구리시","구리","남양주시","남양주","하남시","하남","파주시","파주","광주시","광주","경기 광주","경기 광주시","경광주","양주시","양주","김포시","김포"],
    }
    ```

    </details>
- `[ROADMAP 20:34:46.601] [☁️서버] 새로 부여된 합짐 필터(isSharedMode)값 메모리 세션 갱신`
- `[ROADMAP 20:34:46.601] [☁️서버] 앱폰 및 관제탑에게 새로운 타겟팅 필터(filter-updated) 정보 전달`
- `[ROADMAP 20:34:46.601] [🖥️관제웹] [관제대시보드] PinnedRoute 레이아웃을 합짐/무한 궤도 모드로 격상 렌더링 및 딤드 다시 처리`
- `[ROADMAP 20:34:46.637] [🖥️관제웹] 서버로 부터 filter-updated 소켓 이벤트 받음`
- `[ROADMAP 20:34:46.638] [🖥️관제웹] 서버로 부터 filter-updated 소켓 이벤트 받음`

    <details>
    <summary>🔽 🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.</summary>

    ```json
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    ```

    </details>

### 🟢 [STEP 6] 관제탑 결재 (취소 vs 유지)
*(시작 기준 시간: 20:34:59.678)*

- `[ROADMAP 20:34:59.678] [🖥️관제웹] [관제대시보드] [Socket] 취소 전달`
- `[ROADMAP 20:34:59.683] [☁️서버] 앱폰에게 Action=Cancel 최종 판결 Piggyback 등록`

    <details>
    <summary>🔽 📦 [Piggyback V2] 관제탑 판결(CANCEL)을 큐에 기록. 다음 텔레메트리에 태워 보냅니다. (orderId: AUTO-17779...</summary>

    ```json
    📦 [Piggyback V2] 관제탑 판결(CANCEL)을 큐에 기록. 다음 텔레메트리에 태워 보냅니다. (orderId: AUTO-1777980879457)
    ```

    </details>
- `[ROADMAP 20:34:59.683] [☁️서버] 관제탑으로 부터 수동 취소/방출(ORDER_RELEASED) 요청 받음`
- `[ROADMAP 20:34:59.685] [☁️서버] 관제탑에게 콜이 삭제되었음(order-canceled) 정보 전달`
- `[ROADMAP 20:34:59.726] [🖥️관제웹] [관제대시보드] 🔴 [웹 수신] order-canceled | ID: AUTO-177 | 상태: ORDER_RELEASED | 수동여부: true`
- `[ROADMAP 20:34:59.726] [🖥️관제웹] [관제대시보드] 오더 상태를 취소/방출로 변경하여 탭을 이동시킵니다`
- `[ROADMAP 20:35:00.619] [☁️서버] [FilterManager] 필터 변경 발생! (실시간 변경(activeFilter))`

    <details>
    <summary>🔽 {</summary>

    ```json
    {
      "destinationCity": "파주",
      "destinationRadiusKm": 5,
      "corridorRadiusKm": 5,
      "minFare": 20000,
      "maxFare": 1000000,
      "pickupRadiusKm": 10,
      "excludedKeywords": [],
      "isActive": true,
      "isSharedMode": true,
      "driverAction": "WAITING",
      "dispatchPhase": "GATHERING",
      "destinationKeywords": ["가좌동","걸포동","검산동","고양동","관산동","광적면","광탄면","교하동","구산동","군남면","군내면","금릉동","금촌동","남면","내유동","다율동","당하동","대자동","대화동","덕이동","동패동","마두동","맥금동","목동동","문발동","문봉동","문산읍","미산면","백석읍","백학면","법곳동","법원읍","벽제동","사리현동","산남동","상봉암동","상지석동","상패동","서패동","선유동","설문동","성석동","송촌동","식사동","신원동","신촌동","아동동","안흥동","야당동","야동동","양촌읍","연다산동","오도동","와동동","왕징면","운양동","원당동","월롱면","은현면","일산동","장기동","장남면","장단면","장항동","장흥면","적성면","전곡읍","정발산동","조리읍","주엽동","중산동","지영동","진동면","진서면","청산면","탄현동","탄현면","통진읍","파주읍","파평면","풍동","하봉암동","하성면","하지석동"],
      "destinationGroups": {"동두천시":["상봉암동","상패동","안흥동","하봉암동"],"고양시 덕양구":["고양동","관산동","내유동","대자동","벽제동","선유동","신원동","원당동"],"고양시 일산동구":["마두동","문봉동","사리현동","설문동","성석동","식사동","장항동","정발산동","중산동","지영동","풍동"],"고양시 일산서구":["가좌동","구산동","대화동","덕이동","법곳동","일산동","주엽동","탄현동"],"파주시":["검산동","광탄면","교하동","군내면","금릉동","금촌동","다율동","당하동","동패동","맥금동","목동동","문발동","문산읍","법원읍","산남동","상지석동","서패동","송촌동","신촌동","아동동","야당동","야동동","연다산동","오도동","와동동","월롱면","장단면","적성면","조리읍","진동면","진서면","탄현면","파주읍","파평면","하지석동"],"김포시":["걸포동","양촌읍","운양동","장기동","통진읍","하성면"],"양주시":["광적면","남면","백석읍","은현면","장흥면"],"연천군":["군남면","미산면","백학면","왕징면","장남면","전곡읍","청산면"]},
      "allowedVehicleTypes": ["오토바이","다마스","라보","승용차","1t"],
      "userOverrides": true,
      "customCityFilters": ["서울 광진구","서울 광진","서울 중랑구","서울 중랑","서울 강북구","서울 강북","서울 도봉구","서울 도봉","서울 노원구","서울 노원","서울 은평구","서울 은평","서울 송파구","서울 송파","서울 강동구","서울 강동","성남시 중원구","성남시 중원","의정부시","의정부","고양시 덕양구","고양시 덕양","고양시 일산동구","고양시 일산동","고양시 일산서구","고양시 일산서","구리시","구리","남양주시","남양주","하남시","하남","파주시","파주","광주시","광주","경기 광주","경기 광주시","경광주","양주시","양주","김포시","김포"],
    }
    ```

    </details>
- `[ROADMAP 20:35:00.619] [☁️서버] 서브콜 취소, 현재 상태(GATHERING) 유지하며 탐색 재개`
- `[ROADMAP 20:35:00.619] [☁️서버] 앱폰 및 관제탑에게 탐색 재개(filter-updated) 정보 전달`
- `[ROADMAP 20:35:00.621] [🖥️관제웹] 서버로 부터 filter-updated 소켓 이벤트 받음`
- `[ROADMAP 20:35:00.622] [🖥️관제웹] 서버로 부터 filter-updated 소켓 이벤트 받음`
- `[ROADMAP 20:35:02.778] [☁️서버] [FilterManager] 필터 변경 발생! (실시간 변경(activeFilter))`

    <details>
    <summary>🔽 {</summary>

    ```json
    {
      "destinationCity": "파주",
      "destinationRadiusKm": 5,
      "corridorRadiusKm": 5,
      "minFare": 20000,
      "maxFare": 1000000,
      "pickupRadiusKm": 10,
      "excludedKeywords": [],
      "isActive": true,
      "isSharedMode": true,
      "driverAction": "WAITING",
      "dispatchPhase": "GATHERING",
      "destinationKeywords": ["가능동","갈매동","갈현동","감북동","감이동","감일동","강일동","검산동","경안동","고덕동","고산동","고양동","공릉동","관산동","광암동","광장동","광탄면","교문동","교산동","교하동","금곡동","금릉동","금오동","금촌동","길동","남종면","남한산성면","내곡동","내유동","녹양동","다산동","다율동","당정동","당하동","대자동","대장동","대화동","덕이동","덕풍동","도내동","도농동","도봉동","동산동","동패동","둔촌동","마두동","마천동","망우동","망월동","매산동","맥금동","면목동","명일동","목동","목동동","목현동","묵동","문봉동","문산읍","미사동","방이동","방학동","배알미동","백석동","백석읍","벽제동","별내동","별내면","북한동","사노동","사리현동","산곡동","산황동","삼동","삼송동","삼패동","상계동","상봉동","상사창동","상산곡동","상일동","상지석동","선동","선유동","설문동","성내동","성사동","성석동","송정동","송촌동","수석동","수택동","식사동","신곡동","신내동","신원동","신장동","신촌동","쌍령동","쌍문동","아동동","아천동","암사동","야당동","야동동","양벌동","어둔동","역동","연다산동","오금동","오도동","와동동","와부읍","용두동","용현동","우이동","원당동","원흥동","월계동","월롱면","의정부동","이패동","인창동","일산동","일패동","장단면","장암동","장지동","장흥면","정발산동","조리읍","조안면","주교동","주엽동","중계동","중곡동","중대동","중산동","중화동","지금동","지영동","지축동","직동","진건읍","진관동","진접읍","창동","창우동","천현동","천호동","초월읍","초이동","초일동","추자동","춘궁동","탄벌동","탄현동","탄현면","태전동","토당동","토평동","퇴계원읍","퇴촌면","파주읍","풍동","풍산동","하계동","하사창동","하산곡동","하성면","하지석동","항동","행신동","호원동","화정동","회덕동","효자동"],
      "destinationGroups": {"서울 광진구":["광장동","중곡동"],"서울 중랑구":["망우동","면목동","묵동","상봉동","신내동","중화동"],"서울 강북구":["우이동"],"서울 도봉구":["도봉동","방학동","쌍문동","창동"],"서울 노원구":["공릉동","상계동","월계동","중계동","하계동"],"서울 은평구":["갈현동","진관동"],"서울 송파구":["마천동","방이동"],"서울 강동구":["강일동","고덕동","길동","둔촌동","명일동","상일동","성내동","암사동","천호동"],"성남시 중원구":["갈현동"],"의정부시":["가능동","고산동","금오동","녹양동","산곡동","신곡동","용현동","의정부동","장암동","호원동"],"고양시 덕양구":["고양동","관산동","내곡동","내유동","대자동","대장동","도내동","동산동","벽제동","북한동","삼송동","선유동","성사동","신원동","오금동","용두동","원당동","원흥동","주교동","지축동","토당동","행신동","화정동","효자동"],"고양시 일산동구":["마두동","문봉동","백석동","사리현동","산황동","설문동","성석동","식사동","정발산동","중산동","지영동","풍동"],"고양시 일산서구":["대화동","덕이동","일산동","주엽동","탄현동"],"구리시":["갈매동","교문동","사노동","수택동","아천동","인창동","토평동"],"남양주시":["금곡동","다산동","도농동","별내동","별내면","삼패동","수석동","와부읍","이패동","일패동","조안면","지금동","진건읍","진접읍","퇴계원읍"],"하남시":["감북동","감이동","감일동","광암동","교산동","당정동","덕풍동","망월동","미사동","배알미동","상사창동","상산곡동","선동","신장동","창우동","천현동","초이동","초일동","춘궁동","풍산동","하사창동","하산곡동","항동"],"파주시":["검산동","광탄면","교하동","금릉동","금촌동","다율동","당하동","동패동","맥금동","목동동","문산읍","상지석동","송촌동","신촌동","아동동","야당동","야동동","연다산동","오도동","와동동","월롱면","장단면","조리읍","탄현면","파주읍","하지석동"],"광주시":["경안동","고산동","남종면","남한산성면","매산동","목동","목현동","삼동","송정동","쌍령동","양벌동","역동","장지동","중대동","직동","초월읍","추자동","탄벌동","태전동","퇴촌면","회덕동"],"양주시":["백석읍","어둔동","장흥면"],"김포시":["하성면"]},
      "allowedVehicleTypes": ["오토바이","다마스","라보","승용차","1t"],
      "userOverrides": true,
      "customCityFilters": ["서울 광진구","서울 광진","서울 중랑구","서울 중랑","서울 강북구","서울 강북","서울 도봉구","서울 도봉","서울 노원구","서울 노원","서울 은평구","서울 은평","서울 송파구","서울 송파","서울 강동구","서울 강동","성남시 중원구","성남시 중원","의정부시","의정부","고양시 덕양구","고양시 덕양","고양시 일산동구","고양시 일산동","고양시 일산서구","고양시 일산서","구리시","구리","남양주시","남양주","하남시","하남","파주시","파주","광주시","광주","경기 광주","경기 광주시","경광주","양주시","양주","김포시","김포"],
    }
    ```

    </details>
- `[ROADMAP 20:35:02.779] [🖥️관제웹] 서버로 부터 filter-updated 소켓 이벤트 받음`
- `[ROADMAP 20:35:02.780] [🖥️관제웹] 서버로 부터 filter-updated 소켓 이벤트 받음`
- `[ROADMAP 20:35:02.781] [🖥️관제웹] 서버로 부터 filter-updated 소켓 이벤트 받음`

### 🟢 [STEP 2] 첫짐 1차 선점 (단독콜 사냥)
*(시작 기준 시간: 20:35:05.207)*

- `🚦 [ROADMAP 20:35:05.207] [📱앱] [DETAIL_CONFIRMED] 📡 화면 변경 감지 | 화면: DETAIL_CONFIRMED | 모드: AUTO`
- `🚦 [ROADMAP 20:35:05.338] [📱앱] [SESSION] 🔄 세션 및 사냥 상태 완전 초기화 (새로운 타겟 대기)`
- `🚦 [ROADMAP 20:35:05.339] [📱앱] [LIST] 📡 화면 변경 감지 | 화면: LIST | 모드: AUTO`
- `🚦 [ROADMAP 20:35:05.339] [📱앱] [SESSION] 🔄 세션 및 사냥 상태 완전 초기화 (새로운 타겟 대기)`
- `🚦 [ROADMAP 20:35:05.660] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 5)`

    <details>
    <summary>🔽 2026-05-05 20:35:05.661 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:35:05.661 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=LIST, holding=false, 콜=5건
    ```

    </details>
- `🚦 [ROADMAP 20:35:05.673] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 5)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isSharedMode=true, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가능동, 갈매동, 갈현동, 감북동, 감이동, 감일동, 강일동, 검산동, 경안동, 고덕동, 고산동, 고양동, 공릉동, 관산동, 광암동, 광장동, 광탄면, 교문동, 교산동, 교하동, 금곡동, 금릉동, 금오동, 금촌동, 길동, 남종면, 남한산성면, 내곡동, 내유동, 녹양동, 다산동, 다율동, 당정동, 당하동, 대자동, 대장동, 대화동, 덕이동, 덕풍동, 도내동, 도농동, 도봉동, 동산동, 동패동, 둔촌동, 마두동, 마천동, 망우동, 망월동, 매산동, 맥금동, 면목동, 명일동, 목동, 목동동, 목현동, 묵동, 문봉동, 문산읍, 미사동, 방이동, 방학동, 배알미동, 백석동, 백석읍, 벽제동, 별내동, 별내면, 북한동, 사노동, 사리현동, 산곡동, 산황동, 삼동, 삼송동, 삼패동, 상계동, 상봉동, 상사창동, 상산곡동, 상일동, 상지석동, 선동, 선유동, 설문동, 성내동, 성사동, 성석동, 송정동, 송촌동, 수석동, 수택동, 식사동, 신곡동, 신내동, 신원동, 신장동, 신촌동, 쌍령동, 쌍문동, 아동동, 아천동, 암사동, 야당동, 야동동, 양벌동, 어둔동, 역동, 연다산동, 오금동, 오도동, 와동동, 와부읍, 용두동, 용현동, 우이동, 원당동, 원흥동, 월계동, 월롱면, 의정부동, 이패동, 인창동, 일산동, 일패동, 장단면, 장암동, 장지동, 장흥면, 정발산동, 조리읍, 조안면, 주교동, 주엽동, 중계동, 중곡동, 중대동, 중산동, 중화동, 지금동, 지영동, 지축동, 직동, 진건읍, 진관동, 진접읍, 창동, 창우동, 천현동, 천호동, 초월읍, 초이동, 초일동, 추자동, 춘궁동, 탄벌동, 탄현동, 탄현면, 태전동, 토당동, 토평동, 퇴계원읍, 퇴촌면, 파주읍, 풍동, 풍산동, 하계동, 하사창동, 하산곡동, 하성면, 하지석동, 항동, 행신동, 호원동, 화정동, 회덕동, 효자동], customCityFilters=[서울 광진구, 서울 광진, 서울 중랑구, 서울 중랑, 서울 강북구, 서울 강북, 서울 도봉구, 서울 도봉, 서울 노원구, 서울 노원, 서울 은평구, 서울 은평, 서울 송파구, 서울 송파, 서울 강동구, 서울 강동, 성남시 중원구, 성남시 중원, 의정부시, 의정부, 고양시 덕양구, 고양시 덕양, 고양시 일산동구, 고양시 일산동, 고양시 일산서구, 고양시 일산서, 구리시, 구리, 남양주시, 남양주, 하남시, 하남, 파주시, 파주, 광주시, 광주, 경기 광주, 경기 광주시, 경광주, 양주시, 양주, 김포시, 김포], destinationGroups={서울 광진구=[광장동, 중곡동], 서울 중랑구=[망우동, 면목동, 묵동, 상봉동, 신내동, 중화동], 서울 강북구=[우이동], 서울 도봉구=[도봉동, 방학동, 쌍문동, 창동], 서울 노원구=[공릉동, 상계동, 월계동, 중계동, 하계동], 서울 은평구=[갈현동, 진관동], 서울 송파구=[마천동, 방이동], 서울 강동구=[강일동, 고덕동, 길동, 둔촌동, 명일동, 상일동, 성내동, 암사동, 천호동], 성남시 중원구=[갈현동], 의정부시=[가능동, 고산동, 금오동, 녹양동, 산곡동, 신곡동, 용현동, 의정부동, 장암동, 호원동], 고양시 덕양구=[고양동, 관산동, 내곡동, 내유동, 대자동, 대장동, 도내동, 동산동, 벽제동, 북한동, 삼송동, 선유동, 성사동, 신원동, 오금동, 용두동, 원당동, 원흥동, 주교동, 지축동, 토당동, 행신동, 화정동, 효자동], 고양시 일산동구=[마두동, 문봉동, 백석동, 사리현동, 산황동, 설문동, 성석동, 식사동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[대화동, 덕이동, 일산동, 주엽동, ?
    ```

    </details>
- `🚦 [ROADMAP 20:35:05.972] [📱앱] [LIST] 📡 화면 변경 감지 | 화면: LIST | 모드: AUTO`
- `🚦 [ROADMAP 20:35:05.972] [📱앱] [SESSION] 🔄 세션 및 사냥 상태 완전 초기화 (새로운 타겟 대기)`
- `🚦 [ROADMAP 20:35:05.976] [📱앱] [LIST] 🔍 [타겟 콜 필터 결과] 차종(1t)=✅ 도착지(177중 금천구)=❌ 요금(20000 <= 60000)=✅ 상차지/거리(합짐무시 >= 0.2km)=✅ 블랙()=✅`
- `🚦 [ROADMAP 20:35:06.280] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 2026-05-05 20:35:06.280 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:35:06.280 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=LIST, holding=false, 콜=1건
    ```

    </details>
- `🚦 [ROADMAP 20:35:06.291] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 1)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isSharedMode=true, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가능동, 갈매동, 갈현동, 감북동, 감이동, 감일동, 강일동, 검산동, 경안동, 고덕동, 고산동, 고양동, 공릉동, 관산동, 광암동, 광장동, 광탄면, 교문동, 교산동, 교하동, 금곡동, 금릉동, 금오동, 금촌동, 길동, 남종면, 남한산성면, 내곡동, 내유동, 녹양동, 다산동, 다율동, 당정동, 당하동, 대자동, 대장동, 대화동, 덕이동, 덕풍동, 도내동, 도농동, 도봉동, 동산동, 동패동, 둔촌동, 마두동, 마천동, 망우동, 망월동, 매산동, 맥금동, 면목동, 명일동, 목동, 목동동, 목현동, 묵동, 문봉동, 문산읍, 미사동, 방이동, 방학동, 배알미동, 백석동, 백석읍, 벽제동, 별내동, 별내면, 북한동, 사노동, 사리현동, 산곡동, 산황동, 삼동, 삼송동, 삼패동, 상계동, 상봉동, 상사창동, 상산곡동, 상일동, 상지석동, 선동, 선유동, 설문동, 성내동, 성사동, 성석동, 송정동, 송촌동, 수석동, 수택동, 식사동, 신곡동, 신내동, 신원동, 신장동, 신촌동, 쌍령동, 쌍문동, 아동동, 아천동, 암사동, 야당동, 야동동, 양벌동, 어둔동, 역동, 연다산동, 오금동, 오도동, 와동동, 와부읍, 용두동, 용현동, 우이동, 원당동, 원흥동, 월계동, 월롱면, 의정부동, 이패동, 인창동, 일산동, 일패동, 장단면, 장암동, 장지동, 장흥면, 정발산동, 조리읍, 조안면, 주교동, 주엽동, 중계동, 중곡동, 중대동, 중산동, 중화동, 지금동, 지영동, 지축동, 직동, 진건읍, 진관동, 진접읍, 창동, 창우동, 천현동, 천호동, 초월읍, 초이동, 초일동, 추자동, 춘궁동, 탄벌동, 탄현동, 탄현면, 태전동, 토당동, 토평동, 퇴계원읍, 퇴촌면, 파주읍, 풍동, 풍산동, 하계동, 하사창동, 하산곡동, 하성면, 하지석동, 항동, 행신동, 호원동, 화정동, 회덕동, 효자동], customCityFilters=[서울 광진구, 서울 광진, 서울 중랑구, 서울 중랑, 서울 강북구, 서울 강북, 서울 도봉구, 서울 도봉, 서울 노원구, 서울 노원, 서울 은평구, 서울 은평, 서울 송파구, 서울 송파, 서울 강동구, 서울 강동, 성남시 중원구, 성남시 중원, 의정부시, 의정부, 고양시 덕양구, 고양시 덕양, 고양시 일산동구, 고양시 일산동, 고양시 일산서구, 고양시 일산서, 구리시, 구리, 남양주시, 남양주, 하남시, 하남, 파주시, 파주, 광주시, 광주, 경기 광주, 경기 광주시, 경광주, 양주시, 양주, 김포시, 김포], destinationGroups={서울 광진구=[광장동, 중곡동], 서울 중랑구=[망우동, 면목동, 묵동, 상봉동, 신내동, 중화동], 서울 강북구=[우이동], 서울 도봉구=[도봉동, 방학동, 쌍문동, 창동], 서울 노원구=[공릉동, 상계동, 월계동, 중계동, 하계동], 서울 은평구=[갈현동, 진관동], 서울 송파구=[마천동, 방이동], 서울 강동구=[강일동, 고덕동, 길동, 둔촌동, 명일동, 상일동, 성내동, 암사동, 천호동], 성남시 중원구=[갈현동], 의정부시=[가능동, 고산동, 금오동, 녹양동, 산곡동, 신곡동, 용현동, 의정부동, 장암동, 호원동], 고양시 덕양구=[고양동, 관산동, 내곡동, 내유동, 대자동, 대장동, 도내동, 동산동, 벽제동, 북한동, 삼송동, 선유동, 성사동, 신원동, 오금동, 용두동, 원당동, 원흥동, 주교동, 지축동, 토당동, 행신동, 화정동, 효자동], 고양시 일산동구=[마두동, 문봉동, 백석동, 사리현동, 산황동, 설문동, 성석동, 식사동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[대화동, 덕이동, 일산동, 주엽동, ?
    ```

    </details>
- `[ROADMAP 20:35:06.460] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 5항목 적재 중 [화면: LIST]`
- `[ROADMAP 20:35:07.076] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 1항목 적재 중 [화면: LIST]`
- `🚦 [ROADMAP 20:35:08.948] [📱앱] [LIST] 📡 화면 변경 감지 | 화면: LIST | 모드: AUTO`
- `🚦 [ROADMAP 20:35:08.948] [📱앱] [SESSION] 🔄 세션 및 사냥 상태 완전 초기화 (새로운 타겟 대기)`
- `🚦 [ROADMAP 20:35:09.150] [📱앱] [LIST] [post /api/scrap request] 👀 화면 변경 감지 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 2026-05-05 20:35:09.150 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:35:09.150 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=LIST, holding=false, 콜=0건
    ```

    </details>
- `🚦 [ROADMAP 20:35:09.159] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:</summary>

    ```json
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isSharedMode=true, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가능동, 갈매동, 갈현동, 감북동, 감이동, 감일동, 강일동, 검산동, 경안동, 고덕동, 고산동, 고양동, 공릉동, 관산동, 광암동, 광장동, 광탄면, 교문동, 교산동, 교하동, 금곡동, 금릉동, 금오동, 금촌동, 길동, 남종면, 남한산성면, 내곡동, 내유동, 녹양동, 다산동, 다율동, 당정동, 당하동, 대자동, 대장동, 대화동, 덕이동, 덕풍동, 도내동, 도농동, 도봉동, 동산동, 동패동, 둔촌동, 마두동, 마천동, 망우동, 망월동, 매산동, 맥금동, 면목동, 명일동, 목동, 목동동, 목현동, 묵동, 문봉동, 문산읍, 미사동, 방이동, 방학동, 배알미동, 백석동, 백석읍, 벽제동, 별내동, 별내면, 북한동, 사노동, 사리현동, 산곡동, 산황동, 삼동, 삼송동, 삼패동, 상계동, 상봉동, 상사창동, 상산곡동, 상일동, 상지석동, 선동, 선유동, 설문동, 성내동, 성사동, 성석동, 송정동, 송촌동, 수석동, 수택동, 식사동, 신곡동, 신내동, 신원동, 신장동, 신촌동, 쌍령동, 쌍문동, 아동동, 아천동, 암사동, 야당동, 야동동, 양벌동, 어둔동, 역동, 연다산동, 오금동, 오도동, 와동동, 와부읍, 용두동, 용현동, 우이동, 원당동, 원흥동, 월계동, 월롱면, 의정부동, 이패동, 인창동, 일산동, 일패동, 장단면, 장암동, 장지동, 장흥면, 정발산동, 조리읍, 조안면, 주교동, 주엽동, 중계동, 중곡동, 중대동, 중산동, 중화동, 지금동, 지영동, 지축동, 직동, 진건읍, 진관동, 진접읍, 창동, 창우동, 천현동, 천호동, 초월읍, 초이동, 초일동, 추자동, 춘궁동, 탄벌동, 탄현동, 탄현면, 태전동, 토당동, 토평동, 퇴계원읍, 퇴촌면, 파주읍, 풍동, 풍산동, 하계동, 하사창동, 하산곡동, 하성면, 하지석동, 항동, 행신동, 호원동, 화정동, 회덕동, 효자동], customCityFilters=[서울 광진구, 서울 광진, 서울 중랑구, 서울 중랑, 서울 강북구, 서울 강북, 서울 도봉구, 서울 도봉, 서울 노원구, 서울 노원, 서울 은평구, 서울 은평, 서울 송파구, 서울 송파, 서울 강동구, 서울 강동, 성남시 중원구, 성남시 중원, 의정부시, 의정부, 고양시 덕양구, 고양시 덕양, 고양시 일산동구, 고양시 일산동, 고양시 일산서구, 고양시 일산서, 구리시, 구리, 남양주시, 남양주, 하남시, 하남, 파주시, 파주, 광주시, 광주, 경기 광주, 경기 광주시, 경광주, 양주시, 양주, 김포시, 김포], destinationGroups={서울 광진구=[광장동, 중곡동], 서울 중랑구=[망우동, 면목동, 묵동, 상봉동, 신내동, 중화동], 서울 강북구=[우이동], 서울 도봉구=[도봉동, 방학동, 쌍문동, 창동], 서울 노원구=[공릉동, 상계동, 월계동, 중계동, 하계동], 서울 은평구=[갈현동, 진관동], 서울 송파구=[마천동, 방이동], 서울 강동구=[강일동, 고덕동, 길동, 둔촌동, 명일동, 상일동, 성내동, 암사동, 천호동], 성남시 중원구=[갈현동], 의정부시=[가능동, 고산동, 금오동, 녹양동, 산곡동, 신곡동, 용현동, 의정부동, 장암동, 호원동], 고양시 덕양구=[고양동, 관산동, 내곡동, 내유동, 대자동, 대장동, 도내동, 동산동, 벽제동, 북한동, 삼송동, 선유동, 성사동, 신원동, 오금동, 용두동, 원당동, 원흥동, 주교동, 지축동, 토당동, 행신동, 화정동, 효자동], 고양시 일산동구=[마두동, 문봉동, 백석동, 사리현동, 산황동, 설문동, 성석동, 식사동, 정발산동, 중산동, 지영동, 풍동], 고양시 일산서구=[대화동, 덕이동, 일산동, 주엽동, ?
    ```

    </details>
- `[ROADMAP 20:35:09.946] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 0항목 적재 중 [화면: LIST]`
- `[ROADMAP 20:35:28.307] [🖥️관제웹] 출발 버튼 클릭 → GATHERING→DELIVERING 전환 (시뮬레이션: true)`
- `[ROADMAP 20:35:28.308] [🖥️관제웹] 서버에게 새로 작성한 update-filter 정보 전달`
- `[ROADMAP 20:35:28.315] [☁️서버] 관제탑으로 부터 필터 변경(update-filter) 요청 받음. 수신 데이터: {"driverAction":"DRIVING","corridorRadiusKm":0}`
- `[ROADMAP 20:35:29.413] [☁️서버] 관제탑에게 변경 적용된 필터(filter-updated) 정보 전달 (메모리만, DB 저장 안함)`
- `[ROADMAP 20:35:29.413] [☁️서버] [FilterManager] 필터 변경 발생! (실시간 변경(activeFilter))`

    <details>
    <summary>🔽 {</summary>

    ```json
    {
      "destinationCity": "파주",
      "destinationRadiusKm": 5,
      "corridorRadiusKm": 0,
      "minFare": 20000,
      "maxFare": 1000000,
      "pickupRadiusKm": 10,
      "excludedKeywords": [],
      "isActive": true,
      "isSharedMode": true,
      "driverAction": "DRIVING",
      "dispatchPhase": "GATHERING",
      "destinationKeywords": ["가능동","갈매동","강일동","검산동","경안동","고덕동","교하동","금릉동","남한산성면","다산동","대자동","덕풍동","도농동","맥금동","문봉동","별내동","사노동","사리현동","상계동","상산곡동","상일동","선유동","설문동","성석동","송정동","송촌동","수택동","식사동","신원동","신촌동","아동동","야동동","역동","연다산동","오금동","오도동","원당동","월롱면","인창동","장암동","장흥면","조리읍","천현동","초일동","춘궁동","탄벌동","탄현면","토평동","퇴계원읍","파주읍","하산곡동","하성면","하지석동","호원동"],
      "destinationGroups": {"서울 노원구":["상계동"],"서울 강동구":["강일동","고덕동","상일동"],"의정부시":["가능동","장암동","호원동"],"고양시 덕양구":["대자동","선유동","신원동","오금동","원당동"],"고양시 일산동구":["문봉동","사리현동","설문동","성석동","식사동"],"구리시":["갈매동","사노동","수택동","인창동","토평동"],"남양주시":["다산동","도농동","별내동","퇴계원읍"],"하남시":["덕풍동","상산곡동","천현동","초일동","춘궁동","하산곡동"],"파주시":["검산동","교하동","금릉동","맥금동","송촌동","신촌동","아동동","야동동","연다산동","오도동","월롱면","조리읍","탄현면","파주읍","하지석동"],"광주시":["경안동","남한산성면","송정동","역동","탄벌동"],"김포시":["하성면"],"양주시":["장흥면"]},
      "allowedVehicleTypes": ["오토바이","다마스","라보","승용차","1t"],
      "userOverrides": true,
      "customCityFilters": ["서울 광진구","서울 광진","서울 중랑구","서울 중랑","서울 강북구","서울 강북","서울 도봉구","서울 도봉","서울 노원구","서울 노원","서울 은평구","서울 은평","서울 송파구","서울 송파","서울 강동구","서울 강동","성남시 중원구","성남시 중원","의정부시","의정부","고양시 덕양구","고양시 덕양","고양시 일산동구","고양시 일산동","고양시 일산서구","고양시 일산서","구리시","구리","남양주시","남양주","하남시","하남","파주시","파주","광주시","광주","경기 광주","경기 광주시","경광주","양주시","양주","김포시","김포"],
    }
    ```

    </details>
- `[ROADMAP 20:35:29.414] [🖥️관제웹] 서버로 부터 filter-updated 소켓 이벤트 받음`
- `[ROADMAP 20:35:41.136] [🖥️관제웹] 출발 버튼 클릭 → GATHERING→DELIVERING 전환 (시뮬레이션: true)`
- `[ROADMAP 20:35:41.136] [🖥️관제웹] 서버에게 새로 작성한 update-filter 정보 전달`
- `[ROADMAP 20:35:41.138] [☁️서버] 관제탑으로 부터 필터 변경(update-filter) 요청 받음. 수신 데이터: {"driverAction":"DRIVING","corridorRadiusKm":0}`
- `[ROADMAP 20:35:41.138] [☁️서버] 관제탑에게 변경 적용된 필터(filter-updated) 정보 전달 (메모리만, DB 저장 안함)`
- `[ROADMAP 20:35:42.126] [☁️서버] [FilterManager] 필터 변경 발생! (실시간 변경(activeFilter))`

    <details>
    <summary>🔽 {</summary>

    ```json
    {
      "destinationCity": "파주",
      "destinationRadiusKm": 5,
      "corridorRadiusKm": 0,
      "minFare": 20000,
      "maxFare": 1000000,
      "pickupRadiusKm": 10,
      "excludedKeywords": [],
      "isActive": true,
      "isSharedMode": true,
      "driverAction": "DRIVING",
      "dispatchPhase": "GATHERING",
      "destinationKeywords": ["가좌동","걸포동","검산동","고양동","관산동","광적면","광탄면","교하동","구산동","군남면","군내면","금릉동","금촌동","남면","내유동","다율동","당하동","대자동","대화동","덕이동","동패동","마두동","맥금동","목동동","문발동","문봉동","문산읍","미산면","백석읍","백학면","법곳동","법원읍","벽제동","사리현동","산남동","상봉암동","상지석동","상패동","서패동","선유동","설문동","성석동","송촌동","식사동","신원동","신촌동","아동동","안흥동","야당동","야동동","양촌읍","연다산동","오도동","와동동","왕징면","운양동","원당동","월롱면","은현면","일산동","장기동","장남면","장단면","장항동","장흥면","적성면","전곡읍","정발산동","조리읍","주엽동","중산동","지영동","진동면","진서면","청산면","탄현동","탄현면","통진읍","파주읍","파평면","풍동","하봉암동","하성면","하지석동"],
      "destinationGroups": {"동두천시":["상봉암동","상패동","안흥동","하봉암동"],"고양시 덕양구":["고양동","관산동","내유동","대자동","벽제동","선유동","신원동","원당동"],"고양시 일산동구":["마두동","문봉동","사리현동","설문동","성석동","식사동","장항동","정발산동","중산동","지영동","풍동"],"고양시 일산서구":["가좌동","구산동","대화동","덕이동","법곳동","일산동","주엽동","탄현동"],"파주시":["검산동","광탄면","교하동","군내면","금릉동","금촌동","다율동","당하동","동패동","맥금동","목동동","문발동","문산읍","법원읍","산남동","상지석동","서패동","송촌동","신촌동","아동동","야당동","야동동","연다산동","오도동","와동동","월롱면","장단면","적성면","조리읍","진동면","진서면","탄현면","파주읍","파평면","하지석동"],"김포시":["걸포동","양촌읍","운양동","장기동","통진읍","하성면"],"양주시":["광적면","남면","백석읍","은현면","장흥면"],"연천군":["군남면","미산면","백학면","왕징면","장남면","전곡읍","청산면"]},
      "allowedVehicleTypes": ["오토바이","다마스","라보","승용차","1t"],
      "userOverrides": true,
      "customCityFilters": ["서울 광진구","서울 광진","서울 중랑구","서울 중랑","서울 강북구","서울 강북","서울 도봉구","서울 도봉","서울 노원구","서울 노원","서울 은평구","서울 은평","서울 송파구","서울 송파","서울 강동구","서울 강동","성남시 중원구","성남시 중원","의정부시","의정부","고양시 덕양구","고양시 덕양","고양시 일산동구","고양시 일산동","고양시 일산서구","고양시 일산서","구리시","구리","남양주시","남양주","하남시","하남","파주시","파주","광주시","광주","경기 광주","경기 광주시","경광주","양주시","양주","김포시","김포"],
    }
    ```

    </details>
- `[ROADMAP 20:35:42.128] [🖥️관제웹] 서버로 부터 filter-updated 소켓 이벤트 받음`

    <details>
    <summary>🔽 🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.</summary>

    ```json
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    ```

    </details>
- `[ROADMAP 20:35:49.430] [☁️서버] [FilterManager] 필터 변경 발생! (실시간 변경(activeFilter))`

    <details>
    <summary>🔽 {</summary>

    ```json
    {
      "destinationCity": "파주",
      "destinationRadiusKm": 5,
      "corridorRadiusKm": 0,
      "minFare": 20000,
      "maxFare": 1000000,
      "pickupRadiusKm": 10,
      "excludedKeywords": [],
      "isActive": true,
      "isSharedMode": true,
      "driverAction": "DRIVING",
      "dispatchPhase": "GATHERING",
      "destinationKeywords": ["가능동","갈매동","강일동","검산동","경안동","고덕동","교하동","남한산성면","다산동","당하동","대자동","덕풍동","도농동","맥금동","문봉동","별내동","사노동","사리현동","상계동","상산곡동","상일동","상지석동","선유동","설문동","성석동","송정동","송촌동","수택동","식사동","신원동","신촌동","야동동","연다산동","오금동","오도동","와동동","원당동","인창동","장암동","장흥면","천현동","초일동","춘궁동","탄벌동","탄현면","토평동","퇴계원읍","하산곡동","하성면","하지석동","호원동"],
      "destinationGroups": {"서울 노원구":["상계동"],"서울 강동구":["강일동","고덕동","상일동"],"의정부시":["가능동","장암동","호원동"],"고양시 덕양구":["대자동","선유동","신원동","오금동","원당동"],"고양시 일산동구":["문봉동","사리현동","설문동","성석동","식사동"],"구리시":["갈매동","사노동","수택동","인창동","토평동"],"남양주시":["다산동","도농동","별내동","퇴계원읍"],"하남시":["덕풍동","상산곡동","천현동","초일동","춘궁동","하산곡동"],"파주시":["검산동","교하동","당하동","맥금동","상지석동","송촌동","신촌동","야동동","연다산동","오도동","와동동","탄현면","하지석동"],"광주시":["경안동","남한산성면","송정동","탄벌동"],"김포시":["하성면"],"양주시":["장흥면"]},
      "allowedVehicleTypes": ["오토바이","다마스","라보","승용차","1t"],
      "userOverrides": true,
      "customCityFilters": ["서울 노원구","서울 노원","서울 강동구","서울 강동","의정부시","의정부","고양시 덕양구","고양시 덕양","고양시 일산동구","고양시 일산동","구리시","구리","남양주시","남양주","하남시","하남","파주시","파주","광주시","광주","경기 광주","경기 광주시","경광주","김포시","김포","양주시","양주"],
    }
    ```

    </details>
- `[ROADMAP 20:35:49.431] [🖥️관제웹] 서버로 부터 filter-updated 소켓 이벤트 받음`
- `[ROADMAP 20:35:49.432] [🖥️관제웹] 서버로 부터 filter-updated 소켓 이벤트 받음`

    <details>
    <summary>🔽 🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.</summary>

    ```json
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    ```

    </details>
- `[ROADMAP 20:35:49.452] [🖥️관제웹] 서버로 부터 filter-updated 소켓 이벤트 받음`

    <details>
    <summary>🔽 🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.</summary>

    ```json
    🔄 [하트비트 싱크] 상태 불일치(또는 누락 이벤트) 감지! 유령 삭제 및 최신 데이터로 화면 강제 동기화 수행.
    ```

    </details>
- `🚦 [ROADMAP 20:36:09.163] [📱앱] [LIST] [post /api/scrap request] ⏱️ 타이머 생존신고 발송  deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 2026-05-05 20:36:09.166 32141-32141 1DAL_TELEMETRY          com.onedal.app      ...</summary>

    ```json
    2026-05-05 20:36:09.166 32141-32141 1DAL_TELEMETRY          com.onedal.app                       V  📦 [전송 페이로드] deviceId=앱폰-sdk_gpho-160, screen=LIST, holding=false, 콜=0건
    ```

    </details>
- `🚦 [ROADMAP 20:36:09.209] [📱앱] [LIST] [post /api/scrap response] deviceId: 앱폰-sdk_gpho-160, (건수: 0)`

    <details>
    <summary>🔽 FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isShar...</summary>

    ```json
                                                                                                        FilterConfig(allowedVehicleTypes=[오토바이, 다마스, 라보, 승용차, 1t], isActive=true, isSharedMode=true, pickupRadiusKm=10, minFare=20000, maxFare=1000000, destinationCity=파주, destinationRadiusKm=5, excludedKeywords=[], destinationKeywords=[가능동, 갈매동, 강일동, 검산동, 경안동, 고덕동, 교하동, 남한산성면, 다산동, 당하동, 대자동, 덕풍동, 도농동, 맥금동, 문봉동, 별내동, 사노동, 사리현동, 상계동, 상산곡동, 상일동, 상지석동, 선유동, 설문동, 성석동, 송정동, 송촌동, 수택동, 식사동, 신원동, 신촌동, 야동동, 연다산동, 오금동, 오도동, 와동동, 원당동, 인창동, 장암동, 장흥면, 천현동, 초일동, 춘궁동, 탄벌동, 탄현면, 토평동, 퇴계원읍, 하산곡동, 하성면, 하지석동, 호원동], customCityFilters=[서울 노원구, 서울 노원, 서울 강동구, 서울 강동, 의정부시, 의정부, 고양시 덕양구, 고양시 덕양, 고양시 일산동구, 고양시 일산동, 구리시, 구리, 남양주시, 남양주, 하남시, 하남, 파주시, 파주, 광주시, 광주, 경기 광주, 경기 광주시, 경광주, 김포시, 김포, 양주시, 양주], destinationGroups={서울 노원구=[상계동], 서울 강동구=[강일동, 고덕동, 상일동], 의정부시=[가능동, 장암동, 호원동], 고양시 덕양구=[대자동, 선유동, 신원동, 오금동, 원당동], 고양시 일산동구=[문봉동, 사리현동, 설문동, 성석동, 식사동], 구리시=[갈매동, 사노동, 수택동, 인창동, 토평동], 남양주시=[다산동, 도농동, 별내동, 퇴계원읍], 하남시=[덕풍동, 상산곡동, 천현동, 초일동, 춘궁동, 하산곡동], 파주시=[검산동, 교하동, 당하동, 맥금동, 상지석동, 송촌동, 신촌동, 야동동, 연다산동, 오도동, 와동동, 탄현면, 하지석동], 광주시=[경안동, 남한산성면, 송정동, 탄벌동], 김포시=[하성면], 양주시=[장흥면]}, customFilters=[])
    📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:
    ```

    </details>
- `[ROADMAP 20:36:09.995] [☁️서버]  [/api/scrap 수신] User: af0a8ec7-7130-4a7b-8343-15abc1c7f6b5 (앱폰-sdk_gpho-160) | 0항목 적재 중 [화면: LIST]`
