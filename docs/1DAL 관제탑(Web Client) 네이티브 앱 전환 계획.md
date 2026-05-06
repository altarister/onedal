# 1DAL 관제탑(Web Client) 네이티브 앱 전환 계획

문서를 확인한 결과, 현재 아키텍처는 **[스크래핑 전용 앱폰 1~2대]**와 **[운전자용 관제탑 폰 1대]**가 완전히 분리되어 한 차량에서 구동되는 **"3-Phones MSA 연동 체제"**입니다. 이에 맞춰 관제웹(Dashboard)을 기사님 메인 디바이스용 네이티브 앱으로 전환하는 완벽한 로드맵을 수립했습니다.

## 1. 전환 아키텍처 요약 및 기존 시스템 영향도

**Capacitor (by Ionic)**를 사용하여 기존 React 코드 변경 없이 안드로이드 네이티브 앱(APK)으로 패키징합니다. (Phase 1 기본 세팅 완료)

### 🔍 네이티브 전환이 기존 시스템에 미치는 영향
* **서버(onedal-web/server) 변경점: 0%**
  * 기존 REST API, Socket.io 통신 구조는 완벽히 동일하게 유지됩니다. 
* **빌드(Build) 파이프라인 변경점: 1줄 추가**
  * 웹 빌드(`pnpm run build`) 후 `npx cap sync android` 명령어가 파이프라인에 추가됩니다.
* **독립된 앱으로 분리 여부: 100% 독립 앱**
  * 브라우저 기반이 아닌 폰 바탕화면에 고유한 아이콘으로 설치되는 **완벽한 독립 APK 앱**입니다.

---

## 2. 필수 앱 자산 (App Assets) 구성 계획

단순한 웹 껍데기가 아닌 상용 수준의 완성도 높은 앱으로 보이기 위해 앱 아이콘과 스플래시 화면이 필수적입니다.

1. **앱 아이콘 (App Icon)**: 
   * 1DAL 고유의 아이덴티티를 반영한 1024x1024 PNG 아이콘을 준비해야 합니다.
   * `@capacitor/assets` 플러그인을 사용하여 안드로이드 해상도별(mdpi, hdpi, xhdpi 등) 아이콘 세트를 자동 생성합니다.
2. **스플래시 화면 (Splash Screen)**:
   * 앱 실행 시 흰 화면이 뜨지 않도록, 초기 로딩 시간(1~2초) 동안 보여지는 다크 모드 기반의 부드러운 시작 화면(스플래시 스크린)을 구성합니다.

---

## 3. 핵심 개발 태스크 (세부 진행 계획)

가장 중요한 것은 **"기준 GPS의 주도권을 관제앱이 가져가는 것"**입니다. 이를 구현하기 위해 구체적으로 아래의 7가지 태스크(Task)를 순차적으로 진행합니다.

### [Task 1] 안드로이드 OS 권한(Permissions) 획득 세팅
* `android/app/src/main/AndroidManifest.xml` 파일을 수정하여 필수 네이티브 권한을 선언합니다.
* 추가할 권한: `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` (위치), `ACCESS_BACKGROUND_LOCATION` (백그라운드 위치), `VIBRATE` (진동), `WAKE_LOCK` (화면 켜짐 유지).

### [Task 2] React Zustand 위치 스토어(`useLocationStore`) 신설
* 브라우저의 `navigator.geolocation` 대신 `@capacitor-community/background-geolocation` API를 래핑하는 커스텀 훅(`useNativeLocation.ts`)을 작성합니다.
* 획득한 현재 디바이스의 위경도(lat, lng)를 전역 상태 관리(Zustand)에 캐싱합니다.

### [Task 3] 지도(Canvas) 및 UI 내 실제 위치 연동
* `PinnedRouteCanvas.tsx`에서 고정된 모의 좌표 대신, Task 2에서 만든 Zustand 스토어의 실제 GPS 좌표를 구독합니다.
* 차량이 이동함에 따라 지도의 파란색 펄스(내 위치) 마커가 실시간으로 부드럽게 이동하도록 렌더링 로직을 수정합니다.

### [Task 4] 관제앱 ➡️ 서버 통신 (GPS 텔레메트리)
* `client-app/src/lib/socket.ts`에 로직을 추가하여, 내 위치가 X미터 이상 변경되거나 10초가 경과할 때마다 `update-my-location` 소켓 이벤트를 서버로 전송(Emit)합니다.

### [Task 5] 서버 ➡️ 앱폰 통신 (다이나믹 레이더 하달)
* **서버(`socketHandlers.ts`)**: 관제탑이 보내온 최신 GPS를 수신하여 기사의 Redis/메모리 세션에 저장합니다.
* **서버(`routes/scrap.ts`)**: 스크래핑 전용 폰(앱폰1, 2)이 주기적으로 호출하는 `POST /api/scrap` API의 응답(`dispatchEngineArgs`)에, 고정된 지역이 아닌 **관제폰의 최신 GPS 좌표를 기준으로 한 다이나믹 타겟팅 반경**을 계산하여 하달합니다.

### [Task 6] 네이티브 햅틱(진동) 및 오디오 강제 돌파
* 웹 브라우저의 '오디오 자동재생 차단' 정책을 우회하기 위해 `@capacitor/haptics` 플러그인을 도입합니다.
* 똥콜(취소 명령)이나 꿀콜(확정) 시 강력한 네이티브 진동 피드백과 로컬 파일 사운드 재생을 통해 운전 중 인지력을 극대화합니다.

### [Task 7] 앱 아이콘 / 스플래시 스크린 삽입 및 최종 빌드
* 1024x1024 로고 이미지를 준비하고 `npx @capacitor/assets generate`를 실행하여 안드로이드 네이티브 해상도별 이미지를 덮어씁니다.
* 최종적으로 안드로이드 스튜디오를 통해 `assembleDebug` (APK) 빌드를 추출합니다.

---

## 4. 구동 및 실차량 검증 계획

1.  **로컬 UI 테스트**: 브라우저(`pnpm dev`)에서 가상 GPS 도구를 띄워 마커 이동 테스트.
2.  **GPS 에뮬레이션**: Android Studio의 에뮬레이터 [Location] 탭에서 가상 주행 노선(Routes) 주입 및 테스트.
3.  **실차량 로드 테스트**: 앱폰 2대 + 메인 관제폰 1대 체제로 실제 운전하며 GPS 갱신 및 합짐 사냥 동작 확인.
