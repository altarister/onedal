# 관제탑 상태 분리 프로젝트 (Page & Hold 명시적 이원화)

기사님의 날카로운 지적대로, 단순한 예외 처리로 로직을 덮는 임기응변 방식에서 벗어나 **"앱의 물리적 화면 상태(Page)"**와 **"매크로의 논리적 홀드 상태(Hold)"**를 완전히 다른 변수로 분리하여 전송하고 렌더링하는 구조로 전면 재설계합니다.

## User Review Required

> [!IMPORTANT]
> 아래의 설계 변경이 기사님이 말씀하신 "들어온 값을 분리해서 페이지는 페이지로, 홀드는 홀드로 표시"하는 방향과 일치하는지 확인 부탁드립니다.

## Proposed Changes

---

### Shared Models (Front & Backend)

#### [MODIFY] `shared/src/index.ts`
- `ScreenContextType`에서 `WAITING_SERVER` 항목을 삭제합니다. (더 이상 화면 종류가 아님)
- `DeviceSession`과 텔레메트리 관련 Payload 인터페이스에 `isHolding: boolean`을 명시적으로 추가합니다.

---

### Android 앱 (1DAL_APP)

#### [MODIFY] `SharedModels.kt`
- `ScrapPayload` 클래스에 `val isHolding: Boolean = false` 인자를 추가합니다.
- `ScreenContext` Enum에서 `WAITING_SERVER` 요소를 제거합니다.

#### [MODIFY] `TelemetryManager.kt`
- `var isHolding: Boolean = false` 변수를 선언하고, 텔레메트리 `flush()` 시 ScrapPayload에 이 값을 함께 말아서 보냅니다.

#### [MODIFY] `HijackService.kt`
- 데스밸리 타이머가 시작되거나 취소될 때 `isWaitingForServerDecision` 변동과 함께 `telemetryManager.isHolding = true/false` 를 동기화하고 강제 `forceFlushEvent()`를 쏩니다.
- 화면은 `updateScreenContext(detected)`로 끊임없이 추적하되, 액션(Surfing)만 예외처리(`return`)하는 구조를 유지합니다. 결과적으로 화면은 화면대로, 홀드는 홀드대로 서버에 전송됩니다.

---

### Backend 서버 (1DAL_WEB)

#### [MODIFY] `server/src/routes/scrap.ts`
- 안드로이드가 보내오는 `isHolding` 값을 추출하여 메모리의 `activeDevices` 세션에 반영합니다.
- `/api/devices`를 통해 클라이언트 뷰단으로 `isHolding` 속성을 함께 반환합니다.

---

### Frontend 대시보드 (1DAL_WEB)

#### [MODIFY] `client/src/components/dashboard/DeviceControlPanel.tsx`
- 물리적 화면 배지(`screenInfo.label`) 옆에 만약 `device.isHolding === true` 라면 **"🔒 서버 판정 대기 (Hold)"** 라는 별도의 애니메이션(노란색 Blink) 배지를 나란히 표시하도록 UI를 분리합니다.

## Verification Plan

### 수동 검증 (Manual Verification)
1. 프론트엔드/백엔드/앱 컴파일 후 재가동.
2. 1DAL 앱으로 확정 페이지(도착지 팝업 등)에 진입하여 '닫기'를 누르고 데스밸리 상태 진입.
3. 웹 대시보드에 **[확정 페이지]** 배지와 **[🔒 서버 판정 대기]** 배지가 동시에 아름답게 떠 있는지 눈으로 확인.
4. 데스밸리 종료 후 홀드 배지만 자연스럽게 사라지는지 확인.
